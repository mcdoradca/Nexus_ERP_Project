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
                description: "Pobiera polskie normatywy (NDS, NDSCh, NDSP) z Dz.U. 2018 poz. 1286 z późn. zm. (w tym Dz.U. 2024 poz. 1017) dla podanej nazwy substancji lub numeru CAS.",
                parameters: { 
                    type: "OBJECT", 
                    properties: { 
                        query: { type: "STRING", description: "Numer CAS (np. 64-17-5) lub nazwa chemiczna" } 
                    }, 
                    required: ["query"] 
                }
            },
            {
                name: "querySafetySOP",
                description: "Zwraca oficjalne procedury bezpieczeństwa (SOP) dla haseł: sorbent, rozlewisko, pożar, magazynowanie, elektryczność.",
                parameters: { 
                    type: "OBJECT", 
                    properties: { 
                        topic: { type: "STRING", description: "Temat procedury np. 'sorbent', 'magazynowanie', 'pożar'" } 
                    }, 
                    required: ["topic"] 
                }
            },
            {
                name: "lookupPpeNorms",
                description: "Zwraca oficjalne polskie normy ochrony (PN-EN / ISO) dla kategorii Środków Ochrony Indywidualnej (ŚOI) z podziałem na konsumenta i przemysł.",
                parameters: { 
                    type: "OBJECT", 
                    properties: { 
                        category: { type: "STRING", description: "Kategoria ŚOI np. 'oczy', 'ręce', 'drogi oddechowe'" } 
                    }, 
                    required: ["category"] 
                }
            },
            {
                name: "lookupWasteCode",
                description: "Pobiera urzędowe 6-cyfrowe kody odpadów z katalogu (Dz.U. 2020 poz. 10) dla produktu i opakowań.",
                parameters: { 
                    type: "OBJECT", 
                    properties: { 
                        keywords: { type: "STRING", description: "Słowa kluczowe opisujące produkt np. 'detergent', 'płyn do tkanin'" },
                        isHazardous: { type: "BOOLEAN", description: "Czy produkt jest sklasyfikowany jako stwarzający zagrożenie" }
                    }, 
                    required: ["keywords"] 
                }
            }
        ];

        this.model = genAI.getGenerativeModel({ 
            model: "gemini-3.1-pro-preview",
            systemInstruction: `JESTEŚ ELITARNYM AUDYTOREM DZIEDZINOWYM (BHP, PPOŻ, Magazynowanie i Odpady).
Zajmujesz się WYŁĄCZNIE sekcjami 5, 6, 7, 8, 10, 13 w Karcie Charakterystyki SDS.
DZIAŁASZ POD RYGOREM ODPOWIEDZIALNOŚCI PRAWNEJ Z ROZPORZĄDZENIA REACH (UE 2020/878).

BEZWZGLĘDNE ZASADY:
1. ZAWSZE wykorzystuj swoje narzędzia by uzyskać twarde dane z polskich rejestrów prawnych (NDS, kody odpadów, SOP).
2. W Sekcji 6: Kategoryczny ZAKAZ trocin lub sorbentów organicznych. Wymagaj wyłącznie niepalnych sorbentów (piasek, ziemia okrzemkowa, wermikulit).
3. W Sekcji 7: CAŁKOWITY ZAKAZ stosowania niemieckich norm TRGS 510 oraz WGK. Wszelkie zasady magazynowania oprzyj na polskich przepisach ochrony przeciwpożarowej (Dz.U. 2010 nr 109 poz. 719). W Sekcji 7.1 BEZWZGLĘDNIE wymagać wpisu o zakazie stosowania sprężonego powietrza do napełniania, opróżniania, przetłaczania lub manipulowania produktem (Załącznik II REACH pkt 7.1).
4. W Sekcji 8.1: Odpytaj 'lookupPolishNDS' dla każdego składnika. Usuń zagraniczne normy OEL (Niemcy, Austria, UK). Wstrzyknij wyłącznie polskie NDS (Dz.U. 2018 poz. 1286 / Dz.U. 2024 poz. 1017).
5. W Sekcji 8.2: Rozróżnij brak wymogu ŚOI dla konsumenta od norm przemysłowych (PN-EN 166 dla oczu, PN-EN ISO 374-1 dla rąk - kauczuk nitrylowy, PN-EN 14387 dla dróg oddechowych). Kontrola środowiska nie może mieć wartości 'Nie dotyczy'.
6. W Sekcji 13: Odpytaj 'lookupWasteCode' i wstaw pełne 6-cyfrowe kody z katalogu odpadów (Dz.U. 2020 poz. 10) dla produktu (np. 20 01 30) i opakowań (15 01 02 / 15 01 10*).
7. Zwracaj WYŁĄCZNIE poprawny JSON z zachowaniem struktury wejściowych sekcji.`,
            tools: [{ functionDeclarations: toolDeclarations }],
            generationConfig: {
                temperature: 0.0
            }
        });
    }

    async audit(sectionData) {
        console.log(`[WorkplaceSafetyAuditorAgent] Audytowanie sekcji: ${Object.keys(sectionData).join(', ')}...`);
        const prompt = `Przeprowadź rygorystyczny audyt dziedzinowy (BHP, PPOŻ, Magazynowanie, NDS i Odpady) na poniższych sekcjach. Skorzystaj z narzędzi RAG by zweryfikować stan prawny:\n${JSON.stringify(sectionData, null, 2)}`;
        
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
                    console.log(`[WorkplaceSafetyAuditorAgent] Narzędzie RAG: ${call.name} (args: ${JSON.stringify(call.args)})`);
                    let apiResult = null;
                    try {
                        if (call.name === "lookupPolishNDS") {
                            apiResult = await this.rag.lookupPolishNDS(call.args.query);
                        } else if (call.name === "querySafetySOP") {
                            apiResult = await this.rag.querySafetySOP(call.args.topic);
                        } else if (call.name === "lookupPpeNorms") {
                            apiResult = await this.rag.lookupPpeNorms(call.args.category);
                        } else if (call.name === "lookupWasteCode") {
                            apiResult = await this.rag.lookupWasteCode(call.args.keywords, call.args.isHazardous);
                        }
                    } catch (err) {
                        console.error(`[WorkplaceSafetyAuditorAgent] Błąd wykonania narzędzia ${call.name}:`, err.message);
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

            // Deterministyczna tarcza sanityzacyjna (Zero-Bypass):
            this._applyDeterministicSafetyShield(audited);
            return audited;
        } catch (error) {
            console.error(`[WorkplaceSafetyAuditorAgent] Błąd audytu LLM, stosuję deterministyczny RAG fallback:`, error.message);
            const fallback = JSON.parse(JSON.stringify(sectionData));
            this._applyDeterministicSafetyShield(fallback);
            return fallback;
        }
    }

    _applyDeterministicSafetyShield(sectionsObj) {
        // 1. Sanityzacja Sekcji 7: Bezwzględne wycięcie TRGS 510 i WGK
        for (const [secKey, secVal] of Object.entries(sectionsObj)) {
            if (secKey === 'section_7' || secKey === '7') {
                const target = typeof secVal === 'object' ? secVal : { '7.2': String(secVal) };
                for (const subKey of Object.keys(target)) {
                    if (typeof target[subKey] === 'string') {
                        target[subKey] = target[subKey]
                            .replace(/Storage\s*class\s*TRGS\s*510[^;\n\.]*/gi, '')
                            .replace(/TRGS\s*510[^;\n\.]*/gi, '')
                            .replace(/Lagerklasse[^;\n\.]*/gi, '')
                            .replace(/WGK\s*:\s*\d+/gi, '')
                            .replace(/Niemiecka\s*klasa\s*zagrożenia\s*wód[^;\n\.]*/gi, '')
                            .trim();
                    }
                }
            }
        }
    }
}

module.exports = { WorkplaceSafetyAuditorAgent };
