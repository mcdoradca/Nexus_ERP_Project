const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

class BaselinkerExportAgent {
    constructor() {
        this.systemPrompt = '';
        this.loadPrompt();
    }

    loadPrompt() {
        try {
            const promptPath = path.join(__dirname, 'prompts', 'baselinker_export_agent.md');
            this.systemPrompt = fs.readFileSync(promptPath, 'utf8');
        } catch (error) {
            console.error('[BaselinkerExportAgent] Błąd ładowania promptu:', error.message);
            // Fallback wbudowany, na wypadek problemów z odczytem
            this.systemPrompt = 'Jesteś Agentem Nexus Export Formatter. Sprawdź format danych.';
        }
    }

    /**
     * Weryfikuje dane przez LLM i formuje ostateczny JSON dla payloadu BaseLinker.
     * @param {Object} draftData - dane wejściowe: title, htmlContent (sekcja1..6), product.features, hardFeatures
     */
    async validateAndFormatExport(agentInput) {
        if (!this.systemPrompt) this.loadPrompt();

        const inputJson = JSON.stringify(agentInput, null, 2);
        
        const prompt = `
Oto dane wejściowe do sformatowania zgodnie z Twoim dokumentem SSOT.
Wygeneruj payloady dla BaseLinkera na podstawie dostarczonego configu, product_map i products.
Wypisz WYŁĄCZNIE czysty, walidujący się kod JSON zgodny z kontraktem z SSOT (z właściwościami ready, blocked, warnings). Zadbaj o poprawne escapowanie.

DANE WEJŚCIOWE:
${inputJson}
`;

        try {
            console.log('[BaselinkerExportAgent] Wywoływanie walidacji przez LLM...');
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-1.5-pro-preview',
                contents: prompt,
                config: {
                    systemInstruction: this.systemPrompt,
                    temperature: 0.8
                }
            });

            // Wyszukanie czystego JSONa w odpowiedzi
            let cleanJson = response.text;
            if (cleanJson.includes('```json')) {
                cleanJson = cleanJson.split('```json')[1].split('```')[0].trim();
            } else if (cleanJson.includes('```')) {
                cleanJson = cleanJson.split('```')[1].split('```')[0].trim();
            }
            
            cleanJson = cleanJson.trim();
            
            // Próba sparsowania zwróconego JSONa
            const parsedResult = JSON.parse(cleanJson);
            
            // Zwracamy czysty obiekt JSON przygotowany przez Agenta
            return parsedResult;

        } catch (error) {
            console.error('[BaselinkerExportAgent] Błąd parsowania wyjścia LLM:', error.message);
            throw new Error('Agent eksportu napotkał problem przy przetwarzaniu: ' + error.message);
        }
    }
}

module.exports = new BaselinkerExportAgent();
