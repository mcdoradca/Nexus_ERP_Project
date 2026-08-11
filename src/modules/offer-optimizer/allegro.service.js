const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

const apiClient = axios.create();

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response && error.response.status === 401 && !originalRequest._retry) {
            if (originalRequest.url && (originalRequest.url.includes('/auth/oauth/token') || originalRequest.url.includes('/auth/oauth/device'))) {
                return Promise.reject(error);
            }
            originalRequest._retry = true;
            console.log('[AllegroService] Otrzymano 401 Unauthorized z API Allegro. Wymuszam odswiezenie tokena (forceRefresh)...');
            try {
                const newToken = await getAllegroToken(true);
                originalRequest.headers['Authorization'] = 'Bearer ' + newToken;
                return apiClient(originalRequest);
            } catch (refreshError) {
                console.error('[AllegroService] Odswiezenie tokena zawiodlo po 401.');
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);


/**
 * Serwis integrujÄ…cy oficjalne API Allegro
 * Wymaga podania ALLEGRO_CLIENT_ID oraz ALLEGRO_CLIENT_SECRET w pliku .env
 */

let cachedToken = null;
let tokenExpiry = null;
let tokenRefreshPromise = null;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getAllegroToken(forceRefresh = false) {
    if (!forceRefresh && cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    if (tokenRefreshPromise) {
        console.log("[AllegroService] Oczekiwanie na trwajÄ…cy proces odĹ›wieĹĽania tokenu (Singleton Lock)...");
        return tokenRefreshPromise;
    }

    tokenRefreshPromise = (async () => {
        try {
            const LOCK_KEY = 'ALLEGRO_REFRESH_LOCK';
            let acquiredLock = false;

            for (let i = 0; i < 20; i++) {
                const now = Date.now();
                const lockRecord = await prisma.systemSetting.findUnique({ where: { key: LOCK_KEY } });

                if (!lockRecord) {
                    try {
                        await prisma.systemSetting.create({ data: { key: LOCK_KEY, value: (now + 30000).toString() } });
                        acquiredLock = true;
                        break;
                    } catch (e) {}
                } else if (parseInt(lockRecord.value, 10) < now) {
                    const updated = await prisma.systemSetting.updateMany({
                        where: { key: LOCK_KEY, value: lockRecord.value },
                        data: { value: (now + 30000).toString() }
                    });
                    if (updated.count > 0) {
                        acquiredLock = true;
                        break;
                    }
                }

                const checkToken = await prisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_ACCESS_TOKEN' } });
                const checkExpiry = await prisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_TOKEN_EXPIRY' } });
                if (checkToken && checkToken.value !== cachedToken && checkExpiry && parseInt(checkExpiry.value, 10) > now) {
                    cachedToken = checkToken.value;
                    tokenExpiry = parseInt(checkExpiry.value, 10);
                    return cachedToken;
                }

                console.log('[AllegroService] Inny proces odświeża token. Oczekiwanie (DB Lock)...');
                await new Promise(r => setTimeout(r, 1000));
            }

            if (!acquiredLock) {
                throw new Error('Timeout oczekiwania na blokadę odświeżania tokenu z bazy danych (Allegro).');
            }

            const checkToken = await prisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_ACCESS_TOKEN' } });
            const checkExpiry = await prisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_TOKEN_EXPIRY' } });
            if (checkToken && checkToken.value !== cachedToken && checkExpiry && parseInt(checkExpiry.value, 10) > Date.now()) {
                cachedToken = checkToken.value;
                tokenExpiry = parseInt(checkExpiry.value, 10);
                await prisma.systemSetting.update({ where: { key: LOCK_KEY }, data: { value: '0' } });
                console.log('[AllegroService] Inny proces zdążył odświeżyć token. Pobrano nowy z bazy.');
                return cachedToken;
            }

            if (!forceRefresh) {
                if (checkToken && checkExpiry) {
                    const expiry = parseInt(checkExpiry.value, 10);
                    if (Date.now() < expiry) {
                        cachedToken = checkToken.value;
                        tokenExpiry = expiry;
                        await prisma.systemSetting.update({ where: { key: LOCK_KEY }, data: { value: '0' } });
                        return cachedToken;
                    }
                }
            }

            const clientId = process.env.ALLEGRO_CLIENT_ID;
            const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
            
            if (!clientId || !clientSecret) {
                 throw new Error("Brak autoryzacji do API Allegro. Skonfiguruj klucze deweloperskie w panelu aplikacji.");
            }
            const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

            const refreshTokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_REFRESH_TOKEN' } });

            if (!refreshTokenSetting) {
                console.warn("[AllegroService] Brak Refresh Tokenu! PrĂłba pobrania client_credentials (publicznego).");
                const response = await axios.post('https://allegro.pl/auth/oauth/token?grant_type=client_credentials', null, {
                    headers: {
                        'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                        'Authorization': `Basic ${authString}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                cachedToken = response.data.access_token;
                tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
                return cachedToken;
            }

            const response = await axios.post('https://allegro.pl/auth/oauth/token', 
                `grant_type=refresh_token&refresh_token=${refreshTokenSetting.value}`, {
                headers: {
                    'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                    'Authorization': `Basic ${authString}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            cachedToken = response.data.access_token;
            tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;

            await prisma.systemSetting.upsert({ where: { key: 'ALLEGRO_ACCESS_TOKEN' }, update: { value: cachedToken }, create: { key: 'ALLEGRO_ACCESS_TOKEN', value: cachedToken } });
            await prisma.systemSetting.upsert({ where: { key: 'ALLEGRO_TOKEN_EXPIRY' }, update: { value: tokenExpiry.toString() }, create: { key: 'ALLEGRO_TOKEN_EXPIRY', value: tokenExpiry.toString() } });

            if (response.data.refresh_token) {
                await prisma.systemSetting.upsert({ where: { key: 'ALLEGRO_REFRESH_TOKEN' }, update: { value: response.data.refresh_token }, create: { key: 'ALLEGRO_REFRESH_TOKEN', value: response.data.refresh_token } });
            }

            console.log("[AllegroService] OdĹ›wieĹĽono Token OAuth2 (User Token).");
            return cachedToken;
        } catch (error) {
            console.error("[AllegroService] BĹ‚Ä…d odĹ›wieĹĽania tokenu:", error.response ? error.response.data : error.message);
            try {
                const { createAndSendNotification } = require('../communication/notifications.service');
                await createAndSendNotification(
                    'admin-id', 
                    'Awaria autoryzacji Allegro', 
                    'Token wygasĹ‚ lub zostaĹ‚ cofniÄ™ty. Wymagane ponowne logowanie przez Device Flow.', 
                    'error'
                );
            } catch (notifErr) {
                console.error("[AllegroService] Nie udaĹ‚o siÄ™ wysĹ‚aÄ‡ powiadomienia o bĹ‚Ä™dzie:", notifErr.message);
            }
            throw new Error("Nie udaĹ‚o siÄ™ odĹ›wieĹĽyÄ‡ tokenu. PrzeprowadĹş ponowne logowanie Device Flow.");
        } finally {
            try {
                await prisma.systemSetting.updateMany({ where: { key: 'ALLEGRO_REFRESH_LOCK' }, data: { value: '0' } });
            } catch (e) { /* ignore */ }
            tokenRefreshPromise = null;
        }
    })();

    return tokenRefreshPromise;
}

async function startDeviceFlow() {
    const clientId = process.env.ALLEGRO_CLIENT_ID;
    const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post('https://allegro.pl/auth/oauth/device', `client_id=${clientId}`, {
        headers: {
            'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    return response.data;
}

async function pollForToken(deviceCode) {
    const clientId = process.env.ALLEGRO_CLIENT_ID;
    const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post('https://allegro.pl/auth/oauth/token', 
        `grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=${deviceCode}`, {
        headers: {
            'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    const tokenData = response.data;
    
    cachedToken = tokenData.access_token;
    tokenExpiry = Date.now() + (tokenData.expires_in - 300) * 1000;

    await prisma.systemSetting.upsert({ where: { key: 'ALLEGRO_ACCESS_TOKEN' }, update: { value: cachedToken }, create: { key: 'ALLEGRO_ACCESS_TOKEN', value: cachedToken } });
    await prisma.systemSetting.upsert({ where: { key: 'ALLEGRO_TOKEN_EXPIRY' }, update: { value: tokenExpiry.toString() }, create: { key: 'ALLEGRO_TOKEN_EXPIRY', value: tokenExpiry.toString() } });

    if (tokenData.refresh_token) {
        await prisma.systemSetting.upsert({ where: { key: 'ALLEGRO_REFRESH_TOKEN' }, update: { value: tokenData.refresh_token }, create: { key: 'ALLEGRO_REFRESH_TOKEN', value: tokenData.refresh_token } });
    }

    return tokenData;
}

/**
 * Pobiera ofertÄ™ na podstawie ID i ekstrahuje oryginalne adresy zdjÄ™Ä‡.
 */
async function getOfferImages(offerId) {
    if (!offerId) return [];

    try {
        const token = await getAllegroToken();
        
        console.log(`[AllegroService] Odpytywanie /sale/product-offers/${offerId}...`);
        const response = await apiClient.get(`https://api.allegro.pl/sale/product-offers/${offerId}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });

        const data = response.data;
        if (!data || !data.images) {
             return [];
        }

        const imageUrls = data.images.map(img => img.url);
        console.log(`[AllegroService] Pobrano ${imageUrls.length} oryginalnych obrazĂłw z oferty.`);
        return imageUrls;

    } catch (error) {
        if (error.response && error.response.status === 404) {
             console.warn(`[AllegroService] Oferta ${offerId} nie zostaĹ‚a znaleziona w API.`);
             return [];
        }
        console.error(`[AllegroService] BĹ‚Ä…d pobierania danych oferty ${offerId}:`, error.response ? error.response.data : error.message);
        throw new Error(`BĹ‚Ä…d integracji z ofertÄ… Allegro: ${error.message}`);
    }
}

/**
 * PeĹ‚ne pobranie danych z API Allegro - zastÄ™puje analizÄ™ obrazu.
 */
async function getFullOfferData(offerId) {
    if (!offerId) throw new Error("Brak ID oferty do pobrania");

    try {
        const token = await getAllegroToken();
        console.log(`[AllegroService] Odpytywanie FULL DATA /sale/product-offers/${offerId}...`);
        
        const response = await apiClient.get(`https://api.allegro.pl/sale/product-offers/${offerId}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });

        const data = response.data;
        
        // 1. TytuĹ‚ (name lub product.name)
        const title = data.name || (data.product && data.product.name) || "";
        
        // 2. ZdjÄ™cia
        const imageUrls = data.images ? data.images.map(img => img.url) : [];
        
        // 3. Kod EAN (GTIN) i Parametry
        let ean = data.ean || "";
        let paramsText = "";
        if (data.parameters) {
            data.parameters.forEach(p => {
                const vals = p.values ? p.values.join(", ") : (p.valuesIds ? p.valuesIds.join(", ") : "");
                paramsText += `- [ID: ${p.id}] ${p.name || ''}: ${vals}\n`;
                
                // JeĹ›li znajdziemy parametr o ID 11323 (czÄ™sto EAN) lub name 'EAN'
                if ((p.id === '11323' || (p.name && p.name.toUpperCase().includes('EAN'))) && !ean) {
                    if (p.values && p.values.length > 0) {
                        ean = p.values[0];
                    } else if (p.valuesIds && p.valuesIds.length > 0) {
                        ean = p.valuesIds[0];
                    }
                }
            });
        }
        
        if (!ean && data.product && data.product.id) {
             // Czasami product.id to UUID, czasami to moĹĽe byÄ‡ GTIN, ale w katalogu to zwykle UUID.
        }
        
        // 4. Opis z sekcji (tylko TYPE: TEXT)
        let descriptionHtml = "";
        if (data.description && data.description.sections) {
            data.description.sections.forEach(section => {
                if (section.items) {
                    section.items.forEach(item => {
                        if (item.type === 'TEXT') {
                            descriptionHtml += item.content + "<br/><br/>";
                        }
                    });
                }
            });
        }
        
        const textContent = `
TYTUĹ AUKCJI: ${title}
EAN: ${ean}

PARAMETRY OFERTY:
${paramsText}

GĹĂ“WNY OPIS (HTML):
${descriptionHtml}
`;

        return {
            title,
            ean,
            textContent,
            imageUrls
        };

    } catch (error) {
        if (error.response && error.response.status === 404) {
             throw new Error(`Oferta Allegro o ID ${offerId} nie istnieje (BĹ‚Ä…d 404). Upewnij siÄ™, ĹĽe podajesz poprawny numer i ĹĽe oferta jest na Twoim koncie.`);
        } else if (error.response && error.response.status === 403) {
             throw new Error(`Brak uprawnieĹ„ (BĹ‚Ä…d 403) do odczytu /sale/product-offers/${offerId}. Token OAuth musi dotyczyÄ‡ konta, z ktĂłrego wystawiono tÄ™ ofertÄ™.`);
        }
        throw new Error(`BĹ‚Ä…d integracji z API Allegro: ${error.message}`);
    }
}

/**
 * Pobiera sĹ‚ownik parametrĂłw dla podanej kategorii (Lazy Schema Caching) i zapisuje do bazy Nexus.
 */
async function fetchCategoryParameters(categoryId) {
    if (!categoryId) throw new Error("Brak categoryId do pobrania parametrĂłw.");

    try {
        const token = await getAllegroToken();
        
        console.log(`[AllegroService] Pobieram parametry dla kategorii ID: ${categoryId}`);
        const response = await apiClient.get(`https://api.allegro.pl/sale/categories/${categoryId}/parameters`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });

        const parameters = response.data.parameters;
        
        // Pobieranie nazwy kategorii do Ĺ‚adnego wyĹ›wietlania w PIM
        const catResponse = await apiClient.get(`https://api.allegro.pl/sale/categories/${categoryId}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            }
        });
        const categoryName = catResponse.data.name || `Kategoria ${categoryId}`;

        // Zapis Cache'u w bazie (Lazy Caching)
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        
        const marketplaceCategory = await prisma.marketplaceCategory.upsert({
            where: { id: categoryId },
            update: {
                name: categoryName,
                parameters: parameters
            },
            create: {
                id: categoryId,
                name: categoryName,
                parameters: parameters
            }
        });
        
        // Minifikacja dla Agenta (ochrona tokenĂłw)
        return {
            id: marketplaceCategory.id,
            name: marketplaceCategory.name,
            parameters: (marketplaceCategory.parameters || []).map(p => ({
                id: p.id,
                name: p.name,
                type: p.type,
                required: p.required,
                options: p.dictionary ? p.dictionary.slice(0, 10).map(d => d.value) : []
            }))
        };

    } catch (error) {
        console.error(`[AllegroService] BĹ‚Ä…d pobierania schematu dla kategorii ${categoryId}:`, error.response ? error.response.data : error.message);
        throw new Error(`BĹ‚Ä…d integracji sĹ‚ownika parametrĂłw: ${error.message}`);
    }
}

/**
 * Szuka w globalnym Katalogu ProduktĂłw Allegro kategorii przypisanej do danego EAN.
 */
async function findCategoryByEan(ean) {
    if (!ean) return null;
    try {
        const token = await getAllegroToken();
        const response = await apiClient.get(`https://api.allegro.pl/sale/products?phrase=${ean}&mode=GTIN`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });
        
        if (response.data.products && response.data.products.length > 0) {
            return response.data.products[0].category.id;
        }
        return null;
    } catch (error) {
        console.error(`[AllegroService] BĹ‚Ä…d wyszukiwania kategorii po EAN ${ean}:`, error.message);
        return null;
    }
}

/**
 * Szuka w globalnym Katalogu ProduktĂłw Allegro parametrĂłw twardych przypisanych do danego EAN.
 */
async function getProductParametersByEan(ean) {
    if (!ean) return {};
    try {
        const token = await getAllegroToken();
        const response = await apiClient.get(`https://api.allegro.pl/sale/products?phrase=${ean}&mode=GTIN`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });
        
        let hardFeatures = {};
        if (response.data.products && response.data.products.length > 0) {
            const product = response.data.products[0];
            if (product.parameters) {
                product.parameters.forEach(p => {
                    // Endpoint /sale/products nie zwraca pola "type", 
                    // dlatego sprawdzamy po prostu czy sÄ… dostÄ™pne etykiety (sĹ‚owniki)
                    if (p.valuesLabels && p.valuesLabels.length > 0) {
                        hardFeatures[p.name] = p.valuesLabels[0];
                    } else if (p.values && p.values.length > 0) {
                        hardFeatures[p.name] = p.values[0];
                    }
                });
            }
        }
        return hardFeatures;
    } catch (error) {
        console.error(`[AllegroService] BĹ‚Ä…d pobierania parametrĂłw z katalogu dla EAN ${ean}:`, error.message);
        return {};
    }
}

/**
 * Szuka rekomendowanej kategorii Allegro na podstawie nazwy produktu (Smart Fallback).
 */
async function findMatchingCategoryByName(name) {
    if (!name) return null;
    try {
        const token = await getAllegroToken();
        const response = await apiClient.get(`https://api.allegro.pl/sale/matching-categories?name=${encodeURIComponent(name)}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });
        
        if (response.data.matchingCategories && response.data.matchingCategories.length > 0) {
            // Zwracamy pierwszÄ… (najbardziej trafnÄ…) kategoriÄ™
            return response.data.matchingCategories[0].id;
        }
        return null;
    } catch (error) {
        console.error(`[AllegroService] BĹ‚Ä…d wyszukiwania dopasowania kategorii dla nazwy "${name}":`, error.message);
        return null;
    }
}
/**
 * Przeszukuje Katalog ProduktĂłw Allegro (endpoint dla agenta)
 */
async function searchProducts(phrase, mode = "NAME") {
    if (!phrase) return { error: "Brak frazy do wyszukania w katalogu." };
    try {
        const token = await getAllegroToken();
        let queryParam = mode === "GTIN" ? `ean=${encodeURIComponent(phrase)}` : `phrase=${encodeURIComponent(phrase)}`;
        
        const response = await apiClient.get(`https://api.allegro.pl/sale/products?${queryParam}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });
        
        if (response.data.products && response.data.products.length > 0) {
            // Zwracamy uproszczone dane dla agenta (nazwa, marka, kategoria, parametry ograniczajÄ…ce budĹĽet tokenĂłw)
            return response.data.products.slice(0, 3).map(p => ({
                id: p.id,
                name: p.name,
                category: p.category ? { id: p.category.id } : null,
                parameters: (p.parameters || []).slice(0, 8).map(param => ({
                    name: param.name,
                    values: param.valuesLabels ? param.valuesLabels.slice(0, 2) : (param.values ? param.values.slice(0, 2) : [])
                }))
            }));
        }
        return { message: "Nie znaleziono produktĂłw w katalogu Allegro." };
    } catch (error) {
        console.warn(`[AllegroService] BĹ‚Ä…d w searchProducts dla frazy "${phrase}":`, error.message);
        return { error: error.message };
    }
}

/**
 * Zwraca listing ofert konkurencji (endpoint zastrzeĹĽony, best-effort)
 */
async function getListingCompetitors(phrase, categoryId, limit = 60) {
    if (!phrase) return { error: "Brak frazy" };
    try {
        const token = await getAllegroToken();
        let url = `https://api.allegro.pl/offers/listing?phrase=${encodeURIComponent(phrase)}&sort=-popularity&limit=${limit}`;
        if (categoryId) url += `&category.id=${categoryId}`;

        const response = await apiClient.get(url, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });

        // Agregacja tytuĹ‚Ăłw z ofert sponsorowanych i zwykĹ‚ych
        const promoted = (response.data.items.promoted || []).map(i => i.name);
        const regular = (response.data.items.regular || []).map(i => i.name);
        const titles = [...promoted, ...regular];
        
        // Zwracamy same tytuĹ‚y, filtry sÄ… usuwane ze wzglÄ™du na gigantyczny rozmiar JSON (zabezpieczenie 429 Quota Exceeded)
        return {
            titles
        };
    } catch (error) {
        if (error.response && error.response.status === 403) {
            return { error: "ALLEGRO_FORBIDDEN", hint: "Aplikacja wymaga weryfikacji przez Allegro do uĹĽycia tego endpointu." };
        }
        console.warn(`[AllegroService] BĹ‚Ä…d w getListingCompetitors:`, error.message);
        return { error: error.message };
    }
}

module.exports = {
    getAllegroToken,
    getOfferImages,
    getFullOfferData,
    fetchCategoryParameters,
    findCategoryByEan,
    findMatchingCategoryByName,
    getProductParametersByEan,
    startDeviceFlow,
    pollForToken,
    searchProducts,
    getListingCompetitors
};


