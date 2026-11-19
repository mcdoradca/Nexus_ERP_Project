/**
 * Wspólne helpery rozwiązywania produktów PIM po ID lub EAN (odporne na białe znaki)
 * oraz bezpiecznej konwersji typów numerycznych z formularzy UI przed zapisem Prisma.
 */

function trimOrNull(val) {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    return str === '' ? null : str;
}

function parseLocaleFloat(val, fallback = null) {
    if (val === undefined || val === null || val === '') return fallback;
    if (typeof val === 'number') return Number.isFinite(val) ? val : fallback;
    const normalized = String(val).trim().replace(/\s+/g, '').replace(',', '.');
    if (!normalized) return fallback;
    const num = Number(normalized);
    return Number.isFinite(num) ? num : fallback;
}

function parseLocaleInt(val, fallback = null) {
    if (val === undefined || val === null || val === '') return fallback;
    if (typeof val === 'number') return Number.isFinite(val) ? Math.trunc(val) : fallback;
    const normalized = String(val).trim().replace(/\s+/g, '').replace(',', '.');
    if (!normalized) return fallback;
    const num = Number(normalized);
    return Number.isFinite(num) ? Math.trunc(num) : fallback;
}

/**
 * Rozwiązuje rekord `Product` po `productId`/`id` lub `ean` (w tym przyciętym `ean.trim()`),
 * chroniąc przed błędem Prisma P2025, gdy w bazie znajdują się nadmiarowe spacje (np. "8032680390036 ").
 */
async function resolveProductByIdOrEan(prisma, { id = null, productId = null, ean = null, include = undefined, select = undefined } = {}) {
    if (!prisma || !prisma.product) return null;

    const queryOpts = {};
    if (include) {
        queryOpts.include = include;
    } else if (select) {
        queryOpts.select = select;
    }

    const targetId = trimOrNull(productId || id);
    if (targetId) {
        try {
            const byId = await prisma.product.findUnique({
                where: { id: targetId },
                ...queryOpts
            });
            if (byId) return byId;
        } catch (_) {}
    }

    const rawEan = (ean === undefined || ean === null) ? '' : String(ean);
    const cleanEan = rawEan.trim();
    if (!cleanEan) return null;

    if (rawEan) {
        try {
            const exact = await prisma.product.findUnique({
                where: { ean: rawEan },
                ...queryOpts
            });
            if (exact) return exact;
        } catch (_) {}
    }

    if (cleanEan !== rawEan) {
        try {
            const trimmedMatch = await prisma.product.findUnique({
                where: { ean: cleanEan },
                ...queryOpts
            });
            if (trimmedMatch) return trimmedMatch;
        } catch (_) {}
    }

    // Fallback dla starszych rekordów ze spacją na początku/końcu w kolumnie Product.ean
    const fallbackOpts = {};
    if (include) {
        fallbackOpts.include = include;
    } else if (select) {
        fallbackOpts.select = { ...select, ean: true };
    }

    const candidates = await prisma.product.findMany({
        where: { ean: { contains: cleanEan } },
        take: 10,
        ...fallbackOpts
    });

    return candidates.find(p => String(p?.ean || '').trim() === cleanEan) || null;
}

const NOT_NULL_FLOAT_FIELDS = [
    'basePrice',
    'salePrice',
    'inboundTransportCost',
    'packagingCost',
    'bdoEprCost',
    'outboundTransportCost'
];

const NULLABLE_FLOAT_FIELDS = ['weight', 'length', 'width', 'height', 'taxRate'];
const NULLABLE_INT_FIELDS = ['stockErpUnits', 'stockWmsUnits'];

/**
 * Konwertuje pola liczbowe ze szkicu/formularza UI na poprawne typy dla Prisma `Product.update`.
 */
function buildNumericProductUpdateFields(draftData = {}) {
    const out = {};
    if (!draftData || typeof draftData !== 'object') return out;

    for (const field of NOT_NULL_FLOAT_FIELDS) {
        if (draftData[field] !== undefined) {
            const parsed = parseLocaleFloat(draftData[field], null);
            if (parsed !== null) {
                out[field] = parsed;
            } else if (draftData[field] === '' || draftData[field] === null) {
                out[field] = 0.0;
            }
        }
    }

    for (const field of NULLABLE_FLOAT_FIELDS) {
        if (draftData[field] !== undefined) {
            if (draftData[field] === '' || draftData[field] === null) {
                out[field] = field === 'taxRate' ? 23.0 : null;
            } else {
                const parsed = parseLocaleFloat(draftData[field], null);
                if (parsed !== null) out[field] = parsed;
            }
        }
    }

    if (draftData.stock !== undefined) {
        const parsedStock = parseLocaleInt(draftData.stock, null);
        if (parsedStock !== null) {
            out.stock = parsedStock;
        } else if (draftData.stock === '' || draftData.stock === null) {
            out.stock = 0;
        }
    }

    for (const field of NULLABLE_INT_FIELDS) {
        if (draftData[field] !== undefined) {
            if (draftData[field] === '' || draftData[field] === null) {
                out[field] = null;
            } else {
                const parsed = parseLocaleInt(draftData[field], null);
                if (parsed !== null) out[field] = parsed;
            }
        }
    }

    return out;
}

module.exports = {
    trimOrNull,
    parseLocaleFloat,
    parseLocaleInt,
    resolveProductByIdOrEan,
    buildNumericProductUpdateFields
};
