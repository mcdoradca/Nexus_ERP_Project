const { GoogleGenAI, Type, ThinkingLevel } = require('@google/genai');
const aiMetricsService = require('../../core/ai.metrics.service');
const { getNodeConfig } = require('./config/nodes.config.js');

// Inicjalizacja klienta Google Gen AI (nie używamy starego @google/generative-ai)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
    
    const { model, thinkingLevel, grounding, temperature } = getNodeConfig(agentId);
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

        // Obowiązkowa telemetria (S-7)
        if (typeof aiMetricsService.logUsage === 'function') {
            await aiMetricsService.logUsage(agentId, model, usage, true, 1, null);
        }

        // Zwracanie odpowiedzi
        let parsedResult;
        if (schema) {
            try {
                parsedResult = JSON.parse(response.text);
            } catch (err) {
                // Jeśli parsowanie zawiedzie, zwracamy surowy tekst jako fallback lub rzucamy
                parsedResult = { rawText: response.text, error: "JSON Parse failed" };
            }
        } else {
            parsedResult = response.text;
        }

        return {
            result: parsedResult,
            usage
        };
    } catch (error) {
        console.error(`[V2 Wrapper] Błąd w agencie ${agentId}:`, error.message);
        throw error;
    }
}

module.exports = {
    callAgentWithTelemetry,
    Type,
    ThinkingLevel
};
