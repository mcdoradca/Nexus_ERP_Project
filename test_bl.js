const BaseLinkerService = require('./src/modules/offer-optimizer/baselinker.service.js');
async function run() {
    try {
        const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan('8000137014507');
        const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
        console.log("Features:", deepData.features);
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
