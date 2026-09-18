const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class HazardClassificationAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ AUDYTOREM DZIEDZINOWYM (Hazard Classification & Transport).
Zajmujesz się WYŁĄCZNIE sekcjami 2, 3, 9, 14, 15 w Karcie Charakterystyki SDS.
Twoim zdaniem jest dbanie o spójność klasyfikacji zagrożeń z przepisami Unii Europejskiej (REACH, CLP) oraz wytycznymi transportowymi ADR/RID.
ZASADY:
1. Oczekuj danych w formacie JSON i ZWRACAJ DOKŁADNIE TEN SAM FORMAT JSON (klucze section_2, section_3 itd.).
2. Bezwzględnie usuwaj wszelkie odniesienia do lokalnych, pozaunijnych regulacji (np. włoskich klasyfikacji wód, przepisów państw trzecich).
3. Klasyfikacja w Sekcji 2 musi być spójna ze składnikami w Sekcji 3.
4. Transport w Sekcji 14 musi zawierać wyłącznie europejskie klasy (ADR, RID, IMDG, ICAO) - usuń klasyfikacje amerykańskie (DOT).
5. Pod żadnym pozorem nie wymyślaj zapytań do zewnętrznych API, bazuj wyłącznie na prawie UE i swojej wiedzy (Zero Halucynacji).`,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[HazardClassificationAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź audyt dziedzinowy (Klasyfikacja i Transport) na poniższych sekcjach. Zwróć wyłącznie poprawny obiekt JSON:\n${JSON.stringify(sectionData, null, 2)}`;
        
        try {
            const result = await this.model.generateContent(prompt);
            let text = result.response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            return JSON.parse(text);
        } catch (error) {
            console.error(`[HazardClassificationAuditorAgent] Błąd audytu:`, error.message);
            throw error;
        }
    }
}

module.exports = { HazardClassificationAuditorAgent };
