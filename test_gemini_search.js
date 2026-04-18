require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function testSearch() {
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-3.1-pro-preview',
      tools: [{ googleSearch: {} }] 
    });

    const result = await model.generateContent('Znajdź mi profil instagramowy i link do głównego awatara dla Robert Lewandowski w roku 2024. Zwróć to w JSON: {"ig_url": "", "avatar_url": "", "followers": 0}');
    console.log(result.response.text());
  } catch (err) {
    console.error("Error:", err);
  }
}
testSearch();
