const { callAgentWithTelemetry } = require('./ai.wrapper.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROMPT_MASTER_AGENT_ID = "11";
const MANDATORY_PREFIX = ""; // Zostawione awaryjnie

const generationLocks = new Map();

async function generatePrompt(slot, productDetailsText, ean = null, imageBase64 = null, onLog = () => {}) {
    const instruction = "Wykonywanie instrukcji dla Photoroom według nowego wzorca z PIM i obrazem referencyjnym.";

    let releaseLock = null;
    if (ean) {
        if (!generationLocks.has(ean)) {
            generationLocks.set(ean, Promise.resolve());
        }
        const previousLock = generationLocks.get(ean);
        const nextLock = new Promise(resolve => releaseLock = resolve);
        generationLocks.set(ean, previousLock.then(() => nextLock));
        await previousLock;
    }

    try {

        const systemPrompt = `Dostałeś opis produktu.Twoim zadaniem jest stworzenie sceny pokazującej produkt w jego naturalnym środowisku. Opis produktu ma być konkretny, zwięzły i przeznaczony dla Agent w Photoroom. Produkt ma być w 100% oryginalny. Nie wolno Ci umieszczć produktu w centrum kadru i w pierwszej linii.

Opis produktu:
${productDetailsText}
`.trim();

        console.log(`[Prompt Master] Generowanie promptu dla slota ${slot}... (Agent ID: ${PROMPT_MASTER_AGENT_ID})`);
        
        onLog(`\n[TX - START DO AGENTA 11]\n${systemPrompt}\n[TX - KONIEC]`);

        const promptPayload = [systemPrompt];
        // Zrezygnowano z przesyłania imageBase64 do modelu LLM w celu odciążenia
        // zasobów (Agent opiera się wyłącznie na systemPrompt i PIM).

        const response = await callAgentWithTelemetry({
            agentId: PROMPT_MASTER_AGENT_ID,
            prompt: promptPayload,
            onLog
        });

        let rawPrompt = typeof response.result === 'string' ? response.result : JSON.stringify(response.result);
        rawPrompt = rawPrompt.trim();

        // Upewniamy się, że to faktycznie czysty tekst
        const finalPrompt = MANDATORY_PREFIX + rawPrompt;

        // Zapis do bazy usunięty zgodnie z żądaniem (agent nie otrzymuje już historii)

        console.log(`\n=== [Prompt Master] PEŁNY PROCES DLA SLOTA ${slot} ===`);
        console.log(`[1/3] Instrukcja dla Agenta: ${instruction}`);
        console.log(`[2/3] Odpowiedź Agenta LLM (Czysta kreacja):\n${rawPrompt}`);
        console.log(`[3/3] Finalny prompt gotowy dla Photoroom (z doklejonym prefiksem):\n${finalPrompt}`);
        console.log(`=========================================================\n`);

        onLog(`\n[RX - ODPOWIEDŹ Z AGENTA 11]\n${rawPrompt}\n[RX - KONIEC]`);
        onLog(`\n[TX-FINAL - GOTOWY PROMPT DLA PHOTOROOM]\n${finalPrompt}\n[TX-FINAL - KONIEC]`);

        return finalPrompt;
    } catch (error) {
        console.error("[Prompt Master] Błąd generowania promptu:", error.message);
        onLog(`\n[ERROR - AGENT 11] KRYTYCZNY BŁĄD GENEROWANIA PROMPTU\nZłapano wyjątek: ${error?.message || error}\nStack: ${error?.stack || 'Brak stack trace'}\nZwracam domyślny bezpieczny prompt (Fallback).\n[ERROR - KONIEC]`);
        // Fallback w razie błędu - bezpieczny, neutralny prompt z zachowaniem prefiksu
        return MANDATORY_PREFIX + "W tle stoi lekko rozmyty produkt ze zdjęcia referencyjnego. Znajduje się w szerokiej przestrzeni. Na ostrym pierwszym planie widoczne są neutralne detale.";
    } finally {
        if (releaseLock) {
            releaseLock();
        }
    }
}

module.exports = {
    generatePrompt
};
