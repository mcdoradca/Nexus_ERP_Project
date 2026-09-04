require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "dummy");

async function testFlash() {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.7-flash",
            generationConfig: { thinkingConfig: { thinkingLevel: "minimal" } }
        });
        const result = await model.generateContent("Say hello");
        console.log("Flash Minimal Success:", result.response.usageMetadata);
    } catch (e) {
        console.error("Flash Minimal Error:", e.message);
    }
}

async function testPro() {
    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-3.1-pro-preview",
            generationConfig: { thinkingConfig: { thinkingLevel: "low" } }
        });
        const result = await model.generateContent("Say hello");
        console.log("Pro Low Success:", result.response.usageMetadata);
    } catch (e) {
        console.error("Pro Low Error:", e.message);
    }
}

(async () => {
    await testFlash();
    await testPro();
})();
