const { callAgentWithTelemetry } = require('./ai.wrapper.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROMPT_MASTER_AGENT_ID = "11";
const MANDATORY_PREFIX = "Produkt referencyjny jest widoczny w kadrze. Cała sceneria opisana w prompcie musi się zmieścić w obrazie. ";

const generationLocks = new Map();

async function generatePrompt(slot, productDetailsText, ean = null, onLog = () => {}) {
    const instruction = "Wykreuj scenę, gdzie produkt jest ustawiony w całkowicie losowym miejscu w tle, ale bezwzględnie poza centrum kadru. Produkt musi pozostać widoczny.";

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
        let previousPrompts = [];
        if (ean) {
            const cacheKey = `prompt_history_${ean}`;
            const cacheRecord = await prisma.agentCache.findUnique({ where: { cacheKey } });
            if (cacheRecord && Array.isArray(cacheRecord.value)) {
                previousPrompts = cacheRecord.value;
            }
        }

        const historySection = previousPrompts.length > 0 
            ? `\nWykaz scenerii, które użyłeś już dla tego EAN (absolutny ZAKAZ powtarzania ich):\n- ${previousPrompts.join('\n- ')}` 
            : "";

        const systemPrompt = `
Jesteś wybitnym asystentem ds. opisów przestrzennych.
Otrzymasz dane produktu z bazy PIM (Product Information Management).
Twoim jedynym zadaniem jest wygenerować KRÓTKI, ZWIĘZŁY i WYBITNY opis wizji otoczenia w języku POLSKIM. Upewnij się, że w opisie znajduje się absolutny zakaz centralnego pozycjonowania produktu. Na końcu opisu zawsze dodaj słowa kluczowe podnoszące jakość (np. ostre detale, profesjonalna aranżacja, perfekcyjne światło).

ZAKAZ MODYFIKACJI PRODUKTU: Masz absolutny zakaz opisywania w wizji cech samego produktu (np. zmiany koloru patyczków zapachowych, materiału, kształtu). Produkt referencyjny jest święty.

BEZWZGLĘDNA OBECNOŚĆ PRODUKTU: Produkt referencyjny MUSI ZAWSZE znajdować się w opisywanej przestrzeni. Może stać daleko w tle, być za mgłą, parą lub mocno rozmyty (zależnie od polecenia), ale w Twoim opisie musi fizycznie istnieć w kreowanej wizji jako jej część.

ZAKAZANE MOTYWY: Masz absolutny zakaz używania w opisie motywów lepienia garnków, koła garncarskiego oraz mrocznego klimatu stolarni/warsztatu.

TWOJE ZADANIE: Wykreuj wizję, gdzie produkt jest ustawiony w całkowicie losowym miejscu w tle, ale bezwzględnie poza centrum. Produkt musi pozostać widoczny.

WYMÓG KREATYWNOŚCI: 
Przeanalizuj do czego służy produkt i wylosuj JEDNO, konkretne, ale nieszablonowe otoczenie dla niego. 
Zaskocz mnie różnorodnością!${historySection}

ZWRÓĆ TYLKO I WYŁĄCZNIE CZYSTY TEKST OPISU, BEZ ŻADNYCH ZNACZNIKÓW, BEZ WSTĘPÓW I BEZ FORMATOWANIA JSON.

Dane produktu PIM:
${productDetailsText}
`.trim();

        console.log(`[Prompt Master] Generowanie promptu dla slota ${slot}... (Agent ID: ${PROMPT_MASTER_AGENT_ID})`);
        
        onLog(`\n[TX - START DO AGENTA 11]\n${systemPrompt}\n[TX - KONIEC]`);

        const response = await callAgentWithTelemetry({
            agentId: PROMPT_MASTER_AGENT_ID,
            prompt: systemPrompt,
            onLog
        });

        let rawPrompt = response.result;
        rawPrompt = rawPrompt.trim();

        // Upewniamy się, że to faktycznie czysty tekst
        const finalPrompt = MANDATORY_PREFIX + rawPrompt;

        if (ean) {
            previousPrompts.push(rawPrompt);
            await prisma.agentCache.upsert({
                where: { cacheKey: `prompt_history_${ean}` },
                update: { value: previousPrompts },
                create: { cacheKey: `prompt_history_${ean}`, value: previousPrompts }
            });
        }

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
        return MANDATORY_PREFIX + "Produkt umieszczony w neutralnym, estetycznym otoczeniu z doskonałym oświetleniem.";
    } finally {
        if (releaseLock) {
            releaseLock();
        }
    }
}

module.exports = {
    generatePrompt
};
