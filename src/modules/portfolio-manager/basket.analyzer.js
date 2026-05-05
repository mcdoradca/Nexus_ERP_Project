/**
 * Klasa odpowiedzialna za Market Basket Analysis (Analiza Koszyka).
 * Wykorzystuje uproszczony algorytm asocjacyjny do znajdowania powiązań między produktami (EAN).
 * Algorytm liczy Wsparcie (Support), Ufność (Confidence) i Przyrost (Lift).
 */
class BasketAnalyzer {
    /**
     * @param {number} minSupport - Minimalny próg wsparcia (np. 0.01 = para musi wystąpić w 1% zamówień)
     * @param {number} minConfidence - Minimalny próg ufności (np. 0.10 = w 10% zamówień z produktem A musi być produkt B)
     */
    constructor(minSupport = 0.01, minConfidence = 0.1) {
        this.minSupport = minSupport; 
        this.minConfidence = minConfidence; 
    }

    /**
     * Analizuje listę zamówień i zwraca reguły asocjacyjne.
     * @param {Array} orders - Tablica zamówień w formacie podobnym do BaseLinkera.
     * @returns {Array} Tablica obiektów z regułami (EAN_A -> EAN_B).
     */
    analyze(orders) {
        if (!orders || orders.length === 0) return [];

        const totalOrders = orders.length;
        const itemCounts = {}; // Ile razy dany EAN wystąpił we wszystkich zamówieniach
        const pairCounts = {}; // Ile razy para EAN-ów wystąpiła razem w jednym zamówieniu

        // 1. Zliczanie wystąpień pojedynczych produktów i par
        orders.forEach(order => {
            if (!order.products || !Array.isArray(order.products)) return;

            // Wyciągamy unikalne EAN-y z danego zamówienia (ignorujemy brak eanu)
            const orderEans = [...new Set(order.products.map(p => p.ean).filter(ean => ean && ean.trim() !== ''))];

            orderEans.forEach(ean => {
                itemCounts[ean] = (itemCounts[ean] || 0) + 1;
            });

            // Tworzenie par kombinacji w ramach jednego zamówienia
            for (let i = 0; i < orderEans.length; i++) {
                for (let j = i + 1; j < orderEans.length; j++) {
                    // Sortujemy alfabetycznie, żeby para (A,B) była liczona w tym samym koszyku co (B,A)
                    const pair = [orderEans[i], orderEans[j]].sort();
                    const pairKey = `${pair[0]}||${pair[1]}`;
                    pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
                }
            }
        });

        const rules = [];

        // 2. Obliczanie Support, Confidence i Lift dla każdej znalezionej pary
        for (const [pairKey, count] of Object.entries(pairCounts)) {
            const supportPair = count / totalOrders;

            // Odrzucamy pary, które występują na tyle rzadko, że są przypadkowe
            if (supportPair < this.minSupport) continue;

            const [itemA, itemB] = pairKey.split('||');

            const supportA = itemCounts[itemA] / totalOrders;
            const supportB = itemCounts[itemB] / totalOrders;

            // Reguła: Kupno A -> implikuje zakup B
            const confidenceAtoB = supportPair / supportA;
            const liftAtoB = confidenceAtoB / supportB;

            if (confidenceAtoB >= this.minConfidence) {
                rules.push({
                    baseItem: itemA,
                    targetItem: itemB,
                    support: parseFloat(supportPair.toFixed(4)),
                    confidence: parseFloat(confidenceAtoB.toFixed(4)),
                    lift: parseFloat(liftAtoB.toFixed(4)),
                    occurrences: count
                });
            }

            // Reguła: Kupno B -> implikuje zakup A
            const confidenceBtoA = supportPair / supportB;
            const liftBtoA = confidenceBtoA / supportA;

            if (confidenceBtoA >= this.minConfidence) {
                rules.push({
                    baseItem: itemB,
                    targetItem: itemA,
                    support: parseFloat(supportPair.toFixed(4)),
                    confidence: parseFloat(confidenceBtoA.toFixed(4)),
                    lift: parseFloat(liftBtoA.toFixed(4)),
                    occurrences: count
                });
            }
        }

        // Sortowanie po parametrze "Lift" (najsilniejsza, nieprzypadkowa korelacja), a potem po sile "Confidence"
        return rules.sort((a, b) => b.lift - a.lift || b.confidence - a.confidence);
    }
}

module.exports = BasketAnalyzer;
