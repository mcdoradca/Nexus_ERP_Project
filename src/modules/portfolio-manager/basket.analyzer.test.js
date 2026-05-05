const BasketAnalyzer = require('./basket.analyzer');

console.log('--- TESTOWANIE ALGORYTMU ANALIZY KOSZYKA (MARKET BASKET ANALYSIS) ---');

// Symulacja bazy 10 zamówień z BaseLinkera dla sklepu z kosmetykami
const mockOrders = [
    { order_id: 1, products: [{ ean: 'SZAMPON' }, { ean: 'ODZYWKA' }] },
    { order_id: 2, products: [{ ean: 'KREM_DZIEN' }, { ean: 'KREM_NOC' }, { ean: 'SERUM' }] },
    { order_id: 3, products: [{ ean: 'SZAMPON' }, { ean: 'GABKA' }] },
    { order_id: 4, products: [{ ean: 'SZAMPON' }, { ean: 'ODZYWKA' }, { ean: 'MASKA_WLOSY' }] },
    { order_id: 5, products: [{ ean: 'KREM_DZIEN' }, { ean: 'SERUM' }] },
    { order_id: 6, products: [{ ean: 'SZAMPON' }, { ean: 'ODZYWKA' }] },
    { order_id: 7, products: [{ ean: 'ZEL_POD_PRYSZNIC' }] },
    { order_id: 8, products: [{ ean: 'SZAMPON' }, { ean: 'ODZYWKA' }, { ean: 'ZEL_POD_PRYSZNIC' }] },
    { order_id: 9, products: [{ ean: 'KREM_DZIEN' }, { ean: 'KREM_NOC' }] },
    { order_id: 10, products: [{ ean: 'SZAMPON' }, { ean: 'ODZYWKA' }, { ean: 'GABKA' }] },
];

const analyzer = new BasketAnalyzer(0.1, 0.3); // minSupport 10%, minConf 30%
const rules = analyzer.analyze(mockOrders);

console.log('\nZnalezione najsilniejsze powiązania koszykowe (Zestawy):');
rules.forEach(rule => {
    // Lift > 1 oznacza pozytywną korelację (ludzie kupują je razem częściej niż wynikałoby to z przypadku)
    const korelacja = rule.lift > 1.0 ? '✅ SILNA' : '❌ PRZYPADKOWA';
    console.log(`[${korelacja}] Jeśli klient kupuje [${rule.baseItem}], w ${(rule.confidence * 100).toFixed(0)}% przypadków dokupuje [${rule.targetItem}]. (Lift: ${rule.lift})`);
});
