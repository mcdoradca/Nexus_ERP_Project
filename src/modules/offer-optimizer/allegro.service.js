const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

/**
 * Serwis integrujący oficjalne API Allegro
 * Wymaga podania ALLEGRO_CLIENT_ID oraz ALLEGRO_CLIENT_SECRET w pliku .env
 */

let cachedToken = null;
let tokenExpiry = null;

async function getAllegroToken() {
    // Prosty mechanizm cache'owania tokenu
    if (cachedToken && tokenExpiry && Date.now() < tokenExpiry) {
        return cachedToken;
    }

    const clientId = process.env.ALLEGRO_CLIENT_ID;
    const clientSecret = process.env.ALLEGRO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
         console.warn("[AllegroService] Brak poświadczeń ALLEGRO_CLIENT_ID i ALLEGRO_CLIENT_SECRET w pliku .env!");
         throw new Error("Brak autoryzacji do API Allegro. Skonfiguruj klucze deweloperskie w panelu aplikacji.");
    }

    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    try {
        const response = await axios.post('https://allegro.pl/auth/oauth/token?grant_type=client_credentials', null, {
            headers: {
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        cachedToken = response.data.access_token;
        // Token jest ważny zazwyczaj 12h, ustawiamy bezpieczny margines na pobranie
        tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000; 
        
        console.log("[AllegroService] Autoryzacja zakończona sukcesem. Pobrano nowy Token OAuth2.");
        return cachedToken;

    } catch (error) {
        console.error("[AllegroService] Błąd autoryzacji:", error.response ? error.response.data : error.message);
        throw new Error("Nie udało się pobrać tokenu autoryzacyjnego z Allegro API.");
    }
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
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            }
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
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            }
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

module.exports = {
    getAllegroToken,
    getOfferImages,
    getFullOfferData
};
