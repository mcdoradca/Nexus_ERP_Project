require('dotenv').config();
const { GoogleGenAI, ThinkingLevel } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function runTests() {
    console.log("Rozpoczynam testy API z serwera...");

    // Test 1: Baza (zwykły model)
    try {
        await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: 'Hello'
        });
        console.log("✅ TEST 1 (Zwykły model): OK");
    } catch (e) {
        console.error("❌ TEST 1 BŁĄD:", e.message);
    }

    // Test 2: ThinkingLevel
    try {
        await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: 'Hello',
            config: {
                thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM }
            }
        });
        console.log("✅ TEST 2 (Z ThinkingLevel): OK");
    } catch (e) {
        console.error("❌ TEST 2 BŁĄD:", e.message);
    }

    // Test 3: Grounding (Google Search)
    try {
        await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: 'Hello',
            config: {
                tools: [{ googleSearch: {} }]
            }
        });
        console.log("✅ TEST 3 (Z Google Search): OK");
    } catch (e) {
        console.error("❌ TEST 3 BŁĄD:", e.message);
    }
    
    // Test 4: Schema
    try {
        await ai.models.generateContent({
            model: 'gemini-3.5-flash',
            contents: 'Odpisz 1',
            config: {
                responseMimeType: "application/json",
                responseSchema: { type: "OBJECT", properties: { num: { type: "INTEGER" } } }
            }
        });
        console.log("✅ TEST 4 (Z responseSchema): OK");
    } catch (e) {
        console.error("❌ TEST 4 BŁĄD:", e.message);
    }
}

runTests();
