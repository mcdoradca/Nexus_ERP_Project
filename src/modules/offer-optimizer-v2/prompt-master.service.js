const { callAgentWithTelemetry } = require('./ai.wrapper.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROMPT_MASTER_AGENT_ID = "11";
const MANDATORY_PREFIX = "Produkt musi pozostać dokładnie taki sam jak na oryginalnym zdjęciu referencyjnym. Pod żadnym pozorem nie zmieniaj jego kształtu, koloru ani tekstu na etykiecie - etykieta musi zostać zachowana w stanie idealnym. Produkt referencyjny musi ZAWSZE być widoczny i fizycznie umieszczony na zdjęciu (nawet jeśli znajduje się w dalekim tle, jest zblurowany lub lekko przysłonięty mgłą/parą) - absolutny zakaz generowania scen bez oryginalnego produktu. NIE umieszczaj produktu w centrum kadru, używaj kompozycji asymetrycznej (off-center). ";

async function generatePrompt(slot, productDetailsText, ean = null) {
    const isEven = slot % 2 === 0;
    
    let instruction = "";
    if (isEven) {
        instruction = "Wykreuj scenę pokazującą ten produkt w użyciu. Wolno Ci użyć na zdjęciu człowieka (produkt może być delikatnie trzymany w dłoni - maksymalnie na co 4 zdjęciu). BEZWZGLĘDNY WYMÓG: Napisy na etykiecie produktu muszą być perfekcyjnie czytelne, a sama etykieta w 100% oryginalna, bez żadnych zniekształceń AI.";
    } else {
        instruction = "Wykreuj scenę, gdzie produkt jest daleko od oczu, na drugim lub trzecim planie, za mgłą zblurowany praktycznie niewidoczny.";
    }

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
Twoim jedynym zadaniem jest wygenerować KRÓTKI, ZWIĘZŁY i WYBITNY prompt w języku POLSKIM opisujący scenę dla zdjęcia. Upewnij się, że w prompcie znajduje się wymóg asymetrycznej kompozycji (off-center) i absolutny zakaz umieszczania produktu na samym środku kadru. Na końcu promptu zawsze dodaj słowa kluczowe podnoszące jakość (np. fotorealistyczne, profesjonalna fotografia, kinowe oświetlenie, ostra ostrość).

ZAKAZ MODYFIKACJI PRODUKTU: Masz absolutny zakaz opisywania w prompcie cech samego produktu (np. zmiany koloru patyczków zapachowych, materiału, kształtu). Produkt referencyjny jest święty.

BEZWZGLĘDNA OBECNOŚĆ PRODUKTU: Produkt referencyjny MUSI ZAWSZE znajdować się na zdjęciu. Może stać daleko w tle, być za mgłą, parą lub mocno zblurowany (zależnie od polecenia), ale w Twoim prompcie musi fizycznie istnieć w kreowanej scenie jako jej część.

TWOJE ZADANIE: ${instruction}

WYMÓG KREATYWNOŚCI: 
Przeanalizuj do czego służy produkt i wylosuj JEDNO, konkretne, ale nieszablonowe otoczenie dla niego. 
Zaskocz mnie różnorodnością!${historySection}

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
