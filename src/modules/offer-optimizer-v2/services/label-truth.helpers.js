/**
 * Czyste helpery detekcji prawdy etykietowej (bez żadnych zależności zewnętrznych),
 * współdzielone przez deterministic-pipeline.engine.js, validators/index.js oraz google-suggest-faq.service.js
 * w celu całkowitego wyeliminowania cykli require().
 */

const CANONICAL_ACRONYMS = new Set(['wc', 'uv', 'spf', 'ph', 'led', 'xxl', 'xl', 'bio', 'eco', '3d']);
const POLISH_CONNECTOR_WORDS = new Set(['w', 'z', 'i', 'do', 'na', 'po', 'za', 'od', 'ze', 'we', 'di', 'e', 'o', 'u']);

function isNoRinseFormula({ productName = '', visionFeatures = {}, features = {}, usage = '' } = {}) {
    if (visionFeatures?.['Bez spłukiwania (Etykieta Front)'] === 'Tak' || features?.['Bez spłukiwania (Etykieta Front)'] === 'Tak') {
        return true;
    }
    const sources = [
        productName,
        visionFeatures?.['Wyróżniki (Etykieta Front)'],
        visionFeatures?.['Linia produktowa (Front)'],
        features?.['Wyróżniki (Etykieta Front)'],
        features?.['Wyróżniki / Certyfikaty (Etykieta)'],
        features?.['Cechy dodatkowe'],
        features?.['Wyróżniki']
    ].filter(Boolean).join(' ');
    if (/(?:\bbez\s+(?:konieczności\s+)?spłukiwania\b|\bsenza\s+risciacquo\b|\bno\s+rinse\b|\bsans\s+rin[cç]age\b|\bohne\s+aussp[uü]len\b|\bnie\s+wymaga\s+spłukiwania\b)/i.test(sources)) {
        return true;
    }
    if (usage && /(?:\bbez\s+(?:konieczności\s+)?spłukiwania\b|\bnie\s+wymaga\s+spłukiwania\b|\bnie\s+spłukiwać\b|\bsenza\s+risciacquo\b)/i.test(String(usage))) {
        return true;
    }
    return false;
}

function hasDeclaredOdorNeutralizer({ productName = '', inci = '', detergentComposition = '', visionFeatures = {}, features = {} } = {}) {
    const inciSource = `${inci || ''} ${detergentComposition || ''}`;
    if (/(?:cyclodextrin|cyklodekstryn|zinc\s+ricinoleate|rycynooleinian\s+cynku|activated\s+charcoal|charcoal\s+powder|węgiel\s+aktywny|sodium\s+bicarbonate|wodorowęglan\s+sodu|triethyl\s+citrate)/i.test(inciSource)) {
        return true;
    }
    const claimsSource = [
        productName,
        visionFeatures?.['Wyróżniki (Etykieta Front)'],
        visionFeatures?.['Przeznaczenie (Front)'],
        features?.['Wyróżniki (Etykieta Front)'],
        features?.['Wyróżniki / Certyfikaty (Etykieta)'],
        features?.['Przeznaczenie']
    ].filter(Boolean).join(' ');
    return /(?:neutralizator\s+zapach|pochłaniacz\s+zapach|neutralizuje\s+nieprzyjemne\s+zapachy|neutralizza\s+gli\s+odori|anti[\s-]?odori?|zwalcza\s+nieprzyjemne\s+zapachy|pomaga\s+zwalczać\s+nieprzyjemne\s+zapachy)/i.test(claimsSource);
}

function detectRawCatalogNameLeak(htmlStr = '', rawProductName = '', canonicalProductName = '') {
    if (!htmlStr || !rawProductName || !canonicalProductName) return null;
    const rawTrim = String(rawProductName).trim();
    const canonTrim = String(canonicalProductName).trim();
    if (!rawTrim || !canonTrim || rawTrim.toLowerCase() === canonTrim.toLowerCase()) return null;

    const plainText = String(htmlStr)
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
    const plainLower = plainText.toLowerCase();

    if (rawTrim.length >= 10 && plainLower.includes(rawTrim.toLowerCase())) {
        return rawTrim;
    }

    if (/\bexpres\b/i.test(rawTrim) && /\bexpres\b/i.test(plainText)) {
        return 'expres';
    }

    const canonTokens = canonTrim.toLowerCase().replace(/[^a-ząćęłńóśźż0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const rawTokens = rawTrim.toLowerCase().replace(/[^a-ząćęłńóśźż0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    for (let i = 0; i < rawTokens.length; i++) {
        const tok = rawTokens[i];
        const nextTok = rawTokens[i + 1] || '';
        const followedByNumber = /^\d+$/.test(nextTok);
        if (tok.length >= 2 && tok.length <= 3 && !POLISH_CONNECTOR_WORDS.has(tok) && !CANONICAL_ACRONYMS.has(tok) && followedByNumber) {
            const isPrefixOfOfficial = canonTokens.some(ct => ct.length > tok.length && ct.startsWith(tok));
            if (isPrefixOfOfficial && new RegExp(`\\b${tok}\\s+${nextTok}\\b`, 'i').test(plainText)) {
                return `${tok} ${nextTok}`;
            }
        }
    }
    return null;
}

const FRAGRANCE_ALLERGEN_MOLECULES = [
    'alpha-isomethyl ionone', 'hexyl cinnamal', 'citronellol', 'coumarin',
    'geraniol', 'limonene', 'linalool', 'citral', 'eugenol', 'isoeugenol',
    'benzyl salicylate', 'benzyl benzoate', 'benzyl alcohol', 'benzyl cinnamate',
    'hydroxycitronellal', 'amyl cinnamal', 'amylcinnamyl alcohol', 'farnesol',
    'cinnamal', 'cinnamyl alcohol', 'anise alcohol', 'evernia prunastri',
    'evernia furfuracea', 'tetramethyl acetyloctahydronaphthalenes', 'acetyl cedrene'
];

const FILLER_OR_PRESERVATIVE_HEADINGS_REGEX = /^(?:aqua|water|woda|baza wodna|sodium chloride|chlorek sodu|benzisothiazolinone|methylisothiazolinone|methylchloroisothiazolinone|bronopol|phenoxyethanol|dmdm hydantoin|stabilizator mikrobiologiczny|układ konserwujący|konserwant(?:y)?(?:\s+formulacji)?|składniki kompozycji zapachowej|nuty aromatyczne|barwnik(?:i)?|colorants?|ci\s*\d{4,5})(?:\s*\([^)]*\))?\s*:?$/i;

const MARKETING_FILLER_ITEM_REGEX = /^(?:aqua|water|woda|sodium chloride|chlorek sodu|benzisothiazolinone|methylisothiazolinone|methylchloroisothiazolinone|bronopol|phenoxyethanol|dmdm hydantoin|sodium benzoate|potassium sorbate|colorants?|barwniki|preservatives|środki konserwujące|konserwanty|ci\s*\d{4,5})$/i;

function isPureFillerIngredient(rawIng = '') {
    const clean = String(rawIng || '')
        .replace(/^(?:środki\s+konserwujące|konserwant(?:y)?|preservative(?:s)?|zawiera|contains|contiene)\s*[:(]?\s*/i, '')
        .replace(/[()[\]]+/g, '')
        .trim()
        .toLowerCase();
    if (!clean) return true;
    if (MARKETING_FILLER_ITEM_REGEX.test(clean)) return true;
    // Kompozycja zapachowa (Parfum) sama w sobie jest wartością marketingową (nawet jeśli na etykiecie ma w nawiasie listę alergenów)
    if (/\b(?:parfum|perfumes|fragrance|aroma|kompozycj[aęi]\s+zapachow)/i.test(clean)) return false;
    return FRAGRANCE_ALLERGEN_MOLECULES.some(m => clean === m || clean.includes(m));
}

function isFabricSoftenerProduct({ productName = '', category = '', line = '', visionFeatures = {}, features = {}, contextStr = '' } = {}) {
    const merged = `${productName} ${category} ${line} ${visionFeatures?.['Przeznaczenie (Front)'] || ''} ${features?.['Rodzaj'] || ''} ${features?.['Typ'] || ''} ${contextStr}`.trim();
    const isSoftener = /(?:płyn[a-ząćęłńóśźż]*\s+do\s+płukania|plyn[a-z]*\s+do\s+plukania|koncentrat[a-ząćęłńóśźż]*\s+do\s+płukania|ammorbidente|zmiękczacz[a-ząćęłńóśźż]*\s+do\s+tkanin|płukania\s+tkanin)/i.test(merged);
    const isWashDetergent = /(?:płyn[a-ząćęłńóśźż]*\s+do\s+prania|żel[a-ząćęłńóśźż]*\s+do\s+prania|prosz[a-ząćęłńóśźż]*\s+do\s+prania|kapsułk[a-ząćęłńóśźż]*\s+do\s+prania|2w1|2\s*in\s*1|detersivo)/i.test(`${productName} ${category}`);
    return Boolean(isSoftener && !isWashDetergent);
}

const GENERIC_PRODUCT_CATEGORY_LINE_REGEX = /^(?:detersivo(?:\s+liquido|\s+lavatrice)?|ammorbidente(?:\s+concentrato)?|lavatrice|bucato|detergente|płyn(?:\s+do\s+(?:prania|płukania|naczyń|mycia|szyb|podłóg))?|żel(?:\s+do\s+(?:prania|wc|łazienek|mycia))?|koncentrat(?:\s+do\s+płukania)?|proszek(?:\s+do\s+prania)?|środek\s+czyszczący|srodek\s+czyszczacy)$/i;

function isGenericCategoryWordNotLine(val = '') {
    const clean = String(val || '').replace(/\s+/g, ' ').trim();
    if (!clean) return false;
    return GENERIC_PRODUCT_CATEGORY_LINE_REGEX.test(clean);
}

function normalizeCanonicalFormName(raw = '', { allowPassthrough = false } = {}) {
    const low = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!low) return '';
    if (/^(?:płyn\s+żel|żel\s+płyn|płyn\/żel|żel\/płyn|płyn\s*-\s*żel)$/i.test(low)) return 'HYBRID_AMBIGUOUS';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:spray|w\s+sprayu|atomizer|aerozol)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'spray';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:żel|w\s+żelu|zel|gel|in\s+gel)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'żel';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:piank[aęi]|w\s+piance)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'pianka';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:proszek|w\s+proszku)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'proszek';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])kapsułk[a-ząćęłńóśźż]*(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'kapsułki';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])tabletk[a-ząćęłńóśźż]*(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'tabletki';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])mleczk[oau](?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'mleczko';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:krem|w\s+kremie)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'krem';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:kostk[aęi]|w\s+kostce)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'kostka';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])chusteczk[a-ząćęłńóśźż]*(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'chusteczki';
    if (/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:płyn|w\s+płynie|mydło\s+w\s+płynie)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(low)) return 'płyn';
    return allowPassthrough && low.length <= 25 ? low : '';
}

/**
 * Wyznacza kanoniczną postać fizyczną wyrobu z poszanowaniem hierarchii prawdy etykietowej (Label-Truth SSOT).
 * Jeśli etykieta (Vision `Postać (Etykieta)` lub oficjalna nazwa `Detersivo`/`Ammorbidente`/`Sapone Liquido` bez słowa `Gel`)
 * jednoznacznie wskazuje `płyn`, koryguje błędne aukcyjne `'żel'` lub `'Płyn Żel'` bez nadpisywania ważnej edycji operatora w innych kategoriach.
 */
function resolveLabelPhysicalForm({ visionFeatures = {}, features = {}, officialLabelName = '', rawProductName = '' } = {}) {
    const explicitLabelPostacRaw = [
        visionFeatures?.['Postać (Etykieta)'],
        features?.['Postać (Etykieta)'],
        visionFeatures?.['Postać (Front)'],
        features?.['Postać (Front)']
    ].find(v => v !== undefined && v !== null && String(v).trim() !== '');

    const officialFrontAndBack = [
        officialLabelName,
        visionFeatures?.['Nazwa produktu (Etykieta Front)'],
        features?.['Nazwa produktu (Etykieta Front)'],
        visionFeatures?.['Nazwa produktu (Kontretykieta)'],
        features?.['Nazwa produktu (Kontretykieta)'],
        visionFeatures?.['Linia produktowa (Front)'],
        features?.['Linia produktowa (Front)'],
        visionFeatures?.['Wariant (Etykieta Front)'],
        features?.['Wariant (Etykieta Front)']
    ].filter(Boolean).join(' ').trim();

    const hasGelWordOnLabel = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:gel|żel|zel|in\s+gel)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(`${officialFrontAndBack} ${explicitLabelPostacRaw || ''}`);
    const hasExplicitLiquidLabelCategory = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:detersivo(?:\s+liquido)?|ammorbidente(?:\s+concentrato)?|sapone\s+liquido|liquido)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(officialFrontAndBack);

    if (hasExplicitLiquidLabelCategory && !hasGelWordOnLabel) {
        return {
            canonicalForm: 'płyn',
            isVerifiedFromLabel: true,
            source: 'official_label_name'
        };
    }

    if (explicitLabelPostacRaw) {
        const normExplicit = normalizeCanonicalFormName(explicitLabelPostacRaw, { allowPassthrough: true });
        if (normExplicit && normExplicit !== 'HYBRID_AMBIGUOUS') {
            return {
                canonicalForm: normExplicit,
                isVerifiedFromLabel: true,
                source: 'label_postac_field'
            };
        }
    }

    if (hasGelWordOnLabel && /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:gel|żel|in\s+gel)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(officialFrontAndBack)) {
        return {
            canonicalForm: 'żel',
            isVerifiedFromLabel: true,
            source: 'official_label_name'
        };
    }

    const visionPostacRaw = visionFeatures?.['Postać'];
    const featPostacRaw = features?.['Postać'] || features?.['Postac'] || features?.['Forma'];
    const rawFallback = [visionPostacRaw, featPostacRaw].find(v => v !== undefined && v !== null && String(v).trim() !== '');
    if (rawFallback) {
        const normFb = normalizeCanonicalFormName(rawFallback, { allowPassthrough: true });
        if (normFb === 'HYBRID_AMBIGUOUS') {
            return {
                canonicalForm: /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:gel|żel)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(`${officialFrontAndBack}`) ? 'żel' : 'płyn',
                isVerifiedFromLabel: false,
                source: 'hybrid_disambiguated'
            };
        }
        return {
            canonicalForm: normFb,
            isVerifiedFromLabel: false,
            source: visionPostacRaw ? 'vision_postac' : 'features_postac'
        };
    }

    const rawNameNorm = normalizeCanonicalFormName(rawProductName, { allowPassthrough: false });
    if (rawNameNorm === 'HYBRID_AMBIGUOUS') {
        return { canonicalForm: 'płyn', isVerifiedFromLabel: false, source: 'raw_name_hybrid' };
    }
    return {
        canonicalForm: rawNameNorm || '',
        isVerifiedFromLabel: false,
        source: rawNameNorm ? 'raw_name' : 'none'
    };
}

/**
 * Konwertuje błędne określenia prania (np. dosłowne tłumaczenia ikonek `In lavatrice` / `A mano`)
 * na poprawną terminologię płukania dla płynów/koncentratów do płukania tkanin.
 */
function normalizeFabricSoftenerTerminology(text = '') {
    if (!text || typeof text !== 'string') return text;
    return String(text)
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])płakanie(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, (m) => (/^[A-Z]/.test(m) ? 'Płukanie' : 'płukanie'))
        .replace(/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])płukannie(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, (m) => (/^[A-Z]/.test(m) ? 'Płukanie' : 'płukanie'))
        .replace(/(?<![a-ząćęłńóśźż])do\s+prania\s+i\s+płukania(?![a-ząćęłńóśźż])/gi, 'do płukania i zmiękczania')
        .replace(/(?<![a-ząćęłńóśźż])w\s+praniu\s+w\s+pralce(?![a-ząćęłńóśźż])/gi, (m) => (/^[A-Z]/.test(m) ? 'Podczas płukania w pralce' : 'podczas płukania w pralce'))
        .replace(/(?<![a-ząćęłńóśźż])w\s+praniu\s+ręcznym(?![a-ząćęłńóśźż])/gi, (m) => (/^[A-Z]/.test(m) ? 'W płukaniu ręcznym' : 'w płukaniu ręcznym'))
        .replace(/(?<![a-ząćęłńóśźż])prać\s+w\s+pralce(?![a-ząćęłńóśźż])/gi, (m) => (/^[A-Z]/.test(m) ? 'Płukać w pralce' : 'płukać w pralce'))
        .replace(/(?<![a-ząćęłńóśźż])pranie\s+w\s+pralce\s+i\s+ręczne(?![a-ząćęłńóśźż])/gi, (m) => (/^[A-Z]/.test(m) ? 'Płukanie w pralce i płukanie ręczne' : 'płukanie w pralce i płukanie ręczne'))
        .replace(/(?<![a-ząćęłńóśźż])pranie\s+w\s+pralce(?![a-ząćęłńóśźż])/gi, (m) => (/^[A-Z]/.test(m) ? 'Płukanie w pralce' : 'płukanie w pralce'))
        .replace(/(?<![a-ząćęłńóśźż])praniu\s+w\s+pralce(?![a-ząćęłńóśźż])/gi, 'płukaniu w pralce')
        .replace(/(?<![a-ząćęłńóśźż])prania\s+w\s+pralce(?![a-ząćęłńóśźż])/gi, 'płukania w pralce')
        .replace(/(?<![a-ząćęłńóśźż])pranie\s+ręczne(?![a-ząćęłńóśźż])/gi, (m) => (/^[A-Z]/.test(m) ? 'Płukanie ręczne' : 'płukanie ręczne'))
        .replace(/(?<![a-ząćęłńóśźż])praniu\s+ręcznym(?![a-ząćęłńóśźż])/gi, 'płukaniu ręcznym')
        .replace(/(?<![a-ząćęłńóśźż])prania\s+ręcznego(?![a-ząćęłńóśźż])/gi, 'płukania ręcznego')
        .replace(/(?<![a-ząćęłńóśźż])prać\s+ręcznie(?![a-ząćęłńóśźż])/gi, (m) => (/^[A-Z]/.test(m) ? 'Płukać ręcznie' : 'płukać ręcznie'))
        .replace(/(?<![a-ząćęłńóśźż])(płukani[aeu]\s+w\s+pralce(?:\s+oraz|\s+i)?)\s+ręczne(?![a-ząćęłńóśźż])/gi, '$1 płukanie ręczne');
}

function parseTotalVolumeMl(capacityText = '') {
    const raw = String(capacityText || '').trim();
    if (!raw) return null;
    if (/\b(?:szt\.?|kaps\.?|kapsuł|tablet|tabs|g\b|kg\b|gram)/i.test(raw) && !/\b(?:ml|l|litr)\b/i.test(raw)) {
        return null;
    }
    const unitMatch = raw.match(/(\d+(?:[.,]\d+)?)\s*(ml|cl|l|litr[a-ząćęłńóśźż]*)\b/i);
    if (unitMatch) {
        const val = parseFloat(unitMatch[1].replace(',', '.'));
        if (!Number.isFinite(val) || val <= 0) return null;
        const unit = unitMatch[2].toLowerCase();
        if (unit.startsWith('ml')) return val;
        if (unit === 'cl') return val * 10;
        return val * 1000;
    }
    if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
        const num = parseFloat(raw.replace(',', '.'));
        if (!Number.isFinite(num) || num <= 0) return null;
        return num <= 20 ? num * 1000 : num;
    }
    return null;
}

function parseDeclaredCycleCount(yieldText = '') {
    const raw = String(yieldText || '').trim();
    if (!raw) return null;
    const match = raw.match(/(?<![0-9a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(\d{1,4})\s*(?:pra[nń]|pranie|płuka[nń]|płukanie|cykl(?:i|e)?(?:\s+(?:płukania|prania))?|lavaggi|washes|doz|uży[cć])?(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i);
    if (!match) return null;
    const n = parseInt(match[1], 10);
    return Number.isFinite(n) && n >= 2 && n <= 1000 ? n : null;
}

/**
 * Waliduje spójność matematyczną instrukcji dozowania w ml względem pojemności opakowania i deklarowanej liczby prań/płukań.
 * Wykrywa halucynacje tabel dozowania (np. 68 ml jako standard dla wsadu 4-5 kg przy butelce 2250 ml / 50 prań, gdzie 2250/50 = 45 ml).
 */
function validateDosageYieldMath({ capacityText = '', yieldText = '', usageText = '' } = {}) {
    const totalVolumeMl = parseTotalVolumeMl(capacityText);
    const declaredCycles = parseDeclaredCycleCount(yieldText);
    const plain = String(usageText || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();

    if (!totalVolumeMl || !declaredCycles || !plain) {
        return { valid: true };
    }

    const expectedDoseMl = totalVolumeMl / declaredCycles;
    if (!Number.isFinite(expectedDoseMl) || expectedDoseMl < 8 || expectedDoseMl > 250) {
        return { valid: true };
    }

    // Usuń wzmianki o pojemności nakrętki, dopiskach +10/+15 ml, dawkowaniu ręcznym w X litrach wody oraz samej pojemności opakowania
    const sanitizedForMachine = plain
        .replace(/(?:pojemność\s+nakrętki(?:\s+wynosi)?|1\s*nakrętka|pełna\s+nakrętka|nakrętka)\s*(?:=|wynosi|:)?\s*\d+(?:[.,]\d+)?\s*ml/gi, ' ')
        .replace(/(?:\+|dodaj(?:\s+kolejne|\s+dodatkowo)?|dodatkow[ey]\w*)\s*\d+(?:[.,]\d+)?\s*ml/gi, ' ')
        .replace(/(?:prani[ea]\s+ręczn[ey]|płukani[ea]\s+ręczn[ey]|rozpuść|rozprowadź)[^.;\n]*?\d+(?:[.,]\d+)?\s*ml\s*(?:[^.;\n]*?\bw\s*\d+\s*(?:l|litr)|\bna\s*\d+\s*l)/gi, ' ');

    const machineDoseMatches = [];
    const mlRx = /\b(\d+(?:[.,]\d+)?)\s*ml\b/gi;
    let m;
    while ((m = mlRx.exec(sanitizedForMachine)) !== null) {
        const val = parseFloat(m[1].replace(',', '.'));
        if (!Number.isFinite(val) || val < 10 || val > 250) continue;
        if (Math.abs(val - totalVolumeMl) < 1) continue;
        // Pomijamy wartości występujące bezpośrednio przed "w X litrach wody" / "na X l wody"
        const afterSnippet = sanitizedForMachine.slice(m.index, m.index + 65);
        if (/\b(?:w|na)\s+\d+(?:[.,]\d+)?\s*(?:l|litr)/i.test(afterSnippet)) continue;
        machineDoseMatches.push(val);
    }

    if (machineDoseMatches.length === 0) {
        return { valid: true };
    }

    // Sprawdź czy dla wsadu 4-5 kg podano wyraźnie dawkę dla wody średniej
    let actualMediumDoseMl = null;
    const load45Block = sanitizedForMachine.match(/(?:wsad(?:u|zie)?|pralki?)[^.]{0,25}\b4\s*[–\/-]\s*5\s*kg\b([^.;]{0,140})/i);
    if (load45Block && load45Block[1]) {
        const medMatch = load45Block[1].match(/(?:woda\s+średnia|średniej(?:\s+twardości)?|śr\.)\s*(?::|=|to|wynosi)?\s*(\d+(?:[.,]\d+)?)\s*ml/i);
        if (medMatch) {
            actualMediumDoseMl = parseFloat(medMatch[1].replace(',', '.'));
        }
    }

    const hasDoseNearExpected = machineDoseMatches.some(d => Math.abs(d - expectedDoseMl) <= Math.max(4, expectedDoseMl * 0.15));
    const minMachineDose = Math.min(...machineDoseMatches);
    const maxImpliedCyclesFromMin = totalVolumeMl / minMachineDose;

    if (actualMediumDoseMl !== null && Math.abs(actualMediumDoseMl - expectedDoseMl) > Math.max(5, expectedDoseMl * 0.2)) {
        return {
            valid: false,
            expectedDoseMl: Math.round(expectedDoseMl * 10) / 10,
            actualMediumDoseMl,
            impliedCycles: Math.round(totalVolumeMl / actualMediumDoseMl),
            declaredCycles,
            totalVolumeMl,
            reason: `Dla pojemności ${totalVolumeMl} ml i wydajności ${declaredCycles} prań/płukań dawka standardowa (4-5 kg, woda średnia) powinna wynosić ok. ${Math.round(expectedDoseMl * 10) / 10} ml, a podano ${actualMediumDoseMl} ml (co starczyłoby na ok. ${Math.round(totalVolumeMl / actualMediumDoseMl)} cykli).`
        };
    }

    if (machineDoseMatches.length >= 2 && !hasDoseNearExpected && maxImpliedCyclesFromMin < declaredCycles * 0.85) {
        return {
            valid: false,
            expectedDoseMl: Math.round(expectedDoseMl * 10) / 10,
            actualMediumDoseMl: minMachineDose,
            impliedCycles: Math.round(maxImpliedCyclesFromMin),
            declaredCycles,
            totalVolumeMl,
            reason: `Dla pojemności ${totalVolumeMl} ml i wydajności ${declaredCycles} prań/płukań dawka standardowa wynosi ok. ${Math.round(expectedDoseMl * 10) / 10} ml, natomiast najmniejsza dawka do pralki w instrukcji (${minMachineDose} ml) daje maksymalnie ok. ${Math.round(maxImpliedCyclesFromMin)} cykli.`
        };
    }

    return {
        valid: true,
        expectedDoseMl: Math.round(expectedDoseMl * 10) / 10
    };
}

function resolveSection3HeadingAndLead({ isChemical = false, isFabricSoftener = false, presetIdx = 0 } = {}) {
    const idx = Number(presetIdx || 0);
    if (isFabricSoftener) {
        const softenerHeadings = [
            '<h2>⚙️ Jak działa formuła zmiękczająca tkaniny</h2>',
            '<h2>⚙️ Składniki pielęgnujące włókna i profil zapachu</h2>',
            '<h2>⚙️ Formuła zmiękczająca oraz komfort prasowania</h2>',
            '<h2>⚙️ Co odpowiada za miękkość i świeżość tkanin</h2>',
            '<h2>⚙️ Skład funkcyjny koncentratu do płukania</h2>',
            '<h2>⚙️ Działanie formuły na włókna tekstylne</h2>'
        ];
        const softenerLeads = [
            '<p>Skoncentrowana formuła do płukania dba o <b>miękkość włókien, łatwiejsze prasowanie oraz przyjemny zapach ubrań</b> po każdym cyklu:</p>',
            '<p>Poniższe zestawienie wyjaśnia, które składniki aktywne odpowiadają za <b>gładkość tekstyliów i komfort ich codziennego noszenia</b>:</p>',
            '<p>Receptura koncentratu została skomponowana z myślą o <b>pielęgnacji włókien i trwałym odświeżeniu wypranej odzieży</b>:</p>',
            '<p>Kluczowe składniki formuły pracują podczas płukania, zapewniając <b>sprężystość i delikatność tkanin</b> po wysuszeniu:</p>'
        ];
        return {
            heading: idx > 0 ? softenerHeadings[idx % softenerHeadings.length] : softenerHeadings[0],
            introP: idx > 0 ? softenerLeads[idx % softenerLeads.length] : softenerLeads[0]
        };
    }

    const chemHeadings = [
        '<h2>⚙️ Składniki aktywne i działanie formuły</h2>',
        '<h2>⚙️ Budowa formuły i działanie poszczególnych składników</h2>',
        '<h2>⚙️ Związki aktywne odpowiedzialne za skuteczność czyszczenia</h2>',
        '<h2>⚙️ Jak składniki aktywne usuwają zabrudzenia i osady</h2>',
        '<h2>⚙️ Skład funkcyjny i profil działania receptury</h2>',
        '<h2>⚙️ Rola kluczowych komponentów w działaniu środka</h2>'
    ];
    const chemLeads = [
        '<p>Formuła łączy <b>składniki aktywne o sprawdzonym działaniu użytkowym</b>, z których każdy odpowiada za konkretny etap czyszczenia:</p>',
        '<p>Poniższe zestawienie wyjaśnia, jaką rolę w działaniu użytkowym pełnią <b>główne związki czynne</b> zawarte w formule preparatu:</p>',
        '<p>Skuteczność myjącą wyrobu buduje <b>połączenie surfaktantów i substancji wspomagających</b>, pracujących wspólnie na powierzchni zastosowania:</p>',
        '<p>Każdy z kluczowych składników receptury spełnia <b>określoną funkcję użytkową</b> podczas usuwania osadów oraz codziennych zanieczyszczeń:</p>'
    ];
    const cosmHeadings = [
        '<h2>⚙️ Składniki aktywne i mechanizm działania formuły</h2>',
        '<h2>⚙️ Kompozycja składników pielęgnacyjnych i ich rola</h2>',
        '<h2>⚙️ Jak działają kluczowe składniki z listy INCI</h2>',
        '<h2>⚙️ Aktywne komponenty formuły i komfort pielęgnacji</h2>',
        '<h2>⚙️ Profil składników myjących i kondycjonujących</h2>',
        '<h2>⚙️ Analiza składników funkcyjnych zawartych w kosmetyku</h2>'
    ];
    const cosmLeads = [
        '<p>Formuła kosmetyku łączy <b>składniki oczyszczające, nawilżające oraz kondycjonujące</b>, które współpracują ze sobą dla zachowania równowagi hydrolipidowej i wysokiego komfortu aplikacji:</p>',
        '<p>Zestawienie wyjaśnia znaczenie <b>najważniejszych substancji ze składu INCI</b> w codziennej pielęgnacji oraz utrzymaniu komfortu skóry:</p>',
        '<p>Działanie produktu opiera się na <b>zrównoważonej bazie myjącej i dodatkach pielęgnacyjnych</b> dobranych z myślą o łagodnym oczyszczaniu:</p>',
        '<p>Wewnątrz receptury wykorzystano <b>składniki odpowiadające zarówno za oczyszczanie, jak i pielęgnacyjne wygładzenie</b> naskórka:</p>'
    ];

    const headingList = isChemical ? chemHeadings : cosmHeadings;
    const leadList = isChemical ? chemLeads : cosmLeads;
    return {
        heading: idx > 0 ? headingList[idx % headingList.length] : headingList[0],
        introP: idx > 0 ? leadList[idx % leadList.length] : leadList[0]
    };
}

module.exports = {
    CANONICAL_ACRONYMS,
    POLISH_CONNECTOR_WORDS,
    isNoRinseFormula,
    hasDeclaredOdorNeutralizer,
    detectRawCatalogNameLeak,
    FRAGRANCE_ALLERGEN_MOLECULES,
    FILLER_OR_PRESERVATIVE_HEADINGS_REGEX,
    isPureFillerIngredient,
    isFabricSoftenerProduct,
    isGenericCategoryWordNotLine,
    resolveLabelPhysicalForm,
    normalizeFabricSoftenerTerminology,
    validateDosageYieldMath,
    resolveSection3HeadingAndLead
};
