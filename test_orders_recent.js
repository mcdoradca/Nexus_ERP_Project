const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
    const blToken = tokenRecord.value;
    
    const fetchParams = new URLSearchParams({
        method: 'getOrders',
        parameters: JSON.stringify({ date_from: Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60) })
    });

    try {
        const response = await axios.post('https://api.baselinker.com/connector.php', fetchParams.toString(), {
            headers: { 'X-BLToken': blToken, 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log("Status:", response.data.status);
        if (response.data.orders) {
            console.log("Orders fetched:", response.data.orders.length);
        }
    } catch (err) {
        console.error(err.message);
    }
}
test().finally(() => prisma.$disconnect());
