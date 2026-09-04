require('dotenv').config();
const { GoogleGenAI, ThinkingLevel } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function runTest() {
    try {
        console.log("Test: Agent 11 Config (ThinkingLevel + Temperature)");
        const response = await ai.models.generateContent({
            model: 'gemini-3.7-flash',
            contents: 'Test',
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                temperature: 0.8
            }
        });
        console.log("SUKCES!", response.text.substring(0, 50));
    } catch (e) {
        console.log("BŁĄD:", e.message, "Status:", e.status);
    }
}
runTest();
