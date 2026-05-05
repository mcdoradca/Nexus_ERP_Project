const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASELINKER_API_URL = 'https://api.baselinker.com/connector.php';

/**
 * Globalna funkcja wypychająca payload z odpowiednim nagłówkiem bezpieczeństwa.
 */
async function callBaseLinkerApi(method, parameters = {}, retries = 3, backoff = 1000) {
    try {
        const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
        if (!tokenRecord || !tokenRecord.value || tokenRecord.value.length < 5) {
            throw new Error('Brak ważnego klucza BASELINKER_TOKEN w tabeli SystemSetting.');
        }
        const token = tokenRecord.value;

        const params = new URLSearchParams();
        params.append('method', method);
        params.append('parameters', JSON.stringify(parameters));

        const response = await axios.post(BASELINKER_API_URL, params.toString(), {
            headers: {
                'X-BLToken': token,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 15000 // Zwiększone dla ewentualnych opóźnień
        });

        if (response.data.status === 'ERROR') {
            const errMsg = response.data.error_message || '';
            // Jeśli to błąd limitu zapytań po stronie BL (często ERROR limit request)
            if (errMsg.toLowerCase().includes('limit') || errMsg.includes('429')) {
                if (retries > 0) {
                    console.warn(`[BaseLinkerService] Limit zapytań API. Oczekiwanie ${backoff}ms... Pozostało prób: ${retries}`);
                    await new Promise(res => setTimeout(res, backoff));
                    return callBaseLinkerApi(method, parameters, retries - 1, backoff * 2);
                }
            }
            throw new Error(errMsg || 'BaseLinker zwraca status błędu API');
        }

        return response.data;
    } catch (error) {
        if ((error.response && error.response.status === 429) || error.message.includes('429')) {
            if (retries > 0) {
                console.warn(`[BaseLinkerService] Limit zapytań HTTP 429. Oczekiwanie ${backoff}ms... Pozostało prób: ${retries}`);
                await new Promise(res => setTimeout(res, backoff));
                return callBaseLinkerApi(method, parameters, retries - 1, backoff * 2);
            }
        }
        console.error(`[BaseLinkerService] Critical API Fault - ${method}:`, error.message);
        throw error;
    }
}

/**
 * Zbiór funkcji wykonawczych API BaseLinkera do manipulacji Ofertami.
 */
class BaseLinkerService {
    
    // Metoda wystawiona dla innych serwisów (np. Portfolio Managera) do bezpośrednich zapytań z ochroną limitów 429
    static async rawCall(method, parameters = {}) {
        return await callBaseLinkerApi(method, parameters);
    }

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

    // Pomocnicza funkcja do kodowania 4-bajtowych emoji na encje HTML (omijanie limitów utf8 w MySQL BaseLinkera)
    static encodeEmojis(str, isHtml = true) {
        if (!str) return "";
        return str.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(match) {
            if (!isHtml) return ""; // Usuwamy emoji z czystego tekstu (np. Tytułu) by nie wypluło kodu na Allegro
            const high = match.charCodeAt(0);
            const low = match.charCodeAt(1);
            const codePoint = ((high - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
            return '&#x' + codePoint.toString(16).toUpperCase() + ';';
        });
    }

    // Eksport Finalnej Opcji z podziałem na 5 ekstra pół dla symulatora (Wymuszony przez addInventoryProduct)
    static async exportOfferToBaselinker(inventoryId, productId, draftData) {
        // Budujemy mapę zdjęć { "0": "url:...", "1": "data:..." }
        const imagesMap = {};
        if (draftData.images && Array.isArray(draftData.images)) {
            draftData.images.forEach((imgObj, idx) => {
                let url = imgObj.url || "";
                const key = idx.toString(); // BaseLinker liczy pozycje od 0

                if (url.includes('upload.cdn.baselinker.com') || url.includes('placeholder.com')) {
                    // Rygorystyczny zakaz re-uploadu CDN oraz prób wysyłki martwych placeholderów
                    return; 
                } else if (url === "") {
                    // Żądanie usunięcia z tego slota
                    imagesMap[key] = "";
                } else if (url.startsWith('data:image')) {
                    // Base64 musi mieć sam prefiks 'data:' bez 'image/jpeg;base64,'
                    const base64Data = url.split(',')[1] || "";
                    imagesMap[key] = "data:" + base64Data;
                } else if (url.startsWith('http://') || url.startsWith('https://')) {
                    // Normalny link URL musi posiadać prefix 'url:'
                    imagesMap[key] = "url:" + url;
                } else {
                    // Jeśli to czysty tekst (np. alerty od AI symulujące url), ignorujemy
                    return;
                }
            });
        }

        const payload = {
            inventory_id: inventoryId,
            product_id: productId, // MUSI BYĆ, żeby aktualizować, a nie tworzyć duplikat!
            text_fields: {
                "name": BaseLinkerService.encodeEmojis(draftData.title || "", false),
                "description": BaseLinkerService.encodeEmojis(draftData.opis1 || "", true),
                "description_extra1": BaseLinkerService.encodeEmojis(draftData.opis2 || "", true),
                "description_extra2": BaseLinkerService.encodeEmojis(draftData.opis3 || "", true),
                "description_extra3": BaseLinkerService.encodeEmojis(draftData.opis4 || "", true),
                "description_extra4": BaseLinkerService.encodeEmojis(draftData.opis5 || "", true)
            },
            images: imagesMap
        };

        return await callBaseLinkerApi('addInventoryProduct', payload);
    }

    // --- ETAP 1 PIM: Wydobycie ID na podstawie EAN ---
    static async getInventories() {
        const res = await callBaseLinkerApi('getInventories');
        if (res.inventories && res.inventories.length > 0) {
            return res.inventories[0].inventory_id;
        }
        throw new Error("BaseLinker: Brak skonfigurowanych magazynów (Inventories).");
    }

    static async getAllInventoriesData() {
        return await callBaseLinkerApi('getInventories');
    }

    // --- ETAP 4: Analityka i Sprzedaż Historyczna ---
    static async getRecentSalesForEan(ean, days = 30) {
        if (!ean) return 0;
        
        try {
            const dateFrom = Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60);
            
            let totalSold = 0;
            let idFrom = 0;
            let pages = 0;
            const maxPages = 50; // Ograniczenie do max 5000 zamówień dla bezpieczeństwa
            
            while (pages < maxPages) {
                const payload = {
                    date_from: dateFrom,
                    get_unconfirmed_orders: true
                };
                if (idFrom > 0) {
                    payload.id_from = idFrom;
                }
                
                const res = await callBaseLinkerApi('getOrders', payload);
                
                if (!res.orders || res.orders.length === 0) {
                    break;
                }
                
                res.orders.forEach(order => {
                    if (order.products && Array.isArray(order.products)) {
                        order.products.forEach(prod => {
                            if (prod.ean === ean) {
                                totalSold += parseInt(prod.quantity) || 0;
                            }
                        });
                    }
                });
                
                idFrom = res.orders[res.orders.length - 1].order_id;
                pages++;
            }
            
            return totalSold;
            
        } catch (error) {
            console.error(`[BaseLinkerService] Błąd przy pobieraniu historii sprzedaży dla EAN ${ean}:`, error.message);
            return 0;
        }
    }

    static async fetchProductIdByEan(ean, inventoryId = null) {
        if (!inventoryId) inventoryId = await this.getInventories();

        const payload = {
            inventory_id: inventoryId,
            filter_ean: ean
        };
        
        const res = await callBaseLinkerApi('getInventoryProductsList', payload);
        
        if (!res.products || Object.keys(res.products).length === 0) {
            throw new Error(`Produkt z kodem EAN ${ean} nie istnieje w PIM BaseLinker (Widmo/Brak wyniku).`);
        }
        
        const productIds = Object.keys(res.products);
        return { inventoryId, productId: parseInt(productIds[0], 10) };
    }

    // --- ETAP 2 PIM: Głębokie wyciąganie danych (Dekompilacja struktury BL) ---
    static async fetchDeepProductData(inventoryId, productId) {
        const res = await callBaseLinkerApi('getInventoryProductsData', {
            inventory_id: inventoryId,
            products: [productId]
        });

        if (!res.products || !res.products[productId]) {
            throw new Error(`Błąd rzutowania na szczegóły produktu ID: ${productId}`);
        }

        const prod = res.products[productId];
        
        // Tabela zwrotna PIM
        let parsed = {
            baselinkerInventoryId: inventoryId,
            baselinkerId: productId.toString(),
            ean: prod.ean || null,
            sku: prod.sku || null,
            weight: parseFloat(prod.weight) || 0.0,
            length: parseFloat(prod.length) || 0.0,
            width: parseFloat(prod.width) || 0.0,
            height: parseFloat(prod.height) || 0.0,
            taxRate: parseFloat(prod.tax_rate) || 0.0,
            features: {},
            images: [],
            descriptionHtml: null,
            name: null,
            videoUrl: null,
            attachments: [],
            stock: 0,
            stockErpUnits: 0,
            stockWmsUnits: 0,
            price: 0,
            manufacturer: prod.manufacturer || null,
            categoryId: prod.category_id || null
        };

        // 1. STANY MAGAZYNOWE (stock, stock_erp_units, stock_wms_units)
        if (prod.stock) {
            // Obliczamy sumę stock z kluczy 'bl_123'
            let totalStock = 0;
            for (const key in prod.stock) {
                totalStock += parseInt(prod.stock[key]) || 0;
            }
            parsed.stock = totalStock;
        }

        // 1.5 CENA (Pierwsza grupa cenowa)
        if (prod.prices && Object.keys(prod.prices).length > 0) {
            parsed.price = parseFloat(prod.prices[Object.keys(prod.prices)[0]]) || 0;
        }
        
        if (prod.stock_erp_units) {
            let totalErp = 0;
            for (const erpId in prod.stock_erp_units) {
                const erpItems = prod.stock_erp_units[erpId];
                if (Array.isArray(erpItems)) {
                    erpItems.forEach(item => {
                        totalErp += parseInt(item.quantity) || 0;
                    });
                } else if (typeof erpItems === 'object' && erpItems.quantity) {
                    totalErp += parseInt(erpItems.quantity) || 0;
                }
            }
            parsed.stockErpUnits = totalErp;
        }

        // 2. TEXT FIELDS (name, description, extra_fields, binarki wideo)
        if (prod.text_fields) {
            parsed.name = prod.text_fields.name || null;
            parsed.descriptionHtml = prod.text_fields.description || null;
            
            // Szukamy wideo w extra_fields (Binarki / Extra_fields)
            for (const key in prod.text_fields) {
                if (key.startsWith('extra_field_')) {
                    const fieldVal = prod.text_fields[key];
                    if (typeof fieldVal === 'object' && fieldVal !== null) {
                        if (fieldVal.file && fieldVal.url) {
                            if (fieldVal.file.endsWith('.mp4') || fieldVal.file.endsWith('.mov')) {
                                parsed.videoUrl = fieldVal.url;
                            } else {
                                parsed.attachments.push(fieldVal);
                            }
                        }
                    } else if (typeof fieldVal === 'string' && fieldVal.includes('base64')) {
                        parsed.attachments.push({ file: 'base64_blob', data: fieldVal.substring(0, 50) + '...' });
                    }
                }
            }
        }

        // 3. FEATURES (Parametry)
        if (prod.features) {
            parsed.features = prod.features;
        }

        // 4. GALERIA (images od 1 do 16)
        if (prod.images) {
            for (let i = 1; i <= 16; i++) {
                if (prod.images[i]) {
                    parsed.images.push(prod.images[i]);
                }
            }
        }

        return parsed;
    }
}

module.exports = BaseLinkerService;
