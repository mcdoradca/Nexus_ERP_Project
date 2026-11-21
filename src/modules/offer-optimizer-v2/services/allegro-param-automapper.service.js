const { normalizeIngredientName } = require('../normalization');
const brandResponsibleService = require('../brand.responsible.service');
const { classifyProductPhysicalForm } = require('./product-form.classifier');
const { ean_checksum } = require('../validators');

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

/**
 * Parsuje i przelicza ilość (pojemność l/ml lub wagę kg/g lub liczbę sztuk) pod docelową jednostkę parametru Allegro.
 */
function parseQuantityToUnit(rawValue, targetUnit = '', paramType = 'float', options = {}) {
    if (rawValue === undefined || rawValue === null) return null;
    const rawStr = String(rawValue).trim();
    if (!rawStr) return null;

    const unitLower = String(targetUnit || '').toLowerCase().trim();
    const isWeightParam = Boolean(options.isWeight) || ['kg', 'g'].includes(unitLower);
    const isVolumeParam = Boolean(options.isVolume) || ['l', 'ml', 'cl'].includes(unitLower);
    const isCountParam = Boolean(options.isCount) || unitLower === 'szt.' || unitLower === 'szt';

    if (isCountParam) {
        const strippedMeasureStr = rawStr.replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|l|litr(?:y|ów|a)?|cl|g|gr|kg|cm|mm|%)\b/gi, ' ');
        const countRegex = options.requireExplicitUnit
            ? /\b(\d+)\s*(?:szt\.?|kapsuł(?:ek|ki)|tabletek|tabletki|tabs|caps|pra[nń]|pranie|płuka[nń]|płukanie|uży[cć]|użycia|cykl(?:i|e)|my[cć]|aplikacj[ie]|dozowa[nń]|wkład(?:ów|y)|chusteczek|saszetek)\b/i
            : /\b(\d+)\s*(?:szt\.?|kapsuł(?:ek|ki)|tabletek|tabletki|tabs|caps|pra[nń]|płuka[nń]|uży[cć]|wkład(?:ów|y)|chusteczek|saszetek)?\b/i;
        const countMatch = strippedMeasureStr.match(countRegex);
        if (!countMatch) return null;
        const n = parseInt(countMatch[1], 10);
        if (!Number.isFinite(n) || n <= 0 || n > 10000) return null;
        return String(n);
    }

    const matches = Array.from(rawStr.matchAll(/(\d+(?:[.,]\d+)?)\s*(ml|l|litr(?:y|ów|a)?|cl|g|gr|kg)\b/gi));
    let selectedNum = null;
    let selectedUnit = '';

    if (matches.length > 0) {
        for (const m of matches) {
            const uRaw = m[2].toLowerCase();
            const u = uRaw.startsWith('litr') ? 'l' : (uRaw === 'gr' ? 'g' : uRaw);
            if (isWeightParam && (u === 'kg' || u === 'g')) {
                selectedNum = parseFloat(m[1].replace(',', '.'));
                selectedUnit = u;
                break;
            }
            if (isVolumeParam && (u === 'ml' || u === 'l' || u === 'cl')) {
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
        if (selectedUnit === 'ml' && unitLower === 'l') converted = selectedNum / 1000;
        else if (selectedUnit === 'cl' && unitLower === 'l') converted = selectedNum / 100;
        else if (selectedUnit === 'l' && unitLower === 'ml') converted = selectedNum * 1000;
        else if (selectedUnit === 'cl' && unitLower === 'ml') converted = selectedNum * 10;
        else if (selectedUnit === 'g' && unitLower === 'kg') converted = selectedNum / 1000;
        else if (selectedUnit === 'kg' && unitLower === 'g') converted = selectedNum * 1000;
        else if (selectedUnit !== unitLower) return null;
    }

    if (paramType === 'integer') {
        return String(Math.round(converted));
    }
    const rounded = Math.round(converted * 10000) / 10000;
    return String(rounded).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
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

function buildPostacCandidates(formInfo, rawPostac = '') {
    const raw = String(rawPostac || '').trim();
    const candidates = [];
    if (raw) candidates.push(raw);

    const map = {
        spray: ['w sprayu', 'spray', 'płyn', 'w płynie'],
        gel: ['żel', 'w żelu', 'płyn', 'w płynie'],
        liquid: ['w płynie', 'płyn', 'żel'],
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
    const inciText = String(
        hintFeatures['Skład/INCI'] || vBack['Skład/INCI'] || hintFeatures['INCI'] || hintFeatures['Skład'] || ''
    ).trim();
    const formInfo = classifyProductPhysicalForm({
        productName,
        category: hintFeatures['Kategoria'] || product?.category?.name || '',
        postac: vFront['Postać'] || hintFeatures['Postać'] || '',
        dozownik: vFront['Dozownik'] || hintFeatures['Dozownik'] || '',
        packaging: vFront['Opakowanie (Front)'] || vBack['Opakowanie (Etykieta)'] || hintFeatures['Opakowanie produktu'] || '',
        inci: inciText,
        features: hintFeatures
    });

    const mappedParams = {};
    const skippedExisting = [];
    const unmatchedRequired = [];

    const rawBrand = String(
        product?.brand?.name || hintFeatures['Marka'] || vFront['Marka'] || ''
    ).trim();
    const responsibleEntity = brandResponsibleService.findResponsibleEntity(rawBrand, productName);

    let extractedCountry = String(
        hintFeatures['Kraj pochodzenia'] ||
        vFront['Kraj pochodzenia (Front)'] ||
        vBack['Kraj pochodzenia (Etykieta)'] ||
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

    const rawPiecesText = [
        vFront['Liczba sztuk (Front)'],
        vBack['Liczba sztuk (Etykieta)'],
        hintFeatures['Liczba sztuk (Front)'],
        hintFeatures['Liczba sztuk'],
        productName
    ].filter(Boolean).join(' ');

    const rawScent = String(
        hintFeatures['Zapach'] || hintFeatures['Nuta zapachowa'] || vFront['Zapach'] || ''
    ).trim();
    const validScent = rawScent &&
        !formInfo.isArticle &&
        !/^(?:soft|medium|hard|ultra\s*soft|brak|null|candeggina|wybielacz)$/i.test(rawScent)
        ? rawScent
        : '';

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

    for (const param of schema) {
        if (!param || !param.name) continue;
        const paramName = param.name;
        const normParamName = normalizeKey(paramName);
        const allowWordBrakAsExisting = Boolean(
            Array.isArray(param.dictionary) &&
            param.dictionary.some(d => normalizeKey(d.value) === 'brak')
        );

        const existingKey = findExistingFeatureKey(baseFeatures, paramName);
        if (existingKey && !isEmptyOrPlaceholder(baseFeatures[existingKey], allowWordBrakAsExisting)) {
            skippedExisting.push(paramName);
            continue;
        }

        const isDict = param.type === 'dictionary' && Array.isArray(param.dictionary) && param.dictionary.length > 0;
        const isMulti = Boolean(param.restrictions?.multipleChoices);
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
            resolvedValue = parseQuantityToUnit(rawCapacityText, param.unit || 'l', param.type || 'float', { isVolume: true });
        } else if (normParamName === 'waga' || normParamName === 'waga produktu') {
            resolvedValue = parseQuantityToUnit(rawWeightNetText || rawGrossWeight, param.unit || 'kg', param.type || 'float', { isWeight: true });
        } else if (String(param.id) === '17448' || normParamName === 'waga produktu z opakowaniem jednostkowym') {
            resolvedValue = parseQuantityToUnit(rawGrossWeight, param.unit || 'kg', param.type || 'float', { isWeight: true });
        } else if (normParamName === 'liczba sztuk w opakowaniu' || normParamName === 'liczba sztuk') {
            const parsedCount = parseQuantityToUnit(rawPiecesText, 'szt.', 'integer', { isCount: true });
            if (parsedCount) {
                resolvedValue = parsedCount;
            } else if (formInfo.form !== 'tablet' && formInfo.form !== 'capsule' && !/\bx\s*\d+\b|\b\d+-?pak\b/i.test(productName)) {
                resolvedValue = '1';
            }
        } else if (normParamName === 'liczba pran' || normParamName === 'liczba uzyc') {
            const rawYield = [vFront['Wydajność'], hintFeatures['Wydajność'], hintFeatures['Liczba prań'], productName].filter(Boolean).join(' ');
            resolvedValue = parseQuantityToUnit(rawYield, 'szt.', 'integer', { isCount: true, requireExplicitUnit: true });
        } else if (normParamName === 'postac') {
            const postacCandidates = buildPostacCandidates(formInfo, vFront['Postać'] || hintFeatures['Postać']);
            resolvedValue = isDict ? matchDictionaryOption(postacCandidates, param.dictionary) : (postacCandidates[0] || null);
        } else if (normParamName === 'opakowanie' || normParamName === 'opakowanie produktu') {
            const packCandidates = buildPackagingCandidates(
                vFront['Opakowanie (Front)'] || vBack['Opakowanie (Etykieta)'] || hintFeatures['Opakowanie (Front)'],
                vFront['Dozownik'] || hintFeatures['Dozownik'],
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
        } else if (normParamName === 'rodzaj' || normParamName === 'typ' || normParamName === 'przeznaczenie' || normParamName === 'zastosowanie') {
            const candList = [
                ...buildPurposeAndTypeCandidates(purposeTextSources),
                ...buildPostacCandidates(formInfo, vFront['Postać'] || hintFeatures['Postać'])
            ];
            if (isDict) {
                const matched = matchDictionaryOption(candList, param.dictionary, { multipleChoices: isMulti });
                resolvedValue = Array.isArray(matched) ? matched.join(', ') : matched;
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
            if (isDict) {
                const featureCands = [];
                if (formInfo.isRefill) featureCands.push('zapas');
                if (/koncentrat|concentrat/i.test(`${productName} ${labelClaimsText}`)) featureCands.push('koncentrat');
                if (/ekolog|eco|natural/i.test(labelClaimsText)) featureCands.push('ekologiczny', 'ekologiczne');
                if (/biodegradowaln/i.test(labelClaimsText)) featureCands.push('biodegradowalny');
                if (/hipoalergiczn/i.test(labelClaimsText)) featureCands.push('hipoalergiczne');
                if (/bez\s+chloru|senza\s+cloro/i.test(labelClaimsText) && !/(sodium\s+hypochlorite|troclosene)/i.test(inciText)) {
                    featureCands.push('bez chloru');
                }
                if (/bez\s+fosforan/i.test(labelClaimsText)) featureCands.push('bez fosforanów');
                if (/bez\s+wybielacza/i.test(labelClaimsText)) featureCands.push('bez wybielacza');
                if (/bez\s+smug/i.test(labelClaimsText)) featureCands.push('bez smug');
                if (/bezzapachow/i.test(labelClaimsText)) featureCands.push('bezzapachowy');
                if (/\b(?:atomizer|pompk|dozownik)\b/i.test(vFront['Dozownik'] || '') && !formInfo.isRefill) {
                    featureCands.push('dozownik');
                }
                if (/recykling/i.test(labelClaimsText)) featureCands.push('opakowanie z recyklingu');
                if (featureCands.length > 0) {
                    const matched = matchDictionaryOption(featureCands, param.dictionary, { multipleChoices: true });
                    resolvedValue = Array.isArray(matched) ? matched.join(', ') : matched;
                }
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
            baseFeatures[paramName] = String(resolvedValue).trim();
            mappedParams[paramName] = baseFeatures[paramName];
        } else if (param.required) {
            unmatchedRequired.push(paramName);
        }
    }

    return {
        updatedFeatures: baseFeatures,
        mappedParams,
        skippedExisting,
        unmatchedRequired
    };
}

module.exports = {
    mapPackagingFeaturesToAllegroSchema,
    matchDictionaryOption,
    parseQuantityToUnit
};
