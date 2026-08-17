const { callAgentWithTelemetry } = require('./ai.wrapper.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROMPT_MASTER_AGENT_ID = "11";
const MANDATORY_PREFIX = "";

const generationLocks = new Map();

async function generatePrompt(slot, productDetailsText, ean = null, onLog = () => {}) {
    // Aktualnie wszystkie sloty (2, 3, 4, 5, 6) korzystają z tej samej zaufanej instrukcji oddalonego planu
    const instruction = "Wykreuj scenę, gdzie produkt stoi daleko w tle (na drugim lub trzecim planie), jest zblurowany (poza punktem ostrości), ale pozostaje w pełni widoczny i dostrzegalny jako element otoczenia.";

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
Jesteś wybitnym kreatorem scen (Prompt Masterem) dla generatora obrazów Photoroom AI.
Otrzymasz dane produktu z bazy PIM (Product Information Management).
Twoim jedynym zadaniem jest wygenerować KRÓTKI, ZWIĘZŁY i WYBITNY prompt w języku POLSKIM opisujący scenę dla zdjęcia. Upewnij się, że w prompcie znajduje się absolutny zakaz umieszczania produktu na samym środku kadru. Na końcu promptu zawsze dodaj słowa kluczowe podnoszące jakość (np. fotorealistyczne, profesjonalna fotografia, kinowe oświetlenie, ostra ostrość).

ZAKAZ MODYFIKACJI PRODUKTU: Masz absolutny zakaz opisywania w prompcie cech samego produktu (np. zmiany koloru patyczków zapachowych, materiału, kształtu). Produkt referencyjny jest święty.

BEZWZGLĘDNA OBECNOŚĆ PRODUKTU: Produkt referencyjny MUSI ZAWSZE znajdować się na zdjęciu. Może stać daleko w tle, być za mgłą, parą lub mocno zblurowany (zależnie od polecenia), ale w Twoim prompcie musi fizycznie istnieć w kreowanej scenie jako jej część.

ZAKAZANE MOTYWY: Masz absolutny zakaz używania w scenerii motywów lepienia garnków, koła garncarskiego oraz mrocznego klimatu stolarni/warsztatu.

TWOJE ZADANIE: ${instruction}

WYMÓG KREATYWNOŚCI: 
Przeanalizuj do czego służy produkt i wylosuj JEDNO, konkretne, ale nieszablonowe otoczenie dla niego. 
Zaskocz mnie różnorodnością!${historySection}

ZWRÓĆ TYLKO I WYŁĄCZNIE CZYSTY TEKST PROMPTU, BEZ ŻADNYCH ZNACZNIKÓW, BEZ WSTĘPÓW I BEZ FORMATOWANIA JSON.

Dane produktu PIM:
${productDetailsText}
`.trim();

        console.log(`[Prompt Master] Generowanie promptu dla slota ${slot}... (Agent ID: ${PROMPT_MASTER_AGENT_ID})`);
        
        onLog(`\n[TX - START DO AGENTA 11]\n${systemPrompt}\n[TX - KONIEC]`);

        const response = await callAgentWithTelemetry({
            agentId: PROMPT_MASTER_AGENT_ID,
            prompt: systemPrompt
        });

        let rawPrompt = response.result || "";
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
