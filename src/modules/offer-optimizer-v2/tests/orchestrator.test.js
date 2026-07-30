const test = require('node:test');
const assert = require('node:assert');
const { Orchestrator } = require('../orchestrator.js');
const aiWrapper = require('../ai.wrapper.js');

test('Orchestrator - HARD FAIL na pustym eu_responsible_person', async (t) => {
    // Mock callAgentWithTelemetry
    const originalCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async () => {
        return {
            usage: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
            result: {
                pipeline_id: "test",
                gtin_ean: "8000137015436",
                compliance_gpsr_clp: {
                    eu_responsible_person: {
                        name: null,
                        address_eu: "",
                        contact: null
                    },
                    sds_required: false
                }
            }
        };
    };

    const orch = new Orchestrator("8000137015436");
    orch.emitState = () => {}; // wycisz zapis logów json
    
    await orch.runPhase1({ name: "mock pim" });

    assert.strictEqual(orch.state.node_status['A1'], 'HALTED_HITL_REQUIRED');
    assert.strictEqual(orch.state.hitl_alert, 'MISSING_EU_RESPONSIBLE_PERSON');
    
    // Restore
    aiWrapper.callAgentWithTelemetry = originalCall;
});
