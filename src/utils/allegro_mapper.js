const cheerio = require('cheerio');
const { normalizeInciToLegalEnglish, stripRawInciFooterFromSection3 } = require('../modules/offer-optimizer-v2/normalization');
const { resolveOrderedVisibleDescriptionSections } = require('../services/workspaceContentProfile.service');
const { auditOfferDraftCompliance } = require('../modules/offer-optimizer-v2/services/allegro-compliance.policy');
const { validateAllegroOfferTitle } = require('../modules/offer-optimizer-v2/services/title-optimizer.service');

const MAX_SAFETY_TEXT_LEN = 5000;
const MAX_ALLEGRO_DESCRIPTION_BYTES = 40000;
const MAX_ALLEGRO_OFFER_IMAGES_BUSINESS = 16;
const AI_ACT_DISCLOSURE_HTML = '<p>Zdjęcia aranżacyjne: tła wygenerowane cyfrowo. Wygląd produktu i opakowania jest autentyczny.</p>';

/**
 * Sprawdza, czy URL/DataURI nadaje się do eksportu jako zdjęcie produktowe (odrzuca placeholdery i zablokowane linki CDN BaseLinkera).
 */
function isValidExportImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    const isPlaceholder =
        trimmed.includes('upload.cdn.baselinker.com') ||
        trimmed.includes('placeholder.com') ||
        trimmed.includes('Wymagane nowe zdjęcie') ||
        trimmed.includes('Pusty slot') ||
        trimmed.includes('Slot #') ||
        trimmed.includes('Audyt') ||
        trimmed.includes('Analiza');
    const isValidFormat = trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/');
    return !isPlaceholder && isValidFormat;
}

function isAllegroHostedImageUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /^https?:\/\/[^/]*allegroimg\.com\//i.test(url.trim());
}

function getTrustedPathsSet(catalogProduct) {
    return new Set([
        ...(Array.isArray(catalogProduct?.trustedContent?.paths) ? catalogProduct.trustedContent.paths : []),
        ...(Array.isArray(catalogProduct?.trustedContent?.productPaths) ? catalogProduct.trustedContent.productPaths : [])
    ]);
}

function getOfferContentTrustFlags(catalogProduct) {
    const trustedPaths = getTrustedPathsSet(catalogProduct);
    return {
        trustedPaths,
        imagesBlockedByTrusted: trustedPaths.has('images') || trustedPaths.has('product.images'),
        descriptionBlockedByTrusted: trustedPaths.has('description') || trustedPaths.has('product.description'),
        titleBlockedByTrusted: trustedPaths.has('name') || trustedPaths.has('product.name')
    };
}

/**
 * Waliduje i porównuje zmianę tytułu oferty (`name` w `PATCH /sale/product-offers/{offerId}`)
 * pod kątem limitów Allegro (12–75 zn., min. 3 słowa, compliance) oraz blokady `trustedContent`.
 */
function evaluateAllegroOfferTitleUpdate({
    existingOffer = {},
    catalogProduct = null,
    nextTitle = '',
    includeTitle = false,
    brand = ''
} = {}) {
    const { titleBlockedByTrusted } = getOfferContentTrustFlags(catalogProduct);
    const currentTitle = String(existingOffer?.name || '').trim();
    const cleanNext = String(nextTitle || '').replace(/\s+/g, ' ').trim();
    const validation = cleanNext ? validateAllegroOfferTitle(cleanNext, { brand }) : null;
    const differs = Boolean(cleanNext && cleanNext !== currentTitle);

    const errors = [];
    const warnings = [];
    let effectiveIncludeTitle = Boolean(includeTitle && cleanNext);
    let changed = false;

    if (includeTitle) {
        if (!cleanNext) {
            effectiveIncludeTitle = false;
        } else if (titleBlockedByTrusted && differs) {
            effectiveIncludeTitle = false;
            warnings.push('Pole `name` (tytuł oferty) jest chronione przez Trusted Content w Katalogu Allegro — aktualizacja tytułu została zablokowana w Pre-flight.');
        } else if (differs) {
            if (validation && !validation.valid) {
                for (const err of (validation.errors || [])) {
                    errors.push(`[Tytuł oferty (name)] ${err}`);
                }
                changed = true;
            } else {
                changed = true;
                for (const w of (validation?.warnings || [])) {
                    warnings.push(`[Tytuł oferty (name)] ${w}`);
                }
            }
        }
    }

    const willUpdate = Boolean(effectiveIncludeTitle && changed && (!validation || validation.valid));
    const displayTarget = cleanNext || currentTitle;

    return {
        effectiveIncludeTitle,
        blockedByTrusted: titleBlockedByTrusted,
        changed,
        nextTitleForPatch: willUpdate ? cleanNext : null,
        errors,
        warnings,
        titlePreview: {
            current: currentTitle,
            next: displayTarget,
            changed: differs,
            willUpdate,
            blockedByTrusted: titleBlockedByTrusted,
            length: [...displayTarget].length,
            validation
        }
    };
}

function normalizeOfferImageUrls(rawImages) {
    if (!Array.isArray(rawImages)) return [];
    const seen = new Set();
    const out = [];
    for (const img of rawImages) {
        const rawUrl = typeof img === 'string' ? img : (img && typeof img.url === 'string' ? img.url : '');
        const clean = String(rawUrl || '').trim();
        if (!clean || seen.has(clean)) continue;
        seen.add(clean);
        out.push(clean);
    }
    return out;
}

function cloneStandardizedDescription(rawDescription) {
    if (!rawDescription || !Array.isArray(rawDescription.sections) || rawDescription.sections.length === 0) {
        return null;
    }
    return {
        sections: rawDescription.sections.map(section => ({
            ...section,
            items: Array.isArray(section?.items) ? section.items.map(item => ({ ...item })) : []
        }))
    };
}

/**
 * Zabezpiecza własny opis i galerię edytowanej oferty przed nadpisaniem z Katalogu Produktów Allegro.
 * Zgodnie z dokumentacją Allegro `PATCH /sale/product-offers/{offerId}` (`01`..`04`, `#4691`, `#12104`, `#11981`),
 * przekazanie `productSet[].product.id` uruchamia resynchronizację z Katalogu (`request > product > offer`),
 * dlatego wymagane jest jawne przekazanie `description`, `images` oraz `product.images = []` (poza polami `trustedContent`).
 */
function buildPreservedOfferContentForProductPatch({ existingOffer = {}, catalogProduct = null } = {}) {
    const { imagesBlockedByTrusted, descriptionBlockedByTrusted } = getOfferContentTrustFlags(catalogProduct);
    const currentOfferImages = normalizeOfferImageUrls(existingOffer?.images);
    const clonedDescription = cloneStandardizedDescription(existingOffer?.description);
    const warnings = [];

    let preservedDescription = null;
    if (descriptionBlockedByTrusted) {
        warnings.push('Pole `description` jest oznaczone jako Trusted Content w Katalogu Allegro — pozostawiono obsługę katalogową opisu.');
    } else if (clonedDescription) {
        preservedDescription = clonedDescription;
    } else {
        warnings.push('Edytowana oferta nie posiada własnych sekcji w `description` — Allegro może zaktualizować opis z karty katalogowej.');
    }

    let preservedImages = null;
    let suppressCatalogProductImages = false;
    let preservedAiCoCreatedContent = null;

    if (imagesBlockedByTrusted) {
        warnings.push('Pole `images` jest oznaczone jako Trusted Content w Katalogu Allegro — nie zastosowano blokady zdjęć katalogowych.');
    } else if (currentOfferImages.length > 0) {
        preservedImages = currentOfferImages;
        suppressCatalogProductImages = true;
        const allowedSet = new Set(currentOfferImages);
        const existingAiImages = Array.isArray(existingOffer?.aiCoCreatedContent?.images)
            ? existingOffer.aiCoCreatedContent.images
                .map(entry => (entry && typeof entry.url === 'string' ? entry.url.trim() : ''))
                .filter(url => url && allowedSet.has(url))
                .map(url => ({ url }))
            : [];
        if (existingAiImages.length > 0) {
            preservedAiCoCreatedContent = { images: existingAiImages };
        }
    } else {
        warnings.push('Edytowana oferta nie posiada własnych zdjęć w `images` — pominięto `product.images: []`, aby uniknąć wyczyszczenia galerii.');
    }

    return {
        description: preservedDescription,
        images: preservedImages,
        suppressCatalogProductImages,
        aiCoCreatedContent: preservedAiCoCreatedContent,
        warnings,
        summary: {
            active: true,
            productSetPatched: true,
            imagesPreservedCount: preservedImages ? preservedImages.length : 0,
            suppressCatalogProductImages,
            imagesTrustedLocked: imagesBlockedByTrusted,
            descriptionSectionsPreserved: preservedDescription ? preservedDescription.sections.length : 0,
            descriptionTrustedLocked: descriptionBlockedByTrusted,
            aiCoCreatedImagesPreserved: preservedAiCoCreatedContent ? preservedAiCoCreatedContent.images.length : 0
        }
    };
}

const NON_INCI_PLACEHOLDERS = new Set([
    'koncentrat', 'plyn', 'zel', 'proszek', 'kapsulki', 'tabletki', 'pianka', 'spray',
    'balsam', 'krem', 'kostka', 'chusteczki', 'mleczko', 'zawiesina', 'emulsja',
    'nowy', 'oryginalne', 'tak', 'nie', 'brak', 'dotyczy', 'nie dotyczy', 'n/a', '-'
]);

/**
 * Normalizuje klucz/wartość tekstową do porównań niezależnych od wielkości liter i diakrytyków.
 */
function normalizeTextKey(str) {
    if (str === undefined || str === null) return '';
    return String(str)
        .toLowerCase()
        .replace(/ł/g, 'l')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Skryptowy Mapper Allegro -> Allegro (zachowany dla kompatybilności wstecznej z supervisor.service.js).
 * Służy do przypisania parametrów z Katalogu Allegro (hardFeatures) do nazw wartości ze schematu.
 */
function mapAllegroParameters(hardFeatures, requiredSchema) {
    if (!hardFeatures || Object.keys(hardFeatures).length === 0) return {};
    if (!requiredSchema || !Array.isArray(requiredSchema)) return hardFeatures;

    const mappedFeatures = {};
    const normalize = (str) => (typeof str !== 'string' ? String(str) : str).toLowerCase().trim();

    requiredSchema.forEach(param => {
        const catalogValue = hardFeatures[param.name];
        if (catalogValue !== undefined && catalogValue !== null) {
            if (param.type === 'dictionary' && Array.isArray(param.dictionary)) {
                const normalizedCatalog = normalize(catalogValue);
                const exactMatch = param.dictionary.find(d => normalize(d.value) === normalizedCatalog);
                if (exactMatch) {
                    mappedFeatures[param.name] = exactMatch.value;
                } else {
                    const partialMatch = param.dictionary.find(d => {
                        const normDict = normalize(d.value);
                        return normDict.includes(normalizedCatalog) || normalizedCatalog.includes(normDict);
                    });
                    mappedFeatures[param.name] = partialMatch ? partialMatch.value : catalogValue;
                }
            } else {
                mappedFeatures[param.name] = catalogValue;
            }
        }
    });

    return mappedFeatures;
}

/**
 * Dekoduje encje HTML, konwertuje strukturę HTML na czyste wiersze tekstowe oraz usuwa wszystkie emotikony/piktogramy.
 */
function stripHtmlAndEmoticons(htmlStr) {
    if (!htmlStr || typeof htmlStr !== 'string') return '';

    let text = htmlStr
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:h1|h2|h3|h4|p|li|div|tr)>/gi, '\n')
        .replace(/<li\b[^>]*>/gi, '\n- ')
        .replace(/<\/?[a-zA-Z][^>]*>/g, '');

    text = text
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(\d+);/g, (_, code) => {
            const num = parseInt(code, 10);
            return Number.isFinite(num) ? String.fromCodePoint(num) : '';
        });

    // Usunięcie wszystkich emotikonów, piktogramów, strzałek i selektorów wariacji Unicode
    try {
        text = text.replace(/[\uFE0E\uFE0F\u200D]/g, '');
        text = text.replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, '');
    } catch (_) {
        text = text.replace(/[\u2600-\u27BF\uD83C-\uDBFF\uDC00-\uDFFF]/g, '');
    }

    // Usunięcie osieroconych symboli graficznych typu ➡️ / ⚠️ / ★ na wypadek starszych silników RegExp
    text = text.replace(/[⭐❓⚙️✍️⚖️⚠️✅✔️☑️❌➡️♻️⚡⛔🛡️🔥😱💥😍🚀☘☂️★☆•●▪]/g, '');

    const lines = text
        .split(/\r?\n/)
        .map(line => line.replace(/^\s*[-*]+\s*/, '- ').replace(/[ \t]{2,}/g, ' ').trim())
        .filter(line => line !== '' && line !== '-');

    return lines.join('\n').trim();
}

/**
 * Wyciąga czysty tekst ostrzeżeń i zasad bezpieczeństwa z wygenerowanego opisu (Sekcja 6 / fallbacki)
 * pod pole `productSet[0].safetyInformation` (type: "TEXT", bez HTML i bez emotikonów, max 5000 znaków).
 */
function extractSafetyInformationText({ htmlContent = null, descriptionHtml = '', features = {} } = {}) {
    let rawSafetyHtml = '';
    let source = null;

    const sec6 = htmlContent && typeof htmlContent === 'object' ? (htmlContent.sekcja6 || htmlContent.section_6_html || '') : '';
    const sec5 = htmlContent && typeof htmlContent === 'object' ? (htmlContent.sekcja5 || htmlContent.section_5_html || '') : '';
    const sec4 = htmlContent && typeof htmlContent === 'object' ? (htmlContent.sekcja4 || htmlContent.section_4_html || '') : '';

    if (sec6 && stripHtmlAndEmoticons(sec6).length >= 10) {
        rawSafetyHtml = sec6;
        source = 'offerDraft.sekcja6';
    } else if (sec5 && /(?:bezpieczeństw|ostrzeżen|gpsr|clp|przechowyw)/i.test(sec5)) {
        const matchSafetyHeading = sec5.match(/<h[12][^>]*>[^<]*(?:bezpieczeństw|ostrzeżen|gpsr|clp)[^<]*<\/h[12]>[\s\S]*/i);
        rawSafetyHtml = matchSafetyHeading ? matchSafetyHeading[0] : sec5;
        source = 'offerDraft.sekcja5';
    } else if (descriptionHtml && /(?:bezpieczeństw|ostrzeżen|gpsr|clp)/i.test(descriptionHtml)) {
        const matchDescHeading = descriptionHtml.match(/<h[12][^>]*>[^<]*(?:bezpieczeństw|ostrzeżen|gpsr|clp)[^<]*<\/h[12]>[\s\S]*/i);
        rawSafetyHtml = matchDescHeading ? matchDescHeading[0] : '';
        source = rawSafetyHtml ? 'descriptionHtml' : null;
    }

    const cleanedLines = [];
    if (rawSafetyHtml) {
        const plain = stripHtmlAndEmoticons(rawSafetyHtml);
        for (const line of plain.split('\n')) {
            const cleanLine = line.replace(/^- /, '').trim();
            if (!cleanLine) continue;
            // Odfiltrowujemy ogólny nagłówek sekcji opisu oraz linię podmiotu odpowiedzialnego UE (Allegro ma do tego osobne pola GPSR)
            if (/^(?:informacje\s+(?:o|dotyczące)\s+bezpieczeństw[aeyiu]?(?:\s+i\s+przechowywaniu)?|bezpieczeństwo(?:\s+i\s+(?:przechowywanie|informacje\s+gpsr))?|ostrzeżenia\s+i\s+bezpieczeństwo)\s*:?$/i.test(cleanLine)) {
                continue;
            }
            if (/^podmiot\s+odpowiedzialny\s+w\s+ue\s*:/i.test(cleanLine)) {
                continue;
            }
            // Pomijamy komunikaty AI Act o tle zdjęć
            if (/zdjęcia\s+aranżacyjne\s*:\s*tła\s+wygenerowane\s+cyfrowo/i.test(cleanLine)) {
                continue;
            }
            cleanedLines.push(cleanLine);
        }
    }

    // Opcjonalnie dołączamy wyodrębniony blok WYKLUCZENIE ZASTOSOWANIA z Sekcji 4, jeśli nie ma go już w ostrzeżeniach
    if (sec4 && /WYKLUCZENIE\s+ZASTOSOWANIA/i.test(sec4)) {
        const exclMatch = sec4.match(/<p[^>]*>[\s\S]*?WYKLUCZENIE\s+ZASTOSOWANIA[\s\S]*?<\/p>/i);
        if (exclMatch) {
            const exclPlain = stripHtmlAndEmoticons(exclMatch[0]).replace(/^- /, '').trim();
            const alreadyPresent = cleanedLines.some(l => l.toLowerCase().includes('wykluczenie zastosowania'));
            if (exclPlain && !alreadyPresent) {
                cleanedLines.push(exclPlain);
            }
        }
    }

    // Fallback do pola PIM Ostrzeżenia, gdy brak sekcji ostrzeżeń w opisie
    if (cleanedLines.length === 0 && features && typeof features === 'object') {
        const pimWarn = features['Ostrzeżenia'] || features['Ostrzezenia'] || features['Informacje o bezpieczeństwie'];
        if (pimWarn && String(pimWarn).trim().length >= 3) {
            const plainPim = stripHtmlAndEmoticons(String(pimWarn));
            if (plainPim) {
                cleanedLines.push(...plainPim.split('\n').map(l => l.replace(/^- /, '').trim()).filter(Boolean));
                source = 'features.Ostrzeżenia';
            }
        }
    }

    // Usuwamy ewentualne pozostałe adresy e-mail lub linki www (polityka Allegro)
    let text = cleanedLines
        .map(line => line
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '')
            .replace(/https?:\/\/\S+/gi, '')
            .replace(/\bwww\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim()
        )
        .filter(Boolean)
        .join('\n')
        .trim();

    if (!text) {
        return { text: '', source: null, truncated: false, originalLength: 0 };
    }

    const originalLength = text.length;
    let truncated = false;
    if (text.length > MAX_SAFETY_TEXT_LEN) {
        truncated = true;
        const sliced = text.slice(0, MAX_SAFETY_TEXT_LEN - 3);
        const lastNewline = sliced.lastIndexOf('\n');
        text = (lastNewline > MAX_SAFETY_TEXT_LEN * 0.6 ? sliced.slice(0, lastNewline) : sliced.trimEnd()) + '...';
    }

    return { text, source, truncated, originalLength };
}

/**
 * Przygotowuje czysty skład INCI w kanonicznej notacji angielskiej do wysłania przez API Allegro.
 * Priorytetyzuje aktualne pola z Karty Technicznej PIM (features), a następnie fallback z offerDraft.ingredients_inci.
 */
function extractCleanInciForAllegro({ features = {}, ingredientsInci = '' } = {}) {
    const candidates = [
        features?.['Skład/INCI'],
        features?.['INCI'],
        features?.['Skład'],
        features?.['skład'],
        features?.['SKŁAD'],
        ingredientsInci
    ];

    for (const rawCandidate of candidates) {
        if (!rawCandidate || typeof rawCandidate !== 'string') continue;

        let clean = stripHtmlAndEmoticons(rawCandidate)
            .replace(/^(?:skład\s*\(zgodnie\s+z\s+rozp\.[^)]*\)|pełny\s+skład(?:\s+inci)?|skład\s*inci|skład\s*\/\s*inci|ingredients|inci|skład)\s*:?\s*/i, '')
            .replace(/\n+/g, ', ')
            .replace(/\s{2,}/g, ' ')
            .trim();

        if (!clean || clean.length < 4 || NON_INCI_PLACEHOLDERS.has(normalizeTextKey(clean))) {
            continue;
        }

        try {
            clean = normalizeInciToLegalEnglish(clean);
        } catch (_) {
            // Fallback do oczyszczonego surowego ciągu w razie braku słownika
        }

        // Usuwa wyłącznie amerykańskie/synonimowe dopiski FDA/CTFA w nawiasach kwadratowych (np. "AQUA [WATER]" -> "AQUA", "CI 19140 [YELLOW 5]" -> "CI 19140"),
        // bez naruszania nazw INCI ani botanicznych nawiasów okrągłych.
        clean = clean
            .replace(/\s*\[[A-Za-z0-9\s/-]{1,40}\]/g, '')
            .replace(/\s+,/g, ',')
            .replace(/\s{2,}/g, ' ')
            .trim();

        const trimmed = clean.trim();
        if (trimmed.length >= 4 && !NON_INCI_PLACEHOLDERS.has(normalizeTextKey(trimmed))) {
            return trimmed;
        }
    }

    return '';
}

/**
 * Konwertuje wartość z PIM (z możliwą jednostką np. "750 ml", "0,5 l", "850 g")
 * do jednostki oczekiwanej przez parametr Allegro (`param.unit`: "l", "ml", "kg", "g", "mm", "cm", "m").
 */
function convertValueToParameterUnit(rawVal, param) {
    if (rawVal === undefined || rawVal === null) return { error: 'Brak wartości liczbowej' };

    const rawStr = String(rawVal).trim();
    if (!rawStr) return { error: 'Pusta wartość liczbowa' };

    // Wyciągnij liczbę oraz ewentualną jednostkę źródłową z tekstu
    const match = rawStr.match(/(-?\d+(?:[.,]\d+)?)\s*(ml|cl|l|litr(?:y|ów)?|mg|dag|dkg|g|gr|kg|mm|cm|m|szt\.?)?/i);
    if (!match) {
        return { error: `Nie można sparsować liczby z "${rawStr}"` };
    }

    let num = parseFloat(match[1].replace(',', '.'));
    if (!Number.isFinite(num)) {
        return { error: `Nieprawidłowa liczba "${rawStr}"` };
    }

    const srcUnitRaw = match[2] ? match[2].toLowerCase() : '';
    const srcUnit = srcUnitRaw.startsWith('litr')
        ? 'l'
        : (srcUnitRaw === 'gr' ? 'g' : (srcUnitRaw === 'dkg' ? 'dag' : srcUnitRaw.replace(/\.$/, '')));
    const targetUnit = param.unit ? String(param.unit).toLowerCase().trim() : '';

    if (targetUnit && srcUnit && srcUnit !== targetUnit) {
        // Przeliczanie jednostek objętości
        if (srcUnit === 'ml' && targetUnit === 'l') num = num / 1000;
        else if (srcUnit === 'cl' && targetUnit === 'l') num = num / 100;
        else if (srcUnit === 'l' && targetUnit === 'ml') num = num * 1000;
        else if (srcUnit === 'cl' && targetUnit === 'ml') num = num * 10;
        else if (srcUnit === 'ml' && targetUnit === 'cl') num = num / 10;
        else if (srcUnit === 'l' && targetUnit === 'cl') num = num * 100;
        // Przeliczanie jednostek masy
        else if (srcUnit === 'mg' && targetUnit === 'g') num = num / 1000;
        else if (srcUnit === 'g' && targetUnit === 'mg') num = num * 1000;
        else if (srcUnit === 'mg' && targetUnit === 'kg') num = num / 1000000;
        else if (srcUnit === 'kg' && targetUnit === 'mg') num = num * 1000000;
        else if (srcUnit === 'dag' && targetUnit === 'g') num = num * 10;
        else if (srcUnit === 'g' && targetUnit === 'dag') num = num / 10;
        else if (srcUnit === 'dag' && targetUnit === 'kg') num = num / 100;
        else if (srcUnit === 'kg' && targetUnit === 'dag') num = num * 100;
        else if (srcUnit === 'g' && targetUnit === 'kg') num = num / 1000;
        else if (srcUnit === 'kg' && targetUnit === 'g') num = num * 1000;
        // Przeliczanie jednostek długości
        else if (srcUnit === 'mm' && targetUnit === 'cm') num = num / 10;
        else if (srcUnit === 'cm' && targetUnit === 'mm') num = num * 10;
        else if (srcUnit === 'cm' && targetUnit === 'm') num = num / 100;
        else if (srcUnit === 'm' && targetUnit === 'cm') num = num * 100;
        else if (srcUnit === 'mm' && targetUnit === 'm') num = num / 1000;
        else if (srcUnit === 'm' && targetUnit === 'mm') num = num * 1000;
    }

    const restrictions = param.restrictions || {};
    const precision = param.type === 'integer'
        ? 0
        : (typeof restrictions.precision === 'number' && restrictions.precision >= 0 ? Math.min(8, restrictions.precision) : 4);
    if (param.type === 'integer') {
        num = Math.round(num);
    } else if (typeof restrictions.precision === 'number' && restrictions.precision >= 0) {
        const factor = Math.pow(10, restrictions.precision);
        num = Math.round(num * factor) / factor;
    }

    if (typeof restrictions.min === 'number' && num < restrictions.min) {
        return { error: `Wartość ${num} poniżej minimum (${restrictions.min}${targetUnit ? ' ' + targetUnit : ''})` };
    }
    if (typeof restrictions.max === 'number' && num > restrictions.max) {
        return { error: `Wartość ${num} powyżej maksimum (${restrictions.max}${targetUnit ? ' ' + targetUnit : ''})` };
    }

    const formatted = param.type === 'integer'
        ? String(num)
        : num.toFixed(precision).replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');

    return { value: formatted };
}

/**
 * Koduje wartość z PIM zgodnie ze schematem parametru Allegro (`dictionary`, `integer`, `float`, `string`, `range`).
 */
function encodeParameterValue(rawValue, paramSchema, { preferredParentValueIds = [] } = {}) {
    if (rawValue === undefined || rawValue === null) {
        return { empty: true };
    }
    const trimmedRaw = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    if (trimmedRaw === '') {
        return { empty: true };
    }

    const type = paramSchema.type;
    const restrictions = paramSchema.restrictions || {};
    const options = paramSchema.options || {};

    if (type === 'range' || restrictions.range === true) {
        if (typeof trimmedRaw === 'object' && trimmedRaw.from !== undefined && trimmedRaw.to !== undefined) {
            return {
                encoded: {
                    id: paramSchema.id,
                    rangeValue: { from: String(trimmedRaw.from), to: String(trimmedRaw.to) },
                    values: [],
                    valuesIds: []
                },
                displayValue: `${trimmedRaw.from} - ${trimmedRaw.to}`
            };
        }
        const rangeMatch = String(trimmedRaw).match(/^\s*(-?\d+(?:[.,]\d+)?)\s*[-–]\s*(-?\d+(?:[.,]\d+)?)\s*$/);
        if (!rangeMatch) {
            return { error: `Parametr zakresowy wymaga formatu "od-do", otrzymano: "${trimmedRaw}"` };
        }
        const from = rangeMatch[1].replace(',', '.');
        const to = rangeMatch[2].replace(',', '.');
        return {
            encoded: {
                id: paramSchema.id,
                rangeValue: { from, to },
                values: [],
                valuesIds: []
            },
            displayValue: `${from} - ${to}`
        };
    }

    if (type === 'dictionary' && Array.isArray(paramSchema.dictionary) && paramSchema.dictionary.length > 0) {
        const allowMultiple = Boolean(restrictions.multipleChoices);
        const inputItems = Array.isArray(trimmedRaw)
            ? trimmedRaw.map(v => String(v).trim()).filter(Boolean)
            : (allowMultiple
                ? String(trimmedRaw).split(/[;,]/).map(v => v.trim()).filter(Boolean)
                : [String(trimmedRaw).trim()]);

        if (inputItems.length === 0) return { empty: true };

        const matchedIds = [];
        const matchedLabels = [];
        const customValues = [];
        const unmatched = [];

        const itemsToProcess = allowMultiple ? inputItems : [inputItems[0]];

        for (const item of itemsToProcess) {
            const normItem = normalizeTextKey(item);
            // 1. Sprawdź dokładne ID słownikowe lub wartość tekstową
            const exactCandidates = paramSchema.dictionary.filter(d =>
                String(d.id) === item || normalizeTextKey(d.value) === normItem
            );

            let chosen = null;
            if (exactCandidates.length === 1) {
                chosen = exactCandidates[0];
            } else if (exactCandidates.length > 1) {
                // Preferuj wpis pasujący do wybranego parametru nadrzędnego (`dependsOnParameterId`)
                chosen = exactCandidates.find(c =>
                    Array.isArray(c.dependsOnValueIds) &&
                    c.dependsOnValueIds.some(depId => preferredParentValueIds.includes(depId))
                ) || exactCandidates[0];
            }

            // 2. Fallback częściowego dopasowania tylko jeśli jest jednoznaczne
            if (!chosen) {
                const partialCandidates = paramSchema.dictionary.filter(d => {
                    const nd = normalizeTextKey(d.value);
                    return nd.length >= 3 && (nd === normItem || nd.includes(normItem) || normItem.includes(nd));
                });
                if (partialCandidates.length === 1) {
                    chosen = partialCandidates[0];
                }
            }

            if (chosen) {
                if (!matchedIds.includes(chosen.id)) {
                    matchedIds.push(chosen.id);
                    matchedLabels.push(chosen.value);
                }
            } else if (options.ambiguousValueId && customValues.length === 0 && !allowMultiple) {
                if (!matchedIds.includes(options.ambiguousValueId)) {
                    matchedIds.push(options.ambiguousValueId);
                }
                customValues.push(item);
                matchedLabels.push(`Inna (${item})`);
            } else {
                unmatched.push(item);
            }
        }

        if (unmatched.length > 0 && matchedIds.length === 0) {
            return {
                error: `Wartość "${unmatched.join(', ')}" nie występuje w słowniku Allegro dla "${paramSchema.name}" (brak opcji "Inna")`
            };
        }

        const encoded = {
            id: paramSchema.id,
            valuesIds: matchedIds
        };
        if (customValues.length > 0) {
            encoded.values = customValues;
        }
        return {
            encoded,
            displayValue: matchedLabels.join(', '),
            partialWarning: unmatched.length > 0 ? `Pominięto nieznane wartości słownikowe: ${unmatched.join(', ')}` : null
        };
    }

    if (type === 'integer' || type === 'float') {
        const conv = convertValueToParameterUnit(trimmedRaw, paramSchema);
        if (conv.error) return { error: conv.error };
        const unitSuffix = paramSchema.unit ? ` ${paramSchema.unit}` : '';
        return {
            encoded: {
                id: paramSchema.id,
                values: [conv.value]
            },
            displayValue: `${conv.value}${unitSuffix}`
        };
    }

    // Domyślnie typ `string`
    let strVal = String(trimmedRaw).trim();
    if (typeof restrictions.minLength === 'number' && strVal.length < restrictions.minLength) {
        return { error: `Tekst za krótki (min ${restrictions.minLength} zn.)` };
    }
    if (typeof restrictions.maxLength === 'number' && strVal.length > restrictions.maxLength) {
        strVal = strVal.slice(0, restrictions.maxLength).trim();
    }
    return {
        encoded: {
            id: paramSchema.id,
            values: [strVal]
        },
        displayValue: strVal
    };
}

/**
 * Sprawdza czy spełniony jest warunek `requiredIf` parametru na podstawie aktualnego stanu parametrów.
 */
function isConditionMetForRequiredIf(paramSchema, allParamsMap) {
    const reqIf = paramSchema?.requiredIf;
    if (!reqIf || !Array.isArray(reqIf.parametersWithValue) || reqIf.parametersWithValue.length === 0) {
        return false;
    }
    return reqIf.parametersWithValue.every(cond => {
        const currentParam = allParamsMap.get(String(cond.id));
        if (!currentParam) return false;
        const currentIds = Array.isArray(currentParam.valuesIds) ? currentParam.valuesIds.map(String) : [];
        if (Array.isArray(cond.oneOfValueIds) && cond.oneOfValueIds.length > 0) {
            return cond.oneOfValueIds.some(id => currentIds.includes(String(id)));
        }
        return true;
    });
}

/**
 * Odczytuje czytelną reprezentację istniejącego parametru z Allegro (`GET /sale/product-offers/{offerId}`).
 */
function formatAllegroParamDisplay(existingParam, paramSchema) {
    if (!existingParam) return '';
    if (existingParam.rangeValue && (existingParam.rangeValue.from !== undefined || existingParam.rangeValue.to !== undefined)) {
        return `${existingParam.rangeValue.from ?? ''} - ${existingParam.rangeValue.to ?? ''}`.trim();
    }
    const labels = [];
    if (Array.isArray(existingParam.valuesIds) && existingParam.valuesIds.length > 0 && paramSchema?.dictionary) {
        for (const vid of existingParam.valuesIds) {
            if (paramSchema.options?.ambiguousValueId && String(vid) === String(paramSchema.options.ambiguousValueId) && Array.isArray(existingParam.values) && existingParam.values.length > 0) {
                labels.push(`Inna (${existingParam.values.join(', ')})`);
            } else {
                const dictItem = paramSchema.dictionary.find(d => String(d.id) === String(vid));
                labels.push(dictItem ? dictItem.value : String(vid));
            }
        }
        return labels.join(', ');
    }
    if (Array.isArray(existingParam.values) && existingParam.values.length > 0) {
        const unitSuffix = paramSchema?.unit ? ` ${paramSchema.unit}` : '';
        return `${existingParam.values.join(', ')}${unitSuffix}`;
    }
    if (Array.isArray(existingParam.valuesIds) && existingParam.valuesIds.length > 0) {
        return existingParam.valuesIds.join(', ');
    }
    return '';
}

/**
 * Porównuje dwa zakodowane parametry Allegro pod kątem realnej zmiany wartości.
 */
function areAllegroParamsEqual(existingParam, encodedParam, paramSchema = null) {
    if (!existingParam || !encodedParam) return false;
    const sortUnique = (arr) => Array.from(new Set((Array.isArray(arr) ? arr : []).map(v => String(v).trim()).filter(Boolean))).sort();
    const eIds = sortUnique(existingParam.valuesIds);
    const nIds = sortUnique(encodedParam.valuesIds);
    if (eIds.length !== nIds.length || eIds.some((v, idx) => v !== nIds[idx])) {
        return false;
    }

    const isPlainDictWithoutCustom = paramSchema?.type === 'dictionary' && (!encodedParam.values || encodedParam.values.length === 0);
    if (!isPlainDictWithoutCustom) {
        const eVals = sortUnique(existingParam.values);
        const nVals = sortUnique(encodedParam.values);
        if (eVals.length !== nVals.length || eVals.some((v, idx) => v !== nVals[idx])) {
            return false;
        }
    }

    const eRange = existingParam.rangeValue || null;
    const nRange = encodedParam.rangeValue || null;
    if (Boolean(eRange) !== Boolean(nRange)) return false;
    if (eRange && nRange && (String(eRange.from ?? '') !== String(nRange.from ?? '') || String(eRange.to ?? '') !== String(nRange.to ?? ''))) {
        return false;
    }
    return true;
}

/**
 * Zamienia obiekt parametru z GET na czysty obiekt wejściowy akceptowany przez PATCH.
 */
function sanitizeExistingParamForPatch(existingParam) {
    const clean = { id: String(existingParam.id) };
    if (Array.isArray(existingParam.valuesIds) && existingParam.valuesIds.length > 0) {
        clean.valuesIds = existingParam.valuesIds.map(String);
    }
    if (Array.isArray(existingParam.values) && existingParam.values.length > 0) {
        clean.values = existingParam.values.map(String);
    }
    if (existingParam.rangeValue && (existingParam.rangeValue.from !== undefined || existingParam.rangeValue.to !== undefined)) {
        clean.rangeValue = {
            from: existingParam.rangeValue.from !== undefined ? String(existingParam.rangeValue.from) : null,
            to: existingParam.rangeValue.to !== undefined ? String(existingParam.rangeValue.to) : null
        };
    }
    return clean;
}

/**
 * Bezpiecznie wyszukuje surową wartość w `features` i twardych polach `Product` (bez halucynowania MPN z SKU).
 */
function resolvePimRawValueForParam(paramSchema, normalizedFeatureMap, product) {
    const normName = normalizeTextKey(paramSchema.name);
    if (normalizedFeatureMap.has(normName)) {
        return normalizedFeatureMap.get(normName);
    }

    const paramId = String(paramSchema.id);
    if (paramId === '225693' || normName === 'ean (gtin)' || normName === 'ean') {
        return normalizedFeatureMap.get('ean') || normalizedFeatureMap.get('gtin') || product?.ean || null;
    }
    if (paramId === '248811' || normName === 'marka') {
        return product?.brand?.name || null;
    }
    if (paramId === '17448' || normName === 'waga produktu z opakowaniem jednostkowym') {
        if (normalizedFeatureMap.has('waga brutto')) return normalizedFeatureMap.get('waga brutto');
        if (normalizedFeatureMap.has('waga z opakowaniem')) return normalizedFeatureMap.get('waga z opakowaniem');
        if (product?.weight && Number(product.weight) > 0) return `${product.weight} kg`;
        return null;
    }
    if (normName === 'pojemnosc') {
        return normalizedFeatureMap.get('pojemnosc / waga') || normalizedFeatureMap.get('pojemnosc netto') || null;
    }
    if (normName === 'waga') {
        if (product?.weight && Number(product.weight) > 0) return `${product.weight} kg`;
        return null;
    }
    if (paramId === '224017' || normName === 'kod producenta') {
        return normalizedFeatureMap.get('mpn') || null;
    }
    if (normName === 'skladnik wiodacy') {
        return normalizedFeatureMap.get('skladniki wiodace (front)') || normalizedFeatureMap.get('skladnik aktywny') || null;
    }
    if (paramSchema?.type === 'string' && (normName === 'sklad' || normName === 'sklad inci' || normName === 'inci' || normName === 'sklad produktu' || normName === 'skladniki')) {
        const cleanInci = extractCleanInciForAllegro({
            features: {
                'Skład/INCI': normalizedFeatureMap.get('sklad/inci') || '',
                'INCI': normalizedFeatureMap.get('inci') || '',
                'Skład': normalizedFeatureMap.get('sklad') || ''
            }
        });
        return cleanInci || null;
    }
    return null;
}

/**
 * Buduje kompletny, bezpieczny pod RFC 7396 payload `PATCH /sale/product-offers/{offerId}` wraz z raportem diff i blokadami.
 */
function buildAllegroParameterPatchPayload({
    product = {},
    features = {},
    categoryParameters = [],
    existingOffer = {},
    catalogProduct = null,
    selectedParamIds = null,
    safetyInfoPayload = null,
    compositionPayload = null,
    titlePayload = null
} = {}) {
    const errors = [];
    const warnings = [];
    const diffRows = [];

    const normalizedFeatureMap = new Map();
    if (features && typeof features === 'object') {
        for (const [k, v] of Object.entries(features)) {
            if (v !== undefined && v !== null && String(v).trim() !== '') {
                normalizedFeatureMap.set(normalizeTextKey(k), v);
            }
        }
    }

    const trustedPaths = getTrustedPathsSet(catalogProduct);
    const isAllProductParamsTrusted = trustedPaths.has('parameters') || trustedPaths.has('product.parameters');

    const existingOfferParams = Array.isArray(existingOffer?.parameters) ? existingOffer.parameters : [];
    const existingProductSet = Array.isArray(existingOffer?.productSet) ? existingOffer.productSet : [];
    const primarySetItem = existingProductSet[0] || null;
    const existingProductParams = Array.isArray(primarySetItem?.product?.parameters) ? primarySetItem.product.parameters : [];

    const existingOfferMap = new Map(existingOfferParams.map(p => [String(p.id), sanitizeExistingParamForPatch(p)]));
    const existingProductMap = new Map(existingProductParams.map(p => [String(p.id), sanitizeExistingParamForPatch(p)]));

    const schemaMap = new Map((categoryParameters || []).map(p => [String(p.id), p]));

    // Zbieramy wartości parametrów nadrzędnych dla podpowiedzi `dependsOnParameterId`
    const currentParentIds = [];
    for (const p of [...existingOfferParams, ...existingProductParams]) {
        if (Array.isArray(p.valuesIds)) currentParentIds.push(...p.valuesIds.map(String));
    }

    // Sortujemy parametry, aby nadrzędne (`dependsOnParameterId === null`) były przetwarzane przed zależnymi
    const sortedSchema = [...(categoryParameters || [])].sort((a, b) => {
        const aDep = a.options?.dependsOnParameterId ? 1 : 0;
        const bDep = b.options?.dependsOnParameterId ? 1 : 0;
        return aDep - bDep;
    });

    const selectedSet = Array.isArray(selectedParamIds) ? new Set(selectedParamIds.map(String)) : null;

    const mergedOfferMap = new Map(existingOfferMap);
    const mergedProductMap = new Map(existingProductMap);

    let offerParamsChanged = false;
    let productParamsChanged = false;

    for (const paramSchema of sortedSchema) {
        const paramId = String(paramSchema.id);
        const isProductParam = Boolean(paramSchema.options?.describesProduct);
        const targetMap = isProductParam ? mergedProductMap : mergedOfferMap;
        const existingParam = isProductParam ? existingProductMap.get(paramId) : existingOfferMap.get(paramId);

        const rawPimValue = resolvePimRawValueForParam(paramSchema, normalizedFeatureMap, product);
        const currentDisplay = formatAllegroParamDisplay(existingParam, paramSchema);

        const isTrustedParam = isProductParam && (
            Boolean(paramSchema.options?.isTrusted) ||
            isAllProductParamsTrusted ||
            trustedPaths.has(`parameters.${paramId}`) ||
            trustedPaths.has(`product.parameters.${paramId}`)
        );

        if (rawPimValue === null || rawPimValue === undefined || String(rawPimValue).trim() === '') {
            continue;
        }

        if (selectedSet && !selectedSet.has(paramId)) {
            continue;
        }

        const encRes = encodeParameterValue(rawPimValue, paramSchema, { preferredParentValueIds: currentParentIds });
        if (encRes.empty) continue;

        if (encRes.error) {
            errors.push(`[${paramSchema.name}] ${encRes.error}`);
            diffRows.push({
                id: paramId,
                name: paramSchema.name,
                section: isProductParam ? 'PRODUCT' : 'OFFER',
                required: Boolean(paramSchema.required),
                currentValue: currentDisplay,
                nextValue: String(rawPimValue),
                status: 'VALIDATION_ERROR',
                message: encRes.error
            });
            continue;
        }

        if (encRes.partialWarning) {
            warnings.push(`[${paramSchema.name}] ${encRes.partialWarning}`);
        }

        if (Array.isArray(encRes.encoded.valuesIds)) {
            currentParentIds.push(...encRes.encoded.valuesIds.map(String));
        }

        const isSame = existingParam ? areAllegroParamsEqual(existingParam, encRes.encoded, paramSchema) : false;
        if (isSame) {
            diffRows.push({
                id: paramId,
                name: paramSchema.name,
                section: isProductParam ? 'PRODUCT' : 'OFFER',
                required: Boolean(paramSchema.required),
                currentValue: currentDisplay,
                nextValue: encRes.displayValue,
                status: 'UNCHANGED',
                message: 'Zgodne z Allegro'
            });
            continue;
        }

        if (paramSchema.restrictions?.multipleChoices && existingParam && Array.isArray(existingParam.valuesIds) && Array.isArray(encRes.encoded.valuesIds) && existingParam.valuesIds.length > encRes.encoded.valuesIds.length) {
            warnings.push(`[${paramSchema.name}] Na Allegro jest obecnie zaznaczonych więcej opcji (${existingParam.valuesIds.length}) niż w PIM (${encRes.encoded.valuesIds.length}) — wysyłka nadpisze listę wartościami z PIM.`);
        }

        if (isTrustedParam) {
            const trustedMsg = 'Pole chronione przez Trusted Content w Katalogu Allegro (wymaga change-proposal lub dopasowania do katalogu)';
            warnings.push(`[${paramSchema.name}] ${trustedMsg}`);
            diffRows.push({
                id: paramId,
                name: paramSchema.name,
                section: 'PRODUCT',
                required: Boolean(paramSchema.required),
                currentValue: currentDisplay,
                nextValue: encRes.displayValue,
                status: 'BLOCKED_TRUSTED_CONTENT',
                message: trustedMsg
            });
            continue;
        }

        targetMap.set(paramId, encRes.encoded);
        if (isProductParam) productParamsChanged = true;
        else offerParamsChanged = true;

        diffRows.push({
            id: paramId,
            name: paramSchema.name,
            section: isProductParam ? 'PRODUCT' : 'OFFER',
            required: Boolean(paramSchema.required),
            currentValue: currentDisplay,
            nextValue: encRes.displayValue,
            status: existingParam ? 'UPDATE' : 'ADD',
            message: existingParam ? 'Aktualizacja wartości' : 'Uzupełnienie brakującego parametru'
        });
    }

    // Walidacja wymaganych i warunkowo wymaganych (`requiredIf`) parametrów po scaleniu
    const combinedMergedMap = new Map([...mergedOfferMap, ...mergedProductMap]);
    const missingRequired = [];
    for (const paramSchema of sortedSchema) {
        const paramId = String(paramSchema.id);
        const isCondReq = isConditionMetForRequiredIf(paramSchema, combinedMergedMap);
        if ((paramSchema.required || isCondReq) && !combinedMergedMap.has(paramId)) {
            missingRequired.push({
                id: paramId,
                name: paramSchema.name,
                section: paramSchema.options?.describesProduct ? 'PRODUCT' : 'OFFER',
                conditional: isCondReq
            });
            warnings.push(`Brak wymaganego parametru w ofercie/PIM: "${paramSchema.name}" (ID: ${paramId})`);
        }
    }

    // Przygotowanie aktualizacji `safetyInformation` oraz `composition` wewnątrz `productSet[0]`
    const currentSafetyText = primarySetItem?.safetyInformation?.type === 'TEXT'
        ? String(primarySetItem.safetyInformation.description || '').trim()
        : (primarySetItem?.safetyInformation?.type || '');
    let safetyChanged = false;
    let nextSafetyInfo = primarySetItem?.safetyInformation || undefined;

    if (safetyInfoPayload && safetyInfoPayload.apply && safetyInfoPayload.description) {
        const cleanDesc = String(safetyInfoPayload.description).trim();
        if (cleanDesc.length > MAX_SAFETY_TEXT_LEN) {
            errors.push(`Ostrzeżenia safetyInformation przekraczają limit ${MAX_SAFETY_TEXT_LEN} znaków.`);
        } else if (cleanDesc !== currentSafetyText || primarySetItem?.safetyInformation?.type !== 'TEXT') {
            nextSafetyInfo = { type: 'TEXT', description: cleanDesc };
            safetyChanged = true;
        }
    }

    let compositionChanged = false;
    let nextComposition = primarySetItem?.composition !== undefined ? primarySetItem.composition : undefined;

    if (compositionPayload && compositionPayload.apply && Array.isArray(compositionPayload.components) && compositionPayload.components.length > 0) {
        const normalizedNewComp = { components: compositionPayload.components };
        const currentCompNorm = primarySetItem?.composition?.components
            ? JSON.stringify({ components: primarySetItem.composition.components })
            : '';
        const newCompNorm = JSON.stringify(normalizedNewComp);
        if (currentCompNorm !== newCompNorm) {
            nextComposition = normalizedNewComp;
            compositionChanged = true;
        }
    }

    const shouldApplyTitle = Boolean(
        titlePayload &&
        typeof titlePayload === 'object' &&
        titlePayload.apply &&
        typeof titlePayload.title === 'string' &&
        titlePayload.title.trim() !== ''
    );
    const titleEval = evaluateAllegroOfferTitleUpdate({
        existingOffer,
        catalogProduct,
        nextTitle: titlePayload?.title || '',
        includeTitle: shouldApplyTitle,
        brand: titlePayload?.brand || product?.brand?.name || normalizedFeatureMap.get('marka') || ''
    });
    if (titleEval.errors.length > 0) {
        errors.push(...titleEval.errors);
    }
    if (titleEval.warnings.length > 0) {
        warnings.push(...titleEval.warnings);
    }
    const titleChanged = Boolean(titleEval.nextTitleForPatch);

    const patchBody = {};
    if (offerParamsChanged) {
        patchBody.parameters = Array.from(mergedOfferMap.values());
    }
    if (titleChanged) {
        patchBody.name = titleEval.nextTitleForPatch;
    }

    let preservedOfferFields = {
        active: false,
        productSetPatched: false,
        imagesPreservedCount: 0,
        suppressCatalogProductImages: false,
        imagesTrustedLocked: false,
        descriptionSectionsPreserved: 0,
        descriptionTrustedLocked: false,
        aiCoCreatedImagesPreserved: 0
    };

    const needsProductSetPatch = productParamsChanged || safetyChanged || compositionChanged;
    if (needsProductSetPatch) {
        if (!primarySetItem || !primarySetItem.product?.id) {
            errors.push('Oferta na Allegro nie posiada przypisanego productSet[0].product.id — nie można bezpiecznie zaktualizować parametrów produktowych.');
        } else {
            const preserved = buildPreservedOfferContentForProductPatch({ existingOffer, catalogProduct });
            preservedOfferFields = preserved.summary;
            if (preserved.warnings.length > 0) {
                warnings.push(...preserved.warnings);
            }

            const clonedSet = existingProductSet.map((item, idx) => {
                if (idx !== 0) return item;
                const updatedProduct = {
                    id: item.product.id,
                    parameters: Array.from(mergedProductMap.values())
                };
                if (preserved.suppressCatalogProductImages) {
                    updatedProduct.images = [];
                }
                const updatedItem = {
                    quantity: item.quantity || { value: 1 },
                    product: updatedProduct
                };
                if (item.responsiblePerson) updatedItem.responsiblePerson = item.responsiblePerson;
                if (item.responsibleProducer) updatedItem.responsibleProducer = item.responsibleProducer;
                if (item.marketedBeforeGPSRObligation !== undefined && item.marketedBeforeGPSRObligation !== null) {
                    updatedItem.marketedBeforeGPSRObligation = item.marketedBeforeGPSRObligation;
                }
                if (Array.isArray(item.deposits) && item.deposits.length > 0) {
                    updatedItem.deposits = item.deposits;
                }
                if (nextSafetyInfo !== undefined && nextSafetyInfo !== null) {
                    updatedItem.safetyInformation = nextSafetyInfo;
                }
                if (nextComposition !== undefined && nextComposition !== null && Array.isArray(nextComposition.components)) {
                    updatedItem.composition = { components: nextComposition.components };
                }
                return updatedItem;
            });
            patchBody.productSet = clonedSet;

            if (preserved.images) {
                patchBody.images = preserved.images;
            }
            if (preserved.description) {
                patchBody.description = preserved.description;
            }
            if (preserved.aiCoCreatedContent) {
                patchBody.aiCoCreatedContent = preserved.aiCoCreatedContent;
            }
        }
    }

    return {
        patchBody,
        hasChanges: offerParamsChanged || productParamsChanged || safetyChanged || compositionChanged || titleChanged,
        changesSummary: {
            offerParamsChanged,
            productParamsChanged,
            safetyChanged,
            compositionChanged,
            titleChanged,
            toAddCount: diffRows.filter(r => r.status === 'ADD').length,
            toUpdateCount: diffRows.filter(r => r.status === 'UPDATE').length,
            unchangedCount: diffRows.filter(r => r.status === 'UNCHANGED').length,
            blockedTrustedCount: diffRows.filter(r => r.status === 'BLOCKED_TRUSTED_CONTENT').length,
            errorCount: errors.length
        },
        preservedOfferFields,
        titlePreview: titleEval.titlePreview,
        effectiveIncludeTitle: titleEval.effectiveIncludeTitle,
        diffRows,
        missingRequired,
        errors,
        warnings,
        safetyPreview: {
            current: currentSafetyText,
            next: safetyInfoPayload?.description || '',
            changed: safetyChanged
        },
        compositionPreview: {
            current: primarySetItem?.composition || null,
            next: compositionPayload?.components ? { components: compositionPayload.components } : null,
            changed: compositionChanged
        },
        schemaCount: schemaMap.size
    };
}

/**
 * Sprawdza, czy payload PATCH zawiera jakiekolwiek pole `composition` wewnątrz `productSet`.
 */
function hasCompositionInPatchBody(patchBody) {
    return Boolean(
        patchBody &&
        Array.isArray(patchBody.productSet) &&
        patchBody.productSet.some(item => item && item.composition !== undefined && item.composition !== null)
    );
}

/**
 * Porównuje znormalizowaną tablicę parametrów Allegro niezależnie od kolejności wpisów.
 */
function normalizeAllegroParamListSignature(params) {
    if (!Array.isArray(params)) return '[]';
    const normalized = params
        .filter(Boolean)
        .map(p => ({
            id: String(p.id),
            valuesIds: Array.isArray(p.valuesIds) ? [...p.valuesIds].map(String).sort() : null,
            values: Array.isArray(p.values) ? [...p.values].map(String) : null,
            rangeValue: p.rangeValue ? { from: String(p.rangeValue.from ?? ''), to: String(p.rangeValue.to ?? '') } : null
        }))
        .sort((a, b) => a.id.localeCompare(b.id));
    return JSON.stringify(normalized);
}

/**
 * Bezpiecznie usuwa `composition` z `patchBody.productSet` (np. po błędzie 422 kategorii nieobsługującej składu).
 * Gdy dostarczono `existingOffer` i poza `composition` w `productSet` nie było innych zmian (`product.parameters`,
 * `safetyInformation`, dodatkowe pozycje), zdejmuje również cały `productSet` oraz powiązane pola ochronne,
 * zapobiegając pustym nadpisaniom RFC 7396.
 */
function stripCompositionFromPatchBody(patchBody, existingOffer = null) {
    if (!patchBody || typeof patchBody !== 'object') {
        return {
            patchBody: {},
            hadComposition: false,
            hasRemainingChanges: false,
            droppedEmptyProductSet: false
        };
    }

    const cloned = JSON.parse(JSON.stringify(patchBody));
    const hadComposition = hasCompositionInPatchBody(cloned);

    if (Array.isArray(cloned.productSet)) {
        cloned.productSet = cloned.productSet.map(item => {
            if (!item || typeof item !== 'object') return item;
            const rest = { ...item };
            delete rest.composition;
            return rest;
        });
    }

    let droppedEmptyProductSet = false;
    if (hadComposition && existingOffer && Array.isArray(cloned.productSet)) {
        const origSet = Array.isArray(existingOffer.productSet) ? existingOffer.productSet : [];
        let hasOtherProductSetChanges = cloned.productSet.length !== origSet.length;

        if (!hasOtherProductSetChanges && cloned.productSet.length > 0) {
            const nextItem = cloned.productSet[0];
            const origItem = origSet[0] || {};
            const nextParamsSig = normalizeAllegroParamListSignature(nextItem?.product?.parameters);
            const origParamsSig = normalizeAllegroParamListSignature(origItem?.product?.parameters);
            const nextSafetySig = JSON.stringify(nextItem?.safetyInformation || null);
            const origSafetySig = JSON.stringify(origItem?.safetyInformation || null);

            if (nextParamsSig !== origParamsSig || nextSafetySig !== origSafetySig) {
                hasOtherProductSetChanges = true;
            }
        }

        if (!hasOtherProductSetChanges) {
            delete cloned.productSet;
            delete cloned.images;
            delete cloned.description;
            delete cloned.aiCoCreatedContent;
            droppedEmptyProductSet = true;
        }
    }

    const hasRemainingChanges = Object.keys(cloned).length > 0;
    return {
        patchBody: cloned,
        hadComposition,
        hasRemainingChanges,
        droppedEmptyProductSet
    };
}

function escapeAllegroHtmlText(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function normalizeInlineWhitespace(str) {
    return String(str || '').replace(/[\u00a0\s]+/g, ' ');
}

/**
 * Zamienia tablicę runów `{ text, bold }` w poprawny fragment inline (wyłącznie tekst + zbalansowane `<b>...</b>`).
 */
function renderAllegroInlineRuns(runs) {
    if (!Array.isArray(runs) || runs.length === 0) return '';
    // Run pogrubienia zawierający wyłącznie spacje traktujemy jako zwykłą spację (brak pustych <b> </b>).
    const prepared = runs
        .map(r => {
            const norm = normalizeInlineWhitespace(r.text);
            if (!norm) return null;
            return { text: norm, bold: Boolean(r.bold && norm.trim() !== '') };
        })
        .filter(Boolean);

    // Scalanie sąsiednich runów o tym samym stanie `bold` z redukcją wielokrotnych spacji na styku
    const merged = [];
    for (const r of prepared) {
        const prev = merged[merged.length - 1];
        if (prev && prev.bold === r.bold) {
            prev.text = normalizeInlineWhitespace(prev.text + r.text);
        } else {
            merged.push({ ...r });
        }
    }

    // Przycięcie spacji na brzegach całego bloku
    while (merged.length > 0 && merged[0].text.trim() === '') merged.shift();
    while (merged.length > 0 && merged[merged.length - 1].text.trim() === '') merged.pop();
    if (merged.length === 0) return '';

    merged[0].text = merged[0].text.replace(/^\s+/, '');
    merged[merged.length - 1].text = merged[merged.length - 1].text.replace(/\s+$/, '');

    // Redukcja podwójnych spacji na styku sąsiednich runów
    for (let i = 0; i < merged.length - 1; i++) {
        if (/\s$/.test(merged[i].text) && /^\s/.test(merged[i + 1].text)) {
            merged[i + 1].text = merged[i + 1].text.replace(/^\s+/, '');
        }
    }

    return merged
        .filter(r => r.text.length > 0)
        .map(r => (r.bold ? `<b>${escapeAllegroHtmlText(r.text)}</b>` : escapeAllegroHtmlText(r.text)))
        .join('');
}

/**
 * Zbiera czysty tekst (bez tagów inline/blokowych) z węzła nagłówka h1/h2; <br> zamienia na spację.
 */
function extractPlainHeadingText(node) {
    if (!node) return '';
    if (node.type === 'text') return normalizeInlineWhitespace(node.data);
    if (node.type !== 'tag') return '';
    const tag = String(node.name || '').toLowerCase();
    if (tag === 'script' || tag === 'style') return '';
    if (tag === 'br') return ' ';
    const children = Array.isArray(node.children) ? node.children : [];
    return children.map(extractPlainHeadingText).join('');
}

/**
 * Mechaniczny adapter formatu HTML dla elementu TEXT w `StandardizedDescription` Allegro API.
 * Parsuje DOM przez `cheerio` zamiast kruchych wyrażeń regularnych, spłaszcza TipTapowe `<li><p>...</p></li>`
 * i emituje wyłącznie zbalansowane tagi z ścisłej białej listy Allegro: {h1, h2, p, ul, ol, li, b}.
 */
function sanitizeHtmlForAllegroDescription(htmlStr) {
    if (!htmlStr || typeof htmlStr !== 'string') return '';
    const $ = cheerio.load(htmlStr, null, false);
    const blocks = [];
    let pendingParagraphRuns = [];

    const flushParagraph = () => {
        const rendered = renderAllegroInlineRuns(pendingParagraphRuns);
        pendingParagraphRuns = [];
        if (rendered) {
            blocks.push(`<p>${rendered}</p>`);
        }
    };

    const collectFlatListItemRuns = (node, inBold, runsOut, nestedListsOut) => {
        if (!node) return;
        if (node.type === 'comment') return;
        if (node.type === 'text') {
            runsOut.push({ text: node.data, bold: inBold });
            return;
        }
        if (node.type !== 'tag') return;
        const rawTag = String(node.name || '').toLowerCase();
        if (rawTag === 'script' || rawTag === 'style') return;
        if (rawTag === 'br') {
            runsOut.push({ text: ' ', bold: false });
            return;
        }
        if (rawTag === 'ul' || rawTag === 'ol') {
            nestedListsOut.push(node);
            return;
        }
        const isInlineBold = rawTag === 'b' || rawTag === 'strong';
        const isInnerBlock = rawTag === 'p' || rawTag === 'div' || rawTag === 'section' || rawTag === 'article' || rawTag === 'blockquote' || /^h[1-6]$/.test(rawTag);
        if (isInnerBlock && runsOut.length > 0) {
            runsOut.push({ text: ' ', bold: false });
        }
        const children = Array.isArray(node.children) ? node.children : [];
        for (const child of children) {
            collectFlatListItemRuns(child, inBold || isInlineBold, runsOut, nestedListsOut);
        }
        if (isInnerBlock) {
            runsOut.push({ text: ' ', bold: false });
        }
    };

    const extractListItems = (listNode) => {
        const itemsHtml = [];
        const children = Array.isArray(listNode.children) ? listNode.children : [];
        for (const child of children) {
            if (child.type === 'comment') continue;
            if (child.type === 'text') {
                const textRendered = renderAllegroInlineRuns([{ text: child.data, bold: false }]);
                if (textRendered) itemsHtml.push(`<li>${textRendered}</li>`);
                continue;
            }
            if (child.type !== 'tag') continue;
            const childTag = String(child.name || '').toLowerCase();
            if (childTag === 'script' || childTag === 'style') continue;
            if (childTag === 'li') {
                const liRuns = [];
                const nestedLists = [];
                for (const liChild of (child.children || [])) {
                    collectFlatListItemRuns(liChild, false, liRuns, nestedLists);
                }
                const renderedLi = renderAllegroInlineRuns(liRuns);
                if (renderedLi) {
                    itemsHtml.push(`<li>${renderedLi}</li>`);
                }
                for (const nl of nestedLists) {
                    itemsHtml.push(...extractListItems(nl));
                }
            } else if (childTag === 'ul' || childTag === 'ol') {
                itemsHtml.push(...extractListItems(child));
            } else {
                const fallbackRuns = [];
                const nestedLists = [];
                collectFlatListItemRuns(child, false, fallbackRuns, nestedLists);
                const renderedFallback = renderAllegroInlineRuns(fallbackRuns);
                if (renderedFallback) itemsHtml.push(`<li>${renderedFallback}</li>`);
                for (const nl of nestedLists) {
                    itemsHtml.push(...extractListItems(nl));
                }
            }
        }
        return itemsHtml;
    };

    const walkNodes = (nodes, inBold) => {
        for (const node of nodes) {
            if (!node || node.type === 'comment') continue;
            if (node.type === 'text') {
                pendingParagraphRuns.push({ text: node.data, bold: inBold });
                continue;
            }
            if (node.type !== 'tag') continue;

            const tag = String(node.name || '').toLowerCase();
            if (tag === 'script' || tag === 'style') continue;

            if (tag === 'br') {
                flushParagraph();
                continue;
            }

            if (tag === 'h1' || /^h[2-6]$/.test(tag)) {
                flushParagraph();
                const outTag = tag === 'h1' ? 'h1' : 'h2';
                const plainHeading = extractPlainHeadingText(node).replace(/\s+/g, ' ').trim();
                if (plainHeading) {
                    blocks.push(`<${outTag}>${escapeAllegroHtmlText(plainHeading)}</${outTag}>`);
                }
                continue;
            }

            if (tag === 'ul' || tag === 'ol') {
                flushParagraph();
                const listItems = extractListItems(node);
                if (listItems.length > 0) {
                    blocks.push(`<${tag}>${listItems.join('')}</${tag}>`);
                }
                continue;
            }

            if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'blockquote' || tag === 'header' || tag === 'footer') {
                flushParagraph();
                walkNodes(node.children || [], false);
                flushParagraph();
                continue;
            }

            if (tag === 'li') {
                // Sierocy <li> poza listą zamieniamy bezpiecznie w akapit <p>
                flushParagraph();
                walkNodes(node.children || [], false);
                flushParagraph();
                continue;
            }

            const isBoldTag = tag === 'b' || tag === 'strong';
            walkNodes(node.children || [], inBold || isBoldTag);
        }
    };

    walkNodes($.root().contents().toArray(), false);
    flushParagraph();

    return blocks.join('');
}

/**
 * Waliduje strukturę HTML wygenerowaną dla sekcji `TEXT` w `StandardizedDescription` Allegro API.
 * Sprawdza zbalansowanie wszystkich tagów, zakaz atrybutów i reguły zagnieżdżania Allegro (`{h1, h2, p, ul, ol, li, b}`).
 */
function validateAllegroDescriptionHtml(htmlStr) {
    if (htmlStr === undefined || htmlStr === null || htmlStr === '') {
        return { valid: true, errors: [] };
    }
    const str = String(htmlStr);
    const errors = [];
    const allowedTags = new Set(['h1', 'h2', 'p', 'ul', 'ol', 'li', 'b']);
    const stack = [];
    const tagRegex = /<\/?([a-zA-Z0-9-]+)([^>]*)>/g;
    let lastIndex = 0;
    let match;

    while ((match = tagRegex.exec(str)) !== null) {
        const textBetween = str.slice(lastIndex, match.index);
        if (textBetween.includes('<')) {
            errors.push('Niedomknięty lub niepoprawny znak "<" w treści HTML.');
        }
        lastIndex = tagRegex.lastIndex;

        const fullMatch = match[0];
        const tag = String(match[1]).toLowerCase();
        const attrs = String(match[2] || '').trim();
        const isClosing = fullMatch.startsWith('</');

        if (!allowedTags.has(tag)) {
            errors.push(`Niedozwolony tag HTML <${tag}> w opisie Allegro.`);
            continue;
        }
        if (attrs) {
            errors.push(`Tag <${tag}> zawiera niedozwolone atrybuty: ${attrs}.`);
        }

        if (isClosing) {
            if (stack.length === 0 || stack[stack.length - 1] !== tag) {
                errors.push(`Niezbalansowany tag zamykający </${tag}>.`);
            } else {
                stack.pop();
            }
            continue;
        }

        const parent = stack.length > 0 ? stack[stack.length - 1] : null;
        if ((tag === 'h1' || tag === 'h2' || tag === 'p' || tag === 'ul' || tag === 'ol') && parent !== null) {
            errors.push(`Tag blokowy <${tag}> nie może być zagnieżdżony wewnątrz <${parent}>.`);
        } else if (tag === 'li' && parent !== 'ul' && parent !== 'ol') {
            errors.push(`Element <li> może występować wyłącznie wewnątrz <ul> lub <ol>.`);
        } else if (tag === 'b' && parent !== 'p' && parent !== 'li') {
            errors.push(`Tag <b> może występować wyłącznie wewnątrz <p> lub <li>.`);
        }
        stack.push(tag);
    }

    if (str.slice(lastIndex).includes('<')) {
        errors.push('Niedomknięty znak "<" na końcu treści HTML.');
    }
    if (stack.length > 0) {
        errors.push(`Brakuje taga zamykającego dla: ${stack.map(t => `"${t}"`).join(', ')}.`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Zbiera gotowe zdjęcia z potoku (visionTickets / draft.images / fallback PIM) z zachowaniem kolejności slotów.
 */
function collectPipelineImagesForAllegro({
    draftImages = [],
    productImageUrl = null,
    productImages = [],
    aiFlagsOverride = null,
    maxImages = MAX_ALLEGRO_OFFER_IMAGES_BUSINESS
} = {}) {
    const collected = [];
    const seen = new Set();

    const pushCandidate = (rawSource, slotIndex, explicitAiFlag = null) => {
        if (!isValidExportImageUrl(rawSource)) return;
        const cleanUrl = rawSource.trim();
        if (seen.has(cleanUrl)) return;
        seen.add(cleanUrl);

        let isAi = false;
        if (typeof explicitAiFlag === 'boolean') {
            isAi = explicitAiFlag;
        } else if (aiFlagsOverride && typeof aiFlagsOverride === 'object' && typeof aiFlagsOverride[slotIndex] === 'boolean') {
            isAi = aiFlagsOverride[slotIndex];
        } else if (slotIndex > 0 && cleanUrl.startsWith('data:image/')) {
            isAi = true;
        }

        collected.push({
            slotIndex,
            source: cleanUrl,
            isAllegroHosted: isAllegroHostedImageUrl(cleanUrl),
            isAiCoCreated: isAi
        });
    };

    if (Array.isArray(draftImages) && draftImages.length > 0) {
        draftImages.forEach((img, idx) => {
            if (typeof img === 'string') {
                pushCandidate(img, idx, null);
                return;
            }
            if (img && typeof img === 'object') {
                const url = img.replacedUrl || img.url || img.originalUrl || '';
                const hasReplacedAi = Boolean(img.replacedUrl && idx > 0 && String(img.replacedUrl).startsWith('data:image/'));
                const explicitFlag = typeof img.isAiCoCreated === 'boolean'
                    ? img.isAiCoCreated
                    : (typeof img.isAiGenerated === 'boolean' ? img.isAiGenerated : (hasReplacedAi ? true : null));
                pushCandidate(url, idx, explicitFlag);
            }
        });
    } else {
        if (isValidExportImageUrl(productImageUrl)) {
            pushCandidate(productImageUrl, 0, false);
        }
        if (Array.isArray(productImages)) {
            productImages.forEach((img, idx) => {
                pushCandidate(img, idx + (isValidExportImageUrl(productImageUrl) ? 1 : 0), false);
            });
        }
    }

    const overflowCount = Math.max(0, collected.length - maxImages);
    return {
        images: collected.slice(0, maxImages),
        totalFound: collected.length,
        overflowCount
    };
}

/**
 * Buduje strukturę `StandardizedDescription` dla REST API Allegro na podstawie gotowych sekcji `sekcja1..7` i listy URL-i zdjęć.
 * Zachowuje spójność z BaseLinkerem (opcjonalna klauzula AI Act) oraz układem z TileSimulator.
 */
function buildAllegroDescriptionSections({
    htmlContent = null,
    descriptionHtml = '',
    imageUrls = [],
    appendAiDisclosure = false,
    contentProfile = null
} = {}) {
    const rawSections = [];

    if (htmlContent && typeof htmlContent === 'object') {
        const orderedEntries = resolveOrderedVisibleDescriptionSections(htmlContent, contentProfile, {
            availableImageCount: Array.isArray(imageUrls) ? imageUrls.length : 0
        });

        // Moduł 6 (sekcja6 / GPSR) jest celowo wyłączany przez resolver z opisu oferty — trafia wyłącznie do safetyInformation.
        for (const entry of orderedEntries) {
            const cleanText = sanitizeHtmlForAllegroDescription(entry.html || '');
            if (!cleanText) continue;
            const imgUrl = (entry.imgIdx >= 0 && Array.isArray(imageUrls) && imageUrls[entry.imgIdx])
                ? String(imageUrls[entry.imgIdx]).trim()
                : '';
            const items = [];
            if (imgUrl) {
                if (entry.imageFirst) {
                    items.push({ type: 'IMAGE', url: imgUrl });
                    items.push({ type: 'TEXT', content: cleanText });
                } else {
                    items.push({ type: 'TEXT', content: cleanText });
                    items.push({ type: 'IMAGE', url: imgUrl });
                }
            } else {
                items.push({ type: 'TEXT', content: cleanText });
            }
            rawSections.push({ items });
        }
    } else {
        const sourceStr = typeof htmlContent === 'string' ? htmlContent : descriptionHtml;
        const cleanSingle = sanitizeHtmlForAllegroDescription(sourceStr || '');
        if (cleanSingle) {
            const firstImg = Array.isArray(imageUrls) && imageUrls[0] ? String(imageUrls[0]).trim() : '';
            rawSections.push({
                items: firstImg
                    ? [{ type: 'IMAGE', url: firstImg }, { type: 'TEXT', content: cleanSingle }]
                    : [{ type: 'TEXT', content: cleanSingle }]
            });
        }
    }

    if (appendAiDisclosure && rawSections.length > 0) {
        const joinedAll = rawSections.map(s => s.items.map(i => i.content || '').join(' ')).join(' ');
        if (!/tła wygenerowane cyfrowo/i.test(joinedAll)) {
            const lastSec = rawSections[rawSections.length - 1];
            const textItem = lastSec.items.find(i => i.type === 'TEXT');
            if (textItem) {
                textItem.content = `${textItem.content}${AI_ACT_DISCLOSURE_HTML}`;
            } else {
                rawSections.push({ items: [{ type: 'TEXT', content: AI_ACT_DISCLOSURE_HTML }] });
            }
        }
    }

    const description = { sections: rawSections };
    const totalBytes = Buffer.byteLength(JSON.stringify(description), 'utf8');
    return {
        description,
        sectionsCount: rawSections.length,
        totalBytes,
        exceedsLimit: totalBytes > MAX_ALLEGRO_DESCRIPTION_BYTES
    };
}

/**
 * Waliduje eksport opisu i zdjęć w fazie Pre-flight (bez mutacji i bez wgrywania plików na CDN Allegro).
 */
function buildAllegroContentPreflight({
    existingOffer = {},
    catalogProduct = null,
    htmlContent = null,
    descriptionHtml = '',
    draftImages = [],
    productImageUrl = null,
    productImages = [],
    includeImages = true,
    includeDescription = true,
    aiFlagsOverride = null,
    contentProfile = null,
    title = '',
    includeTitle = false,
    brand = ''
} = {}) {
    const errors = [];
    const warnings = [];
    const { imagesBlockedByTrusted, descriptionBlockedByTrusted, titleBlockedByTrusted } = getOfferContentTrustFlags(catalogProduct);

    const titleEval = evaluateAllegroOfferTitleUpdate({
        existingOffer,
        catalogProduct,
        nextTitle: title,
        includeTitle: Boolean(includeTitle),
        brand
    });
    if (titleEval.errors.length > 0) {
        errors.push(...titleEval.errors);
    }
    if (titleEval.warnings.length > 0) {
        warnings.push(...titleEval.warnings);
    }
    const titleChanged = Boolean(titleEval.nextTitleForPatch);

    const currentOfferImages = normalizeOfferImageUrls(existingOffer?.images);
    const currentOfferDescription = existingOffer?.description && Array.isArray(existingOffer.description.sections)
        ? existingOffer.description
        : { sections: [] };

    const collected = collectPipelineImagesForAllegro({
        draftImages,
        productImageUrl,
        productImages,
        aiFlagsOverride
    });

    if (includeImages && collected.overflowCount > 0) {
        warnings.push(`Wykryto ${collected.totalFound} zdjęć, ale limit Allegro dla konta firmowego to ${MAX_ALLEGRO_OFFER_IMAGES_BUSINESS} — nadmiarowe (${collected.overflowCount}) zostały pominięte.`);
    }

    let effectiveIncludeImages = Boolean(includeImages);
    if (effectiveIncludeImages && imagesBlockedByTrusted) {
        effectiveIncludeImages = false;
        warnings.push('Pole `images` jest chronione przez Trusted Content w Katalogu Allegro — aktualizacja zdjęć została zablokowana w Pre-flight.');
    }
    if (effectiveIncludeImages && collected.images.length === 0) {
        errors.push('Brak prawidłowych zdjęć w PIM/Vision AI do wysłania na Allegro.');
    }

    let effectiveIncludeDescription = Boolean(includeDescription);
    if (effectiveIncludeDescription && descriptionBlockedByTrusted) {
        effectiveIncludeDescription = false;
        warnings.push('Pole `description` jest chronione przez Trusted Content w Katalogu Allegro — aktualizacja opisu została zablokowana w Pre-flight.');
    }

    // Zdjęcia użyte w sekcjach opisu muszą istnieć w docelowej galerii `images[]` oferty.
    // Do wyliczenia docelowego rozmiaru UTF-8 w Pre-flight (zanim wgramy Base64 na CDN Allegro)
    // używamy dokładnej długości docelowego URL-a a.allegroimg.com, aby surowe Base64 nie fałszowały limitu 40000 B.
    const descriptionImageUrls = effectiveIncludeImages
        ? collected.images.map(img => img.source)
        : currentOfferImages;
    const simulatedCdnImageUrls = effectiveIncludeImages
        ? collected.images.map((img, idx) => (
            img.isAllegroHosted
                ? img.source
                : `https://a.allegroimg.com/original/000000/00000000000000000000000000${String(idx).padStart(2, '0')}`
        ))
        : currentOfferImages;

    const hasAiImages = collected.images.some(img => img.isAiCoCreated);
    const descBuildPreview = effectiveIncludeDescription
        ? buildAllegroDescriptionSections({
            htmlContent,
            descriptionHtml,
            imageUrls: descriptionImageUrls,
            appendAiDisclosure: hasAiImages,
            contentProfile
        })
        : { description: currentOfferDescription, sectionsCount: currentOfferDescription.sections.length, totalBytes: Buffer.byteLength(JSON.stringify(currentOfferDescription), 'utf8'), exceedsLimit: false };

    const descBuildSized = effectiveIncludeDescription
        ? buildAllegroDescriptionSections({
            htmlContent,
            descriptionHtml,
            imageUrls: simulatedCdnImageUrls,
            appendAiDisclosure: hasAiImages,
            contentProfile
        })
        : descBuildPreview;

    const descBuild = {
        description: descBuildPreview.description,
        sectionsCount: descBuildPreview.sectionsCount,
        totalBytes: descBuildSized.totalBytes,
        exceedsLimit: descBuildSized.exceedsLimit
    };

    if (effectiveIncludeDescription) {
        if (descBuild.sectionsCount === 0) {
            errors.push('Brak wygenerowanego opisu (sekcje 1–5, 7 i descriptionHtml są puste).');
        }
        if (descBuild.exceedsLimit) {
            errors.push(`Opis przekracza limit REST API Allegro (${descBuild.totalBytes} / ${MAX_ALLEGRO_DESCRIPTION_BYTES} bajtów UTF-8).`);
        }
        (descBuild.description?.sections || []).forEach((sec, sIdx) => {
            (sec?.items || []).forEach((item, iIdx) => {
                if (item?.type === 'TEXT') {
                    const htmlCheck = validateAllegroDescriptionHtml(item.content);
                    if (!htmlCheck.valid) {
                        errors.push(`Nieprawidłowy HTML opisu w sekcji [${sIdx}].items[${iIdx}]: ${htmlCheck.errors.join(' ')}`);
                    }
                }
            });
        });
        if (!effectiveIncludeImages && currentOfferImages.length === 0) {
            warnings.push('Oferta na Allegro nie ma obecnie zdjęć, a wysyłka zdjęć jest wyłączona — opis zostanie wysłany wyłącznie jako sekcje tekstowe.');
        }
    }

    let complianceAudit = { clean: true, totalIssues: 0, issues: [], warnings: [] };
    if (effectiveIncludeDescription) {
        complianceAudit = auditOfferDraftCompliance({
            title: (titleEval.effectiveIncludeTitle && titleEval.titlePreview?.next)
                ? titleEval.titlePreview.next
                : (existingOffer?.name || ''),
            htmlContent,
            descriptionHtml
        });
        if (complianceAudit.warnings.length > 0) {
            warnings.push(...complianceAudit.warnings);
        }
    }

    const imagesNeedUploadCount = effectiveIncludeImages
        ? collected.images.filter(img => !img.isAllegroHosted).length
        : 0;

    const currentImagesJson = JSON.stringify(currentOfferImages);
    const nextImageSourcesJson = JSON.stringify(collected.images.map(img => img.source));
    const imagesChanged = effectiveIncludeImages && (imagesNeedUploadCount > 0 || currentImagesJson !== nextImageSourcesJson);

    const currentDescJson = JSON.stringify(currentOfferDescription);
    const nextDescJson = JSON.stringify(descBuild.description);
    const descriptionChanged = effectiveIncludeDescription && (imagesNeedUploadCount > 0 || currentDescJson !== nextDescJson);

    const hasChanges = ((imagesChanged || descriptionChanged) && (effectiveIncludeImages || effectiveIncludeDescription)) || titleChanged;

    return {
        hasChanges,
        errors,
        warnings,
        complianceAudit,
        trusted: {
            imagesBlocked: imagesBlockedByTrusted,
            descriptionBlocked: descriptionBlockedByTrusted,
            titleBlocked: titleBlockedByTrusted
        },
        effectiveIncludeImages,
        effectiveIncludeDescription,
        effectiveIncludeTitle: titleEval.effectiveIncludeTitle,
        titlePreview: titleEval.titlePreview,
        imagesPreview: {
            current: currentOfferImages,
            next: collected.images,
            changed: imagesChanged,
            needUploadCount: imagesNeedUploadCount
        },
        descriptionPreview: {
            currentSections: currentOfferDescription.sections || [],
            nextSections: descBuild.description.sections || [],
            sectionsCount: descBuild.sectionsCount,
            totalBytes: descBuild.totalBytes,
            maxBytes: MAX_ALLEGRO_DESCRIPTION_BYTES,
            changed: descriptionChanged
        }
    };
}

/**
 * Buduje finalny payload `PATCH /sale/product-offers/{offerId}` dla zdjęć i opisu (zawsze bez `productSet`).
 */
function buildAllegroContentPatchBody({
    existingOffer = {},
    uploadedImages = [],
    description = null,
    includeImages = true,
    includeDescription = true,
    title = null,
    includeTitle = false
} = {}) {
    const patchBody = {};
    if (includeImages) {
        const finalUrls = uploadedImages.map(u => String(u.url || '').trim()).filter(Boolean);
        patchBody.images = finalUrls;

        const nextAiImages = uploadedImages
            .filter(u => u.isAiCoCreated && u.url)
            .map(u => ({ url: String(u.url).trim() }));
        const hadPrevAi = Array.isArray(existingOffer?.aiCoCreatedContent?.images) && existingOffer.aiCoCreatedContent.images.length > 0;
        if (nextAiImages.length > 0 || hadPrevAi) {
            patchBody.aiCoCreatedContent = { images: nextAiImages };
        }
    }
    if (includeDescription && description && Array.isArray(description.sections) && description.sections.length > 0) {
        patchBody.description = description;
    }
    if (includeTitle && typeof title === 'string' && title.trim().length > 0) {
        patchBody.name = title.replace(/\s+/g, ' ').trim();
    }
    return patchBody;
}

module.exports = {
    MAX_SAFETY_TEXT_LEN,
    MAX_ALLEGRO_DESCRIPTION_BYTES,
    MAX_ALLEGRO_OFFER_IMAGES_BUSINESS,
    AI_ACT_DISCLOSURE_HTML,
    isValidExportImageUrl,
    isAllegroHostedImageUrl,
    getOfferContentTrustFlags,
    evaluateAllegroOfferTitleUpdate,
    normalizeOfferImageUrls,
    buildPreservedOfferContentForProductPatch,
    normalizeTextKey,
    mapAllegroParameters,
    stripHtmlAndEmoticons,
    extractSafetyInformationText,
    extractCleanInciForAllegro,
    convertValueToParameterUnit,
    encodeParameterValue,
    formatAllegroParamDisplay,
    buildAllegroParameterPatchPayload,
    hasCompositionInPatchBody,
    stripCompositionFromPatchBody,
    sanitizeHtmlForAllegroDescription,
    validateAllegroDescriptionHtml,
    collectPipelineImagesForAllegro,
    buildAllegroDescriptionSections,
    buildAllegroContentPreflight,
    buildAllegroContentPatchBody
};
