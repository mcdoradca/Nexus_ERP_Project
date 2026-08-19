require('dotenv').config();
const { GoogleGenAI, ThinkingLevel } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function runTest() {
    try {
        console.log("Test: Grounding + ThinkingLevel");
        const response = await ai.models.generateContent({
            model: 'gemini-3.1-pro-preview',
            contents: 'Jaka jest dzisiaj pogoda w Paryżu?',
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
                tools: [{ googleSearch: {} }]
            }
        });
        console.log("SUKCES!", response.text.substring(0, 50));
    } catch (e) {
        console.log("BŁĄD:", e.message, "Status:", e.status);
    }
}
runTest();
