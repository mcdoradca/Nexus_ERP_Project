const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ApifyEchaConnector } = require('../extractors/apify.echa.connector');
require('dotenv').config();

class HazardClassificationAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.echaConnector = new ApifyEchaConnector();

        const fetchChemicalDataTool = {
            name: "fetchChemicalData",
            description: "Pobiera autorytatywną zharmonizowaną klasyfikację CLP (zwroty H, piktogramy, klasy zagrożeń) z europejskiej bazy ECHA dla podanego numeru CAS lub nazwy substancji. UŻYWAJ TEGO NARZĘDZIA ZAWSZE, GDY WERYFIKUJESZ SEKCJE 2, 3 LUB 15.",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: {
                        type: "STRING",
                        description: "Numer CAS substancji (np. '64-17-5') lub jej nazwa chemiczna."
                    }
                },
                required: ["query"]
            }
        };

        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ AUDYTOREM DZIEDZINOWYM (Hazard Classification & Transport).
Zajmujesz się WYŁĄCZNIE sekcjami 2, 3, 9, 14, 15 w Karcie Charakterystyki SDS.
Twoim zdaniem jest dbanie o spójność klasyfikacji zagrożeń z przepisami Unii Europejskiej (REACH, CLP) oraz wytycznymi transportowymi ADR/RID.
ZASADY:
1. Oczekuj danych w formacie JSON i ZWRACAJ DOKŁADNIE TEN SAM FORMAT JSON (klucze section_2, section_3 itd.).
2. Bezwzględnie usuwaj wszelkie odniesienia do lokalnych, pozaunijnych regulacji.
3. MASZ OBOWIĄZEK używać udostępnionego narzędzia 'fetchChemicalData', aby zweryfikować składniki w sekcji 3 z europejską bazą ECHA (CLP), a następnie upewnić się, że sekcja 2 odzwierciedla te zagrożenia.
4. Transport w Sekcji 14 musi zawierać wyłącznie europejskie klasy (ADR, RID).
5. W sekcji 9.1 dla cieczy musisz użyć zwrotu 'Brak danych' (zamiast 'Nie dotyczy') dla parametrów: temp. topnienia, granice wybuchowości, prężność pary. 
6. W sekcji 15 obowiązkowo zweryfikuj i dodaj informację o prekursory materiałów wybuchowych (Rozporządzenie (UE) 2019/1148).`,
            tools: [{ functionDeclarations: [fetchChemicalDataTool] }],
            generationConfig: {
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[HazardClassificationAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź audyt dziedzinowy (Klasyfikacja i Transport) na poniższych sekcjach. \n${JSON.stringify(sectionData, null, 2)}`;
        
        try {
            const chat = this.model.startChat();
            let result = await chat.sendMessage(prompt);
            let response = result.response;

            // Obsługa pętli Function Calling (Agent Loop)
            if (response.functionCalls && response.functionCalls().length > 0) {
                for (const call of response.functionCalls()) {
                    if (call.name === "fetchChemicalData") {
                        console.log(`[HazardClassificationAuditorAgent] Użycie narzędzia ECHA dla zapytania: ${call.args.query}`);
                        const apiResult = await this.echaConnector.fetchChemicalData(call.args.query);
                        result = await chat.sendMessage([{
                            functionResponse: {
                                name: "fetchChemicalData",
                                response: apiResult ? apiResult : { error: "Brak danych w bazie ECHA" }
                            }
                        }]);
                        response = result.response;
                    }
                }
            }

            let text = response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            // Zwrot JSON (czasem model doda tekst przed JSON, więc trzeba to oczyścić)
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                text = text.substring(jsonStart, jsonEnd + 1);
            }
            return JSON.parse(text);
        } catch (error) {
            console.error(`[HazardClassificationAuditorAgent] Błąd audytu:`, error.message);
            throw error;
        }
    }
}

module.exports = { HazardClassificationAuditorAgent };
