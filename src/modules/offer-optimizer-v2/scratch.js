require('dotenv').config({ path: '../../../.env' });
const fs = require('fs');
const path = require('path');
const aiWrapper = require('./ai.wrapper.js');

async function testAgent1() {
    const promptTemplate = fs.readFileSync(path.join(__dirname, 'docs', 'Agent_1_prompt_v4.md'), 'utf8');
    const agentData = { gtin_ean: "8000137014507" }; // Nowy EAN
    const prompt = promptTemplate.replace('{{SKU_DATA}}', JSON.stringify(agentData, null, 2));

    const schema = {
        type: "object",
        properties: {
            country_of_origin: { type: "string" },
            extracted_inci_candidates: { type: "array", items: { type: "array", items: { type: "string" } } },
            eu_responsible_person: { type: "object" },
            logistics: { type: "object" },
            compliance: { type: "object" },
            missing_parameters: { type: "object" },
            research_sources_used: { type: "array", items: { type: "string" } }
        }
    };

    try {
        console.log("Calling Agent 1...");
        const result = await aiWrapper.callAgentWithTelemetry({
            agentId: "1",
            prompt: prompt,
            schema: schema
        });
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
    }
}
testAgent1();
