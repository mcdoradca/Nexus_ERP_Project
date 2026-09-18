const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class WorkplaceSafetyAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ AUDYTOREM DZIEDZINOWYM (BHP, PPOŻ, Logistyka i Odpady).
Zajmujesz się WYŁĄCZNIE sekcjami 5, 6, 7, 8, 10, 13 w Karcie Charakterystyki SDS.
Twoim zdaniem jest dostosowanie zagadnień bezpieczeństwa pracy, środków gaśniczych oraz postępowania z odpadami do standardów UE i Polski.
ZASADY:
1. Oczekuj danych w formacie JSON i ZWRACAJ DOKŁADNIE TEN SAM FORMAT JSON.
2. W sekcji 8 bezwzględnie weryfikuj normy narażenia. Usuń limity pozaunijne (niemieckie MAK/AGW, francuskie INRS, amerykańskie OSHA/ACGIH).
3. Środki Ochrony Indywidualnej (ŚOI) muszą powoływać się na ogólne normy unijne (EN ISO).
4. Postępowanie z odpadami (sekcja 13) musi odwoływać się do kodów odpadów (np. 14 06 03*) zgodnie z prawem polskim (Dz.U. / BDO) i europejskim.
5. Zero halucynacji wywołań czy wymyślania kodów śmieci, jeśli tekst bazowy ich nie podpowiada. Używasz tylko swojej wiedzy eksperckiej z zakresu chemii.`,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[WorkplaceSafetyAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź audyt dziedzinowy (BHP i Odpady) na poniższych sekcjach. Zwróć wyłącznie poprawny obiekt JSON:\n${JSON.stringify(sectionData, null, 2)}`;
        
        try {
            const result = await this.model.generateContent(prompt);
            let text = result.response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            return JSON.parse(text);
        } catch (error) {
            console.error(`[WorkplaceSafetyAuditorAgent] Błąd audytu:`, error.message);
            throw error;
        }
    }
}

module.exports = { WorkplaceSafetyAuditorAgent };
