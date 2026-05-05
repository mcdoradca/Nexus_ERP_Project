const fs = require('fs');
const path = require('path');
const os = require('os');
const BaseLinkerBatchService = require('./baselinker.batch.service');
const BasketAnalyzer = require('./basket.analyzer');
const SkuCategorizer = require('./sku.categorizer');
const BaseLinkerService = require('../offer-optimizer/baselinker.service');

/**
 * Główny Orkiestrator: Nexus Portfolio Service
 * Łączy pobieranie danych (Data Ingestion), analitykę matematyczną oraz twardą kategoryzację,
 * po czym wystawia listę Rekomendacji dla panelu CMO.
 */
class PortfolioService {
    /**
     * Główna funkcja orkiestrująca wyliczenie stanu portfela.
     * Uruchamiana np. w nocy z CRON-a.
     */
    static async generateDailyPortfolioState() {
        console.log('🚀 [Portfolio Manager] Inicjacja analizy konta CMO...');

        try {
            // 1. Ingestion: Pobranie historii sprzedaży
            console.log('   -> Pobieranie danych o sprzedaży (ostatnie 30 dni)...');
            let orders = [];
            try {
                // Skrypt masowo paginuje BaseLinkera bez zabicia API limitami
                orders = await BaseLinkerBatchService.fetchHistoricalOrdersStream(30);
            } catch (apiErr) {
                console.warn('   -> ⚠️ Błąd zaciągania żywych danych zamówień. Skrypt działa w oparciu o mockowane dane lokalne, jeśli dostępne.');
            }

            // 2. Ingestion: Pobranie Inventory (Katalog Produktów + Zapas magazynowy)
            console.log('   -> Pobieranie danych katalogowych z PIM (Zapas magazynowy)...');
            let inventory = [];
            try {
                const inventoryId = await BaseLinkerService.getInventories();
                const inventoryRes = await BaseLinkerService.rawCall('getInventoryProductsList', { inventory_id: inventoryId });
                if (inventoryRes.products) {
                    // Konwersja obiektu BaseLinkera (klucze = ID) do płaskiej tablicy
                    inventory = Object.values(inventoryRes.products);
                }
            } catch (apiErr) {
                console.warn('   -> ⚠️ Błąd zaciągania katalogu BaseLinker PIM.');
            }

            // Zabezpieczenie danych (Zakon Strażników) - Jeśli API padło na oba żądania, przerywamy.
            if (orders.length === 0 && inventory.length === 0) {
                console.log('   -> 🔴 Brak danych do analizy (API niedostępne). Skrypt wstrzymany.');
                return null;
            }

            // 3. Obliczenia Asocjacyjne (Sztuczna Inteligencja Koszykowa)
            console.log('   -> Przetwarzanie Macierzy Asocjacyjnej (Market Basket Analysis)...');
            // Zależnie od ilości zamówień parametry odrzucają szum (min 1% wsparcia, min 10% pewności)
            const basketAnalyzer = new BasketAnalyzer(0.01, 0.1); 
            const rules = basketAnalyzer.analyze(orders);

            // 4. Twarda Kategoryzacja (Szufladkowanie Asortymentu)
            console.log('   -> Kategoryzacja asortymentu (Efekt Halo / Lokomotywy vs Śpiochy)...');
            const categorizer = new SkuCategorizer(20, 0); // Lokomotywa = min 20 szt., Śpioch = max 0 szt.
            const portfolio = categorizer.categorize(inventory, orders, rules);

            // 5. Budowa Raportu (State) i Rekomendacji dla Dyrektora Marketingu
            const state = {
                timestamp: new Date().toISOString(),
                totalOrdersAnalyzed: orders.length,
                totalSkus: portfolio.length,
                rulesDiscovered: rules.length,
                portfolio: portfolio,
                recommendations: this._generateStrategicRecommendations(portfolio, rules)
            };

            // Zapisujemy stan do cache (OS Temp Dir), by szybki Front-end w Reactie mógł to natychmiast wyrenderować 
            // bez czekania minuty na zapytania API przy każdym odświeżeniu strony.
            const cachePath = path.join(os.tmpdir(), 'nexus_portfolio_state.json');
            fs.writeFileSync(cachePath, JSON.stringify(state, null, 2));

            console.log(`✅ [Portfolio Manager] Zakończono z sukcesem. Skatalogowano ${portfolio.length} SKU.`);
            console.log(`💾 Wynikowy JSON wyeksportowano do: ${cachePath}`);

            return state;

        } catch (error) {
            console.error('🚨 [Portfolio Manager] Krytyczny błąd w orkiestracji:', error.message);
            throw error;
        }
    }

    /**
     * Konwertuje "twarde kategorie matematyczne" na "Zalecenia Biznesowe" widoczne na dashboardzie.
     */
    static _generateStrategicRecommendations(portfolio, rules) {
        const recommendations = [];

        // Rekomendacja A: Ochrona Lokomotyw
        const locomotives = portfolio.filter(p => p.category === 'LOKOMOTYWA');
        locomotives.forEach(l => {
            recommendations.push({
                type: 'PROTECT_CPC',
                targetEan: l.ean,
                message: `[AI] Oznaczono produkt [${l.name}] jako Lokomotywę. Sugeruję włączenie agresywnego CPC z nielimitowanym budżetem, dopóki twardy ROI z jednostki (Unit Economics) jest > 0.`
            });
        });

        // Rekomendacja B: Wirtualne Półki Nieskończoności (Zestawy)
        const topRules = rules.slice(0, 5); // 5 najpewniejszych połączeń koszykowych
        topRules.forEach(r => {
            recommendations.push({
                type: 'CREATE_VIRTUAL_BUNDLE',
                targetEan: `${r.baseItem}+${r.targetItem}`,
                message: `[AI] Klienci kupujący EAN ${r.baseItem} bardzo często dobierają EAN ${r.targetItem} (Korelacja: +${(r.lift).toFixed(1)}). Wystaw z nich Wirtualny Zestaw (nowy asortyment), aby ominąć porównywarkę Allegro.`
            });
        });

        // Rekomendacja C: Wypychanie Śpiochów
        const sleepers = portfolio.filter(p => p.category === 'ŚPIOCH' && p.stock > 0);
        if (sleepers.length > 0) {
            recommendations.push({
                type: 'LIQUIDATE_STOCK',
                targetCount: sleepers.length,
                message: `[AI] Wykryto ${sleepers.length} produktów z zerową rotacją i zamrożonym kapitałem. Zgłoś całą listę do Strefy Okazji na Allegro lub dołącz do nich 10 Monet Smart, aby wypchnąć je z magazynu.`
            });
        }

        return recommendations;
    }
}

module.exports = PortfolioService;
