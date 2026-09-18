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
1. W sekcji 6 (Uwolnienie) BEZWZGLĘDNIE ZABRONIONE JEST stosowanie palnych materiałów organicznych jako sorbentów (np. trocin, materiałów organicznych). Wymuszaj użycie niepalnych sorbentów: piasek, ziemia okrzemkowa, wermikulit.
2. W sekcji 7 (Magazynowanie) ZAWSZE wymuszaj wytyczne o ochronie przed elektrycznością statyczną oraz zakazie stosowania sprężonego powietrza do opróżniania pojemników.
3. W sekcji 8 (Narażenie) BARDZO RYGORYSTYCZNIE usuwaj limity i normatywy z państw trzecich (np. Wspólnotowe dopuszczalne wartości narażenia zawodowego OEL dla Austrii, Niemiec, Francji). Pozostaw WYŁĄCZNIE polskie normy NDS/NDSCh.
4. W sekcji 8.2 (Środki Ochrony Indywidualnej) ZAKAZUJE SIĘ stosowania ogólników typu "Brak szczególnych wymagań". Musisz przywołać konkretne normy ochrony: dla oczu (np. PN-EN 166) oraz dla rąk (np. PN-EN ISO 374-1).
5. Postępowanie z odpadami (sekcja 13) musi odwoływać się do kodów odpadów (np. 14 06 03*) zgodnie z prawem polskim (Dz.U. 2020 poz. 10 / BDO).
6. Oczekuj JSON i ZWRACAJ TYLKO JSON.`,
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
