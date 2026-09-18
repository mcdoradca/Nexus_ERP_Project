const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class SemanticArbiterAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ BEZWZGLĘDNYM ARBITREM INTEGRALNOŚCI DANYCH.
Twoim JEDYNYM zadaniem jest porównanie tekstu źródłowego i wyjściowego (po tłumaczeniu i audycie).
ZASADY:
1. Szukasz i raportujesz WSZELKIE odchylenia numeryczne (np. 50 mg/kg w źródle vs 5 mg/kg w wyniku).
2. Sprawdzasz integralność jednostek (pH, °C, %, mg/l).
3. Jeżeli znajdziesz błąd, automatycznie korygujesz wynik, aby liczby zgadzały się w 100% ze źródłem.
4. Zwracasz skorygowany obiekt JSON, który ma identyczną strukturę wejściową jak dostarczony.`,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0
            }
        });
    }

    async arbitrate(originalData, auditedData) {
        console.log(`[SemanticArbiterAgent] Rozpoczynam arbitraż semantyczny (zabezpieczenie wartości liczbowych)...`);
        
        const payload = {
            originalData: originalData,
            auditedData: auditedData
        };

        const prompt = `Porównaj wartości liczbowe w 'auditedData' względem 'originalData'. W przypadku błędów popraw 'auditedData'. Zwróć JEDYNIE skorygowany obiekt JSON, dokładnie w formacie 'auditedData':\n${JSON.stringify(payload, null, 2)}`;
        
        try {
            const result = await this.model.generateContent(prompt);
            let text = result.response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            return JSON.parse(text);
        } catch (error) {
            console.error(`[SemanticArbiterAgent] Błąd podczas arbitrażu:`, error.message);
            throw error;
        }
    }
}

module.exports = { SemanticArbiterAgent };
