const { GoogleGenerativeAI } = require('@google/generative-ai');
const { LocalKnowledgeConnector } = require('../extractors/local.knowledge.connector');
require('dotenv').config();

class HealthEnvironmentAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.rag = new LocalKnowledgeConnector();

        const toolDeclarations = [
            {
                name: "lookupHarmonizedCLP",
                description: "Pobiera z bazy zharmonizowaną klasyfikację toksykologiczną i ekologiczną dla podanego numeru CAS.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: { type: "STRING", description: "Numer CAS substancji (np. '1222-05-5')." }
                    },
                    required: ["query"]
                }
            }
        ];

        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-pro-preview",
            systemInstruction: `JESTEŚ ELITARNYM AUDYTOREM DZIEDZINOWYM (Toksykologia, Ekologia, Pierwsza Pomoc).
Zajmujesz się WYŁĄCZNIE sekcjami 4, 11, 12 w Karcie Charakterystyki SDS.
DZIAŁASZ POD RYGOREM ODPOWIEDZIALNOŚCI PRAWNEJ Z ROZPORZĄDZENIA REACH (UE 2020/878) ORAZ CLP (WE 1272/2008).

BEZWZGLĘDNE ZASADY:
1. W Sekcji 4.1 i 4.2:
   - Zadbaj o pełne procedury pierwszej pomocy (drogi oddechowe, skóra, oczy, przewód pokarmowy).
   - W razie braku objawów laboratoryjnych przeprowadź logiczną dedukcję na podstawie składu (np. przy Skin Sens: miejscowe zaczerwienienie, świąd).
2. W Sekcji 11.1:
   - ABSOLUTNY ZAKAZ łączenia stężenia śmiertelnego LC50 (inhalacja) z jednostką mg/kg! LC50 wyraża się wyłącznie w mg/l, mg/m³ lub ppm. Jeśli źródło podaje mg/kg dla LC50, popraw na dawkę doustną LD50 lub pomiń błędny wpis inhalacyjny.
   - Podsekcja 11.2 musi być podzielona na 11.2.1 (Właściwości zaburzające funkcjonowanie układu hormonalnego) i 11.2.2 (Inne informacje).
3. W Sekcji 12:
   - W Sekcji 12.2 ABSOLUTNY ZAKAZ wycieków parametru "Rozpuszczalność w wodzie" (miejsce rozpuszczalności jest wyłącznie w 9.1).
   - Podsekcja 12.5 musi mieć pełny tytuł uwzględniający kryteria PMT i vPvM (Rozporządzenie Delegowane (UE) 2023/707).
   - Podsekcja 12.6 dotyczy właściwości zaburzających funkcjonowanie układu hormonalnego w środowisku.
4. Zwracaj WYŁĄCZNIE poprawny format JSON.`,
            tools: [{ functionDeclarations: toolDeclarations }],
            generationConfig: {
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[HealthEnvironmentAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź audyt dziedzinowy (Toksykologia, Ekologia, Pierwsza Pomoc) na poniższych sekcjach. Upewnij się, że jednostki i podsekcje 11.2 i 12.5 są w 100% zgodne z prawem:\n${JSON.stringify(sectionData, null, 2)}`;
        
        try {
            const chat = this.model.startChat();
            let result = await chat.sendMessage(prompt);
            let response = result.response;

            let toolIterations = 0;
            const MAX_TOOL_ITERATIONS = 5;

            while (toolIterations < MAX_TOOL_ITERATIONS) {
                const calls = typeof response.functionCalls === 'function' ? response.functionCalls() : null;
                if (!calls || calls.length === 0) break;
                toolIterations++;
                const functionResponses = [];

                for (const call of calls) {
                    console.log(`[HealthEnvironmentAuditorAgent] Narzędzie RAG: ${call.name} (args: ${JSON.stringify(call.args)})`);
                    let apiResult = null;
                    try {
                        if (call.name === "lookupHarmonizedCLP") {
                            apiResult = await this.rag.lookupHarmonizedCLP(call.args.query);
                        }
                    } catch (err) {
                        apiResult = { error: err.message };
                    }

                    functionResponses.push({
                        functionResponse: {
                            name: call.name,
                            response: apiResult || { info: "Brak danych" }
                        }
                    });
                }

                result = await chat.sendMessage(functionResponses);
                response = result.response;
            }

            let text = response.text();
            text = text.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
            const jsonStart = text.indexOf('{');
            const jsonEnd = text.lastIndexOf('}');
            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                text = text.substring(jsonStart, jsonEnd + 1);
            }
            const audited = JSON.parse(text);

            this._applyDeterministicHealthShield(audited);
            return audited;
        } catch (error) {
            console.error(`[HealthEnvironmentAuditorAgent] Błąd audytu LLM, stosuję deterministyczny fallback:`, error.message);
            const fallback = JSON.parse(JSON.stringify(sectionData));
            this._applyDeterministicHealthShield(fallback);
            return fallback;
        }
    }

    _applyDeterministicHealthShield(sectionsObj) {
        // Sanityzacja Sekcji 11 i 12
        for (const [secKey, secVal] of Object.entries(sectionsObj)) {
            if (secKey === 'section_11' || secKey === '11') {
                const target = typeof secVal === 'object' ? secVal : { '11.1': String(secVal) };
                if (target['11.1'] && typeof target['11.1'] === 'string') {
                    // Usuwanie niemożliwych jednostek inhalacyjnych mg/kg
                    target['11.1'] = target['11.1'].replace(/(?:LC50|CL50)[^:\n]*inhalac[^:\n]*:\s*\d+[,\.]?\d*\s*mg\/kg/gi, '').trim();
                }
            }
            if (secKey === 'section_12' || secKey === '12') {
                const target = typeof secVal === 'object' ? secVal : { '12.2': String(secVal) };
                if (target['12.2'] && typeof target['12.2'] === 'string') {
                    // Usuwanie wycieków rozpuszczalności w wodzie z sekcji 12.2
                    target['12.2'] = target['12.2'].replace(/Rozpuszczalność\s*w\s*wodzie[^\n]*/gi, '').trim();
                }
            }
        }
    }
}

module.exports = { HealthEnvironmentAuditorAgent };
