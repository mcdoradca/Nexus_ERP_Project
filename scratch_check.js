require('dotenv').config();
const BaseLinkerService = require('./src/modules/offer-optimizer/baselinker.service');

async function checkRealData() {
    try {
        console.log("--- ROZPOCZYNAM ZWIAD W BASELINKERZE ---");
        const invId = await BaseLinkerService.getInventories();
        console.log("✅ Znaleziono domyślny katalog (Inventory ID):", invId);
        
        const inventoryRes = await BaseLinkerService.rawCall('getInventoryProductsList', { inventory_id: invId });
        
        if (!inventoryRes.products) {
            console.log("❌ Brak produktów w katalogu.");
            return;
        }

        const products = Object.values(inventoryRes.products);
        console.log(`\n✅ Pobrano dokładnie: ${products.length} SKU z Twojego BaseLinkera.`);
        
        let stockZero = 0;
        let stockPositive = 0;
        let maxStock = 0;
        let maxStockName = '';

        products.forEach(p => {
             const stock = parseInt(p.quantity || p.stock || 0, 10);
             if (stock === 0) stockZero++;
             else stockPositive++;

             if (stock > maxStock) {
                 maxStock = stock;
                 maxStockName = p.name;
             }
        });

        console.log(`\n--- STATYSTYKI MAGAZYNOWE ---`);
        console.log(`Towary na wyczerpaniu/zerowe (0 szt.): ${stockZero} SKU`);
        console.log(`Towary dostępne na stanie (>0 szt.): ${stockPositive} SKU`);
        console.log(`Produkt o największym zapasie to "${maxStockName}" (Sztuk: ${maxStock})`);
        
    } catch (e) {
        console.error("Błąd API BaseLinkera:", e.message);
    }
}

checkRealData();
