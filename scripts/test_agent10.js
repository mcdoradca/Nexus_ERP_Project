require('dotenv').config();
const AiService = require('../src/modules/offer-optimizer/ai.service');

async function test() {
    const finalPayload = { title: "Test Title", features: { "Waga": "1kg" } };
    const originalPimData = { name: "Test PIM", parameters: {} };
    
    // Nadpiszemy logUsage żeby zobaczyć co dokładnie dostaje
    const AiMetricsService = require('../src/core/ai.metrics.service');
    const originalLogUsage = AiMetricsService.logUsage;
    AiMetricsService.logUsage = async function(agentId, modelName, usageMetadata, isSuccess, attemptNumber) {
        console.log("=== PRZECHWYCONE LOG USAGE ===");
        console.log("agentId:", agentId);
        console.log("usageMetadata RAW:", usageMetadata);
        console.log("thoughtsTokenCount extracted:", usageMetadata?.thoughtsTokenCount);
        return originalLogUsage.apply(this, arguments);
    };

    console.log("Uruchamiam Agent_10_Sentinel...");
    await AiService.runNode10_Sentinel(finalPayload, originalPimData);
}

test().catch(console.error);
