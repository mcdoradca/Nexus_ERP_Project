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

export function normalizeParamKeyToken(value = '') {
    return String(value ?? '')
        .toLowerCase()
        .replace(/ł/g, 'l')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function normalizeUnitToken(unitRaw = '') {
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

export function convertBetweenUnits(num, srcUnitRaw = '', targetUnitRaw = '') {
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

export function formatNumericForAllegro(num, paramSchema = {}, { enforceBounds = true } = {}) {
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

export function normalizeNumericValueForAllegroParam(rawVal, paramSchema = {}, { fallbackSources = '', enforceBounds = true } = {}) {
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
        return { ok: false, value: null, converted: false, error: `Wartość „${rawStr}” musi być czystą liczbą` };
    }

    const numStr = numUnitMatch[1].replace(/\s+/g, '').replace(',', '.');
    const parsedNum = parseFloat(numStr);
    if (!Number.isFinite(parsedNum)) {
        return { ok: false, value: null, converted: false, error: `Nieprawidłowa liczba „${rawStr}”` };
    }

    const targetUnit = normalizeUnitToken(paramSchema.unit || '');
    const explicitSrcUnit = normalizeUnitToken(numUnitMatch[2] || '');
    const restrictions = paramSchema.restrictions || {};
    let convertedNum = parsedNum;

    if (explicitSrcUnit) {
        if (targetUnit && explicitSrcUnit !== targetUnit) {
            const c = convertBetweenUnits(parsedNum, explicitSrcUnit, targetUnit);
            if (c === null) {
                return { ok: false, value: null, converted: false, error: `Niezgodna jednostka „${explicitSrcUnit}” dla pola w „${targetUnit}”` };
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

export function normalizeFeaturesForAllegroSchema(features = {}, allegroSchema = [], { productName = '', visionFeatures = {} } = {}) {
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
    const featKeys = Object.keys(nextFeatures);

    for (const param of allegroSchema) {
        if (!param || !param.name || (param.type !== 'float' && param.type !== 'integer')) continue;
        const targetNorm = normalizeParamKeyToken(param.name);
        const matchedKey = featKeys.find(k => normalizeParamKeyToken(k) === targetNorm);
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

export function validateNumericAllegroParamValue(rawVal, paramSchema = {}, { fallbackSources = '' } = {}) {
    if (!paramSchema || (paramSchema.type !== 'float' && paramSchema.type !== 'integer')) {
        return { valid: true, warning: null, canAutoConvert: false, suggestedValue: null };
    }
    const rawTrim = rawVal === undefined || rawVal === null ? '' : String(rawVal).trim();
    if (!rawTrim) {
        return { valid: true, warning: null, canAutoConvert: false, suggestedValue: null };
    }

    const cleanSyntaxRe = paramSchema.type === 'integer' ? /^-?\d+$/ : /^-?\d+(?:\.\d+)?$/;
    const isCleanSyntax = cleanSyntaxRe.test(rawTrim);
    const norm = normalizeNumericValueForAllegroParam(rawTrim, paramSchema, { fallbackSources, enforceBounds: true });

    if (!isCleanSyntax) {
        return {
            valid: false,
            warning: norm.ok
                ? `Pole w Allegro przyjmuje wyłącznie czystą liczbę${paramSchema.unit ? ` (${paramSchema.unit})` : ''} — zamień na ${norm.value}`
                : (norm.error || `Wartość „${rawTrim}” nie jest poprawną liczbą`),
            canAutoConvert: Boolean(norm.ok && norm.value !== null),
            suggestedValue: norm.ok ? norm.value : null
        };
    }

    if (norm.ok && norm.value !== null && norm.value !== rawTrim) {
        return {
            valid: false,
            warning: `Wartość prawdopodobnie podana w innej jednostce niż ${paramSchema.unit || 'docelowa'} — sugerowane ${norm.value}`,
            canAutoConvert: true,
            suggestedValue: norm.value
        };
    }

    if (!norm.ok) {
        return {
            valid: false,
            warning: norm.error || 'Wartość poza dozwolonym zakresem Allegro',
            canAutoConvert: false,
            suggestedValue: null
        };
    }

    return { valid: true, warning: null, canAutoConvert: false, suggestedValue: null };
}

export function getNumericPlaceholderForParam(paramSchema = {}) {
    const unit = normalizeUnitToken(paramSchema?.unit || '');
    if (paramSchema?.type === 'integer') {
        if (unit === 'g') return 'np. 650 (liczba całkowita g)';
        if (unit === 'ml') return 'np. 600 (liczba całkowita ml)';
        if (unit === 'szt') return 'np. 1 (liczba sztuk)';
        return `np. 1 (liczba całkowita${unit ? ', ' + unit : ''})`;
    }
    if (unit === 'l') return 'np. 0.6 (czysta liczba w l, bez "ml")';
    if (unit === 'kg') return 'np. 0.65 (czysta liczba w kg, bez "kg")';
    if (unit === 'ml') return 'np. 600 (czysta liczba w ml)';
    if (unit === 'g') return 'np. 650 (czysta liczba w g)';
    return `Wpisz czystą liczbę (${paramSchema?.type || 'float'}${paramSchema?.unit ? ', ' + paramSchema.unit : ''})`;
}

const INVALID_SCENT_NORMALIZED_SET_FE = new Set([
    'soft', 'medium', 'hard', 'ultra soft', 'extra soft',
    'sredni', 'srednia', 'srednie', 'miekki', 'miekka', 'miekkie', 'twardy', 'twarda', 'twarde',
    'candeggina', 'con candeggina', 'wybielacz', 'z wybielaczem',
    'bicarbonato', 'con bicarbonato', 'soda', 'soda oczyszczona', 'z soda',
    'aceto', 'con aceto', 'ocet', 'z octem',
    'ammoniaca', 'con ammoniaca', 'amoniak', 'z amoniakiem', 'chlor',
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
    'multi', 'multiuso', 'wielofunkcyjny', 'bezzapachowy', 'bez zapachu', 'brak zapachu',
    'mocny', 'intensywny', 'lagodny', 'neutralny',
    'inne', 'inny', 'inna', 'brak', 'brak danych', 'nie dotyczy', 'null', 'n a', 'unknown', 'nieznany'
]);

const FUNCTIONAL_SCENT_SUBSTRING_FE_RE = /(?<![a-z0-9])(?:pulito\s+profondo|extra\s+smacchiante|glebokie\s+czyszczenie|dokladne\s+czyszczenie|total\s+black|profumo\s+di\s+pulito|do\s+prania|do\s+plukania|ochrona\s+kolor(?:u|ow)|usuwanie\s+plam|usuwa\s+plamy|z\s+wybielaczem|con\s+candeggina|sgrassatore)(?![a-z0-9])/i;

const ITALIAN_EN_SCENT_TRANSLATIONS_FE = {
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

export function sanitizeScentValueFrontend(rawVal = '') {
    const original = String(rawVal ?? '').replace(/\s+/g, ' ').trim();
    if (!original || original === '-') {
        return { valid: false, value: null, original, translated: false, reason: 'empty_or_placeholder' };
    }
    const norm = normalizeParamKeyToken(original);
    if (!norm) {
        return { valid: false, value: null, original, translated: false, reason: 'empty_or_placeholder' };
    }
    if (INVALID_SCENT_NORMALIZED_SET_FE.has(norm)) {
        return { valid: false, value: null, original, translated: false, reason: 'non_scent_token' };
    }
    if (FUNCTIONAL_SCENT_SUBSTRING_FE_RE.test(norm)) {
        return { valid: false, value: null, original, translated: false, reason: 'functional_claim_not_scent' };
    }
    if (Object.prototype.hasOwnProperty.call(ITALIAN_EN_SCENT_TRANSLATIONS_FE, norm)) {
        const translatedVal = ITALIAN_EN_SCENT_TRANSLATIONS_FE[norm];
        return {
            valid: true,
            value: translatedVal,
            original,
            translated: normalizeParamKeyToken(translatedVal) !== norm,
            reason: null
        };
    }
    const compoundParts = original.split(/\s+(?:e|i|&)\s+/i).map(p => p.trim()).filter(Boolean);
    if (compoundParts.length === 2) {
        const t0 = ITALIAN_EN_SCENT_TRANSLATIONS_FE[normalizeParamKeyToken(compoundParts[0])];
        const t1 = ITALIAN_EN_SCENT_TRANSLATIONS_FE[normalizeParamKeyToken(compoundParts[1])];
        if (t0 && t1) {
            return {
                valid: true,
                value: `${t0} i ${t1.charAt(0).toLowerCase() + t1.slice(1)}`,
                original,
                translated: true,
                reason: null
            };
        }
    }
    return { valid: true, value: original, original, translated: false, reason: null };
}

function findFeatureKeyNormalized(features = {}, targetNorm = '') {
    return Object.keys(features || {}).find(k => normalizeParamKeyToken(k) === targetNorm) || null;
}

function parseStrictCycleCountFrontend(raw = '') {
    const str = String(raw || '').trim();
    if (!str) return null;
    if (/\b(?:ml|cl|l|litr|g|kg|mg|dag|mm|cm)\b/i.test(str) && !/\b(?:pra[nń]|pranie|płuka[nń]|płukanie|cykl|lavaggi|washes|doz|uży[cć])/i.test(str)) {
        return null;
    }
    const m = str.match(/(?<![0-9a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ])(\d{1,4})\s*(?:pra[nń]|pranie|płuka[nń]|płukanie|cykl(?:i|e)?|lavaggi|washes|doz|uży[cć])?(?![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n >= 2 && n <= 1000 ? n : null;
}

export function extractLabelYieldCountFrontend(features = {}) {
    if (!features || typeof features !== 'object') return null;
    const directCandidates = [
        { source: 'Liczba prań (Etykieta)', raw: features['Liczba prań (Etykieta)'] },
        { source: 'Wydajność', raw: features['Wydajność'] },
        { source: 'Wydajność (Front)', raw: features['Wydajność (Front)'] }
    ];
    for (const c of directCandidates) {
        if (!c.raw) continue;
        const n = parseStrictCycleCountFrontend(c.raw);
        if (n !== null) return { count: n, source: c.source, raw: String(c.raw).trim() };
    }
    const usageSources = [
        { source: 'Sposób użycia (Etykieta)', raw: features['Sposób użycia (Etykieta)'] },
        { source: 'Sposób użycia', raw: features['Sposób użycia'] }
    ];
    for (const u of usageSources) {
        if (!u.raw) continue;
        const text = String(u.raw).replace(/\s+/g, ' ').trim();
        const m1 = text.match(/(?:standardowa\s+liczba\s+pra[nń]|standardowa\s+liczba\s+płuka[nń]|liczba\s+pra[nń]|liczba\s+płuka[nń]|wydajność|wystarcza\s+na)\s*[:=]?\s*(\d{1,4})\b/i);
        if (m1) {
            const n = parseInt(m1[1], 10);
            if (Number.isFinite(n) && n >= 2 && n <= 1000) return { count: n, source: u.source, raw: text };
        }
        const m2 = text.match(/(?:pozwala\s+na\s+wykonanie|wystarcza\s+na)\s+(?:ok\.?\s+)?(\d{1,4})\s+(?:standardowych\s+)?(?:cykl[iaey]|pra[nń]|płuka[nń])/i);
        if (m2) {
            const n = parseInt(m2[1], 10);
            if (Number.isFinite(n) && n >= 2 && n <= 1000) return { count: n, source: u.source, raw: text };
        }
    }
    return null;
}

function matchDictExactFrontend(candidate = '', dictionary = []) {
    if (!candidate || !Array.isArray(dictionary) || dictionary.length === 0) return null;
    const candNorm = normalizeParamKeyToken(candidate);
    if (!candNorm) return null;
    const exact = dictionary.find(d => d?.value && normalizeParamKeyToken(d.value) === candNorm);
    if (exact) return exact.value;
    const partial = dictionary.filter(d => {
        const dn = normalizeParamKeyToken(d?.value || '');
        return dn.length >= 3 && (dn.includes(candNorm) || candNorm.includes(dn));
    });
    return partial.length === 1 ? partial[0].value : null;
}

export function detectLabelAllegroConflicts(features = {}, allegroSchema = []) {
    if (!features || typeof features !== 'object') return [];
    const schema = Array.isArray(allegroSchema) ? allegroSchema : [];
    const conflicts = [];
    const yieldInfo = extractLabelYieldCountFrontend(features);

    for (const param of schema) {
        if (!param || !param.name) continue;
        const paramName = param.name;
        const normParam = normalizeParamKeyToken(paramName);
        const matchedKey = findFeatureKeyNormalized(features, normParam);
        const currRaw = matchedKey ? features[matchedKey] : '';
        const currStr = (currRaw !== undefined && currRaw !== null) ? String(currRaw).trim() : '';
        const hasDict = Array.isArray(param.dictionary) && param.dictionary.length > 0;

        if ((normParam === 'liczba pran' || normParam === 'liczba uzyc') && yieldInfo) {
            const targetStr = String(yieldInfo.count);
            const currNumNorm = currStr ? normalizeNumericValueForAllegroParam(currStr, param, { enforceBounds: false }) : { ok: false, value: null };
            const currComparable = currNumNorm.ok ? currNumNorm.value : currStr;
            const minB = param.restrictions?.min;
            const maxB = param.restrictions?.max;
            const inBounds = (minB === undefined || yieldInfo.count >= minB) && (maxB === undefined || yieldInfo.count <= maxB);
            if (inBounds && currComparable !== targetStr) {
                conflicts.push({
                    paramName,
                    matchedKey,
                    currentValue: currStr,
                    labelValue: targetStr,
                    labelSource: yieldInfo.source,
                    kind: currStr ? 'mismatch' : 'missing_from_label',
                    message: currStr
                        ? `${paramName}: wartość „${currStr}” jest sprzeczna z etykietą („${targetStr}” z ${yieldInfo.source})`
                        : `${paramName}: brak wartości — z etykiety wynika „${targetStr}” (${yieldInfo.source})`
                });
            }
        } else if ((normParam === 'pojemnosc' || normParam === 'pojemnosc opakowania') && features['Pojemność / Waga']) {
            const labelCapNorm = normalizeNumericValueForAllegroParam(features['Pojemność / Waga'], param, {
                fallbackSources: String(features['Pojemność / Waga']),
                enforceBounds: true
            });
            if (labelCapNorm.ok && labelCapNorm.value !== null) {
                const currCapNorm = currStr ? normalizeNumericValueForAllegroParam(currStr, param, { enforceBounds: false }) : { ok: false, value: null };
                if (!currCapNorm.ok || currCapNorm.value !== labelCapNorm.value) {
                    conflicts.push({
                        paramName,
                        matchedKey,
                        currentValue: currStr,
                        labelValue: labelCapNorm.value,
                        labelSource: 'Pojemność / Waga',
                        kind: currStr ? 'mismatch' : 'missing_from_label',
                        message: currStr
                            ? `${paramName}: „${currStr}” nie zgadza się z etykietą (${features['Pojemność / Waga']} → ${labelCapNorm.value}${param.unit ? ' ' + param.unit : ''})`
                            : `${paramName}: z etykiety wynika ${labelCapNorm.value}${param.unit ? ' ' + param.unit : ''}`
                    });
                }
            }
        } else if (normParam === 'postac') {
            const officialLabel = [
                features['Nazwa produktu (Etykieta Front)'],
                features['Nazwa produktu (Kontretykieta)'],
                features['Postać (Etykieta)']
            ].filter(Boolean).join(' ');
            const hasLiquidCategory = /(?<![a-z0-9])(?:detersivo(?:\s+liquido)?|ammorbidente(?:\s+concentrato)?|sapone\s+liquido|płyn)(?![a-z0-9])/i.test(normalizeParamKeyToken(officialLabel));
            const hasGelWord = /(?<![a-z0-9])(?:gel|żel|zel)(?![a-z0-9])/i.test(officialLabel);
            let labelFormCand = '';
            if (hasLiquidCategory && !hasGelWord) labelFormCand = 'płyn';
            else if (features['Postać (Etykieta)']) labelFormCand = String(features['Postać (Etykieta)']).trim();

            if (labelFormCand) {
                const resolvedForm = hasDict
                    ? (matchDictExactFrontend(labelFormCand, param.dictionary) ||
                       (labelFormCand === 'płyn' ? matchDictExactFrontend('w płynie', param.dictionary) : null))
                    : labelFormCand;
                const contradicts = currStr && labelFormCand === 'płyn' && /(?:żel|zel|płyn\s*[/+-]?\s*żel|proszek|kapsuł|tablet)/i.test(currStr);
                const diffFromLabel = resolvedForm && (!currStr || contradicts || normalizeParamKeyToken(currStr) !== normalizeParamKeyToken(resolvedForm));
                if (diffFromLabel && resolvedForm && (contradicts || !currStr)) {
                    conflicts.push({
                        paramName,
                        matchedKey,
                        currentValue: currStr,
                        labelValue: resolvedForm,
                        labelSource: 'Postać (Etykieta)',
                        kind: currStr ? 'mismatch' : 'missing_from_label',
                        message: currStr
                            ? `${paramName}: „${currStr}” jest sprzeczne z etykietą („${resolvedForm}”)`
                            : `${paramName}: z etykiety wynika „${resolvedForm}”`
                    });
                }
            }
        } else if (normParam === 'kraj pochodzenia' || normParam === 'kraj produkcji') {
            const labelCountry = String(
                features['Kraj pochodzenia (Front)'] ||
                features['Kraj produkcji (Etykieta)'] ||
                features['Kraj pochodzenia (Etykieta)'] ||
                ''
            ).trim();
            if (labelCountry) {
                const resolvedCountry = hasDict ? matchDictExactFrontend(labelCountry, param.dictionary) : labelCountry;
                if (resolvedCountry && normalizeParamKeyToken(resolvedCountry) !== normalizeParamKeyToken(currStr)) {
                    conflicts.push({
                        paramName,
                        matchedKey,
                        currentValue: currStr,
                        labelValue: resolvedCountry,
                        labelSource: 'Kraj pochodzenia (Etykieta)',
                        kind: currStr ? 'mismatch' : 'missing_from_label',
                        message: currStr
                            ? `${paramName}: „${currStr}” różni się od etykiety („${resolvedCountry}”)`
                            : `${paramName}: z etykiety wynika „${resolvedCountry}”`
                    });
                }
            }
        } else if ((normParam === 'zapach' || normParam === 'nuta zapachowa') && currStr) {
            const scentRes = sanitizeScentValueFrontend(currStr);
            if (!scentRes.valid) {
                conflicts.push({
                    paramName,
                    matchedKey,
                    currentValue: currStr,
                    labelValue: '',
                    labelSource: 'Walidator semantyczny',
                    kind: 'invalid_scent',
                    message: `${paramName}: wartość „${currStr}” nie jest nutą zapachową (funkcja/wariant produktu) — zalecane wyczyszczenie`
                });
            } else if (scentRes.translated && scentRes.value) {
                const resolvedScent = hasDict ? (matchDictExactFrontend(scentRes.value, param.dictionary) || scentRes.value) : scentRes.value;
                if (normalizeParamKeyToken(resolvedScent) !== normalizeParamKeyToken(currStr)) {
                    conflicts.push({
                        paramName,
                        matchedKey,
                        currentValue: currStr,
                        labelValue: resolvedScent,
                        labelSource: 'Tłumaczenie PL',
                        kind: 'translate_scent',
                        message: `${paramName}: przetłumacz nutę zapachową „${currStr}” → „${resolvedScent}”`
                    });
                }
            }
        }
    }

    return conflicts;
}

export function syncFeaturesFromLabelTruth(features = {}, allegroSchema = []) {
    if (!features || typeof features !== 'object' || Array.isArray(features)) {
        return { features: features || {}, appliedCount: 0, changes: [] };
    }
    const next = { ...features };
    const changes = [];
    const conflicts = detectLabelAllegroConflicts(next, allegroSchema);

    for (const c of conflicts) {
        if (c.matchedKey && c.matchedKey !== c.paramName) {
            delete next[c.matchedKey];
        }
        if (c.kind === 'invalid_scent' && !c.labelValue) {
            delete next[c.paramName];
            changes.push(`${c.paramName}: usunięto błędne „${c.currentValue}”`);
        } else {
            next[c.paramName] = c.labelValue;
            changes.push(`${c.paramName}: ${c.currentValue ? `„${c.currentValue}” → ` : ''}„${c.labelValue}”`);
        }
    }

    const scentKey = findFeatureKeyNormalized(next, 'zapach') || findFeatureKeyNormalized(next, 'nuta zapachowa');
    if (scentKey && next[scentKey]) {
        const scentRes = sanitizeScentValueFrontend(next[scentKey]);
        if (!scentRes.valid) {
            const oldScent = next[scentKey];
            delete next[scentKey];
            changes.push(`${scentKey}: usunięto błędne „${oldScent}”`);
        } else if (scentRes.translated && scentRes.value && scentRes.value !== next[scentKey]) {
            const oldScent = next[scentKey];
            next[scentKey] = scentRes.value;
            changes.push(`${scentKey}: „${oldScent}” → „${scentRes.value}”`);
        }
    }

    return { features: next, appliedCount: changes.length, changes };
}

export function syncLinkedFeatureOnEdit(features = {}, editedKey = '', newValue = '', allegroSchema = []) {
    const next = (features && typeof features === 'object' && !Array.isArray(features)) ? { ...features } : {};
    const strVal = (newValue === undefined || newValue === null) ? '' : String(newValue);

    if (strVal === '') {
        delete next[editedKey];
    } else {
        next[editedKey] = strVal;
    }

    const normEdited = normalizeParamKeyToken(editedKey);
    const schema = Array.isArray(allegroSchema) ? allegroSchema : [];

    if (normEdited === 'liczba pran' || normEdited === 'liczba uzyc') {
        const cleanInt = strVal.trim().match(/^\d{1,4}$/) ? parseInt(strVal.trim(), 10) : parseStrictCycleCountFrontend(strVal);
        if (cleanInt !== null && (Object.prototype.hasOwnProperty.call(next, 'Wydajność') || Object.prototype.hasOwnProperty.call(next, '_labelsPreScannedAt'))) {
            const unitLabel = /płuka/i.test(String(next['Wydajność'] || '')) ? 'płukań' : 'prań';
            next['Wydajność'] = `${cleanInt} ${unitLabel}`;
        } else if (strVal === '' && Object.prototype.hasOwnProperty.call(next, 'Wydajność')) {
            delete next['Wydajność'];
        }
    } else if (normEdited === 'wydajnosc') {
        const washParam = schema.find(p => {
            const n = normalizeParamKeyToken(p?.name || '');
            return n === 'liczba pran' || n === 'liczba uzyc';
        });
        const existingWashKey = findFeatureKeyNormalized(next, 'liczba pran') || findFeatureKeyNormalized(next, 'liczba uzyc');
        const targetWashKey = washParam?.name || existingWashKey;
        if (targetWashKey) {
            const cycleInt = parseStrictCycleCountFrontend(strVal);
            if (cycleInt !== null) {
                next[targetWashKey] = String(cycleInt);
            } else if (strVal === '') {
                delete next[targetWashKey];
            }
        }
    } else if (normEdited === 'pojemnosc waga') {
        const capParam = schema.find(p => {
            const n = normalizeParamKeyToken(p?.name || '');
            return n === 'pojemnosc' || n === 'pojemnosc opakowania';
        });
        if (capParam && strVal.trim()) {
            const capNorm = normalizeNumericValueForAllegroParam(strVal, capParam, {
                fallbackSources: strVal,
                enforceBounds: true
            });
            if (capNorm.ok && capNorm.value !== null) {
                next[capParam.name] = capNorm.value;
            }
        }
    } else if (normEdited === 'sposob uzycia' && Object.prototype.hasOwnProperty.call(next, 'Sposób użycia (Etykieta)')) {
        if (strVal === '') delete next['Sposób użycia (Etykieta)'];
        else next['Sposób użycia (Etykieta)'] = strVal;
    } else if (normEdited === 'ostrzezenia' && Object.prototype.hasOwnProperty.call(next, 'Ostrzeżenia (Etykieta)')) {
        if (strVal === '') delete next['Ostrzeżenia (Etykieta)'];
        else next['Ostrzeżenia (Etykieta)'] = strVal;
    } else if (normEdited === 'dozownik' && Object.prototype.hasOwnProperty.call(next, 'Dozownik (Etykieta)')) {
        if (strVal === '') delete next['Dozownik (Etykieta)'];
        else next['Dozownik (Etykieta)'] = strVal;
    }

    return next;
}
