const {
    sanitizeOfferTitle,
    normalizeCapacityValue
} = require('./deterministic-pipeline.engine');
const {
    CANONICAL_ACRONYMS,
    POLISH_CONNECTOR_WORDS,
    isNoRinseFormula
} = require('./label-truth.helpers');
const {
    scanStrictStopwords,
    scanAllegroComplianceRisks,
    sanitizeLabelHighlights
} = require('./allegro-compliance.policy');
const {
    scan_biocidal_claims_lexical,
    scan_medical_claims_lexical
} = require('../validators');

const MAX_ALLEGRO_TITLE_LEN = 75;
const MIN_ALLEGRO_TITLE_LEN = 12;
const OPTIMAL_MIN_ALLEGRO_TITLE_LEN = 55;
const OPTIMAL_TARGET_MIN_LEN = 58;
const OPTIMAL_TARGET_MAX_LEN = 74;

const TITLE_SPECIAL_CHARS_RX = /[!@#$%^&*(){}<>|~`"'♥★☆€]/;
const TITLE_CONTACT_OR_LINK_RX = /(https?:\/\/|www\.|@\w+\.)/i;
const TITLE_LOGISTICS_RX = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:faktura|vat|odbiór\s+osobisty|kurier|paczkomat|wysyłka\s*\d*h?)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i;
const TITLE_EXTRA_BANNED_RX = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:ostatnie\s+sztuki|wysyłka\s+24\s*h|hit\s+cenowy|wyprzedaż|promocja|okazja|gratis|tanio|najtaniej|polecam|nowość|bestseller|rewelacja|super|mega)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i;
const TITLE_ERP_TYPO_RX = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])(?:expres|candegina|odkamieniacz\s+fi\b)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i;
const CAPACITY_PAIR_RX = /^(\d+(?:[.,]\d+)?)\s*(ml|l|kg|g|szt\.?|kaps\.?)$/i;
const TRAILING_CAPACITY_RX = /\s+(\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g|szt\.?|kaps\.?))$/i;

/**
 * Sprowadza polskie odmiany wyrazów o tym samym rdzeniu marketingowym do wspólnego klucza porównawczego.
 */
function normalizePolishStem(word = '') {
    const clean = String(word || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    if (!clean || clean.length < 4 || /^\d+$/.test(clean)) return '';
    if (/^(?:ml|kg|szt|kaps|cm|mm|mb|ph)$/.test(clean)) return '';
    if (/^(?:płyn|płyni|plyn)/.test(clean)) return 'płyn';
    if (/^(?:spray|sprayu)/.test(clean)) return 'spray';
    if (/^(?:łazien|lazien)/.test(clean)) return 'łazien';
    if (/^(?:prań|prani)/.test(clean)) return 'prani';
    if (/^(?:płuka|pluka)/.test(clean)) return 'płuka';
    if (/^(?:czysz|czyszc)/.test(clean)) return 'czysz';
    if (/^(?:naczy)/.test(clean)) return 'naczy';
    if (/^(?:mydł|mydl)/.test(clean)) return 'mydł';
    if (/^(?:włos)/.test(clean)) return 'włos';
    if (/^(?:skór)/.test(clean)) return 'skór';
    if (/^(?:zapach)/.test(clean)) return 'zapach';
    return clean.slice(0, 5);
}

/**
 * Usuwa powtórzone słowa lub identyczne rdzenie w obrębie tytułu,
 * nie naruszając pary [liczba + jednostka] (np. "750 ml").
 */
function deduplicateTitleWords(rawTitle = '') {
    const clean = String(rawTitle || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';

    const tokens = clean.split(/\s+/);
    const out = [];
    const seenExactWords = new Set();
    const seenStems = new Set();

    for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        const lower = tok.toLowerCase();
        const plain = lower.replace(/[^\p{L}\p{N}]/gu, '');

        // Para [liczba] [jednostka] (np. "470 ml") musi przejść w całości
        const nextTok = tokens[i + 1];
        if (nextTok && CAPACITY_PAIR_RX.test(`${tok} ${nextTok}`)) {
            out.push(tok, nextTok.toLowerCase());
            i++;
            continue;
        }
        if (CAPACITY_PAIR_RX.test(tok)) {
            out.push(lower);
            continue;
        }

        if (!plain) continue;

        // Zawsze zachowuj krótkie spójniki/przyimki, o ile nie dublują się bezpośrednio obok siebie
        if (POLISH_CONNECTOR_WORDS.has(plain) || plain.length <= 2) {
            if (out.length > 0 && out[out.length - 1].toLowerCase() === lower) continue;
            out.push(tok);
            continue;
        }

        if (seenExactWords.has(plain)) continue;
        const stem = normalizePolishStem(plain);
        if (stem && seenStems.has(stem)) continue;

        seenExactWords.add(plain);
        if (stem) seenStems.add(stem);
        out.push(tok);
    }

    return out.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Pełna walidacja tytułu oferty pod wymogi Allegro 2026 (limit 12–75 zn., Trafność, Allegro Ads, BPR/Medyczne, §A).
 */
function validateAllegroOfferTitle(rawTitle = '', { brand = '', bannedExtra = [] } = {}) {
    const title = String(rawTitle || '').replace(/\s+/g, ' ').trim();
    const chars = [...title];
    const length = chars.length;
    const words = title ? title.split(/\s+/).filter(Boolean) : [];
    const issues = [];
    const errors = [];
    const warnings = [];

    const pushIssue = (severity, code, message, extra = {}) => {
        issues.push({ severity, code, message, ...extra });
        if (severity === 'error') {
            errors.push(message);
        } else {
            warnings.push(message);
        }
    };

    if (!title) {
        pushIssue('error', 'EMPTY', 'Tytuł oferty jest pusty.');
        return { valid: false, seoOptimal: false, score: 0, length: 0, wordCount: 0, errors, warnings, issues };
    }

    if (length > MAX_ALLEGRO_TITLE_LEN) {
        pushIssue('error', 'TOO_LONG', `Tytuł przekracza twardy limit Allegro (${length}/${MAX_ALLEGRO_TITLE_LEN} znaków).`, { len: length, excess: length - MAX_ALLEGRO_TITLE_LEN });
    }
    if (length < MIN_ALLEGRO_TITLE_LEN) {
        pushIssue('error', 'TOO_SHORT', `Tytuł jest krótszy niż wymagane minimum ${MIN_ALLEGRO_TITLE_LEN} znaków (${length} zn.).`, { len: length });
    } else if (length < OPTIMAL_MIN_ALLEGRO_TITLE_LEN) {
        pushIssue('warning', 'SUBOPTIMAL_LENGTH', `Tytuł ma tylko ${length} znaków — pod Allegro Ads i Trafność celuj w 58–74 znaki.`, { len: length, hint: 'celuj w 58-74 znaki' });
    }

    if (words.length < 3) {
        pushIssue('error', 'TOO_FEW_WORDS', `Tytuł musi zawierać co najmniej 3 słowa (obecnie: ${words.length}).`, { count: words.length });
    }

    if (TITLE_SPECIAL_CHARS_RX.test(title)) {
        pushIssue('error', 'SPECIAL_CHARS', 'Tytuł zawiera niedozwolone znaki specjalne lub ozdobniki.');
    }
    if (TITLE_CONTACT_OR_LINK_RX.test(title)) {
        pushIssue('error', 'CONTACT_OR_LINK', 'Tytuł zawiera link, adres URL lub dane kontaktowe.');
    }
    if (TITLE_LOGISTICS_RX.test(title)) {
        pushIssue('error', 'LOGISTICS_INFO', 'Tytuł zawiera informacje o dostawie, fakturze lub warunkach sprzedaży (zakazane Zał. nr 2 Allegro).');
    }
    if (TITLE_ERP_TYPO_RX.test(title)) {
        pushIssue('error', 'RAW_ERP_TYPO', 'W tytule wykryto surową literówkę katalogową z ERP (np. "expres", "candegina", urwany skrót "fi").');
    }

    const strictHits = scanStrictStopwords(title) || [];
    const implicitHits = scanAllegroComplianceRisks(title, { sectionType: 'title', brand }) || [];
    const biocidalHits = scan_biocidal_claims_lexical(title) || [];
    const medicalHits = scan_medical_claims_lexical(title) || [];

    const bannedFound = new Set();
    for (const h of [...strictHits, ...implicitHits]) {
        if (h?.word) bannedFound.add(String(h.word).trim());
    }
    for (const h of [...biocidalHits, ...medicalHits]) {
        if (h?.word) bannedFound.add(String(h.word).trim());
    }
    const extraMatch = title.match(TITLE_EXTRA_BANNED_RX);
    if (extraMatch?.[0]) bannedFound.add(extraMatch[0].trim());
    for (const b of (bannedExtra || [])) {
        if (b && title.toLowerCase().includes(String(b).toLowerCase())) {
            bannedFound.add(String(b));
        }
    }

    if (bannedFound.size > 0) {
        const wordsList = [...bannedFound];
        pushIssue('error', 'BANNED_WORD', `Wykryto zakazane słowa reklamowe, biobójcze lub medyczne: ${wordsList.join(', ')}.`, { words: wordsList });
    }

    const capsWords = words.filter(w => {
        const letters = w.replace(/[^a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, '');
        const cleanLower = w.replace(/[^a-z0-9]/gi, '').toLowerCase();
        if (letters.length <= 3 || CANONICAL_ACRONYMS.has(cleanLower)) return false;
        return letters === letters.toUpperCase();
    });
    if (capsWords.length > 1) {
        pushIssue('warning', 'CAPS_ABUSE', `Nadużycie wielkich liter (CAPS LOCK): ${capsWords.join(', ')}.`, { words: capsWords });
    }

    const seenStems = new Set();
    const dupStems = new Set();
    for (const w of words) {
        const plain = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        if (!plain || plain.length < 4 || POLISH_CONNECTOR_WORDS.has(plain)) continue;
        const stem = normalizePolishStem(plain);
        if (!stem) continue;
        if (seenStems.has(stem)) dupStems.add(w);
        seenStems.add(stem);
    }
    if (dupStems.size > 0) {
        const dupList = [...dupStems];
        pushIssue('warning', 'KEYWORD_REPEAT', `Powtórzone rdzenie słów kluczowych osłabiają Trafność: ${dupList.join(', ')}.`, { stems: dupList });
    }

    const numericUnits = title.match(/\d+(?:[.,]\d+)?\s*(?:l|ml|w|kw|cm|mm|"|cali|gb|tb|kg|g|mah|szt\.?)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi) || [];
    if (numericUnits.length > 2) {
        pushIssue('warning', 'TOO_MANY_PARAMS', `Zbyt wiele wartości jednostkowych w tytule (${numericUnits.join(', ')}).`, { found: numericUnits });
    }

    if (/\b\d{6,}\b/.test(title)) {
        pushIssue('warning', 'POSSIBLE_SKU', 'Tytuł zawiera długi ciąg cyfr przypominający EAN/SKU — przenieś do parametrów.');
    }

    let score = 100;
    score -= errors.length * 35;
    for (const w of issues.filter(i => i.severity === 'warning')) {
        if (w.code === 'SUBOPTIMAL_LENGTH') {
            score -= length < 40 ? 22 : 12;
        } else {
            score -= 10;
        }
    }
    score = Math.max(0, Math.min(100, score));

    const valid = errors.length === 0;
    const seoOptimal = valid && length >= OPTIMAL_MIN_ALLEGRO_TITLE_LEN && length <= MAX_ALLEGRO_TITLE_LEN && warnings.length === 0;

    return {
        valid,
        seoOptimal,
        score,
        length,
        wordCount: words.length,
        errors,
        warnings,
        issues
    };
}

function stripTrailingDanglingConnectors(text = '') {
    let words = String(text || '').trim().split(/\s+/).filter(Boolean);
    while (words.length > 2) {
        const lastLower = words[words.length - 1].toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        if (POLISH_CONNECTOR_WORDS.has(lastLower) || /^(?:z|w|o|i|do|na|po|od|ze|dla|oraz|bez)$/i.test(lastLower)) {
            words.pop();
        } else {
            break;
        }
    }
    return words.join(' ');
}

/**
 * Deterministycznie kompresuje tytuł do twardego limitu 75 znaków Allegro:
 * 1) usuwa duplikaty i zwroty zakazane,
 * 2) redukuje nadmiarowe zbitki (np. "do łazienki" przy "Bagno", "w sprayu" -> "spray"),
 * 3) w ostateczności skraca na granicy pełnych wyrazów zachowując markę, trzon produktu i pojemność/wagę na końcu.
 */
function compressTitleToAllegroLimit(rawTitle = '', { maxLen = MAX_ALLEGRO_TITLE_LEN, brand = '', capacity = '' } = {}) {
    if (!rawTitle || typeof rawTitle !== 'string') return '';
    let title = deduplicateTitleWords(sanitizeOfferTitle(rawTitle))
        .replace(/\s+-\s+/g, ' ')
        .replace(/[,;|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if ([...title].length <= maxLen) {
        return title;
    }

    // Krok 1: bezstratna redukcja powtórzeń semantycznych
    if (/\bbagno\b/i.test(title) && /\bdo\s+łazien(?:ki|ek)\b/i.test(title)) {
        title = title.replace(/\s*\bdo\s+łazien(?:ki|ek)\b/gi, '').replace(/\s+/g, ' ').trim();
    }
    if ([...title].length <= maxLen) return deduplicateTitleWords(title);

    // Krok 2: skracanie długich fraz przyimkowych z zachowaniem słów kluczowych
    const compactions = [
        [/\bw\s+sprayu\b/gi, 'spray'],
        [/\bdo\s+czyszczenia\b/gi, 'do'],
        [/\bdo\s+mycia\b/gi, 'do'],
        [/\bw\s+płynie\b/gi, 'płyn'],
        [/\bpowierzchni\b/gi, ''],
        [/\bzmywalnych\b/gi, ''],
        [/\bi\s+pielęgnacji\b/gi, ''],
        [/\bdo\s+płukania\s+tkanin\b/gi, 'do płukania'],
        [/\bkoncentrat\s+płynu\b/gi, 'koncentrat']
    ];
    for (const [rx, repl] of compactions) {
        if ([...title].length <= maxLen) break;
        const candidate = deduplicateTitleWords(title.replace(rx, repl).replace(/\s+/g, ' ').trim());
        if (candidate && [...candidate].length < [...title].length) {
            title = stripTrailingDanglingConnectors(candidate);
        }
    }
    if ([...title].length <= maxLen) return title;

    // Krok 3: zachowanie pojemności na końcu i przycinanie drugorzędnych słów ze środka / końca opisu przed pojemnością
    const normCap = capacity ? normalizeCapacityValue(capacity, title) : '';
    const capMatch = title.match(TRAILING_CAPACITY_RX);
    const trailingCap = capMatch ? capMatch[1].trim() : (normCap && !title.toLowerCase().includes(normCap.toLowerCase()) ? normCap : '');
    let bodyWithoutCap = capMatch ? title.slice(0, capMatch.index).trim() : title;

    const brandTokens = new Set(String(brand || '').toLowerCase().split(/\s+/).filter(Boolean));
    let bodyWords = bodyWithoutCap.split(/\s+/).filter(Boolean);

    const joinWithCap = (bWords, capStr) => {
        const cleanBody = stripTrailingDanglingConnectors(bWords.join(' '));
        if (!capStr) return cleanBody;
        return cleanBody ? `${cleanBody} ${capStr}` : capStr;
    };

    // Usuń najpierw miękkie wypełniacze / przymiotniki ogólne ze środka przed obcięciem właściwych słów z końca
    const removableFillers = new Set(['wielofunkcyjny', 'uniwersalny', 'codziennej', 'codziennego', 'domowego', 'skuteczny', 'zapachowy', 'delikatny', 'łagodny', 'skoncentrowany', 'pianka', 'płynu']);
    for (let i = bodyWords.length - 1; i >= 2 && [...joinWithCap(bodyWords, trailingCap)].length > maxLen; i--) {
        const low = bodyWords[i].toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
        if (!brandTokens.has(low) && removableFillers.has(low)) {
            bodyWords.splice(i, 1);
        }
    }

    // Usuwaj słowa z prawej strony bloku opisowego (przed pojemnością), nie ruszając pierwszych 2-3 słów rdzenia
    while (bodyWords.length > 3 && [...joinWithCap(bodyWords, trailingCap)].length > maxLen) {
        let removed = false;
        for (let i = bodyWords.length - 1; i >= 2; i--) {
            const low = bodyWords[i].toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
            if (!brandTokens.has(low)) {
                bodyWords.splice(i, 1);
                removed = true;
                break;
            }
        }
        if (!removed) break;
    }

    let finalTitle = joinWithCap(bodyWords, trailingCap);

    // Krok 4: jeśli nadal minimalnie przekracza limit, usuń spację w pojemności (470 ml -> 470ml), a następnie utnij na granicy wyrazu
    if ([...finalTitle].length > maxLen && trailingCap) {
        const compactCap = trailingCap.replace(/\s+/g, '');
        const compacted = joinWithCap(bodyWords, compactCap);
        if ([...compacted].length <= maxLen) {
            finalTitle = compacted;
        }
    }

    while (bodyWords.length > 1 && [...finalTitle].length > maxLen) {
        bodyWords.pop();
        finalTitle = joinWithCap(bodyWords, trailingCap);
    }

    if ([...finalTitle].length > maxLen) {
        const wordsSafe = finalTitle.split(/\s+/);
        let acc = '';
        for (const w of wordsSafe) {
            const next = acc ? `${acc} ${w}` : w;
            if ([...next].length > maxLen) break;
            acc = next;
        }
        finalTitle = acc || [...finalTitle].slice(0, maxLen).join('').trim();
    }

    return stripTrailingDanglingConnectors(finalTitle);
}

/**
 * Składa deterministyczny tytuł Allegro SEO/Ads (cel 58–74 znaki, twardy limit 75) wyłącznie z faktów produktu i zweryfikowanych fraz.
 */
function buildDeterministicAllegroTitle({
    canonicalName = '',
    rawName = '',
    allegroCatalogName = '',
    brand = '',
    capacity = '',
    scent = '',
    category = '',
    visionFeatures = {},
    features = {},
    keywordHints = [],
    maxLen = MAX_ALLEGRO_TITLE_LEN
} = {}) {
    const mergedFeatures = { ...(features || {}), ...(visionFeatures || {}) };
    const resolvedCap = normalizeCapacityValue(
        capacity || mergedFeatures['Pojemność / Waga'] || mergedFeatures['Pojemność'] || '',
        canonicalName || rawName || allegroCatalogName || '',
        visionFeatures
    );

    const baseRaw = sanitizeOfferTitle(canonicalName || allegroCatalogName || rawName || '');
    let base = deduplicateTitleWords(baseRaw);

    if (brand && base && !base.toLowerCase().includes(String(brand).toLowerCase().trim())) {
        base = `${String(brand).trim()} ${base}`.trim();
    }

    // Wyciągnij pojemność na koniec, jeśli jest w środku lub jej brakuje
    let workingCap = '';
    const capInBase = base.match(/\b(\d+(?:[.,]\d+)?\s*(?:ml|l|kg|g|szt\.?|kaps\.?))\b/i);
    if (capInBase) {
        workingCap = capInBase[1].toLowerCase().replace(/\s+/g, ' ').trim();
        base = base.replace(capInBase[0], '').replace(/\s+/g, ' ').trim();
    } else if (resolvedCap) {
        workingCap = resolvedCap.toLowerCase().trim();
    }

    const withCap = (bodyStr) => {
        const cleanBody = String(bodyStr || '').replace(/\s+/g, ' ').trim();
        if (!workingCap) return cleanBody;
        return cleanBody ? `${cleanBody} ${workingCap}` : workingCap;
    };

    let candidate = withCap(base);
    if ([...candidate].length > maxLen) {
        return compressTitleToAllegroLimit(candidate, { maxLen, brand, capacity: workingCap });
    }

    // Wzbogacanie krótkich tytułów (<55 zn.) wyłącznie o zweryfikowane cechy produktu i czyste frazy zakupowe
    if ([...candidate].length < OPTIMAL_MIN_ALLEGRO_TITLE_LEN) {
        const enrichments = [];

        const dispenserRaw = String(mergedFeatures['Dozownik'] || mergedFeatures['Opakowanie produktu'] || mergedFeatures['Opakowanie (Etykieta)'] || '').toLowerCase();
        if (/pompk/i.test(dispenserRaw)) enrichments.push('z pompką');
        else if (/spray|atomizer|spryskiwacz/i.test(dispenserRaw)) enrichments.push('w sprayu');
        else if (/worek|doypack|zapas/i.test(dispenserRaw)) enrichments.push('zapas');

        if (isNoRinseFormula({ productName: candidate, visionFeatures, features })) {
            enrichments.push('bez spłukiwania');
        }

        const rawScent = String(scent || mergedFeatures['Zapach'] || mergedFeatures['Nuta zapachowa'] || '').trim();
        if (rawScent && !/^(?:brak|neutralny|bezzapachowy|classic|classico|nieokreślony|null|undefined)$/i.test(rawScent)) {
            enrichments.push(sanitizeOfferTitle(rawScent).toLowerCase());
        }

        const purposeRaw = String(mergedFeatures['Przeznaczenie (Front)'] || mergedFeatures['Przeznaczenie (Etykieta)'] || mergedFeatures['Przeznaczenie'] || mergedFeatures['Zastosowanie'] || '').trim();
        if (purposeRaw) {
            const safePurpose = sanitizeLabelHighlights(purposeRaw, { productName: candidate }).text || sanitizeOfferTitle(purposeRaw);
            if (safePurpose && safePurpose.length <= 36) {
                enrichments.push(safePurpose.toLowerCase());
            }
        }

        const washesRaw = String(mergedFeatures['Liczba prań'] || mergedFeatures['Wydajność'] || '').trim();
        if (washesRaw && /^\d{1,3}\s*(?:prań|płukań|użyć|cykli)$/i.test(washesRaw)) {
            enrichments.push(washesRaw.toLowerCase());
        }

        for (const hint of (keywordHints || [])) {
            const cleanHint = sanitizeOfferTitle(String(hint || '').trim()).toLowerCase();
            if (cleanHint && cleanHint.length >= 4 && cleanHint.length <= 32) {
                enrichments.push(cleanHint);
            }
        }

        let currentBody = base;
        for (const extraPhrase of enrichments) {
            if ([...withCap(currentBody)].length >= OPTIMAL_TARGET_MIN_LEN) break;
            const extraTokens = String(extraPhrase || '')
                .replace(/[^\p{L}\p{N}\s]/gu, ' ')
                .split(/\s+/)
                .filter(Boolean);
            if (extraTokens.length === 0) continue;

            const currentStems = new Set(
                currentBody.split(/\s+/).map(w => normalizePolishStem(w)).filter(Boolean)
            );
            const currentLower = currentBody.toLowerCase();
            const novelTokens = extraTokens.filter(tok => {
                const low = tok.toLowerCase();
                if (POLISH_CONNECTOR_WORDS.has(low) || low.length <= 2) return true;
                if (currentLower.includes(low)) return false;
                const st = normalizePolishStem(low);
                if (st && currentStems.has(st)) return false;
                return true;
            });
            const nonConnectorNovel = novelTokens.filter(t => !POLISH_CONNECTOR_WORDS.has(t.toLowerCase()) && t.length > 2);
            if (nonConnectorNovel.length === 0) continue;

            const addition = stripTrailingDanglingConnectors(novelTokens.join(' '));
            if (!addition) continue;
            const nextBody = `${currentBody} ${addition}`.replace(/\s+/g, ' ').trim();
            const nextFull = deduplicateTitleWords(withCap(nextBody));
            if ([...nextFull].length <= OPTIMAL_TARGET_MAX_LEN) {
                const check = validateAllegroOfferTitle(nextFull, { brand });
                if (check.valid) {
                    currentBody = nextFull.replace(TRAILING_CAPACITY_RX, '').trim();
                    candidate = nextFull;
                }
            }
        }
    }

    return compressTitleToAllegroLimit(candidate, { maxLen, brand, capacity: workingCap });
}

/**
 * Ocenia tytuł pod Allegro Ads (automatyczne dopasowanie do zapytań) i algorytm Trafności (0–100 pkt).
 */
function scoreTitleForAllegroAds(title = '', { targetCategoryId = null, matchingCategories = [], keywordHints = [], brand = '' } = {}) {
    const val = validateAllegroOfferTitle(title, { brand });
    let score = val.score;

    const titleStems = new Set(
        String(title || '').split(/\s+/).map(normalizePolishStem).filter(Boolean)
    );
    const matchedKeywords = [];
    for (const hint of (keywordHints || [])) {
        const hintStems = String(hint || '').split(/\s+/).map(normalizePolishStem).filter(Boolean);
        if (hintStems.length > 0 && hintStems.some(st => titleStems.has(st))) {
            matchedKeywords.push(hint);
        }
    }

    let categoryMatched = null;
    if (targetCategoryId && Array.isArray(matchingCategories) && matchingCategories.length > 0) {
        categoryMatched = matchingCategories.slice(0, 3).some(c => String(c.id) === String(targetCategoryId));
        if (!categoryMatched) {
            score = Math.max(0, score - 10);
        }
    }

    return {
        ...val,
        score,
        targetRange: `${OPTIMAL_TARGET_MIN_LEN}-${OPTIMAL_TARGET_MAX_LEN}`,
        matchedKeywords,
        categoryMatched
    };
}

module.exports = {
    MAX_ALLEGRO_TITLE_LEN,
    MIN_ALLEGRO_TITLE_LEN,
    OPTIMAL_MIN_ALLEGRO_TITLE_LEN,
    OPTIMAL_TARGET_MIN_LEN,
    OPTIMAL_TARGET_MAX_LEN,
    normalizePolishStem,
    deduplicateTitleWords,
    validateAllegroOfferTitle,
    compressTitleToAllegroLimit,
    buildDeterministicAllegroTitle,
    scoreTitleForAllegroAds
};
