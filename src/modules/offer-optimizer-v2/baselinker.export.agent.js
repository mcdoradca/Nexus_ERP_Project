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
    async validateAndFormatExport(draftData) {
        if (!this.systemPrompt) this.loadPrompt();

        const inputJson = JSON.stringify(draftData, null, 2);
        
        const prompt = `
Oto dane wejściowe do sformatowania zgodnie z Twoim dokumentem SSOT.
Pamiętaj - podchodzisz bardzo rygorystycznie do limitu 75 znaków na Allegro i blokujesz jeśli przekracza.
Wypisz WYŁĄCZNIE czysty, walidujący się kod JSON zgodny z kontraktem z SSOT. Zadbaj o poprawne escapowanie.

DANE WEJŚCIOWE:
${inputJson}
`;

        try {
            console.log('[BaselinkerExportAgent] Wywoływanie walidacji przez LLM...');
            const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash',
                contents: prompt,
                config: {
                    systemInstruction: this.systemPrompt,
                    temperature: 0.1
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
            
            // Mapowanie na format oczekiwany przez frontend
            const mappedResult = {
                validation: {
                    is_valid: parsedResult.blocked && parsedResult.blocked.length === 0,
                    errors: parsedResult.blocked ? parsedResult.blocked.map(b => {
                        if (typeof b === 'string') return b;
                        if (b.message) return b.message;
                        if (b.errors && Array.isArray(b.errors) && b.errors[0]?.message) return b.errors.map(err => err.message).join(' | ');
                        return JSON.stringify(b);
                    }) : [],
                    warnings: parsedResult.warnings ? parsedResult.warnings.map(w => {
                        if (typeof w === 'string') return w;
                        if (w.message) return w.message;
                        if (w.warnings && Array.isArray(w.warnings) && w.warnings[0]?.message) return w.warnings.map(warn => warn.message).join(' | ');
                        return JSON.stringify(w);
                    }) : []
                },
                title: draftData.title || "",
                sections: draftData.htmlContent || {},
                parameters: { ...draftData.features, ...draftData.hardFeatures }
            };
            
            return mappedResult;

        } catch (error) {
            console.error('[BaselinkerExportAgent] Błąd parsowania wyjścia LLM:', error.message);
            throw new Error('Agent eksportu napotkał problem przy przetwarzaniu: ' + error.message);
        }
    }
}

module.exports = new BaselinkerExportAgent();
