const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const BaseLinkerService = require('./src/modules/offer-optimizer/baselinker.service.js');

async function test() {
    try {
        const ean = "8002842177119";
        console.log("Szukam w BL ean:", ean);
        const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
        console.log("Znaleziono productId:", productId);
        
        // Zrobmy surowe zapytanie, żeby ominąć formatowanie:
        const axios = require('axios');
        const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
        
        const params = new URLSearchParams();
        params.append('method', 'getInventoryProductsData');
        params.append('parameters', JSON.stringify({
            inventory_id: inventoryId,
            products: [productId]
        }));

        const response = await axios.post('https://api.baselinker.com/connector.php', params.toString(), {
            headers: {
                'X-BLToken': tokenRecord.value,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        const prod = response.data.products[productId];
        console.log("Surowy Producent:", prod.manufacturer);
        console.log("Cale features:");
        console.dir(prod.features, { depth: null });
        console.log("Caly name:", prod.text_fields.name);
        
    } catch (e) {
        console.error(e.message);
    }
}

test();
