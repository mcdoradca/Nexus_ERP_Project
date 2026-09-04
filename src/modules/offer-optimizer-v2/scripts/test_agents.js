require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { callAgentWithTelemetry, ThinkingLevel } = require('./ai.wrapper.js');

async function runTests() {
    console.log("=== Rozpoczęcie testów E1 ===");
    try {
        console.log("\n1. Test węzła Flash (MINIMAL)");
        const flashResult = await callAgentWithTelemetry({
            agentId: 'TestFlashNode',
            model: 'gemini-3.7-flash',
            thinkingLevel: ThinkingLevel.LOW,
            prompt: 'Opisz w dwóch zdaniach dlaczego niebo jest niebieskie.'
        });
        console.log("Usage Metadata (Flash):", JSON.stringify(flashResult.usage, null, 2));

        console.log("\n2. Test węzła Pro (HIGH)");
        const proResult = await callAgentWithTelemetry({
            agentId: 'TestProNode',
            model: 'gemini-3.1-pro-preview',
            thinkingLevel: ThinkingLevel.HIGH,
            prompt: 'Przeprowadź krótki wywód logiczny na temat zjawiska Rayleigha.'
        });
        console.log("Usage Metadata (Pro):", JSON.stringify(proResult.usage, null, 2));

    } catch (e) {
        console.error("Błąd podczas testów:", e);
    }
}

runTests();
