require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testModel(modelName) {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'fake-key');
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent("Test prompt");
        console.log(`Success for ${modelName}`);
    } catch (e) {
        console.error(`Error for ${modelName}:`, e.message);
    }
}

async function run() {
    console.log("Testing gemini-3-pro-image");
    await testModel("gemini-3-pro-image");
    console.log("Testing gemini-3.1-pro-preview-customtools");
    await testModel("gemini-3.1-pro-preview-customtools");
}

run();
