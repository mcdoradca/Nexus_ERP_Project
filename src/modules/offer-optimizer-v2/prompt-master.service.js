const { callAgentWithTelemetry } = require('./ai.wrapper.js');

const PROMPT_MASTER_AGENT_ID = 11;
const MANDATORY_PREFIX = "Produkt musi być zawsze w 100% taki jak na zdjęciu bazowym. Nie wolno zmieniać kształtu, koloru produktu, nie wolno zmieniać napisów na etykiecie - etykieta ma być zawsze w zachowana. ";

async function generatePrompt(slot, productDetailsText) {
    const isEven = slot % 2 === 0;
    
    let instruction = "";
    if (isEven) {
        instruction = "Wykreuj scenę pokazującą ten produkt w użyciu.";
    } else {
        instruction = "Wykreuj scenę, gdzie produkt jest daleko od oczu, na drugim lub trzecim planie.";
    }

    const systemPrompt = `
Jesteś wybitnym kreatorem scen (Prompt Masterem) dla generatora obrazów Photoroom AI.
Otrzymasz dane produktu z bazy PIM (Product Information Management).
Twoim jedynym zadaniem jest wygenerować KRÓTKI, ZWIĘZŁY i WYBITNY prompt w języku polskim opisujący scenę dla zdjęcia.

TWOJE ZADANIE: ${instruction}

ZWRÓĆ TYLKO I WYŁĄCZNIE CZYSTY TEKST PROMPTU, BEZ ŻADNYCH ZNACZNIKÓW, BEZ WSTĘPÓW I BEZ FORMATOWANIA JSON.

Dane produktu PIM:
${productDetailsText}
`.trim();

    try {
        console.log(`[Prompt Master] Generowanie promptu dla slota ${slot}... (Agent ID: ${PROMPT_MASTER_AGENT_ID})`);
        
        const response = await callAgentWithTelemetry({
            agentId: PROMPT_MASTER_AGENT_ID,
            prompt: systemPrompt
        });

        let rawPrompt = response.result || "";
        rawPrompt = rawPrompt.trim();

        // Upewniamy się, że to faktycznie czysty tekst
        const finalPrompt = MANDATORY_PREFIX + rawPrompt;

        console.log(`[Prompt Master] Wygenerowano prompt pomyślnie.`);
        return finalPrompt;
    } catch (error) {
        console.error("[Prompt Master] Błąd generowania promptu:", error.message);
        // Fallback w razie błędu - bezpieczny, neutralny prompt z zachowaniem prefiksu
        return MANDATORY_PREFIX + "Produkt umieszczony w neutralnym, estetycznym otoczeniu z doskonałym oświetleniem.";
    }
}

module.exports = {
    generatePrompt
};
