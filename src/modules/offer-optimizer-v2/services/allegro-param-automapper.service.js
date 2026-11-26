const { normalizeIngredientName } = require('../normalization');
const brandResponsibleService = require('../brand.responsible.service');
const { classifyProductPhysicalForm } = require('./product-form.classifier');
const { ean_checksum } = require('../validators');
const {
    resolveLabelPhysicalForm,
    sanitizeScentValue,
    extractVerifiedLabelYield
} = require('./label-truth.helpers');

function normalizeKey(str = '') {
    return String(str || '')
        .toLowerCase()
        .replace(/ł/g, 'l')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const PLACEHOLDER_VALUES = new Set([
    '', 'null', 'undefined', 'brak danych', 'nie dotyczy', 'n a', 'unknown', 'nieznany', 'nieznany producent'
]);

function isEmptyOrPlaceholder(val, allowWordBrak = true) {
    if (val === undefined || val === null) return true;
    const raw = String(val).trim();
    if (!raw || raw === '-') return true;
    const norm = normalizeKey(raw);
    if (!allowWordBrak && norm === 'brak') return true;
    return PLACEHOLDER_VALUES.has(norm);
}

const BPR_FORBIDDEN_DICT_REGEX = /\b(?:antybakteryjn[a-ząćęłńóśźż]*|przeciwbakteryjn[a-ząćęłńóśźż]*|bakteriobójcz[a-ząćęłńóśźż]*|biobójcz[a-ząćęłńóśźż]*|dezynfekuj[a-ząćęłńóśźż]*|odkażaj[a-ząćęłńóśźż]*|wirusobójcz[a-ząćęłńóśźż]*|grzybobójcz[a-ząćęłńóśźż]*)\b/i;

function isBprForbiddenOption(dictValue = '') {
    return BPR_FORBIDDEN_DICT_REGEX.test(String(dictValue || ''));
}

function findExistingFeatureKey(features = {}, paramName = '') {
    const targetNorm = normalizeKey(paramName);
    return Object.keys(features || {}).find(k => normalizeKey(k) === targetNorm) || null;
}

/**
 * Dopasowuje pojedynczą lub wielokrotną wartość kandydacką do dokładnej opcji słownika Allegro (`paramSchema.dictionary`).
 * Blokuje opcje naruszające BPR 528/2012 (np. "antybakteryjny", "żel antybakteryjny").
 */
function matchDictionaryOption(candidates, dictionary = [], options = {}) {
    if (!Array.isArray(dictionary) || dictionary.length === 0) return null;
    const candidateList = Array.isArray(candidates) ? candidates : [candidates];
    const cleanDict = dictionary.filter(d => d && d.value && !isBprForbiddenOption(d.value));
    if (cleanDict.length === 0) return null;

    const dictByNorm = new Map();
    for (const entry of cleanDict) {
        const norm = normalizeKey(entry.value);
        if (norm && !dictByNorm.has(norm)) {
            dictByNorm.set(norm, entry.value);
        }
    }

    if (options.multipleChoices) {
        const matched = [];
        for (const cand of candidateList) {
            if (!cand) continue;
            const norm = normalizeKey(cand);
            if (!norm) continue;
            if (dictByNorm.has(norm)) {
                const exactVal = dictByNorm.get(norm);
                if (!matched.includes(exactVal)) matched.push(exactVal);
                continue;
            }
            const fuzzyHits = cleanDict.filter(d => {
                const dn = normalizeKey(d.value);
                return dn.length >= 4 && (norm === dn || norm.includes(dn) || dn.includes(norm));
            });
            if (fuzzyHits.length === 1 && !matched.includes(fuzzyHits[0].value)) {
                matched.push(fuzzyHits[0].value);
            }
        }
        return matched.length > 0 ? matched : null;
    }

    // 1. Szukaj dokładnego dopasowania w kolejności priorytetu kandydatów
    for (const cand of candidateList) {
        if (!cand) continue;
        const norm = normalizeKey(cand);
        if (!norm) continue;
        if (dictByNorm.has(norm)) {
            return dictByNorm.get(norm);
        }
    }

    // 2. Jednoznaczne częściowe dopasowanie (tylko dla sensownych fraz ≥ 4 zn.)
    for (const cand of candidateList) {
        if (!cand) continue;
        const norm = normalizeKey(cand);
        if (norm.length < 3) continue;
        const hits = cleanDict.filter(d => {
            const dn = normalizeKey(d.value);
            if (dn.length < 3) return false;
            return dn === norm || (norm.length >= 4 && (dn.includes(norm) || norm.includes(dn)));
        });
        if (hits.length === 1) {
            return hits[0].value;
        }
        // Preferuj najkrótszą opcję, gdy dokładnie opisuje rdzeń (np. "w sprayu" przy "Butelka z sprayem")
        if (hits.length > 1) {
            const exactWordHit = hits.find(h => {
                const dn = normalizeKey(h.value);
                return new RegExp(`(?:^|\\s)${norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|\\s)`).test(dn);
            });
            if (exactWordHit) return exactWordHit.value;
        }
    }

    return null;
}

const UNIT_FAMILIES = {
    ml: { family: 'volume', toBase: 1 },
    cl: { family: 'volume', toBase: 10 },
    l: { family: 'volume', toBase: 1000 },
    mg: { family: 'mass', toBase: 0.001 },
    g: { family: 'mass', toBase: 1 },
    dag: { family: 'mass', toBase: 10 },
    kg: { family: 'mass', toBase: 1000 },
    mm: { family: 'length', toBase: 1 },
    cm: { family: 'length', toBase: 10 },
    m: { family: 'length', toBase: 1000 },
    szt: { family: 'count', toBase: 1 }
};

function normalizeUnitToken(unitRaw = '') {
    const clean = String(unitRaw || '')
        .toLowerCase()
        .replace(/ł/g, 'l')
        .replace(/ń/g, 'n')
        .replace(/ą/g, 'a')
        .replace(/ę/g, 'e')
        .replace(/ć/g, 'c')
        .replace(/ś/g, 's')
        .replace(/ź|ż/g, 'z')
        .replace(/[.]/g, '')
        .trim();
    if (!clean) return '';
    if (clean === 'ml' || clean.startsWith('mililitr')) return 'ml';
    if (clean === 'cl' || clean.startsWith('centylitr')) return 'cl';
    if (clean === 'l' || clean.startsWith('litr') || clean === 'dm3') return 'l';
    if (clean === 'mg' || clean.startsWith('miligram')) return 'mg';
    if (clean === 'g' || clean === 'gr' || clean.startsWith('gram')) return 'g';
    if (clean === 'dag' || clean === 'dkg' || clean.startsWith('dekagram')) return 'dag';
    if (clean === 'kg' || clean.startsWith('kilogram')) return 'kg';
    if (clean === 'mm' || clean.startsWith('milimetr')) return 'mm';
    if (clean === 'cm' || clean.startsWith('centymetr')) return 'cm';
    if (clean === 'm' || clean.startsWith('metr')) return 'm';
    if (/^(?:szt|sztuk|pcs|kaps|kapsu|tab|tablet|pran|pranie|cykl|uzyc|myci|aplikacj|dozow|wklad|chustec|saszet)/.test(clean)) return 'szt';
    return clean;
}

function convertBetweenUnits(num, srcUnitRaw = '', targetUnitRaw = '') {
    if (!Number.isFinite(num)) return null;
    const srcUnit = normalizeUnitToken(srcUnitRaw);
    const targetUnit = normalizeUnitToken(targetUnitRaw);
    if (!targetUnit || !srcUnit || srcUnit === targetUnit) return num;

    const srcSpec = UNIT_FAMILIES[srcUnit];
    const targetSpec = UNIT_FAMILIES[targetUnit];
    if (!srcSpec || !targetSpec || srcSpec.family !== targetSpec.family) {
        return null;
    }
    return (num * srcSpec.toBase) / targetSpec.toBase;
}

function formatNumericForAllegro(num, paramSchema = {}, { enforceBounds = true } = {}) {
    if (!Number.isFinite(num)) {
        return { ok: false, value: null, error: 'Nieprawidłowa wartość liczbowa' };
    }
    const restrictions = paramSchema?.restrictions || {};
    const paramType = paramSchema?.type || 'float';
    const precision = paramType === 'integer'
        ? 0
        : (typeof restrictions.precision === 'number' && restrictions.precision >= 0
            ? Math.min(8, restrictions.precision)
            : 4);

    const factor = Math.pow(10, precision);
    let rounded = Math.round(num * factor) / factor;
    if (Math.abs(rounded) === 0) rounded = 0;

    if (enforceBounds) {
        const targetUnit = normalizeUnitToken(paramSchema?.unit || '');
        if (typeof restrictions.min === 'number' && rounded < restrictions.min) {
            return { ok: false, value: null, error: `Wartość ${rounded} poniżej minimum (${restrictions.min}${targetUnit ? ' ' + targetUnit : ''})` };
        }
        if (typeof restrictions.max === 'number' && rounded > restrictions.max) {
            return { ok: false, value: null, error: `Wartość ${rounded} powyżej maksimum (${restrictions.max}${targetUnit ? ' ' + targetUnit : ''})` };
        }
    }

    const formatted = precision === 0
        ? String(Math.round(rounded))
        : rounded.toFixed(precision).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');

    return { ok: true, value: formatted, numericValue: rounded, error: null };
}

function normalizeNumericValueForAllegroParam(rawVal, paramSchema = {}, { fallbackSources = '', enforceBounds = true } = {}) {
    if (!paramSchema || (paramSchema.type !== 'float' && paramSchema.type !== 'integer')) {
        return { ok: false, value: null, converted: false, error: 'Parametr nie jest typu liczbowego' };
    }
    if (rawVal === undefined || rawVal === null) {
        return { ok: false, value: null, converted: false, error: 'Brak wartości liczbowej' };
    }
    const rawStr = String(rawVal).trim();
    if (!rawStr) {
        return { ok: false, value: null, converted: false, error: 'Pusta wartość liczbowa' };
    }

    const numUnitMatch = rawStr.match(/^(?:ok\.?\s*)?(-?\d+(?:\s\d{3})*(?:[.,]\d+)?)\s*(ml|mililitr(?:y|ów|a)?|cl|centylitr(?:y|ów|a)?|l|litr(?:y|ów|a)?|dm3|mg|miligram(?:y|ów|a)?|g|gr|gram(?:y|ów|a)?|dag|dkg|dekagram(?:y|ów|a)?|kg|kilogram(?:y|ów|a)?|mm|milimetr(?:y|ów|a)?|cm|centymetr(?:y|ów|a)?|m|metr(?:y|ów|a)?|szt\.?|sztuk(?:i|a)?|pcs|kapsuł(?:ek|ki)|tabletek|tabletki|tabs|caps|pra[nń]|pranie|płuka[nń]|płukanie|cykl(?:i|e)|uży[cć]|użycia)?\.?$/i);
    if (!numUnitMatch) {
        return { ok: false, value: null, converted: false, error: `Nie można sparsować liczby z "${rawStr}"` };
    }

    const numStr = numUnitMatch[1].replace(/\s+/g, '').replace(',', '.');
    const parsedNum = parseFloat(numStr);
    if (!Number.isFinite(parsedNum)) {
        return { ok: false, value: null, converted: false, error: `Nieprawidłowa liczba "${rawStr}"` };
    }

    const targetUnit = normalizeUnitToken(paramSchema.unit || '');
    const explicitSrcUnit = normalizeUnitToken(numUnitMatch[2] || '');
    const restrictions = paramSchema.restrictions || {};
    let convertedNum = parsedNum;

    if (explicitSrcUnit) {
        if (targetUnit && explicitSrcUnit !== targetUnit) {
            const c = convertBetweenUnits(parsedNum, explicitSrcUnit, targetUnit);
            if (c === null) {
                return { ok: false, value: null, converted: false, error: `Niezgodna jednostka "${explicitSrcUnit}" dla parametru w "${targetUnit}"` };
            }
            convertedNum = c;
        }
    } else if (targetUnit && parsedNum > 0) {
        const fbStr = String(fallbackSources || '');
        const numEscaped = String(parsedNum).replace('.', '[.,]');
        if (targetUnit === 'l') {
            const fallbackMentionsMl = fbStr && new RegExp(`\\b${numEscaped}\\s*ml\\b`, 'i').test(fbStr);
            const exceedsMaxAsLitres = typeof restrictions.max === 'number' &&
                parsedNum > restrictions.max &&
                (parsedNum / 1000) <= restrictions.max &&
                (typeof restrictions.min !== 'number' || (parsedNum / 1000) >= restrictions.min);
            if (fallbackMentionsMl || exceedsMaxAsLitres) {
                convertedNum = parsedNum / 1000;
            }
        } else if (targetUnit === 'kg') {
            const fallbackMentionsG = fbStr && new RegExp(`\\b${numEscaped}\\s*(?:g|gr)\\b`, 'i').test(fbStr);
            const exceedsMaxAsKg = typeof restrictions.max === 'number' &&
                parsedNum > restrictions.max &&
                (parsedNum / 1000) <= restrictions.max &&
                (typeof restrictions.min !== 'number' || (parsedNum / 1000) >= restrictions.min);
            if (fallbackMentionsG || exceedsMaxAsKg) {
                convertedNum = parsedNum / 1000;
            }
        }
    }

    const formattedRes = formatNumericForAllegro(convertedNum, paramSchema, { enforceBounds });
    if (!formattedRes.ok) {
        return { ok: false, value: null, converted: false, error: formattedRes.error };
    }

    return {
        ok: true,
        value: formattedRes.value,
        numericValue: formattedRes.numericValue,
        converted: formattedRes.value !== rawStr,
        error: null
    };
}

function normalizeNumericFeaturesForAllegroSchema(features = {}, allegroSchema = [], { productName = '', visionFeatures = {} } = {}) {
    if (!features || typeof features !== 'object' || Array.isArray(features) || !Array.isArray(allegroSchema) || allegroSchema.length === 0) {
        return { features: features || {}, changed: false, reformattedParams: {} };
    }
    const nextFeatures = { ...features };
    const fallbackSources = [
        productName,
        visionFeatures?.['Pojemność / Waga'],
        visionFeatures?.['Pojemność'],
        visionFeatures?.['Waga'],
        nextFeatures['Pojemność / Waga'],
        nextFeatures['Waga']
    ].filter(Boolean).join(' ');

    let changed = false;
    const reformattedParams = {};

    for (const param of allegroSchema) {
        if (!param || !param.name || (param.type !== 'float' && param.type !== 'integer')) continue;
        const matchedKey = findExistingFeatureKey(nextFeatures, param.name);
        if (!matchedKey) continue;
        const currentVal = nextFeatures[matchedKey];
        if (currentVal === undefined || currentVal === null || String(currentVal).trim() === '') continue;

        const norm = normalizeNumericValueForAllegroParam(currentVal, param, { fallbackSources, enforceBounds: true });
        if (norm.ok && norm.value !== null) {
            if (norm.value !== String(currentVal).trim() || matchedKey !== param.name) {
                if (matchedKey !== param.name) delete nextFeatures[matchedKey];
                nextFeatures[param.name] = norm.value;
                reformattedParams[param.name] = norm.value;
                changed = true;
            }
        }
    }

    return { features: nextFeatures, changed, reformattedParams };
}

/**
 * Parsuje i przelicza ilość (pojemność l/ml lub wagę kg/g lub wymiary mm/cm/m lub liczbę sztuk) pod docelową jednostkę parametru Allegro.
 */
function parseQuantityToUnit(rawValue, targetUnit = '', paramType = 'float', options = {}) {
    if (rawValue === undefined || rawValue === null) return null;
    const rawStr = String(rawValue).trim();
    if (!rawStr) return null;

    const unitLower = normalizeUnitToken(targetUnit || '');
    const isWeightParam = Boolean(options.isWeight) || ['kg', 'g', 'mg', 'dag'].includes(unitLower);
    const isVolumeParam = Boolean(options.isVolume) || ['l', 'ml', 'cl'].includes(unitLower);
    const isLengthParam = Boolean(options.isLength) || ['mm', 'cm', 'm'].includes(unitLower);
    const isCountParam = Boolean(options.isCount) || unitLower === 'szt';

    if (isCountParam) {
        let strippedMeasureStr = rawStr
            .replace(/\b\d+\s+\d{1,3}\s*(?:ml|l|litr(?:y|ów|a)?|cl|mg|g|gr|dag|dkg|kg|cm|mm|m)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, ' ')
            .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|l|litr(?:y|ów|a)?|cl|mg|g|gr|dag|dkg|kg|cm|mm|m|%)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, ' ');
        if (options.excludeCycles) {
            strippedMeasureStr = strippedMeasureStr.replace(/\b\d+\s*(?:pra[nń]|pranie|płuka[nń]|płukanie|cykl(?:i|e|u)?(?:\s+(?:płukania|prania))?|lavaggi|wash(?:es)?)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/gi, ' ');
        }
        const countRegex = options.requireExplicitUnit
            ? /\b(\d+)\s*(?:szt\.?|kapsuł(?:ek|ki)|tabletek|tabletki|tabs|caps|pra[nń]|pranie|płuka[nń]|płukanie|uży[cć]|użycia|cykl(?:i|e)|my[cć]|aplikacj[ie]|dozowa[nń]|wkład(?:ów|y)|chusteczek|saszetek)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i
            : /\b(\d+)\s*(?:szt\.?|kapsuł(?:ek|ki)|tabletek|tabletki|tabs|caps|pra[nń]|płuka[nń]|uży[cć]|wkład(?:ów|y)|chusteczek|saszetek)?(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i;
        const countMatch = strippedMeasureStr.match(countRegex);
        if (!countMatch) return null;
        const n = parseInt(countMatch[1], 10);
        if (!Number.isFinite(n) || n <= 0 || n > 10000) return null;
        return String(n);
    }

    const matches = Array.from(rawStr.matchAll(/(\d+(?:[.,]\d+)?)\s*(ml|mililitr(?:y|ów|a)?|cl|centylitr(?:y|ów|a)?|l|litr(?:y|ów|a)?|mg|miligram(?:y|ów|a)?|dag|dkg|g|gr|kg|mm|cm|m)\b/gi));
    let selectedNum = null;
    let selectedUnit = '';

    if (matches.length > 0) {
        for (const m of matches) {
            const u = normalizeUnitToken(m[2]);
            if (isWeightParam && ['kg', 'g', 'mg', 'dag'].includes(u)) {
                selectedNum = parseFloat(m[1].replace(',', '.'));
                selectedUnit = u;
                break;
            }
            if (isVolumeParam && ['ml', 'l', 'cl'].includes(u)) {
                selectedNum = parseFloat(m[1].replace(',', '.'));
                selectedUnit = u;
                break;
            }
            if (isLengthParam && ['mm', 'cm', 'm'].includes(u)) {
                selectedNum = parseFloat(m[1].replace(',', '.'));
                selectedUnit = u;
                break;
            }
        }
    } else if (/^\d+(?:[.,]\d+)?$/.test(rawStr)) {
        const plainNum = parseFloat(rawStr.replace(',', '.'));
        if (Number.isFinite(plainNum) && plainNum > 0) {
            selectedNum = plainNum;
            selectedUnit = unitLower || '';
        }
    }

    if (selectedNum === null || !Number.isFinite(selectedNum) || selectedNum <= 0) {
        return null;
    }

    let converted = selectedNum;
    if (unitLower && selectedUnit && selectedUnit !== unitLower) {
        const c = convertBetweenUnits(selectedNum, selectedUnit, unitLower);
        if (c === null) return null;
        converted = c;
    }

    const formatted = formatNumericForAllegro(
        converted,
        { type: paramType, unit: targetUnit, restrictions: typeof options.precision === 'number' ? { precision: options.precision } : {} },
        { enforceBounds: false }
    );
    return formatted.ok ? formatted.value : null;
}

function extractFreeFromDeclarations(textSources = '', inciText = '') {
    const src = String(textSources || '').toLowerCase();
    const inciLower = String(inciText || '').toLowerCase();
    if (!src.trim()) return [];

    const rules = [
        { regex: /\b(?:bez\s+chloru|nie\s+zawiera\s+chloru|senza\s+cloro|chlorine\s*-?\s*free)\b/i, option: 'bez chloru', inciGuard: /(?:sodium\s+hypochlorite|troclosene|hypochlorite|chlorine)/i },
        { regex: /\b(?:bez\s+fosforan[oó]w|senza\s+fosfati|phosphate\s*-?\s*free)\b/i, option: 'bez fosforanów', inciGuard: /(?:phosphate|phosphonates)/i },
        { regex: /\b(?:bez\s+amoniaku|senza\s+ammoniaca|ammonia\s*-?\s*free)\b/i, option: 'bez amoniaku', inciGuard: /\b(?:ammonia|ammonium\s+hydroxide)\b/i },
        { regex: /\b(?:bez\s+paraben[oó]w|paraben\s*-?\s*free|senza\s+parabeni)\b/i, option: 'parabenów', inciGuard: /paraben\b/i },
        { regex: /\b(?:bez\s+silikon[oó]w|silicone\s*-?\s*free|senza\s+siliconi)\b/i, option: 'silikonów', inciGuard: /(?:dimethicone|cyclopentasiloxane|amodimethicone|siloxane)/i },
        { regex: /\b(?:bez\s+parafiny|senza\s+paraffina|paraffin\s*-?\s*free)\b/i, option: 'parafiny', inciGuard: /paraffinum/i },
        { regex: /\b(?:bez\s+olej[oó]w\s+mineralnych|mineral\s+oil\s*-?\s*free)\b/i, option: 'olejów mineralnych', inciGuard: /paraffinum\s+liquidum/i },
        { regex: /\b(?:bez\s+alkoholu|alcohol\s*-?\s*free|senza\s+alcool|0%\s+alkoholu)\b/i, option: 'alkoholu', inciGuard: /(?:^|,\s*)(?:alcohol|alcohol\s+denat\.?|isopropyl\s+alcohol)\b/i },
        { regex: /\b(?:bez\s+soli\s+aluminium|bez\s+aluminium|aluminium\s*-?\s*free|0%\s+aluminium)\b/i, option: 'aluminium', inciGuard: /aluminum\s+(?:chlorohydrate|zirconium|sesquichlorohydrate)/i },
        { regex: /\b(?:bez\s+barwnik[oó]w|dye\s*-?\s*free|senza\s+coloranti)\b/i, option: 'barwników', inciGuard: /\bCI\s*\d{4,6}\b/i },
        { regex: /\b(?:bez\s+sles)\b/i, option: 'SLES', inciGuard: /sodium\s+laureth\s+sulfate/i },
        { regex: /\b(?:bez\s+sls)\b/i, option: 'SLS', inciGuard: /sodium\s+lauryl\s+sulfate/i },
        { regex: /\b(?:bez\s+peg|peg\s*-?\s*free)\b/i, option: 'PEG', inciGuard: /\bPEG-\d+/i },
        { regex: /\b(?:bez\s+kompozycji\s+zapachowej|bezzapachow[yae]|fragrance\s*-?\s*free|senza\s+profumo)\b/i, option: 'substancji zapachowych', inciGuard: /\b(?:parfum|fragrance)\b/i },
        { regex: /\b(?:bez\s+mydła|soap\s*-?\s*free|senza\s+sapone)\b/i, option: 'mydła', inciGuard: /(?:sodium\s+cocoate|potassium\s+cocoate|sodium\s+tallowate)/i },
        { regex: /\b(?:bez\s+fluoru|fluoride\s*-?\s*free|senza\s+fluoro)\b/i, option: 'bez fluoru', inciGuard: /fluoride/i },
        { regex: /\b(?:wegańsk[aie]|vegan|bez\s+składników\s+pochodzenia\s+zwierzęcego)\b/i, option: 'składników pochodzenia zwierzęcego', inciGuard: /(?:cera\s+alba|lanolin|mel\b|collagen)/i }
    ];

    const hits = [];
    for (const r of rules) {
        if (r.regex.test(src) && (!inciLower || !r.inciGuard.test(inciLower))) {
            hits.push(r.option);
        }
    }
    return hits;
}

function buildPostacCandidates(formInfo, rawPostac = '', options = {}) {
    const raw = String(rawPostac || '').trim();
    const candidates = [];
    const isHybridRaw = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:płyn\s*[\/+-]?\s*żel|żel\s*[\/+-]?\s*płyn)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(raw);
    const contradictsStrictLiquid = Boolean(options.strictLiquid) && /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:żel|zel|w\s+żelu|proszek|tabletki|kapsułki|kostka)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(raw);
    if (raw && !isHybridRaw && !contradictsStrictLiquid) {
        candidates.push(raw);
    }

    const map = {
        spray: ['w sprayu', 'spray', 'płyn', 'w płynie'],
        gel: ['żel', 'w żelu', 'płyn', 'w płynie'],
        liquid: options.strictLiquid ? ['w płynie', 'płyn'] : ['w płynie', 'płyn', 'żel'],
        foam: ['pianka', 'w piance', 'w płynie', 'płyn'],
        cream_milk: ['mleczko', 'krem', 'w płynie'],
        powder: ['w proszku', 'proszek', 'puder', 'granulki'],
        tablet: ['tabletki', 'w tabletkach', 'kapsułki'],
        capsule: ['kapsułki', 'tabletki'],
        bar: ['kostka', 'w kostce'],
        wipes: ['chusteczki nawilżane', 'chusteczka']
    };
    if (formInfo?.form && map[formInfo.form]) {
        candidates.push(...map[formInfo.form]);
    }
    return candidates;
}

function buildPackagingCandidates(rawPackaging = '', rawDispenser = '', formInfo = {}) {
    const joined = `${rawPackaging} ${rawDispenser}`.toLowerCase();
    const candidates = [];
    if (rawPackaging) candidates.push(rawPackaging);

    if (formInfo.isRefill || /\b(doypack|zgrzewany\s+worek|worek|zapas|uzupełnieni)\b/i.test(joined)) {
        candidates.push('zgrzewany worek', 'saszetka', 'plastikowa butelka', 'butelka');
    } else if (/atomizer|spray|spryskiwacz|trigger/i.test(joined) || formInfo.form === 'spray') {
        candidates.push('plastikowa butelka z atomizerem', 'butelka z atomizerem', 'atomizer', 'plastikowa butelka', 'puszka (spray)');
    } else if (/pompk/i.test(joined)) {
        candidates.push('butelka z pompką', 'plastikowa butelka', 'butelka');
    } else if (/puszk|aerozol/i.test(joined)) {
        candidates.push('puszka (spray)', 'puszka');
    } else if (/saszetk/i.test(joined)) {
        candidates.push('saszetka');
    } else if (/pudełk|box/i.test(joined) || formInfo.form === 'tablet' || formInfo.form === 'capsule') {
        candidates.push('plastikowe pudełko', 'kartonik', 'folia');
    } else if (/karton/i.test(joined)) {
        candidates.push('kartonik');
    } else if (/tubk/i.test(joined)) {
        candidates.push('tubka');
    } else if (/słoik/i.test(joined)) {
        candidates.push('słoik', 'słoiczek');
    } else if (/kanister/i.test(joined)) {
        candidates.push('kanister');
    } else if (/butelk|korek|nakrętk/i.test(joined) || formInfo.hasAqueousSignal) {
        candidates.push('plastikowa butelka', 'butelka');
    }

    return candidates;
}

function buildPurposeAndTypeCandidates(textSources = '') {
    const low = String(textSources || '').toLowerCase();
    const candidates = [];

    if (/odkamieniacz|anticalcare|kamienia\s+wodnego|usuwania\s+kamienia|kamień/i.test(low)) {
        if (/ekspres/i.test(low)) candidates.push('odkamieniacze do czajników i ekspresów', 'do ekspresów');
        if (/czajnik/i.test(low)) candidates.push('odkamieniacze do czajników i ekspresów', 'do sprzętów kuchennych');
        if (/pralk/i.test(low)) candidates.push('odkamieniacze do pralek', 'do pralek');
        if (/piekarnik/i.test(low)) candidates.push('odkamieniacze do piekarników', 'do sprzętów kuchennych');
        candidates.push('odkamieniacze do łazienki', 'łazienka i toaleta', 'do łazienki', 'inne');
    }
    if (/(?:łazienk|kabin|prysznic|wanna|umywalk|armatur|sanitarn|bagno)/i.test(low)) {
        candidates.push('łazienka i toaleta', 'do łazienki', 'czyszczenie armatury', 'odkamieniacze do łazienki');
    }
    if (/(?:toalet|\bwc\b|muszl)/i.test(low)) {
        candidates.push('Środki do toalet', 'łazienka i toaleta');
    }
    if (/(?:kuchn|piekarnik|grill|okap|odtłuszczacz|sgrassatore|przypal)/i.test(low)) {
        candidates.push('kuchnia', 'do kuchni', 'do piekarnika i grilla', 'Środki do kuchni');
    }
    if (/(?:podłog|panel|płytek\s+podłog|pavimenti)/i.test(low)) {
        candidates.push('Środki do mycia podłóg', 'do podłóg');
    }
    if (/(?:szyb|luster|szkł|vetri|cristalli)/i.test(low)) {
        candidates.push('Środki do szyb i luster', 'do szyb i luster');
    }
    if (/(?:mebl|drewn|drewna)/i.test(low)) {
        candidates.push('Środki do mebli', 'do mebli');
    }
    if (/(?:uniwersal|wielofunkc|multiuso)/i.test(low)) {
        candidates.push('uniwersalne', 'Środki uniwersalne');
    }
    if (/(?:wybielacz|candeggina|chlor)/i.test(low)) {
        candidates.push('wybielacze', 'inne');
    }
    if (/(?:mydł|sapone)/i.test(low) && /(?:płynie|w płynie|liquido|krem)/i.test(low)) {
        candidates.push('w płynie');
    } else if (/(?:mydł|sapone)/i.test(low) && /(?:piance|pianka)/i.test(low)) {
        candidates.push('w piance');
    } else if (/(?:mydł|sapone)/i.test(low) && /(?:kostce|kostka)/i.test(low)) {
        candidates.push('w kostce');
    }

    return candidates;
}

function stripNegativeExclusionClauses(text = '') {
    return String(text || '')
        .replace(/(?:nie\s+(?:stosować|używać|nadaje\s+się|przeznaczon\w*|prać)|wykluczeni[ae]\s+zastosowania|non\s+adatto\s+a|non\s+usare\s+su|do\s+not\s+use\s+on)[^.!?\n]*(?:[.!?\n]|$)/gi, ' ');
}

function buildWashTypeCandidates({ usageText = '', purposeTextSources = '', productName = '' } = {}) {
    const positiveText = stripNegativeExclusionClauses(`${usageText} ${purposeTextSources} ${productName}`);
    const hasMachine = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:w\s+pralce|pralk[ai]|pralce\s+automatycznej|automatyczn\w*|lavatrice|wsad\s*\d)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(positiveText);
    const hasHand = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:prani[aeu]\s+ręczn\w*|ręczn(?:ie|e|ego)|a\s+mano|hand\s*wash)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(positiveText);
    if (hasMachine && hasHand) return ['uniwersalne', 'automatyczne'];
    if (hasMachine) return ['automatyczne', 'uniwersalne'];
    if (hasHand) return ['ręczne'];
    return [];
}

function buildFabricColorTargetCandidates({ officialLabelName = '', variantFront = '', purposeTextSources = '', usageText = '', productName = '' } = {}) {
    const positiveText = `${officialLabelName} ${variantFront} ${productName} ${stripNegativeExclusionClauses(`${purposeTextSources} ${usageText}`)}`;
    if (/(?:total\s+black|do\s+(?:tkanin\s+)?(?:czarnych|ciemnych)|do\s+czarnego|\bcapi\s+(?:neri|scuri)\b|\bneri\s+e\s+scuri\b)/i.test(positiveText)) {
        return ['czarnego', 'uniwersalne'];
    }
    const mentionsUniversal = /(?:wszystk(?:ich|ie)\s+(?:rodzaj\w*\s+)?tkanin|białych\s+i\s+kolorowych|kolorowych\s+i\s+białych|kolorów\s+i\s+białych|tutti\s+i\s+capi|ogni\s+tipo\s+di\s+tessut|uniwersal\w*)/i.test(positiveText);
    if (mentionsUniversal) {
        return ['uniwersalne'];
    }
    const mentionsColor = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:do\s+(?:tkanin\s+)?kolor\w*|tkanin\w*\s+kolor\w*|colorati|capi\s+colorati|color)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(positiveText);
    const mentionsWhite = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:do\s+(?:tkanin\s+)?biał\w*|tkanin\w*\s+biał\w*|capi\s+bianchi|\bbianchi\b)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(positiveText);
    if (mentionsColor && !mentionsWhite) return ['kolorów'];
    if (mentionsWhite && !mentionsColor) return ['białego'];
    if (/(?:lavatrice|detersivo|płyn\s+do\s+prania|żel\s+do\s+prania|proszek\s+do\s+prania|kapsułki\s+do\s+prania)/i.test(positiveText)) {
        return ['uniwersalne'];
    }
    return [];
}

function buildCechyDodatkoweCandidates({
    productName = '',
    officialLabelName = '',
    variantFront = '',
    labelClaimsText = '',
    usageText = '',
    inciText = '',
    dispenser = '',
    formInfo = {}
} = {}) {
    const positiveText = [
        productName,
        officialLabelName,
        variantFront,
        labelClaimsText,
        stripNegativeExclusionClauses(usageText)
    ].filter(Boolean).join(' ');

    const featureCands = [];
    if (formInfo.isRefill) featureCands.push('zapas');
    if (/koncentrat|concentrat/i.test(positiveText)) featureCands.push('koncentrat');
    if (/ekolog|eco|natural/i.test(labelClaimsText)) featureCands.push('ekologiczny', 'ekologiczne');
    if (/biodegradowaln/i.test(positiveText)) featureCands.push('biodegradowalny');
    if (/hipoalergiczn|ipoallergenic/i.test(positiveText)) featureCands.push('hipoalergiczne');
    if (/bez\s+chloru|senza\s+cloro/i.test(labelClaimsText) && !/(sodium\s+hypochlorite|troclosene)/i.test(inciText)) {
        featureCands.push('bez chloru');
    }
    if (/bez\s+fosforan|senza\s+fosfat/i.test(positiveText)) featureCands.push('bez fosforanów');
    if (/bez\s+wybielacza|senza\s+candeggina/i.test(positiveText)) {
        featureCands.push('bez wybielacza');
    } else if (/(?:z\s+wybielaczem|zawiera\s+wybielacz|\bcandeggina\b)/i.test(positiveText)) {
        featureCands.push('z wybielaczem');
    }
    if (/bez\s+smug/i.test(labelClaimsText)) featureCands.push('bez smug');
    if (/bezzapachow|senza\s+profumo/i.test(labelClaimsText)) featureCands.push('bezzapachowy');
    if (/(?:nisk(?:ich|iej)\s+temperatur|na\s+zimno|a\s+freddo|\b(?:20|30)\s*°\s*c\b)/i.test(positiveText)) {
        featureCands.push('skuteczny w niskiej temperaturze');
    }
    if (/(?:odplamia|smacchiant|sgrassator|odtłuszcz|usuwani[ea]\s+plam|trudne\s+plamy)/i.test(positiveText)) {
        featureCands.push('z odplamiaczem');
    }
    if (/odzież\w*\s+sportow|capi\s+sportivi|\bsport\b/i.test(positiveText)) {
        featureCands.push('do odzieży sportowej');
    }
    if (/(?:do\s+)?tkanin\w*\s+syntetyczn|capi\s+sintetici/i.test(positiveText)) {
        featureCands.push('do tkanin syntetycznych');
    }
    if (/\b(?:atomizer|pompk|dozownik)\b/i.test(dispenser || '') && !formInfo.isRefill) {
        featureCands.push('dozownik');
    }
    if (/recykling|riciclat/i.test(labelClaimsText)) featureCands.push('opakowanie z recyklingu');
    return featureCands;
}

/**
 * Deterministycznie mapuje cechy odczytane z opakowania (Vision Front/Back) i z twardych pól PIM
 * na konkretny schemat kategorii Allegro (`allegroSchema`).
 * - NIGDY nie nadpisuje niepustych wartości już obecnych w `currentFeatures`.
 * - NIGDY nie wpisuje wartości spoza słownika (`param.dictionary`).
 * - Zwraca zaktualizowany słownik `updatedFeatures` oraz diagnostykę `mappedParams`.
 */
function mapPackagingFeaturesToAllegroSchema({
    allegroSchema = [],
    currentFeatures = {},
    visionFront = {},
    visionBack = {},
    product = {}
} = {}) {
    const schema = Array.isArray(allegroSchema) ? allegroSchema : [];
    const baseFeatures = (currentFeatures && typeof currentFeatures === 'object' && !Array.isArray(currentFeatures))
        ? { ...currentFeatures }
        : {};
    const prodFeatures = (product?.features && typeof product.features === 'object' && !Array.isArray(product.features))
        ? product.features
        : ((product?.text_fields?.features && typeof product.text_fields.features === 'object') ? product.text_fields.features : {});
    const vFront = (visionFront && typeof visionFront === 'object') ? visionFront : {};
    const vBack = (visionBack && typeof visionBack === 'object') ? visionBack : {};

    const hintFeatures = {
        ...prodFeatures,
        ...vBack,
        ...vFront,
        ...baseFeatures
    };

    const productName = String(product?.name || product?.text_fields?.name || hintFeatures['Nazwa'] || '').trim();
    const officialLabelName = String(
        vFront['Nazwa produktu (Etykieta Front)'] ||
        vBack['Nazwa produktu (Kontretykieta)'] ||
        hintFeatures['Nazwa produktu (Etykieta Front)'] ||
        hintFeatures['Nazwa produktu (Kontretykieta)'] ||
        ''
    ).trim();
    const inciText = String(
        hintFeatures['Skład/INCI'] || vBack['Skład/INCI'] || hintFeatures['INCI'] || hintFeatures['Skład'] || ''
    ).trim();
    const labelForm = resolveLabelPhysicalForm({
        visionFeatures: { ...vBack, ...vFront },
        features: hintFeatures,
        officialLabelName,
        rawProductName: productName
    });
    const strictLiquid = Boolean(labelForm.isVerifiedFromLabel && labelForm.canonicalForm === 'płyn');
    const effectivePostacHint = labelForm.isVerifiedFromLabel
        ? labelForm.canonicalForm
        : (vFront['Postać'] || hintFeatures['Postać'] || '');
    const formInfo = classifyProductPhysicalForm({
        productName,
        category: hintFeatures['Kategoria'] || product?.category?.name || '',
        postac: effectivePostacHint,
        dozownik: vFront['Dozownik'] || hintFeatures['Dozownik'] || '',
        packaging: vFront['Opakowanie (Front)'] || vBack['Opakowanie (Etykieta)'] || hintFeatures['Opakowanie produktu'] || '',
        inci: inciText,
        features: hintFeatures
    });
    if (strictLiquid && (formInfo.form === 'gel' || formInfo.form === 'cream_milk' || formInfo.form === 'unknown')) {
        formInfo.form = 'liquid';
    }

    const mappedParams = {};
    const overriddenParams = {};
    const cleanedInvalidParams = [];
    const skippedExisting = [];
    const unmatchedRequired = [];

    const hasExplicitLabelEvidence = Boolean(
        hintFeatures['_labelsPreScannedAt'] ||
        Object.keys(vFront).length > 0 ||
        Object.keys(vBack).length > 0
    );
    const verifiedLabelYield = extractVerifiedLabelYield({
        visionFront: vFront,
        visionBack: vBack,
        features: hintFeatures
    });
    const verifiedLabelCapacitySource = [
        vFront['Pojemność / Waga'],
        vFront['Pojemność'],
        vBack['Pojemność / Waga (Etykieta)'],
        hasExplicitLabelEvidence ? hintFeatures['Pojemność / Waga'] : ''
    ].filter(Boolean).join(' ').trim();
    const verifiedLabelWeightSource = [
        vFront['Waga'],
        !formInfo.hasAqueousSignal ? vFront['Pojemność / Waga'] : '',
        (!formInfo.hasAqueousSignal && hasExplicitLabelEvidence) ? hintFeatures['Pojemność / Waga'] : ''
    ].filter(Boolean).join(' ').trim();
    const verifiedLabelCountry = String(
        vFront['Kraj pochodzenia (Front)'] ||
        vFront['Kraj produkcji (Etykieta)'] ||
        vBack['Kraj pochodzenia (Etykieta)'] ||
        ''
    ).trim();
    const verifiedLabelPackaging = String(
        vFront['Opakowanie (Front)'] ||
        vBack['Opakowanie (Etykieta)'] ||
        ''
    ).trim();
    const verifiedLabelDispenser = String(
        vFront['Dozownik'] ||
        vBack['Dozownik (Etykieta)'] ||
        ''
    ).trim();
    const verifiedLabelPiecesText = [
        vFront['Liczba sztuk (Front)'],
        vBack['Liczba sztuk (Etykieta)']
    ].filter(v => v && !/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:pra[nń]|pranie|płuka[nń]|płukanie|lavaggi|washes)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(String(v))).join(' ').trim();

    const rawBrand = String(
        product?.brand?.name || hintFeatures['Marka'] || vFront['Marka'] || ''
    ).trim();
    const responsibleEntity = brandResponsibleService.findResponsibleEntity(rawBrand, productName);

    let extractedCountry = String(
        verifiedLabelCountry ||
        hintFeatures['Kraj pochodzenia'] ||
        ''
    ).trim();
    if (!extractedCountry && responsibleEntity?.address_eu) {
        const parts = String(responsibleEntity.address_eu).split(',').map(p => p.trim()).filter(Boolean);
        const last = parts[parts.length - 1];
        if (last && !/\d/.test(last) && last.length >= 3) {
            extractedCountry = last;
        }
    }

    const rawCapacityText = [
        vFront['Pojemność / Waga'],
        vFront['Pojemność'],
        vFront['Waga'],
        hintFeatures['Pojemność / Waga'],
        hintFeatures['Pojemność'],
        productName
    ].filter(Boolean).join(' ');

    const rawWeightNetText = [
        vFront['Waga'],
        hintFeatures['Waga'],
        hintFeatures['Waga produktu'],
        !formInfo.hasAqueousSignal ? vFront['Pojemność / Waga'] : '',
        !formInfo.hasAqueousSignal ? productName : ''
    ].filter(Boolean).join(' ');

    const rawGrossWeight = [
        hintFeatures['Waga brutto'],
        hintFeatures['Waga z opakowaniem'],
        product?.weight && Number(product.weight) > 0 ? `${product.weight} kg` : ''
    ].find(Boolean) || '';

    const rawPiecesExplicitText = [
        vFront['Liczba sztuk (Front)'],
        vBack['Liczba sztuk (Etykieta)'],
        hintFeatures['Liczba sztuk (Front)'],
        hintFeatures['Liczba sztuk']
    ].filter(v => v && !/(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:pra[nń]|pranie|płuka[nń]|płukanie|lavaggi|washes)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(String(v))).join(' ');
    const rawPiecesText = [rawPiecesExplicitText, productName].filter(Boolean).join(' ');

    const labelScentRaw = String(vFront['Zapach'] || vBack['Zapach (Etykieta)'] || '').trim();
    const labelScentRes = labelScentRaw ? sanitizeScentValue(labelScentRaw) : { valid: false, value: null };
    const fallbackScentRaw = String(hintFeatures['Zapach'] || hintFeatures['Nuta zapachowa'] || '').trim();
    const fallbackScentRes = fallbackScentRaw ? sanitizeScentValue(fallbackScentRaw) : { valid: false, value: null };
    const validScent = !formInfo.isArticle
        ? (labelScentRes.valid ? labelScentRes.value : (fallbackScentRes.valid ? fallbackScentRes.value : ''))
        : '';

    const variantFront = String(vFront['Wariant (Etykieta Front)'] || hintFeatures['Wariant (Etykieta Front)'] || '').trim();
    const usageTextSources = [
        vBack['Sposób użycia (Etykieta)'],
        hintFeatures['Sposób użycia (Etykieta)'],
        hintFeatures['Sposób użycia']
    ].filter(Boolean).join(' ');

    const labelClaimsText = [
        vFront['Wyróżniki (Etykieta Front)'],
        vBack['Wyróżniki / Certyfikaty (Etykieta)'],
        hintFeatures['Wyróżniki (Etykieta Front)'],
        hintFeatures['Wyróżniki / Certyfikaty (Etykieta)'],
        hintFeatures['Wyróżniki'],
        hintFeatures['Przeznaczenie (Front)'],
        hintFeatures['Przeznaczenie (Etykieta)']
    ].filter(Boolean).join(', ');

    const purposeTextSources = [
        productName,
        vFront['Przeznaczenie (Front)'],
        vBack['Przeznaczenie (Etykieta)'],
        hintFeatures['Przeznaczenie (Front)'],
        hintFeatures['Przeznaczenie (Etykieta)'],
        hintFeatures['Przeznaczenie']
    ].filter(Boolean).join(' ');

    const traitCandidates = buildCechyDodatkoweCandidates({
        productName,
        officialLabelName,
        variantFront,
        labelClaimsText,
        usageText: usageTextSources,
        inciText,
        dispenser: verifiedLabelDispenser || hintFeatures['Dozownik'] || '',
        formInfo
    });

    for (const param of schema) {
        if (!param || !param.name) continue;
        const paramName = param.name;
        const normParamName = normalizeKey(paramName);
        const allowWordBrakAsExisting = Boolean(
            Array.isArray(param.dictionary) &&
            param.dictionary.some(d => normalizeKey(d.value) === 'brak')
        );
        const isDict = param.type === 'dictionary' && Array.isArray(param.dictionary) && param.dictionary.length > 0;
        const isMulti = Boolean(param.restrictions?.multipleChoices);

        const existingKey = findExistingFeatureKey(baseFeatures, paramName);
        let overrideExistingKey = null;
        if (existingKey && !isEmptyOrPlaceholder(baseFeatures[existingKey], allowWordBrakAsExisting)) {
            const existingRawVal = baseFeatures[existingKey];
            let shouldOverrideExistingWithLabel = false;
            let overrideReason = null;

            if (labelForm.isVerifiedFromLabel && labelForm.canonicalForm && (normParamName === 'postac' || normParamName === 'typ')) {
                const currLow = String(existingRawVal).trim().toLowerCase();
                const hasHybrid = /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:płyn\s*[\/+-]?\s*żel|żel\s*[\/+-]?\s*płyn)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(currLow);
                const contradictsLiquid = labelForm.canonicalForm === 'płyn' &&
                    /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:żel|zel|w\s+żelu|krem|w\s+kremie|mleczko|proszek|w\s+proszku|puder|kapsułki|tabletki|kostka|pianka)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(currLow);
                const contradictsGel = labelForm.canonicalForm === 'żel' &&
                    /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:proszek|w\s+proszku|tabletki|kapsułki|kostka|puder)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(currLow);
                const contradictsPowder = labelForm.canonicalForm === 'proszek' &&
                    /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:płyn|w\s+płynie|żel|w\s+żelu|spray|w\s+sprayu)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(currLow);
                const contradictsSpray = labelForm.canonicalForm === 'w sprayu' &&
                    /(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(?:żel|w\s+żelu|proszek|w\s+proszku|tabletki|kapsułki|kostka)(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])/i.test(currLow);
                const notInDictionary = isDict && !param.dictionary.some(d => normalizeKey(d.value) === normalizeKey(currLow));
                if (hasHybrid || contradictsLiquid || contradictsGel || contradictsPowder || contradictsSpray || (normParamName === 'postac' && notInDictionary)) {
                    shouldOverrideExistingWithLabel = true;
                    overrideExistingKey = existingKey;
                    overrideReason = 'label_form_ssot';
                }
            } else if ((normParamName === 'liczba pran' || normParamName === 'liczba uzyc') && verifiedLabelYield.count !== null) {
                const currCount = parseQuantityToUnit(existingRawVal, param.unit || 'szt.', 'integer', { isCount: true });
                const labelCountStr = String(verifiedLabelYield.count);
                const minB = param.restrictions?.min;
                const maxB = param.restrictions?.max;
                const inBounds = (minB === undefined || verifiedLabelYield.count >= minB) && (maxB === undefined || verifiedLabelYield.count <= maxB);
                if (inBounds && currCount !== labelCountStr) {
                    shouldOverrideExistingWithLabel = true;
                    overrideExistingKey = existingKey;
                    overrideReason = `label_yield_ssot:${verifiedLabelYield.source}`;
                }
            } else if ((normParamName === 'pojemnosc' || normParamName === 'pojemnosc opakowania') && verifiedLabelCapacitySource) {
                const labelCap = parseQuantityToUnit(verifiedLabelCapacitySource, param.unit || 'l', param.type || 'float', { isVolume: true, precision: param.restrictions?.precision });
                const currNorm = normalizeNumericValueForAllegroParam(existingRawVal, param, { enforceBounds: true });
                if (labelCap && (!currNorm.ok || currNorm.value !== labelCap)) {
                    shouldOverrideExistingWithLabel = true;
                    overrideExistingKey = existingKey;
                    overrideReason = 'label_capacity_ssot';
                }
            } else if ((normParamName === 'waga' || normParamName === 'waga produktu') && !formInfo.hasAqueousSignal && verifiedLabelWeightSource) {
                const labelW = parseQuantityToUnit(verifiedLabelWeightSource, param.unit || 'kg', param.type || 'float', { isWeight: true, precision: param.restrictions?.precision });
                const currNorm = normalizeNumericValueForAllegroParam(existingRawVal, param, { enforceBounds: true });
                if (labelW && (!currNorm.ok || currNorm.value !== labelW)) {
                    shouldOverrideExistingWithLabel = true;
                    overrideExistingKey = existingKey;
                    overrideReason = 'label_weight_ssot';
                }
            } else if ((normParamName === 'kraj pochodzenia' || normParamName === 'kraj produkcji') && verifiedLabelCountry) {
                const labelCountry = isDict ? matchDictionaryOption([verifiedLabelCountry], param.dictionary) : verifiedLabelCountry;
                if (labelCountry && normalizeKey(labelCountry) !== normalizeKey(existingRawVal)) {
                    shouldOverrideExistingWithLabel = true;
                    overrideExistingKey = existingKey;
                    overrideReason = 'label_country_ssot';
                }
            } else if ((normParamName === 'opakowanie' || normParamName === 'opakowanie produktu') && verifiedLabelPackaging) {
                const labelPackCands = buildPackagingCandidates(verifiedLabelPackaging, verifiedLabelDispenser, formInfo);
                const labelPack = isDict ? matchDictionaryOption(labelPackCands, param.dictionary) : (labelPackCands[0] || null);
                if (labelPack && normalizeKey(labelPack) !== normalizeKey(existingRawVal)) {
                    shouldOverrideExistingWithLabel = true;
                    overrideExistingKey = existingKey;
                    overrideReason = 'label_packaging_ssot';
                }
            } else if ((normParamName === 'liczba sztuk w opakowaniu' || normParamName === 'liczba sztuk')) {
                const labelPieces = verifiedLabelPiecesText
                    ? parseQuantityToUnit(verifiedLabelPiecesText, 'szt.', 'integer', { isCount: true, excludeCycles: true })
                    : null;
                if (labelPieces && labelPieces !== String(existingRawVal).trim()) {
                    shouldOverrideExistingWithLabel = true;
                    overrideExistingKey = existingKey;
                    overrideReason = 'label_pieces_ssot';
                } else if (!verifiedLabelPiecesText && formInfo.form !== 'tablet' && formInfo.form !== 'capsule' &&
                    (/(?:pra[nń]|pranie|lavaggi|washes)/i.test(String(existingRawVal)) ||
                     (verifiedLabelYield.count !== null && Number(existingRawVal) === verifiedLabelYield.count && Number(existingRawVal) > 1))) {
                    shouldOverrideExistingWithLabel = true;
                    overrideExistingKey = existingKey;
                    overrideReason = 'label_pieces_not_washes_ssot';
                }
            } else if (normParamName === 'zapach' || normParamName === 'nuta zapachowa') {
                const currScent = sanitizeScentValue(existingRawVal);
                if (formInfo.isArticle || !currScent.valid) {
                    if (validScent) {
                        shouldOverrideExistingWithLabel = true;
                        overrideExistingKey = existingKey;
                        overrideReason = 'invalid_scent_replaced';
                    } else {
                        delete baseFeatures[existingKey];
                        if (existingKey !== paramName) delete baseFeatures[paramName];
                        cleanedInvalidParams.push(paramName);
                        continue;
                    }
                } else if (labelScentRes.valid && labelScentRes.value && normalizeKey(labelScentRes.value) !== normalizeKey(currScent.value)) {
                    shouldOverrideExistingWithLabel = true;
                    overrideExistingKey = existingKey;
                    overrideReason = 'label_scent_ssot';
                } else if (currScent.translated && currScent.value) {
                    const normalizedTranslated = isDict ? matchDictionaryOption([currScent.value], param.dictionary) : currScent.value;
                    if (normalizedTranslated && normalizedTranslated !== existingRawVal) {
                        const prevVal = baseFeatures[existingKey];
                        if (existingKey !== paramName) delete baseFeatures[existingKey];
                        baseFeatures[paramName] = normalizedTranslated;
                        mappedParams[paramName] = normalizedTranslated;
                        overriddenParams[paramName] = { from: prevVal, to: normalizedTranslated, reason: 'scent_translated_pl' };
                        continue;
                    }
                }
            } else if (normParamName === 'cechy dodatkowe' && isDict && isMulti && traitCandidates.length > 0) {
                const existingValidTokens = String(existingRawVal || '')
                    .split(/[,;|]/)
                    .map(s => s.trim())
                    .filter(Boolean)
                    .map(tok => matchDictionaryOption([tok], param.dictionary))
                    .filter(Boolean);
                const labelMatched = matchDictionaryOption(traitCandidates, param.dictionary, { multipleChoices: true }) || [];
                const mergedList = [];
                const seenOpt = new Set();
                for (const opt of [...existingValidTokens, ...(Array.isArray(labelMatched) ? labelMatched : [labelMatched])]) {
                    const normOpt = normalizeKey(opt);
                    if (opt && normOpt && !seenOpt.has(normOpt)) {
                        seenOpt.add(normOpt);
                        mergedList.push(opt);
                    }
                }
                const mergedStr = mergedList.join(', ');
                if (mergedList.length > 0 && normalizeKey(mergedStr) !== normalizeKey(existingRawVal)) {
                    const prevVal = baseFeatures[existingKey];
                    if (existingKey !== paramName) delete baseFeatures[existingKey];
                    baseFeatures[paramName] = mergedStr;
                    mappedParams[paramName] = mergedStr;
                    overriddenParams[paramName] = { from: prevVal, to: mergedStr, reason: 'label_traits_merged' };
                    continue;
                }
            }

            if (!shouldOverrideExistingWithLabel) {
                if (param.type === 'float' || param.type === 'integer') {
                    const normRes = normalizeNumericValueForAllegroParam(baseFeatures[existingKey], param, {
                        fallbackSources: [productName, rawCapacityText, rawWeightNetText, rawGrossWeight, rawPiecesText].filter(Boolean).join(' '),
                        enforceBounds: true
                    });
                    if (normRes.ok && normRes.value !== null) {
                        if (normRes.value !== String(baseFeatures[existingKey]).trim() || existingKey !== paramName) {
                            if (existingKey !== paramName) delete baseFeatures[existingKey];
                            baseFeatures[paramName] = normRes.value;
                            mappedParams[paramName] = normRes.value;
                        } else {
                            skippedExisting.push(paramName);
                        }
                        continue;
                    }
                    // Gdy istniejąca wartość ma niezgodną jednostkę lub śmieci tekstowe, spróbuj odzyskać czystą wartość z twardych pól poniżej
                } else {
                    skippedExisting.push(paramName);
                    continue;
                }
            } else {
                overriddenParams[paramName] = {
                    from: existingRawVal,
                    to: null,
                    reason: overrideReason || 'label_truth_override'
                };
            }
        }

        let resolvedValue = null;

        if (normParamName === 'stan') {
            resolvedValue = isDict ? matchDictionaryOption(['Nowy'], param.dictionary) : 'Nowy';
        } else if (normParamName === 'stan opakowania') {
            resolvedValue = isDict ? matchDictionaryOption(['oryginalne', 'fabryczne'], param.dictionary) : 'oryginalne';
        } else if (String(param.id) === '225693' || normParamName === 'ean gtin' || normParamName === 'ean') {
            const eanVal = String(product?.ean || baseFeatures['EAN'] || '').trim();
            if (eanVal && ean_checksum(eanVal).valid) {
                resolvedValue = eanVal;
            }
        } else if (normParamName === 'kod producenta') {
            const mpn = String(hintFeatures['Kod producenta'] || hintFeatures['MPN'] || product?.sku || product?.ean || '').trim();
            if (mpn) resolvedValue = mpn;
        } else if (String(param.id) === '248811' || normParamName === 'marka') {
            if (rawBrand) {
                resolvedValue = isDict ? matchDictionaryOption([rawBrand], param.dictionary) : rawBrand;
            }
        } else if (normParamName === 'linia' || normParamName === 'nazwa handlowa') {
            const lineCand = hintFeatures['Linia'] || product?.brand?.name || rawBrand;
            if (isDict) {
                resolvedValue = matchDictionaryOption([lineCand, 'inna', 'inny'], param.dictionary);
            } else if (hintFeatures['Linia']) {
                resolvedValue = String(hintFeatures['Linia']).trim();
            }
        } else if (normParamName === 'pojemnosc' || normParamName === 'pojemnosc opakowania') {
            const capSource = verifiedLabelCapacitySource || rawCapacityText;
            resolvedValue = parseQuantityToUnit(capSource, param.unit || 'l', param.type || 'float', { isVolume: true, precision: param.restrictions?.precision });
        } else if (normParamName === 'waga' || normParamName === 'waga produktu') {
            const weightSource = (!formInfo.hasAqueousSignal && verifiedLabelWeightSource) ? verifiedLabelWeightSource : (rawWeightNetText || rawGrossWeight);
            resolvedValue = parseQuantityToUnit(weightSource, param.unit || 'kg', param.type || 'float', { isWeight: true, precision: param.restrictions?.precision });
        } else if (String(param.id) === '17448' || normParamName === 'waga produktu z opakowaniem jednostkowym') {
            resolvedValue = parseQuantityToUnit(rawGrossWeight, param.unit || 'kg', param.type || 'float', { isWeight: true, precision: param.restrictions?.precision });
        } else if (normParamName === 'liczba sztuk w opakowaniu' || normParamName === 'liczba sztuk') {
            const parsedCount =
                parseQuantityToUnit(verifiedLabelPiecesText || rawPiecesExplicitText, 'szt.', 'integer', { isCount: true, excludeCycles: true }) ||
                parseQuantityToUnit(productName, 'szt.', 'integer', { isCount: true, excludeCycles: true, requireExplicitUnit: true });
            if (parsedCount) {
                resolvedValue = parsedCount;
            } else if (formInfo.form !== 'tablet' && formInfo.form !== 'capsule' && !/\bx\s*\d+\b|\b\d+-?pak\b/i.test(productName)) {
                resolvedValue = '1';
            }
        } else if (normParamName === 'liczba pran' || normParamName === 'liczba uzyc') {
            if (verifiedLabelYield.count !== null) {
                resolvedValue = String(verifiedLabelYield.count);
            } else {
                const rawYield = [vFront['Wydajność'], hintFeatures['Wydajność'], hintFeatures['Liczba prań'], vBack['Liczba prań (Etykieta)'], hintFeatures['Liczba prań (Etykieta)'], productName].filter(Boolean).join(' ');
                resolvedValue = parseQuantityToUnit(rawYield, 'szt.', 'integer', { isCount: true, requireExplicitUnit: true });
            }
        } else if (normParamName === 'postac') {
            const postacCandidates = buildPostacCandidates(formInfo, effectivePostacHint, { strictLiquid });
            resolvedValue = isDict ? matchDictionaryOption(postacCandidates, param.dictionary) : (postacCandidates[0] || null);
        } else if (normParamName === 'opakowanie' || normParamName === 'opakowanie produktu') {
            const packCandidates = buildPackagingCandidates(
                verifiedLabelPackaging || hintFeatures['Opakowanie (Front)'],
                verifiedLabelDispenser || hintFeatures['Dozownik'],
                formInfo
            );
            resolvedValue = isDict ? matchDictionaryOption(packCandidates, param.dictionary) : (packCandidates[0] || null);
        } else if (normParamName === 'kraj pochodzenia' || normParamName === 'kraj produkcji') {
            if (extractedCountry) {
                resolvedValue = isDict ? matchDictionaryOption([extractedCountry], param.dictionary) : extractedCountry;
            }
        } else if (normParamName === 'zapach' || normParamName === 'nuta zapachowa') {
            if (validScent) {
                resolvedValue = isDict ? matchDictionaryOption([validScent], param.dictionary) : validScent;
            }
        } else if (normParamName === 'rodzaj prania') {
            const washCandidates = buildWashTypeCandidates({ usageText: usageTextSources, purposeTextSources, productName });
            if (washCandidates.length > 0) {
                resolvedValue = isDict ? matchDictionaryOption(washCandidates, param.dictionary) : washCandidates[0];
            }
        } else if (normParamName === 'zastosowanie do') {
            const targetCandidates = buildFabricColorTargetCandidates({
                officialLabelName,
                variantFront,
                purposeTextSources,
                usageText: usageTextSources,
                productName
            });
            if (targetCandidates.length > 0) {
                if (isDict) {
                    const matched = matchDictionaryOption(targetCandidates, param.dictionary, { multipleChoices: isMulti });
                    resolvedValue = Array.isArray(matched) ? matched.join(', ') : matched;
                } else {
                    resolvedValue = targetCandidates[0];
                }
            }
        } else if (normParamName === 'rodzaj' || normParamName === 'typ' || normParamName === 'przeznaczenie' || normParamName === 'zastosowanie') {
            const candList = [
                ...buildPurposeAndTypeCandidates(purposeTextSources),
                ...buildPostacCandidates(formInfo, effectivePostacHint, { strictLiquid })
            ];
            if (isDict) {
                const matched = matchDictionaryOption(candList, param.dictionary, { multipleChoices: isMulti });
                resolvedValue = Array.isArray(matched) ? matched.join(', ') : matched;
            } else if (overrideExistingKey && labelForm.isVerifiedFromLabel && labelForm.canonicalForm) {
                resolvedValue = labelForm.canonicalForm;
            }
        } else if (normParamName === 'produkt nie zawiera') {
            if (isDict) {
                const freeFromCands = extractFreeFromDeclarations(labelClaimsText + ' ' + productName, inciText);
                if (freeFromCands.length > 0) {
                    const matched = matchDictionaryOption(freeFromCands, param.dictionary, { multipleChoices: true });
                    resolvedValue = Array.isArray(matched) ? matched.join(', ') : matched;
                }
            }
        } else if (normParamName === 'cechy dodatkowe') {
            if (isDict && traitCandidates.length > 0) {
                const matched = matchDictionaryOption(traitCandidates, param.dictionary, { multipleChoices: true });
                resolvedValue = Array.isArray(matched) ? matched.join(', ') : matched;
            }
        }

        if (resolvedValue !== null && (param.type === 'integer' || param.type === 'float')) {
            const numVal = Number(String(resolvedValue).replace(',', '.'));
            const minBound = param.restrictions?.min;
            const maxBound = param.restrictions?.max;
            if (!Number.isFinite(numVal) || (minBound !== undefined && numVal < minBound) || (maxBound !== undefined && numVal > maxBound)) {
                resolvedValue = null;
            }
        }

        if (resolvedValue !== null && resolvedValue !== undefined && String(resolvedValue).trim() !== '') {
            if (overrideExistingKey && overrideExistingKey !== paramName) {
                delete baseFeatures[overrideExistingKey];
            }
            baseFeatures[paramName] = String(resolvedValue).trim();
            mappedParams[paramName] = baseFeatures[paramName];
            if (overriddenParams[paramName]) {
                overriddenParams[paramName].to = baseFeatures[paramName];
            }
        } else {
            if (overriddenParams[paramName]) {
                delete overriddenParams[paramName];
            }
            if (param.required) {
                unmatchedRequired.push(paramName);
            }
        }
    }

    return {
        updatedFeatures: baseFeatures,
        mappedParams,
        overriddenParams,
        cleanedInvalidParams,
        skippedExisting,
        unmatchedRequired
    };
}

module.exports = {
    mapPackagingFeaturesToAllegroSchema,
    matchDictionaryOption,
    parseQuantityToUnit,
    normalizeUnitToken,
    convertBetweenUnits,
    formatNumericForAllegro,
    normalizeNumericValueForAllegroParam,
    normalizeNumericFeaturesForAllegroSchema
};
