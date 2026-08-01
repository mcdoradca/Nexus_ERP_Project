const fs = require('fs');

const code = `
test('Orchestrator - Trasa v2 (boolean + reasons) oraz brak sds_required', async (t) => {
    const orch = new Orchestrator("8000137015436");
    orch.emitState = () => {}; 
    await orch.runPhase1();
    assert.strictEqual(typeof orch.state.chemical_route, 'boolean');
    assert.ok(Array.isArray(orch.state.chemical_route_reasons));
    assert.ok(orch.state.chemical_route_reasons.includes('SDS_STATUS_UNKNOWN'));
});

test('Orchestrator - A2 odrzuca gtin_ean i pipeline_id', async (t) => {
    const originalCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async (opts) => {
        if (opts.agentId === "1") return { result: { country_of_origin: "IT", research_sources_used: [] }, usage: {} };
        if (opts.agentId === "2") return { result: { gtin_ean: "9999", pipeline_id: "XX", sentiment_available: true, safety_signals_detected: [], scraped_sources: [], total_reviews_analyzed: 10, average_rating: 5, social_proof_matrix: {} }, usage: {} };
    };
    const orch = new Orchestrator("8000137015436");
    orch.emitState = () => {}; 
    await orch.runPhase1();
    assert.strictEqual(orch.state.a2_result.gtin_ean, undefined);
    assert.strictEqual(orch.state.a2_result.pipeline_id, undefined);
    assert.ok(orch.state.normalization_warnings.includes('A2_FIELD_REJECTED: gtin_ean'));
    aiWrapper.callAgentWithTelemetry = originalCall;
});

test('Orchestrator - A2 ucina nadmiarowe pozycje z tablic', async (t) => {
    const originalCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async (opts) => {
        if (opts.agentId === "1") return { result: { country_of_origin: "IT", research_sources_used: [] }, usage: {} };
        if (opts.agentId === "2") return { 
            result: { 
                sentiment_available: true, total_reviews_analyzed: 10, average_rating: 5,
                social_proof_matrix: {
                    raw_customer_delights: ['1','2','3','4','5','6'],
                    real_life_use_cases: ['1','2','3','4','5'],
                    competitor_pain_points_eliminated: ['1','2','3','4','5'],
                    authentic_minor_flaws: ['1','2','3']
                },
                safety_signals_detected: ['A', 'B', 'C', 'D'], scraped_sources: ['a','b','c','d','e','f','g']
            }, usage: {} 
        };
    };
    const orch = new Orchestrator("8000137015436");
    orch.emitState = () => {}; 
    await orch.runPhase1();
    assert.strictEqual(orch.state.a2_result.social_proof_matrix.raw_customer_delights.length, 5);
    assert.strictEqual(orch.state.a2_result.scraped_sources.length, 6);
    assert.strictEqual(orch.state.a2_result.safety_signals_detected.length, 3);
    assert.ok(orch.state.normalization_warnings.includes('A2_LIMIT_TRUNCATED: raw_customer_delights'));
    assert.ok(orch.state.normalization_warnings.includes('A2_LIMIT_TRUNCATED: safety_signals_detected'));
    aiWrapper.callAgentWithTelemetry = originalCall;
});

test('Orchestrator - A2 HALT przy safety_signals_detected', async (t) => {
    const originalCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async (opts) => {
        if (opts.agentId === "1") return { result: { country_of_origin: "IT", research_sources_used: [] }, usage: {} };
        if (opts.agentId === "2") return { 
            result: { 
                sentiment_available: true, total_reviews_analyzed: 10, average_rating: 5,
                social_proof_matrix: {},
                safety_signals_detected: ['Alergia!'], scraped_sources: []
            }, usage: {} 
        };
    };
    const orch = new Orchestrator("8000137015436");
    orch.emitState = () => {}; 
    await orch.runPhase1();
    assert.strictEqual(orch.state.node_status['A2'], 'HALTED_HITL_REQUIRED');
    assert.strictEqual(orch.state.hitl_alert, 'SAFETY_SIGNAL_IN_REVIEWS');
    assert.strictEqual(orch.state.next_action, 'HALT');
    aiWrapper.callAgentWithTelemetry = originalCall;
});

test('Orchestrator - A2 idzie dalej przy sentiment_available = false', async (t) => {
    const originalCall = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async (opts) => {
        if (opts.agentId === "1") return { result: { country_of_origin: "IT", research_sources_used: [] }, usage: {} };
        if (opts.agentId === "2") return { 
            result: { 
                sentiment_available: false, total_reviews_analyzed: 0, average_rating: 0,
                social_proof_matrix: {}, safety_signals_detected: [], scraped_sources: []
            }, usage: {} 
        };
    };
    const orch = new Orchestrator("8000137015436");
    orch.emitState = () => {}; 
    await orch.runPhase1();
    assert.strictEqual(orch.state.node_status['A2'], 'OK');
    assert.strictEqual(orch.state.next_action, 'RUN_A3');
    aiWrapper.callAgentWithTelemetry = originalCall;
});
`;

fs.appendFileSync('./src/modules/offer-optimizer-v2/tests/orchestrator.test.js', code);
