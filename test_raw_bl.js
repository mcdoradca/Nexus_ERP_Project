require('dotenv').config();
const BaseLinkerService = require('./src/modules/offer-optimizer/baselinker.service.js');
const axios = require('axios');
async function run() {
    const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan('8000137014507');
    const res = await axios.post('https://api.baselinker.com/connector.php', new URLSearchParams({
        method: 'getInventoryProductsData',
        parameters: JSON.stringify({ inventory_id: inventoryId, products: [productId] })
    }), {
        headers: { 'X-BLToken': process.env.BASELINKER_TOKEN }
    });
    const prod = res.data.products[productId];
    console.log('FEATURES:', prod.features);
    console.log('FEATURES|PL:', prod['features|pl']);
    console.log('TEXT_FIELDS.FEATURES:', prod.text_fields?.features);
    console.log('TEXT_FIELDS.FEATURES|PL:', prod.text_fields?.['features|pl']);
}
run().catch(console.error);
