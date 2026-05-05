require('dotenv').config();
const PortfolioService = require('./src/modules/portfolio-manager/portfolio.service');

async function test() {
    try {
        console.log("Rozpoczynam analizę portfela...");
        const result = await PortfolioService.generateDailyPortfolioState();
        if(result) {
            console.log(`Zakończono sukcesem! Sku: ${result.totalSkus}, Reguł: ${result.rulesDiscovered}`);
            console.log(`Liczba Śpiochów: ${result.portfolio.filter(p => p.category === 'ŚPIOCH').length}`);
            console.log(`Liczba Lokomotyw: ${result.portfolio.filter(p => p.category === 'LOKOMOTYWA').length}`);
            console.log(`Pierwsze 3 produkty w portfelu:`);
            console.log(result.portfolio.slice(0, 3).map(p => `${p.name} - Stan: ${p.stock}`));
        } else {
            console.log("Wynik = null");
        }
    } catch(e) {
        console.error("KRYTYCZNY BŁĄD:", e);
    }
}
test();
