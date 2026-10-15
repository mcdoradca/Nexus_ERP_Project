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
        console.log(`[Prompt Master] LLM (Agent 11) tymczasowo wyłączony dla slota ${slot}. Wstrzykuję stały prompt.`);
        
        const hardcodedPrompt = "Odczytaj wszystkie informacje ze zdjęcia produktu zwłaszcza funkcje i zastosowanie. Następnie wygeneruj zdjęcie z produktem w tle nawiązujące do jego charakteru, cech i funkcji odczytanych ze zdjęcia. Bądź oryginalny i nie powtarzaj ujęć. Produkt nie może stać w centrum kadru. Produkt nie może stać na pierwszym planie. Produkt jest dodatkiem do zdjęcia a nie jego głównym elementem. Produkt musi posiadać w 100% zgodną etykietę z załączonym oryginałem. Stosuj jasne oświetlenie i nowoczesne ujęcia. Wykonujesz zdjęcia do e-commerce więc muszą zachęcać do zakupu. Nie wolno Ci nic pisać na zdjęciu.";
        
        const finalPrompt = MANDATORY_PREFIX + hardcodedPrompt;
        
        onLog(`\n[AGENT 11 WYŁĄCZONY - WSTRZYKNIĘTO STAŁY PROMPT]\n${finalPrompt}\n[TX-FINAL - KONIEC]`);

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
