const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
    const data = await response.json();
    console.log("DOSTĘPNE MODELE:");
    data.models.forEach(m => {
        if (m.name.includes('gemini')) {
            console.log(m.name, m.supportedGenerationMethods);
        }
    });
  } catch (err) {
    console.error(err);
  }
}
listModels();
