const { GoogleGenAI, Type, ThinkingLevel } = require('@google/genai');
const aiMetricsService = require('../../core/ai.metrics.service');
const { getNodeConfig } = require('./config/nodes.config.js');

// Inicjalizacja klienta Google Gen AI (nie używamy starego @google/generative-ai)
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 600000 } // 10 minut timeoutu dla ciężkich modeli jak gemini-3.1-pro-preview
});

/**
 * Ekstrahuje surowy tekst z odpowiedzi Kroku 1 (Grounding) z pełną odpornością na RECITATION.
 * W bibliotece @google/genai oficjalny getter response.text zwraca undefined, gdy model
 * ustawi finishReason na RECITATION lub gdy treść została częściowo oznaczona cytowaniami.
 * Ta funkcja kaskadowo penetruje strukturę parts i groundingMetadata, aby nigdy nie utracić
 * odnalezionych przez model danych o produkcie i składzie INCI.
 */
function extractGroundedTextFromResponse(groundedResponse, agentId) {
    if (!groundedResponse) return '';

    // 1. Próba standardowego gettera SDK
    if (typeof groundedResponse.text === 'string' && groundedResponse.text.trim().length >= 10) {
        return groundedResponse.text.trim();
    }

    const candidate = groundedResponse.candidates && groundedResponse.candidates[0];
    if (!candidate) return '';

    // 2. Bezpośrednia ekstrakcja z parts (z pominięciem myśli - thought: true)
    if (candidate.content && Array.isArray(candidate.content.parts)) {
        const directTextParts = candidate.content.parts
            .filter(p => !p.thought && typeof p.text === 'string' && p.text.trim().length > 0)
            .map(p => p.text.trim());
        
        if (directTextParts.length > 0) {
            const combined = directTextParts.join('\n\n');
            if (combined.length >= 10) {
                console.log(`[DEFENSIVE AI] Odzyskano ${combined.length} znaków z candidate.content.parts (omijając blokadę gettera text przy ${candidate.finishReason || 'N/A'}) dla agenta ${agentId}.`);
                return combined;
            }
        }

        // 3. Fallback: Ekstrakcja z partów myśli (thought: true), jeśli model przeprowadził research w buforze myśli
        const thoughtParts = candidate.content.parts
            .filter(p => p.thought && typeof p.text === 'string' && p.text.trim().length > 0)
            .map(p => p.text.trim());
        
        if (thoughtParts.length > 0) {
            const combinedThoughts = thoughtParts.join('\n\n');
            if (combinedThoughts.length >= 10) {
                console.warn(`[DEFENSIVE AI] Model zakończył z ${candidate.finishReason || 'N/A'} bez czystego tekstu wyjściowego. Odzyskano wiedzę z bufora myśli (${combinedThoughts.length} znaków) dla agenta ${agentId}.`);
                return combinedThoughts;
            }
        }
    }

    // 4. Fallback: Ekstrakcja z groundingMetadata.groundingChunks (fragmenty stron z Google Search)
    if (candidate.groundingMetadata && Array.isArray(candidate.groundingMetadata.groundingChunks)) {
        const webChunks = candidate.groundingMetadata.groundingChunks
            .map(chunk => {
                if (chunk.web && chunk.web.title) {
                    return `ŹRÓDŁO: ${chunk.web.title} (${chunk.web.uri || ''})\n${chunk.web.snippet || ''}`;
                }
                return '';
            })
            .filter(Boolean);
        
        if (webChunks.length > 0) {
            const chunksText = webChunks.join('\n\n');
            console.warn(`[DEFENSIVE AI] Odzyskano fragmenty stron z groundingChunks (${chunksText.length} znaków) dla agenta ${agentId}.`);
            return chunksText;
        }
    }

    return '';
}

/**
 * Wrapper telemetrii i wykonania dla modelu Gemini.
 * @param {Object} params
 * @param {string} params.agentId - Jawny identyfikator agenta (S-7)
 * @param {string} params.prompt - Złożony prompt
 * @param {Object} [params.schema] - Opcjonalny schemat JSON dla responseSchema
 * @returns {Object} Zwraca sparsowany obiekt JSON.
 */
async function callAgentWithTelemetry({ agentId, prompt, schema, onLog = () => {} }) {
    if (!agentId) {
        throw new Error("BŁĄD BLOKUJĄCY (S-7): Wywołanie LLM bez jawnego agentId.");
    }
    
    const { model, thinkingLevel, grounding, temperature, maxOutputTokens } = getNodeConfig(agentId);
    if (!process.env.GEMINI_API_KEY) {
        throw new Error("HITL: Brak klucza API (GEMINI_API_KEY) w środowisku.");
    }

    // --- BASE CONFIG (wspólna baza dla wszystkich ścieżek) ---
    const baseConfig = {};
    if (thinkingLevel) {
        baseConfig.thinkingConfig = {
            thinkingLevel: thinkingLevel
        };
    }
    if (temperature !== undefined) {
        baseConfig.temperature = temperature;
    }
    if (maxOutputTokens !== undefined) {
        baseConfig.maxOutputTokens = maxOutputTokens;
    }

    const needsTwoStep = grounding && schema;

    const startMsg = `[V2 Wrapper] Uruchamianie agenta: ${agentId}, model: ${model}, thinking: ${thinkingLevel}, grounding: ${!!grounding}, schema: ${!!schema}${needsTwoStep ? ', mode: TWO-STEP' : ''}`;
    console.log(startMsg);
    onLog(`[AI WRAPPER] ${startMsg}`);
    const startTime = Date.now();

    try {
        let response;
        let mergedUsage = null;

        if (needsTwoStep) {
            // ==================================================================================
            // TWO-STEP APPROACH (FIX HTTP 412)
            // Google Gemini API odrzuca kombinację googleSearch (grounding) + responseSchema
            // w jednym żądaniu (HTTP 412 Precondition Failed).
            // Krok 1: Wywołanie z grounding (Google Search) BEZ responseSchema → surowy tekst
            // Krok 2: Wywołanie z responseSchema BEZ grounding → ustrukturyzowany JSON
            // ==================================================================================

            // --- KROK 1: GROUNDING (pobieranie danych z sieci) ---
            const groundingConfig = { ...baseConfig, tools: [{ googleSearch: {} }] };
            // Narzędzie googleSearch posiada własny autonomiczny silnik kwerend.
            // Wymuszanie zewnętrznego thinkingLevel w Kroku 1 buforuje cytaty stron w myślach i aktywuje
            // filtr RECITATION (czyszczący content do zera). Usunięcie thinkingConfig z Kroku 1 całkowicie eliminuje ten błąd.
            delete groundingConfig.thinkingConfig;
            // Krok 1 nie wymaga temperature 0 (chcemy elastyczności w wyszukiwaniu)

            let groundedResponse;
            let groundedCandidate;
            let groundingUsage = {};
            let groundedText = '';

            const executeStep1 = async (stepPrompt) => {
                let resp;
                try {
                    resp = await ai.models.generateContent({
                        model: model,
                        contents: stepPrompt,
                        config: groundingConfig
                    });
                } catch (apiError) {
                    const errStr = typeof apiError.message === 'string' ? apiError.message : JSON.stringify(apiError);
                    const isGroundingBlocked = errStr.includes('User location is not supported') 
                        || apiError.status === 412 
                        || errStr.includes('FAILED_PRECONDITION')
                        || errStr.includes('412');

                    if (isGroundingBlocked) {
                        console.warn(`[DEFENSIVE AI] Grounding zablokowany w Kroku 1 dla agenta ${agentId} (status: ${apiError.status || 'N/A'}, msg: ${errStr.substring(0, 200)}). Fallback: wywołanie bez Google Search.`);
                        const fallbackGroundingConfig = { ...baseConfig };
                        resp = await ai.models.generateContent({
                            model: model,
                            contents: stepPrompt,
                            config: fallbackGroundingConfig
                        });
                    } else {
                        throw apiError;
                    }
                }
                return resp;
            };

            groundedResponse = await executeStep1(prompt);
            groundedCandidate = groundedResponse.candidates && groundedResponse.candidates[0];
            groundingUsage = groundedResponse.usageMetadata || {};

            // Obsługa RECITATION w Kroku 1 — log informacyjny
            if (groundedCandidate && groundedCandidate.finishReason === 'RECITATION') {
                console.warn(`[V2 Wrapper] RECITATION wykryty w Kroku 1 agenta ${agentId}. Aktywacja tarczy defensywnej odzyskiwania tekstu.`);
            }

            groundedText = extractGroundedTextFromResponse(groundedResponse, agentId);

            // Jeśli pierwsze podejście dało pusty wynik (np. twardy filtr RECITATION wyczyścił parts), wykonujemy 1 defensywny retry z dyrektywą parafrazowania
            if (!groundedText || groundedText.trim().length < 10) {
                console.warn(`[DEFENSIVE AI] Krok 1 dla agenta ${agentId} zwrócił pusty tekst (${groundedText.length} znaków, finishReason: ${groundedCandidate?.finishReason || 'N/A'}). Podejmuję 1 defensywną próbę re-groundingu z dyrektywą parafrazowania...`);
                const retryPrompt = `${prompt}\n\n[DODATKOWA DYREKTYWA ANTY-RECITATION]: Wyszukaj fakty w Google, ale podsumuj i sformułuj je własnymi słowami. Nie kopiuj dosłownych bloków tekstu ze stron drogerii 1:1, zmień szyk zdań, aby uniknąć blokady licencyjnej cytowań (RECITATION).`;
                try {
                    const retryResponse = await executeStep1(retryPrompt);
                    const retryCandidate = retryResponse.candidates && retryResponse.candidates[0];
                    const retryText = extractGroundedTextFromResponse(retryResponse, agentId);
                    if (retryText && retryText.trim().length >= 10) {
                        groundedResponse = retryResponse;
                        groundedCandidate = retryCandidate;
                        groundedText = retryText;
                        groundingUsage = retryResponse.usageMetadata || groundingUsage;
                        console.log(`[DEFENSIVE AI] Retry Kroku 1 zakończony sukcesem (${groundedText.length} znaków).`);
                    }
                } catch (retryErr) {
                    console.warn(`[DEFENSIVE AI] Retry Kroku 1 nie powiódł się:`, retryErr.message);
                }
            }

            if (!groundedText || groundedText.trim().length < 10) {
                throw new Error(`Krok 1 (Grounding) zwrócił pustą lub zbyt krótką odpowiedź (${groundedText.length} znaków). Brak danych z sieci.`);
            }

            console.log(`[V2 Wrapper] Krok 1 ukończony (grounding). Długość surowego tekstu: ${groundedText.length} znaków. Tokeny: prompt=${groundingUsage.promptTokenCount || '?'}, output=${groundingUsage.candidatesTokenCount || '?'}. Przechodzę do Kroku 2 (strukturyzacja JSON)...`);

            // --- KROK 2: STRUKTURYZACJA (parsowanie surowego tekstu w JSON) ---
            const structureConfig = { ...baseConfig };
            structureConfig.responseMimeType = "application/json";
            structureConfig.responseSchema = schema;
            // Krok 2 nie wymaga głębokiego myślenia — to czysta ekstrakcja danych
            delete structureConfig.thinkingConfig;
            // Krok 2 wymaga niskiej temperature (determinizm ekstrakcji)
            structureConfig.temperature = 0;
            // Usuwamy maxOutputTokens z Kroku 2 — pozwalamy mu swobodnie generować JSON
            delete structureConfig.maxOutputTokens;

            const structurePrompt = `Jesteś precyzyjnym parserem danych. Na podstawie poniższego raportu badawczego, wyekstrahuj WYŁĄCZNIE dane, które FAKTYCZNIE znajdują się w tekście raportu. NIE wymyślaj, NIE dodawaj, NIE halucynuj żadnych danych. Jeśli konkretna informacja nie istnieje w raporcie, pozostaw odpowiednie pole puste (pusty string "") lub null.\n\n--- RAPORT BADAWCZY (JEDYNE ŹRÓDŁO PRAWDY) ---\n${groundedText}\n--- KONIEC RAPORTU ---\n\nZwróć ustrukturyzowany JSON zgodny ze schematem.`;

            response = await ai.models.generateContent({
                model: model,
                contents: structurePrompt,
                config: structureConfig
            });

            // Merge usage z obu kroków (łączna telemetria)
            const structureUsage = response.usageMetadata || {};
            mergedUsage = {
                promptTokenCount: (groundingUsage.promptTokenCount || 0) + (structureUsage.promptTokenCount || 0),
                candidatesTokenCount: (groundingUsage.candidatesTokenCount || 0) + (structureUsage.candidatesTokenCount || 0),
                thoughtsTokenCount: (groundingUsage.thoughtsTokenCount || 0) + (structureUsage.thoughtsTokenCount || 0),
                totalTokenCount: (groundingUsage.totalTokenCount || 0) + (structureUsage.totalTokenCount || 0)
            };

        } else {
            // ==================================================================================
            // STANDARD PATH: jeden request (brak konfliktu grounding/schema)
            // Dotyczy agentów z TYLKO grounding lub TYLKO schema lub żadnym z nich
            // ==================================================================================
            const config = { ...baseConfig };

            if (grounding) {
                config.tools = [{ googleSearch: {} }];
            }
            if (schema) {
                config.responseMimeType = "application/json";
                config.responseSchema = schema;
            }

            const requestPayload = { model: model, contents: prompt, config: config };
            const payloadDump = JSON.stringify(requestPayload, null, 2);
            onLog(`\n[AI WRAPPER - RAW REQUEST DUMP (Agent ${agentId})]\n${payloadDump}\n[END RAW REQUEST DUMP]\n`);
            console.log(`[AI WRAPPER - RAW REQUEST DUMP (Agent ${agentId})] Payload size: ${payloadDump.length} bytes`);

            try {
                response = await ai.models.generateContent({
                    model: model,
                    contents: prompt,
                    config: config
                });
            } catch (apiError) {
                // DEEP ERROR AUDIT
                const errorDetails = {
                    message: apiError.message,
                    status: apiError.status,
                    name: apiError.name,
                    stack: apiError.stack,
                    details: apiError.details || null,
                    cause: apiError.cause ? apiError.cause.toString() : null
                };
                
                if (apiError.response) {
                    errorDetails.responseStatus = apiError.response.status;
                    errorDetails.responseStatusText = apiError.response.statusText;
                }
                
                const deepErrorDump = JSON.stringify(errorDetails, null, 2);
                onLog(`\n[AI WRAPPER - RAW ERROR DUMP (Agent ${agentId})]\n${deepErrorDump}\n[END RAW ERROR DUMP]\n`);
                console.error(`[AI WRAPPER - RAW ERROR DUMP (Agent ${agentId})]\n`, deepErrorDump);

                const errStr = typeof apiError.message === 'string' ? apiError.message : JSON.stringify(apiError);
                const isRegionBlocked = errStr.includes('User location is not supported') 
                    || apiError.status === 412 
                    || errStr.includes('FAILED_PRECONDITION')
                    || errStr.includes('412');

                if (isRegionBlocked) {
                    const warnMsg = `[DEFENSIVE AI] Zablokowano zaawansowane parametry dla agenta ${agentId} przez restrykcję regionu/API (status: ${apiError.status || 'N/A'}). Uruchamiam cichy Fallback (degradacja do czystego modelu).`;
                    console.warn(warnMsg);
                    onLog(`[AI WRAPPER - OSTRZEŻENIE] ${warnMsg}`);
                    const fallbackConfig = { ...config };
                    delete fallbackConfig.tools;
                    delete fallbackConfig.thinkingConfig;
                    
                    response = await ai.models.generateContent({
                        model: model,
                        contents: prompt,
                        config: fallbackConfig
                    });
                } else {
                    throw apiError;
                }
            }
        }

        // ==================================================================================
        // WSPÓLNE PRZETWARZANIE ODPOWIEDZI (dla obu ścieżek)
        // ==================================================================================
        const duration = Date.now() - startTime;
        const metadata = mergedUsage || response.usageMetadata || {};
        
        const usage = {
            promptTokenCount: metadata.promptTokenCount || 0,
            candidatesTokenCount: metadata.candidatesTokenCount || 0,
            thoughtsTokenCount: metadata.thoughtsTokenCount || 0,
            totalTokenCount: metadata.totalTokenCount || 0
        };

        const candidate = response.candidates && response.candidates[0];
        const isMaxTokens = candidate && candidate.finishReason === 'MAX_TOKENS';
        const isRecitation = candidate && candidate.finishReason === 'RECITATION';

        // Obowiązkowa telemetria (S-7)
        if (typeof aiMetricsService.logUsage === 'function') {
            const errorMsg = isMaxTokens ? "MAX_TOKENS" : (isRecitation ? "RECITATION" : null);
            await aiMetricsService.logUsage(agentId, model, usage, !isMaxTokens && !isRecitation, 1, errorMsg);
        }

        if (isMaxTokens) {
            throw new Error(`[ALERT] Agent ${agentId} przepalił tokeny i został odłączony (limit: ${maxOutputTokens || 'domyślny'}).`);
        }
        if (isRecitation) {
            throw new Error('BLOKADA RECITATION: Agent skopiował zbyt dużo tekstu z internetu (zablokowane przez filtry bezpieczeństwa).');
        }

        // Zwracanie odpowiedzi
        let parsedResult;
        if (schema) {
            try {
                let text = response.text;
                if (!text) throw new Error('Brak tekstu w odpowiedzi API (pusta odpowiedź).');
                
                text = text.trim();
                if (text.startsWith('```json')) text = text.substring(7);
                else if (text.startsWith('```')) text = text.substring(3);
                if (text.endsWith('```')) text = text.substring(0, text.length - 3);
                text = text.trim();

                // Ekstrakcja JSON z potencjalnych śmieci (zabezpieczenie V1)
                const firstBrace = text.indexOf('{');
                const lastBrace = text.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace > firstBrace) {
                    text = text.substring(firstBrace, lastBrace + 1);
                }

                parsedResult = JSON.parse(text);
            } catch (err) {
                if (err.message.includes('pusta odpowiedź')) throw err;
                console.error(`[V2 Wrapper] JSON Parse Error w agencie ${agentId}: ${err.message}. Raw text (first 500): ${(response.text || '').substring(0, 500)}`);
                parsedResult = { rawText: response.text, error: "JSON Parse failed" };
            }
        } else {
            if (!response.text) {
                throw new Error('Brak tekstu w odpowiedzi API (pusta odpowiedź).');
            }
            parsedResult = response.text;
        }

        const endMsg = `[V2 Wrapper] Agent ${agentId} zakończony w ${duration}ms. Tokeny: prompt=${usage.promptTokenCount}, output=${usage.candidatesTokenCount}, thinking=${usage.thoughtsTokenCount}, total=${usage.totalTokenCount}`;
        console.log(endMsg);
        onLog(`[AI WRAPPER] ${endMsg}`);

        return {
            result: parsedResult,
            usage
        };
    } catch (error) {
        console.error(`[V2 Wrapper] Błąd w agencie ${agentId}:`, error.message);
        onLog(`\n[AI WRAPPER - KRYTYCZNY BŁĄD]\nAgent ID: ${agentId}\nWyjątek: ${error?.message || error}\nStack: ${error?.stack || 'Brak'}\n[AI WRAPPER - KONIEC BŁĘDU]`);
        if (typeof aiMetricsService.logUsage === 'function') {
            const { model } = getNodeConfig(agentId);
            await aiMetricsService.logUsage(agentId, model, {}, false, 1, error.message);
        }
        throw error;
    }
}

module.exports = {
    callAgentWithTelemetry,
    extractGroundedTextFromResponse,
    Type,
    ThinkingLevel
};
