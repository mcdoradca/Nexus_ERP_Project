const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

class AdministrativeAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ ELITARNYM AUDYTOREM DZIEDZINOWYM (Administracja, Identyfikacja i Sekcja 16).
Zajmujesz się WYŁĄCZNIE sekcjami 1 oraz 16 w Karcie Charakterystyki SDS.
Twoim zdaniem jest porządkowanie ogólnych meta-danych firmy oraz legendy.

ZASADY:
1. Oczekuj danych w formacie JSON i ZWRACAJ DOKŁADNIE TEN SAM FORMAT JSON.
2. W sekcji 1.1 BARDZO RYGORYSTYCZNIE sprawdź nazwę handlową (product name). Zabrania się zostawiania uciętych nazw oraz wstawek typu "(ang. ...)" powstałych w procesie tłumaczenia. Nazwa musi być kompletna, pełna i czysta, bez komentarzy w nawiasach.
3. W sekcji 1 upewnij się, że nie ma zagranicznych organów toksykologicznych. Podaj oficjalne polskie numery alarmowe (Łódź +48 42 631 47 24, Warszawa +48 22 619 66 54, 112).
4. W sekcji 16 skontroluj legendę zwrotów H i EUH. Zadbaj by definicja zwrotu EUH208 wymieniała konkretne nazwy składników uczulających z Sekcji 3 lub 2 (np. "EUH208: Zawiera kumarynę, geraniol. Może powodować wystąpienie reakcji alergicznej."). Kategoryczny zakaz pozostawiania znaczników w nawiasach kwadratowych typu [substancje] lub [nazwa...].
5. Zadbaj by informacje były podane w 100% poprawną, urzędową polszczyzną bez własnych interpretacji.
6. W sekcji 16 bezwzględnie dopilnuj obecności pełnej stopki korporacyjnej ITALLUX: Główne źródła literatury i danych (ECHA, PubChem, REACH, CLP, Dz.U. 2018 poz. 1286, Dz.U. 2023 poz. 1587), Zalecenia i wskazówki szkoleniowe dla pracowników, Informacje o zmianach i aktualizacji (wersja 1.0 PL, 5 punktów zmian w tym ITALLUX Sp. z o.o.) oraz Klauzula prawna i ochrona praw autorskich ITALLUX Sp. z o.o.. Bezwzględny zakaz ucinania lub skracania tej stopki.`,
            generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[AdministrativeAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź audyt dziedzinowy (Administracja i Sekcja 16) na poniższych sekcjach. Zwróć wyłącznie poprawny obiekt JSON:\n${JSON.stringify(sectionData, null, 2)}`;
        
        try {
            const result = await this.model.generateContent(prompt);
            let text = result.response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                text = text.substring(jsonStart, jsonEnd + 1);
            }
            return JSON.parse(text);
        } catch (error) {
            console.error(`[AdministrativeAuditorAgent] Błąd audytu LLM, zwracam dane wejściowe:`, error.message);
            return sectionData;
        }
    }
}

module.exports = { AdministrativeAuditorAgent };
