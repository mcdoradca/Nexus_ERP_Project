const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function getKeys() {
    try {
        const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
        if (!tokenRecord || !tokenRecord.value) return;
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'X-BLToken': tokenRecord.value };

        let params = new URLSearchParams();
        params.append('method', 'getInventories');
        const invRes = await axios.post('https://api.baselinker.com/connector.php', params.toString(), { headers });
        
        let inventoryId = 1;
        if (invRes.data && invRes.data.inventories && invRes.data.inventories.length > 0) {
            inventoryId = invRes.data.inventories[0].inventory_id;
        }

        params = new URLSearchParams();
        params.append('method', 'getInventoryAvailableTextFieldKeys');
        params.append('parameters', JSON.stringify({ inventory_id: inventoryId })); 
        
        const response = await axios.post('https://api.baselinker.com/connector.php', params.toString(), { headers });
        console.log(`=== KLAWISZE POL (TEXT_FIELDS) DLA INVENTORY ${inventoryId} ===\n`);
        console.log(JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error("Błąd API:", err.message);
    } finally {
        await prisma.$disconnect();
    }
}
getKeys();
