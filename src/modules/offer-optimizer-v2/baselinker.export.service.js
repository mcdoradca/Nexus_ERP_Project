const axios = require('axios');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { exportLogger } = require('../../utils/logger');
const AllegroService = require('../offer-optimizer/allegro.service');
const { getBaseLinkerToken } = require('../../utils/secretVault');
const { isValidExportImageUrl } = require('../../utils/allegro_mapper');
const { stripRawInciFooterFromSection3 } = require('./normalization');

const INTERNAL_BACK_IMAGE_KEYS = new Set([
    'zdjęcie tyłu opakowania',
    'zdjecie tylu opakowania',
    '_backimageurl'
]);

const INVENTORY_PARAMETERS_CACHE_TTL_MS = 10 * 60 * 1000;

const FALLBACK_NUMBER_PARAMETER_NAMES = [
    'Waga produktu z opakowaniem jednostkowym',
    'Pojemność',
    'EAN (GTIN)',
    'Kod producenta',
    'Liczba prań',
    'Liczba sztuk w opakowaniu'
];

const FALLBACK_MULTISELECT_PARAMETER_NAMES = [
    'Produkt nie zawiera',
    'Cechy dodatkowe',
    'Działanie',
    'Typ skóry',
    'Typ włosów',
    'Materiał wykonania'
];

const FALLBACK_INVENTORY_PARAMETERS = [
    ...FALLBACK_NUMBER_PARAMETER_NAMES.map((name, idx) => ({
        parameter_key: `fallback_num_${idx}`,
        type: 'number',
        name_translations: { pl: name },
        options: []
    })),
    ...FALLBACK_MULTISELECT_PARAMETER_NAMES.map((name, idx) => ({
        parameter_key: `fallback_multi_${idx}`,
        type: 'multiselect',
        name_translations: { pl: name },
        options: []
    }))
];

function normalizeParameterName(name) {
    return String(name || '').normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function trimDecimalTrailingZeros(numStr) {
    if (!numStr.includes('.')) return numStr;
    return numStr.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

/**
 * Konwertuje wartość parametru liczbowego (`type === "number"` w BaseLinker)
 * z zapisu z przecinkiem/jednostką (np. "1,1", "1,200 kg", "1000,00 ml")
 * na czysty string liczbowy akceptowany przez API i formularz BaseLinkera ("1.1", "1.2", "1000").
 */
function parseAndFormatNumericFeatureValue(keyName, rawVal) {
    if (rawVal === undefined || rawVal === null) {
        return { valid: true, value: '' };
    }
    if (typeof rawVal === 'number') {
        if (!Number.isFinite(rawVal)) {
            return { valid: false, value: String(rawVal) };
        }
        return { valid: true, value: trimDecimalTrailingZeros(String(rawVal)) };
    }

    const trimmed = String(rawVal).trim();
    if (!trimmed) {
        return { valid: true, value: '' };
    }

    // Czyste ciągi cyfr (np. EAN lub kody producenta z zerem wiodącym) pozostają nietknięte
    if (/^\d+$/.test(trimmed)) {
        return { valid: true, value: trimmed };
    }

    const numMatch = trimmed.match(/^(?:ok\.?\s*)?(\d+(?:\s\d{3})*(?:[.,]\d+)?)\s*(kg|g|ml|l|szt\.?|pra[nń]|pcs)?\.?$/i);
    if (!numMatch) {
        return { valid: false, value: trimmed };
    }

    let normalizedDigits = numMatch[1].replace(/\s+/g, '').replace(',', '.');
    const unit = (numMatch[2] || '').toLowerCase();

    if (unit === 'g' && normalizeParameterName(keyName) === 'waga produktu z opakowaniem jednostkowym') {
        const parsedGrams = parseFloat(normalizedDigits);
        if (!Number.isFinite(parsedGrams)) {
            return { valid: false, value: trimmed };
        }
        normalizedDigits = (parsedGrams / 1000).toFixed(6);
    }

    return { valid: true, value: trimDecimalTrailingZeros(normalizedDigits) };
}

function matchPredefinedParameterOption(rawVal, options = [], isMultiselect = false) {
    const strVal = rawVal === undefined || rawVal === null ? '' : String(rawVal).trim();
    if (!strVal) {
        return { matched: true, partialMatch: false, value: rawVal, matchedValues: [], unmatchedTokens: [] };
    }

    const optionLookup = new Map();
    if (Array.isArray(options)) {
        for (const opt of options) {
            const translations = opt && typeof opt.value_translations === 'object' ? Object.values(opt.value_translations) : [];
            for (const label of translations) {
                if (typeof label !== 'string') continue;
                const norm = normalizeParameterName(label);
                if (norm && !optionLookup.has(norm)) {
                    optionLookup.set(norm, label);
                }
            }
        }
    }

    // Gdy brak definicji opcji (np. fallback offline), dla multiselect nadal normalizujemy separator na wymagany w BL '|'
    if (optionLookup.size === 0) {
        if (isMultiselect) {
            const deduped = [];
            for (const token of strVal.split(/[,;|]/).map(t => t.trim()).filter(Boolean)) {
                if (!deduped.includes(token)) deduped.push(token);
            }
            return {
                matched: true,
                partialMatch: false,
                value: deduped.join('|'),
                matchedValues: deduped,
                unmatchedTokens: []
            };
        }
        return { matched: true, partialMatch: false, value: rawVal, matchedValues: [strVal], unmatchedTokens: [] };
    }

    // Sprawdzenie pełnego dopasowania przed rozbiciem (chroni opcje słownika zawierające przecinek w nazwie)
    const fullExact = optionLookup.get(normalizeParameterName(strVal));
    if (fullExact !== undefined) {
        return {
            matched: true,
            partialMatch: false,
            value: fullExact,
            matchedValues: [fullExact],
            unmatchedTokens: []
        };
    }

    const tokens = isMultiselect ? strVal.split(/[,;|]/).map(t => t.trim()).filter(Boolean) : [strVal];
    const matchedValues = [];
    const unmatchedTokens = [];

    for (const token of tokens) {
        const exact = optionLookup.get(normalizeParameterName(token));
        if (exact !== undefined) {
            if (!matchedValues.includes(exact)) matchedValues.push(exact);
        } else {
            unmatchedTokens.push(token);
        }
    }

    if (unmatchedTokens.length > 0) {
        // W multiselect ratujemy wszystkie poprawne opcje sklejone separatorem '|', zamiast oddawać cały parametr na odrzucenie przez BL
        if (isMultiselect && matchedValues.length > 0) {
            return {
                matched: false,
                partialMatch: true,
                value: matchedValues.join('|'),
                matchedValues,
                unmatchedTokens
            };
        }
        return {
            matched: false,
            partialMatch: false,
            value: strVal,
            matchedValues,
            unmatchedTokens
        };
    }

    return {
        matched: true,
        partialMatch: false,
        value: isMultiselect ? matchedValues.join('|') : matchedValues[0],
        matchedValues,
        unmatchedTokens: []
    };
}

/**
 * Dopasowuje i normalizuje słownik `features` pod typy parametrów BaseLinkera (`getInventoryParameters`).
 */
function normalizeFeaturesForBaselinkerSchema(features = {}, parameters = []) {
    const source = (features && typeof features === 'object' && !Array.isArray(features)) ? features : {};
    const paramByNormName = new Map();

    if (Array.isArray(parameters)) {
        for (const param of parameters) {
            if (!param || typeof param !== 'object') continue;
            const names = [];
            if (param.name_translations && typeof param.name_translations === 'object') {
                names.push(...Object.values(param.name_translations));
            }
            if (param.parameter_key) {
                names.push(param.parameter_key);
            }
            for (const name of names) {
                const norm = normalizeParameterName(name);
                if (norm && !paramByNormName.has(norm)) {
                    paramByNormName.set(norm, param);
                }
            }
        }
    }

    const normalizedFeatures = {};
    const warnings = [];
    let hasUnmatchedDictionaryOption = false;

    for (const [key, rawVal] of Object.entries(source)) {
        if (rawVal === undefined || rawVal === null) continue;
        const paramDef = paramByNormName.get(normalizeParameterName(key));

        if (!paramDef) {
            normalizedFeatures[key] = rawVal;
            continue;
        }

        if (paramDef.type === 'number') {
            const parsed = parseAndFormatNumericFeatureValue(key, rawVal);
            normalizedFeatures[key] = parsed.value;
            if (!parsed.valid) {
                warnings.push(`Parametr BaseLinker "${key}" ma typ liczbowy (number) – wartość "${String(rawVal)}" może zostać odrzucona przez BaseLinker.`);
            }
            continue;
        }

        if (paramDef.type === 'select' || paramDef.type === 'multiselect') {
            const matchRes = matchPredefinedParameterOption(rawVal, paramDef.options, paramDef.type === 'multiselect');
            normalizedFeatures[key] = matchRes.value;
            if (!matchRes.matched) {
                hasUnmatchedDictionaryOption = true;
                const sampleOptions = (paramDef.options || [])
                    .slice(0, 5)
                    .map(o => o?.value_translations?.pl || Object.values(o?.value_translations || {})[0])
                    .filter(Boolean)
                    .map(s => String(s).trim());
                const allowedPreview = sampleOptions.length > 0 ? ` (przykładowe opcje w BL: ${sampleOptions.join(', ')})` : '';
                if (matchRes.partialMatch) {
                    warnings.push(`Parametr słownikowy BaseLinker "${key}" (${paramDef.type}): wysłano dopasowane wartości (${matchRes.matchedValues.map(v => String(v).trim()).join(', ')}), natomiast pominięto wartości spoza słownika katalogu: "${matchRes.unmatchedTokens.join(', ')}"${allowedPreview}.`);
                } else {
                    warnings.push(`Parametr słownikowy BaseLinker "${key}" (${paramDef.type}): wartość "${matchRes.unmatchedTokens.join(', ')}" nie występuje na liście predefiniowanych opcji katalogu${allowedPreview}.`);
                }
            }
            continue;
        }

        normalizedFeatures[key] = rawVal;
    }

    return { normalizedFeatures, warnings, hasUnmatchedDictionaryOption };
}

function formatBaselinkerApiWarnings(rawWarnings) {
    if (!rawWarnings) return [];
    if (Array.isArray(rawWarnings)) {
        return rawWarnings.map(w => (typeof w === 'string' ? w : JSON.stringify(w))).filter(Boolean);
    }
    if (typeof rawWarnings === 'string') {
        return rawWarnings.trim() ? [rawWarnings.trim()] : [];
    }
    if (typeof rawWarnings === 'object') {
        const entries = Object.entries(rawWarnings);
        if (entries.length === 0) return [];
        const messages = [];
        for (const [scope, detail] of entries) {
            if (detail === undefined || detail === null || detail === '') continue;
            if (typeof detail === 'object' && !Array.isArray(detail)) {
                for (const [subKey, subVal] of Object.entries(detail)) {
                    messages.push(`BaseLinker (${scope}.${subKey}): ${typeof subVal === 'string' ? subVal : JSON.stringify(subVal)}`);
                }
            } else {
                messages.push(`BaseLinker (${scope}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
            }
        }
        return messages;
    }
    return [];
}

/**
 * Scala parametry z PIM, UI oraz (wyłącznie w trybie nie-autorytatywnym jako fallback braków) katalogu Allegro,
 * gwarantując w trybie autorytatywnym UI ścisłe 1:1 z kartami operatora oraz usunięcie pól binarnych przed eksportem do BaseLinkera.
 */
function mergeFeaturesForBaselinker({ existingFeatures = {}, draftFeatures = null, hardFeatures = {}, featuresAuthoritative = false } = {}) {
    const baseExisting = (existingFeatures && typeof existingFeatures === 'object' && !Array.isArray(existingFeatures))
        ? existingFeatures
        : {};
    const hasDraftObj = Boolean(draftFeatures && typeof draftFeatures === 'object' && !Array.isArray(draftFeatures));
    const isStrictUiSnapshot = Boolean(featuresAuthoritative && hasDraftObj);

    // Przy pełnym snapshocie z UI (`featuresAuthoritative`) eksportujemy wyłącznie parametry obecne w kartach UI
    const merged = isStrictUiSnapshot
        ? { ...draftFeatures }
        : { ...baseExisting, ...(hasDraftObj ? draftFeatures : {}) };

    if (!isStrictUiSnapshot && hardFeatures && typeof hardFeatures === 'object' && !Array.isArray(hardFeatures)) {
        const presentNormKeys = new Set(
            Object.keys(merged).map(k => String(k).toLowerCase().trim())
        );
        for (const [k, v] of Object.entries(hardFeatures)) {
            if (v === undefined || v === null || String(v).trim() === '') continue;
            const normKey = String(k).toLowerCase().trim();
            if (INTERNAL_BACK_IMAGE_KEYS.has(normKey)) continue;
            if (!presentNormKeys.has(normKey)) {
                merged[k] = v;
                presentNormKeys.add(normKey);
            } else {
                const existingKey = Object.keys(merged).find(mk => String(mk).toLowerCase().trim() === normKey);
                if (existingKey && (merged[existingKey] === undefined || merged[existingKey] === null || String(merged[existingKey]).trim() === '')) {
                    merged[existingKey] = v;
                }
            }
        }
    }

    for (const [key, val] of Object.entries(merged)) {
        const normKey = String(key).toLowerCase().trim();
        if (INTERNAL_BACK_IMAGE_KEYS.has(normKey) || (typeof val === 'string' && val.startsWith('data:image'))) {
            delete merged[key];
        }
    }

    return merged;
}

class BaselinkerExportService {
    constructor() {
        this.inventoryParametersCache = new Map();
    }

    clearInventoryParametersCache() {
        this.inventoryParametersCache.clear();
    }

    async callConnectorApi(method, parameters = {}, timeout = 30000) {
        const token = await getBaseLinkerToken(prisma);
        const params = new URLSearchParams();
        params.append('method', method);
        params.append('parameters', JSON.stringify(parameters));

        const response = await axios.post('https://api.baselinker.com/connector.php', params.toString(), {
            headers: { 'X-BLToken': token, 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout
        });

        if (response.data?.status === 'ERROR') {
            throw new Error(`BaseLinker API Error: ${response.data.error_message || 'Nieznany błąd API'}`);
        }
        return response.data;
    }

    async fetchInventoryParameters(inventoryId, { forceRefresh = false } = {}) {
        const invKey = String(inventoryId || '').trim();
        if (!invKey) return FALLBACK_INVENTORY_PARAMETERS;

        const cached = this.inventoryParametersCache.get(invKey);
        if (!forceRefresh && cached && (Date.now() - cached.fetchedAt) < INVENTORY_PARAMETERS_CACHE_TTL_MS) {
            return cached.parameters;
        }

        const numericInventoryId = parseInt(invKey, 10);
        if (Number.isNaN(numericInventoryId)) {
            return FALLBACK_INVENTORY_PARAMETERS;
        }

        try {
            const res = await this.callConnectorApi('getInventoryParameters', { inventory_id: numericInventoryId }, 15000);
            const parameters = Array.isArray(res?.parameters) ? res.parameters : [];
            this.inventoryParametersCache.set(invKey, { parameters, fetchedAt: Date.now() });
            return parameters;
        } catch (err) {
            exportLogger.warn(`[BaselinkerExportService] Fallback parametrów dla katalogu ${invKey} (błąd getInventoryParameters: ${err.message})`);
            if (cached && Array.isArray(cached.parameters)) {
                return cached.parameters;
            }
            return FALLBACK_INVENTORY_PARAMETERS;
        }
    }
    
    /**
     * Koduje emoji i piktogramy na encje HTML chroniąc system przed błędami kodowania.
     * Jeśli isHtml = false (Tytuły), całkowicie usuwa emoji.
     */
    encodeEmojis(str, isHtml = true) {
        if (!str) return "";
        return str.replace(/[\p{Emoji}\uFE0F]/gu, function(match) {
            const codePoint = match.codePointAt(0);
            if (codePoint <= 127) return match; // Zostawiamy podstawowe znaki ASCII (np. cyfry, #, *)
            
            if (!isHtml) return ""; 

            if (codePoint <= 0xFFFF) return match; 

            return '&#x' + codePoint.toString(16).toUpperCase() + ';';
        });
    }

    /**
     * Zgodnie z wytycznymi z KI (Amazon Lupa) kompresuje zdjęcie jeśli to konieczne
     * aby zmieścić Base64 poniżej 2MB przy zachowaniu wymiarów.
     */
    isValidExportImageUrl(url) {
        return isValidExportImageUrl(url);
    }

    async compressImage(url) {
        const MAX_BYTES = 1.9 * 1024 * 1024;
        if (url.startsWith('data:image')) {
            const base64Data = url.split(',')[1] || "";
            if (base64Data.length <= MAX_BYTES) {
                return "data:" + base64Data;
            }
            try {
                const buffer = Buffer.from(base64Data, 'base64');
                let quality = 90;
                let compressedB64 = await sharp(buffer).jpeg({ quality }).toBuffer().then(b => b.toString('base64'));
                while (compressedB64.length > MAX_BYTES && quality > 10) {
                    quality -= 10;
                    compressedB64 = await sharp(buffer).jpeg({ quality }).toBuffer().then(b => b.toString('base64'));
                }
                exportLogger.info(`[BaselinkerExportService] Skompresowano obraz Base64 do jakości ${quality}.`);
                return "data:" + compressedB64;
            } catch (b64Err) {
                exportLogger.warn(`[BaselinkerExportService] Błąd kompresji obrazu Base64: ${b64Err.message}`);
                return "data:" + base64Data;
            }
        }

        if (!this.isValidExportImageUrl(url)) {
            exportLogger.warn(`[BaselinkerExportService] Odrzucono nieprawidłowy URL obrazu przed kompresją: ${url}`);
            return null;
        }

        try {
            exportLogger.info(`[BaselinkerExportService] Pobieranie obrazu do kompresji: ${url}`);
            const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
            let buffer = Buffer.from(response.data);
            
            let quality = 95;
            let base64str = await sharp(buffer).jpeg({ quality }).toBuffer().then(b => b.toString('base64'));
            
            while (base64str.length > MAX_BYTES && quality > 10) {
                quality -= 10;
                base64str = await sharp(buffer).jpeg({ quality }).toBuffer().then(b => b.toString('base64'));
            }
            
            exportLogger.info(`[BaselinkerExportService] Skompresowano obraz do jakości ${quality}.`);
            return "data:" + base64str;
        } catch (err) {
            exportLogger.warn(`[BaselinkerExportService] Błąd pobierania/kompresji obrazu: ${url} - Fallback do url:`, err.message);
            return url.startsWith('http') ? `url:${url}` : null;
        }
    }

    /**
     * Buduje gotowy payload JSON wraz z diagnostyką parametrów BaseLinkera (bez wysyłki do API).
     */
    async buildPayloadWithDiagnostics(inventoryId, productId, draftData, product) {
        exportLogger.info(`[BaselinkerExportService] Budowanie payloadu dla EAN: ${product.ean}`);
        
        const payload = {
            inventory_id: inventoryId,
            text_fields: {},
            images: {}
        };

        if (productId) {
            payload.product_id = productId;
        }

        // --- 1. KOMPILACJA SEKCJI OPISU (6 modułów — bez sekcja6 GPSR) ---
        payload.text_fields["description"] = this.encodeEmojis(draftData.htmlContent?.sekcja1 || draftData.sekcja1 || "", true);
        payload.text_fields["description_extra1"] = this.encodeEmojis(draftData.htmlContent?.sekcja2 || draftData.sekcja2 || "", true);
        const sec3 = stripRawInciFooterFromSection3(draftData.htmlContent?.sekcja3 || draftData.sekcja3 || "");
        payload.text_fields["description_extra2"] = this.encodeEmojis(sec3, true);
        payload.text_fields["description_extra3"] = this.encodeEmojis(draftData.htmlContent?.sekcja4 || draftData.sekcja4 || "", true);
        
        // Moduł 6 (sekcja6 / GPSR) jest wyłączony z opisu oferty (pozostaje wyłącznie pod kluczem GPSR).
        const sec5 = draftData.htmlContent?.sekcja5 || draftData.sekcja5 || "";
        payload.text_fields["description_extra4"] = this.encodeEmojis(sec5, true);
        
        payload.text_fields["extra_field_4245"] = this.encodeEmojis(draftData.htmlContent?.sekcja7 || draftData.sekcja7 || "", true);

        // --- 2. WALIDACJA TYTUŁU API (GEO) ---
        if (draftData.title) {
            const cleanTitle = this.encodeEmojis(draftData.title, false);
            payload.text_fields["name|pl|allegro_0"] = cleanTitle;
            payload.text_fields["name|pl|allegro_16402"] = cleanTitle;
            
            if (!payload.product_id) {
                payload.text_fields["name"] = cleanTitle;
            }
        }

        // --- 3. PARAMETRY ---
        const hasAuthoritativeDraftFeatures = Boolean(
            draftData.featuresAuthoritative &&
            draftData.features &&
            typeof draftData.features === 'object' &&
            !Array.isArray(draftData.features)
        );
        let hardFeatures = {};
        if (!hasAuthoritativeDraftFeatures && product.allegroCategoryId) {
            try {
                hardFeatures = await AllegroService.getProductParametersByEan(product.ean, product.allegroCategoryId);
            } catch (e) {
                exportLogger.warn(`[BaselinkerExportService] Błąd pobierania hardFeatures z Allegro: ${e.message}`);
            }
        }
        
        let existingFeatures = {};
        if (typeof product.features === 'string') {
            try { existingFeatures = JSON.parse(product.features); } catch(e) {}
        } else if (typeof product.features === 'object' && product.features !== null) {
            existingFeatures = product.features;
        }

        const mergedFeatures = mergeFeaturesForBaselinker({
            existingFeatures,
            draftFeatures: draftData.features || null,
            hardFeatures,
            featuresAuthoritative: Boolean(draftData.featuresAuthoritative)
        });

        const invKey = String(inventoryId || '').trim();
        const hadCachedParameters = Boolean(invKey && this.inventoryParametersCache.has(invKey));
        let inventoryParameters = await this.fetchInventoryParameters(inventoryId);
        let { normalizedFeatures: finalFeatures, warnings, hasUnmatchedDictionaryOption } = normalizeFeaturesForBaselinkerSchema(
            mergedFeatures,
            inventoryParameters
        );

        // Jeśli w pamięci RAM był starszy cache słownika i wykryto niedopasowanie opcji (np. operator właśnie dodał "w płynie" w BaseLinkerze),
        // jednorazowo przeładowujemy świeży słownik z API przed zgłoszeniem ostrzeżenia.
        if (hadCachedParameters && hasUnmatchedDictionaryOption) {
            exportLogger.info(`[BaselinkerExportService] Wykryto niedopasowaną opcję słownikową na cache katalogu ${invKey} — odświeżam getInventoryParameters na żywo.`);
            inventoryParameters = await this.fetchInventoryParameters(inventoryId, { forceRefresh: true });
            const refreshed = normalizeFeaturesForBaselinkerSchema(mergedFeatures, inventoryParameters);
            finalFeatures = refreshed.normalizedFeatures;
            warnings = refreshed.warnings;
        }

        for (const [key, val] of Object.entries(finalFeatures)) {
            if (typeof val === 'string') {
                finalFeatures[key] = this.encodeEmojis(val, false);
            }
        }
        
        payload.text_fields["features"] = finalFeatures;
        payload.text_fields["features|pl|allegro_16402"] = finalFeatures;

        // --- 4. ZDJĘCIA ---
        // Budujemy tablicę docelową: index 0 to miniaturka, reszta to galeria
        const finalImages = [];
        
        // Zabezpieczenie: Pobieramy miniaturkę z bazy (PIM)
        let mainImageUrl = product.imageUrl || null;

        if (draftData.images && Array.isArray(draftData.images) && draftData.images.length > 0) {
            // Frontend przesłał własną tablicę (np. posortowaną przez użytkownika)
            for (let img of draftData.images) {
                // replacedUrl musi mieć najwyższy priorytet, inaczej originalUrl ("Wymagane nowe zdjęcie") by go nadpisywało
                let url = typeof img === 'string' ? img : (img.replacedUrl || img.url || img.originalUrl || "");
                if (typeof url !== 'string') url = String(url);

                if (!this.isValidExportImageUrl(url)) {
                    finalImages.push(""); // Pusty string u nas oznacza skip w indeksacji (BaseLinker zignoruje ten slot)
                } else {
                    finalImages.push(url.trim());
                }
            }
        } else {
            // Logika Fallbacku z dawnego MDM: jeśli frontend nie przysłał zdjęć, wstrzykujemy PIM
            if (this.isValidExportImageUrl(mainImageUrl)) finalImages.push(mainImageUrl.trim());
            if (product.images && Array.isArray(product.images)) {
                product.images.forEach(img => {
                    if (this.isValidExportImageUrl(img)) finalImages.push(img.trim());
                });
            }
        }

        // Dodatkowa tarcza: Jeśli po wszystkim nie mamy miniaturki na index 0 (jest pusta), 
        // a w bazie PIM mamy poprawne zdjęcie główne (imageUrl) niebędące placeholderem ani BaseLinker CDN, wymuszamy je na index 0.
        if (mainImageUrl && (!finalImages[0] || finalImages[0] === "")) {
             if (this.isValidExportImageUrl(mainImageUrl)) {
                 finalImages[0] = mainImageUrl.trim();
             }
        }

        // Kompresja i przypisanie do payloadu zgodnie z indeksami (0, 1, 2...)
        for (let i = 0; i < finalImages.length; i++) {
            let url = finalImages[i];
            if (!url) continue; // Skipujemy puste (np. odrzucone linki CDN), dzięki czemu BaseLinker zachowa stare zdjęcie na tej pozycji
            
            const compressedDataUrl = await this.compressImage(url);
            if (compressedDataUrl) {
                payload.images[i.toString()] = compressedDataUrl;
            }
        }

        return { payload, warnings };
    }

    /**
     * Buduje gotowy payload JSON (z kompresją zdjęć i mapowaniem) bez faktycznego wysyłania do API.
     */
    async buildPayload(inventoryId, productId, draftData, product) {
        const { payload } = await this.buildPayloadWithDiagnostics(inventoryId, productId, draftData, product);
        return payload;
    }

    /**
     * Główna metoda kompilująca parametry, sekcje, zdjęcia i ładunek w jeden poprawny format JSON dla BaseLinker
     */
    async exportToBaselinker(inventoryId, productId, draftData, product) {
        exportLogger.info(`[BaselinkerExportService] Rozpoczynam eksport dla EAN: ${product.ean}`);
        
        try {
            const { payload, warnings: preflightWarnings } = await this.buildPayloadWithDiagnostics(
                inventoryId,
                productId,
                draftData,
                product
            );

            // --- 5. EKSPORT DO BASELINKER API ---
            exportLogger.info(`[BaselinkerExportService] Wysyłanie ładunku do BaseLinker API dla EAN: ${product.ean}...`);

            const responseData = await this.callConnectorApi('addInventoryProduct', payload, 30000);
            const apiWarnings = formatBaselinkerApiWarnings(responseData?.warnings);

            if (apiWarnings.length > 0) {
                exportLogger.warn(`[BaselinkerExportService] Ostrzeżenia BaseLinker API (addInventoryProduct) dla EAN ${product.ean}: ${apiWarnings.join(' | ')}`);
            }
            if (preflightWarnings.length > 0) {
                exportLogger.warn(`[BaselinkerExportService] Ostrzeżenia schematu parametrów BaseLinkera dla EAN ${product.ean}: ${preflightWarnings.join(' | ')}`);
            }

            exportLogger.info(`[BaselinkerExportService] Zakończono sukcesem eksport dla EAN: ${product.ean}.`);
            
            return {
                apiResponse: responseData,
                agentPayload: payload, // Zwracamy payload żeby symulować strukturę jaką wcześniej wypluwał AI Agent (na użytek frontendu/logów)
                preflightWarnings,
                apiWarnings
            };
        } catch (error) {
            exportLogger.error(`[BaselinkerExportService] BŁĄD EKSPORTU dla EAN: ${product.ean} | Message: ${error.message}`);
            console.error(`[BaselinkerExportService] KRYTYCZNY BŁĄD EKSPORTU:`, error);
            
            if (error.response) {
                exportLogger.error(`[BaselinkerExportService] Szczegóły z API: ${JSON.stringify(error.response.data)}`);
                console.error(`[BaselinkerExportService] Szczegóły z API:`, error.response.data);
            }
            
            throw error; // Rzucamy dalej, by odpowiedź API również mogła zwrócić błąd (500)
        }
    }
}

const baselinkerExportService = new BaselinkerExportService();
baselinkerExportService.mergeFeaturesForBaselinker = mergeFeaturesForBaselinker;
baselinkerExportService.normalizeFeaturesForBaselinkerSchema = normalizeFeaturesForBaselinkerSchema;
baselinkerExportService.parseAndFormatNumericFeatureValue = parseAndFormatNumericFeatureValue;
baselinkerExportService.formatBaselinkerApiWarnings = formatBaselinkerApiWarnings;

module.exports = baselinkerExportService;
