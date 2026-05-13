const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
    const blToken = tokenRecord.value;
    
    const fetchParams = new URLSearchParams({
        method: 'getOrders',
        parameters: JSON.stringify({ status_id: 135966 }) // Zwrot - przedpłata
    });

    const response = await axios.post('https://api.baselinker.com/connector.php', fetchParams.toString(), {
        headers: { 'X-BLToken': blToken, 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log("Orders with status 135966:", response.data.orders ? response.data.orders.length : 0);
    
    if (response.data.orders && response.data.orders.length > 0) {
        console.log("Sample order source:", response.data.orders[0].order_source);
    }
}
test().finally(() => prisma.$disconnect());
