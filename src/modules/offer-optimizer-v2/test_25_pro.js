require('dotenv').config({ path: '../../../.env' });
const { GoogleGenAI } = require('@google/genai');

async function testGemini25Pro() {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: 'Test connection',
    });
    console.log('SUCCESS:', response.text);
  } catch (error) {
    console.error('API_ERROR_RAW:', error);
  }
}

testGemini25Pro();
