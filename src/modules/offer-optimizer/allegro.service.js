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
                const response = await axios.post('https://allegro.pl/auth/oauth/token', 'grant_type=client_credentials', {
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

    if (!clientId || !clientSecret) {
        throw new Error("Brak kluczy ALLEGRO_CLIENT_ID lub ALLEGRO_CLIENT_SECRET w zmiennych środowiskowych. Zrestartuj serwer (nodemon/pm2) aby przeładować plik .env.");
    }

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
        
        // 1. Tytuł (name lub productSet[0].product.name)
        const primaryProduct = data.productSet?.[0]?.product || data.product || null;
        const title = data.name || primaryProduct?.name || "";
        
        // 2. Zdjęcia
        const imageUrls = data.images ? data.images.map(img => img.url) : [];
        
        // 3. Kod EAN (GTIN) i Parametry (korzeń oferty + parametry produktowe)
        let ean = data.ean || "";
        let paramsText = "";
        const combinedParams = [
            ...(Array.isArray(data.parameters) ? data.parameters : []),
            ...(Array.isArray(primaryProduct?.parameters) ? primaryProduct.parameters : [])
        ];
        combinedParams.forEach(p => {
            const vals = p.values ? p.values.join(", ") : (p.valuesIds ? p.valuesIds.join(", ") : "");
            paramsText += `- [ID: ${p.id}] ${p.name || ''}: ${vals}\n`;
            if ((String(p.id) === '225693' || (p.name && /\b(?:ean|gtin)\b/i.test(p.name))) && !ean) {
                if (p.values && p.values.length > 0) {
                    ean = p.values[0];
                }
            }
        });
        
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

/**
 * Dekoduje bezpiecznie publiczne roszczenia (scope, user_name, exp) z tokenu JWT Allegro bez ujawniania sekretu.
 */
function inspectTokenClaims(token) {
    if (!token || typeof token !== 'string') {
        return { validFormat: false, scopes: [], isUserToken: false, userName: null, expIso: null };
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { validFormat: false, scopes: [], isUserToken: false, userName: null, expIso: null };
    }
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        const scopes = Array.isArray(payload.scope) ? payload.scope : [];
        return {
            validFormat: true,
            scopes,
            isUserToken: Boolean(payload.user_name),
            userName: payload.user_name || null,
            expIso: payload.exp ? new Date(payload.exp * 1000).toISOString() : null
        };
    } catch (_) {
        return { validFormat: false, scopes: [], isUserToken: false, userName: null, expIso: null };
    }
}

/**
 * Weryfikuje czy aktualny token jest tokenem sprzedawcy (nie client_credentials) i posiada uprawnienia zapisu ofert.
 */
async function ensureSellerWriteToken() {
    const token = await getAllegroToken();
    const claims = inspectTokenClaims(token);

    if (!claims.isUserToken) {
        const err = new Error('Brak autoryzacji konta sprzedawcy Allegro (użyto wyłącznie tokena aplikacyjnego lub brak ALLEGRO_REFRESH_TOKEN). Przeprowadź logowanie Device Flow w Ustawieniach Integracji.');
        err.statusCode = 401;
        err.code = 'ALLEGRO_USER_AUTH_REQUIRED';
        throw err;
    }

    const requiredScopes = ['allegro:api:sale:offers:read', 'allegro:api:sale:offers:write'];
    const missingScopes = requiredScopes.filter(sc => !claims.scopes.includes(sc));
    if (missingScopes.length > 0) {
        const err = new Error(
            `Token Allegro nie posiada wymaganych uprawnień zapisu (${missingScopes.join(', ')}). ` +
            'Wejdź na https://apps.developer.allegro.pl, włącz brakujące uprawnienia dla aplikacji, a następnie wykonaj ponownie autoryzację konta Allegro (Device Flow) w Nexus ERP.'
        );
        err.statusCode = 403;
        err.code = 'ALLEGRO_MISSING_SCOPES';
        err.missingScopes = missingScopes;
        throw err;
    }

    return { token, claims };
}

/**
 * Pobiera pełny schemat parametrów kategorii Allegro (z options, restrictions, requiredIf i pełnym słownikiem).
 */
async function getCategoryParametersFull(categoryId, { forceRefresh = false } = {}) {
    if (!categoryId) throw new Error('Brak categoryId do pobrania parametrów kategorii.');
    const catIdStr = String(categoryId).trim();

    let category = await prisma.marketplaceCategory.findUnique({ where: { id: catIdStr } });
    const hasValidCachedParams = category && Array.isArray(category.parameters) && category.parameters.length > 0;

    let refreshed = false;
    if (!hasValidCachedParams || forceRefresh) {
        const token = await getAllegroToken();
        const [paramsRes, catRes] = await Promise.all([
            apiClient.get(`https://api.allegro.pl/sale/categories/${encodeURIComponent(catIdStr)}/parameters`, {
                headers: {
                    'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.allegro.public.v1+json'
                },
                timeout: 15000
            }),
            apiClient.get(`https://api.allegro.pl/sale/categories/${encodeURIComponent(catIdStr)}`, {
                headers: {
                    'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.allegro.public.v1+json'
                },
                timeout: 15000
            }).catch(() => null)
        ]);

        const rawParams = Array.isArray(paramsRes.data?.parameters) ? paramsRes.data.parameters : [];
        const categoryName = catRes?.data?.name || category?.name || `Kategoria ${catIdStr}`;

        category = await prisma.marketplaceCategory.upsert({
            where: { id: catIdStr },
            update: { name: categoryName, parameters: rawParams },
            create: { id: catIdStr, name: categoryName, parameters: rawParams }
        });
        refreshed = true;
    }

    return {
        id: category.id,
        name: category.name,
        parameters: Array.isArray(category.parameters) ? category.parameters : [],
        refreshed
    };
}

/**
 * Wyszukuje oferty na koncie sprzedawcy Allegro odpowiadające produktowi (po SKU / external.id lub frazie).
 */
async function findSellerOffersForProduct({ ean = '', sku = '', name = '', baselinkerId = '', categoryId = '' } = {}) {
    const { token } = await ensureSellerWriteToken();
    const headers = {
        'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.allegro.public.v1+json'
    };

    const collected = new Map();

    const addOffersFromResponse = (offers, matchSource) => {
        if (!Array.isArray(offers)) return;
        for (const o of offers) {
            if (!o || !o.id) continue;
            if (!collected.has(String(o.id))) {
                collected.set(String(o.id), {
                    id: String(o.id),
                    name: o.name || '',
                    categoryId: o.category?.id ? String(o.category.id) : null,
                    status: o.publication?.status || 'UNKNOWN',
                    externalId: o.external?.id || null,
                    matchSource
                });
            }
        }
    };

    const extCandidates = [sku, baselinkerId].map(v => (v ? String(v).trim() : '')).filter(Boolean);
    for (const extId of [...new Set(extCandidates)]) {
        try {
            const res = await apiClient.get(`https://api.allegro.pl/sale/offers?external.id=${encodeURIComponent(extId)}&limit=10`, {
                headers,
                timeout: 12000
            });
            addOffersFromResponse(res.data?.offers, extId === sku ? 'external_sku' : 'external_bl');
        } catch (err) {
            console.warn(`[AllegroService] Błąd wyszukiwania oferty po external.id=${extId}:`, err.message);
        }
    }

    if (collected.size === 0 && name) {
        const cleanQuery = String(name).trim().split(/\s+/).slice(0, 4).join(' ');
        if (cleanQuery.length >= 3) {
            const params = new URLSearchParams({ name: cleanQuery, limit: '10' });
            if (categoryId) params.set('category.id', String(categoryId));
            try {
                const res = await apiClient.get(`https://api.allegro.pl/sale/offers?${params.toString()}`, {
                    headers,
                    timeout: 12000
                });
                addOffersFromResponse(res.data?.offers, 'name_search');
            } catch (err) {
                console.warn(`[AllegroService] Błąd wyszukiwania oferty po nazwie "${cleanQuery}":`, err.message);
            }
        }
    }

    const candidates = Array.from(collected.values()).slice(0, 6);

    // Weryfikujemy EAN wewnątrz top kandydatów przez GET /sale/product-offers/{id}
    const normTargetEan = ean ? String(ean).trim() : '';
    const enriched = await Promise.all(candidates.map(async (cand) => {
        try {
            const detail = await apiClient.get(`https://api.allegro.pl/sale/product-offers/${cand.id}`, {
                headers,
                timeout: 10000
            });
            const prodParams = detail.data?.productSet?.[0]?.product?.parameters || [];
            const eanParam = prodParams.find(p => String(p.id) === '225693' || /\b(?:ean|gtin)\b/i.test(p.name || ''));
            const offerEan = eanParam?.values?.[0] ? String(eanParam.values[0]).trim() : null;
            return {
                ...cand,
                offerEan,
                eanMatch: Boolean(normTargetEan && offerEan && normTargetEan === offerEan)
            };
        } catch (_) {
            return { ...cand, offerEan: null, eanMatch: false };
        }
    }));

    enriched.sort((a, b) => {
        if (a.eanMatch !== b.eanMatch) return a.eanMatch ? -1 : 1;
        if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : (b.status === 'ACTIVE' ? 1 : 0);
        return 0;
    });

    return enriched;
}

/**
 * Pobiera pełne dane konkretnej oferty oraz (opcjonalnie) dane powiązanego produktu z Katalogu Allegro (trustedContent).
 */
async function getOfferAndCatalogForParams(offerId) {
    if (!offerId) throw new Error('Brak numeru oferty Allegro (offerId).');
    const cleanOfferId = String(offerId).trim();
    const { token, claims } = await ensureSellerWriteToken();

    const headers = {
        'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.allegro.public.v1+json',
        'Accept-Language': 'pl-PL'
    };

    const offerRes = await apiClient.get(`https://api.allegro.pl/sale/product-offers/${encodeURIComponent(cleanOfferId)}`, {
        headers,
        timeout: 15000
    });
    const offer = offerRes.data;
    const productId = offer?.productSet?.[0]?.product?.id || null;

    let catalogProduct = null;
    if (productId) {
        try {
            const catRes = await apiClient.get(`https://api.allegro.pl/sale/products/${encodeURIComponent(productId)}`, {
                headers,
                timeout: 12000
            });
            catalogProduct = catRes.data;
        } catch (err) {
            console.warn(`[AllegroService] Nie udało się pobrać szczegółów katalogowych produktu ${productId}:`, err.message);
        }
    }

    return { offer, catalogProduct, tokenClaims: claims };
}

/**
 * Waliduje i parsuje listę składników INCI przez oficjalny endpoint Allegro `POST /ingredients/parse`.
 */
async function parseIngredientsWithAllegro({ categoryId, productId = '1', productName = 'Produkt', rawInci = '' } = {}) {
    if (!categoryId || !rawInci || String(rawInci).trim() === '') {
        return { supported: false, components: null, warnings: [], errors: ['Brak kategorii lub składu INCI.'] };
    }
    const { token } = await ensureSellerWriteToken();
    const headers = {
        'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.allegro.public.v1+json',
        'Content-Type': 'application/vnd.allegro.public.v1+json',
        'Accept-Language': 'pl-PL'
    };

    const res = await apiClient.post('https://api.allegro.pl/ingredients/parse', {
        categoryId: String(categoryId),
        products: [
            {
                id: String(productId),
                name: String(productName || 'Produkt').slice(0, 120),
                ingredients: String(rawInci)
            }
        ]
    }, { headers, timeout: 15000 });

    const parsedProd = res.data?.products?.[0] || {};
    const items = Array.isArray(parsedProd.items) ? parsedProd.items : [];
    const warnings = Array.isArray(parsedProd.warnings) ? parsedProd.warnings : [];
    const errors = Array.isArray(parsedProd.errors) ? parsedProd.errors : [];

    const components = items
        .map((item, idx) => ({
            name: item.name || (items.length === 1 ? (productName || 'Skład produktu').slice(0, 100) : `Składnik ${idx + 1}`),
            ingredients: (Array.isArray(item.ingredients) ? item.ingredients : [])
                .map(ing => ({ name: String(ing.name || '').trim() }))
                .filter(ing => ing.name !== '')
        }))
        .filter(c => c.ingredients.length > 0);

    const hasUnknownWarning = warnings.some(w => w.code === 'UNKNOWN_INGREDIENT');

    return {
        supported: errors.length === 0 && !hasUnknownWarning && components.length > 0,
        components: components.length > 0 ? components : null,
        warnings,
        errors,
        rawResult: parsedProd
    };
}

/**
 * Formatuje tablicę błędów Allegro REST API (`422` / `400` / `403`) do czytelnego opisu z metadanymi.
 */
function formatAllegroApiErrors(data) {
    if (!data || !Array.isArray(data.errors) || data.errors.length === 0) {
        return typeof data === 'string' ? data : JSON.stringify(data || 'Nieznany błąd API Allegro');
    }
    return data.errors.map(e => {
        const msg = e.userMessage || e.message || e.code || 'Błąd walidacji';
        const pathInfo = e.path ? ` [${e.path}]` : '';
        const meta = e.metadata && Object.keys(e.metadata).length > 0 ? ` (${JSON.stringify(e.metadata)})` : '';
        return `${msg}${pathInfo}${meta}`;
    }).join(' | ');
}

/**
 * Wysyła `PATCH /sale/product-offers/{offerId}` wraz z automatycznym pollingiem operacji asynchronicznej `202 -> 303`.
 */
async function patchProductOffer(offerId, patchBody, { pollMaxAttempts = 12, pollIntervalMs = 1000 } = {}) {
    if (!offerId) throw new Error('Brak numeru oferty Allegro (offerId).');
    const cleanOfferId = String(offerId).trim();
    const { token } = await ensureSellerWriteToken();

    const headers = {
        'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.allegro.public.v1+json',
        'Content-Type': 'application/vnd.allegro.public.v1+json',
        'Accept-Language': 'pl-PL'
    };

    try {
        const patchRes = await apiClient.patch(
            `https://api.allegro.pl/sale/product-offers/${encodeURIComponent(cleanOfferId)}`,
            patchBody,
            {
                headers,
                timeout: 20000,
                validateStatus: (status) => status >= 200 && status < 400
            }
        );

        if (patchRes.status === 200) {
            return {
                status: 'COMPLETED',
                httpStatus: 200,
                offer: patchRes.data
            };
        }

        if (patchRes.status === 202) {
            const locationPath = patchRes.headers?.location || patchRes.headers?.Location;
            if (!locationPath) {
                return { status: 'ACCEPTED_NO_LOCATION', httpStatus: 202 };
            }
            const pollUrl = locationPath.startsWith('http')
                ? locationPath
                : `https://api.allegro.pl${locationPath.startsWith('/') ? '' : '/'}${locationPath}`;

            for (let attempt = 1; attempt <= pollMaxAttempts; attempt++) {
                await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                const pollRes = await apiClient.get(pollUrl, {
                    headers: {
                        'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.allegro.public.v1+json',
                        'Accept-Language': 'pl-PL'
                    },
                    maxRedirects: 0,
                    validateStatus: (s) => (s >= 200 && s < 400),
                    timeout: 15000
                });

                if (pollRes.status === 303 || pollRes.status === 200) {
                    return {
                        status: 'COMPLETED',
                        httpStatus: pollRes.status,
                        attempts: attempt
                    };
                }
            }

            return {
                status: 'PENDING_TIMEOUT',
                httpStatus: 202,
                location: pollUrl
            };
        }

        return { status: 'COMPLETED', httpStatus: patchRes.status };
    } catch (error) {
        const status = error.response?.status;
        const details = formatAllegroApiErrors(error.response?.data || error.message);
        const err = new Error(`Allegro API PATCH error (${status || 'NETWORK'}): ${details}`);
        err.statusCode = status || 500;
        err.allegroErrors = error.response?.data?.errors || null;
        throw err;
    }
}

module.exports = {
    getAllegroToken,
    inspectTokenClaims,
    ensureSellerWriteToken,
    getOfferImages,
    getFullOfferData,
    fetchCategoryParameters,
    getCategoryParametersFull,
    findCategoryByEan,
    findMatchingCategoryByName,
    getProductParametersByEan,
    findSellerOffersForProduct,
    getOfferAndCatalogForParams,
    parseIngredientsWithAllegro,
    patchProductOffer,
    formatAllegroApiErrors,
    startDeviceFlow,
    pollForToken,
    searchProducts,
    getListingCompetitors,
    apiClient
};


