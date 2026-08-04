const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();


/**
 * Serwis integrujący oficjalne API Allegro
 * Wymaga podania ALLEGRO_CLIENT_ID oraz ALLEGRO_CLIENT_SECRET w pliku .env
 */

let cachedToken = null;
let tokenExpiry = null;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getAllegroToken() {
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const accessTokenSetting = await prisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_ACCESS_TOKEN' } });
    const expirySetting = await prisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_TOKEN_EXPIRY' } });
    
    if (accessTokenSetting && expirySetting) {
        const expiry = parseInt(expirySetting.value, 10);
        if (Date.now() < expiry) {
            cachedToken = accessTokenSetting.value;
            tokenExpiry = expiry;
            return cachedToken;
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
        console.warn("[AllegroService] Brak Refresh Tokenu! Próba pobrania client_credentials (publicznego).");
        const response = await axios.post('https://allegro.pl/auth/oauth/token?grant_type=client_credentials', null, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        cachedToken = response.data.access_token;
        tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
        return cachedToken;
    }

    try {
        const response = await axios.post('https://allegro.pl/auth/oauth/token', 
            `grant_type=refresh_token&refresh_token=${refreshTokenSetting.value}`, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
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

        console.log("[AllegroService] Odświeżono Token OAuth2 (User Token).");
        return cachedToken;
    } catch (error) {
        console.error("[AllegroService] Błąd odświeżania tokenu:", error.response ? error.response.data : error.message);
        throw new Error("Nie udało się odświeżyć tokenu. Przeprowadź ponowne logowanie Device Flow.");
    }
}

async function startDeviceFlow() {
    const clientId = process.env.ALLEGRO_CLIENT_ID;
    const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post('https://allegro.pl/auth/oauth/device', `client_id=${clientId}`, {
        headers: {
            'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
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
            'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
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
 * Pobiera ofertę na podstawie ID i ekstrahuje oryginalne adresy zdjęć.
 */
async function getOfferImages(offerId) {
    if (!offerId) return [];

    try {
        const token = await getAllegroToken();
        
        console.log(`[AllegroService] Odpytywanie /sale/product-offers/${offerId}...`);
        const response = await axios.get(`https://api.allegro.pl/sale/product-offers/${offerId}`, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
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
        console.log(`[AllegroService] Pobrano ${imageUrls.length} oryginalnych obrazów z oferty.`);
        return imageUrls;

    } catch (error) {
        if (error.response && error.response.status === 404) {
             console.warn(`[AllegroService] Oferta ${offerId} nie została znaleziona w API.`);
             return [];
        }
        console.error(`[AllegroService] Błąd pobierania danych oferty ${offerId}:`, error.response ? error.response.data : error.message);
        throw new Error(`Błąd integracji z ofertą Allegro: ${error.message}`);
    }
}

/**
 * Pełne pobranie danych z API Allegro - zastępuje analizę obrazu.
 */
async function getFullOfferData(offerId) {
    if (!offerId) throw new Error("Brak ID oferty do pobrania");

    try {
        const token = await getAllegroToken();
        console.log(`[AllegroService] Odpytywanie FULL DATA /sale/product-offers/${offerId}...`);
        
        const response = await axios.get(`https://api.allegro.pl/sale/product-offers/${offerId}`, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });

        const data = response.data;
        
        // 1. Tytuł (name lub product.name)
        const title = data.name || (data.product && data.product.name) || "";
        
        // 2. Zdjęcia
        const imageUrls = data.images ? data.images.map(img => img.url) : [];
        
        // 3. Kod EAN (GTIN) i Parametry
        let ean = data.ean || "";
        let paramsText = "";
        if (data.parameters) {
            data.parameters.forEach(p => {
                const vals = p.values ? p.values.join(", ") : (p.valuesIds ? p.valuesIds.join(", ") : "");
                paramsText += `- [ID: ${p.id}] ${p.name || ''}: ${vals}\n`;
                
                // Jeśli znajdziemy parametr o ID 11323 (często EAN) lub name 'EAN'
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
             // Czasami product.id to UUID, czasami to może być GTIN, ale w katalogu to zwykle UUID.
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
TYTUŁ AUKCJI: ${title}
EAN: ${ean}

PARAMETRY OFERTY:
${paramsText}

GŁÓWNY OPIS (HTML):
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
             throw new Error(`Oferta Allegro o ID ${offerId} nie istnieje (Błąd 404). Upewnij się, że podajesz poprawny numer i że oferta jest na Twoim koncie.`);
        } else if (error.response && error.response.status === 403) {
             throw new Error(`Brak uprawnień (Błąd 403) do odczytu /sale/product-offers/${offerId}. Token OAuth musi dotyczyć konta, z którego wystawiono tę ofertę.`);
        }
        throw new Error(`Błąd integracji z API Allegro: ${error.message}`);
    }
}

/**
 * Pobiera słownik parametrów dla podanej kategorii (Lazy Schema Caching) i zapisuje do bazy Nexus.
 */
async function fetchCategoryParameters(categoryId) {
    if (!categoryId) throw new Error("Brak categoryId do pobrania parametrów.");

    try {
        const token = await getAllegroToken();
        
        console.log(`[AllegroService] Pobieram parametry dla kategorii ID: ${categoryId}`);
        const response = await axios.get(`https://api.allegro.pl/sale/categories/${categoryId}/parameters`, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });

        const parameters = response.data.parameters;
        
        // Pobieranie nazwy kategorii do ładnego wyświetlania w PIM
        const catResponse = await axios.get(`https://api.allegro.pl/sale/categories/${categoryId}`, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
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
        
        // Minifikacja dla Agenta (ochrona tokenów)
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
        console.error(`[AllegroService] Błąd pobierania schematu dla kategorii ${categoryId}:`, error.response ? error.response.data : error.message);
        throw new Error(`Błąd integracji słownika parametrów: ${error.message}`);
    }
}

/**
 * Szuka w globalnym Katalogu Produktów Allegro kategorii przypisanej do danego EAN.
 */
async function findCategoryByEan(ean) {
    if (!ean) return null;
    try {
        const token = await getAllegroToken();
        const response = await axios.get(`https://api.allegro.pl/sale/products?ean=${ean}`, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
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
        console.error(`[AllegroService] Błąd wyszukiwania kategorii po EAN ${ean}:`, error.message);
        return null;
    }
}

/**
 * Szuka w globalnym Katalogu Produktów Allegro parametrów twardych przypisanych do danego EAN.
 */
async function getProductParametersByEan(ean) {
    if (!ean) return {};
    try {
        const token = await getAllegroToken();
        const response = await axios.get(`https://api.allegro.pl/sale/products?phrase=${ean}&mode=GTIN`, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
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
                    if (p.type === 'dictionary') {
                        if (p.valuesLabels && p.valuesLabels.length > 0) {
                            hardFeatures[p.name] = p.valuesLabels[0];
                        }
                    } else {
                        if (p.values && p.values.length > 0) {
                            hardFeatures[p.name] = p.values[0];
                        }
                    }
                });
            }
        }
        return hardFeatures;
    } catch (error) {
        console.error(`[AllegroService] Błąd pobierania parametrów z katalogu dla EAN ${ean}:`, error.message);
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
        const response = await axios.get(`https://api.allegro.pl/sale/matching-categories?name=${encodeURIComponent(name)}`, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });
        
        if (response.data.matchingCategories && response.data.matchingCategories.length > 0) {
            // Zwracamy pierwszą (najbardziej trafną) kategorię
            return response.data.matchingCategories[0].id;
        }
        return null;
    } catch (error) {
        console.error(`[AllegroService] Błąd wyszukiwania dopasowania kategorii dla nazwy "${name}":`, error.message);
        return null;
    }
}
/**
 * Przeszukuje Katalog Produktów Allegro (endpoint dla agenta)
 */
async function searchProducts(phrase, mode = "NAME") {
    if (!phrase) return { error: "Brak frazy do wyszukania w katalogu." };
    try {
        const token = await getAllegroToken();
        let queryParam = mode === "GTIN" ? `ean=${encodeURIComponent(phrase)}` : `phrase=${encodeURIComponent(phrase)}`;
        
        const response = await axios.get(`https://api.allegro.pl/sale/products?${queryParam}`, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });
        
        if (response.data.products && response.data.products.length > 0) {
            // Zwracamy uproszczone dane dla agenta (nazwa, marka, kategoria, parametry ograniczające budżet tokenów)
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
        return { message: "Nie znaleziono produktów w katalogu Allegro." };
    } catch (error) {
        console.warn(`[AllegroService] Błąd w searchProducts dla frazy "${phrase}":`, error.message);
        return { error: error.message };
    }
}

/**
 * Zwraca listing ofert konkurencji (endpoint zastrzeżony, best-effort)
 */
async function getListingCompetitors(phrase, categoryId, limit = 60) {
    if (!phrase) return { error: "Brak frazy" };
    try {
        const token = await getAllegroToken();
        let url = `https://api.allegro.pl/offers/listing?phrase=${encodeURIComponent(phrase)}&sort=-popularity&limit=${limit}`;
        if (categoryId) url += `&category.id=${categoryId}`;

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Nexus-Network/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            timeout: 15000
        });

        // Agregacja tytułów z ofert sponsorowanych i zwykłych
        const promoted = (response.data.items.promoted || []).map(i => i.name);
        const regular = (response.data.items.regular || []).map(i => i.name);
        const titles = [...promoted, ...regular];
        
        // Zwracamy same tytuły, filtry są usuwane ze względu na gigantyczny rozmiar JSON (zabezpieczenie 429 Quota Exceeded)
        return {
            titles
        };
    } catch (error) {
        if (error.response && error.response.status === 403) {
            return { error: "ALLEGRO_FORBIDDEN", hint: "Aplikacja wymaga weryfikacji przez Allegro do użycia tego endpointu." };
        }
        console.warn(`[AllegroService] Błąd w getListingCompetitors:`, error.message);
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
