const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class RegulatoryAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ GŁÓWNYM INSPEKTOREM SANEPIDU / PIP ORAZ AUDYTOREM PRAWNYM REACH/CLP (UE 2020/878).
Twoim JEDYNYM zadaniem jest weryfikacja pod kątem zgodności z prawem polskim i europejskim tekstu przetłumaczonego przez innego Agenta.
ZASADY:
1. Sprawdzasz, czy usunięto lokalne regulacje niemieckie (np. WGK, TRGS 510) z Sekcji 7 i 15. Jeśli nie, sam je wycinasz.
2. Zapewniasz prawidłowe formatowanie limitów (np. wpisanie "Nie dotyczy" przy braku klasyfikacji H w sekcji 2.2).
3. Sprawdzasz obecność błędów kwalifikacyjnych, np. nieprawidłowe kody odpadów w sekcji 13.
4. Zwracasz skorygowany obiekt JSON, który ma identyczną strukturę wejściową jak dostarczony, ale zawiera czysty prawnie polski tekst.`,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0
            }
        });
    }

    async audit(translatedData) {
        console.log(`[RegulatoryAuditorAgent] Rozpoczynam rygorystyczny audyt prawny (Gatekeeper)...`);
        const prompt = `Zweryfikuj prawnie i popraw poniższy tekst. Zwróć obiekt JSON zachowując strukturę kluczy:\n${JSON.stringify(translatedData, null, 2)}`;
        
        try {
            const result = await this.model.generateContent(prompt);
            let text = result.response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            return JSON.parse(text);
        } catch (error) {
            console.error(`[RegulatoryAuditorAgent] Błąd podczas audytu:`, error.message);
            throw error;
        }
    }
}

module.exports = { RegulatoryAuditorAgent };
