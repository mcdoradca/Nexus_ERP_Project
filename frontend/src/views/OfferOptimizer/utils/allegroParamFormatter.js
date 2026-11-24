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
