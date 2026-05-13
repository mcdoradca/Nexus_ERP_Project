const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
    const blToken = tokenRecord.value;
    
    let allOrders = [];
    let dateFrom = Math.floor(Date.now() / 1000) - (365 * 24 * 60 * 60);
    
    const fetchParams = new URLSearchParams({
        method: 'getOrders',
        parameters: JSON.stringify({ date_from: dateFrom })
    });

    try {
        const response = await axios.post('https://api.baselinker.com/connector.php', fetchParams.toString(), {
            headers: { 'X-BLToken': blToken, 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log("Status:", response.data.status);
        if (response.data.orders) {
            console.log("Orders fetched:", response.data.orders.length);
            const statuses = [...new Set(response.data.orders.map(o => o.order_status_id))];
            console.log("Unique statuses in these orders:", statuses);
        }
    } catch (err) {
        console.error(err.message);
    }
}
test().finally(() => prisma.$disconnect());
