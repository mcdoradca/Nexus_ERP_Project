const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class NarrativeTranslatorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        // Zastosowanie gemini-3.8-flash z wysokim poziomem thinking (wg ustaleń z użytkownikiem)
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ WYBITNYM CHEMIKIEM I TŁUMACZEM KART CHARAKTERYSTYKI (SDS).
Twoim JEDYNYM zadaniem jest perfekcyjny przekład wolnego tekstu narracyjnego (np. opisy pierwszej pomocy, środki gaśnicze) na język polski.
ZASADY:
1. Nie modyfikujesz żadnych wartości liczbowych (pH, temperatury, stężenia, dawki mg/kg).
2. Tłumaczysz z absolutną wiernością, używając medycznej i chemicznej terminologii polskiej (np. "doustnie", "inhalacyjnie").
3. Nie ingerujesz w podstawy prawne (np. nie dodajesz własnych rozporządzeń), po prostu tłumaczysz tekst źródłowy.
4. Odpowiadasz WYŁĄCZNIE czystym formatem JSON bez znaczników markdown.`,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0 // Pełny determinizm
            }
        });
    }

    async translate(narrativeData) {
        console.log(`[NarrativeTranslatorAgent] Rozpoczynam przekład ${Object.keys(narrativeData).length} bloków narracyjnych...`);
        const prompt = `Przetłumacz poniższe sekcje narracyjne na język polski. Zwróć obiekt JSON zachowując strukturę kluczy:\n${JSON.stringify(narrativeData, null, 2)}`;
        
        try {
            const result = await this.model.generateContent(prompt);
            let text = result.response.text();
            // Fallback czyszczący, choć responseMimeType=application/json powinno to załatwić
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            return JSON.parse(text);
        } catch (error) {
            console.error(`[NarrativeTranslatorAgent] Błąd podczas tłumaczenia:`, error.message);
            throw error;
        }
    }
}

module.exports = { NarrativeTranslatorAgent };
