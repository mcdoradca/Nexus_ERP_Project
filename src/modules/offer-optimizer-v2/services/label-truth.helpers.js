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

module.exports = {
    CANONICAL_ACRONYMS,
    POLISH_CONNECTOR_WORDS,
    isNoRinseFormula,
    hasDeclaredOdorNeutralizer,
    detectRawCatalogNameLeak
};
