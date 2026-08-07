const { GoogleGenAI, Type, ThinkingLevel } = require('@google/genai');
const aiMetricsService = require('../../core/ai.metrics.service');
const { getNodeConfig } = require('./config/nodes.config.js');

// Inicjalizacja klienta Google Gen AI (nie używamy starego @google/generative-ai)
const ai = new GoogleGenAI({ 
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: { timeout: 600000 } // 10 minut timeoutu dla ciężkich modeli jak gemini-3.1-pro-preview
});

/**
 * Wrapper telemetrii i wykonania dla modelu Gemini.
 * @param {Object} params
 * @param {string} params.agentId - Jawny identyfikator agenta (S-7)
 * @param {string} params.prompt - Złożony prompt
 * @param {Object} [params.schema] - Opcjonalny schemat JSON dla responseSchema
 * @returns {Object} Zwraca sparsowany obiekt JSON.
 */
async function callAgentWithTelemetry({ agentId, prompt, schema }) {
    if (!agentId) {
        throw new Error("BŁĄD BLOKUJĄCY (S-7): Wywołanie LLM bez jawnego agentId.");
    }
    
    const { model, thinkingLevel, grounding, temperature, maxOutputTokens } = getNodeConfig(agentId);
    if (!process.env.GEMINI_API_KEY) {
        // HITL: Brak klucza API, nie zgadywanie
        throw new Error("HITL: Brak klucza API (GEMINI_API_KEY) w środowisku.");
    }

    const config = {
        thinkingConfig: {
            thinkingLevel: thinkingLevel
        }
    };
    if (temperature !== undefined) {
        config.temperature = temperature;
    }
    if (maxOutputTokens !== undefined) {
        config.maxOutputTokens = maxOutputTokens;
    }

    if (grounding) {
        config.tools = [{ googleSearch: {} }];
    }

    if (schema) {
        config.responseMimeType = "application/json";
        config.responseSchema = schema;
    }

    console.log(`[V2 Wrapper] Uruchamianie agenta: ${agentId}, model: ${model}, thinking: ${thinkingLevel}`);
    const startTime = Date.now();

    try {
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: config
        });

        const duration = Date.now() - startTime;
        const metadata = response.usageMetadata || {};
        
        // Zczytywanie pełnego usageMetadata zgodnie z E1.3d
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
                parsedResult = JSON.parse(text.trim());
            } catch (err) {
                if (err.message.includes('pusta odpowiedź')) throw err;
                parsedResult = { rawText: response.text, error: "JSON Parse failed" };
            }
        } else {
            if (!response.text) {
                throw new Error('Brak tekstu w odpowiedzi API (pusta odpowiedź).');
            }
            parsedResult = response.text;
        }

        return {
            result: parsedResult,
            usage
        };
    } catch (error) {
        console.error(`[V2 Wrapper] Błąd w agencie ${agentId}:`, error.message);
        if (typeof aiMetricsService.logUsage === 'function') {
            const { model } = getNodeConfig(agentId);
            await aiMetricsService.logUsage(agentId, model, {}, false, 1, error.message);
        }
        throw error;
    }
}

module.exports = {
    callAgentWithTelemetry,
    Type,
    ThinkingLevel
};
