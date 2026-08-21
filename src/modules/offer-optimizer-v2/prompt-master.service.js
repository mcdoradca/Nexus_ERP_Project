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

Konstrukcja dwuplanowa i opis przestrzeni (obowiązkowe):
Wymagane jest wygenerowanie pełnego opisu widoku otoczenia (opis szerokiej przestrzeni i głębi).
Musisz określić konkretne umiejscowienie przedmiotu w scenerii (gdzie konkretnie stoi, na jakiej powierzchni, w jakiej odległości od widza).

Głębia / Tło (produkt): Generację promptu ZAWSZE ZACZYNAJ od umiejscowienia produktu. Umieść produkt ze zdjęcia referencyjnego daleko w tle, asymetrycznie (z boku), określając konkretną powierzchnię (np. na dębowej półce ściennej 3 metry od widza). Produkt ma być w miękkim rozmyciu (bokeh), za lekką mgiełką, parą wodną lub smugą światła.

Pierwszy plan (ostry): Następnie opisz otoczenie i ostry pierwszy plan, który ma znajdować się przed produktem, blisko widza. Zdefiniuj tu atrakcyjny, wyraźny obiekt nawiązujący do składu (np. owoce, naczynia, drewno), który skupia ostrość kamery, podczas gdy produkt jest odsunięty w tło.

Format wyjścia: Zwracaj WYŁĄCZNIE gotowy prompt (1-3 zdania, 30–60 słów). Bez wstępów, bez cudzysłowów, bez komentarzy. ZWRÓĆ TYLKO I WYŁĄCZNIE CZYSTY OBIEKT JSON ZGODNIE Z ZADANYM SCHEMATEM (jako wartość klucza "prompt").

Wzorzec konstrukcyjny promptu wyjściowego:

Na [dokładny opis mebla/powierzchni na jakiej stoi, np. starym dębowym regale], [w konkretnej odległości od widza, np. 3 metry w głębi], [z lewej/prawej strony] stoi produkt ze zdjęcia referencyjnego. Produkt jest lekko rozmyty (bokeh / lekka para wodna). Dookoła niego rozpościera się [rozbudowany opis stylu wnętrza lub pleneru ze wskazaniem obszernej przestrzeni]. Dopiero na bardzo bliskim, ostrym pierwszym planie znajdują się [konkretne rekwizyty / składniki / detale].

Przykłady wzorcowe (Few-Shot dla Agenta):

Przykład 1 (Mydło/Kosmetyk śródziemnomorski):
Na kamiennym blacie skrajnie po lewej, spowity delikatną parą i miękkim rozmyciem (bokeh), stoi produkt ze zdjęcia referencyjnego. Dookoła rozpościera się szeroki kadr toskańskiej kuchni w ciepłym świetle. Na ostrym pierwszym planie przed widzem znajduje się drewniany stół z misą dojrzałych pomidorów, świeżą bazylią i miedzianym dzbanem.

Przykład 2 (Płyn do kąpieli / SPA):
Na oddalonej marmurowej półce w głębi zamglonego od kąpieli pomieszczenia, stoi zblurowany produkt ze zdjęcia referencyjnego. Tworzy on element luksusowego, kamiennego salonu kąpielowego. Na samym przodzie, w pełnej ostrości pierwszego planu, widać brzeg wanny z naturalną gąbką morską, zapaloną świecą i gałązkami eukaliptusa.

Przykład 3 (Kawa / Produkt spożywczy):
Daleko w tle, na bocznej drewnianej szafce za unoszącą się smugą pary, stoi delikatnie nieostry produkt ze zdjęcia referencyjnego. Osadzony jest w szerokim kadrze klimatycznej kawiarni w stylu vintage. Na bliskim, ostrym pierwszym planie znajduje się drewniany stolik z filiżanką espresso z gęstą cremą i rozsypanymi ziarnami kawy.${historySection}

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
        // Zrezygnowano z przesyłania imageBase64 do modelu LLM w celu odciążenia
        // zasobów (Agent opiera się wyłącznie na systemPrompt i PIM).

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
