const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
    const blToken = tokenRecord.value;
    
    const fetchParams = new URLSearchParams({
        method: 'getOrderStatusList',
        parameters: JSON.stringify({})
    });

    const response = await axios.post('https://api.baselinker.com/connector.php', fetchParams.toString(), {
        headers: { 'X-BLToken': blToken, 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log("Statuses:");
    if (response.data.statuses) {
        response.data.statuses.forEach(s => console.log(`[${s.id}] ${s.name}`));
    }
}
test().finally(() => prisma.$disconnect());
