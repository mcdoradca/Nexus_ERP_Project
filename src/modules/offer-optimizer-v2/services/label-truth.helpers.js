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

function normalizeScentCompareToken(val = '') {
    return String(val || '')
        .toLowerCase()
        .replace(/ł/g, 'l')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const INVALID_SCENT_NORMALIZED_SET = new Set([
    // Twardość włosia i ogólne parametry artykułów higienicznych
    'soft', 'medium', 'hard', 'ultra soft', 'extra soft',
    'sredni', 'srednia', 'srednie', 'miekki', 'miekka', 'miekkie', 'twardy', 'twarda', 'twarde',
    // Samodzielne substancje chemiczne / czyszczące (nie nuty zapachowe)
    'candeggina', 'con candeggina', 'wybielacz', 'z wybielaczem',
    'bicarbonato', 'con bicarbonato', 'soda', 'soda oczyszczona', 'z soda',
    'aceto', 'con aceto', 'ocet', 'z octem',
    'ammoniaca', 'con ammoniaca', 'amoniak', 'z amoniakiem',
    'chlor',
    // Funkcje produktu, linie kolorystyczne, warianty i puste przymiotniki
    'pulito profondo', 'glebokie czyszczenie', 'dokladne czyszczenie',
    'extra smacchiante', 'smacchiante', 'odplamiacz', 'z odplamiaczem',
    'sgrassatore', 'con sgrassatore', 'odtluszczacz',
    'anticalcare', 'odkamieniacz', 'igienizzante', 'antibatterico', 'disinfettante',
    'total black', 'black', 'nero', 'neri', 'scuri', 'czarny', 'czarne', 'do czarnego', 'do ciemnych',
    'bianchi', 'bianco', 'biale', 'do bialego',
    'color', 'colorati', 'kolor', 'kolory', 'do kolorow',
    'classico', 'klasyczny', 'universale', 'uniwersalny', 'uniwersalna', 'uniwersalne',
    'delicato', 'delikatny', 'delikatna', 'delikatne', 'sensitive', 'wrazliwy',
    'concentrato', 'koncentrat', 'lavatrice', 'bucato', 'detersivo', 'ammorbidente',
    'profumo di pulito', 'zapach czystosci', 'swiezy zapach', 'swiezy', 'swiezosc', 'czystosc', 'czysty',
    'oryginalny', 'original', 'originale', 'standard', 'standardowy',
    'natural', 'naturalny', 'ekologiczny', 'eco', 'bio',
    'active', 'power', 'max', 'plus', 'pro', 'ultra', 'extra', 'express', 'rapid',
    'multi', 'multiuso', 'wielofunkcyjny',
    'bezzapachowy', 'bez zapachu', 'brak zapachu',
    'mocny', 'intensywny', 'lagodny', 'neutralny',
    'inne', 'inny', 'inna', 'brak', 'brak danych', 'nie dotyczy', 'null', 'n a', 'unknown', 'nieznany'
]);

const FUNCTIONAL_SCENT_SUBSTRING_RE = /(?<![a-z0-9])(?:pulito\s+profondo|extra\s+smacchiante|glebokie\s+czyszczenie|dokladne\s+czyszczenie|total\s+black|profumo\s+di\s+pulito|do\s+prania|do\s+plukania|ochrona\s+kolor(?:u|ow)|usuwanie\s+plam|usuwa\s+plamy|z\s+wybielaczem|con\s+candeggina|sgrassatore)(?![a-z0-9])/i;

const ITALIAN_EN_SCENT_TRANSLATIONS = {
    'lavanda': 'Lawenda',
    'lavanda e camomilla': 'Lawenda i rumianek',
    'camomilla': 'Rumianek',
    'muschio bianco': 'Białe piżmo',
    'sapone di marsiglia': 'Mydło marsylskie',
    'marsiglia': 'Mydło marsylskie',
    'fiori di primavera': 'Wiosenne kwiaty',
    'fiori di loto': 'Kwiat lotosu',
    'fiori di cotone': 'Kwiat bawełny',
    'cotone': 'Bawełna',
    'talco e iris': 'Talk i irys',
    'talco': 'Talk',
    'iris': 'Irys',
    'limone': 'Cytryna',
    'limone e menta': 'Cytryna i mięta',
    'agrumi': 'Cytrusy',
    'arancia': 'Pomarańcza',
    'brezza marina': 'Morska bryza',
    'fresco marino': 'Morska bryza',
    'oceano': 'Ocean',
    'ocean fresh': 'Morska bryza',
    'vaniglia': 'Wanilia',
    'peonia': 'Piwonia',
    'rosa': 'Róża',
    'orchidea': 'Orchidea',
    'gelsomino': 'Jaśmin',
    'mandorla': 'Migdał',
    'mandorla dolce': 'Słodki migdał',
    'argan': 'Argan',
    'aloe': 'Aloes',
    'aloe vera': 'Aloes',
    'eucalipto': 'Eukaliptus',
    'menta': 'Mięta',
    'pino': 'Sosna',
    'bergamotto': 'Bergamotka',
    'cocco': 'Kokos',
    'pesca': 'Brzoskwinia',
    'frutti rossi': 'Czerwone owoce',
    'fiori bianchi': 'Białe kwiaty',
    'fiori di ciliegio': 'Kwiat wiśni',
    'sandalo': 'Drzewo sandałowe',
    'ambra': 'Bursztyn',
    'karite': 'Masło shea',
    'burro di karite': 'Masło shea',
    'melograno': 'Granat',
    'fiordaliso': 'Chaber',
    'mughetto': 'Konwalia',
    'cedro': 'Cedr'
};

/**
 * Waliduje i normalizuje wartość pola Zapach:
 * - odrzuca nazwy funkcji/wariantów produktu (np. "Pulito Profondo", "Głębokie czyszczenie", "Total Black") i puste ogólniki ("delikatny", "uniwersalny");
 * - tłumaczy autentyczne włoskie/angielskie nuty zapachowe na język polski.
 */
function sanitizeScentValue(rawVal = '') {
    const original = String(rawVal ?? '').replace(/\s+/g, ' ').trim();
    if (!original || original === '-') {
        return { valid: false, value: null, original, translated: false, rejectedReason: 'empty_or_placeholder' };
    }
    const norm = normalizeScentCompareToken(original);
    if (!norm) {
        return { valid: false, value: null, original, translated: false, rejectedReason: 'empty_or_placeholder' };
    }
    if (INVALID_SCENT_NORMALIZED_SET.has(norm)) {
        return { valid: false, value: null, original, translated: false, rejectedReason: 'non_scent_token' };
    }
    if (FUNCTIONAL_SCENT_SUBSTRING_RE.test(norm)) {
        return { valid: false, value: null, original, translated: false, rejectedReason: 'functional_claim_not_scent' };
    }

    if (Object.prototype.hasOwnProperty.call(ITALIAN_EN_SCENT_TRANSLATIONS, norm)) {
        const translatedVal = ITALIAN_EN_SCENT_TRANSLATIONS[norm];
        return {
            valid: true,
            value: translatedVal,
            original,
            translated: normalizeScentCompareToken(translatedVal) !== norm,
            rejectedReason: null
        };
    }

    const compoundParts = original.split(/\s+(?:e|i|&)\s+/i).map(p => p.trim()).filter(Boolean);
    if (compoundParts.length === 2) {
        const n0 = normalizeScentCompareToken(compoundParts[0]);
        const n1 = normalizeScentCompareToken(compoundParts[1]);
        const t0 = ITALIAN_EN_SCENT_TRANSLATIONS[n0];
        const t1 = ITALIAN_EN_SCENT_TRANSLATIONS[n1];
        if (t0 && t1) {
            const joined = `${t0} i ${t1.charAt(0).toLowerCase() + t1.slice(1)}`;
            return {
                valid: true,
                value: joined,
                original,
                translated: true,
                rejectedReason: null
            };
        }
    }

    return {
        valid: true,
        value: original,
        original,
        translated: false,
        rejectedReason: null
    };
}

/**
 * Odfiltrowuje słowa oznaczające funkcję produktu lub typ detergentu z listy „Składniki wiodące (Front)”
 * (np. „Odtłuszczacz” z „con Sgrassatore”) i konwertuje je do rzeczowych wyróżników użytkowych.
 */
function filterHeroIngredients(rawList = []) {
    const rawItems = Array.isArray(rawList)
        ? rawList
        : String(rawList || '').split(/[,;]/);

    const ingredients = [];
    const seenIng = new Set();
    const movedToHighlights = [];
    const seenHighlights = new Set();

    const addHighlight = (text) => {
        const key = normalizeScentCompareToken(text);
        if (text && key && !seenHighlights.has(key)) {
            seenHighlights.add(key);
            movedToHighlights.push(text);
        }
    };

    for (const raw of rawItems) {
        const trimmed = String(raw || '').replace(/\s+/g, ' ').trim();
        if (!trimmed) continue;
        const norm = normalizeScentCompareToken(trimmed);
        if (!norm) continue;

        if (/^(?:odtluszczacz|sgrassatore|con sgrassatore|degreaser|dzialanie odtluszczajace|formula odtluszczajaca)$/.test(norm)) {
            addHighlight('Formuła odtłuszczająca');
            continue;
        }
        if (/^(?:odplamiacz|smacchiante|extra smacchiante|stain remover|dzialanie odplamiajace)$/.test(norm)) {
            addHighlight('Działanie odplamiające');
            continue;
        }
        if (/^(?:odkamieniacz|anticalcare|descaler|dzialanie odkamieniajace)$/.test(norm)) {
            addHighlight('Działanie odkamieniające');
            continue;
        }
        if (/^(?:detergent|detersivo|detersivo liquido|plyn do prania|plyn do plukania|ammorbidente|srodek czyszczacy|formula|koncentrat|concentrato|lavatrice|bucato|pulito profondo|glebokie czyszczenie)$/.test(norm)) {
            continue;
        }
        if (!seenIng.has(norm)) {
            seenIng.add(norm);
            ingredients.push(trimmed);
        }
    }

    return { ingredients, movedToHighlights };
}

function parseStrictYieldCount(rawVal = '') {
    const raw = String(rawVal || '').trim();
    if (!raw) return null;
    if (/\b(?:ml|cl|l|litr|g|kg|mg|dag|mm|cm)\b/i.test(raw) && !/\b(?:pra[nń]|pranie|płuka[nń]|płukanie|cykl|lavaggi|washes|doz|uży[cć])/i.test(raw)) {
        return null;
    }
    return parseDeclaredCycleCount(raw);
}

function parseYieldFromUsageInstructions(usageText = '') {
    const raw = String(usageText || '').replace(/\s+/g, ' ').trim();
    if (!raw) return null;
    const explicitMatch = raw.match(/(?:standardowa\s+liczba\s+pra[nń]|standardowa\s+liczba\s+płuka[nń]|liczba\s+pra[nń]|liczba\s+płuka[nń]|wydajność|wystarcza\s+na)\s*[:=]?\s*(\d{1,4})\b/i);
    if (explicitMatch) {
        const n = parseInt(explicitMatch[1], 10);
        if (Number.isFinite(n) && n >= 2 && n <= 1000) return n;
    }
    const bottleMatch = raw.match(/(?:pozwala\s+na\s+wykonanie|wystarcza\s+na)\s+(?:ok\.?\s+)?(\d{1,4})\s+(?:standardowych\s+)?(?:cykl[iaey]|pra[nń]|płuka[nń])/i);
    if (bottleMatch) {
        const n = parseInt(bottleMatch[1], 10);
        if (Number.isFinite(n) && n >= 2 && n <= 1000) return n;
    }
    return null;
}

function hasVerifiedLabelMarkers(features = {}) {
    if (!features || typeof features !== 'object') return false;
    if (features['_labelsPreScannedAt']) return true;
    const keys = Object.keys(features);
    return keys.some((k) => {
        if (/zdjęcie\s+(?:frontu|tyłu)\s+opakowania/i.test(k)) return false;
        return /\((?:Etykieta|Front|Kontretykieta|Etykieta\s*Front|Etykieta\s*Tył)\)/i.test(k);
    });
}

/**
 * Ekstrahuje zweryfikowaną liczbę prań / płukań wyłącznie z twardych dowodów etykietowych
 * (NIGDY ze surowego pola Allegro/BaseLinker `features['Liczba prań']`).
 */
function extractVerifiedLabelYield({ visionFront = {}, visionBack = {}, features = {} } = {}) {
    const vFront = visionFront && typeof visionFront === 'object' ? visionFront : {};
    const vBack = visionBack && typeof visionBack === 'object' ? visionBack : {};
    const feats = features && typeof features === 'object' ? features : {};

    const directCandidates = [
        { source: 'visionFront.Wydajność', raw: vFront['Wydajność'] },
        { source: 'visionFront.Wydajność (Front)', raw: vFront['Wydajność (Front)'] },
        { source: 'visionBack.Liczba prań (Etykieta)', raw: vBack['Liczba prań (Etykieta)'] },
        { source: 'visionFront.Liczba prań (Etykieta)', raw: vFront['Liczba prań (Etykieta)'] }
    ];
    for (const cand of directCandidates) {
        if (cand.raw === undefined || cand.raw === null || String(cand.raw).trim() === '') continue;
        const count = parseStrictYieldCount(cand.raw);
        if (count !== null) {
            return { count, source: cand.source, raw: String(cand.raw).trim() };
        }
    }

    const usageCandidates = [
        { source: 'visionBack.Sposób użycia (Etykieta)', raw: vBack['Sposób użycia (Etykieta)'] },
        { source: 'visionBack.Sposób użycia', raw: vBack['Sposób użycia'] },
        { source: 'visionFront.Sposób użycia (Etykieta)', raw: vFront['Sposób użycia (Etykieta)'] }
    ];
    for (const uCand of usageCandidates) {
        if (!uCand.raw) continue;
        const count = parseYieldFromUsageInstructions(uCand.raw);
        if (count !== null) {
            return { count, source: uCand.source, raw: String(uCand.raw).trim() };
        }
    }

    if (hasVerifiedLabelMarkers(feats)) {
        const featDirect = [
            { source: 'features.Liczba prań (Etykieta)', raw: feats['Liczba prań (Etykieta)'] },
            { source: 'features.Wydajność', raw: feats['Wydajność'] },
            { source: 'features.Wydajność (Front)', raw: feats['Wydajność (Front)'] }
        ];
        for (const fCand of featDirect) {
            if (!fCand.raw) continue;
            const count = parseStrictYieldCount(fCand.raw);
            if (count !== null) {
                return { count, source: fCand.source, raw: String(fCand.raw).trim() };
            }
        }
        if (feats['Sposób użycia (Etykieta)']) {
            const count = parseYieldFromUsageInstructions(feats['Sposób użycia (Etykieta)']);
            if (count !== null) {
                return { count, source: 'features.Sposób użycia (Etykieta)', raw: String(feats['Sposób użycia (Etykieta)']).trim() };
            }
        }
    }

    return { count: null, source: null, raw: null };
}

/**
 * Czysto oddziela pola odczytane z etykiet (Front/Back Vision) od pól BaseLinkera/Allegro,
 * aby automapper nie mylił starych wpisów magazynowych z prawdą etykietową.
 */
function extractLabelEvidenceSubsets(features = {}, explicitFront = {}, explicitBack = {}) {
    const feats = features && typeof features === 'object' && !Array.isArray(features) ? features : {};
    const expFront = explicitFront && typeof explicitFront === 'object' ? explicitFront : {};
    const expBack = explicitBack && typeof explicitBack === 'object' ? explicitBack : {};

    const visionFront = {};
    const visionBack = {};

    const hasFrontMarkers = Boolean(
        feats['_labelsPreScannedAt'] ||
        Object.keys(expFront).length > 0 ||
        Object.keys(feats).some(k => /\((?:Front|Etykieta\s*Front)\)/i.test(k))
    );
    const hasBackMarkers = Boolean(
        feats['_labelsPreScannedAt'] ||
        Object.keys(expBack).length > 0 ||
        Object.keys(feats).some(k => /\((?:Etykieta|Kontretykieta|Etykieta\s*Tył)\)/i.test(k))
    );

    const SHARED_FRONT_LABEL_KEYS = new Set(['Pojemność / Waga', 'Wydajność', 'Dozownik']);
    for (const [k, v] of Object.entries(feats)) {
        if (v === undefined || v === null || String(v).trim() === '') continue;
        if (/zdjęcie\s+(?:frontu|tyłu)\s+opakowania|^_/i.test(k)) continue;
        if (/\(Front\)|\(Etykieta\s*Front\)/i.test(k)) {
            visionFront[k] = v;
        } else if (/\(Etykieta\)|\(Kontretykieta\)|\(Etykieta\s*Tył\)/i.test(k)) {
            visionBack[k] = v;
        } else if (hasFrontMarkers && SHARED_FRONT_LABEL_KEYS.has(k)) {
            visionFront[k] = v;
        }
    }
    if (hasFrontMarkers && feats['Marka']) {
        visionFront['Marka'] = feats['Marka'];
    }
    if (hasBackMarkers && feats['Skład/INCI']) {
        visionBack['Skład/INCI'] = feats['Skład/INCI'];
    }

    for (const [k, v] of Object.entries(expFront)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
            visionFront[k] = v;
        }
    }
    for (const [k, v] of Object.entries(expBack)) {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
            visionBack[k] = v;
        }
    }

    const hasLabelEvidence = Boolean(
        hasVerifiedLabelMarkers(feats) ||
        Object.keys(visionFront).length > 0 ||
        Object.keys(visionBack).length > 0
    );

    return { visionFront, visionBack, hasLabelEvidence };
}

const PROTECTED_CORE_PIM_KEYS_NORM = new Set([
    'sklad inci', 'ostrzezenia', 'sposob uzycia', 'wydajnosc',
    'pojemnosc waga', 'dozownik', 'producent'
]);

const PROTECTED_SSOT_ALLEGRO_KEYS_NORM = new Set([
    'postac', 'typ', 'pojemnosc', 'pojemnosc opakowania', 'waga', 'waga produktu',
    'liczba pran', 'liczba uzyc', 'kraj pochodzenia', 'kraj produkcji',
    'opakowanie', 'opakowanie produktu', 'marka', 'liczba sztuk w opakowaniu', 'liczba sztuk',
    'rodzaj prania', 'zastosowanie do', 'zapach', 'nuta zapachowa'
]);

function isProtectedLabelTechnicalKey(key = '') {
    return /^_/.test(key) ||
        /zdjęcie\s+(?:frontu|tyłu)\s+opakowania/i.test(key) ||
        /\((?:Etykieta|Front|Kontretykieta|Etykieta\s*Front|Etykieta\s*Tył)\)/i.test(key);
}

function findNormalizedObjectKey(obj = {}, targetNorm = '') {
    return Object.keys(obj || {}).find(k => normalizeScentCompareToken(k) === targetNorm) || null;
}

/**
 * Scala dane zewnętrzne (BaseLinker / Katalog Allegro API) z istniejącymi cechami produktu przy ścisłym priorytecie Etykiety:
 * - Zewnętrzne źródła uzupełniają WYŁĄCZNIE puste braki i nie nadpisują kluczy etykietowych ani spójnych wartości PIM.
 * - Odrzuca z zewnętrznego źródła błędne wartości pola Zapach (np. "Pulito Profondo", "delikatny").
 */
function mergeFeaturesWithLabelPrecedence(existingFeatures = {}, incomingExternalFeatures = {}, options = {}) {
    const existing = (existingFeatures && typeof existingFeatures === 'object' && !Array.isArray(existingFeatures))
        ? { ...existingFeatures }
        : {};
    const incoming = (incomingExternalFeatures && typeof incomingExternalFeatures === 'object' && !Array.isArray(incomingExternalFeatures))
        ? incomingExternalFeatures
        : {};

    const hasLabelEvidence = hasVerifiedLabelMarkers(existing) ||
        Boolean(existing['Zdjęcie frontu opakowania'] || existing['Zdjęcie tyłu opakowania']);

    for (const [extKey, extVal] of Object.entries(incoming)) {
        if (extVal === undefined || extVal === null || String(extVal).trim() === '') continue;
        if (isProtectedLabelTechnicalKey(extKey)) continue;

        const normExtKey = normalizeScentCompareToken(extKey);

        if ((normExtKey === 'inci' || normExtKey === 'sklad') && existing['Skład/INCI']) {
            continue;
        }

        if (normExtKey === 'zapach' || normExtKey === 'nuta zapachowa') {
            const incomingScent = sanitizeScentValue(extVal);
            const existingScentKey = findNormalizedObjectKey(existing, normExtKey) || findNormalizedObjectKey(existing, 'zapach');
            const existingScentVal = existingScentKey ? existing[existingScentKey] : '';
            const existingScentCheck = sanitizeScentValue(existingScentVal);

            if (!existingScentVal || !existingScentCheck.valid) {
                if (existingScentKey && existingScentVal && !existingScentCheck.valid) {
                    delete existing[existingScentKey];
                }
                if (incomingScent.valid && incomingScent.value) {
                    existing[existingScentKey || extKey] = incomingScent.value;
                }
            }
            continue;
        }

        const existingKey = findNormalizedObjectKey(existing, normExtKey);
        const existingVal = existingKey ? existing[existingKey] : undefined;
        const hasNonEmptyExisting = existingVal !== undefined && existingVal !== null && String(existingVal).trim() !== '';

        if (hasNonEmptyExisting) {
            if (PROTECTED_CORE_PIM_KEYS_NORM.has(normExtKey)) continue;
            if (hasLabelEvidence && PROTECTED_SSOT_ALLEGRO_KEYS_NORM.has(normExtKey)) continue;
            // Nawet bez pełnego skanu nie nadpisujemy już uzupełnionych twardych parametrów katalogowych
            if (PROTECTED_SSOT_ALLEGRO_KEYS_NORM.has(normExtKey)) continue;
        }

        if (!hasNonEmptyExisting) {
            existing[existingKey || extKey] = typeof extVal === 'string' ? extVal.trim() : extVal;
        }
    }

    if (options.cleanInvalidExistingScent !== false) {
        for (const scentAlias of ['Zapach', 'zapach', 'Nuta zapachowa', 'nuta zapachowa']) {
            if (existing[scentAlias] === undefined) continue;
            const checked = sanitizeScentValue(existing[scentAlias]);
            if (!checked.valid) {
                delete existing[scentAlias];
            } else if (checked.translated && checked.value) {
                existing[scentAlias] = checked.value;
            }
        }
    }

    return existing;
}

const FRONT_PROTECTED_BACK_KEYS = new Set([
    'Skład/INCI',
    'INCI',
    'Skład',
    'Ostrzeżenia',
    'Ostrzeżenia (Etykieta)',
    'Sposób użycia',
    'Sposób użycia (Etykieta)',
    'Pojemność nakrętki (Etykieta)',
    'Piktogramy CLP (Etykieta)',
    'Nazwa produktu (Kontretykieta)',
    'Przeznaczenie (Etykieta)',
    'Wyróżniki / Certyfikaty (Etykieta)',
    'Kraj pochodzenia (Etykieta)',
    'Opakowanie (Etykieta)',
    'Liczba sztuk (Etykieta)',
    'Liczba prań (Etykieta)',
    'pH (Etykieta)',
    'Producent'
]);

/**
 * Odfiltrowuje ciężkie obrazy Data URI / klucze zdjęć z cech przekazywanych przez UI do ponownego skanu etykiety.
 */
function sanitizeClientCurrentFeatures(rawFeatures = {}) {
    if (!rawFeatures || typeof rawFeatures !== 'object' || Array.isArray(rawFeatures)) {
        return {};
    }
    const clean = {};
    for (const [k, v] of Object.entries(rawFeatures)) {
        if (v === undefined || v === null) continue;
        if (/^(?:zdjęcie\s+(?:frontu|tyłu)\s+opakowania|zdjecie\s+(?:frontu|tylu)\s+opakowania|_frontimageurl|_backimageurl)$/i.test(String(k).trim())) {
            continue;
        }
        if (typeof v === 'string') {
            const trimmed = v.trim();
            if (!trimmed || /^data:image\//i.test(trimmed)) continue;
            clean[k] = v;
        } else {
            clean[k] = v;
        }
    }
    return clean;
}

/**
 * Bezstratnie nakłada odczyty etykiety frontowej na istniejący słownik cech (np. po wcześniejszym skanie tyłu):
 * - nigdy nie usuwa ani nie nadpisuje pól kontretykiety (INCI, ostrzeżenia, sposób użycia, pH, CLP, nakrętka, producent);
 * - nie nadpisuje zweryfikowanej `Postać (Etykieta)` z tyłu (zapisuje odczyt frontu do `Postać (Front)`);
 * - nie nadpisuje znormalizowanej słownikowej `Marka` ani przeliczonej `Pojemność`/`Waga` surowym napisem z frontu.
 */
function mergeFrontScanFeaturesSafely(existingFeatures = {}, frontFeatures = {}) {
    const updated = (existingFeatures && typeof existingFeatures === 'object' && !Array.isArray(existingFeatures))
        ? { ...existingFeatures }
        : {};
    const fFeats = (frontFeatures && typeof frontFeatures === 'object' && !Array.isArray(frontFeatures))
        ? frontFeatures
        : {};
    const appliedKeysSet = new Set();

    for (const [fk, rawVal] of Object.entries(fFeats)) {
        if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue;
        if (FRONT_PROTECTED_BACK_KEYS.has(fk)) continue;

        if (fk === 'Postać (Etykieta)') {
            updated['Postać (Front)'] = rawVal;
            appliedKeysSet.add('Postać (Front)');
            if (!updated['Postać (Etykieta)'] || String(updated['Postać (Etykieta)']).trim() === '') {
                updated['Postać (Etykieta)'] = rawVal;
                appliedKeysSet.add('Postać (Etykieta)');
            }
            continue;
        }

        if (fk === 'Postać') {
            if (!updated['Postać'] || String(updated['Postać']).trim() === '') {
                updated['Postać'] = rawVal;
                appliedKeysSet.add('Postać');
            }
            continue;
        }

        if (fk === 'Pojemność' || fk === 'Waga') {
            if (!updated[fk] || String(updated[fk]).trim() === '') {
                updated[fk] = rawVal;
                appliedKeysSet.add(fk);
            }
            continue;
        }

        if (fk === 'Marka') {
            const currBrand = String(updated['Marka'] || '').trim();
            if (!currBrand || /^(?:inna|inny|nieznany|nieznana|brak)$/i.test(currBrand)) {
                updated['Marka'] = rawVal;
                appliedKeysSet.add('Marka');
            }
            continue;
        }

        if (fk === 'Zapach') {
            const scentRes = sanitizeScentValue(rawVal);
            if (scentRes.valid && scentRes.value) {
                updated['Zapach'] = scentRes.value;
                appliedKeysSet.add('Zapach');
            }
            continue;
        }

        updated[fk] = rawVal;
        appliedKeysSet.add(fk);
    }

    return {
        updatedFeatures: updated,
        appliedFrontKeys: Array.from(appliedKeysSet)
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
    resolveSection3HeadingAndLead,
    sanitizeScentValue,
    filterHeroIngredients,
    extractVerifiedLabelYield,
    extractLabelEvidenceSubsets,
    mergeFeaturesWithLabelPrecedence,
    sanitizeClientCurrentFeatures,
    mergeFrontScanFeaturesSafely
};
