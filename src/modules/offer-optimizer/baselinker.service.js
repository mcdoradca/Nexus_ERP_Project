const axios = require('axios');

const BASELINKER_API_URL = 'https://api.baselinker.com/connector.php';
const BL_TOKEN = process.env.BASELINKER_TOKEN || 'DUMMY_TOKEN'; // Ochrona: pobieramy X-BLToken z env

/**
 * Globalna funkcja wypychająca payload z odpowiednim nagłówkiem bezpieczeństwa.
 */
async function callBaseLinkerApi(method, parameters = {}) {
    try {
        const params = new URLSearchParams();
        params.append('method', method);
        params.append('parameters', JSON.stringify(parameters));

        const response = await axios.post(BASELINKER_API_URL, params.toString(), {
            headers: {
                'X-BLToken': BL_TOKEN,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 10000 // Ucięcie HTTP po 10s by nie mrozić kolejek w przypadku padu BaseLinkera
        });

        if (response.data.status === 'ERROR') {
            throw new Error(response.data.error_message || 'BaseLinker zwraca status błędu API');
        }

        return response.data;
    } catch (error) {
        console.error(`[BaseLinkerService] Critical API Fault - ${method}:`, error.message);
        throw error; // Wyrzucamy w górę by Queue Worker odpalił mechanizm Exponential Backoff
    }
}

/**
 * Zbiór funkcji wykonawczych API BaseLinkera do manipulacji Ofertami.
 */
class BaseLinkerService {
    
    // Pobiera wyselekcjonowane oferty z magazynu źródłowego do zasilenia silnika Optymalizatora AI
    static async getInventoryProducts(inventoryId, productIds = []) {
        const payload = {
            inventory_id: inventoryId,
            products: productIds
        };
        const res = await callBaseLinkerApi('getInventoryProductsData', payload);
        return res.products;
    }

    // Aplikuje finalny zrekonstruowany StandardizedDescription JSON do wewnątrz BaseLinkera
    static async updateProductDescriptionAndTitle(inventoryId, productId, newTitle, newDescriptionHtml) {
        const payload = {
            inventory_id: inventoryId,
            products: {
                [productId]: {
                    "text_fields": {
                        "name": newTitle,
                        "description": newDescriptionHtml
                    }
                }
            }
        };

        const res = await callBaseLinkerApi('setInventoryProductFields', payload);
        return res;
    }
    
    // Do wykorzystania przy ewentualnych flagowaniach w BaseLinkerze ofert wymagających wgrania nowych zdjęc na podstawie audytu
    static async addCustomFieldNote(inventoryId, productId, noteValue) {
        // Pseudo logic if user defined custom specific field
        // Requires knowing the specific custom_field_id
        return Promise.resolve();
    }
}

module.exports = BaseLinkerService;
