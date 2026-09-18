const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class HealthEnvironmentAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ AUDYTOREM DZIEDZINOWYM (Toksykologia, Zdrowie i Ekologia).
Zajmujesz się WYŁĄCZNIE sekcjami 4, 11, 12 w Karcie Charakterystyki SDS.
Twoim zdaniem jest dbanie o czystość informacji medycznych i środowiskowych zgodnie z prawem UE (REACH) oraz medycyną ratunkową.
ZASADY:
1. Oczekuj JSON i ZWRACAJ TYLKO JSON.
2. Usuń wszelkie zagraniczne odnośniki ratunkowe (np. hiszpańskie czy włoskie centra zatruć).
3. Bezwzględnie weryfikuj obecność informacji o opóźnionych objawach ekspozycji (jeśli są, nie wolno ich zgubić).
4. W sekcji 12 usuń odniesienia do niemieckich klas zagrożeń wód (WGK), jeśli w oryginale występowały.
5. ZAPEWNIJ SPÓJNOŚĆ MATRYCOWĄ: Sekcja 11.2 (właściwości zaburzające układ hormonalny / ED) musi być absolutnie spójna z Sekcją 12.6. Jeśli w 11.2 deklarujesz brak ED, nie możesz w 12.6 nagle wymieniać galaksolidu. Musisz ujednolicić treść by nie przeczyła sobie wzajemnie!`,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[HealthEnvironmentAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź audyt dziedzinowy (Toksykologia i Zdrowie) na poniższych sekcjach. Zwróć wyłącznie poprawny obiekt JSON:\n${JSON.stringify(sectionData, null, 2)}`;
        
        try {
            const result = await this.model.generateContent(prompt);
            let text = result.response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            return JSON.parse(text);
        } catch (error) {
            console.error(`[HealthEnvironmentAuditorAgent] Błąd audytu:`, error.message);
            throw error;
        }
    }
}

module.exports = { HealthEnvironmentAuditorAgent };
