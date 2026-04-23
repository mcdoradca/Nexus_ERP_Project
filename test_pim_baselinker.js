require('dotenv').config();
const BaseLinkerService = require('./src/modules/offer-optimizer/baselinker.service');

async function testPim() {
    try {
        const ean = process.argv[2] || "1234567890123"; // Wpisz prawdziwy EAN przy uruchamianiu
        console.log(`[TEST] Rozpoczynam pobieranie danych dla EAN: ${ean}`);
        
        console.log(`[Etap 1] Szukam ID...`);
        const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
        console.log(`Znaleziono! Magazyn: ${inventoryId}, Produkt: ${productId}`);

        console.log(`[Etap 2] Dekompozycja głębokich danych...`);
        const data = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
        
        console.log("SUKCES! Pobrane dane PIM:");
        console.log(JSON.stringify(data, null, 2));

    } catch (err) {
        console.error("BŁĄD:", err.message);
    }
}

testPim();
