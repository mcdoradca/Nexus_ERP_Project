require('dotenv').config();
const BaseLinkerService = require('./src/modules/offer-optimizer/baselinker.service');

async function test() {
    try {
        const invId = await BaseLinkerService.getInventories();
        console.log("Inventory ID:", invId);
        
        const res = await BaseLinkerService.rawCall('getInventoryProductsList', { inventory_id: invId });
        const products = Object.values(res.products);
        
        console.log("\n--- Struktura pierwszego produktu ---");
        console.log(products[0]);
        
    } catch(e) {
        console.error(e);
    }
}
test();
