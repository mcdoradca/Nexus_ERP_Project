const fs = require('fs');
const { Orchestrator } = require('./src/modules/offer-optimizer-v2/orchestrator.js');
const aiWrapper = require('./src/modules/offer-optimizer-v2/ai.wrapper.js');

(async () => {
    console.log("=== KROK 4: PRZEBIEG NA ŻYWO (Equilibra) ===");
    const o = new Orchestrator("8000137015436");
    // Bez mocka API wywoła Gemini w module aiWrapper.callAgentWithTelemetry
    o.emitState = () => {};
    await o.runPhase1();
    fs.writeFileSync('orch_state_live.json', JSON.stringify(o.state, null, 2));

    console.log("=== KROK 4: Zachowania Brzegowe (MOCK HALT) ===");
    const mockHalt = new Orchestrator("8000137015436");
    mockHalt.emitState = () => {};
    const orig = aiWrapper.callAgentWithTelemetry;
    aiWrapper.callAgentWithTelemetry = async (opts) => {
        if (opts.agentId === "1") return { usage: {}, result: { country_of_origin: "IT", research_sources_used: [] } };
        if (opts.agentId === "2") return {
            usage: {}, result: {
                sentiment_available: true, total_reviews_analyzed: 10, average_rating: 4.5,
                social_proof_matrix: {}, safety_signals_detected: ['Redness and burning', 'Allergy', 'Swelling', 'Itching'],
                scraped_sources: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], pipeline_id: 'XX'
            }
        };
    };
    await mockHalt.runPhase1();
    fs.writeFileSync('orch_state_mock_halt.json', JSON.stringify(mockHalt.state, null, 2));

    console.log("=== KROK 4: Zachowania Brzegowe (MOCK SENTIMENT FALSE) ===");
    const mockSent = new Orchestrator("8000137015436");
    mockSent.emitState = () => {};
    aiWrapper.callAgentWithTelemetry = async (opts) => {
        if (opts.agentId === "1") return { usage: {}, result: { country_of_origin: "IT", research_sources_used: [] } };
        if (opts.agentId === "2") return {
            usage: {}, result: {
                sentiment_available: false, total_reviews_analyzed: 0, average_rating: 0,
                social_proof_matrix: {}, safety_signals_detected: [],
                scraped_sources: []
            }
        };
    };
    await mockSent.runPhase1();
    fs.writeFileSync('orch_state_mock_sent.json', JSON.stringify(mockSent.state, null, 2));
    
    // Testy
    console.log("Gotowe. Generuję dump.");
})();
