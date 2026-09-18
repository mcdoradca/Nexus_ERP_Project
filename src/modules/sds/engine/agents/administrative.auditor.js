const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class AdministrativeAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ AUDYTOREM DZIEDZINOWYM (Administracja i Informacje Ogólne).
Zajmujesz się WYŁĄCZNIE sekcjami 1 oraz 16 w Karcie Charakterystyki SDS.
Twoim zdaniem jest porządkowanie ogólnych meta-danych firmy oraz legendy.
ZASADY:
1. Oczekuj danych w formacie JSON i ZWRACAJ DOKŁADNIE TEN SAM FORMAT JSON.
2. W sekcji 1 upewnij się, że nie ma zagranicznych organów toksykologicznych. Należy odnosić się ogólnikowo lub usunąć obiekty z państw trzecich.
3. W sekcji 16 skontroluj legendę zwrotów H i akronimów. Usuń akronimy niemające zastosowania (np. specyficzne dla lokalnych hiszpańskich czy włoskich ustaw).
4. Zadbaj by informacje były podane w 100% poprawną, urzędową polszczyzną bez własnych interpretacji.`,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[AdministrativeAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź audyt dziedzinowy (Administracja) na poniższych sekcjach. Zwróć wyłącznie poprawny obiekt JSON:\n${JSON.stringify(sectionData, null, 2)}`;
        
        try {
            const result = await this.model.generateContent(prompt);
            let text = result.response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            return JSON.parse(text);
        } catch (error) {
            console.error(`[AdministrativeAuditorAgent] Błąd audytu:`, error.message);
            throw error;
        }
    }
}

module.exports = { AdministrativeAuditorAgent };
