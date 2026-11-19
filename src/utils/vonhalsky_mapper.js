const path = require('path');
const {
    isValidExportImageUrl,
    normalizeTextKey,
    stripHtmlAndEmoticons,
    extractSafetyInformationText,
    sanitizeHtmlForAllegroDescription,
    collectPipelineImagesForAllegro
} = require('./allegro_mapper');
const { stripRawInciFooterFromSection3 } = require('../modules/offer-optimizer-v2/normalization');
const { parseLocaleFloat, parseLocaleInt, trimOrNull } = require('./productLookup');
const BrandResponsibleService = require('../modules/offer-optimizer-v2/brand.responsible.service');

// Twarde limity i kontrakty wprost z docs/openapi.json (InPost Von Halsky API v1.7.12)
const MAX_PRODUCT_NAME_LEN = 150;
const MAX_PRODUCT_DESC_LEN = 100000;
const MAX_PRODUCT_BRAND_LEN = 100;
const MAX_PRODUCT_MODEL_LEN = 100;
const MAX_PRODUCT_SUPERMODEL_LEN = 100;
const MAX_PRODUCT_SKU_LEN = 100;
const MAX_MPN_LEN = 255;
const MAX_EAN_LEN = 14;
const MAX_EXTERNAL_ID_LEN = 255;
const MAX_ATTRIBUTES_COUNT = 120;
const MAX_ATTRIBUTE_VALUE_LEN = 1024;
const MAX_IMAGES_COUNT = 20;
const MAX_IMAGE_FILENAME_LEN = 500;
const MIN_IMAGE_FILENAME_LEN = 5;
const MAX_IMAGE_URL_LEN = 2048;
const MIN_IMAGE_URL_LEN = 9;
const MAX_UNSTRUCTURED_ADDRESS_LEN = 300;
const MAX_MANUFACTURER_FIELD_LEN = 500;
const MAX_SAFETY_INFO_LEN = 100000;
const MAX_TAX_RATE_INFO_LEN = 100;
const MIN_PRICE_AMOUNT = 0.01;
const MAX_PRICE_AMOUNT = 999999.99;
const MAX_STOCK_QTY = 999999;
const MAX_DAYS_TO_SHIP = 60;
const ALLOWED_STOCK_UNITS = ['UNIT', 'PAIR', 'SET', 'OTHER'];
const ALLOWED_DESCRIPTION_FORMATS = ['html', 'plain'];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164_PHONE_REGEX = /^\+\d{3,15}$/;
const ISO_COUNTRY_REGEX = /^[A-Z]{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const INTERNAL_FEATURE_KEYS = new Set([
    'zdjecie tylu opakowania',
    '_backimageurl',
    'backimageurl',
    'zdjecie tylu'
]);

// Słownik synonimów nazw atrybutów PL <-> EN do inteligentnego mapowania PIM -> Von Halsky
const ATTRIBUTE_ALIAS_GROUPS = [
    ['marka', 'brand', 'producent'],
    ['pojemnosc', 'pojemnosc opakowania', 'objetosc', 'volume', 'capacity'],
    ['waga', 'masa', 'waga netto', 'masa netto', 'weight', 'net weight'],
    ['waga produktu z opakowaniem jednostkowym', 'waga brutto', 'gross weight'],
    ['zapach', 'nuta zapachowa', 'aromat', 'scent', 'fragrance'],
    ['kolor', 'barwa', 'color', 'colour'],
    ['postac', 'forma', 'konsystencja', 'form', 'type'],
    ['opakowanie', 'rodzaj opakowania', 'typ opakowania', 'packaging', 'package type'],
    ['liczba sztuk', 'liczba sztuk w opakowaniu', 'ilosc sztuk', 'sztuk w opakowaniu', 'quantity', 'pieces', 'number of pieces'],
    ['liczba pran', 'ilosc pran', 'number of washes', 'washes'],
    ['przeznaczenie', 'zastosowanie', 'application', 'purpose', 'intended use'],
    ['rodzaj', 'typ', 'type', 'kind'],
    ['rodzaj skory', 'typ skory', 'skin type'],
    ['rodzaj wlosow', 'typ wlosow', 'hair type'],
    ['linia', 'seria', 'product line', 'series', 'line'],
    ['kraj pochodzenia', 'kraj produkcji', 'country of origin', 'origin'],
    ['sklad', 'skladniki', 'inci', 'ingredients', 'composition'],
    ['stan', 'stan opakowania', 'condition', 'packaging condition'],
    ['kod producenta', 'mpn', 'manufacturer product number', 'manufacturer code'],
    ['model', 'product model'],
    ['cechy dodatkowe', 'wlasciwosci', 'additional features', 'features'],
    ['dzialanie', 'action', 'effect'],
    ['plec', 'gender'],
    ['material', 'material wykonania', 'surowiec']
];

const COUNTRY_NAME_TO_ISO2 = [
    { rx: /\b(?:wlochy|włochy|italy|italia)\b/i, code: 'IT' },
    { rx: /\b(?:polska|poland|polen)\b/i, code: 'PL' },
    { rx: /\b(?:niemcy|germany|deutschland)\b/i, code: 'DE' },
    { rx: /\b(?:francja|france|frankreich)\b/i, code: 'FR' },
    { rx: /\b(?:hiszpania|spain|espana|españa)\b/i, code: 'ES' },
    { rx: /\b(?:holandia|niderlandy|netherlands|nederland)\b/i, code: 'NL' },
    { rx: /\b(?:belgia|belgium|belgique|belgie)\b/i, code: 'BE' },
    { rx: /\b(?:austria|osterreich|österreich)\b/i, code: 'AT' },
    { rx: /\b(?:czechy|czech republic|czechia)\b/i, code: 'CZ' },
    { rx: /\b(?:slowacja|słowacja|slovakia)\b/i, code: 'SK' },
    { rx: /\b(?:szwajcaria|switzerland|schweiz)\b/i, code: 'CH' },
    { rx: /\b(?:wielka brytania|united kingdom|great britain|uk|england)\b/i, code: 'GB' },
    { rx: /\b(?:irlandia|ireland)\b/i, code: 'IE' },
    { rx: /\b(?:szwecja|sweden)\b/i, code: 'SE' },
    { rx: /\b(?:dania|denmark)\b/i, code: 'DK' },
    { rx: /\b(?:portugalia|portugal)\b/i, code: 'PT' },
    { rx: /\b(?:wegry|węgry|hungary)\b/i, code: 'HU' },
    { rx: /\b(?:grecja|greece)\b/i, code: 'GR' },
    { rx: /\b(?:usa|united states|stany zjednoczone)\b/i, code: 'US' }
];

function isValidUuid(val) {
    return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

/**
 * Sprawdza format i sumę kontrolną EAN/GTIN (Modulo 10 — wymagane przez walidację InPost Von Halsky).
 */
function validateEanChecksum(rawEan) {
    const clean = String(rawEan || '').replace(/\s+/g, '').trim();
    if (!clean) {
        return { valid: false, normalized: '', warning: 'Brak kodu EAN.' };
    }
    if (!/^\d+$/.test(clean)) {
        return { valid: false, normalized: clean.slice(0, MAX_EAN_LEN), warning: `Kod EAN "${clean}" zawiera znaki inne niż cyfry.` };
    }
    if (clean.length > MAX_EAN_LEN) {
        return { valid: false, normalized: clean.slice(0, MAX_EAN_LEN), warning: `Kod EAN "${clean}" przekracza limit ${MAX_EAN_LEN} znaków.` };
    }
    if (![8, 12, 13, 14].includes(clean.length)) {
        return { valid: false, normalized: clean, warning: `Kod EAN "${clean}" ma niestandardową długość (${clean.length} cyfr — oczekiwane 8, 12, 13 lub 14).` };
    }
    const digits = clean.split('').map(Number);
    const checkDigit = digits.pop();
    let sum = 0;
    const rev = digits.slice().reverse();
    for (let i = 0; i < rev.length; i++) {
        sum += rev[i] * (i % 2 === 0 ? 3 : 1);
    }
    const expectedCheck = (10 - (sum % 10)) % 10;
    if (expectedCheck !== checkDigit) {
        return {
            valid: false,
            normalized: clean,
            warning: `Kod EAN "${clean}" ma błędną cyfrę kontrolną (oczekiwano ${expectedCheck}, jest ${checkDigit}) — API InPost może odrzucić ofertę.`
        };
    }
    return { valid: true, normalized: clean, warning: null };
}

/**
 * Normalizuje numer telefonu do wymaganego formatu OpenAPI: ^\+\d{3,15}$ (max 16 zn.).
 */
function normalizePhoneNumber(rawPhone) {
    if (!rawPhone || typeof rawPhone !== 'string') return { value: null, warning: null };
    const trimmed = rawPhone.trim();
    if (!trimmed) return { value: null, warning: null };
    let cleaned = trimmed.replace(/[\s\-().\/]/g, '');
    if (cleaned.startsWith('00')) {
        cleaned = '+' + cleaned.slice(2);
    }
    if (E164_PHONE_REGEX.test(cleaned) && cleaned.length <= 16) {
        return { value: cleaned, warning: null };
    }
    return {
        value: null,
        warning: `Numer telefonu "${trimmed}" nie spełnia formatu międzynarodowego (+48123456789) i został pominięty.`
    };
}

function extractCountryCodeFromAddress(addressStr, fallback = null) {
    if (typeof addressStr === 'string' && addressStr.trim()) {
        for (const item of COUNTRY_NAME_TO_ISO2) {
            if (item.rx.test(addressStr)) return item.code;
        }
        const tailIso = addressStr.trim().match(/(?:^|[\s,(])([A-Z]{2})(?:\)|\s*$)/);
        if (tailIso && ISO_COUNTRY_REGEX.test(tailIso[1])) {
            return tailIso[1];
        }
    }
    return fallback && ISO_COUNTRY_REGEX.test(String(fallback).toUpperCase()) ? String(fallback).toUpperCase() : null;
}

/**
 * Konwertuje wymiary PIM (cm, kg) na kontrakt OpenAPI `Dimension` (int32 mm, g).
 */
function buildVonHalskyDimensions({
    weightKg = null,
    widthCm = null,
    heightCm = null,
    lengthCm = null,
    overrideDimension = null,
    fallbackDimension = null
} = {}) {
    const warnings = [];
    const dim = {};

    const resolveIntField = ({ explicitVal, pimVal, multiplier, min, max, fieldName, pimUnit, apiUnit }) => {
        if (explicitVal !== undefined && explicitVal !== null && String(explicitVal).trim() !== '') {
            const parsed = parseLocaleInt(explicitVal);
            if (parsed !== null && parsed >= min && parsed <= max) {
                dim[fieldName] = parsed;
                return;
            }
            warnings.push(`Pole dimension.${fieldName} ("${explicitVal}") poza zakresem ${min}..${max} ${apiUnit} — pominięto.`);
            return;
        }

        const pimNum = parseLocaleFloat(pimVal);
        if (pimNum !== null && pimNum > 0) {
            const converted = Math.round(pimNum * multiplier);
            if (converted >= min && converted <= max) {
                dim[fieldName] = converted;
                return;
            }
            warnings.push(`Przeliczone dimension.${fieldName} (${pimNum} ${pimUnit} -> ${converted} ${apiUnit}) przekracza limit ${min}..${max} ${apiUnit} — pominięto.`);
            return;
        }

        if (fallbackDimension && Number.isInteger(fallbackDimension[fieldName]) && fallbackDimension[fieldName] >= min && fallbackDimension[fieldName] <= max) {
            dim[fieldName] = fallbackDimension[fieldName];
        }
    };

    resolveIntField({
        explicitVal: overrideDimension?.width,
        pimVal: widthCm,
        multiplier: 10,
        min: 1,
        max: 10000,
        fieldName: 'width',
        pimUnit: 'cm',
        apiUnit: 'mm'
    });
    resolveIntField({
        explicitVal: overrideDimension?.height,
        pimVal: heightCm,
        multiplier: 10,
        min: 1,
        max: 10000,
        fieldName: 'height',
        pimUnit: 'cm',
        apiUnit: 'mm'
    });
    resolveIntField({
        explicitVal: overrideDimension?.length,
        pimVal: lengthCm,
        multiplier: 10,
        min: 1,
        max: 10000,
        fieldName: 'length',
        pimUnit: 'cm',
        apiUnit: 'mm'
    });
    resolveIntField({
        explicitVal: overrideDimension?.weight,
        pimVal: weightKg,
        multiplier: 1000,
        min: 1,
        max: 1000000,
        fieldName: 'weight',
        pimUnit: 'kg',
        apiUnit: 'g'
    });

    return {
        dimension: Object.keys(dim).length > 0 ? dim : undefined,
        warnings
    };
}

/**
 * Składa opis oferty Von Halsky z modułów sprzedażowych 1..5 oraz 7 (bez Sekcji 6 GPSR!).
 * Wspiera format 'html' (bezpieczne semantyczne tagi) oraz 'plain' (czysty tekst strukturalny).
 */
function buildVonHalskyDescription({
    htmlContent = null,
    descriptionHtml = '',
    customDescription = null,
    format = 'html'
} = {}) {
    const warnings = [];
    const safeFormat = ALLOWED_DESCRIPTION_FORMATS.includes(String(format || '').toLowerCase())
        ? String(format).toLowerCase()
        : 'html';

    if (typeof customDescription === 'string' && customDescription.trim().length > 0) {
        let out = safeFormat === 'html'
            ? sanitizeHtmlForAllegroDescription(customDescription)
            : stripHtmlAndEmoticons(customDescription);
        if (out.length > MAX_PRODUCT_DESC_LEN) {
            out = out.slice(0, MAX_PRODUCT_DESC_LEN).trim();
            warnings.push(`Opis został przycięty do limitu ${MAX_PRODUCT_DESC_LEN} znaków.`);
        }
        return { description: out, format: safeFormat, sectionsCount: 1, source: 'custom', warnings };
    }

    const blocks = [];
    let source = 'empty';

    if (htmlContent && typeof htmlContent === 'object') {
        const rawSec = [
            htmlContent.sekcja1 || htmlContent.section_1_html || '',
            htmlContent.sekcja2 || htmlContent.section_2_html || '',
            stripRawInciFooterFromSection3(htmlContent.sekcja3 || htmlContent.section_3_html || ''),
            htmlContent.sekcja4 || htmlContent.section_4_html || '',
            htmlContent.sekcja5 || htmlContent.section_5_html || '',
            htmlContent.sekcja7 || htmlContent.section_7_html || ''
        ];
        for (const chunk of rawSec) {
            if (!chunk || typeof chunk !== 'string') continue;
            const cleaned = safeFormat === 'html'
                ? sanitizeHtmlForAllegroDescription(chunk)
                : stripHtmlAndEmoticons(chunk);
            if (cleaned && cleaned.trim()) {
                blocks.push(cleaned.trim());
            }
        }
        if (blocks.length > 0) source = 'offerDraft.sections';
    }

    if (blocks.length === 0 && typeof descriptionHtml === 'string' && descriptionHtml.trim()) {
        const cleaned = safeFormat === 'html'
            ? sanitizeHtmlForAllegroDescription(descriptionHtml)
            : stripHtmlAndEmoticons(descriptionHtml);
        if (cleaned && cleaned.trim()) {
            blocks.push(cleaned.trim());
            source = 'product.descriptionHtml';
        }
    }

    const separator = safeFormat === 'html' ? '\n' : '\n\n';
    let finalDesc = blocks.join(separator).trim();

    if (finalDesc.length > MAX_PRODUCT_DESC_LEN) {
        finalDesc = finalDesc.slice(0, MAX_PRODUCT_DESC_LEN).trim();
        warnings.push(`Opis przekraczał limit ${MAX_PRODUCT_DESC_LEN} znaków i został bezpiecznie przycięty.`);
    }

    return {
        description: finalDesc,
        format: safeFormat,
        sectionsCount: blocks.length,
        source,
        warnings
    };
}

/**
 * Buduje bezpieczną nazwę pliku spełniającą OpenAPI `Image.fileName` (5..500 znaków, poprawne rozszerzenie).
 */
function buildSafeImageFileName(source, priority = 1) {
    const fallbackName = `product_image_${String(priority).padStart(2, '0')}.jpg`;
    if (!source || typeof source !== 'string') return fallbackName;

    if (source.startsWith('data:image/')) {
        const mimeMatch = source.match(/^data:image\/([a-z0-9.+-]+);base64,/i);
        let ext = mimeMatch ? mimeMatch[1].toLowerCase() : 'jpg';
        if (ext === 'jpeg') ext = 'jpg';
        if (!['jpg', 'png', 'webp', 'gif'].includes(ext)) ext = 'jpg';
        return `product_image_${String(priority).padStart(2, '0')}.${ext}`;
    }

    try {
        const parsed = new URL(source);
        const rawBase = path.basename(parsed.pathname || '').replace(/[^a-zA-Z0-9._-]/g, '_');
        if (rawBase && rawBase.length >= MIN_IMAGE_FILENAME_LEN && /\.(?:jpe?g|png|webp|gif)$/i.test(rawBase)) {
            return rawBase.slice(0, MAX_IMAGE_FILENAME_LEN);
        }
        if (rawBase && rawBase.length >= 2) {
            const candidate = `${rawBase}.jpg`;
            if (candidate.length >= MIN_IMAGE_FILENAME_LEN) {
                return candidate.slice(0, MAX_IMAGE_FILENAME_LEN);
            }
        }
    } catch (_) {
        // fallback poniżej
    }
    return fallbackName;
}

/**
 * Zbiera i klasyfikuje zdjęcia produktu dla Von Halsky:
 * - publiczne `https://` -> trafiają do `OfferProposal.images` / `OfferPatch.images`
 * - `data:image/...` lub `http://` -> trafiają do kolejki `binaryAttachments` (upload `POST /attachments?attachmentType=IMAGE`)
 */
function collectVonHalskyImages({
    draftImages = [],
    productImageUrl = null,
    productImages = [],
    maxImages = MAX_IMAGES_COUNT
} = {}) {
    const warnings = [];
    const collected = collectPipelineImagesForAllegro({
        draftImages,
        productImageUrl,
        productImages,
        maxImages
    });

    if (collected.overflowCount > 0) {
        warnings.push(`Wykryto ${collected.totalFound} zdjęć — Von Halsky obsługuje maksymalnie ${maxImages} zdjęć (pominięto ${collected.overflowCount}).`);
    }

    const allItems = [];
    const httpsImages = [];
    const binaryAttachments = [];

    collected.images.forEach((img, idx) => {
        const priority = idx + 1;
        const source = String(img.source || '').trim();
        const fileName = buildSafeImageFileName(source, priority);

        if (source.startsWith('https://') && source.length >= MIN_IMAGE_URL_LEN && source.length <= MAX_IMAGE_URL_LEN) {
            const entry = { fileName, fileUrl: source, priority };
            httpsImages.push(entry);
            allItems.push({
                priority,
                fileName,
                source,
                transport: 'HTTPS_URL',
                isAiCoCreated: Boolean(img.isAiCoCreated)
            });
            return;
        }

        if (source.startsWith('data:image/') || source.startsWith('http://')) {
            const reason = source.startsWith('data:image/')
                ? 'Obraz Base64 (lokalny/AI) — zostanie wgrany binarnie przez /attachments.'
                : 'Adres HTTP bez TLS — zostanie pobrany i wgrany binarnie przez /attachments.';
            binaryAttachments.push({
                priority,
                fileName,
                source,
                reason
            });
            allItems.push({
                priority,
                fileName,
                source,
                transport: 'BINARY_ATTACHMENT',
                reason,
                isAiCoCreated: Boolean(img.isAiCoCreated)
            });
            return;
        }

        warnings.push(`Pominięto zdjęcie #${priority} — nieobsługiwany lub zbyt długi adres URL.`);
    });

    if (binaryAttachments.length > 0) {
        warnings.push(`${binaryAttachments.length} zdj. (Base64/HTTP) zostanie przesłanych po utworzeniu/aktualizacji oferty przez binarny endpoint POST /offers/{offerId}/attachments.`);
    }

    return {
        allItems,
        httpsImages,
        binaryAttachments,
        totalCount: allItems.length,
        warnings
    };
}

/**
 * Przelicza wartość numeryczną z PIM (np. "1,5 kg", "1000 ml") pod jednostkę z `AttributeUnitOfMeasureDetails`.
 */
function convertValueToVonHalskyUnit(rawValue, unitOfMeasureDetails) {
    if (rawValue === undefined || rawValue === null) return null;
    const str = String(rawValue).trim();
    if (!str) return null;

    const match = str.match(/(-?\d+(?:[.,]\d+)?)\s*([a-zA-Ząćęłńóśźżµμ]+)?/);
    if (!match) return null;

    const num = parseLocaleFloat(match[1]);
    if (num === null) return null;

    const srcUnit = (match[2] || '').toLowerCase();
    const targetCode = String(unitOfMeasureDetails?.code || '').toUpperCase();
    const targetSymbol = String(unitOfMeasureDetails?.symbol || '').toLowerCase();

    if (!srcUnit || (!targetCode && !targetSymbol)) {
        return num;
    }

    const isTargetGram = targetCode === 'GRAM' || targetSymbol === 'g';
    const isTargetKg = targetCode === 'KILOGRAM' || targetSymbol === 'kg';
    const isTargetMl = targetCode === 'MILLILITER' || targetCode === 'MILLILITRE' || targetSymbol === 'ml';
    const isTargetL = targetCode === 'LITER' || targetCode === 'LITRE' || targetSymbol === 'l';
    const isTargetMm = targetCode === 'MILLIMETER' || targetCode === 'MILLIMETRE' || targetSymbol === 'mm';
    const isTargetCm = targetCode === 'CENTIMETER' || targetCode === 'CENTIMETRE' || targetSymbol === 'cm';
    const isTargetM = targetCode === 'METER' || targetCode === 'METRE' || targetSymbol === 'm';

    if (isTargetGram && srcUnit === 'kg') return Number((num * 1000).toFixed(4));
    if (isTargetKg && srcUnit === 'g') return Number((num / 1000).toFixed(4));
    if (isTargetMl && srcUnit === 'l') return Number((num * 1000).toFixed(4));
    if (isTargetL && srcUnit === 'ml') return Number((num / 1000).toFixed(4));
    if (isTargetMm && srcUnit === 'cm') return Number((num * 10).toFixed(4));
    if (isTargetMm && srcUnit === 'm') return Number((num * 1000).toFixed(4));
    if (isTargetCm && srcUnit === 'mm') return Number((num / 10).toFixed(4));
    if (isTargetCm && srcUnit === 'm') return Number((num * 100).toFixed(4));
    if (isTargetM && srcUnit === 'cm') return Number((num / 100).toFixed(4));
    if (isTargetM && srcUnit === 'mm') return Number((num / 1000).toFixed(4));

    return num;
}

function getAttributeNameCandidates(attrName) {
    const norm = normalizeTextKey(attrName);
    const out = new Set([norm]);
    for (const group of ATTRIBUTE_ALIAS_GROUPS) {
        if (group.some(alias => normalizeTextKey(alias) === norm)) {
            group.forEach(alias => out.add(normalizeTextKey(alias)));
        }
    }
    return Array.from(out);
}

function findFeatureValueForAttribute(attrDef, cleanFeaturesMap, product) {
    const candidates = getAttributeNameCandidates(attrDef.name || '');

    for (const cand of candidates) {
        if (cleanFeaturesMap.has(cand)) {
            return { value: cleanFeaturesMap.get(cand), source: 'pim.features' };
        }
    }

    // Fallback częściowego dopasowania (np. "Pojemność (ml)" vs "Pojemność")
    for (const [fKey, fVal] of cleanFeaturesMap.entries()) {
        if (candidates.some(cand => cand.length >= 4 && (fKey === cand || fKey.startsWith(cand + ' ') || cand.startsWith(fKey + ' ')))) {
            return { value: fVal, source: 'pim.features.fuzzy' };
        }
    }

    // Fallback z pól bazowych produktu PIM
    if (product) {
        if (candidates.includes('marka') || candidates.includes('brand')) {
            const b = product.brand?.name || product.brandName || '';
            if (b) return { value: String(b).trim(), source: 'product.brand' };
        }
        if ((candidates.includes('waga') || candidates.includes('weight')) && product.weight) {
            return { value: `${product.weight} kg`, source: 'product.weight' };
        }
    }

    return { value: null, source: null };
}

function formatAttributeValuesForDefinition(attrDef, rawInput) {
    const rawList = Array.isArray(rawInput)
        ? rawInput.map(v => String(v ?? '').trim()).filter(Boolean)
        : (rawInput !== undefined && rawInput !== null && String(rawInput).trim() !== ''
            ? [String(rawInput).trim()]
            : []);

    if (rawList.length === 0) {
        return { values: [], warning: null, invalidDictionary: false };
    }

    const type = String(attrDef.type || 'TEXT_VALUE').toUpperCase();
    const expected = String(attrDef.expectedValue || 'ANY').toUpperCase();
    const isMulti = expected === 'AT_LEAST_ONE' || expected === 'ANY';

    // Dla multiselect rozbijamy po przecinku/średniku jeśli przekazano pojedynczy string
    const expanded = (isMulti && rawList.length === 1 && type === 'DICTIONARY' && /[,;|]/.test(rawList[0]))
        ? rawList[0].split(/[,;|]/).map(s => s.trim()).filter(Boolean)
        : rawList;

    if (type === 'DICTIONARY') {
        const activeOptions = (attrDef.dictionary?.options || []).filter(o => o && o.active !== false);
        const byNormVal = new Map();
        const byId = new Map();
        for (const opt of activeOptions) {
            byNormVal.set(normalizeTextKey(opt.value), opt.value);
            if (opt.id) byId.set(String(opt.id).toLowerCase(), opt.value);
        }

        const matched = [];
        const unmatched = [];
        for (const item of expanded) {
            const byOptId = byId.get(item.toLowerCase());
            if (byOptId) {
                if (!matched.includes(byOptId)) matched.push(byOptId);
                continue;
            }
            const exact = byNormVal.get(normalizeTextKey(item));
            if (exact) {
                if (!matched.includes(exact)) matched.push(exact);
                continue;
            }
            unmatched.push(item);
        }

        const limited = isMulti ? matched : matched.slice(0, 1);
        if (limited.length === 0 && unmatched.length > 0) {
            return {
                values: [],
                warning: `Wartość "${unmatched.join(', ')}" nie występuje w słowniku atrybutu "${attrDef.name}".`,
                invalidDictionary: true
            };
        }
        return {
            values: limited,
            warning: unmatched.length > 0
                ? `Pominięto nieobsługiwane opcje słownika dla "${attrDef.name}": ${unmatched.join(', ')}.`
                : null,
            invalidDictionary: false
        };
    }

    if (type === 'NUMERIC' || type === 'NUMERIC_FLOAT') {
        const converted = [];
        const bad = [];
        for (const item of expanded) {
            const num = convertValueToVonHalskyUnit(item, attrDef.unitOfMeasureDetails);
            if (num === null || !Number.isFinite(num)) {
                bad.push(item);
                continue;
            }
            if (type === 'NUMERIC') {
                converted.push(String(Math.round(num)));
            } else {
                const formatted = String(Number(num.toFixed(4)));
                converted.push(formatted);
            }
        }
        const limited = isMulti ? converted : converted.slice(0, 1);
        return {
            values: limited,
            warning: bad.length > 0 ? `Nieprawidłowa wartość liczbowa "${bad.join(', ')}" dla atrybutu "${attrDef.name}".` : null,
            invalidDictionary: false
        };
    }

    if (type === 'DATE') {
        const validDates = [];
        const bad = [];
        for (const item of expanded) {
            if (ISO_DATE_REGEX.test(item)) {
                validDates.push(item);
            } else {
                const parsed = new Date(item);
                if (!Number.isNaN(parsed.getTime())) {
                    validDates.push(parsed.toISOString().slice(0, 10));
                } else {
                    bad.push(item);
                }
            }
        }
        const limited = isMulti ? validDates : validDates.slice(0, 1);
        return {
            values: limited,
            warning: bad.length > 0 ? `Nieprawidłowa data "${bad.join(', ')}" dla atrybutu "${attrDef.name}" (wymagany format YYYY-MM-DD).` : null,
            invalidDictionary: false
        };
    }

    if (type === 'URL') {
        const validUrls = expanded.filter(u => /^https?:\/\/.+/i.test(u)).map(u => u.slice(0, MAX_ATTRIBUTE_VALUE_LEN));
        const limited = isMulti ? validUrls : validUrls.slice(0, 1);
        return {
            values: limited,
            warning: validUrls.length < expanded.length ? `Pominięto nieprawidłowy adres URL w atrybucie "${attrDef.name}".` : null,
            invalidDictionary: false
        };
    }

    // TEXT_VALUE / LONG_TEXT_VALUE
    const cleanTexts = expanded.map(v => v.slice(0, MAX_ATTRIBUTE_VALUE_LEN)).filter(Boolean);
    const limited = isMulti ? cleanTexts : cleanTexts.slice(0, 1);
    return { values: limited, warning: null, invalidDictionary: false };
}

/**
 * Mapuje cechy PIM + podpowiedzi katalogowe + nadpisania operatora na tablicę `AttributeValue[]`
 * oraz szczegółową diagnostykę do modalu Pre-flight.
 */
function mapVonHalskyAttributes({
    attributeDefinitions = [],
    productFeatures = {},
    product = null,
    hintAttributes = [],
    existingOfferAttributes = [],
    overrides = null
} = {}) {
    const errors = [];
    const warnings = [];
    const mappedAttributes = [];
    const attributePreview = [];

    const cleanFeaturesMap = new Map();
    if (productFeatures && typeof productFeatures === 'object' && !Array.isArray(productFeatures)) {
        for (const [k, v] of Object.entries(productFeatures)) {
            const normK = normalizeTextKey(k);
            if (!normK || INTERNAL_FEATURE_KEYS.has(normK)) continue;
            if (typeof v === 'string' && v.trim().startsWith('data:image/')) continue;
            if (v === undefined || v === null || String(v).trim() === '') continue;
            cleanFeaturesMap.set(normK, String(v).trim());
        }
    }

    const existingById = new Map();
    if (Array.isArray(existingOfferAttributes)) {
        for (const attr of existingOfferAttributes) {
            if (attr?.id && Array.isArray(attr.values) && attr.values.length > 0) {
                existingById.set(String(attr.id), attr.values.map(v => String(v)));
            }
        }
    }

    const hintById = new Map();
    if (Array.isArray(hintAttributes)) {
        for (const attr of hintAttributes) {
            if (attr?.id && Array.isArray(attr.values) && attr.values.length > 0) {
                hintById.set(String(attr.id), attr.values.map(v => String(v)));
            }
        }
    }

    const safeOverrides = overrides && typeof overrides === 'object' ? overrides : {};

    for (const def of (Array.isArray(attributeDefinitions) ? attributeDefinitions : [])) {
        if (!def || !def.id) continue;
        const attrId = String(def.id);
        const expected = String(def.expectedValue || 'ANY').toUpperCase();
        const required = expected === 'ONE' || expected === 'AT_LEAST_ONE';
        const multi = expected === 'AT_LEAST_ONE' || expected === 'ANY';

        const currentValues = existingById.get(attrId) || [];
        let rawVal = null;
        let source = null;

        if (Object.prototype.hasOwnProperty.call(safeOverrides, attrId)) {
            const ov = safeOverrides[attrId];
            const hasOv = Array.isArray(ov) ? ov.some(x => String(x || '').trim() !== '') : String(ov ?? '').trim() !== '';
            if (hasOv) {
                rawVal = ov;
                source = 'ui.override';
            } else {
                rawVal = null;
                source = 'ui.cleared';
            }
        } else {
            const fromPim = findFeatureValueForAttribute(def, cleanFeaturesMap, product);
            if (fromPim.value !== null) {
                rawVal = fromPim.value;
                source = fromPim.source;
            } else if (currentValues.length > 0) {
                rawVal = currentValues;
                source = 'existingOffer';
            } else if (hintById.has(attrId)) {
                rawVal = hintById.get(attrId);
                source = 'inpost.hint';
            }
        }

        const formatted = formatAttributeValuesForDefinition(def, rawVal);
        let status = 'OK';
        if (formatted.warning) {
            warnings.push(formatted.warning);
        }

        if (formatted.values.length > 0) {
            const payloadItem = {
                id: attrId,
                values: formatted.values
            };
            if (def.lang) {
                payloadItem.lang = def.lang;
            }
            mappedAttributes.push(payloadItem);
        } else if (required) {
            status = formatted.invalidDictionary ? 'INVALID_DICTIONARY' : 'MISSING_REQUIRED';
            errors.push(`Brak wymaganego atrybutu kategorii Von Halsky: "${def.name}" (${def.type}).`);
        } else {
            status = formatted.invalidDictionary ? 'INVALID_DICTIONARY' : 'UNMAPPED_OPTIONAL';
        }

        attributePreview.push({
            id: attrId,
            name: def.name || attrId,
            description: def.description || '',
            type: def.type || 'TEXT_VALUE',
            expectedValue: expected,
            required,
            multi,
            lang: def.lang || null,
            unit: def.unitOfMeasureDetails || null,
            options: Array.isArray(def.dictionary?.options)
                ? def.dictionary.options.filter(o => o && o.active !== false).map(o => ({ id: o.id, value: o.value }))
                : [],
            currentValues,
            proposedValues: formatted.values,
            source,
            status,
            warning: formatted.warning || null
        });
    }

    if (mappedAttributes.length > MAX_ATTRIBUTES_COUNT) {
        warnings.push(`Liczba atrybutów (${mappedAttributes.length}) przekroczyła limit API (${MAX_ATTRIBUTES_COUNT}) — zachowano pierwsze ${MAX_ATTRIBUTES_COUNT}.`);
    }

    const finalAttributes = mappedAttributes.slice(0, MAX_ATTRIBUTES_COUNT);
    const patchOperations = finalAttributes.map(a => ({
        type: 'upsert',
        id: a.id,
        ...(a.lang ? { lang: a.lang } : {}),
        values: a.values
    }));

    return {
        attributes: finalAttributes,
        patchOperations,
        attributePreview,
        requiredTotal: attributePreview.filter(a => a.required).length,
        requiredFilled: attributePreview.filter(a => a.required && a.proposedValues.length > 0).length,
        errors,
        warnings
    };
}

/**
 * Buduje zgodny z OpenAPI v1.7.12 obiekt `GpsrInfo` (z użyciem `responsiblePersonDetails`, bez deprecated `responsiblePerson`).
 */
function buildVonHalskyGpsr({
    categoryRequiresGpsr = true,
    gpsrOverride = null,
    hintGpsr = null,
    existingOfferGpsr = null,
    defaultConfig = null,
    product = null,
    htmlContent = null,
    descriptionHtml = '',
    features = {}
} = {}) {
    const errors = [];
    const warnings = [];
    const ov = gpsrOverride && typeof gpsrOverride === 'object' ? gpsrOverride : {};
    const firstHintGpsr = Array.isArray(hintGpsr) ? (hintGpsr[0] || null) : (hintGpsr && typeof hintGpsr === 'object' ? hintGpsr : null);

    const doesNotRequireGpsrInfo = typeof ov.doesNotRequireGpsrInfo === 'boolean'
        ? ov.doesNotRequireGpsrInfo
        : (!categoryRequiresGpsr);

    // 1. Informacje o bezpieczeństwie (czyste ostrzeżenia z Sekcji 6 / PIM Ostrzeżenia bez emotikonów)
    const extractedSafety = extractSafetyInformationText({
        htmlContent,
        descriptionHtml,
        features
    });

    const safetyInformation = trimOrNull(
        ov.safetyInformation !== undefined
            ? ov.safetyInformation
            : (extractedSafety.text || existingOfferGpsr?.safetyInformation || firstHintGpsr?.safetyInformation || '')
    );

    // 2. Podmiot odpowiedzialny / producent z lokalnego rejestru marek
    const brandName = trimOrNull(product?.brand?.name || product?.brandName || features?.Marka || '');
    const registryEntity = BrandResponsibleService.findResponsibleEntity(brandName || '', product?.name || '');

    const ovMfr = ov.manufacturer && typeof ov.manufacturer === 'object' ? ov.manufacturer : {};
    const existingMfr = existingOfferGpsr?.manufacturer && typeof existingOfferGpsr.manufacturer === 'object' ? existingOfferGpsr.manufacturer : {};
    const hintMfr = firstHintGpsr?.manufacturer && typeof firstHintGpsr.manufacturer === 'object' ? firstHintGpsr.manufacturer : {};

    const mfrName = trimOrNull(
        ovMfr.name !== undefined
            ? ovMfr.name
            : (existingMfr.name || hintMfr.name || registryEntity?.name || '')
    );
    const mfrEmail = trimOrNull(
        ovMfr.email !== undefined
            ? ovMfr.email
            : (existingMfr.email || hintMfr.email || defaultConfig?.defaultManufacturerEmail || '')
    );
    const mfrRawPhone = ovMfr.phone !== undefined
        ? ovMfr.phone
        : (existingMfr.phone || hintMfr.phone || defaultConfig?.defaultManufacturerPhone || '');
    const normalizedMfrPhone = normalizePhoneNumber(mfrRawPhone);
    if (normalizedMfrPhone.warning) warnings.push(`GPSR producent: ${normalizedMfrPhone.warning}`);

    const mfrUnstructuredAddress = trimOrNull(
        ovMfr.unstructuredAddress !== undefined
            ? ovMfr.unstructuredAddress
            : (existingMfr.unstructuredAddress || hintMfr.unstructuredAddress || registryEntity?.address_eu || '')
    );
    const mfrCountry = trimOrNull(
        ovMfr.countryCode !== undefined
            ? ovMfr.countryCode
            : (existingMfr.countryCode || hintMfr.countryCode || extractCountryCodeFromAddress(mfrUnstructuredAddress, 'PL') || '')
    );

    // 3. ResponsiblePersonDetails (zastępuje deprecated manufacturer.responsiblePerson)
    const ovResp = ovMfr.responsiblePersonDetails && typeof ovMfr.responsiblePersonDetails === 'object'
        ? ovMfr.responsiblePersonDetails
        : {};
    const existingResp = existingMfr.responsiblePersonDetails || {};
    const hintResp = hintMfr.responsiblePersonDetails || {};

    const respName = trimOrNull(ovResp.name !== undefined ? ovResp.name : (existingResp.name || hintResp.name || ''));
    const respEmail = trimOrNull(ovResp.email !== undefined ? ovResp.email : (existingResp.email || hintResp.email || ''));
    const respPhoneNorm = normalizePhoneNumber(ovResp.phone !== undefined ? ovResp.phone : (existingResp.phone || hintResp.phone || ''));
    if (respPhoneNorm.warning) warnings.push(`GPSR osoba odpowiedzialna UE: ${respPhoneNorm.warning}`);
    const respAddress = trimOrNull(ovResp.unstructuredAddress !== undefined ? ovResp.unstructuredAddress : (existingResp.unstructuredAddress || hintResp.unstructuredAddress || ''));
    const respCountry = trimOrNull(
        ovResp.countryCode !== undefined
            ? ovResp.countryCode
            : (existingResp.countryCode || hintResp.countryCode || extractCountryCodeFromAddress(respAddress, null) || '')
    );

    let responsiblePersonDetails;
    if (respName || respEmail || respAddress || respPhoneNorm.value) {
        responsiblePersonDetails = {};
        if (respName) responsiblePersonDetails.name = respName.slice(0, MAX_MANUFACTURER_FIELD_LEN);
        if (respEmail) {
            if (EMAIL_REGEX.test(respEmail)) {
                responsiblePersonDetails.email = respEmail.slice(0, MAX_MANUFACTURER_FIELD_LEN);
            } else {
                errors.push(`Nieprawidłowy adres e-mail osoby odpowiedzialnej GPSR: "${respEmail}".`);
            }
        }
        if (respPhoneNorm.value) responsiblePersonDetails.phone = respPhoneNorm.value;
        if (respCountry && ISO_COUNTRY_REGEX.test(respCountry.toUpperCase())) {
            responsiblePersonDetails.countryCode = respCountry.toUpperCase();
        }
        if (respAddress) {
            responsiblePersonDetails.unstructuredAddress = respAddress.slice(0, MAX_UNSTRUCTURED_ADDRESS_LEN);
        }
    }

    let manufacturer;
    if (mfrName || mfrEmail || mfrUnstructuredAddress || responsiblePersonDetails) {
        manufacturer = {};
        if (mfrName) manufacturer.name = mfrName.slice(0, MAX_MANUFACTURER_FIELD_LEN);
        if (mfrEmail) manufacturer.email = mfrEmail.slice(0, MAX_MANUFACTURER_FIELD_LEN);
        if (normalizedMfrPhone.value) manufacturer.phone = normalizedMfrPhone.value;
        if (mfrCountry && ISO_COUNTRY_REGEX.test(mfrCountry.toUpperCase())) {
            manufacturer.countryCode = mfrCountry.toUpperCase();
        }
        if (mfrUnstructuredAddress) {
            manufacturer.unstructuredAddress = mfrUnstructuredAddress.slice(0, MAX_UNSTRUCTURED_ADDRESS_LEN);
            if (mfrUnstructuredAddress.length > MAX_UNSTRUCTURED_ADDRESS_LEN) {
                warnings.push(`Adres producenta GPSR przekraczał ${MAX_UNSTRUCTURED_ADDRESS_LEN} znaków i został przycięty.`);
            }
        }
        if (responsiblePersonDetails) {
            manufacturer.responsiblePersonDetails = responsiblePersonDetails;
        }
    }

    // Walidacja wymagań GPSR według OpenAPI v1.7.12
    if (!doesNotRequireGpsrInfo) {
        if (!manufacturer?.name) {
            errors.push('Kategoria wymaga danych GPSR — uzupełnij nazwę producenta (gpsr.manufacturer.name).');
        }
        if (!manufacturer?.email) {
            errors.push('Schema InPost Von Halsky wymaga adresu e-mail producenta (gpsr.manufacturer.email) — wpisz go w sekcji GPSR lub ustaw domyślny w Panelu Admina.');
        } else if (!EMAIL_REGEX.test(manufacturer.email)) {
            errors.push(`Nieprawidłowy format e-mail producenta GPSR: "${manufacturer.email}".`);
        }
        if (!manufacturer?.unstructuredAddress && !manufacturer?.address) {
            warnings.push('Brak adresu pocztowego producenta w GPSR — zalecane uzupełnienie dla zgodności z regulaminem UE.');
        }
        if (!safetyInformation) {
            warnings.push('Brak tekstu ostrzeżeń GPSR (gpsr.safetyInformation) — sprawdź Sekcję 6 lub parametry PIM.');
        }
    } else if (manufacturer && (!manufacturer.name || !manufacturer.email)) {
        // Jeśli GPSR nie jest wymagane, nie wysyłamy niekompletnego obiektu manufacturer (naruszyłby schema required: [name, email])
        manufacturer = undefined;
    }

    const gpsr = {
        doesNotRequireGpsrInfo: Boolean(doesNotRequireGpsrInfo)
    };
    if (manufacturer && manufacturer.name && manufacturer.email && EMAIL_REGEX.test(manufacturer.email)) {
        gpsr.manufacturer = manufacturer;
    }
    if (safetyInformation) {
        gpsr.safetyInformation = safetyInformation.slice(0, MAX_SAFETY_INFO_LEN);
    }
    if (typeof ov.ceMarking === 'boolean') {
        gpsr.ceMarking = ov.ceMarking;
    }
    const batchNumber = trimOrNull(ov.batchNumber);
    if (batchNumber) {
        gpsr.batchNumber = batchNumber.slice(0, 500);
    }

    return {
        gpsr,
        resolvedPreview: {
            doesNotRequireGpsrInfo: Boolean(doesNotRequireGpsrInfo),
            manufacturer: {
                name: mfrName || '',
                email: mfrEmail || '',
                phone: normalizedMfrPhone.value || (typeof mfrRawPhone === 'string' ? mfrRawPhone.trim() : ''),
                countryCode: mfrCountry ? mfrCountry.toUpperCase() : 'PL',
                unstructuredAddress: mfrUnstructuredAddress || '',
                responsiblePersonDetails: {
                    name: respName || '',
                    email: respEmail || '',
                    phone: respPhoneNorm.value || '',
                    countryCode: respCountry ? respCountry.toUpperCase() : '',
                    unstructuredAddress: respAddress || ''
                }
            },
            safetyInformation: safetyInformation || '',
            safetySource: extractedSafety.source || null,
            registryMatched: Boolean(registryEntity),
            ceMarking: typeof ov.ceMarking === 'boolean' ? ov.ceMarking : false,
            batchNumber: batchNumber || ''
        },
        errors,
        warnings
    };
}

function normalizeTaxRateInfo(rawTaxRate) {
    if (rawTaxRate === undefined || rawTaxRate === null || String(rawTaxRate).trim() === '') {
        return '23%';
    }
    const str = String(rawTaxRate).trim();
    if (/^\d+(?:[.,]\d+)?%$/.test(str)) {
        return str.replace(',', '.').slice(0, MAX_TAX_RATE_INFO_LEN);
    }
    const parsed = parseLocaleFloat(str);
    if (parsed !== null && parsed >= 0 && parsed <= 100) {
        return `${parsed}%`;
    }
    return str.slice(0, MAX_TAX_RATE_INFO_LEN);
}

/**
 * Główny budowniczy ładunku Pre-flight + Export dla InPost Von Halsky API v1.7.12.
 * Obsługuje tryb 'create' (`OfferProposal` -> POST) oraz 'update' (`OfferPatch` -> PATCH application/merge-patch+json).
 */
function buildVonHalskyOfferPayload({
    mode = 'create',
    product = {},
    existingOffer = null,
    category = null,
    attributeDefinitions = [],
    hint = null,
    htmlContent = null,
    draftImages = [],
    features = null,
    config = null,
    overrides = {}
} = {}) {
    const errors = [];
    const warnings = [];
    const safeMode = mode === 'update' && existingOffer?.id ? 'update' : 'create';
    const ov = overrides && typeof overrides === 'object' ? overrides : {};

    // Flagi zakresów dla trybu update (dla create wszystkie wymagane bloki są obowiązkowe)
    const sections = {
        includeTitle: safeMode === 'create' ? true : ov.includeTitle !== false,
        includeDescription: safeMode === 'create' ? true : ov.includeDescription !== false,
        includeImages: safeMode === 'create' ? true : ov.includeImages !== false,
        includeAttributes: safeMode === 'create' ? true : ov.includeAttributes !== false,
        includePrice: safeMode === 'create' ? true : ov.includePrice !== false,
        includeStock: safeMode === 'create' ? true : ov.includeStock !== false,
        includeGpsr: safeMode === 'create' ? true : ov.includeGpsr !== false,
        includeDimensions: safeMode === 'create' ? true : ov.includeDimensions !== false,
        includeShipping: safeMode === 'create' ? true : ov.includeShipping !== false,
        includePostSale: safeMode === 'create' ? true : ov.includePostSale !== false
    };

    const effectiveFeatures = (features && typeof features === 'object' && !Array.isArray(features))
        ? features
        : ((product.features && typeof product.features === 'object' && !Array.isArray(product.features)) ? product.features : {});

    // 1. Tytuł (max 150 zn.)
    const rawName = trimOrNull(
        ov.name !== undefined
            ? ov.name
            : (product.offerDraft?.title || product.name || existingOffer?.product?.name || '')
    ) || '';
    const finalName = rawName.slice(0, MAX_PRODUCT_NAME_LEN).trim();
    if (rawName.length > MAX_PRODUCT_NAME_LEN) {
        warnings.push(`Nazwa produktu (${rawName.length} zn.) została przycięta do limitu Von Halsky (${MAX_PRODUCT_NAME_LEN} zn.).`);
    }
    if ((safeMode === 'create' || sections.includeTitle) && !finalName) {
        errors.push('Wymagana jest nazwa oferty (product.name).');
    }

    // 2. Opis
    const descResult = buildVonHalskyDescription({
        htmlContent,
        descriptionHtml: product.descriptionHtml || '',
        customDescription: ov.description,
        format: ov.descriptionFormat || config?.defaultDescriptionFormat || 'html'
    });
    warnings.push(...descResult.warnings);
    if ((safeMode === 'create' || sections.includeDescription) && !descResult.description) {
        errors.push('Wymagany jest opis produktu (product.description). Wygeneruj moduły AEO lub uzupełnij opis.');
    }

    // 3. Marka
    const rawBrand = trimOrNull(
        ov.brand !== undefined
            ? ov.brand
            : (product.brand?.name || product.brandName || effectiveFeatures?.Marka || existingOffer?.product?.brand || '')
    ) || '';
    const finalBrand = rawBrand.slice(0, MAX_PRODUCT_BRAND_LEN).trim();
    if (safeMode === 'create' && !finalBrand) {
        errors.push('Wymagana jest marka produktu (product.brand).');
    }

    // 4. Kategoria (UUID liścia)
    const categoryId = trimOrNull(
        ov.categoryId !== undefined
            ? ov.categoryId
            : (category?.id || existingOffer?.product?.categoryId || hint?.product?.categoryId || '')
    ) || '';
    if (safeMode === 'create') {
        if (!categoryId || !isValidUuid(categoryId)) {
            errors.push('Wymagany jest poprawny identyfikator UUID kategorii liścia Von Halsky (product.categoryId).');
        } else if (category && category.leaf === false) {
            errors.push(`Wybrana kategoria "${category.name || categoryId}" nie jest kategorią końcową (leaf: false). Wybierz podkategorię liść.`);
        }
    } else if (categoryId && !isValidUuid(categoryId)) {
        errors.push('Nieprawidłowy format UUID w polu categoryId.');
    }

    // 5. Identyfikatory (EAN, SKU, MPN, externalId) — z ochroną pól niezmienialnych w PATCH!
    const eanCheck = validateEanChecksum(ov.ean !== undefined ? ov.ean : product.ean);
    if (eanCheck.warning) {
        warnings.push(eanCheck.warning);
    }
    const sku = trimOrNull(ov.sku !== undefined ? ov.sku : product.sku);
    const mpn = trimOrNull(
        ov.manufacturerProductNumber !== undefined
            ? ov.manufacturerProductNumber
            : (effectiveFeatures?.['Kod producenta'] || effectiveFeatures?.MPN || sku || '')
    );
    const model = trimOrNull(ov.model !== undefined ? ov.model : (effectiveFeatures?.Model || effectiveFeatures?.Linia || ''));
    const superModel = trimOrNull(ov.superModel !== undefined ? ov.superModel : '');
    const externalId = trimOrNull(ov.externalId !== undefined ? ov.externalId : (sku || product.id || ''));

    if (safeMode === 'create' && !eanCheck.normalized && !(finalBrand && mpn)) {
        errors.push('Przy tworzeniu oferty wymagany jest kod EAN lub para: Marka + Kod producenta (manufacturerProductNumber).');
    }

    // 6. Wymiary (cm -> mm, kg -> g)
    const dimResult = buildVonHalskyDimensions({
        weightKg: product.weight,
        widthCm: product.width,
        heightCm: product.height,
        lengthCm: product.length,
        overrideDimension: ov.dimension,
        fallbackDimension: hint?.product?.dimension || existingOffer?.product?.dimension || null
    });
    warnings.push(...dimResult.warnings);

    // 7. Atrybuty kategorii
    const attrResult = mapVonHalskyAttributes({
        attributeDefinitions,
        productFeatures: effectiveFeatures,
        product,
        hintAttributes: hint?.product?.attributes || [],
        existingOfferAttributes: existingOffer?.product?.attributes || [],
        overrides: ov.attributes
    });
    if (sections.includeAttributes) {
        errors.push(...attrResult.errors);
        warnings.push(...attrResult.warnings);
    }

    // 8. Cena (PriceTag)
    const rawPriceAmount = ov.priceAmount !== undefined
        ? parseLocaleFloat(ov.priceAmount)
        : (parseLocaleFloat(product.salePrice) || parseLocaleFloat(product.proposedSalePrice) || parseLocaleFloat(existingOffer?.price?.grossPrice?.amount));
    const roundedPriceAmount = rawPriceAmount !== null ? Math.round(rawPriceAmount * 100) / 100 : null;
    const currency = String(ov.currency || 'PLN').trim().toUpperCase().slice(0, 3);
    const taxRateInfo = normalizeTaxRateInfo(ov.taxRateInfo !== undefined ? ov.taxRateInfo : product.taxRate);

    if (sections.includePrice) {
        if (roundedPriceAmount === null || roundedPriceAmount < MIN_PRICE_AMOUNT || roundedPriceAmount > MAX_PRICE_AMOUNT) {
            errors.push(`Wymagana poprawna cena brutto z zakresu ${MIN_PRICE_AMOUNT}..${MAX_PRICE_AMOUNT} ${currency} (price.grossPrice.amount).`);
        }
        if (!/^[A-Z]{3}$/.test(currency)) {
            errors.push(`Nieprawidłowy kod waluty ISO 4217: "${currency}".`);
        }
    }

    // 9. Stan magazynowy (Stock)
    const rawStockQty = ov.stockQuantity !== undefined
        ? parseLocaleInt(ov.stockQuantity)
        : (parseLocaleInt(product.stock) ?? parseLocaleInt(existingOffer?.stock?.quantity) ?? 0);
    const stockUnit = ALLOWED_STOCK_UNITS.includes(String(ov.stockUnit || 'UNIT').toUpperCase())
        ? String(ov.stockUnit || 'UNIT').toUpperCase()
        : 'UNIT';

    if (sections.includeStock) {
        if (rawStockQty === null || rawStockQty < 0 || rawStockQty > MAX_STOCK_QTY) {
            errors.push(`Wymagany poprawny stan magazynowy (0..${MAX_STOCK_QTY}) w polu stock.quantity.`);
        }
    }

    // 10. Zdjęcia (HTTPS vs binarne załączniki)
    const imgResult = collectVonHalskyImages({
        draftImages,
        productImageUrl: product.imageUrl,
        productImages: product.images,
        maxImages: MAX_IMAGES_COUNT
    });
    if (sections.includeImages) {
        warnings.push(...imgResult.warnings);
        if (safeMode === 'create' && imgResult.totalCount === 0) {
            errors.push('Oferta Von Halsky wymaga co najmniej jednego zdjęcia produktu.');
        }
    }

    // 11. GPSR
    const categoryRequiresGpsr = category ? !Boolean(category.doesNotRequireGpsrInfo) : true;
    const gpsrResult = buildVonHalskyGpsr({
        categoryRequiresGpsr,
        gpsrOverride: ov.gpsr,
        hintGpsr: hint?.gpsr || null,
        existingOfferGpsr: existingOffer?.gpsr || null,
        defaultConfig: config,
        product,
        htmlContent,
        descriptionHtml: product.descriptionHtml || '',
        features: effectiveFeatures
    });
    if (sections.includeGpsr) {
        errors.push(...gpsrResult.errors);
        warnings.push(...gpsrResult.warnings);
    }

    // 12. Czas wysyłki i polityki posprzedażowe
    const rawDaysToShip = ov.daysToShip !== undefined
        ? parseLocaleInt(ov.daysToShip)
        : (parseLocaleInt(config?.defaultDaysToShip) ?? parseLocaleInt(product.leadTimeDays) ?? 1);
    const daysToShip = rawDaysToShip !== null && rawDaysToShip >= 0 && rawDaysToShip <= MAX_DAYS_TO_SHIP
        ? rawDaysToShip
        : 1;

    const returnPolicyText = trimOrNull(ov.returnPolicy !== undefined ? ov.returnPolicy : config?.defaultReturnPolicy);
    const complaintPolicyText = trimOrNull(ov.complaintPolicy !== undefined ? ov.complaintPolicy : config?.defaultComplaintPolicy);
    const refundable = typeof ov.refundable === 'boolean' ? ov.refundable : true;

    // 13. Składanie finalnego ładunku zgodnego z OpenAPI (OfferProposal lub OfferPatch RFC 7396)
    let payload = {};
    if (safeMode === 'create') {
        const productObj = {
            name: finalName,
            description: descResult.description,
            brand: finalBrand,
            categoryId
        };
        if (attrResult.attributes.length > 0) productObj.attributes = attrResult.attributes;
        if (model) productObj.model = model.slice(0, MAX_PRODUCT_MODEL_LEN);
        if (superModel) productObj.superModel = superModel.slice(0, MAX_PRODUCT_SUPERMODEL_LEN);
        if (sku) productObj.sku = sku.slice(0, MAX_PRODUCT_SKU_LEN);
        if (mpn) productObj.manufacturerProductNumber = mpn.slice(0, MAX_MPN_LEN);
        if (eanCheck.normalized) productObj.ean = eanCheck.normalized;
        if (dimResult.dimension) productObj.dimension = dimResult.dimension;

        payload = {
            ...(externalId ? { externalId: externalId.slice(0, MAX_EXTERNAL_ID_LEN) } : {}),
            product: productObj,
            stock: {
                quantity: rawStockQty ?? 0,
                unit: stockUnit
            },
            price: {
                grossPrice: {
                    amount: roundedPriceAmount ?? 0,
                    currency
                },
                taxRateInfo
            },
            gpsr: gpsrResult.gpsr,
            shippingTime: { daysToShip },
            features: { refundable }
        };

        if (imgResult.httpsImages.length > 0) {
            payload.images = imgResult.httpsImages;
        }
        if (returnPolicyText || complaintPolicyText) {
            payload.postSale = {};
            if (returnPolicyText) payload.postSale.returnPolicy = { description: returnPolicyText };
            if (complaintPolicyText) payload.postSale.complaintPolicy = { description: complaintPolicyText };
        }
    } else {
        // TRYB UPDATE: RFC 7396 application/merge-patch+json — tylko zaznaczone pola, zero `null`, ochrona pól unmodifiable!
        const productPatch = {};
        if (sections.includeTitle && finalName) productPatch.name = finalName;
        if (sections.includeDescription && descResult.description) productPatch.description = descResult.description;
        if (finalBrand && finalBrand !== existingOffer?.product?.brand) productPatch.brand = finalBrand;
        if (categoryId && isValidUuid(categoryId) && categoryId !== existingOffer?.product?.categoryId) {
            productPatch.categoryId = categoryId;
        }
        if (sections.includeAttributes && attrResult.attributes.length > 0) {
            productPatch.attributes = attrResult.attributes;
        }
        if (model) productPatch.model = model.slice(0, MAX_PRODUCT_MODEL_LEN);
        if (superModel) productPatch.superModel = superModel.slice(0, MAX_PRODUCT_SUPERMODEL_LEN);
        if (sku) productPatch.sku = sku.slice(0, MAX_PRODUCT_SKU_LEN);
        if (mpn) productPatch.manufacturerProductNumber = mpn.slice(0, MAX_MPN_LEN);
        // Ochrona pola unmodifiable `ean` — wysyłamy tylko jeśli oferta NIE miała jeszcze EAN!
        if (eanCheck.normalized && !existingOffer?.product?.ean) {
            productPatch.ean = eanCheck.normalized;
        }
        if (sections.includeDimensions && dimResult.dimension) {
            productPatch.dimension = dimResult.dimension;
        }

        // Ochrona pola unmodifiable `externalId` — wysyłamy tylko jeśli oferta NIE miała jeszcze externalId!
        if (externalId && !existingOffer?.externalId) {
            payload.externalId = externalId.slice(0, MAX_EXTERNAL_ID_LEN);
        }
        if (Object.keys(productPatch).length > 0) {
            payload.product = productPatch;
        }
        if (sections.includeStock && rawStockQty !== null) {
            payload.stock = { quantity: rawStockQty, unit: stockUnit };
        }
        if (sections.includePrice && roundedPriceAmount !== null) {
            payload.price = {
                grossPrice: { amount: roundedPriceAmount, currency },
                taxRateInfo
            };
        }
        if (sections.includeGpsr) {
            payload.gpsr = gpsrResult.gpsr;
        }
        if (sections.includeShipping) {
            payload.shippingTime = { daysToShip };
        }
        if (sections.includeImages && imgResult.httpsImages.length > 0) {
            payload.images = imgResult.httpsImages;
        }
        if (sections.includePostSale && (returnPolicyText || complaintPolicyText)) {
            payload.postSale = {};
            if (returnPolicyText) payload.postSale.returnPolicy = { description: returnPolicyText };
            if (complaintPolicyText) payload.postSale.complaintPolicy = { description: complaintPolicyText };
        }
    }

    const hasChanges = safeMode === 'create'
        ? true
        : (Object.keys(payload).length > 0 || (sections.includeImages && imgResult.binaryAttachments.length > 0));

    return {
        mode: safeMode,
        httpMethod: safeMode === 'create' ? 'POST' : 'PATCH',
        contentType: safeMode === 'create' ? 'application/json' : 'application/merge-patch+json',
        payload,
        binaryAttachments: sections.includeImages ? imgResult.binaryAttachments : [],
        attributesPatchOperations: sections.includeAttributes ? attrResult.patchOperations : [],
        hasChanges,
        errors,
        warnings,
        preview: {
            name: finalName,
            brand: finalBrand,
            ean: eanCheck.normalized,
            eanValid: eanCheck.valid,
            sku: sku || '',
            manufacturerProductNumber: mpn || '',
            model: model || '',
            externalId: externalId || '',
            categoryId,
            categoryName: category?.name || '',
            categoryLeaf: category ? Boolean(category.leaf) : null,
            categoryRequiresGpsr,
            description: descResult.description,
            descriptionFormat: descResult.format,
            descriptionSectionsCount: descResult.sectionsCount,
            descriptionLength: descResult.description.length,
            priceAmount: roundedPriceAmount,
            currency,
            taxRateInfo,
            stockQuantity: rawStockQty,
            stockUnit,
            daysToShip,
            refundable,
            returnPolicy: returnPolicyText || '',
            complaintPolicy: complaintPolicyText || '',
            dimension: dimResult.dimension || null,
            images: imgResult.allItems,
            httpsImagesCount: imgResult.httpsImages.length,
            binaryAttachmentsCount: imgResult.binaryAttachments.length,
            attributes: attrResult.attributePreview,
            requiredAttributesTotal: attrResult.requiredTotal,
            requiredAttributesFilled: attrResult.requiredFilled,
            gpsr: gpsrResult.resolvedPreview,
            sections
        }
    };
}

module.exports = {
    MAX_PRODUCT_NAME_LEN,
    MAX_PRODUCT_DESC_LEN,
    MAX_IMAGES_COUNT,
    MAX_ATTRIBUTES_COUNT,
    ALLOWED_STOCK_UNITS,
    ALLOWED_DESCRIPTION_FORMATS,
    isValidUuid,
    validateEanChecksum,
    normalizePhoneNumber,
    extractCountryCodeFromAddress,
    buildVonHalskyDimensions,
    buildVonHalskyDescription,
    buildSafeImageFileName,
    collectVonHalskyImages,
    convertValueToVonHalskyUnit,
    mapVonHalskyAttributes,
    buildVonHalskyGpsr,
    normalizeTaxRateInfo,
    buildVonHalskyOfferPayload
};
