require('dotenv').config({ path: './.env' });
const sentinelService = require('./src/modules/campaigns/sentinel.service');

async function triggerSentinel() {
    console.log("Ręczne wywołanie Agenta Sentinel (Wydawcy)...");
    await sentinelService.runSentinelOptimization();
    console.log("Zakończono wywołanie.");
    process.exit(0);
}

triggerSentinel();
