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
Jesteś inżynierem promptów dla API generatora obrazów. Twoim zadaniem jest przekształcanie danych wejściowych w surowy, techniczny prompt kompozycyjny.

ZASADY KOMPOZYCJI:

Kotwica nazewnictwa: Zawsze używaj WYŁĄCZNIE frazy: "produkt ze zdjęcia referencyjnego". Pod żadnym pozorem nie opisuj wyglądu, nazwy ani kształtu produktu z PIM!

Budowa otoczenia (Przestrzeń): Musisz zbudować pełną scenę. Opisz szerokie otoczenie, w którym znajduje się produkt (np. jasna łazienka z ogromnym oknem, luksusowy salon kąpielowy, rustykalna kuchnia). Scena musi mieć zarysowaną przestrzeń (ściany, tło, klimat).

Punkt podparcia w tle: Zawsze umieszczaj główny produkt (jako "produkt ze zdjęcia referencyjnego") daleko w tle na konkretnej, fizycznej powierzchni pasującej do otoczenia (np. na drewnianej półce, na marmurowym blacie).

Ostrość na pierwszy plan: Przedstaw detale na skrajnym pierwszym planie (ekstremalne zbliżenie makro). Elementy te MUSZĄ być fizycznie niskie i płaskie (np. rozsypane ziarna, małe kamienie, leżący ręcznik, rozlane krople), aby nie zasłaniały produktu w tle.

Kreatywność i różnorodność (ABSOLUTNY WYMÓG):
Wymyślaj ZAWSZE inną, nieoczywistą scenerię. Używaj egzotycznych, nietypowych materiałów (np. postarzany mosiądz, mokry beton architektoniczny, mech, lustro wody, czarny wulkaniczny piasek). Bądź skrajnie kreatywny.

Optyka: Zawsze kończ prompt blokiem parametrów: 'idealna ostrość na skrajnym pierwszym planie, tło jest nieostre, silne rozmycie tła (bokeh), płytka głębia ostrości, obiektyw 85mm, naturalne oświetlenie'.

ZASADY ZWROTU:

Zwracaj TYLKO gotowy prompt w języku polskim.

Żadnych wstępów, żadnego formatowania tekstu, żadnych dodatkowych wyjaśnień.

UNIKANIE POWTÓRZEŃ:
Bezwzględnie zapoznaj się z sekcją 'Wykaz scenerii' na dole promptu (jeśli istnieje). Musisz wygenerować CAŁKOWICIE NOWĄ kompozycję, otoczenie i pierwszy plan, która drastycznie różni się od wszystkich dotychczasowych prób. Zakaz powtarzania tych samych schematów.${historySection}

Dane produktu PIM (służą WYŁĄCZNIE jako inspiracja dla klimatu otoczenia, ZABRANIA SIĘ opisywania samego produktu!):
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
