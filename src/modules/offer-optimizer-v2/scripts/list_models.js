require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function run() {
    try {
        const response = await ai.models.list(); // Returns an iterator or array in the new SDK?
        let models = [];
        // New SDK is probably async iterable
        if (response && typeof response[Symbol.asyncIterator] === 'function') {
            for await (const model of response) {
                models.push(model);
            }
        } else if (Array.isArray(response)) {
             models = response;
        } else if (response.models) {
             models = response.models;
        } else {
             console.log("Nieznany format zwracany przez ai.models.list():", response);
        }
        
        console.log(JSON.stringify(models, null, 2));
    } catch(err) {
        console.error(err);
    }
}
run();
