const axios = require('axios');
const https = require('https');
const aiWrapper = require('./ai.wrapper.js');
const baselinkerExtract = require('./baselinker.extract.js');
const { normalizeInciToLegalEnglish } = require('./normalization.js');

const imageHttpsAgent = new https.Agent({ 
    rejectUnauthorized: false,
    family: 4 
});

/**
 * Bezpieczne i odporne na WAF pobranie bufora obrazu z obsługą Data URI,
 * wielopoziomowej kaskady nagłówków (Tier 1-4) oraz weryfikacji MIME.
 */
async function fetchImageBuffer(url, timeoutMs = 15000, onLog = () => {}) {
    if (!url || typeof url !== 'string') {
        throw new Error('Brak poprawnego adresu URL obrazu.');
    }

    if (url.startsWith('data:')) {
        const matches = url.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
            return {
                buffer: Buffer.from(matches[2], 'base64'),
                mimeType: matches[1],
                tierUsed: 'Data URI'
            };
        }
    }

    let refererHeader = undefined;
    try {
        const parsedUrl = new URL(url);
        refererHeader = `${parsedUrl.protocol}//${parsedUrl.host}/`;
    } catch (_) {
        // Ignorujemy błędy parsowania nieprawidłowych stringów URL
    }

    const fetchTiers = [
        {
            name: 'Tier 1 (Browser + Referer)',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7,it;q=0.6',
                ...(refererHeader ? { 'Referer': refererHeader } : {})
            }
        },
        {
            name: 'Tier 2 (Googlebot-Image WAF Whitelist)',
            headers: {
                'User-Agent': 'Googlebot-Image/1.0',
                'Accept': 'image/*,*/*;q=0.8'
            }
        },
        {
            name: 'Tier 3 (No User-Agent / Minimal HTTP)',
            headers: {
                'Accept': '*/*'
            }
        },
        {
            name: 'Tier 4 (cURL Native)',
            headers: {
                'User-Agent': 'curl/7.88.1',
                'Accept': '*/*'
            }
        }
    ];

    const perAttemptTimeout = Math.max(3500, Math.floor(timeoutMs / fetchTiers.length));
    let lastError = null;

    for (let i = 0; i < fetchTiers.length; i++) {
        const tier = fetchTiers[i];
        try {
            const response = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: perAttemptTimeout,
                httpsAgent: imageHttpsAgent,
                headers: tier.headers
            });

            const contentType = response.headers['content-type'] || 'image/jpeg';
            const rawMime = contentType.split(';')[0].trim().toLowerCase();

            // Tarcza weryfikacji MIME: eliminacja fałszywych stron błędów HTML z kodem 200
            if (rawMime.includes('text/html') || rawMime.includes('text/plain') || rawMime.includes('application/json')) {
                throw new Error(`Serwer zwrócił dokument tekstowy (${rawMime}) zamiast pliku graficznego.`);
            }

            if (!response.data || response.data.length < 100) {
                throw new Error(`Pobrany bufor obrazu jest zbyt mały lub pusty (${response.data ? response.data.length : 0} B).`);
            }

            if (i > 0) {
                onLog(`[VISION EXTRACTOR] Obraz pobrany pomyślnie za pomocą tarczy awaryjnej: ${tier.name}.`);
            }

            return {
                buffer: Buffer.from(response.data),
                mimeType: rawMime.startsWith('image/') ? rawMime : 'image/jpeg',
                tierUsed: tier.name
            };
        } catch (err) {
            lastError = err;
            const errStatus = err.response ? `HTTP ${err.response.status}` : (err.code || err.message);
            if (i < fetchTiers.length - 1) {
                onLog(`[VISION EXTRACTOR] ${tier.name} odrzucony (${errStatus}). Przełączam na ${fetchTiers[i + 1].name}...`);
            }
        }
    }

    throw new Error(`Wszystkie ${fetchTiers.length} strategie pobierania obrazu zawiodły. Ostatni błąd: ${lastError ? lastError.message : 'Brak odpowiedzi'}`);
}

const FRONT_VISION_PROMPT = `# [AGENT 0 - FRONT-PACK VISION EXTRACTOR v1.0]
Jesteś precyzyjnym systemem komputerowej analizy wizualnej opakowań produktów e-commerce.
Twoim zadaniem jest odczytanie wyłącznie twardych faktów widocznych na załączonym zdjęciu przedniej części opakowania (etykieta frontowa / packshot).

DOKTRYNA ZAMKNIĘTEGO ŚWIATA I ONTOLOGII PRODUKTU:
- Kategoryczny zakaz konfabulacji, domysłów i szacowania "na oko".
- Zanim przypiszesz parametry, USTAL CZYM FIZYCZNIE JEST PRZEDMIOT NA ZDJĘCIU:
  * Jeśli to artykuł higieniczny, przybór lub narzędzie (np. szczoteczka do zębów, nić, gąbka, pęseta), jest to wyrób bezwonny! KATEGORYCZNY ZAKAZ przypisywania zapachu (zapach_wariant = null).
  * Oznaczenia na szczoteczkach i akcesoriach typu "Medium", "Soft", "Hard", "Ultra Soft", "Średnia", "Miękka", "Twarda" to TWARDOŚĆ WŁOSIA (twardosc_wlosia), a NIE wariant zapachowy!
- Jeśli dana cecha lub parametr nie jest wyraźnie widoczny na etykiecie frontowej, zwróć dla niego wartość null.
- Zwracaj wyłącznie dane w 100% pewne i czytelne z grafiki.

KRYTYCZNE ZADANIA EKSTRAKCJI:
1. Pojemność lub waga: odczytaj dokładną wartość z jednostką (np. "650 ml", "750 ml", "1.5 l", "500 g", "1.5 kg"). Jeśli brak, null.
2. Wariant zapachowy lub wersja: odczytaj nazwę rzeczywistej nuty zapachowej dla kosmetyków i chemii (np. "Lawenda", "Cytryna i mięta", "Ocean Fresh").
   - DLA ARTYKUŁÓW BEZWONNYCH (SZCZOTECZKI DO ZĘBÓW, AKCESORIA) ZAWSZE NULL!
   - KATEGORYCZNY ZAKAZ wpisywania składników chemicznych/czyszczących jako zapachu! Napisy typu "con Candeggina" (z wybielaczem), "con Bicarbonato" (z sodą), "con Aceto" (z octem), "con Ammoniaca" (z amoniakiem) oznaczają SKŁADNIK AKTYWNY (wpisz "Wybielacz", "Soda oczyszczona" lub "Ocet" do kluczowe_skladniki_front), a dla zapach_wariant zwróć null (chyba że obok podano rzeczywistą nutę zapachową np. Cytryna, Eukaliptus).
3. Twardość włosia (dla szczoteczek do zębów i pędzli): odczytaj stopień twardości (np. "Soft", "Medium", "Hard", "Ultra Soft", "Średnia", "Miękka", "Twarda"). Jeśli produkt nie posiada włosia, null.
4. Postać fizyczna: precyzyjnie określ postać po polsku (np. "płyn", "żel", "pianka", "spray", "proszek", "kapsułki", "tabletki", "krem", "balsam", "mleczko", "chusteczki", "szczoteczka manualna", "wyrób higieniczny").
5. Typ dozownika / zamknięcia: wskaż widoczny mechanizm po polsku (np. "pompka", "atomizer / spray", "korek / nakrętka", "nakrętka z miarką", "brak").
6. Wydajność lub liczba użyć: jeśli podano liczbę prań, kapsułek lub doz (np. "40 prań", "60 kapsułek", "100 doz"), wpisz po polsku. W przeciwnym razie null.
7. Przeznaczenie frontowe: główne docelowe zastosowanie podane na froncie, przetłumaczone w 100% na język polski bez obcojęzycznych wtrąceń w nawiasach (np. "uniwersalne czyszczenie powierzchni", "do czyszczenia kuchni i łazienki", "do higieny jamy ustnej", "do tkanin kolorowych"). Jeśli brak, null.
8. Kluczowe hasła i wyróżniki z etykiety: lista haseł z frontu PRZETŁUMACZONYCH W 100% NA NATURALNY JĘZYK POLSKI (np. zamiast włoskich "Formula Migliorata", "Spray Attivo", "Potere Sbiancante", "Schiuma Potente" zwróć wyłącznie polskie odpowiedniki: ["Ulepszona formuła", "Aktywny spray", "Siła wybielania", "Aktywna piana"]). KATEGORYCZNY ZAKAZ zwracania słów po włosku/niemiecku/angielsku ani dopisywania ich w nawiasach! Jeśli brak, pusta tablica [].
9. Kluczowe składniki wyróżnione na froncie (Hero Ingredients): lista najważniejszych składników aktywnych, ekstraktów, olejków lub substancji czyszczących eksponowanych na przedniej etykiecie, przetłumaczona w 100% na język polski (np. ["Wybielacz", "Olej arganowy", "Mydło marsylskie", "Kwas hialuronowy", "Aktywny tlen", "Soda oczyszczona", "Aloes"]). Jeśli brak, pusta tablica [].
UWAGA PRAWNA (BPR 528/2012): Jeśli na zagranicznym opakowaniu widnieje słowo "Igienizzante", "Antibatterico", "Sanitizing", "Antibacterial" lub "Antybakteryjny", tłumacz je wyłącznie jako "Higieniczna czystość" lub "Głębokie oczyszczanie" (zakaz przypisywania właściwości biobójczych/antybakteryjnych/przeciwwirusowych).`;

const frontVisionSchema = {
    type: "object",
    properties: {
        pojemnosc_waga: { type: ["string", "null"] },
        zapach_wariant: { type: ["string", "null"] },
        twardosc_wlosia: { type: ["string", "null"] },
        postac: { type: ["string", "null"] },
        dozownik: { type: ["string", "null"] },
        wydajnosc_liczba_uzyc: { type: ["string", "null"] },
        przeznaczenie_front: { type: ["string", "null"] },
        glowne_hasla_front: {
            type: "array",
            items: { type: "string" }
        },
        kluczowe_skladniki_front: {
            type: "array",
            items: { type: "string" }
        }
    },
    required: ["postac", "dozownik"]
};

function sanitizeVisionFrontText(str) {
    if (!str || typeof str !== 'string') return str;
    let cleaned = str
        // 1. Tarcza BPR 528/2012 (Biobójcze -> Higieniczne)
        .replace(/\b(antybakteryjn[a-ząćęłńóśźż]*|przeciwbakteryjn[a-ząćęłńóśźż]*|antibatteric[oaie]|antibacterial)\b/gi, 'higienicznie oczyszczający')
        .replace(/\b(przeciwwirusow[a-ząćęłńóśźż]*|antywirusow[a-ząćęłńóśźż]*|wirusobójcz[a-ząćęłńóśźż]*|antiviral)\b/gi, 'głęboko oczyszczający')
        .replace(/\b(biobójcz[a-ząćęłńóśźż]*|bakteriobójcz[a-ząćęłńóśźż]*|grzybobójcz[a-ząćęłńóśźż]*|pleśniobójcz[a-ząćęłńóśźż]*)\b/gi, 'intensywnie czyszczący')
        .replace(/\b(dezynfekuj[a-ząćęłńóśźż]*|dezynfekcj[a-ząćęłńóśźż]*|odkażaj[a-ząćęłńóśźż]*|odkaża[a-ząćęłńóśźż]*|igienizzante|disinfettante|sanitizing)\b/gi, 'zapewniający higieniczną czystość')
        .replace(/\b(zabija|usuwa|eliminuje|likwiduje)\s+(?:do\s+)?99[.,]9%\s*(?:bakterii|wirusów|zarazków|drobnoustrojów|mikrobów)\b/gi, 'skutecznie usuwa zanieczyszczenia i osady')
        // 2. Eliminacja zakazanych przez Allegro deklaracji "100%" i "99,9%" z etykiety frontowej (z zachowaniem fleksji polskiej)
        .replace(/\busuwa\s+(?:nawet\s+|do\s+)?100\s*%\s+uporczywego\s+brudu\b/gi, (m) => /^[A-Z]/.test(m) ? 'Skutecznie usuwa uporczywy brud' : 'skutecznie usuwa uporczywy brud')
        .replace(/\busuwa\s+(?:nawet\s+|do\s+)?100\s*%\s+tłuszczu\b/gi, (m) => /^[A-Z]/.test(m) ? 'Skutecznie usuwa tłuszcz' : 'skutecznie usuwa tłuszcz')
        .replace(/\busuwa\s+(?:nawet\s+|do\s+)?100\s*%\s+kamienia\b/gi, (m) => /^[A-Z]/.test(m) ? 'Skutecznie usuwa kamień' : 'skutecznie usuwa kamień')
        .replace(/\busuwa\s+(?:nawet\s+|do\s+)?100\s*%/gi, (m) => /^[A-Z]/.test(m) ? 'Skutecznie usuwa całość' : 'skutecznie usuwa całość')
        .replace(/\bw\s+100\s*%/gi, 'w pełni')
        .replace(/(?<!\d)(?:100|99[.,]9)\s*%\s*/g, '')
        // 3. Usuwanie obcojęzycznych wtrąceń w nawiasach np. "(multiuso)", "(Potere Sbiancante)", "(Schiuma Potente)", "(Spray Attivo)", "(z wybielaczem)"
        .replace(/\s*\(\s*(?:multiuso|potere\s+sbiancante|schiuma\s+potente|spray\s+attivo|formula\s+migliorata|azione\s+sgrassante|senza\s+aloni|senza\s+risciacquo|con\s+candeggina|candeggina|z\s+wybielaczem|pulito\s+profondo|profumo\s+di\s+pulito)\s*\)/gi, '')
        // 4. Tłumaczenie włoskich sloganów z etykiety frontowej na naturalny język polski
        .replace(/\bformula\s+migliorata\b/gi, 'Ulepszona formuła')
        .replace(/\bspray\s+attivo\b/gi, 'Aktywny spray')
        .replace(/\bpotere\s+sbiancante\b/gi, 'Właściwości wybielające')
        .replace(/\bschiuma\s+potente\b/gi, 'Aktywna piana')
        .replace(/\bazione\s+sgrassante\b/gi, 'Działanie odtłuszczające')
        .replace(/\bsenza\s+aloni\b/gi, 'Bez smug')
        .replace(/\bsenza\s+risciacquo\b/gi, 'Bez spłukiwania')
        .replace(/\bprofumo\s+di\s+pulito\b/gi, 'Świeży zapach czystości')
        .replace(/\bpulito\s+profondo\b/gi, 'Głębokie czyszczenie')
        .replace(/\bcon\s+candeggina\b/gi, 'z wybielaczem')
        .replace(/\bcandeggina\b/gi, 'Wybielacz')
        .replace(/\bmultiuso\b/gi, 'wielofunkcyjny')
        .replace(/\s{2,}/g, ' ')
        .trim();
    if (cleaned.length > 0 && /^[a-ząćęłńóśźż]/.test(cleaned) && /^[A-ZĄĆĘŁŃÓŚŹŻ0-9]/.test(str.trim())) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    return cleaned;
}

/**
 * Ekstrahuje cechy fizyczne i wizualne z przedniego zdjęcia produktu za pomocą Gemini 3.8 Flash Vision.
 * Obsługuje pojedynczy adres URL oraz tablicę alternatywnych ujęć packshotu z galerii PIM.
 */
async function extractFrontPackFeatures(imageUrlOrCandidates, ean = null, onLog = () => {}) {
    const candidateUrls = Array.isArray(imageUrlOrCandidates)
        ? imageUrlOrCandidates.filter(u => typeof u === 'string' && u.trim().length > 0)
        : (typeof imageUrlOrCandidates === 'string' && imageUrlOrCandidates.trim().length > 0 ? [imageUrlOrCandidates.trim()] : []);

    if (candidateUrls.length === 0) {
        return { raw: null, pimFeatures: {}, skipped: true, reason: 'Brak dostępnego adresu URL zdjęcia w PIM' };
    }

    let buffer = null;
    let mimeType = 'image/jpeg';
    let tierUsed = 'N/A';
    let lastError = null;
    let successfulUrl = null;

    for (let idx = 0; idx < candidateUrls.length; idx++) {
        const currentUrl = candidateUrls[idx];
        const candidateLabel = candidateUrls.length > 1 ? ` (Zdjęcie ${idx + 1}/${candidateUrls.length})` : '';
        try {
            onLog(`[VISION EXTRACTOR] Pobieranie obrazu do analizy etykiety frontowej dla EAN: ${ean || 'N/A'}${candidateLabel}...`);
            const fetchRes = await fetchImageBuffer(currentUrl, 15000, onLog);
            buffer = fetchRes.buffer;
            mimeType = fetchRes.mimeType;
            tierUsed = fetchRes.tierUsed;
            successfulUrl = currentUrl;
            break;
        } catch (fetchErr) {
            lastError = fetchErr;
            onLog(`[VISION EXTRACTOR OSTRZEŻENIE] Niepowodzenie pobierania zdjęcia${candidateLabel}: ${fetchErr.message}`);
        }
    }

    if (!buffer) {
        const errMsg = `Nie udało się pobrać żadnego z ${candidateUrls.length} dostępnych zdjęć packshotu: ${lastError ? lastError.message : 'Brak danych'}`;
        console.warn(`[VISION EXTRACTOR BŁĄD] ${errMsg}`);
        onLog(`[VISION EXTRACTOR OSTRZEŻENIE] ${errMsg}. Potok kontynuuje na danych tekstowych PIM.`);
        return {
            raw: null,
            pimFeatures: {},
            skipped: true,
            error: errMsg
        };
    }

    try {
        onLog(`[VISION EXTRACTOR] Obraz pobrany pomyślnie (${(buffer.length / 1024).toFixed(1)} KB, MIME: ${mimeType}, ${tierUsed}). Uruchamianie analizy Vision AI (Agent 0)...`);
        
        const base64Data = buffer.toString('base64');
        const { result, usage } = await aiWrapper.callAgentWithTelemetry({
            agentId: "0",
            prompt: FRONT_VISION_PROMPT,
            schema: frontVisionSchema,
            image: {
                mimeType: mimeType,
                base64: base64Data
            },
            onLog
        });

        const pimFeatures = {};
        if (result.pojemnosc_waga && String(result.pojemnosc_waga).trim().length > 0) {
            const val = String(result.pojemnosc_waga).trim();
            pimFeatures['Pojemność / Waga'] = val;
            
            // Mapowanie kanoniczne dla BaseLinkera i Allegro
            const lowerVal = val.toLowerCase();
            if (/\b(ml|l|litr|litra|litrów|fl\s*oz)\b/i.test(lowerVal) || (!/\b(kg|g|gram)\b/i.test(lowerVal))) {
                pimFeatures['Pojemność'] = val;
            }
            if (/\b(kg|g|gram|gramów)\b/i.test(lowerVal)) {
                pimFeatures['Waga'] = val;
            }
        }
        if (result.twardosc_wlosia && String(result.twardosc_wlosia).trim().length > 0) {
            pimFeatures['Twardość włosia'] = String(result.twardosc_wlosia).trim();
        }
        if (result.zapach_wariant && String(result.zapach_wariant).trim().length > 0) {
            const rawZapach = sanitizeVisionFrontText(String(result.zapach_wariant).trim());
            // Tarcza ontologiczna 1: Jeśli do zapachu omyłkowo trafiło oznaczenie twardości włosia (np. MEDIUM, SOFT, HARD), przenieś do Twardość włosia
            if (/^(soft|medium|hard|ultra\s*soft|extra\s*soft|średni[a|e]?|miękki[a|e]?|tward[y|a|e]?)$/i.test(rawZapach)) {
                pimFeatures['Twardość włosia'] = rawZapach;
            } else if (/^(?:(?:z\s+)?wybielacz(?:em)?|candeggina|con\s+candeggina|(?:z\s+)?sod[ąa]|bicarbonato|(?:z\s+)?octem|aceto|(?:z\s+)?amoniakiem|ammoniaca)$/i.test(rawZapach)) {
                // Tarcza ontologiczna 2: Składniki chemiczne (np. wybielacz / soda / ocet) to NIE nuta zapachowa -> przenieś do Składników wiodących
                const heroList = Array.isArray(result.kluczowe_skladniki_front) ? result.kluczowe_skladniki_front : [];
                const cleanHero = /wybielacz|candeggina/i.test(rawZapach) ? 'Wybielacz' : rawZapach;
                if (!heroList.some(h => String(h).toLowerCase().includes(cleanHero.toLowerCase()))) {
                    result.kluczowe_skladniki_front = [...heroList, cleanHero];
                }
            } else {
                pimFeatures['Zapach'] = rawZapach;
            }
        }
        if (result.postac && String(result.postac).trim().length > 0) {
            pimFeatures['Postać'] = sanitizeVisionFrontText(String(result.postac).trim());
        }
        if (result.dozownik && String(result.dozownik).trim().length > 0) {
            pimFeatures['Dozownik'] = String(result.dozownik).trim();
        }
        if (result.wydajnosc_liczba_uzyc && String(result.wydajnosc_liczba_uzyc).trim().length > 0) {
            pimFeatures['Wydajność'] = String(result.wydajnosc_liczba_uzyc).trim();
        }
        if (result.przeznaczenie_front && String(result.przeznaczenie_front).trim().length > 0) {
            pimFeatures['Przeznaczenie (Front)'] = sanitizeVisionFrontText(String(result.przeznaczenie_front).trim());
        }
        if (Array.isArray(result.glowne_hasla_front) && result.glowne_hasla_front.length > 0) {
            pimFeatures['Wyróżniki (Etykieta Front)'] = result.glowne_hasla_front
                .map(s => sanitizeVisionFrontText(String(s).trim()))
                .filter(Boolean)
                .join(', ');
        }
        if (Array.isArray(result.kluczowe_skladniki_front) && result.kluczowe_skladniki_front.length > 0) {
            pimFeatures['Składniki wiodące (Front)'] = result.kluczowe_skladniki_front
                .map(s => sanitizeVisionFrontText(String(s).trim()))
                .filter(Boolean)
                .join(', ');
        }

        onLog(`[VISION EXTRACTOR] Pomyślnie odczytano ${Object.keys(pimFeatures).length} cech z etykiety frontowej: ${Object.keys(pimFeatures).join(', ')}.`);

        return {
            raw: result,
            pimFeatures,
            usage,
            imageUrl: successfulUrl,
            skipped: false
        };
    } catch (err) {
        const errMsg = `[VISION EXTRACTOR BŁĄD] Model Vision nie zdołał przeanalizować etykiety: ${err.message}`;
        console.warn(errMsg);
        onLog(`[VISION EXTRACTOR OSTRZEŻENIE] ${errMsg}. Potok kontynuuje na danych tekstowych PIM.`);
        return {
            raw: null,
            pimFeatures: {},
            skipped: true,
            error: err.message
        };
    }
}

const BACK_PACK_INCI_PROMPT = `Jesteś eksperckim analitykiem etykiet produktów konsumenckich i chemii gospodarczej (kosmetyki, detergenty, środki czyszczące, artykuły gospodarstwa domowego).
Twoim zadaniem jest zbadanie przesłanego zdjęcia tyłu opakowania (kontretykiety) i precyzyjne odczytanie 3 kluczowych sekcji informacyjnych z etykiety:
1. SKŁAD (INCI / Składniki / Ingredients / Composizione chimica / Inhaltsstoffe / skład detergentu wg Rozp. WE 648/2004 / substancje czynne CLP).
2. OSTRZEŻENIA BEZPIECZEŃSTWA (Hasło ostrzegawcze UWAGA / NIEBEZPIECZEŃSTWO / ATTENZIONE / PERICOLO, zwroty H, zwroty P, zwroty EUH, wymagane środki ochrony indywidualnej np. rękawice ochronne, ochrona oczu, ostrzeżenia o nierozpylaniu lub niemieszaniu z innymi środkami).
3. SPOSÓB UŻYCIA (Instrukcja stosowania, dozowanie, czas działania, spłukiwanie, zalecenia aplikacyjne i wykluczenia powierzchni z etykiety).

ZASADY ANALIZY (DOKTRYNA ZAMKNIĘTEGO ŚWIATA – ZERO ZGADYWANIA):
1. JEŚLI NA ZDJĘCIU NIE MA TYLNEJ ETYKIETY INFORMACYJNEJ (jest to wyłącznie front opakowania bez instrukcji/składu/ostrzeżeń lub tekst jest całkowicie nieczytelny):
   - Ustaw: "has_ingredients_label": false
   - Ustaw: "has_back_label": false
   - Ustaw: "inci": null, "raw_composition_text": null, "warnings": null, "usage_instructions": null

2. EKSTRAKCJA SKŁADU ("inci" oraz "raw_composition_text"):
   - Jeśli na zdjęciu widoczny jest skład (kosmetyczne INCI, skład detergentu wg WE 648/2004 lub lista substancji niebezpiecznych CLP):
     * Ustaw "has_ingredients_label": true oraz "has_back_label": true.
     * W "raw_composition_text" przepisz dosłowny tekst składu z etykiety (1:1).
     * W "inci" zwróć znormalizowaną listę WSZYSTKICH składników i przedziałów stężeń w OFICJALNEJ NOMENKLATURZE ANGIELSKIEJ INCI / WE 648/2004 (np. dla kosmetyków: "AQUA, SODIUM LAURETH SULFATE, COCAMIDOPROPYL BETAINE, PARFUM, CITRIC ACID"; dla detergentów: "5-15% Anionic surfactants, <5% Non-ionic surfactants, Parfum, Preservatives (Benzisothiazolinone, Methylchloroisothiazolinone, Methylisothiazolinone)" albo "<5% Phosphonates, Chlorine-based bleaching agents, Anionic surfactants, Amphoteric surfactants, Parfum. Contains: Sodium Hydroxide, Alcohols, C12-14, ethoxylated, sulfates, sodium salts"). Nazwy chemiczne z języka włoskiego, niemieckiego, francuskiego czy polskiego (np. "Idrossido di sodio", "Ipoclorito di sodio", "Tensioattivi anionici", "Wodorotlenek sodu", "Woda") BEZWZGLĘDNIE tłumacz na standardową nomenklaturę angielską INCI / IUPAC zgodnie z prawem UE! ZAKAZ wstawiania polskich tłumaczeń składników w polu "inci"!
     * ZASADA 1:1 (ABC -> ABC): Przepisz każdy składnik i konserwant obecny na etykiecie bez dodawania ani pomijania jakiegokolwiek związku.
   - Jeśli skład nie jest widoczny lub nieczytelny: ustaw "has_ingredients_label": false oraz "inci": null.

3. EKSTRAKCJA OSTRZEŻEŃ BEZPIECZEŃSTWA ("warnings"):
   - Jeśli na etykiecie widoczne są ostrzeżenia bezpieczeństwa, piktogramy z opisem CLP lub środki ostrożności:
     * Ustaw "has_back_label": true.
     * Przetłumacz je wiernie w 100% na język polski (1:1 dokładnie to, co deklaruje producent na etykiecie) z zachowaniem oficjalnych, kompletnych kodów H/P/EUH (np. P101, P102, P103, P301+P330+P331, P303+P361+P353, P305+P351+P338, EUH206, EUH208 — zachowaj oba zdania w jednym zwrocie bez rozdzielania!).
     * KATEGORYCZNY ZAKAZ wrzucania do pola "warnings" sekcji składników chemicznych ("Contains / Zawiera: wodorotlenek sodu, alkohole C12-14..." / "Composizione chimica") ani numerów alarmowych Centro Antiveleni — skład należy wyłącznie do pola "inci"! (UWAGA: zwrot uczuleniowy EUH208 typu "Zawiera mieszaninę ... Może powodować wystąpienie reakcji alergicznej" JEST ostrzeżeniem i należy do "warnings" w dokładnym zakresie podanym przez producenta — nie dopisuj substancji spoza EUH208!).
     * KATEGORYCZNY ZAKAZ ZGADYWANIA I DOPISYWANIA ŚRODKÓW OCHRONY LUB ZAGROŻEŃ SPOZA ETYKIETY (np. zakaz dopisywania maski, okularów czy H319, jeśli etykieta ich nie wymienia!).
   - Jeśli brak widocznych ostrzeżeń na zdjęciu, ustaw "warnings": null.

4. EKSTRAKCJA SPOSOBU UŻYCIA ("usage_instructions"):
   - Jeśli na etykiecie widoczna jest instrukcja użycia / dozowania ("Modo d'uso", "Istruzioni per l'uso", "Sposób użycia", "Gebrauchsanweisung"):
     * Ustaw "has_back_label": true.
     * Przetłumacz ją wiernie i kompletnie (1:1 ABC -> ABC) na naturalny język polski z zachowaniem wszystkich sekcji, temperatur (np. "nawet na zimno"), czasów działania, spłukiwania (np. "wodą zdatną do picia") oraz uwag typu "postępować zgodnie z instrukcją obsługi urządzenia". Kategoryczny zakaz przeinaczania lub wymyślania etapów spoza etykiety producenta!
     * Zastosuj zgodność z BPR: słowa typu "igienizzante/antibatterico" tłumacz jako "higienicznie czyszczący".
   - Jeśli brak widocznej instrukcji użycia na zdjęciu, ustaw "usage_instructions": null.

5. EKSTRAKCJA POWIERZCHNI DOCELOWYCH, CERTYFIKATÓW / TESTÓW ORAZ PRODUCENTA ("target_surfaces", "certifications_and_claims", "manufacturer_name"):
   - W "target_surfaces" wypisz po polsku wszystkie powierzchnie i zastosowania wymienione w opisie na tylnej etykiecie (np. "do czyszczenia szyb, kryształów, luster oraz powierzchni plastikowych i laminowanych").
   - W "certifications_and_claims" wypisz po polsku wszystkie certyfikaty, badania i atuty środowiskowe z tylnej etykiety (np. "certyfikat Air Label Score A+ (minimalna emisja substancji do powietrza), testowany dermatologicznie, testowany na obecność niklu, rtęci, ołowiu i chromu, odpowiedni do planów H.A.C.C.P., butelka zawiera 30% plastiku z recyklingu").
   - W "manufacturer_name" podaj pełną nazwę producenta z kontretykiety (np. "Italchimica S.r.l.").`;

const backPackInciSchema = {
    type: "object",
    properties: {
        has_ingredients_label: { type: "boolean" },
        has_back_label: { type: "boolean" },
        inci: { type: ["string", "null"] },
        raw_composition_text: { type: ["string", "null"] },
        warnings: { type: ["string", "null"] },
        usage_instructions: { type: ["string", "null"] },
        target_surfaces: { type: ["string", "null"] },
        certifications_and_claims: { type: ["string", "null"] },
        manufacturer_name: { type: ["string", "null"] }
    },
    required: ["has_ingredients_label", "inci"]
};

/**
 * Skanuje zdjęcia produktu (w szczególności zdjęcie tyłu opakowania / kontretykietę) za pomocą Gemini 3.8 Flash Vision
 * w celu ekstrakcji: Składu/INCI, Ostrzeżeń bezpieczeństwa (CLP/GPSR/BHP) oraz Sposobu użycia.
 * @param {Array<string>|string} imageUrlOrCandidates - Zdjęcia produktu (w tym zdjęcie tyłu opakowania)
 * @param {string|null} ean - Kod EAN
 * @param {Function} onLog - Callback logowania
 * @param {string|null} skipFrontUrl - Opcjonalny URL zdjęcia frontowego do pominięcia
 * @returns {Promise<{ found: boolean, inci: string|null, warnings: string|null, usageInstructions: string|null, pimFeatures: Object, raw: string|null, imageUrl: string|null, usage: Object|null }>}
 */
async function extractInciFromBackPack(imageUrlOrCandidates, ean = null, onLog = () => {}, skipFrontUrl = null) {
    const rawCandidateUrls = Array.isArray(imageUrlOrCandidates)
        ? imageUrlOrCandidates.filter(u => typeof u === 'string' && u.trim().length > 0)
        : (typeof imageUrlOrCandidates === 'string' && imageUrlOrCandidates.trim().length > 0 ? [imageUrlOrCandidates.trim()] : []);

    if (rawCandidateUrls.length === 0) {
        return { found: false, inci: null, warnings: null, usageInstructions: null, pimFeatures: {}, raw: null, imageUrl: null, reason: 'Brak dostępnych zdjęć do analizy etykiety' };
    }

    // Jeśli posiadamy więcej niż 1 zdjęcie i znamy już URL zdjęcia frontowego (zbadanego w extractFrontPackFeatures),
    // pomijamy powtórne skanowanie frontu w poszukiwaniu tylnej etykiety INCI (oszczędność wywołania Vision API).
    const candidateUrls = (skipFrontUrl && rawCandidateUrls.length > 1)
        ? rawCandidateUrls.filter(u => u.trim() !== skipFrontUrl.trim())
        : rawCandidateUrls;

    let bestPartialResult = null;

    for (let idx = 0; idx < candidateUrls.length; idx++) {
        const currentUrl = candidateUrls[idx];
        const label = candidateUrls.length > 1 ? ` (Zdjęcie ${idx + 1}/${candidateUrls.length})` : '';
        
        let bufferRes;
        try {
            onLog(`[VISION BACK-PACK OCR] Pobieranie zdjęcia${label} dla EAN: ${ean || 'N/A'}...`);
            bufferRes = await fetchImageBuffer(currentUrl, 15000, onLog);
        } catch (fetchErr) {
            onLog(`[VISION BACK-PACK OCR OSTRZEŻENIE] Niepowodzenie pobierania zdjęcia${label}: ${fetchErr.message}`);
            continue;
        }

        try {
            onLog(`[VISION BACK-PACK OCR] Analiza multimodalna Gemini 3.8 Flash Vision (Skład / Ostrzeżenia / Sposób użycia) dla zdjęcia${label}...`);
            const base64Data = bufferRes.buffer.toString('base64');
            const { result, usage } = await aiWrapper.callAgentWithTelemetry({
                agentId: "0",
                prompt: BACK_PACK_INCI_PROMPT,
                schema: backPackInciSchema,
                image: {
                    mimeType: bufferRes.mimeType,
                    base64: base64Data
                },
                onLog
            });

            if (result) {
                let validInci = null;
                let validWarnings = null;
                let validUsage = null;
                const pimFeatures = {};

                if (result.has_ingredients_label && result.inci && typeof result.inci === 'string') {
                    const cleanedInci = normalizeInciToLegalEnglish(result.inci.trim());
                    const itemCount = (cleanedInci.match(/[,;]/g) || []).length + 1;
                    if ((itemCount >= 2 || /contains:|zawiera:|surfactants|środki powierzchniowo czynne|konserwant|preservative|isothiazol|benzisothiazol|sodium|acid|aqua|alcohol|peroxide|hypochlorite/i.test(cleanedInci)) && baselinkerExtract.isValidInciValue(cleanedInci)) {
                        validInci = cleanedInci;
                        pimFeatures['Skład/INCI'] = validInci;
                    } else {
                        onLog(`[VISION BACK-PACK OCR INFO] Zdjęcie${label} zawierało tekst składu, ale nie spełnia on wymogów strukturalnych INCI (liczba: ${itemCount}).`);
                    }
                }

                if (result.warnings && typeof result.warnings === 'string' && result.warnings.trim().length >= 5) {
                    validWarnings = result.warnings.trim()
                        .replace(/\bDO OCZÓW\b/gi, 'DO OCZU')
                        .replace(/\bKONTATKT?U\b/gi, 'KONTAKTU')
                        .replace(/W\s+PRZYPADKU\s+(?:KONTAKTU|KONTATKU)\s+ZE\s+SKÓRĄ/gi, 'W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ')
                        .replace(/\s*(?:Zawiera|Contains|Contiene|Skład\s+chemiczny|Composizione\s+chimica)\s*[:–-]?\s*(?:wodorotlenek|alkohol|sodium|alcoli|fosfonian)[^.\n]*\.?/gi, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim();
                    pimFeatures['Ostrzeżenia'] = validWarnings;
                }

                if (result.usage_instructions && typeof result.usage_instructions === 'string' && result.usage_instructions.trim().length >= 5) {
                    validUsage = sanitizeVisionFrontText(result.usage_instructions.trim());
                    pimFeatures['Sposób użycia'] = validUsage;
                }

                if (result.target_surfaces && typeof result.target_surfaces === 'string' && result.target_surfaces.trim().length >= 5) {
                    pimFeatures['Przeznaczenie'] = sanitizeVisionFrontText(result.target_surfaces.trim());
                }

                if (result.certifications_and_claims && typeof result.certifications_and_claims === 'string' && result.certifications_and_claims.trim().length >= 5) {
                    pimFeatures['Cechy dodatkowe'] = sanitizeVisionFrontText(result.certifications_and_claims.trim());
                }

                if (result.manufacturer_name && typeof result.manufacturer_name === 'string' && result.manufacturer_name.trim().length >= 3) {
                    pimFeatures['Producent'] = result.manufacturer_name.trim();
                }

                if (validInci) {
                    onLog(`[VISION BACK-PACK OCR SUKCES] Odczytano dane z tylnej etykiety${label} (Skład/INCI: TAK, Ostrzeżenia: ${validWarnings ? 'TAK' : 'NIE'}, Sposób użycia: ${validUsage ? 'TAK' : 'NIE'}).`);
                    return {
                        found: true,
                        inci: validInci,
                        warnings: validWarnings,
                        usageInstructions: validUsage,
                        pimFeatures,
                        raw: result.raw_composition_text || null,
                        imageUrl: currentUrl,
                        usage
                    };
                }

                if ((validWarnings || validUsage) && !bestPartialResult) {
                    onLog(`[VISION BACK-PACK OCR INFO] Odczytano Ostrzeżenia/Sposób użycia ze zdjęcia${label} (brak pełnego INCI na tym ujęciu).`);
                    bestPartialResult = {
                        found: true,
                        inci: null,
                        warnings: validWarnings,
                        usageInstructions: validUsage,
                        pimFeatures,
                        raw: result.raw_composition_text || null,
                        imageUrl: currentUrl,
                        usage
                    };
                }
            }
        } catch (aiErr) {
            onLog(`[VISION BACK-PACK OCR OSTRZEŻENIE] Błąd Vision AI dla zdjęcia${label}: ${aiErr.message}`);
        }
    }

    if (bestPartialResult) {
        return bestPartialResult;
    }

    return { found: false, inci: null, warnings: null, usageInstructions: null, pimFeatures: {}, raw: null, imageUrl: null };
}

module.exports = {
    extractFrontPackFeatures,
    extractInciFromBackPack,
    fetchImageBuffer,
    sanitizeVisionFrontText,
    FRONT_VISION_PROMPT,
    frontVisionSchema,
    BACK_PACK_INCI_PROMPT,
    backPackInciSchema
};
