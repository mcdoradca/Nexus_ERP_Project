const { Orchestrator } = require('./src/modules/offer-optimizer-v2/orchestrator.js');
const fs = require('fs');

async function runLive() {
    const orch = new Orchestrator("8000137015436");
    await orch.runPhase1();
    
    fs.writeFileSync('orch_state_live_29.json', JSON.stringify(orch.state, null, 2));
    console.log("Zapisano orch_state_live_29.json");
}

runLive().catch(console.error);
