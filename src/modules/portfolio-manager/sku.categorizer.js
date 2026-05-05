/**
 * Klasa Kategoryzująca (SKU Categorizer)
 * Moduł AI odpowiedzialny za podział asortymentu na struktury "Efektu Halo":
 * Lokomotywy (Bait), Wagony (Cross-sell) oraz Śpiochy (Dead stock).
 */
class SkuCategorizer {
    /**
     * Zastąpienie sztywnych liczb silnikiem ML-Data-Driven (Percentyle populacji).
     * @param {number} locomotivePercentile - Top X% populacji to Lokomotywy (np. 0.85 oznacza górne 15%)
     * @param {number} sleeperPercentile - Bottom Y% populacji to Śpiochy (np. 0.30 oznacza dolne 30%)
     */
    constructor(locomotivePercentile = 0.85, sleeperPercentile = 0.30) {
        this.locomotivePercentile = locomotivePercentile;
        this.sleeperPercentile = sleeperPercentile;
    }

    /**
     * Główny algorytm kategoryzujący asortyment.
     * @param {Array} inventory - Surowa lista produktów z magazynu (PIM)
     * @param {Array} orders - Historia zamówień dla wyliczenia Sales Velocity
     * @param {Array} basketRules - Lista reguł wyliczonych wcześniej przez BasketAnalyzer
     * @returns {Array} Uporządkowana tablica portfolio
     */
    categorize(inventory, orders, basketRules) {
        const salesVelocity = {};
        
        // Krok 1: Przeliczenie Sales Velocity (Całkowita sprzedana ilość dla każdego EAN)
        orders.forEach(order => {
            if (!order.products || !Array.isArray(order.products)) return;
            order.products.forEach(p => {
                if (!p.ean || p.ean.trim() === '') return;
                const qty = parseInt(p.quantity, 10) || 1;
                salesVelocity[p.ean] = (salesVelocity[p.ean] || 0) + qty;
            });
        });

        // Krok 1.5: WYLICZENIE DYNAMICZNYCH PROGÓW (Data-Driven ML)
        const salesValues = Object.values(salesVelocity).sort((a, b) => a - b);
        let dynamicLocoThreshold = 20; // fallback
        let dynamicSleeperThreshold = 0; // fallback
        
        if (salesValues.length > 0) {
            const locoIdx = Math.floor(salesValues.length * this.locomotivePercentile);
            const sleeperIdx = Math.floor(salesValues.length * this.sleeperPercentile);
            
            dynamicLocoThreshold = salesValues[Math.min(locoIdx, salesValues.length - 1)];
            dynamicSleeperThreshold = salesValues[Math.min(sleeperIdx, salesValues.length - 1)];
        }
        
        // Logika awaryjna: Lokomotywa musi rotować lepiej niż Śpioch
        if (dynamicLocoThreshold <= dynamicSleeperThreshold) {
            dynamicLocoThreshold = dynamicSleeperThreshold + 1;
        }

        // Krok 2: Kategoryzacja każdego produktu na podstawie mapy sprzedaży, zapasów i reguł
        const portfolio = inventory.map(product => {
            const ean = product.ean || '';
            const soldUnits = salesVelocity[ean] || 0;
            // BaseLinker API v1 zwraca stock jako obiekt { id_magazynu: ilość } np. { bl_43836: 21 }
            let parsedStock = 0;
            if (product.stock !== undefined && product.stock !== null) {
                if (typeof product.stock === 'object') {
                    // Sumujemy zapasy ze wszystkich podpiętych magazynów
                    parsedStock = Object.values(product.stock).reduce((sum, val) => sum + (parseInt(val, 10) || 0), 0);
                } else {
                    parsedStock = parseInt(product.stock, 10) || 0;
                }
            } else if (product.quantity !== undefined) {
                parsedStock = parseInt(product.quantity, 10) || 0;
            }
            const stock = parsedStock;
            
            let category = 'NIEZNANA';
            let rationale = '';

            // Reguła 1: Złogi magazynowe (Sprzedaż w dolnym percentylu + zamrożony kapitał)
            if (soldUnits <= dynamicSleeperThreshold && stock > 0) {
                category = 'ŚPIOCH';
                rationale = `Sprzedaż = ${soldUnits} (Dolne ${Math.round(this.sleeperPercentile * 100)}% populacji), Zapas = ${stock} szt. Zamrożony kapitał, wymaga akcji wyprzedażowej.`;
            }
            // Reguła 2: Lokomotywy (Sprzedaż w górnym percentylu populacji)
            else if (soldUnits >= dynamicLocoThreshold) {
                category = 'LOKOMOTYWA';
                rationale = `Sprzedaż = ${soldUnits} (Górne ${Math.round((1 - this.locomotivePercentile) * 100)}% populacji - dynamiczny próg: ${dynamicLocoThreshold}). Generator ruchu.`;
            }
            // Reguła 3: Wagony i reszta (Średnia rotacja)
            else {
                // Sprawdzamy w macierzy koszykowej, czy ten produkt to częsty "dodatek" do innych zakupów (Cross-sell)
                const isBoughtAsTarget = basketRules.some(rule => 
                    rule.targetItem === ean && rule.lift > 1.2
                );

                if (isBoughtAsTarget) {
                    category = 'WAGON';
                    rationale = `Sprzedaż umiarkowana (${soldUnits}), ale jest silnie dokupowany do innych towarów (Lift > 1.2). Kandydat na Zestawy.`;
                } else {
                    category = 'ZWYKŁY_PRODUKT';
                    rationale = `Sprzedaż = ${soldUnits}. Brak statystycznie silnych powiązań z resztą asortymentu.`;
                }
            }

            return {
                id: product.id || product.product_id || 'UNKNOWN',
                ean: ean,
                name: product.name || 'Brak nazwy',
                stock: stock,
                soldLastPeriod: soldUnits,
                category: category,
                rationale: rationale
            };
        });

        // Sortujemy tak, aby na górze panelu CMO widział najważniejsze produkty
        // Priorytet: Lokomotywy -> Wagony -> Śpiochy
        const orderWeight = { 'LOKOMOTYWA': 1, 'WAGON': 2, 'ŚPIOCH': 3, 'ZWYKŁY_PRODUKT': 4, 'NIEZNANA': 5 };
        
        return portfolio.sort((a, b) => {
            return (orderWeight[a.category] || 99) - (orderWeight[b.category] || 99) || b.soldLastPeriod - a.soldLastPeriod;
        });
    }
}

module.exports = SkuCategorizer;
