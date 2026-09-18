const { GoogleGenerativeAI } = require('@google/generative-ai');
const { LocalKnowledgeConnector } = require('../extractors/local.knowledge.connector');
require('dotenv').config();

class WorkplaceSafetyAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.rag = new LocalKnowledgeConnector();

        const toolDeclarations = [
            {
                name: "lookupPolishNDS",
                description: "Pobiera polskie normatywy (NDS) z Dz.U. 2018 poz. 1286 dla podanej nazwy lub CAS.",
                parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] }
            },
            {
                name: "querySafetySOP",
                description: "Zwraca procedury bezpieczeństwa (SOP) dla haseł: sorbent, rozlewisko, magazynowanie, elektryczność.",
                parameters: { type: "OBJECT", properties: { topic: { type: "STRING" } }, required: ["topic"] }
            },
            {
                name: "lookupPpeNorms",
                description: "Zwraca oficjalne normy ochrony (PN-EN) dla kategorii sprzętu (np. oczy, ręce).",
                parameters: { type: "OBJECT", properties: { category: { type: "STRING" } }, required: ["category"] }
            },
            {
                name: "lookupWasteCode",
                description: "Pobiera informacje o kodach odpadów (Dz.U. 2020 poz. 10).",
                parameters: { type: "OBJECT", properties: { keywords: { type: "STRING" } }, required: ["keywords"] }
            }
        ];

        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.8-flash",
            systemInstruction: `JESTEŚ AUDYTOREM DZIEDZINOWYM (BHP, PPOŻ, Logistyka i Odpady).
Zajmujesz się WYŁĄCZNIE sekcjami 5, 6, 7, 8, 10, 13 w Karcie Charakterystyki SDS.
ZASADY:
1. Oczekuj JSON i ZWRACAJ TYLKO JSON.
2. ZAWSZE wykorzystuj swoje narzędzia by zdobyć niezbędną wiedzę prawną.
3. W sekcjach 6 i 7 uruchom narzędzie 'querySafetySOP' by dowiedzieć się, jakie materiały można użyć do rozlewisk oraz jakie są wymogi antystatyczne.
4. W sekcji 8.1 uruchom 'lookupPolishNDS' dla każdego składnika, a w 8.2 użyj 'lookupPpeNorms' by wstawić konkretne normy ochronne.
5. W sekcji 13 użyj 'lookupWasteCode' do poprawnego doboru kodów z polskiego katalogu.`,
            tools: [{ functionDeclarations: toolDeclarations }],
            generationConfig: {
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[WorkplaceSafetyAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź audyt dziedzinowy (BHP i Odpady) na poniższych sekcjach. \n${JSON.stringify(sectionData, null, 2)}`;
        
        try {
            const chat = this.model.startChat();
            let result = await chat.sendMessage(prompt);
            let response = result.response;

            if (response.functionCalls && response.functionCalls().length > 0) {
                for (const call of response.functionCalls()) {
                    let apiResult = null;
                    if (call.name === "lookupPolishNDS") apiResult = await this.rag.lookupPolishNDS(call.args.query);
                    if (call.name === "querySafetySOP") apiResult = await this.rag.querySafetySOP(call.args.topic);
                    if (call.name === "lookupPpeNorms") apiResult = await this.rag.lookupPpeNorms(call.args.category);
                    if (call.name === "lookupWasteCode") apiResult = await this.rag.lookupWasteCode(call.args.keywords);
                    
                    console.log(`[WorkplaceSafetyAuditorAgent] Narzędzie: ${call.name}`);
                    
                    result = await chat.sendMessage([{
                        functionResponse: {
                            name: call.name,
                            response: apiResult ? apiResult : { error: "Brak danych" }
                        }
                    }]);
                    response = result.response;
                }
            }

            let text = response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) text = text.substring(jsonStart, jsonEnd + 1);
            return JSON.parse(text);
        } catch (error) {
            console.error(`[WorkplaceSafetyAuditorAgent] Błąd audytu:`, error.message);
            throw error;
        }
    }
}

module.exports = { WorkplaceSafetyAuditorAgent };
