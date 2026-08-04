const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function run() {
    try {
        const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
        if (!tokenRecord || !tokenRecord.value) {
            console.error("Token not found in SystemSetting");
            return;
        }
        
        const params = new URLSearchParams();
        params.append('method', 'getInventoryAvailableTextFieldKeys');
        params.append('parameters', JSON.stringify({ inventory_id: 385 }));
        
        const response = await axios.post('https://api.baselinker.com/connector.php', params.toString(), {
            headers: {
                'X-BLToken': tokenRecord.value,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        console.log("Response from BaseLinker:");
        console.log(JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error("Error:", err.response?.data || err.message);
    } finally {
        await prisma.$disconnect();
    }
}
run();
