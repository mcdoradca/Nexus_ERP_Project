const config = require('./baselinker.extract.config.json');
const validators = require('./validators/index.js');

function normalizeFeatureKey(key) {
    if (!key) return '';
    let normalized = key.toLowerCase();
    normalized = normalized.replace(/ł/g, 'l');
    normalized = normalized.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // usuwanie diakrytyk
    normalized = normalized.replace(/[\/_-]/g, ' '); // znaki na spacje
    normalized = normalized.replace(/\s+/g, ' ').trim(); // redukcja spacji
    return normalized;
}

function parseFeaturesTolerant(raw) {
    if (typeof raw === 'object' && raw !== null) {
        return { data: raw, truncated: false };
    }
    if (typeof raw === 'string') {
        try {
            return { data: JSON.parse(raw), truncated: false };
        } catch (e) {
            let str = raw;
            for (let i = 0; i < 5; i++) {
                // Szukamy separatora oznaczającego początek nowej pary (przecinek i cudzysłów klucza)
                const lastCommaIdx = str.lastIndexOf(',"');
                if (lastCommaIdx === -1) break;
                str = str.substring(0, lastCommaIdx);
                try {
                    const parsed = JSON.parse(str + '}');
                    return { data: parsed, truncated: true, recovered_keys: Object.keys(parsed) };
                } catch (e2) {
                    continue;
                }
            }
        }
    }
    return { data: null, truncated: true, recovered_keys: [] };
}

const NON_INCI_FORM_WORDS = new Set([
    'koncentrat', 'plyn', 'zel', 'proszek', 'kapsulki', 'tabletki', 'pianka', 'spray', 
    'balsam', 'krem', 'kostka', 'chusteczki', 'mleczko', 'zawiesina', 'emulsja', 
    'mydlo', 'szampon', 'odzywka', 'plyn do plukania', 'plyn do prania',
    'nowy', 'oryginalne', 'tak', 'nie', 'brak', 'dotyczy', 'nie dotyczy', 'zestaw', 
    '1 sztuka', '1 szt', 'standard', 'uniwersalny'
]);

const INCI_POSITIVE_PATTERNS = [
    /\b(aqua|water|glycerin|extract|oil|acid|sulfate|chloride|alcohol|parfum|fragrance)\b/i,
    /\b(surfactant|tenside|surfactants|środki powierzchniowo czynne|substancje zapachowe|konserwanty)\b/i,
    /\b(phenoxyethanol|sodium|potassium|citric|linalool|limonene|geraniol|citronellol)\b/i,
    /\b(methylisothiazolinone|methylchloroisothiazolinone|benzalkonium|cetearyl)\b/i,
    /\d+%\s*-\s*\d+%/i,   // np. 5%-15%
    /[<>]\s*\d+%/i        // np. < 5%, > 30%
];

function isValidInciValue(val) {
    if (!val || typeof val !== 'string') return false;
    const trimmed = val.trim();
    if (trimmed.length < 4) return false;
    
    const norm = normalizeFeatureKey(trimmed);
    if (NON_INCI_FORM_WORDS.has(norm)) {
        return false;
    }

    // Jeśli zawiera przecinek lub średnik i ma co najmniej 2 człony -> wysoce prawdopodobna lista składników
    if (trimmed.includes(',') || trimmed.includes(';')) {
        const parts = trimmed.split(/[,;]/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 2) return true;
    }

    // Jeśli zawiera charakterystyczne wzorce chemiczne lub detergentowe
    for (const pat of INCI_POSITIVE_PATTERNS) {
        if (pat.test(trimmed)) return true;
    }

    // Pojedyncze składniki botaniczne/kosmetyczne (np. "Argania Spinosa Kernel Oil")
    const words = trimmed.split(/\s+/);
    if (words.length >= 2 && words.length <= 6) {
        if (/\b(oil|butter|extract|wax|juice|water|seed|leaf|flower|root)\b/i.test(trimmed)) {
            return true;
        }
    }

    return false;
}

function extractFromFeatures(product) {
    const result = {
        inci: { value: null, source: null, matched_key: null },
        mpn: { value: null, source: null, matched_key: null },
        brand: { value: null, source: null, matched_key: null },
        capacity: { value: null, source: null, matched_key: null },
        usage: { value: null, source: null, matched_key: null },
        warnings: { value: null, source: null, matched_key: null },
        line: { value: null, source: null, matched_key: null },
        postac: { value: null, source: null, matched_key: null },
        truncated: false,
        recovered_keys: []
    };

    if (!product) {
        return result;
    }

    let features = {};
    let isTruncated = false;
    let recKeys = [];

    // 1. Nowy system parametrów PIM (Karta Techniczna i Skład)
    if (product.features && typeof product.features === 'object') {
        Object.assign(features, product.features);
    }
    if (product['features|pl'] && typeof product['features|pl'] === 'object') {
        Object.assign(features, product['features|pl']);
    }

    // 2. Legacy - text_fields.features
    if (product.text_fields) {
        if (product.text_fields.features) {
            const parseResult = parseFeaturesTolerant(product.text_fields.features);
            if (parseResult.truncated) isTruncated = true;
            if (parseResult.recovered_keys) recKeys.push(...parseResult.recovered_keys);
            if (parseResult.data && typeof parseResult.data === 'object') {
                Object.assign(features, parseResult.data);
            }
        }
        if (product.text_fields['features|pl']) {
            const parseResult = parseFeaturesTolerant(product.text_fields['features|pl']);
            if (parseResult.truncated) isTruncated = true;
            if (parseResult.recovered_keys) recKeys.push(...parseResult.recovered_keys);
            if (parseResult.data && typeof parseResult.data === 'object') {
                Object.assign(features, parseResult.data);
            }
        }
    }

    result.truncated = isTruncated;
    result.recovered_keys = recKeys;

    const featureKeys = Object.keys(features);
    const map = config.featureSynonyms;

    for (const [targetKey, synonyms] of Object.entries(map)) {
        let foundKey = null;

        if (targetKey === 'inci') {
            // Rygorystyczna hierarchia: najpierw szukamy dedykowanych kluczy wieloczłonowych ("sklad inci", "ingredients inci"),
            // a dopiero w ostateczności ogólnego "sklad". Każda wartość musi przejść walidator isValidInciValue.
            const candidates = [];
            for (const fKey of featureKeys) {
                const norm = normalizeFeatureKey(fKey);
                const synonymIndex = synonyms.indexOf(norm);
                if (synonymIndex !== -1) {
                    candidates.push({ fKey, norm, priority: synonymIndex, value: features[fKey] });
                }
            }

            // Sortujemy po priorytecie z konfiguracji (im mniejszy indeks w tablicy synonimów, tym wyższy priorytet)
            candidates.sort((a, b) => a.priority - b.priority);

            for (const candidate of candidates) {
                if (isValidInciValue(candidate.value)) {
                    foundKey = candidate.fKey;
                    break;
                } else {
                    // Jeśli odrzucony parametr to np. "Skład" z wartością określającą postać fizyczną (np. "Koncentrat"),
                    // przekierowujemy go bezpiecznie do właściwości postac
                    const normVal = normalizeFeatureKey(candidate.value);
                    if (NON_INCI_FORM_WORDS.has(normVal) && !result.postac.value) {
                        result.postac = {
                            value: candidate.value,
                            source: "baselinker_features",
                            matched_key: candidate.fKey
                        };
                    }
                }
            }
        } else {
            for (const fKey of featureKeys) {
                const norm = normalizeFeatureKey(fKey);
                if (synonyms.includes(norm)) {
                    foundKey = fKey;
                    break;
                }
            }
        }
        
        if (foundKey) {
            result[targetKey] = {
                value: features[foundKey],
                source: "baselinker_features",
                matched_key: foundKey
            };
        }
    }

    // Fallback: Jeżeli nie znaleziono INCI w parametrach, szukamy go w treści opisu HTML
    if (!result.inci.value && product.text_fields && product.text_fields.description) {
        const desc = product.text_fields.description;
        // Bezpieczny Regex: max 400 znaków by uniknąć przechwytywania całych stron opisu przy braku znacznika zamykającego
        const inciMatch = desc.match(/(?:INCI|Składniki|Skład|Ingredients)\s*:\s*([^<]{5,400})(?:<|$|\n)/i);
        if (inciMatch && inciMatch[1]) {
            const extractedFragment = inciMatch[1].trim();
            // Tarcza błędów (Defensive AI): Prawdziwe INCI musi spełniać kryteria składu
            if (isValidInciValue(extractedFragment)) {
                result.inci = {
                    value: extractedFragment,
                    source: "baselinker_description_regex",
                    matched_key: "description_regex"
                };
            }
        }
    }

    return result;
}

function extractResponsiblePersonFromDescription(html) {
    const defaultResult = { name: null, address_eu: null, contact: null, raw_fragment: null };
    if (!html) return defaultResult;

    // Szukamy tagów <p> z mailem w kodzie zagnieżdżonym lub bezpośrednio. 
    // Z uwagi na układ z Equilibry: <p>...</p><p>...</p><p><a href="mailto:...">...</a></p>
    // Spróbujmy uchwycić fragment zawierający 2-3 takie paragrafy.
    
    // Wzorzec od maila. Znajdź pozycję "mailto:" w opisie, wycofaj się trochę po znacznikach p.
    const mailtoMatch = html.match(/(<p>[^<]*<a\s+href="mailto:[^>]+>[^<]+<\/a>[^<]*<\/p>)/i);
    if (!mailtoMatch) {
        return defaultResult;
    }
    
    const idx = mailtoMatch.index;
    const precedingPart = html.substring(0, idx);
    const followingPart = html.substring(idx + mailtoMatch[0].length);
    
    // Wycofaj się 2 paragrafy w tył
    const paragraphsMatches = precedingPart.match(/(<p>.*?<\/p>)/gi);
    let rawFragment = "";
    if (paragraphsMatches && paragraphsMatches.length >= 2) {
        rawFragment += paragraphsMatches.slice(-2).join('');
    } else if (paragraphsMatches && paragraphsMatches.length === 1) {
        rawFragment += paragraphsMatches[0];
    }
    
    rawFragment += mailtoMatch[0];
    
    // Uformuj obiekt i rzuć na validator
    // name - paragraf 1, address - paragraf 2, contact - mail
    let name = null;
    let address_eu = null;
    let contact = null;
    
    const parts = rawFragment.match(/<p>(.*?)<\/p>/gi);
    if (parts) {
        const texts = parts.map(p => p.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
        if (texts.length >= 3) {
            name = texts[0];
            address_eu = texts[1];
            contact = texts[2];
        } else if (texts.length === 2) {
            // Ciężko oddzielić nazwe od adresu, brak pewności - zwrot z nullami
        }
    }

    if (name && address_eu && contact) {
        const validateRes = validators.validate_eu_responsible_person({ name, address_eu, contact });
        if (validateRes.valid) {
            return {
                name,
                address_eu,
                contact,
                raw_fragment: rawFragment
            };
        } else {
             // W razie gdy validacja się wyłoży
            return { name: null, address_eu: null, contact: null, raw_fragment: rawFragment };
        }
    }

    // fallback jeśli nie zdołano jednoznacznie podzielić:
    return {
        name: null,
        address_eu: null,
        contact: null,
        raw_fragment: rawFragment
    };
}

module.exports = {
    normalizeFeatureKey,
    isValidInciValue,
    extractFromFeatures,
    extractResponsiblePersonFromDescription
};
