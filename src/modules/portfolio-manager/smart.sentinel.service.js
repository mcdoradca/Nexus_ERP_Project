const BaseLinkerService = require('../offer-optimizer/baselinker.service');

/**
 * Nocny Strażnik Programu Smart! (The Smart! Guardian)
 * Architektura "Adversarial AI". Niezależny skrypt audytujący działania handlowców 
 * oraz innych, agresywnych agentów AI.
 * 
 * Jego jedynym zadaniem jest dbanie o to, aby "Wirtualne Zestawy", 
 * które celowo zostały stworzone po to, aby przebić próg darmowej wysyłki Allegro Smart 
 * (obecnie 49,99 PLN, a w przyszłości np. 65,00 PLN), nie zostały uszkodzone przez:
 * a) Błąd ludzki pracownika obniżającego cenę.
 * b) Ślepy algorytm Repricera, który ściął cenę o 20 groszy, niszcząc klientowi opcję "Darmowej dostawy".
 */
class SmartSentinelService {
    /**
     * Główny proces uruchamiany autonomicznie (np. codziennie o 03:00).
     */
    static async runNightlyAudit() {
        console.log('\n🛡️ [Smart! Sentinel] Rozpoczynam nocny audyt ofert zestawowych...');
        
        try {
            let inventoryId;
            try {
                inventoryId = await BaseLinkerService.getInventories();
            } catch (e) {
                console.log('🛡️ [Smart! Sentinel] ⚠️ Brak połączenia z BaseLinkerem. Strażnik przechodzi w tryb uśpienia.');
                return;
            }

            // Strażnik wyciąga całą bazę produktową z ominięciem cache
            const inventoryRes = await BaseLinkerService.rawCall('getInventoryProductsList', { inventory_id: inventoryId });
            
            if (!inventoryRes.products || Object.keys(inventoryRes.products).length === 0) {
                console.log('🛡️ [Smart! Sentinel] Brak produktów do audytu.');
                return;
            }

            const products = Object.values(inventoryRes.products);
            
            // W fazie 4 ten próg będzie zaciągany bezpośrednio z modułu nasłuchującego nowości Allegro.
            // Dziś na twardo ustalamy próg "Polska"
            const smartThreshold = 49.99; 
            
            let brokenSetsCount = 0;

            // Strażnik przeszukuje asortyment w poszukiwaniu "Wirtualnych Zestawów"
            products.forEach(product => {
                const name = (product.name || '').toLowerCase();
                const isBundle = name.includes('zestaw') || name.includes('pakiet') || name.includes('+');
                
                if (isBundle) {
                    const currentPrice = parseFloat(product.price) || 0;
                    
                    // LOGIKA STRAŻNIKA:
                    // Jeśli Zestaw kosztuje 150 zł - wszystko OK.
                    // Jeśli Zestaw kosztuje 10 zł - to mały zestaw (np. 2 małe mydła), OK, nikt nie oczekiwał Smarta.
                    // ALE: Jeśli Zestaw kosztuje między 45.00 a 49.98 PLN, to jest to KRYTYCZNY BŁĄD ARCHITEKTURY.
                    // Oznacza to, że zaledwie kilka groszy brakuje do darmowej dostawy i klient porzuci koszyk!
                    
                    if (currentPrice >= 40.00 && currentPrice < smartThreshold) {
                        brokenSetsCount++;
                        const missingAmount = (smartThreshold - currentPrice).toFixed(2);
                        
                        console.error(`\n🚨 [Smart! Sentinel] NARUSZENIE PROGU SMART!`);
                        console.error(`   Zestaw: [${product.name}] (EAN: ${product.ean})`);
                        console.error(`   Aktualna cena: ${currentPrice} PLN. Brakuje ${missingAmount} PLN do Smarta!`);
                        console.error(`   Wymagana interwencja: Podniesienie ceny w BaseLinkerze do min. 49.99 PLN.`);
                        
                        // Faza ostateczna (Wizja wdrożeniowa): 
                        // System.notifyUniversalChat('@DziałHandlowy - poprawić cenę zestawu, tracicie sprzedaż!');
                        // Oraz automatyczny Price Lock na API.
                    }
                }
            });

            if (brokenSetsCount === 0) {
                console.log(`🛡️ [Smart! Sentinel] Audyt zakończony. Prześwietlono ${products.length} ofert. Wszystkie zestawy zabezpieczone. (Żaden automat nie zepsuł darmowej wysyłki).`);
            } else {
                console.log(`\n🛡️ [Smart! Sentinel] RAPORT: Znaleziono ${brokenSetsCount} zestawów tracących potężną konwersję przez kilka groszy.`);
            }

        } catch (error) {
            console.error('🛡️ [Smart! Sentinel] Krytyczny błąd audytora:', error.message);
        }
    }
}

module.exports = SmartSentinelService;
