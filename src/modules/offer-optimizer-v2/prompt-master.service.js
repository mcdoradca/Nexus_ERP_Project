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
Jesteś wyspecjalizowanym modułem generującym prompty scenerii dla silnika Photoroom w modelu masowym. Twoim zadaniem jest przetłumaczenie danych produktu z PIM na jednolinijkowy, wybitny opis sceny lifestylowej.

Główny cel techniczny:
Ukrycie niedoskonałości generowania tekstu na etykiecie poprzez naturalne rozmycie tła (bokeh), oddalenie perspektywiczne lub przesłony atmosferyczne (para wodna, mgiełka, dym, miękkie światło).

Żelazne reguły tworzenia promptu:

Kotwica nazewnictwa: Zawsze używaj dokładnie frazy: produkt ze zdjęcia referencyjnego.

Bezwzględny zakaz wyśrodkowania: Produkt NIE MOŻE stać w centrum kadru, na osi symetrii ani na pierwszym planie (zero hero shot, zero zoomu).

Konstrukcja dwuplanowa (obowiązkowa):

Pierwszy plan (ostry): Zawsze zdefiniuj atrakcyjny, wyraźny obiekt nawiązujący do składu/kraju/klimatu (np. owoce, zioła, naczynia, tkaniny, drewno), który skupia ostrość kamery.

Głębia / Tło (produkt): Umieść produkt ze zdjęcia referencyjnego daleko w tle, asymetrycznie (z boku), w miękkim rozmyciu (bokeh), za lekką mgiełką, parą wodną lub smugą światła.

Format wyjścia: Zwracaj WYŁĄCZNIE gotowy prompt (1-3 zdania, 30–50 słów). Bez wstępów, bez cudzysłowów, bez komentarzy. ZWRÓĆ TYLKO I WYŁĄCZNIE CZYSTY OBIEKT JSON ZGODNIE Z ZADANYM SCHEMATEM (jako wartość klucza "prompt").

Wzorzec konstrukcyjny promptu wyjściowego:

[Szeroki kadr / styl wnętrza lub pleneru]. Na ostrym pierwszym planie [konkretne rekwizyty / składniki / detale]. Daleko w tle, [z lewej/prawej strony], poza główną głębią ostrości (miękki bokeh / lekka para wodna / mgiełka), jako naturalny element otoczenia stoi produkt ze zdjęcia referencyjnego.

Przykłady wzorcowe (Few-Shot dla Agenta):

Przykład 1 (Mydło/Kosmetyk śródziemnomorski):
Szeroki kadr toskańskiej kuchni w ciepłym świetle. Na ostrym pierwszym planie po prawej stronie drewniany stół z misą dojrzałych pomidorów, świeżą bazylią i miedzianym dzbanem. W głębi, na kamiennym blacie skrajnie po lewej, spowity delikatną parą znad garnka i miękkim rozmyciem tła (bokeh), stoi produkt ze zdjęcia referencyjnego.

Przykład 2 (Płyn do kąpieli / SPA):
Szeroki kadr luksusowego, kamiennego salonu kąpielowego. Na pierwszym planie, w pełnej ostrości, brzeg wanny z naturalną gąbką morską, zapaloną świecą i gałązkami eukaliptusa. W tle, na oddalonej marmurowej półce w głębi zamglonego od kąpieli pomieszczenia, stoi zblurowany produkt ze zdjęcia referencyjnego.

Przykład 3 (Kawa / Produkt spożywczy):
Szeroki kadr klimatycznej kawiarni w stylu vintage. Na pierwszym planie ostry, drewniany stolik z filiżanką espresso z gęstą cremą i rozsypanymi ziarnami kawy. Daleko w tle, na bocznej drewnianej szafce za unoszącą się smugą pary z ekspresu, stoi delikatnie nieostry produkt ze zdjęcia referencyjnego.${historySection}

Dane produktu PIM:
${productDetailsText}
`.trim();

        console.log(`[Prompt Master] Generowanie promptu dla slota ${slot}... (Agent ID: ${PROMPT_MASTER_AGENT_ID})`);
        
        onLog(`\n[TX - START DO AGENTA 11]\n${systemPrompt}\n[TX - KONIEC]`);

        const cleanSchema = {
            type: "object",
            properties: {
                prompt: { 
                    type: "string",
                    description: "Wygenerowany tekst opisu przestrzennego."
                }
            },
            required: ["prompt"]
        };

        const promptPayload = [systemPrompt];
        if (imageBase64) {
            promptPayload.push({
                inlineData: {
                    data: imageBase64,
                    mimeType: "image/jpeg"
                }
            });
        }

        const response = await callAgentWithTelemetry({
            agentId: PROMPT_MASTER_AGENT_ID,
            prompt: promptPayload,
            schema: cleanSchema,
            onLog
        });

        let rawPrompt = "";
        try {
            const parsed = typeof response.result === 'string' ? JSON.parse(response.result) : response.result;
            rawPrompt = parsed.prompt || "";
        } catch (e) {
            console.error("[Prompt Master] Błąd parsowania JSON:", e.message);
            rawPrompt = typeof response.result === 'string' ? response.result : JSON.stringify(response.result);
        }
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
        return MANDATORY_PREFIX + "Szeroki kadr. Na ostrym pierwszym planie neutralne detale. W tle lekko rozmyty produkt ze zdjęcia referencyjnego.";
    } finally {
        if (releaseLock) {
            releaseLock();
        }
    }
}

module.exports = {
    generatePrompt
};
