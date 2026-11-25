const axios = require('axios');
const https = require('https');
const sharp = require('sharp');
const aiWrapper = require('./ai.wrapper.js');
const baselinkerExtract = require('./baselinker.extract.js');
const { normalizeInciToLegalEnglish } = require('./normalization.js');
const { sanitizeLabelHighlights, sanitizeAllegroMarketingText } = require('./services/allegro-compliance.policy');
const {
    isGenericCategoryWordNotLine,
    isFabricSoftenerProduct,
    normalizeFabricSoftenerTerminology,
    resolveLabelPhysicalForm,
    validateDosageYieldMath
} = require('./services/label-truth.helpers');

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

/**
 * Przycina zbędne białe marginesy packshotu dla etykiety frontowej, zachowując pełną czytelność tekstu.
 */
async function prepareFrontLabelImage(buffer, mimeType = 'image/jpeg') {
    const fallback = {
        mimeType: mimeType || 'image/jpeg',
        base64: buffer.toString('base64'),
        width: null,
        height: null,
        trimmed: false
    };
    try {
        const meta = await sharp(buffer).metadata();
        const width = meta?.width || null;
        const height = meta?.height || null;
        if (!width || !height || width < 160 || height < 160) {
            return { ...fallback, width, height };
        }
        let workBuf = buffer;
        let trimmed = false;
        try {
            const trimmedRes = await sharp(buffer)
                .trim({ threshold: 20 })
                .jpeg({ quality: 93, mozjpeg: true })
                .toBuffer({ resolveWithObject: true });
            const tw = trimmedRes?.info?.width || 0;
            const th = trimmedRes?.info?.height || 0;
            if (tw >= 140 && th >= 140 && (tw * th) <= (width * height * 0.92)) {
                workBuf = trimmedRes.data;
                trimmed = true;
            }
        } catch (_) {
            // Bezpieczny fallback do pełnego obrazu frontu
        }
        return {
            mimeType: trimmed ? 'image/jpeg' : (mimeType || 'image/jpeg'),
            base64: workBuf.toString('base64'),
            width,
            height,
            trimmed
        };
    } catch (_) {
        return fallback;
    }
}

/**
 * Przygotowuje zestaw obrazów kontretykiety (pełne ujęcie + zbliżenia ROI z powiększeniem Lanczos3),
 * aby drobny druk składu INCI i tabeli dozowania nie gubił się na białych marginesach packshotu.
 */
async function prepareBackLabelImageSet(buffer, mimeType = 'image/jpeg') {
    const fallback = {
        fullImage: {
            label: 'ZDJĘCIE 1 (PEŁNA KONTRETYKIETA PRODUKTU):',
            mimeType: mimeType || 'image/jpeg',
            base64: buffer.toString('base64')
        },
        mainLabelCrop: null,
        dosageZoomCrop: null,
        width: null,
        height: null,
        isLowResolution: false,
        trimmed: false
    };
    try {
        const meta = await sharp(buffer).metadata();
        const width = meta?.width || null;
        const height = meta?.height || null;
        if (!width || !height || width < 160 || height < 160) {
            return { ...fallback, width, height };
        }
        const isLowResolution = Math.max(width, height) < 1000;

        let workBuf = buffer;
        let workW = width;
        let workH = height;
        let trimmed = false;
        try {
            const trimmedRes = await sharp(buffer).trim({ threshold: 20 }).png().toBuffer({ resolveWithObject: true });
            const tw = trimmedRes?.info?.width || 0;
            const th = trimmedRes?.info?.height || 0;
            if (tw >= 120 && th >= 120 && (tw * th) <= (width * height * 0.92)) {
                workBuf = trimmedRes.data;
                workW = tw;
                workH = th;
                trimmed = true;
            }
        } catch (_) {
            // Obraz bez jednolitych marginesów
        }

        const cropLeft = Math.max(0, Math.floor(workW * 0.04));
        const cropWidth = Math.max(100, Math.min(workW - cropLeft, Math.ceil(workW * 0.92)));

        let mainLabelCrop = null;
        try {
            const mainTop = Math.max(0, Math.floor(workH * 0.22));
            const mainHeight = Math.max(80, Math.min(workH - mainTop, Math.ceil(workH * 0.75)));
            const mainTargetWidth = Math.min(2000, Math.max(cropWidth, 1400));
            const mainBuf = await sharp(workBuf)
                .extract({ left: cropLeft, top: mainTop, width: cropWidth, height: mainHeight })
                .resize({ width: mainTargetWidth, kernel: 'lanczos3', withoutEnlargement: false })
                .sharpen({ sigma: 0.9 })
                .jpeg({ quality: 93 })
                .toBuffer();
            mainLabelCrop = {
                label: 'ZBLIŻENIE 1 (GŁÓWNA STREFA KONTRETYKIETY – OSTRZEŻENIA, INCI, TABELA):',
                mimeType: 'image/jpeg',
                base64: mainBuf.toString('base64')
            };
        } catch (_) {
            mainLabelCrop = null;
        }

        let dosageZoomCrop = null;
        try {
            const doseTop = Math.max(0, Math.floor(workH * 0.48));
            const doseHeight = Math.max(60, Math.min(workH - doseTop, Math.ceil(workH * 0.49)));
            const doseTargetWidth = Math.min(2200, Math.max(cropWidth, 1600));
            const doseBuf = await sharp(workBuf)
                .extract({ left: cropLeft, top: doseTop, width: cropWidth, height: doseHeight })
                .resize({ width: doseTargetWidth, kernel: 'lanczos3', withoutEnlargement: false })
                .sharpen({ sigma: 1.1 })
                .jpeg({ quality: 94 })
                .toBuffer();
            dosageZoomCrop = {
                label: 'ZBLIŻENIE 2 (POWIĘKSZONA DOLNA CZĘŚĆ ETYKIETY – TABELA DOZOWANIA, IKONA NAKRĘTKI, POJEMNOŚĆ):',
                mimeType: 'image/jpeg',
                base64: doseBuf.toString('base64')
            };
        } catch (_) {
            dosageZoomCrop = null;
        }

        return {
            fullImage: fallback.fullImage,
            mainLabelCrop,
            dosageZoomCrop,
            width,
            height,
            isLowResolution,
            trimmed
        };
    } catch (_) {
        return fallback;
    }
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
0. Oficjalna identyfikacja produktu z przedniej etykiety:
   - "marka_front": dokładna nazwa marki z logo na froncie (np. "Viakal", "Cif", "Chanteclair", "Felce Azzurra", "Soft").
   - "linia_produktowa_front": nazwa submarki lub kolekcji produktu z frontu (np. "Bagno Express", "Vetro Doccia Express", "i Concentrati", "Classico"). KATEGORYCZNY ZAKAZ wpisywania ogólnych włoskich lub polskich słów oznaczających sam rodzaj produktu ("Detersivo", "Detersivo Liquido", "Ammorbidente", "Lavatrice", "Bucato", "Detergente", "Płyn do prania", "Płyn do płukania")! Jeśli na etykiecie obok marki i wariantu widnieje tylko nazwa kategorii (np. "Soft Detersivo Total Black"), zwróć null.
   - "wariant_etykieta_front": oryginalna, pełna nazwa wariantu zapachowego lub wersji z frontu (np. "Fiori di Primavera", "Lavanda", "Classico", "Total Black"). Jeśli brak, null.
   - "pelna_nazwa_etykieta": spójna oficjalna nazwa produktu odczytana 1:1 z opakowania (Marka + Linia + Wariant, np. "Viakal Bagno Express Fiori di Primavera", "Soft Detersivo Total Black"). BEZWZGLĘDNIE pomijaj hasła reklamowe typu "Nr 1", "N°1 Contro il Calcare", "Nowość", "Format XXL".
   - "bez_splukiwania": ustaw true WYŁĄCZNIE wtedy, gdy na froncie widnieje wyraźne oznaczenie formuły bez spłukiwania ("SENZA RISCIACQUO", "Bez spłukiwania", "No Rinse", "Sans rinçage", "Ohne Ausspülen"); w przeciwnym razie false lub null.
1. Pojemność lub waga: odczytaj dokładną wartość z jednostką (np. "650 ml", "750 ml", "1.5 l", "2,25 l", "2250 ml", "500 g", "1.5 kg"). Jeśli brak, null.
2. Wariant zapachowy lub wersja: odczytaj nazwę rzeczywistej nuty zapachowej dla kosmetyków i chemii (np. "Lawenda", "Cytryna i mięta", "Wiosenne kwiaty", "Ocean Fresh").
   - DLA ARTYKUŁÓW BEZWONNYCH (SZCZOTECZKI DO ZĘBÓW, AKCESORIA) ZAWSZE NULL!
   - KATEGORYCZNY ZAKAZ wpisywania składników chemicznych/czyszczących jako zapachu! Napisy typu "con Candeggina" (z wybielaczem), "con Bicarbonato" (z sodą), "con Aceto" (z octem), "con Ammoniaca" (z amoniakiem) oznaczają SKŁADNIK AKTYWNY (wpisz "Wybielacz", "Soda oczyszczona" lub "Ocet" do kluczowe_skladniki_front), a dla zapach_wariant zwróć null (chyba że obok podano rzeczywistą nutę zapachową np. Cytryna, Eukaliptus).
3. Twardość włosia (dla szczoteczek do zębów i pędzli): odczytaj stopień twardości (np. "Soft", "Medium", "Hard", "Ultra Soft", "Średnia", "Miękka", "Twarda"). Jeśli produkt nie posiada włosia, null.
4. Postać fizyczna: precyzyjnie określ postać po polsku na podstawie tego, co widnieje na etykiecie ("płyn", "żel", "pianka", "spray", "proszek", "kapsułki", "tabletki", "krem", "balsam", "mleczko", "chusteczki", "szczoteczka manualna", "wyrób higieniczny"). KRYTYCZNA ZASADA ETYKIETOWA: włoski detergent płynny opisany jako "Detersivo", "Detersivo liquido" lub "Ammorbidente" w butelce BEZ wyraźnego napisu "Gel" / "Żel" na froncie ma postać "płyn" (NIGDY nie wpisuj "żel" ani hybrydy "płyn żel"!). "żel" zwracaj WYŁĄCZNIE wtedy, gdy etykieta wyraźnie deklaruje formę żelową ("Gel" / "Żel").
5. Typ dozownika / zamknięcia: wskaż widoczny mechanizm po polsku (np. "pompka", "atomizer / spray", "korek / nakrętka", "nakrętka z miarką", "brak").
6. Wydajność lub liczba użyć: jeśli podano liczbę prań, kapsułek lub doz (np. "40 prań", "60 kapsułek", "100 doz"), wpisz po polsku. W przeciwnym razie null.
7. Przeznaczenie frontowe: główne docelowe zastosowanie podane na froncie, przetłumaczone w 100% na język polski bez obcojęzycznych wtrąceń w nawiasach (np. "uniwersalne czyszczenie powierzchni", "do czyszczenia kuchni i łazienki", "do higieny jamy ustnej", "do tkanin kolorowych"). Jeśli brak, null.
8. Zweryfikowane wyróżniki i certyfikaty użytkowe z etykiety ("glowne_hasla_front"): lista WYŁĄCZNIE obiektywnych, weryfikowalnych faktów użytkowych, testów i certyfikatów widocznych na froncie PRZETŁUMACZONYCH W 100% NA RZECZOWY JĘZYK POLSKI (np. ["Bez spłukiwania", "Testowany dermatologicznie", "Bez smug", "Bez chloru", "Butelka w 30% z plastiku z recyklingu", "Ogranicza powstawanie kropel i zacieków", "Neutralizuje nieprzyjemne zapachy"]). Jeśli na froncie widnieje "SENZA RISCIACQUO", OBOWIĄZKOWO umieść "Bez spłukiwania" na liście. KATEGORYCZNY ZAKAZ przepisywania haseł reklamowych, rankingów ("Nr 1", "N°1", "Najlepiej sprzedający się", "Il più venduto", "Bestseller"), rekomendacji obcych marek ("Raccomandato da Ideal Standard", "Polecany przez..."), etykiet rozmiaru/hype ("Format XXL", "Mega", "Nowość", "Ulepszona formuła", "Formula potente", "Luxury", "Premium", "100%"), zwrotów sprzedażowych ("do Twojej łazienki") ani obcojęzycznych sloganów! Jeśli na froncie są wyłącznie slogany reklamowe, zwróć pustą tablicę [].
9. Kluczowe składniki wyróżnione na froncie (Hero Ingredients): lista najważniejszych składników aktywnych, ekstraktów, olejków lub substancji czyszczących eksponowanych na przedniej etykiecie, przetłumaczona w 100% na język polski (np. ["Wybielacz", "Olej arganowy", "Mydło marsylskie", "Kwas hialuronowy", "Aktywny tlen", "Soda oczyszczona", "Aloes"]). Jeśli brak, pusta tablica [].
10. Rodzaj opakowania ("opakowanie_rodzaj"): określ po polsku typ pojemnika ze zdjęcia (np. "plastikowa butelka z atomizerem", "butelka z pompką", "plastikowa butelka", "zapas / worek / doypack", "kartonik", "plastikowe pudełko", "puszka (spray)", "tubka", "słoik", "kanister"). Jeśli niepewne, null.
11. Liczba sztuk ("liczba_sztuk"): wyłącznie jeśli na froncie wyraźnie podano liczbę sztuk/tabletek/kapsułek/wkładów (np. "40 szt.", "25 kapsułek", "12 szt."). Dla pojedynczej butelki bez oznaczenia wielopaku zwróć null.
12. Kraj produkcji ("kraj_produkcji_etykieta"): wyłącznie jeśli wyraźnie widoczny na froncie (np. "Made in Italy" -> "Włochy", "Made in Germany" -> "Niemcy"). W przeciwnym razie null.
UWAGA PRAWNA (BPR 528/2012 & Allegro 2026): Jeśli na zagranicznym opakowaniu widnieje słowo "Igienizzante", "Antibatterico", "Sanitizing", "Antibacterial" lub "Antybakteryjny", tłumacz je wyłącznie jako "Higieniczna czystość" lub "Głębokie oczyszczanie" (zakaz przypisywania właściwości biobójczych/antybakteryjnych/przeciwwirusowych). Pomijaj wszelkie hasła reklamowe producenta, rankingi rynkowe i nazwy obcych firm rekomendujących.`;

const frontVisionSchema = {
    type: "object",
    properties: {
        marka_front: { type: ["string", "null"] },
        linia_produktowa_front: { type: ["string", "null"] },
        wariant_etykieta_front: { type: ["string", "null"] },
        pelna_nazwa_etykieta: { type: ["string", "null"] },
        bez_splukiwania: { type: ["boolean", "null"] },
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
        },
        opakowanie_rodzaj: { type: ["string", "null"] },
        liczba_sztuk: { type: ["string", "null"] },
        kraj_produkcji_etykieta: { type: ["string", "null"] }
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
        // 3. Usuwanie obcojęzycznych wtrąceń i czystych sloganów z etykiety
        .replace(/\s*\(\s*(?:multiuso|potere\s+sbiancante|schiuma\s+potente|spray\s+attivo|formula\s+migliorata|azione\s+sgrassante|senza\s+aloni|senza\s+risciacquo|con\s+candeggina|candeggina|z\s+wybielaczem|pulito\s+profondo|profumo\s+di\s+pulito)\s*\)/gi, '')
        // 4. Neutralizacja włoskich haseł z etykiety na rzeczowe fakty użytkowe (bez sloganów reklamowych)
        .replace(/\bformula\s+migliorata\b/gi, '')
        .replace(/\bspray\s+attivo\b/gi, '')
        .replace(/\bpotere\s+sbiancante\b/gi, '')
        .replace(/\bschiuma\s+potente\b/gi, '')
        .replace(/\bazione\s+sgrassante\b/gi, 'Działanie odtłuszczające')
        .replace(/\bsenza\s+aloni\b/gi, 'Bez smug')
        .replace(/\bsenza\s+risciacquo\b/gi, 'Bez spłukiwania')
        .replace(/\bprofumo\s+di\s+pulito\b/gi, '')
        .replace(/\bpulito\s+profondo\b/gi, 'Głębokie czyszczenie')
        .replace(/\bcon\s+candeggina\b/gi, 'z wybielaczem')
        .replace(/\bcandeggina\b/gi, 'Wybielacz')
        .replace(/\bmultiuso\b/gi, 'wielofunkcyjny');
    cleaned = sanitizeAllegroMarketingText(cleaned, { isFeatureHighlight: true })
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
        const preparedFront = await prepareFrontLabelImage(buffer, mimeType);
        const { result, usage } = await aiWrapper.callAgentWithTelemetry({
            agentId: "0",
            systemInstruction: FRONT_VISION_PROMPT,
            prompt: `Odczytaj cechy fizyczne z przedniej etykiety produktu (EAN: ${ean || 'N/A'}) zgodnie z instrukcjami systemowymi.`,
            schema: frontVisionSchema,
            image: {
                mimeType: preparedFront.mimeType,
                base64: preparedFront.base64
            },
            onLog
        });

        const pimFeatures = {};
        if (result.marka_front && String(result.marka_front).trim().length > 0) {
            pimFeatures['Marka'] = String(result.marka_front).trim();
        }
        if (result.linia_produktowa_front && String(result.linia_produktowa_front).trim().length > 0) {
            const cleanLine = sanitizeVisionFrontText(String(result.linia_produktowa_front).trim());
            if (cleanLine && !isGenericCategoryWordNotLine(cleanLine)) {
                pimFeatures['Linia produktowa (Front)'] = cleanLine;
            }
        }
        if (result.wariant_etykieta_front && String(result.wariant_etykieta_front).trim().length > 0) {
            const cleanVariant = sanitizeVisionFrontText(String(result.wariant_etykieta_front).trim());
            if (cleanVariant) pimFeatures['Wariant (Etykieta Front)'] = cleanVariant;
        }
        if (result.pelna_nazwa_etykieta && String(result.pelna_nazwa_etykieta).trim().length > 0) {
            const cleanOfficial = sanitizeVisionFrontText(String(result.pelna_nazwa_etykieta).trim());
            if (cleanOfficial) pimFeatures['Nazwa produktu (Etykieta Front)'] = cleanOfficial;
        }
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
            const cleanPostac = sanitizeVisionFrontText(String(result.postac).trim());
            if (cleanPostac) {
                pimFeatures['Postać'] = cleanPostac;
                pimFeatures['Postać (Etykieta)'] = cleanPostac;
            }
        }
        const labelFormResolved = resolveLabelPhysicalForm({
            visionFeatures: pimFeatures,
            officialLabelName: pimFeatures['Nazwa produktu (Etykieta Front)'] || ''
        });
        if (labelFormResolved.isVerifiedFromLabel && labelFormResolved.canonicalForm &&
            (!pimFeatures['Postać (Etykieta)'] || /^(?:żel|zel|płyn\s+żel)$/i.test(pimFeatures['Postać (Etykieta)']))) {
            pimFeatures['Postać (Etykieta)'] = labelFormResolved.canonicalForm;
            pimFeatures['Postać'] = labelFormResolved.canonicalForm;
        }
        if (result.dozownik && String(result.dozownik).trim().length > 0) {
            const cleanDozownik = String(result.dozownik).trim();
            pimFeatures['Dozownik'] = cleanDozownik;
            pimFeatures['Dozownik (Etykieta)'] = cleanDozownik;
        }
        if (result.wydajnosc_liczba_uzyc && String(result.wydajnosc_liczba_uzyc).trim().length > 0) {
            pimFeatures['Wydajność'] = String(result.wydajnosc_liczba_uzyc).trim();
        }
        if (result.przeznaczenie_front && String(result.przeznaczenie_front).trim().length > 0) {
            const cleanPurpose = sanitizeVisionFrontText(String(result.przeznaczenie_front).trim());
            if (cleanPurpose) pimFeatures['Przeznaczenie (Front)'] = cleanPurpose;
        }
        if (Array.isArray(result.glowne_hasla_front) && result.glowne_hasla_front.length > 0) {
            const cleanedHighlights = sanitizeLabelHighlights(
                result.glowne_hasla_front.map(s => String(s || '').trim()).filter(Boolean)
            );
            if (cleanedHighlights.text) {
                pimFeatures['Wyróżniki (Etykieta Front)'] = cleanedHighlights.text;
            }
        }
        const isFrontNoRinse = result.bez_splukiwania === true ||
            /(?:senza\s+risciacquo|bez\s+spłukiwania|no\s+rinse)/i.test(JSON.stringify(result.glowne_hasla_front || []));
        if (isFrontNoRinse) {
            pimFeatures['Bez spłukiwania (Etykieta Front)'] = 'Tak';
            const existingHighlights = pimFeatures['Wyróżniki (Etykieta Front)'] || '';
            if (!/\bbez\s+spłukiwania\b/i.test(existingHighlights)) {
                pimFeatures['Wyróżniki (Etykieta Front)'] = existingHighlights
                    ? `Bez spłukiwania, ${existingHighlights}`
                    : 'Bez spłukiwania';
            }
        }
        if (Array.isArray(result.kluczowe_skladniki_front) && result.kluczowe_skladniki_front.length > 0) {
            pimFeatures['Składniki wiodące (Front)'] = result.kluczowe_skladniki_front
                .map(s => sanitizeVisionFrontText(String(s).trim()))
                .filter(Boolean)
                .join(', ');
        }
        if (result.opakowanie_rodzaj && String(result.opakowanie_rodzaj).trim().length > 0) {
            pimFeatures['Opakowanie (Front)'] = String(result.opakowanie_rodzaj).trim();
        }
        if (result.liczba_sztuk && String(result.liczba_sztuk).trim().length > 0) {
            pimFeatures['Liczba sztuk (Front)'] = String(result.liczba_sztuk).trim();
        }
        if (result.kraj_produkcji_etykieta && String(result.kraj_produkcji_etykieta).trim().length > 0) {
            pimFeatures['Kraj pochodzenia (Front)'] = String(result.kraj_produkcji_etykieta).trim();
        }

        onLog(`[VISION EXTRACTOR] Pomyślnie odczytano ${Object.keys(pimFeatures).length} cech z etykiety frontowej: ${Object.keys(pimFeatures).join(', ')}.`);

        return {
            raw: result,
            pimFeatures,
            usage,
            imageUrl: successfulUrl,
            sourceResolution: preparedFront.width && preparedFront.height
                ? { width: preparedFront.width, height: preparedFront.height }
                : null,
            capturedImage: {
                mimeType,
                base64: base64Data,
                url: successfulUrl
            },
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

3. EKSTRAKCJA OSTRZEŻEŃ BEZPIECZEŃSTWA ("warnings") I PIKTOGRAMÓW ("clp_pictograms"):
   - W "clp_pictograms" zwróć tablicę oficjalnych kodów widocznych na etykiecie piktogramów zagrożenia CLP w czerwonej rombowej ramce:
     * wykrzyknik = "GHS07"
     * substancja żrąca = "GHS05"
     * płomień = "GHS02"
     * środowisko = "GHS09"
     * zagrożenie zdrowia = "GHS08"
     * czaszka = "GHS06"
     * utleniacz = "GHS03", butla gazu = "GHS04", wybuchowy = "GHS01"
     * Jeśli brak piktogramów CLP na etykiecie, zwróć [].
   - Jeśli na etykiecie widoczne są ostrzeżenia bezpieczeństwa, piktogramy z opisem CLP lub środki ostrożności:
     * Ustaw "has_back_label": true.
     * Przetłumacz je wiernie w 100% na język polski (1:1 dokładnie to, co deklaruje producent na etykiecie) z zachowaniem oficjalnych, kompletnych kodów H/P/EUH (np. P101, P102, P103, P301+P330+P331, P303+P361+P353, P305+P351+P338, EUH206, EUH208 — zachowaj oba zdania w jednym zwrocie bez rozdzielania!).
     * Każdy odrębny punkt bezpieczeństwa oraz dodatkowe zdania z kontretykiety (np. "Nie wdychać rozpylonej cieczy.", "Nie mieszać z wybielaczami ani z innymi produktami czyszczącymi.", "Dokładnie umyć ręce po użyciu.") oddzielaj znakiem nowej linii (\n) lub pełną kropką i wielką literą.
     * KATEGORYCZNY ZAKAZ wrzucania do pola "warnings" sekcji składników chemicznych ("Contains / Zawiera: wodorotlenek sodu, alkohole C12-14..." / "Composizione chimica") ani numerów alarmowych Centro Antiveleni — skład należy wyłącznie do pola "inci"! (UWAGA: zwrot uczuleniowy EUH208 typu "Zawiera mieszaninę ... Może powodować wystąpienie reakcji alergicznej" JEST ostrzeżeniem i należy do "warnings" w dokładnym zakresie podanym przez producenta — nie dopisuj substancji spoza EUH208!).
     * KATEGORYCZNY ZAKAZ ZGADYWANIA I DOPISYWANIA ŚRODKÓW OCHRONY LUB ZAGROŻEŃ SPOZA ETYKIETY (np. zakaz dopisywania P280/rękawic ochronnych, maski, okularów czy H319, jeśli etykieta ich wyraźnie nie wymienia!).
   - Jeśli brak widocznych ostrzeżeń na zdjęciu, ustaw "warnings": null.

4. EKSTRAKCJA SPOSOBU UŻYCIA I OCENA CZYTELNOŚCI ("usage_instructions", "cap_capacity_ml", "cap_capacity_legible", "dosage_table_legibility", "unreadable_fields"):
   - Jeśli otrzymasz dodatkowe zdjęcie zbliżenia ("ZBLIŻENIE 1" / "ZBLIŻENIE 2"), wykorzystaj je równolegle z pełnym zdjęciem do precyzyjnego odczytu drobnego druku w tabeli dozowania i przy ikonie nakrętki.
   - DOKTRYNA ZERO ZGADYWANIA (KRYTYCZNE):
     * Odczytaj każdą liczbę i każdą komórkę tabeli WYŁĄCZNIE wtedy, gdy jej cyfry są faktycznie rozróżnialne na zdjęciu!
     * Oceń czytelność tabeli dozowania w polu "dosage_table_legibility":
       - "HIGH": wszystkie nagłówki i liczby w ml są wyraźne i jednoznaczne;
       - "MEDIUM": większość liczb jest czytelna, pojedyncze cyfry wymagają uważnego odczytu ze zbliżenia;
       - "LOW_UNREADABLE": rozdzielczość lub kompresja powoduje rozmycie bądź zlewanie się cyfr w komórkach;
       - "NOT_PRESENT": na etykiecie w ogóle nie ma tabeli dozowania w ml.
     * Pojemność nakrętki ("cap_capacity_ml", "cap_capacity_legible"): odczytaj wartość przy ikonie nakrętki WYŁĄCZNIE wtedy, gdy cyfry są wyraźnie czytelne. Jeśli rysunek lub liczba przy nakrętce są nieostre albo nieczytelne, ustaw "cap_capacity_legible": false, "cap_capacity_ml": null, dopisz "cap_capacity_ml" do "unreadable_fields" i NIE WPISUJ żadnej objętości nakrętki do "usage_instructions"!
     * Jeśli "dosage_table_legibility" ma wartość "LOW_UNREADABLE", dopisz "dosage_table" do "unreadable_fields" i NIE KONFABULUJ liczb w komórkach tabeli z pamięci — przepisz wyłącznie czytelne zalecenia słowne lub oznacz wątpliwe wartości jako "[nieczytelne na zdjęciu]".
   - Jeśli tabela dozowania jest czytelna ("HIGH" lub "MEDIUM"):
     * Przepisz i przetłumacz DOKŁADNIE każdą komórkę tabeli dozowania — wiersz po wierszu i kolumna po kolumnie!
     * Rozróżnij wszystkie poziomy zabrudzeń ("sporco normale / średnie zabrudzenia" i "molto sporco / mocne zabrudzenia"), twardość wody ("dolce/miękka", "media/średnia", "dura/twarda"), wszystkie wsady pralki (np. "4-5 kg", "6-8 kg", dopiski typu "MAXI 9-10 kg") oraz pranie/płukanie ręczne ("a mano" w litrach wody).
   - Dla płynów i koncentratów do płukania tkanin ("Ammorbidente") tłumacz nagłówki ikonek pralki i miski ("In lavatrice" / "A mano") wyłącznie jako "Płukanie w pralce" oraz "Płukanie ręczne" — KATEGORYCZNY ZAKAZ pisania "Pranie w pralce" lub "prać w pralce"!
   - Zachowaj wszystkie temperatury (np. "nawet na zimno"), czasy działania, spłukiwanie lub BRAK spłukiwania (np. gdy kafelki pokazują "SPRUZZA -> PASSA -> FATTO!" albo front deklaruje "SENZA RISCIACQUO / Bez spłukiwania") oraz uwagi typu "postępować zgodnie z instrukcją obsługi urządzenia". KATEGORYCZNY ZAKAZ halucynowania etapu "i spłukać" z pamięci o innym produkcie tej samej marki!
   - Zastosuj zgodność z BPR: słowa typu "igienizzante/antibatterico" tłumacz jako "higienicznie czyszczący".
   - Jeśli brak widocznej instrukcji użycia na zdjęciu, ustaw "usage_instructions": null.

5. EKSTRAKCJA NAZWY Z KONTRETYKIETY, POSTACI, POWIERZCHNI DOCELOWYCH, CERTYFIKATÓW / TESTÓW, PRODUCENTA I KRAJU ("oficjalna_nazwa_kontretykieta", "postac_kontretykieta", "target_surfaces", "certifications_and_claims", "manufacturer_name", "country_of_origin", "packaging_type", "pieces_count", "numeric_ph"):
   - W "oficjalna_nazwa_kontretykieta" podaj dokładną nazwę produktu występującą w nagłówku opisu na kontretykiecie (np. "Viakal Bagno Express", "Soft Detersivo Total Black"). W przeciwnym razie null.
   - W "postac_kontretykieta" podaj postać fizyczną wynikającą z tekstu etykiety ("płyn" dla "Detersivo liquido"/"Ammorbidente" bez słowa "Gel", "żel" tylko gdy etykieta wyraźnie pisze "Gel"/"Żel").
   - W "target_surfaces" wypisz po polsku wszystkie powierzchnie i zastosowania wymienione w opisie na tylnej etykiecie (dla płynu do płukania: "tkaniny, płukanie w pralce i płukanie ręczne" — nigdy "pranie w pralce"!).
   - W "certifications_and_claims" wypisz po polsku WYŁĄCZNIE obiektywne, weryfikowalne certyfikaty, testy laboratoryjne i fakty materiałowe z tylnej etykiety (np. "certyfikat Air Label Score A+ (minimalna emisja substancji do powietrza), testowany dermatologicznie, testowany na obecność niklu, rtęci, ołowiu i chromu, odpowiedni do planów H.A.C.C.P., butelka zawiera 30% plastiku z recyklingu"). KATEGORYCZNY ZAKAZ przepisywania haseł reklamowych, rankingów rynkowych ("Najlepiej sprzedający się produkt we Włoszech", "*il più venduto in Italia", "Nr 1"), rekomendacji obcych marek ani obietnic skuteczności! Jeśli brak zweryfikowanych certyfikatów/faktów, ustaw null.
   - W "manufacturer_name" podaj pełną nazwę producenta z kontretykiety (np. "Italchimica S.r.l.").
   - W "country_of_origin" podaj kraj produkcji po polsku wyłącznie jeśli wyraźnie widoczny na etykiecie (np. "Made in Italy" -> "Włochy"). W przeciwnym razie null.
   - W "packaging_type" podaj rodzaj opakowania jeśli wyraźnie widoczny na etykiecie (np. "plastikowa butelka z atomizerem", "worek uzupełniający", "kartonik"). W przeciwnym razie null.
   - W "pieces_count" podaj liczbę fizycznych sztuk/tabletek/kapsułek WYŁĄCZNIE gdy jest to produkt sztukowy (np. "40 kapsułek", "25 tabletek"). Dla płynów i żeli w butelce NIE wpisuj liczby prań do pieces_count — zwróć null!
   - W "numeric_ph" podaj wyłącznie wydrukowaną na etykiecie liczbę pH (np. "5.5", "3.0"), NIE zgaduj! W przeciwnym razie null.`;

const backPackInciSchema = {
    type: "object",
    properties: {
        has_ingredients_label: { type: "boolean" },
        has_back_label: { type: "boolean" },
        inci: { type: ["string", "null"] },
        raw_composition_text: { type: ["string", "null"] },
        warnings: { type: ["string", "null"] },
        clp_pictograms: {
            type: "array",
            items: { type: "string" }
        },
        usage_instructions: { type: ["string", "null"] },
        cap_capacity_ml: { type: ["string", "null"] },
        cap_capacity_legible: { type: ["boolean", "null"] },
        dosage_table_legibility: { type: ["string", "null"] },
        unreadable_fields: {
            type: "array",
            items: { type: "string" }
        },
        oficjalna_nazwa_kontretykieta: { type: ["string", "null"] },
        postac_kontretykieta: { type: ["string", "null"] },
        target_surfaces: { type: ["string", "null"] },
        certifications_and_claims: { type: ["string", "null"] },
        manufacturer_name: { type: ["string", "null"] },
        country_of_origin: { type: ["string", "null"] },
        packaging_type: { type: ["string", "null"] },
        pieces_count: { type: ["string", "null"] },
        numeric_ph: { type: ["string", "null"] }
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
async function extractInciFromBackPack(imageUrlOrCandidates, ean = null, onLog = () => {}, skipFrontUrl = null, options = {}) {
    const rawCandidateUrls = Array.isArray(imageUrlOrCandidates)
        ? imageUrlOrCandidates.filter(u => typeof u === 'string' && u.trim().length > 0)
        : (typeof imageUrlOrCandidates === 'string' && imageUrlOrCandidates.trim().length > 0 ? [imageUrlOrCandidates.trim()] : []);

    if (rawCandidateUrls.length === 0) {
        return { found: false, inci: null, warnings: null, usageInstructions: null, clpPictograms: [], pimFeatures: {}, raw: null, imageUrl: null, reason: 'Brak dostępnych zdjęć do analizy etykiety' };
    }

    // Jeśli posiadamy więcej niż 1 zdjęcie i znamy już URL zdjęcia frontowego (zbadanego w extractFrontPackFeatures),
    // pomijamy powtórne skanowanie frontu w poszukiwaniu tylnej etykiety INCI (oszczędność wywołania Vision API).
    const candidateUrls = (skipFrontUrl && rawCandidateUrls.length > 1)
        ? rawCandidateUrls.filter(u => u.trim() !== skipFrontUrl.trim())
        : rawCandidateUrls;

    const frontCtx = options?.frontContext && typeof options.frontContext === 'object' ? options.frontContext : null;

    let frontContextNote = '';
    const isSoftenerFromFront = isFabricSoftenerProduct({
        productName: frontCtx?.['Nazwa produktu (Etykieta Front)'] || options?.productName || '',
        line: frontCtx?.['Linia produktowa (Front)'] || '',
        visionFeatures: frontCtx || {}
    });
    const frontCapVal = frontCtx?.['Pojemność / Waga'] || frontCtx?.['Pojemność'] || '';
    const frontYieldVal = frontCtx?.['Wydajność'] || frontCtx?.['Liczba prań'] || '';
    if (frontCtx && Object.keys(frontCtx).length > 0) {
        const frontSummaryParts = [];
        if (frontCtx['Nazwa produktu (Etykieta Front)']) frontSummaryParts.push(`Nazwa frontowa: ${frontCtx['Nazwa produktu (Etykieta Front)']}`);
        const frontPostacVal = frontCtx['Postać (Etykieta)'] || frontCtx['Postać'] || '';
        if (frontCapVal) frontSummaryParts.push(`Pojemność z frontu: ${frontCapVal}`);
        if (frontYieldVal) frontSummaryParts.push(`Deklarowana wydajność z frontu: ${frontYieldVal}`);
        if (frontPostacVal) frontSummaryParts.push(`Postać fizyczna z etykiety: ${frontPostacVal}`);
        if (isSoftenerFromFront) {
            frontSummaryParts.push('KATEGORIA: PŁYN DO PŁUKANIA TKANIN (Ammorbidente) — używaj terminologii Płukanie w pralce / Płukanie ręczne (ZAKAZ "Pranie w pralce" / "prać w pralce")!');
        }
        if (frontCtx['Bez spłukiwania (Etykieta Front)'] === 'Tak' || /bez\s+spłukiwania/i.test(frontCtx['Wyróżniki (Etykieta Front)'] || '')) {
            frontSummaryParts.push('KRYTYCZNY FAKT Z FRONTU: Produkt ma formułę BEZ SPŁUKIWANIA (SENZA RISCIACQUO) — NIE WOLNO dopisywać etapu spłukiwania wodą, jeśli kafelki/tekst kontretykiety pokazują przetarcie bez spłukiwania!');
        }
        if (frontCtx['Wyróżniki (Etykieta Front)']) frontSummaryParts.push(`Wyróżniki frontowe: ${frontCtx['Wyróżniki (Etykieta Front)']}`);
        if (frontSummaryParts.length > 0) {
            frontContextNote = `\n\nKONTEKST Z FRONTU OPAKOWANIA (wyłącznie dla spójności ontologicznej — bez zgadywania liczb ze zdjęcia):\n- ${frontSummaryParts.join('\n- ')}`;
        }
    }

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
            onLog(`[VISION BACK-PACK OCR] Analiza multimodalna Flash HIGH (Skład / Ostrzeżenia / Sposób użycia) dla zdjęcia${label}...`);
            const base64Data = bufferRes.buffer.toString('base64');
            const prepared = await prepareBackLabelImageSet(bufferRes.buffer, bufferRes.mimeType);
            const backPromptText = `Przeanalizuj tylną etykietę produktu (EAN: ${ean || 'N/A'}) zgodnie z instrukcjami systemowymi.${frontContextNote}`;
            const callPayload = {
                agentId: "0",
                systemInstruction: BACK_PACK_INCI_PROMPT,
                prompt: backPromptText,
                schema: backPackInciSchema,
                onLog
            };
            if (prepared.dosageZoomCrop) {
                callPayload.images = [
                    prepared.fullImage,
                    prepared.dosageZoomCrop
                ];
            } else {
                callPayload.image = {
                    mimeType: bufferRes.mimeType,
                    base64: base64Data
                };
            }
            let { result, usage } = await aiWrapper.callAgentWithTelemetry(callPayload);
            let modelUsed = 'gemini-3.8-flash';
            let escalatedToPro = false;
            const escalationReasons = [];

            if (result) {
                const rawLegibility = String(result.dosage_table_legibility || '').toUpperCase().trim();
                const rawUsageProbe = typeof result.usage_instructions === 'string' ? result.usage_instructions.trim() : '';
                const hasDosingSignal = /(?:pral|wsad|dozow|woda\s+(?:miękk|średn|tward)|\d+\s*ml)/i.test(rawUsageProbe);
                const capIllegible = result.cap_capacity_legible === false && hasDosingSignal;
                const flashMath = (frontCapVal && frontYieldVal && rawUsageProbe)
                    ? validateDosageYieldMath({ capacityText: frontCapVal, yieldText: frontYieldVal, usageText: rawUsageProbe })
                    : { valid: true };

                if (rawLegibility === 'LOW_UNREADABLE') escalationReasons.push('DOSAGE_TABLE_LOW_UNREADABLE');
                if (capIllegible) escalationReasons.push('CAP_CAPACITY_ILLEGIBLE');
                if (!flashMath.valid) escalationReasons.push(`DOSAGE_MATH_MISMATCH: ${flashMath.reason}`);
                if (prepared.isLowResolution && rawLegibility === 'MEDIUM' && hasDosingSignal) {
                    escalationReasons.push(`LOW_SOURCE_RESOLUTION (${prepared.width}x${prepared.height})`);
                }

                if (escalationReasons.length > 0 && options.disableProEscalation !== true) {
                    onLog(`[VISION BACK-PACK OCR] Wykryto niejednoznaczny odczyt lub niską czytelność (${escalationReasons.join('; ')}). Auto-eskalacja na gemini-3.1-pro-preview (MEDIA_RESOLUTION_HIGH)...`);
                    try {
                        const proImages = [prepared.fullImage, prepared.mainLabelCrop, prepared.dosageZoomCrop].filter(Boolean);
                        const proPayload = {
                            agentId: '0_pro',
                            systemInstruction: BACK_PACK_INCI_PROMPT,
                            prompt: `${backPromptText}\n\nUWAGA AUDYTORA JAKOŚCI: Pierwszy odczyt oznaczył niepewność (${escalationReasons.map(r => r.split(':')[0]).join(', ')}). Zweryfikuj uważnie załączone zbliżenia etykiety. Jeśli konkretne cyfry nakrętki lub komórek tabeli są na obrazie nieostre albo nieczytelne, KATEGORYCZNIE NIE ZGADUJ — ustaw cap_capacity_legible: false oraz/lub dosage_table_legibility: "LOW_UNREADABLE".`,
                            schema: backPackInciSchema,
                            onLog
                        };
                        if (proImages.length > 1) {
                            proPayload.images = proImages;
                        } else {
                            proPayload.image = {
                                mimeType: prepared.fullImage.mimeType,
                                base64: prepared.fullImage.base64
                            };
                        }
                        const proRes = await aiWrapper.callAgentWithTelemetry(proPayload);
                        if (proRes?.result) {
                            const rPro = proRes.result;
                            result = {
                                ...result,
                                ...rPro,
                                inci: rPro.inci || result.inci,
                                warnings: rPro.warnings || result.warnings,
                                clp_pictograms: Array.isArray(rPro.clp_pictograms) && rPro.clp_pictograms.length > 0 ? rPro.clp_pictograms : result.clp_pictograms,
                                usage_instructions: rPro.usage_instructions !== undefined ? rPro.usage_instructions : result.usage_instructions,
                                cap_capacity_ml: rPro.cap_capacity_ml !== undefined ? rPro.cap_capacity_ml : result.cap_capacity_ml,
                                cap_capacity_legible: rPro.cap_capacity_legible !== undefined ? rPro.cap_capacity_legible : result.cap_capacity_legible,
                                dosage_table_legibility: rPro.dosage_table_legibility || result.dosage_table_legibility,
                                unreadable_fields: Array.isArray(rPro.unreadable_fields) ? rPro.unreadable_fields : result.unreadable_fields
                            };
                            escalatedToPro = true;
                            modelUsed = 'gemini-3.1-pro-preview';
                            if (proRes.usage) {
                                usage = {
                                    promptTokenCount: (usage?.promptTokenCount || 0) + (proRes.usage.promptTokenCount || 0),
                                    candidatesTokenCount: (usage?.candidatesTokenCount || 0) + (proRes.usage.candidatesTokenCount || 0),
                                    thoughtsTokenCount: (usage?.thoughtsTokenCount || 0) + (proRes.usage.thoughtsTokenCount || 0),
                                    totalTokenCount: (usage?.totalTokenCount || 0) + (proRes.usage.totalTokenCount || 0)
                                };
                            }
                        }
                    } catch (proErr) {
                        onLog(`[VISION BACK-PACK OCR OSTRZEŻENIE] Auto-eskalacja na model Pro nie powiodła się (${proErr.message}). Używam odczytu modelu podstawowego.`);
                    }
                }
            }

            if (result) {
                let validInci = null;
                let validWarnings = null;
                let validUsage = null;
                let validPictograms = [];
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

                if (Array.isArray(result.clp_pictograms) && result.clp_pictograms.length > 0) {
                    validPictograms = [...new Set(
                        result.clp_pictograms
                            .map(c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''))
                            .filter(c => /^GHS0[1-9]$/.test(c))
                    )];
                    if (validPictograms.length > 0) {
                        pimFeatures['Piktogramy CLP (Etykieta)'] = validPictograms.join(', ');
                    }
                }

                if (result.warnings && typeof result.warnings === 'string' && result.warnings.trim().length >= 5) {
                    validWarnings = result.warnings.trim()
                        .replace(/\bDO OCZÓW\b/gi, 'DO OCZU')
                        .replace(/\bKONTATKT?U\b/gi, 'KONTAKTU')
                        .replace(/W\s+PRZYPADKU\s+(?:KONTAKTU|KONTATKU)\s+ZE\s+SKÓRĄ/gi, 'W PRZYPADKU STYCZNOŚCI ZE SKÓRĄ')
                        .replace(/\s*(?:Zawiera|Contains|Contiene|Skład\s+chemiczny|Composizione\s+chimica)\s*[:–-]?\s*(?:wodorotlenek|alkohol|sodium|alcoli|fosfonian)[^.\n]*\.?/gi, '')
                        .replace(/[ \t]{2,}/g, ' ')
                        .trim();
                    pimFeatures['Ostrzeżenia'] = validWarnings;
                    pimFeatures['Ostrzeżenia (Etykieta)'] = validWarnings;
                }

                if (result.usage_instructions && typeof result.usage_instructions === 'string' && result.usage_instructions.trim().length >= 5) {
                    validUsage = sanitizeVisionFrontText(result.usage_instructions.trim());
                    if (isSoftenerFromFront) {
                        validUsage = normalizeFabricSoftenerTerminology(validUsage);
                    }
                    if (result.cap_capacity_legible === false) {
                        validUsage = validUsage
                            .replace(/\(\s*(?:1\s*)?(?:nakrętka|pojemność\s+nakrętki(?:\s+wynosi)?)\s*(?:=|wynosi|:)?\s*\d+(?:[.,]\d+)?\s*ml\s*\)/gi, '')
                            .replace(/\s{2,}/g, ' ')
                            .trim();
                    }
                    pimFeatures['Sposób użycia'] = validUsage;
                    pimFeatures['Sposób użycia (Etykieta)'] = validUsage;
                }

                if (result.cap_capacity_legible !== false && result.cap_capacity_ml && typeof result.cap_capacity_ml === 'string' && result.cap_capacity_ml.trim().length >= 1) {
                    const capVal = String(result.cap_capacity_ml).trim();
                    const capDigits = capVal.match(/\d+(?:[.,]\d+)?/);
                    if (capDigits) {
                        pimFeatures['Pojemność nakrętki (Etykieta)'] = `${capDigits[0].replace(',', '.')} ml`;
                    }
                }

                if (result.oficjalna_nazwa_kontretykieta && typeof result.oficjalna_nazwa_kontretykieta === 'string' && result.oficjalna_nazwa_kontretykieta.trim().length >= 2) {
                    const cleanBackName = sanitizeVisionFrontText(result.oficjalna_nazwa_kontretykieta.trim());
                    if (cleanBackName) pimFeatures['Nazwa produktu (Kontretykieta)'] = cleanBackName;
                }

                if (result.postac_kontretykieta && typeof result.postac_kontretykieta === 'string' && result.postac_kontretykieta.trim().length >= 2) {
                    const cleanBackPostac = sanitizeVisionFrontText(result.postac_kontretykieta.trim());
                    if (cleanBackPostac && !/^(?:płyn\s+żel|żel\s+płyn)$/i.test(cleanBackPostac)) {
                        pimFeatures['Postać (Etykieta)'] = cleanBackPostac;
                    }
                }

                if (result.target_surfaces && typeof result.target_surfaces === 'string' && result.target_surfaces.trim().length >= 5) {
                    let cleanSurfaces = sanitizeVisionFrontText(result.target_surfaces.trim());
                    if (isSoftenerFromFront) {
                        cleanSurfaces = normalizeFabricSoftenerTerminology(cleanSurfaces);
                    }
                    if (cleanSurfaces) pimFeatures['Przeznaczenie (Etykieta)'] = cleanSurfaces;
                }

                if (result.certifications_and_claims && typeof result.certifications_and_claims === 'string' && result.certifications_and_claims.trim().length >= 5) {
                    const filteredCerts = sanitizeLabelHighlights(result.certifications_and_claims.trim());
                    if (filteredCerts.text) {
                        pimFeatures['Wyróżniki / Certyfikaty (Etykieta)'] = filteredCerts.text;
                    }
                }

                if (result.manufacturer_name && typeof result.manufacturer_name === 'string' && result.manufacturer_name.trim().length >= 3) {
                    pimFeatures['Producent'] = result.manufacturer_name.trim();
                }
                if (result.country_of_origin && typeof result.country_of_origin === 'string' && result.country_of_origin.trim().length >= 3) {
                    pimFeatures['Kraj pochodzenia (Etykieta)'] = result.country_of_origin.trim();
                }
                if (result.packaging_type && typeof result.packaging_type === 'string' && result.packaging_type.trim().length >= 3) {
                    pimFeatures['Opakowanie (Etykieta)'] = result.packaging_type.trim();
                }
                if (result.pieces_count && typeof result.pieces_count === 'string' && result.pieces_count.trim().length > 0) {
                    const cleanPieces = result.pieces_count.trim();
                    if (!/\b(?:pra[nń]|pranie|płuka[nń]|płukanie|lavagg|wash|cykl)/i.test(cleanPieces)) {
                        pimFeatures['Liczba sztuk (Etykieta)'] = cleanPieces;
                    }
                }
                if (result.numeric_ph && typeof result.numeric_ph === 'string' && /^\d+(?:[.,]\d+)?$/.test(result.numeric_ph.trim())) {
                    pimFeatures['pH (Etykieta)'] = result.numeric_ph.trim().replace(',', '.');
                }

                const finalLegibility = String(result.dosage_table_legibility || '').toUpperCase().trim() || null;
                const finalUnreadableFields = Array.isArray(result.unreadable_fields)
                    ? result.unreadable_fields.map(x => String(x || '').trim()).filter(Boolean)
                    : [];
                const finalMathCheck = (frontCapVal && frontYieldVal && validUsage)
                    ? validateDosageYieldMath({ capacityText: frontCapVal, yieldText: frontYieldVal, usageText: validUsage })
                    : { valid: true };

                let ocrQualityWarning = null;
                if (finalLegibility === 'LOW_UNREADABLE' || !finalMathCheck.valid || (result.cap_capacity_legible === false && /(?:pral|wsad|dozow)/i.test(validUsage || ''))) {
                    const resInfo = prepared.width && prepared.height ? `${prepared.width}x${prepared.height} px` : 'nieznana rozdzielczość';
                    const warnReasons = [];
                    if (finalLegibility === 'LOW_UNREADABLE') {
                        warnReasons.push(`tabela dozowania na zdjęciu tyłu (${resInfo}) jest nieostra/nieczytelna`);
                    }
                    if (result.cap_capacity_legible === false) {
                        warnReasons.push('objętość nakrętki przy ikonie korka nie jest czytelna na zdjęciu');
                    }
                    if (!finalMathCheck.valid && finalMathCheck.reason) {
                        warnReasons.push(finalMathCheck.reason);
                    }
                    ocrQualityWarning = `Wymagana weryfikacja lub ostrzejsze zdjęcie tyłu (>=1600 px): ${warnReasons.join('; ')}.`;
                    pimFeatures['Ostrzeżenie OCR (Etykieta)'] = ocrQualityWarning;

                    if (finalLegibility === 'LOW_UNREADABLE' && !finalMathCheck.valid) {
                        validUsage = null;
                        delete pimFeatures['Sposób użycia'];
                        delete pimFeatures['Sposób użycia (Etykieta)'];
                    }
                }

                const ocrDiagnostics = {
                    modelUsed,
                    escalatedToPro,
                    escalationReasons,
                    dosageTableLegibility: finalLegibility,
                    capCapacityLegible: result.cap_capacity_legible !== undefined ? result.cap_capacity_legible : null,
                    unreadableFields: finalUnreadableFields,
                    sourceWidth: prepared.width,
                    sourceHeight: prepared.height,
                    isLowResolution: prepared.isLowResolution,
                    dosageMathValid: finalMathCheck.valid,
                    dosageMathReason: finalMathCheck.reason || null,
                    ocrQualityWarning
                };

                if (validInci) {
                    onLog(`[VISION BACK-PACK OCR SUKCES] (${modelUsed}) Odczytano dane z tylnej etykiety${label} (Skład/INCI: TAK, Ostrzeżenia: ${validWarnings ? 'TAK' : 'NIE'}, Sposób użycia: ${validUsage ? 'TAK' : 'NIE'}, CLP: ${validPictograms.join(',') || 'brak'}, Czytelność tabeli: ${finalLegibility || 'N/A'}).`);
                    return {
                        found: true,
                        inci: validInci,
                        warnings: validWarnings,
                        usageInstructions: validUsage,
                        clpPictograms: validPictograms,
                        pimFeatures,
                        ocrDiagnostics,
                        raw: result.raw_composition_text || null,
                        imageUrl: currentUrl,
                        capturedImage: {
                            mimeType: bufferRes.mimeType,
                            base64: base64Data,
                            url: currentUrl
                        },
                        usage
                    };
                }

                if ((validWarnings || validUsage || validPictograms.length > 0 || ocrQualityWarning) && !bestPartialResult) {
                    onLog(`[VISION BACK-PACK OCR INFO] Odczytano częściowe dane z kontretykiety${label} (brak pełnego INCI na tym ujęciu).`);
                    bestPartialResult = {
                        found: true,
                        inci: null,
                        warnings: validWarnings,
                        usageInstructions: validUsage,
                        clpPictograms: validPictograms,
                        pimFeatures,
                        ocrDiagnostics,
                        raw: result.raw_composition_text || null,
                        imageUrl: currentUrl,
                        capturedImage: {
                            mimeType: bufferRes.mimeType,
                            base64: base64Data,
                            url: currentUrl
                        },
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

    return { found: false, inci: null, warnings: null, usageInstructions: null, clpPictograms: [], pimFeatures: {}, ocrDiagnostics: null, raw: null, imageUrl: null };
}

module.exports = {
    extractFrontPackFeatures,
    extractInciFromBackPack,
    fetchImageBuffer,
    prepareFrontLabelImage,
    prepareBackLabelImageSet,
    sanitizeVisionFrontText,
    FRONT_VISION_PROMPT,
    frontVisionSchema,
    BACK_PACK_INCI_PROMPT,
    backPackInciSchema
};
