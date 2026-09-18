const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ApifyEchaConnector } = require('../extractors/apify.echa.connector');
require('dotenv').config();

class HealthEnvironmentAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.echaConnector = new ApifyEchaConnector();

        const fetchChemicalDataTool = {
            name: "fetchChemicalData",
            description: "Pobiera z ECHA informacje o klasyfikacji substancji, w tym o właściwościach zaburzających układ hormonalny (ED). Użyj do weryfikacji spójności między sekcjami.",
            parameters: {
                type: "OBJECT",
                properties: {
                    query: { type: "STRING", description: "Numer CAS substancji (np. '1222-05-5')." }
                },
                required: ["query"]
            }
        };

        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ AUDYTOREM DZIEDZINOWYM (Toksykologia, Zdrowie i Ekologia).
Zajmujesz się WYŁĄCZNIE sekcjami 4, 11, 12 w Karcie Charakterystyki SDS.
ZASADY:
1. Oczekuj JSON i ZWRACAJ TYLKO JSON.
2. Zapewnij logikę: Jeśli oryginalny dokument posiada sprzeczności w sekcjach medycznych lub środowiskowych, usuń te sprzeczności.
3. Użyj narzędzia fetchChemicalData do weryfikacji spójności ED (właściwości zaburzające funkcjonowanie układu hormonalnego). Informacje w 11.2.1 oraz 12.6 muszą być absolutnie logicznie spójne.
4. Usuń odniesienia do lokalnych, obcych przepisów dotyczących ratownictwa lub wód.`,
            tools: [{ functionDeclarations: [fetchChemicalDataTool] }],
            generationConfig: {
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[HealthEnvironmentAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź audyt dziedzinowy (Toksykologia i Zdrowie) na poniższych sekcjach. \n${JSON.stringify(sectionData, null, 2)}`;
        
        try {
            const chat = this.model.startChat();
            let result = await chat.sendMessage(prompt);
            let response = result.response;

            if (response.functionCalls && response.functionCalls().length > 0) {
                for (const call of response.functionCalls()) {
                    if (call.name === "fetchChemicalData") {
                        console.log(`[HealthEnvironmentAuditorAgent] Użycie ECHA dla zapytania: ${call.args.query}`);
                        const apiResult = await this.echaConnector.fetchChemicalData(call.args.query);
                        result = await chat.sendMessage([{
                            functionResponse: {
                                name: "fetchChemicalData",
                                response: apiResult ? apiResult : { error: "Brak danych" }
                            }
                        }]);
                        response = result.response;
                    }
                }
            }

            let text = response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) text = text.substring(jsonStart, jsonEnd + 1);
            return JSON.parse(text);
        } catch (error) {
            console.error(`[HealthEnvironmentAuditorAgent] Błąd audytu:`, error.message);
            throw error;
        }
    }
}

module.exports = { HealthEnvironmentAuditorAgent };
