const BaseLinkerService = require('../offer-optimizer/baselinker.service');

/**
 * Serwis dedykowany dla Portfolio Managera do wykonywania "ciężkich" (masowych) zapytań
 * bez zakłócania bieżącej pracy operacyjnej API Nexus.
 */
class BaseLinkerBatchService {
    /**
     * Masowo i bezpiecznie zaciąga historię zamówień wykorzystując paginację po ID.
     * Używamy tego do zasilania algorytmów analityki koszykowej (Basket Analysis).
     * @param {number} daysBack - Z ilu dni pobrać zamówienia
     * @returns {Promise<Array>} Płaska tablica wszystkich zebranych zamówień
     */
    static async fetchHistoricalOrdersStream(daysBack = 30) {
        console.log(`[Batch Service] Rozpoczynam pobieranie historii zamówień z BaseLinkera (${daysBack} dni wstecz)...`);
        const dateFrom = Math.floor(Date.now() / 1000) - (daysBack * 24 * 60 * 60);
        let allOrders = [];
        let hasMore = true;
        let currentIdFrom = null;

        while (hasMore) {
            const payload = {};
            if (currentIdFrom) {
                payload.id_from = currentIdFrom;
            } else {
                payload.date_from = dateFrom;
            }

            // Omijamy zamówienia niepotwierdzone i śmieciowe, interesuje nas faktyczny, sfinalizowany wolumen
            payload.get_unconfirmed_orders = false; 

            try {
                // Wykorzystujemy bezpieczną metodę rawCall, która wewnętrznie posiada obsługę błędów 429 i exponetial backoff
                const res = await BaseLinkerService.rawCall('getOrders', payload);
                
                if (!res.orders || res.orders.length === 0) {
                    hasMore = false;
                    break;
                }

                allOrders = allOrders.concat(res.orders);
                
                // Delikatny log dla monitoringu postępów w konsoli
                process.stdout.write(`\r[Batch Service] Pobrano partię ${res.orders.length} zamówień. Łącznie w buforze: ${allOrders.length}`);

                // System BaseLinker przy zapytaniu bez order_id potrafi zwrócić zdefiniowaną max paczkę (często 100).
                // Jeśli dostajemy równe 100 (lub po prostu dużą partię), to znaczy, że są kolejne "strony".
                if (res.orders.length >= 100) {
                    // Znajdujemy największe order_id w pobranej paczce by wywołać id_from w następnej pętli
                    const maxId = Math.max(...res.orders.map(o => parseInt(o.order_id, 10)));
                    currentIdFrom = maxId;
                } else {
                    hasMore = false;
                }
                
                // Delikatny sztuczny odstęp na ostudzenie rury API, tak by operacyjny e-commerce działał bez opóźnień
                await new Promise(r => setTimeout(r, 250)); 

            } catch (error) {
                console.error('\n[Batch Service] 🚨 Krytyczny błąd podczas paginacji zamówień:', error.message);
                hasMore = false; // Hard break, by nie zamordować API nieskończoną pętlą przy błędzie tokenu
            }
        }

        console.log(`\n[Batch Service] ✅ Zakończono pobieranie pomyślnie. Zebrano łącznie ${allOrders.length} unikalnych zamówień.`);
        return allOrders;
    }
}

module.exports = BaseLinkerBatchService;
