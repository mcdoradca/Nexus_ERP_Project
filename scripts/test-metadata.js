require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function test() {
    const model = genAI.getGenerativeModel({ 
        model: "gemini-3.1-pro-preview",
        generationConfig: { temperature: 0.0, topP: 0.1, responseMimeType: "application/json" }
    });
    const prompt = "Zwróć mi JSON z losowym słowem: { \"slowo\": \"...\" }";
    const result = await model.generateContent(prompt);
    console.log("METADATA:", JSON.stringify(result.response.usageMetadata, null, 2));
}

test().catch(console.error);
