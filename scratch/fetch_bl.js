const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const BASELINKER_API_URL = 'https://api.baselinker.com/connector.php';
async function run() {
    const ean = '8000137014507';
    const prisma = new PrismaClient();
    const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
    await prisma.$disconnect();
    const token = tokenRecord ? tokenRecord.value : null;
    const callApi = async (method, parameters = {}) => {
        const params = new URLSearchParams();
        params.append('method', method);
        params.append('parameters', JSON.stringify(parameters));
        const res = await axios.post(BASELINKER_API_URL, params.toString(), {
            headers: { 'X-BLToken': token, 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return res.data;
    };
    try {
        const invRes = await callApi('getInventories');
        let foundProductId = null, foundInventoryId = null;
        for (const invId of invRes.inventories.map(i => i.inventory_id)) {
            const searchRes = await callApi('getInventoryProductsList', { inventory_id: invId, filter_ean: ean });
            const products = Object.values(searchRes.products || {});
            if (products.length > 0) {
                foundProductId = products[0].id; foundInventoryId = invId; break;
            }
        }
        if (!foundProductId) return;
        const dataRes = await callApi('getInventoryProductsData', { inventory_id: foundInventoryId, products: [foundProductId] });
        const product = dataRes.products[foundProductId];
        
        console.log('--- EAN ' + ean + ' ---');
        console.log('PRODUCT TEXT_FIELDS.FEATURES:');
        console.log(JSON.stringify(product.text_fields.features || {}, null, 2));
    } catch (e) {
        console.error('Blad:', e.message);
    }
}
run();
