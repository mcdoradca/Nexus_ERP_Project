const { Orchestrator } = require('./src/modules/offer-optimizer-v2/orchestrator.js');
async function run() {
    try {
        const o = new Orchestrator('8000137015436');
        await o.runPhase1({});
        console.log("Success:", o.state.next_action);
        console.log(JSON.stringify(o.state.a1_result, null, 2));
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
