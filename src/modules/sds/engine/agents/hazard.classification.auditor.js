const { GoogleGenerativeAI } = require('@google/generative-ai');
const { LocalKnowledgeConnector } = require('../extractors/local.knowledge.connector');
const { ApifyEchaConnector } = require('../extractors/apify.echa.connector');
require('dotenv').config();

class HazardClassificationAuditorAgent {
    constructor() {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.rag = new LocalKnowledgeConnector();
        this.echaConnector = new ApifyEchaConnector();

        const toolDeclarations = [
            {
                name: "lookupHarmonizedCLP",
                description: "Pobiera zharmonizowaną klasyfikację CLP (SCL, współczynniki M, ATE) z Załącznika VI do Rozporządzenia (WE) nr 1272/2008 (ATP 1-22).",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        query: { type: "STRING", description: "Numer CAS (np. '55965-84-9') lub nazwa substancji" }
                    },
                    required: ["query"]
                }
            },
            {
                name: "lookupADR",
                description: "Pobiera urzędowe dane transportowe ADR (prawidłowa nazwa przewozowa UN, klasa, grupa pakowania, kod tunelu, LQ) dla numeru UN.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        unNumber: { type: "STRING", description: "Numer UN (np. '1170' lub 'UN 1170')" }
                    },
                    required: ["unNumber"]
                }
            },
            {
                name: "lookupLegalActs",
                description: "Pobiera skonsolidowany, jednolity wykaz aktów prawnych UE i RP dla Sekcji 15.1. Gwarantuje brak norm WGK, TRGS 510 i błędnego Ograniczenia 75.",
                parameters: {
                    type: "OBJECT",
                    properties: {
                        isFlammable: { type: "BOOLEAN", description: "Czy produkt jest cieczą łatwopalną" },
                        isTattooProduct: { type: "BOOLEAN", description: "Czy produkt jest tuszem do tatuażu" }
                    },
                    required: []
                }
            }
        ];

        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-pro-preview",
            systemInstruction: `JESTEŚ ELITARNYM AUDYTOREM DZIEDZINOWYM (Klasyfikacja Zagrożeń CLP, Skład Chemiczny, Właściwości Fizykochemiczne i Transport ADR).
Zajmujesz się WYŁĄCZNIE sekcjami 2, 3, 9, 14, 15 w Karcie Charakterystyki SDS.
DZIAŁASZ POD RYGOREM ODPOWIEDZIALNOŚCI PRAWNEJ Z ROZPORZĄDZENIA CLP (WE 1272/2008) ORAZ REACH (UE 2020/878).

BEZWZGLĘDNE ZASADY:
1. W Sekcji 2.2 ZASTOSUJ ART. 18 UST. 3 CLP:
   - Jeżeli mieszanina NIE posiada klasyfikacji stwarzającej zagrożenie (brak piktogramów i zwrotów H), pole "Nazwy niebezpiecznych substancji wymienione na etykiecie" MUSI mieć wartość "Nie dotyczy.".
   - Zwrot EUH208 musi zawierać pełne zdanie: "EUH208 Zawiera [substancje]. Może powodować wystąpienie reakcji alergicznej.".
2. W Sekcji 3.2:
   - Odpytaj 'lookupHarmonizedCLP' dla składników (np. CAS 55965-84-9).
   - Wstrzyknij urzędowe wartości ATE dla substancji z Acute Tox (np. CMI/MIT: ATE doustnie 64 mg/kg, skóra 87,12 mg/kg, inhalacja 0,33 mg/l).
3. W Sekcji 9.1:
   - Dla cieczy dla parametrów fizycznie istniejących (temp. topnienia/krzepnięcia, prężność pary) w razie braku badań użyj zwrotu "Brak danych" zamiast "Nie dotyczy". Zwrot "Nie dotyczy" jest dopuszczalny tylko dla cząstek stałych w cieczach.
4. W Sekcji 14:
   - Odpytaj 'lookupADR' dla numeru UN. Zastosuj oficjalną polską nazwę przewozową i europejskie przepisy ADR/RID.
5. W Sekcji 15.1:
   - Odpytaj 'lookupLegalActs'. CAŁKOWITY ZAKAZ POWIELANIA NIEMIECKICH NORM WGK i TRGS 510 ORAZ OGRANICZENIA 75 DLA PRODUKTÓW NIETATUATORSKICH.
6. Zwracaj WYŁĄCZNIE poprawny JSON z zachowaniem struktury wejściowej.`,
            tools: [{ functionDeclarations: toolDeclarations }],
            generationConfig: {
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[HazardClassificationAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź audyt dziedzinowy (CLP, Skład, Fizykochemia, Transport, Prawo) na poniższych sekcjach. Użyj narzędzi RAG by zweryfikować stan prawny:\n${JSON.stringify(sectionData, null, 2)}`;
        
        try {
            const chat = this.model.startChat();
            let result = await chat.sendMessage(prompt);
            let response = result.response;

            let toolIterations = 0;
            const MAX_TOOL_ITERATIONS = 6;

            while (toolIterations < MAX_TOOL_ITERATIONS) {
                const calls = typeof response.functionCalls === 'function' ? response.functionCalls() : null;
                if (!calls || calls.length === 0) break;
                toolIterations++;
                const functionResponses = [];

                for (const call of calls) {
                    console.log(`[HazardClassificationAuditorAgent] Narzędzie RAG: ${call.name} (args: ${JSON.stringify(call.args)})`);
                    let apiResult = null;
                    try {
                        if (call.name === "lookupHarmonizedCLP") {
                            apiResult = await this.rag.lookupHarmonizedCLP(call.args.query);
                        } else if (call.name === "lookupADR") {
                            apiResult = await this.rag.lookupADR(call.args.unNumber);
                        } else if (call.name === "lookupLegalActs") {
                            apiResult = { legalActsText: this.rag.lookupLegalActs(call.args) };
                        }
                    } catch (err) {
                        console.error(`[HazardClassificationAuditorAgent] Błąd wykonania narzędzia ${call.name}:`, err.message);
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

            this._applyDeterministicHazardShield(audited);
            return audited;
        } catch (error) {
            console.error(`[HazardClassificationAuditorAgent] Błąd audytu LLM, stosuję deterministyczny RAG fallback:`, error.message);
            const fallback = JSON.parse(JSON.stringify(sectionData));
            this._applyDeterministicHazardShield(fallback);
            return fallback;
        }
    }

    _applyDeterministicHazardShield(sectionsObj) {
        // Sanityzacja Sekcji 15.1: Wycięcie WGK, TRGS i Ograniczenia 75
        for (const [secKey, secVal] of Object.entries(sectionsObj)) {
            if (secKey === 'section_15' || secKey === '15') {
                const target = typeof secVal === 'object' ? secVal : { '15.1': String(secVal) };
                if (target['15.1'] && typeof target['15.1'] === 'string') {
                    target['15.1'] = target['15.1']
                        .replace(/-\s*Niemiecka\s*klasa\s*zagrożenia\s*wód[^\n]*/gi, '')
                        .replace(/-\s*Niemiecka\s*klasa\s*magazynowania\s*TRGS[^\n]*/gi, '')
                        .replace(/-\s*WGK[^\n]*/gi, '')
                        .replace(/Ograniczenie\s*75\s*\(dla\s*zawartych\s*substancji\)/gi, 'Pozycja 3 oraz Pozycja 40')
                        .trim();
                }
            }
        }
    }
}

module.exports = { HazardClassificationAuditorAgent };
