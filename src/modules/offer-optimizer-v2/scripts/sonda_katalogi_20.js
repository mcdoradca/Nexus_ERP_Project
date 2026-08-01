const BaseLinkerService = require('../../offer-optimizer/baselinker.service.js');
const extract = require('../baselinker.extract.js');
const config = require('../baselinker.extract.config.json');

async function run() {
    const r = await BaseLinkerService.rawCall('getInventories');
    const invIds = r.inventories.map(i => i.inventory_id);
    
    console.log("=== KROK 1: KATALOGI ===");
    const catData = {};
    const allKeysGlobal = new Set();
    const coverage = {
        totalProducts: 0,
        keysStats: {}
    };

    const coverageExtracted = {
        'inci': { '23757': 0, '30754': 0, total: 0 },
        'mpn': { '23757': 0, '30754': 0, total: 0 },
        'brand': { '23757': 0, '30754': 0, total: 0 },
        'capacity': { '23757': 0, '30754': 0, total: 0 },
        'usage': { '23757': 0, '30754': 0, total: 0 },
        'warnings': { '23757': 0, '30754': 0, total: 0 }
    };

    for (const inv of r.inventories) {
        const id = inv.inventory_id;
        const name = inv.name;
        
        let allProds = [];
        let page = 1;
        while(true) {
            const listRes = await BaseLinkerService.rawCall('getInventoryProductsList', { inventory_id: id, filter_page: page });
            if (!listRes.products || Object.keys(listRes.products).length === 0) break;
            allProds.push(...Object.values(listRes.products));
            page++;
            await new Promise(r => setTimeout(r, 1200));
        }
        
        let countNoEan = 0;
        let countFeaturesString = 0;
        let countJSONParseFail = 0;
        const keysFreq = {};
        
        // Zabezpieczamy API requestując batchami po 100 z opóźnieniem:
        for (let idx = 0; idx < allProds.length; idx += 100) {
            await new Promise(r => setTimeout(r, 1500));
            const chunk = allProds.slice(idx, idx + 100);
            const ids = chunk.map(p => p.product_id);
            const dpRes = await BaseLinkerService.rawCall('getInventoryProductsData', { inventory_id: id, products: ids });
            
            for (const p of chunk) {
                if (!p.ean) countNoEan++;
                
                const pData = dpRes.products[p.product_id];
                if(!pData) continue;
                
                let featuresObj = null;
                if (pData.text_fields && pData.text_fields.features) {
                    const feat = pData.text_fields.features;
                    if (typeof feat === 'string') {
                        countFeaturesString++;
                        try {
                            featuresObj = JSON.parse(feat);
                        } catch(e) {
                            countJSONParseFail++;
                            // Wydobycie kluczy z toleranta:
                            const parsed = extract.extractFromFeatures(pData);
                            if (parsed.recovered_keys) {
                                // Przygotowujemy sztuczny obiekt w celu wyciagniecia czestosci
                                featuresObj = {};
                                for(const pk of parsed.recovered_keys) {
                                    featuresObj[pk] = "recovered"; // jakkolwiek not empty by nabić częstotliwość, ale to jest mock, wazne że pękla pętla nizej to chwyci klucze
                                }
                            }
                        }
                    } else if (typeof feat === 'object') {
                        featuresObj = feat;
                    }
                }
                
                if (featuresObj && typeof featuresObj === 'object') {
                    for (const k of Object.keys(featuresObj)) {
                        allKeysGlobal.add(k);
                        if (!keysFreq[k]) keysFreq[k] = { count: 0, notEmpty: 0 };
                        keysFreq[k].count++;
                        if (featuresObj[k] && String(featuresObj[k]).trim() !== '') {
                            keysFreq[k].notEmpty++;
                        }
                    }
                }
                
                // Do kroku 5 (Pokrycie)
                const extracted = extract.extractFromFeatures(pData);
                for (const f of ['inci', 'mpn', 'brand', 'capacity', 'usage', 'warnings']) {
                    if (extracted[f].value !== null && String(extracted[f].value).trim() !== '') {
                        if(coverageExtracted[f][id] === undefined) coverageExtracted[f][id] = 0;
                        coverageExtracted[f][id]++;
                        coverageExtracted[f].total++;
                    }
                }
            }
        }
        
        catData[id] = {
            id, name,
            total: allProds.length,
            noEan: countNoEan,
            featuresString: countFeaturesString,
            jsonParseFail: countJSONParseFail,
            keysFreq
        };
        coverage.totalProducts += allProds.length;
    }
    
    console.log("=== WYNIKI KROK 1 ===");
    console.log(JSON.stringify(catData, null, 2));
    
    console.log("=== KROK 2 & 3: ZESTAWIENIE KLUCZY ===");
    console.log("WSZYSTKIE KLUCZE Z OBU KATALOGÓW:");
    const allArr = Array.from(allKeysGlobal);
    console.log(JSON.stringify(allArr));
    
    console.log("KLUCZE KTÓRE NIE TRAFIAJĄ W MAPĘ SYNONIMÓW:");
    const allSynonyms = [];
    for (const s of Object.values(config.featureSynonyms)) allSynonyms.push(...s);
    
    for (const k of allArr) {
        const norm = extract.normalizeFeatureKey(k);
        if (!allSynonyms.includes(norm) && (!config.ignoredFeatures || !config.ignoredFeatures.includes(norm))) {
            console.log(`- ${k} (znormalizowane: '${norm}')`);
        }
    }
    
    console.log("=== KROK 5: POKRYCIE ===");
    console.log(JSON.stringify(coverageExtracted, null, 2));
    console.log("TOTAL PRODS: " + coverage.totalProducts);
}

run().catch(console.error);
