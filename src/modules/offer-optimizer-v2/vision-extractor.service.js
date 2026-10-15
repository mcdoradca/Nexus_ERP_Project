const axios = require('axios');
const https = require('https');
const aiWrapper = require('./ai.wrapper.js');

const imageHttpsAgent = new https.Agent({ 
    rejectUnauthorized: false,
    family: 4 
});

/**
 * Bezpieczne pobranie bufora obrazu z obsługą Data URI oraz adresów zdalnych HTTP/HTTPS.
 */
async function fetchImageBuffer(url, timeoutMs = 15000) {
    if (!url || typeof url !== 'string') {
        throw new Error('Brak poprawnego adresu URL obrazu.');
    }

    if (url.startsWith('data:')) {
        const matches = url.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
            return {
                buffer: Buffer.from(matches[2], 'base64'),
                mimeType: matches[1]
            };
        }
    }

    const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        httpsAgent: imageHttpsAgent,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    const mimeType = contentType.split(';')[0].trim();
    return {
        buffer: Buffer.from(response.data),
        mimeType: mimeType || 'image/jpeg'
    };
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
 */
async function extractFrontPackFeatures(imageUrl, ean = null, onLog = () => {}) {
    if (!imageUrl) {
        return { raw: null, pimFeatures: {}, skipped: true, reason: 'Brak URL zdjęcia' };
    }

    try {
        onLog(`[VISION EXTRACTOR] Pobieranie obrazu do analizy etykiety frontowej dla EAN: ${ean || 'N/A'}...`);
        const { buffer, mimeType } = await fetchImageBuffer(imageUrl, 15000);
        
        onLog(`[VISION EXTRACTOR] Obraz pobrany pomyślnie (${(buffer.length / 1024).toFixed(1)} KB, MIME: ${mimeType}). Uruchamianie analizy Vision AI (Agent 0)...`);
        
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
            pimFeatures['Pojemność / Waga'] = String(result.pojemnosc_waga).trim();
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
            skipped: false
        };
    } catch (err) {
        const errMsg = `[VISION EXTRACTOR BŁĄD] Nie udało się odczytać cech ze zdjęcia: ${err.message}`;
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

module.exports = {
    extractFrontPackFeatures,
    fetchImageBuffer
};
