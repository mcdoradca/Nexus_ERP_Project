const { fuseTrafficWithSales } = require('../offer-optimizer/allegro.analytics.service');

/**
 * Mózg Biddingowy (Promotion Recommender)
 * Otrzymuje klasyfikację asortymentu (Lokomotywy, Wagony, Śpiochy) oraz dane z API Allegro,
 * i na podstawie wyliczonych twardych wartości ROI sugeruje konkretne działania promocyjne.
 */

async function generatePromotionalTasks(categorizedProducts, globalBudget = 1000) {
    console.log(`[PromotionRecommender] Analizuję ${categorizedProducts.length} produktów pod budżet ${globalBudget} PLN.`);
    const tasks = [];
    let remainingBudget = globalBudget;

    for (const item of categorizedProducts) {
        if (remainingBudget <= 0) break;

        try {
            // Zderzenie danych o ruchu (Odsłony) ze sprzedażą z BaseLinkera
            const analytics = await fuseTrafficWithSales(item.ean, item.offerId || 'mock_offer_id');

            // --- REGUŁY DECYZYJNE ---

            // 1. Lokomotywa z wysokim CTR, brakuje ruchu -> INWESTYCJA W CPC
            if (item.category === 'Lokomotywa') {
                if (analytics.ctr > 0.05 && analytics.margin > 15) {
                    const cpcBudget = Math.min(200, remainingBudget);
                    tasks.push({
                        action: 'INCREASE_CPC',
                        ean: item.ean,
                        sku: item.sku,
                        reason: `Produkt to Lokomotywa. Bardzo dobry CTR (${(analytics.ctr * 100).toFixed(1)}%) i marża ${analytics.margin} PLN. Przydzielono CPC, by zwiększyć skalę.`,
                        estimatedCost: cpcBudget,
                        urgency: 'HIGH'
                    });
                    remainingBudget -= cpcBudget;
                }
            }

            // 2. Wagon z dobrą asocjacją (kupowany z Lokomotywą), ale sam się nie klika -> MONETY / KUPONY
            if (item.category === 'Wagon') {
                // Jeśli marża pozwala, proponujemy ulepszenie oferty przez Monety, by zachęcić do kupna luzem
                if (analytics.margin > 20 && analytics.clicks < 50) {
                    const coinsCost = 50; // Koszt 50 monet (ok. 50 PLN)
                    if (remainingBudget >= coinsCost) {
                        tasks.push({
                            action: 'ADD_COINS',
                            ean: item.ean,
                            sku: item.sku,
                            reason: `Produkt to Wagon z wysoką marżą (${analytics.margin} PLN), ale słabo klika się organicznie (${analytics.clicks} klik.). Sugerowane dopięcie 5 Monet by przebić konkurencję.`,
                            estimatedCost: coinsCost,
                            urgency: 'MEDIUM'
                        });
                        remainingBudget -= coinsCost;
                    }
                }
            }

            // 3. Śpioch -> ZESTAW WYPRZEDAŻOWY LUB STREFA OKAZJI
            if (item.category === 'Śpioch') {
                if (analytics.impressions < 10) {
                    tasks.push({
                        action: 'CREATE_CLEARANCE_BUNDLE',
                        ean: item.ean,
                        sku: item.sku,
                        reason: `Produkt to Śpioch (brak ruchu: ${analytics.impressions} odsłon). Utwórz agresywny Zestaw z najsilniejszą Lokomotywą by uwolnić zamrożoną gotówkę z magazynu.`,
                        estimatedCost: 0,
                        urgency: 'MEDIUM'
                    });
                }
            }
        } catch (error) {
            console.warn(`[PromotionRecommender] Pominięto EAN ${item.ean} - ${error.message}`);
        }
    }

    return {
        allocatedBudget: globalBudget - remainingBudget,
        remainingBudget,
        tasks
    };
}

module.exports = {
    generatePromotionalTasks
};
