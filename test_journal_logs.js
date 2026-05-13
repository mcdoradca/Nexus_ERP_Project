const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
    const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
    const blToken = tokenRecord.value;
    
    const fetchParams = new URLSearchParams({
        method: 'getJournalList',
        parameters: JSON.stringify({ last_log_id: 50000000 }) // start from some high id to get recent?
    });

    try {
        const response = await axios.post('https://api.baselinker.com/connector.php', fetchParams.toString(), {
            headers: { 'X-BLToken': blToken, 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        console.log("Status:", response.data.status);
        if (response.data.logs) {
            console.log("Logs fetched:", response.data.logs.length);
            if (response.data.logs.length > 0) {
                const uniqueLogTypes = [...new Set(response.data.logs.map(l => l.log_type))];
                console.log("Unique log types in this batch:", uniqueLogTypes);
            }
        }
    } catch (err) {
        console.error(err.message);
    }
}
test().finally(() => prisma.$disconnect());
