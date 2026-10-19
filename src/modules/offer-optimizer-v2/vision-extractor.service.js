const axios = require('axios');
const https = require('https');
const aiWrapper = require('./ai.wrapper.js');
const baselinkerExtract = require('./baselinker.extract.js');

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

DOKTRYNA ZAMKNIĘTEGO ŚWIATA (CLOSED-WORLD REASONING):
- Kategoryczny zakaz konfabulacji, domysłów i szacowania "na oko".
- Jeśli dana cecha lub parametr nie jest wyraźnie widoczny na etykiecie frontowej, zwróć dla niego wartość null.
- Zwracaj wyłącznie dane w 100% pewne i czytelne z grafiki.

KRYTYCZNE ZADANIA EKSTRAKCJI:
1. Pojemność lub waga: odczytaj dokładną wartość z jednostką (np. "750 ml", "1.5 l", "500 g", "1.5 kg"). Jeśli brak, null.
2. Wariant zapachowy lub wersja: odczytaj nazwę wariantu lub nuty zapachowej (np. "Lawenda", "Cytryna i mięta", "Sensitive", "Ocean Fresh"). Jeśli bezzapachowy lub brak, null.
3. Postać fizyczna: precyzyjnie określ postać (np. "płyn", "żel", "pianka", "spray", "proszek", "kapsułki", "tabletki", "krem", "balsam", "chusteczki").
4. Typ dozownika / zamknięcia: wskaż widoczny mechanizm (np. "pompka", "atomizer / spray", "korek / nakrętka", "nakrętka z miarką", "brak").
5. Wydajność lub liczba użyć: jeśli podano liczbę prań, kapsułek lub doz (np. "40 prań", "60 kapsułek", "100 doz"), wpisz. W przeciwnym razie null.
6. Przeznaczenie frontowe: główne docelowe zastosowanie podane na froncie (np. "do czyszczenia łazienki i armatury", "do zmywarek", "do tkanin kolorowych"). Jeśli brak, null.
7. Kluczowe hasła i wyróżniki z etykiety: lista haseł marketingowo-technologicznych z frontu (np. ["Ultra Power", "98% składników pochodzenia naturalnego", "0% barwników"]). Jeśli brak, pusta tablica [].`;

const frontVisionSchema = {
    type: "object",
    properties: {
        pojemnosc_waga: { type: ["string", "null"] },
        zapach_wariant: { type: ["string", "null"] },
        postac: { type: ["string", "null"] },
        dozownik: { type: ["string", "null"] },
        wydajnosc_liczba_uzyc: { type: ["string", "null"] },
        przeznaczenie_front: { type: ["string", "null"] },
        glowne_hasla_front: {
            type: "array",
            items: { type: "string" }
        }
    },
    required: ["postac", "dozownik"]
};

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
        if (result.zapach_wariant && String(result.zapach_wariant).trim().length > 0) {
            pimFeatures['Zapach'] = String(result.zapach_wariant).trim();
        }
        if (result.postac && String(result.postac).trim().length > 0) {
            pimFeatures['Postać'] = String(result.postac).trim();
        }
        if (result.dozownik && String(result.dozownik).trim().length > 0) {
            pimFeatures['Dozownik'] = String(result.dozownik).trim();
        }
        if (result.wydajnosc_liczba_uzyc && String(result.wydajnosc_liczba_uzyc).trim().length > 0) {
            pimFeatures['Wydajność'] = String(result.wydajnosc_liczba_uzyc).trim();
        }
        if (result.przeznaczenie_front && String(result.przeznaczenie_front).trim().length > 0) {
            pimFeatures['Przeznaczenie (Front)'] = String(result.przeznaczenie_front).trim();
        }
        if (Array.isArray(result.glowne_hasla_front) && result.glowne_hasla_front.length > 0) {
            pimFeatures['Wyróżniki (Etykieta Front)'] = result.glowne_hasla_front.map(s => String(s).trim()).filter(Boolean).join(', ');
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

const BACK_PACK_INCI_PROMPT = `Jesteś analitykiem etykiet produktów konsumenckich i przemysłowych (kosmetyki, chemia gospodarcza, detergenty, artykuły gospodarstwa domowego).
Twoim jedynym zadaniem jest zbadanie przesłanego zdjęcia i sprawdzenie, czy widoczna jest na nim etykieta ze składem surowcowym/chemicznym produktu (INCI, Ingredients, Skład, Składniki, Composizione chimica, Inhaltsstoffe, Composition, Ingredients list).

ZASADY ANALIZY:
1. JEŚLI NA ZDJĘCIU NIE MA ETYKIETY ZE SKŁADEM (jest to front opakowania, wizualizacja marketingowa, korek, piktogramy bezpieczeństwa bez listy składników, lub tekst jest całkowicie nieczytelny):
   - Ustaw: "has_ingredients_label": false
   - Ustaw: "inci": null
   - Ustaw: "raw_composition_text": null

2. JEŚLI NA ZDJĘCIU JEST WIDOCZNA ETYKIETA ZE SKŁADEM (kosmetyczne INCI lub skład chemiczny detergentu wg rozporządzenia WE 648/2004 lub substancje CLP):
   - Ustaw: "has_ingredients_label": true
   - W polu "raw_composition_text" przepisz dosłowny odczytany tekst składu z etykiety.
   - W polu "inci" zwróć skład znormalizowany jako listę składników oddzielonych przecinkami, WIELKIMI LITERAMI (np. "AQUA, HYDROGEN PEROXIDE, ALCOHOLS, C12-18, ETHOXYLATED, SODIUM DODECYLBENZENESULFONATE, COCO-BETAINE, PARFUM").
   - Jeśli na etykiecie występują nazwy chemiczne w języku włoskim, francuskim, niemieckim lub polskim (np. "Alcoli, C12-18, etossilati; Perossido di idrogeno sol. al 35%; Acido benzensulfonico..."):
     dokonaj ich precyzyjnej transkrypcji na standardową nomenklaturę chemiczną / INCI (np. "ALCOHOLS, C12-18, ETHOXYLATED, HYDROGEN PEROXIDE, SODIUM DODECYLBENZENESULFONATE, COCO-BETAINE").

KATEGORYCZNY ZAKAZ ZGADYWANIA. Jeśli tekst jest nieczytelny lub go brak, ustaw has_ingredients_label: false.`;

const backPackInciSchema = {
    type: "object",
    properties: {
        has_ingredients_label: { type: "boolean" },
        inci: { type: ["string", "null"] },
        raw_composition_text: { type: ["string", "null"] }
    },
    required: ["has_ingredients_label", "inci"]
};

/**
 * Skanuje zdjęcia produktu z galerii (Back-of-Pack OCR) za pomocą Gemini 3.8 Flash Vision w poszukiwaniu etykiety ze składem INCI / chemicznym.
 * @param {Array<string>|string} imageUrlOrCandidates - Zdjęcia produktu
 * @param {string|null} ean - Kod EAN
 * @param {Function} onLog - Callback logowania
 * @returns {Promise<{ found: boolean, inci: string|null, raw: string|null, imageUrl: string|null, usage: Object|null }>}
 */
async function extractInciFromBackPack(imageUrlOrCandidates, ean = null, onLog = () => {}) {
    const candidateUrls = Array.isArray(imageUrlOrCandidates)
        ? imageUrlOrCandidates.filter(u => typeof u === 'string' && u.trim().length > 0)
        : (typeof imageUrlOrCandidates === 'string' && imageUrlOrCandidates.trim().length > 0 ? [imageUrlOrCandidates.trim()] : []);

    if (candidateUrls.length === 0) {
        return { found: false, inci: null, raw: null, imageUrl: null, reason: 'Brak dostępnych zdjęć do analizy etykiety' };
    }

    for (let idx = 0; idx < candidateUrls.length; idx++) {
        const currentUrl = candidateUrls[idx];
        const label = candidateUrls.length > 1 ? ` (Zdjęcie ${idx + 1}/${candidateUrls.length})` : '';
        
        let bufferRes;
        try {
            onLog(`[VISION INCI OCR] Pobieranie zdjęcia${label} dla EAN: ${ean || 'N/A'}...`);
            bufferRes = await fetchImageBuffer(currentUrl, 15000, onLog);
        } catch (fetchErr) {
            onLog(`[VISION INCI OCR OSTRZEŻENIE] Niepowodzenie pobierania zdjęcia${label}: ${fetchErr.message}`);
            continue;
        }

        try {
            onLog(`[VISION INCI OCR] Analiza multimodalna Gemini 3.8 Flash Vision dla zdjęcia${label}...`);
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

            if (result && result.has_ingredients_label && result.inci && typeof result.inci === 'string') {
                const cleanedInci = result.inci.trim();
                const itemCount = (cleanedInci.match(/,/g) || []).length + 1;
                
                if (itemCount >= 3 && baselinkerExtract.isValidInciValue(cleanedInci)) {
                    onLog(`[VISION INCI OCR SUKCES] Odczytano skład ze zdjęcia${label} (${itemCount} składników): ${cleanedInci.substring(0, 100)}...`);
                    return {
                        found: true,
                        inci: cleanedInci,
                        raw: result.raw_composition_text,
                        imageUrl: currentUrl,
                        usage
                    };
                } else {
                    onLog(`[VISION INCI OCR INFO] Zdjęcie${label} zawierało etykietę, ale odczytany skład nie spełnia wymogów strukturalnych INCI (liczba: ${itemCount}). Szukam dalej...`);
                }
            }
        } catch (aiErr) {
            onLog(`[VISION INCI OCR OSTRZEŻENIE] Błąd Vision AI dla zdjęcia${label}: ${aiErr.message}`);
        }
    }

    return { found: false, inci: null, raw: null, imageUrl: null };
}

module.exports = {
    extractFrontPackFeatures,
    extractInciFromBackPack,
    fetchImageBuffer,
    FRONT_VISION_PROMPT,
    frontVisionSchema,
    BACK_PACK_INCI_PROMPT,
    backPackInciSchema
};
