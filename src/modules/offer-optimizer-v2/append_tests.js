const fs = require('fs');

const tests = `
test('Orchestrator - A4 nie jest wołany przy chemical_route === false', async (t) => {
    const originalCall = require('../ai.wrapper.js').callAgentWithTelemetry;
    let a4Called = false;
    const orch = new (require('../orchestrator.js').Orchestrator)('8000137015436');
    require('../ai.wrapper.js').callAgentWithTelemetry = async (opts) => {
        if (opts.agentId === "1") return { result: { country_of_origin: "IT", research_sources_used: [] }, usage: {} };
        if (opts.agentId === "2") {
            orch.state.chemical_route = false;
            return { result: { sentiment_available: true, total_reviews_analyzed: 10, average_rating: 5, social_proof_matrix: {}, safety_signals_detected: [], scraped_sources: [] }, usage: {} };
        }
        if (opts.agentId === "4") { a4Called = true; return { result: {}, usage: {} }; }
    };
    orch.emitState = () => {}; 
    await orch.runPhase1();
    require('node:assert').strictEqual(a4Called, false);
    require('node:assert').strictEqual(orch.state.node_status['A4'], 'SKIPPED');
    require('../ai.wrapper.js').callAgentWithTelemetry = originalCall;
});

test('Orchestrator - A4 składnik spoza RAG daje UNKNOWN_INGREDIENT_NEEDS_LOOKUP', async (t) => {
    const baselinkerExtract = require('../baselinker.extract.js');
    const originalExtract = baselinkerExtract.extractFromFeatures;
    baselinkerExtract.extractFromFeatures = (p) => {
        const res = originalExtract(p);
        res.inci.value = "FakeIngredient";
        return res;
    };
    const originalCall = require('../ai.wrapper.js').callAgentWithTelemetry;
    require('../ai.wrapper.js').callAgentWithTelemetry = async (opts) => {
        if (opts.agentId === "1") return { result: { country_of_origin: "IT", research_sources_used: [] }, usage: {} };
        if (opts.agentId === "2") return { result: { sentiment_available: true, total_reviews_analyzed: 10, average_rating: 5, social_proof_matrix: {}, safety_signals_detected: [], scraped_sources: [] }, usage: {} };
        if (opts.agentId === "4") return { result: { category_type: "COSMETICS_BEAUTY", technical_benefits_aeo: [], detected_synergies: [], mandatory_clp_warnings: null }, usage: {} };
    };
    const orch = new (require('../orchestrator.js').Orchestrator)('8000137015436');
    orch.emitState = () => {}; 
    await orch.runPhase1();
    require('node:assert').ok(orch.state.normalization_warnings.includes('UNKNOWN_INGREDIENT_NEEDS_LOOKUP: FakeIngredient'));
    require('../ai.wrapper.js').callAgentWithTelemetry = originalCall;
    baselinkerExtract.extractFromFeatures = originalExtract;
});

test('Orchestrator - A4 odrzucenie pól i ucięcie limitów oraz mandatory_clp_warnings wymuszone na null', async (t) => {
    const originalCall = require('../ai.wrapper.js').callAgentWithTelemetry;
    require('../ai.wrapper.js').callAgentWithTelemetry = async (opts) => {
        if (opts.agentId === "1") return { result: { country_of_origin: "IT", research_sources_used: [] }, usage: {} };
        if (opts.agentId === "2") return { result: { sentiment_available: true, total_reviews_analyzed: 10, average_rating: 5, social_proof_matrix: {}, safety_signals_detected: [], scraped_sources: [] }, usage: {} };
        if (opts.agentId === "4") return { result: { 
            category_type: "COSMETICS_BEAUTY", 
            technical_benefits_aeo: ['Z'.repeat(3000)], 
            detected_synergies: ['1','2','3','4','5'], 
            mandatory_clp_warnings: ['H319'],
            invalid_field: "reject"
        }, usage: {} };
    };
    const orch = new (require('../orchestrator.js').Orchestrator)('8000137015436');
    orch.emitState = () => {}; 
    await orch.runPhase1();
    require('node:assert').strictEqual(orch.state.a4_result.mandatory_clp_warnings, null);
    require('node:assert').strictEqual(orch.state.a4_result.invalid_field, undefined);
    require('node:assert').strictEqual(orch.state.a4_result.detected_synergies.length, 4);
    require('node:assert').ok(orch.state.normalization_warnings.includes('A4_FIELD_REJECTED: invalid_field'));
    require('node:assert').ok(orch.state.normalization_warnings.includes('A4_LIMIT_TRUNCATED: technical_benefits_aeo'));
    require('node:assert').ok(orch.state.normalization_warnings.includes('A4_LIMIT_TRUNCATED: detected_synergies'));
    require('node:assert').ok(orch.state.normalization_warnings.includes('A4_CLP_WITHOUT_SOURCE'));
    require('../ai.wrapper.js').callAgentWithTelemetry = originalCall;
});

test('Orchestrator - INVALID_SOURCE_DOMAIN przy złej domenie', async (t) => {
    const originalCall = require('../ai.wrapper.js').callAgentWithTelemetry;
    require('../ai.wrapper.js').callAgentWithTelemetry = async (opts) => {
        if (opts.agentId === "1") return { result: { country_of_origin: "IT", research_sources_used: ["http://test.com", "nie.domena"] }, usage: {} };
        if (opts.agentId === "2") return { result: { sentiment_available: true, total_reviews_analyzed: 10, average_rating: 5, social_proof_matrix: {}, safety_signals_detected: [], scraped_sources: ["brak.kropki", "dobradomena.pl"] }, usage: {} };
        if (opts.agentId === "4") return { result: { category_type: "COSMETICS_BEAUTY", technical_benefits_aeo: [], detected_synergies: [], mandatory_clp_warnings: null }, usage: {} };
    };
    const orch = new (require('../orchestrator.js').Orchestrator)('8000137015436');
    orch.emitState = () => {}; 
    await orch.runPhase1();
    require('node:assert').ok(orch.state.normalization_warnings.includes('INVALID_SOURCE_DOMAIN: nie.domena'));
    require('node:assert').ok(orch.state.normalization_warnings.includes('INVALID_SOURCE_DOMAIN: brak.kropki'));
    require('../ai.wrapper.js').callAgentWithTelemetry = originalCall;
});
`;
fs.appendFileSync('./tests/orchestrator.test.js', tests);
