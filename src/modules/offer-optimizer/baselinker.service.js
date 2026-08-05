const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { exportLogger } = require('../../utils/logger');

const BASELINKER_API_URL = 'https://api.baselinker.com/connector.php';

// Rate Limiter Configuration (50 requests per 120 seconds)
const REQUESTS_LIMIT = 50;
const WINDOW_MS = 120 * 1000;
let requestTimestamps = [];

/**
 * Globalna funkcja wypychająca payload z odpowiednim nagłówkiem bezpieczeństwa.
 */
async function callBaseLinkerApi(method, parameters = {}, retries = 3, backoff = 1000) {
    // Rygorystyczna aplikacja Rate Limitera
    const now = Date.now();
    requestTimestamps = requestTimestamps.filter(t => now - t < WINDOW_MS);
    
    if (requestTimestamps.length >= REQUESTS_LIMIT) {
        // Blokujemy ponawianie do upływu pełnych 120s od ostatniego zapytania!
        const newest = requestTimestamps[requestTimestamps.length - 1];
        const waitTime = WINDOW_MS - (now - newest);
        
        console.log(`[Rate Limiter BaseLinker] Limit ${REQUESTS_LIMIT} zapytań / 120s osiągnięty. Rygorystyczna pauza API na ${waitTime}ms...`);
        
        if (waitTime > 0) {
            await new Promise(r => setTimeout(r, waitTime));
        }
        
        // Po odczekaniu pełnego cooldownu, resetujemy całą historię dla nowej transzy zapytań
        requestTimestamps = [];
        requestTimestamps.push(Date.now());
    } else {
        requestTimestamps.push(now);
    }

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

        if (method === 'setInventoryProductFields' || method === 'addInventoryProduct') {
            exportLogger.info(`[BaseLinkerService] Wywołanie API: ${method}`, {
                parameters,
                responseStatus: response.data?.status
            });
        }

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
    // Pozyskuje baselinkerInventoryId przeszukując wszystkie katalogi po baselinkerId
    static async resolveInventoryId(productId) {
        if (!productId) return null;
        
        try {
            const res = await callBaseLinkerApi('getInventories', {});
            if (!res || !res.inventories || res.inventories.length === 0) return null;
            
            for (const inv of res.inventories) {
                const invId = inv.inventory_id;
                const data = await callBaseLinkerApi('getInventoryProductsList', { 
                    inventory_id: invId, 
                    filter_id: parseInt(productId) 
                });
                
                if (data && data.products && Object.keys(data.products).length > 0) {
                    console.log(`[BaseLinkerService] Znaleziono baselinkerInventoryId: ${invId} dla produktu: ${productId}`);
                    return invId.toString();
                }
            }
        } catch (err) {
            console.error(`[BaseLinkerService] Błąd podczas rozwiązywania inventoryId dla produktu ${productId}:`, err.message);
        }
        
        return null;
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

    static async exportOfferToBaselinker(inventoryId, productId, draftData) {
        // Przekierowanie do nowego, deterministycznego serwisu eksportującego v2
        const baselinkerExportService = require('../offer-optimizer-v2/baselinker.export.service');
        
        // MDM przekazuje tylko draftData, ale w draftData może być "product" na którym operowaliśmy, albo pobierzemy go z bazy
        // W MDM to było rzucane w kontekście gdzie product.offerDraft to draftData.
        // Jeśli nie mamy pełnego obiektu produktu (np. ean), pobieramy EAN z bazy aby mieć dane dla Allegro.
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        
        let product = {};
        if (productId) {
            const dbProd = await prisma.product.findFirst({ where: { baselinkerId: productId.toString() } });
            if (dbProd) product = dbProd;
        }

        const result = await baselinkerExportService.exportToBaselinker(inventoryId, productId, draftData, product);
        return result.apiResponse;
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

    static async fetchProductIdByEanAndSku(ean, sku, inventoryId = null) {
        if (!inventoryId) inventoryId = await this.getInventories();

        const payload = {
            inventory_id: inventoryId,
            filter_ean: ean,
            filter_sku: sku
        };
        
        const res = await callBaseLinkerApi('getInventoryProductsList', payload);
        
        if (!res.products || Object.keys(res.products).length === 0) {
            throw new Error(`Produkt z EAN ${ean} oraz SKU ${sku} nie istnieje w PIM BaseLinker.`);
        }
        
        const productIds = Object.keys(res.products);
        return { inventoryId, productId: parseInt(productIds[0], 10) };
    }

    static extraFieldsCache = null;
    static extraFieldsCacheTime = 0;

    static async getExtraFieldsDictionary() {
        const now = Date.now();
        if (this.extraFieldsCache && (now - this.extraFieldsCacheTime < 3600 * 1000)) {
            return this.extraFieldsCache;
        }
        
        try {
            const res = await callBaseLinkerApi('getInventoryExtraFields');
            const dict = {};
            if (res.extra_fields) {
                res.extra_fields.forEach(f => {
                    dict[`extra_field_${f.extra_field_id}`] = f.name;
                });
            }
            this.extraFieldsCache = dict;
            this.extraFieldsCacheTime = now;
            return dict;
        } catch (error) {
            console.error(`[BaseLinkerService] Błąd przy pobieraniu słownika extra_fields:`, error.message);
            return {};
        }
    }

    // --- ETAP 2 PIM: Głębokie wyciąganie danych (Dekompilacja struktury BL) ---
    static async fetchDeepProductData(inventoryId, productId) {
        const [res, extraFieldsDict] = await Promise.all([
            callBaseLinkerApi('getInventoryProductsData', {
                inventory_id: inventoryId,
                products: [productId]
            }),
            this.getExtraFieldsDictionary()
        ]);

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

        const parseFeaturesSafe = (raw) => {
            if (typeof raw === 'string') { try { return JSON.parse(raw); } catch(e) { return {}; } }
            if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;
            return {};
        };

        // 2. TEXT FIELDS (name, description, extra_fields, binarki wideo, parametry)
        if (prod.text_fields) {
            parsed.name = prod.text_fields['name|pl'] || prod.text_fields.name || null;
            
            // 2A. Sklejanie uciętego opisu HTML (Priorytet dla języka PL)
            const descParts = [];
            const mainDesc = prod.text_fields['description|pl'] || prod.text_fields.description;
            if (mainDesc) descParts.push(mainDesc.trim());
            
            for (let i = 1; i <= 4; i++) {
                const extraDesc = prod.text_fields[`description_extra${i}|pl`] || prod.text_fields[`description_extra${i}`];
                if (extraDesc) {
                    descParts.push(extraDesc.trim());
                }
            }
            parsed.descriptionHtml = descParts.length > 0 ? descParts.join('<br><br>') : null;
            
            // 2B. Cechy (Features) przechowywane w text_fields.features (Priorytet PL ale łączymy żeby nie tracić INCI)
            const featuresObj = { ...parseFeaturesSafe(prod.text_fields.features), ...parseFeaturesSafe(prod.text_fields['features|pl']) };
            if (featuresObj && typeof featuresObj === 'object') {
                for (const [fName, fVal] of Object.entries(featuresObj)) {
                    if (typeof fVal === 'string' && fVal.trim().length > 0) {
                        // Oczyszczenie "absurdów" formatowania Allegro (zamiana rur na przecinki)
                        parsed.features[fName.trim()] = fVal.trim().replace(/\|/g, ', ');
                    }
                }
            }
            
            // 2C. Pola dodatkowe (Extra_fields) i binarki
            for (const key in prod.text_fields) {
                if (key.startsWith('extra_field_')) {
                    // Blokada na obce języki (pobieramy tylko domyślne pole lub |pl)
                    if (key.includes('|') && !key.endsWith('|pl')) {
                        continue;
                    }

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
                    } else if (typeof fieldVal === 'string') {
                        let cleanVal = fieldVal.trim();
                        // Ignoruj śmieciowe, puste sekcje HTML w extra_fields (np. gdy INCI jest puste)
                        const rawContentWithoutTags = cleanVal.replace(/<[^>]*>?/gm, '').trim();
                        if (rawContentWithoutTags.length > 0) {
                            const baseKey = key.split('|')[0];
                            const fieldName = extraFieldsDict[baseKey] || `Dodatkowe pole ${baseKey.replace('extra_field_', '')}`;
                            // Zamiana ewentualnych list z | na przecinki (jak w features)
                            parsed.features[fieldName] = cleanVal.replace(/\|/g, ', ');
                        }
                    }
                }
            }
        }

        // 3. FEATURES (Parametry - fallbacks dla starszych instancji PIM)
        const legacyFeatures = { ...parseFeaturesSafe(prod.features), ...parseFeaturesSafe(prod['features|pl']) };
        if (legacyFeatures && typeof legacyFeatures === 'object') {
            for (const [fName, fVal] of Object.entries(legacyFeatures)) {
                if (typeof fVal === 'string' && fVal.trim().length > 0) {
                    parsed.features[fName.trim()] = fVal.trim().replace(/\|/g, ', ');
                }
            }
        }

        // 4. GALERIA (Wydobycie wszystkich unikalnych linków zdjęć bez względu na klucze)
        if (prod.images) {
            const uniqueUrls = new Set();
            for (const key in prod.images) {
                const url = prod.images[key];
                if (typeof url === 'string' && url.trim().length > 0) {
                    uniqueUrls.add(url.trim());
                }
            }
            parsed.images = Array.from(uniqueUrls);
        }

        return parsed;
    }
}

module.exports = BaseLinkerService;
