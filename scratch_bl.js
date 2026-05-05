const BaseLinkerService = require('./src/modules/offer-optimizer/baselinker.service');
const { PrismaClient } = require('@prisma/client');

async function testEan() {
    const ean = "8809822540518";
    console.log(`Pobieranie danych dla EAN: ${ean}`);
    try {
        const prisma = new PrismaClient();
        let productData = await prisma.product.findFirst({ where: { ean }, include: { brand: true } });
        console.log('--- LOCAL PIM DATA ---');
        console.log(productData);

        console.log('--- BASELINKER DATA ---');
        const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
        const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
        console.log(deepData);
        
        console.log('--- EXTRACTED BRAND ---');
        console.log(deepData.manufacturer);
    } catch (e) {
        console.error("Błąd:", e.message);
    }
}

testEan();
