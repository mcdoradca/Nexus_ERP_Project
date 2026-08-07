const { callAgentWithTelemetry } = require('./ai.wrapper.js');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PROMPT_MASTER_AGENT_ID = "11";
const MANDATORY_PREFIX = "Produkt musi być zawsze w 100% taki jak na zdjęciu bazowym. Nie wolno zmieniać kształtu, koloru produktu, nie wolno zmieniać napisów na etykiecie - etykieta ma być zawsze w zachowana. ";

async function generatePrompt(slot, productDetailsText, ean = null) {
    const isEven = slot % 2 === 0;
    
    let instruction = "";
    if (isEven) {
        instruction = "Wykreuj scenę pokazującą ten produkt w użyciu.";
    } else {
        instruction = "Wykreuj scenę, gdzie produkt jest daleko od oczu, na drugim lub trzecim planie.";
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
Twoim jedynym zadaniem jest wygenerować KRÓTKI, ZWIĘZŁY i WYBITNY prompt w języku polskim opisujący scenę dla zdjęcia.

TWOJE ZADANIE: ${instruction}

WYMÓG KREATYWNOŚCI: 
Odczytaj z opisu funkcję produktu i wykorzystaj ją do kreowania niepowtarzalnych ujęć lifestylowych.
Zaskocz mnie różnorodnością! Unikaj zbliżeń produktu i ustawiania go w centrum kadru.${historySection}

## OBECNOŚĆ CZŁOWIEKA W KADRZE — ZASADY

### 1. Stan domyślny
Prompt opisuje sam produkt: bez ludzi, bez dłoni, bez części ciała.
To jest stan bazowy i NIE wymaga uzasadnienia. Brak dłoni nigdy nie jest błędem.
Dłoń i człowiek to dwie osobne kategorie wyjątków, każda z własnym warunkiem i licznikiem.
Człowiek nie jest „mocniejszą wersją" dłoni — nie eskaluj: dłoń → dwie dłonie → przedramię → postać.

### 2. Dłoń — warunki dopuszczenia
Dłoń dodajesz WYŁĄCZNIE, gdy spełniony jest jeden z warunków:
- SKALA — produkt nie ma czytelnego rozmiaru bez odniesienia
- UŻYCIE — kadr pokazuje moment działania
- SPOCZYNEK - kadr pokazje moment chwytania


### 3. Człowiek — warunki dopuszczenia
Człowieka dodajesz WYŁĄCZNIE, gdy spełniony jest jeden z warunków:
- KONTEKST — produkt nabiera sensu dopiero w scenie użycia 
- SKALA DUŻA — produkt na tyle duży, że sama dłoń nic nie mówi 
- RYTUAŁ — liczy się moment i nastrój, nie sam przedmiot 

Żaden warunek z sekcji 2 i 3 nie jest spełniony → prompt bez dłoni i bez człowieka.

### 4. Limity w obrębie jednego EAN
- maksymalnie 1 prompt z dłonią
- maksymalnie 1 prompt z człowiekiem
- nigdy oba w tym samym prompcie
- nigdy bezpośrednio po sobie
- pierwszy prompt w zestawie zawsze czysto produktowy

### 5. Zakazy bezwzględne
Nie dodajesz dłoni ani człowieka, gdy:
- to packshot / zdjęcie główne na marketplace
- produkt jest tak mały, że palce zajmą więcej kadru niż on

### 6. Różnicowanie promptów
Prompty w obrębie jednego EAN różnicujesz przez: tło, powierzchnię, światło,
kąt kamery, kadrowanie, rekwizyty otoczenia, porę dnia, kolorystykę.

Obecność dłoni lub człowieka NIE JEST osią różnicowania.
Dwa prompty bez dłoni nie są duplikatami, jeśli różnią się czymkolwiek z listy powyżej.
Zmiana samego chwytu (z boku / od góry / dwie dłonie) nie liczy się jako nowy wariant.
Nakaz nieduplikowania nigdy nie jest podstawą do dodania dłoni ani człowieka.

### 7. Kontrola — obowiązkowa przed każdym promptem
Podaj w jednej linii:
[EAN: <numer> | prompt <n> z <N> | dłonie: <x> | ludzie: <y>]

Liczniki wypełniasz na podstawie faktycznej historii promptów tego EAN, nie z pamięci.
Jeśli dłonie ≥ 1 → ten prompt bez dłoni. Jeśli ludzie ≥ 1 → ten prompt bez człowieka.
Poprzedni prompt zawierał dłoń lub człowieka → ten nie zawiera żadnego z nich.

Gdy mimo to dodajesz, dopisz obok prompta: "powód: <nazwa warunku z sekcji 2 lub 3>".
Jeśli powód brzmi "ciekawiej", "naturalniej", "dla ożywienia kadru", "dla różnorodności"
— warunek nie jest spełniony. Usuń.

ZWRÓĆ TYLKO I WYŁĄCZNIE CZYSTY TEKST PROMPTU ORAZ LINIĘ KONTROLNĄ.

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

        // Tarcza błędów: Wycięcie technicznej linii kontrolnej i powodu z promptu lecącego do Photoroom
        const cleanPrompt = rawPrompt
            .split('\n')
            .filter(line => !line.trim().startsWith('[EAN:') && !line.trim().toLowerCase().startsWith('powód:'))
            .join('\n')
            .trim();

        // Upewniamy się, że to faktycznie czysty tekst
        const finalPrompt = MANDATORY_PREFIX + cleanPrompt;

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
