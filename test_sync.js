const { syncReturnsFromBaselinker } = require('./src/modules/rma/rma.service');

async function runTest() {
    console.log('[TEST] Uruchamianie synchronizacji historycznej...');
    const daysBack = 365;
    const forceDateFrom = Math.floor(Date.now() / 1000) - (daysBack * 24 * 60 * 60);
    
    await syncReturnsFromBaselinker(forceDateFrom);
    
    console.log('[TEST] Zakończono proces.');
    process.exit(0);
}

runTest();
