const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const defaultPrisma = new PrismaClient();
const defaultEventBus = require('../../core/EventBus');
const { exportLogger: defaultExportLogger } = require('../../utils/logger');
const { resolveProductByIdOrEan, trimOrNull } = require('../../utils/productLookup');
const defaultVonHalskyService = require('./vonhalsky.service');
const { buildVonHalskyOfferPayload, isValidUuid } = require('../../utils/vonhalsky_mapper');

const EXPORT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const EXPORT_TOKEN_TTL_MS = 5 * 60 * 1000;

function parseOfferDraftJson(rawDraft) {
    if (!rawDraft) return {};
    if (typeof rawDraft === 'object') return rawDraft;
    try {
        return JSON.parse(rawDraft);
    } catch (_) {
        return {};
    }
}

function computeCanonicalHash(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj || {})).digest('hex');
}

function buildTokenFingerprint({ mode, organizationId, offerId = '', payload, binaryAttachments = [] }) {
    return {
        mode,
        organizationId: String(organizationId || ''),
        offerId: String(offerId || ''),
        payload,
        binaryAttachments: binaryAttachments.map(a => ({
            priority: a.priority,
            fileName: a.fileName,
            sourceHash: crypto.createHash('sha256').update(String(a.source || '')).digest('hex')
        }))
    };
}

function signVonHalskyExportToken({ ean, mode, organizationId, offerId = '', payloadObj }) {
    const timestamp = Date.now();
    const org = String(organizationId || '').trim();
    const oid = String(offerId || '').trim();
    const patchHash = computeCanonicalHash(payloadObj);
    const sigPayload = `${ean}:${mode}:${org}:${oid}:${patchHash}:${timestamp}`;
    const signature = crypto.createHmac('sha256', EXPORT_SECRET).update(sigPayload).digest('hex');
    return Buffer.from(JSON.stringify({
        ean: String(ean || ''),
        mode,
        organizationId: org,
        offerId: oid,
        patchHash,
        timestamp,
        signature
    })).toString('base64');
}

function verifyVonHalskyExportToken(token, { ean, mode, organizationId, offerId = '', payloadObj }) {
    if (!token || typeof token !== 'string') {
        throw new Error('Brak kryptograficznego tokenu weryfikacji (exportToken). Wykonaj najpierw Pre-flight.');
    }
    let decoded;
    try {
        decoded = JSON.parse(Buffer.from(String(token), 'base64').toString('utf8'));
    } catch (_) {
        throw new Error('Uszkodzony format tokenu eksportu Von Halsky.');
    }

    if (
        String(decoded.ean || '') !== String(ean || '') ||
        String(decoded.mode || '') !== String(mode || '') ||
        String(decoded.organizationId || '') !== String(organizationId || '').trim() ||
        String(decoded.offerId || '') !== String(offerId || '').trim()
    ) {
        throw new Error('Niezgodność produktu, trybu, organizacji lub oferty w tokenie eksportu Von Halsky.');
    }
    if (Date.now() - Number(decoded.timestamp) > EXPORT_TOKEN_TTL_MS) {
        throw new Error('Token eksportu Von Halsky wygasł (limit 5 min). Odśwież podgląd Pre-flight.');
    }

    const expectedHash = computeCanonicalHash(payloadObj);
    if (decoded.patchHash !== expectedHash) {
        throw new Error('Zmieniono dane od ostatniego podglądu Pre-flight. Wykonaj ponowną weryfikację.');
    }

    const expectedSig = crypto.createHmac('sha256', EXPORT_SECRET)
        .update(`${decoded.ean}:${decoded.mode}:${decoded.organizationId}:${decoded.offerId}:${decoded.patchHash}:${decoded.timestamp}`)
        .digest('hex');
    if (decoded.signature !== expectedSig) {
        throw new Error('Nieważny podpis kryptograficzny tokenu eksportu Von Halsky.');
    }
}

function createVonHalskyController({
    prisma = defaultPrisma,
    vonHalskyService = defaultVonHalskyService,
    eventBus = defaultEventBus,
    exportLogger = defaultExportLogger
} = {}) {
    async function resolveOrganizationContext(cfg, requestedOrgId = null) {
        const directOrg = trimOrNull(requestedOrgId) || trimOrNull(cfg?.organizationId) || '';
        if (directOrg && isValidUuid(directOrg)) {
            return { organizationId: directOrg, organizations: [], autoDetected: false };
        }
        const orgs = await vonHalskyService.getOrganizations({ injectedPrisma: prisma });
        if (orgs.length === 1 && orgs[0]?.id) {
            return {
                organizationId: String(orgs[0].id),
                organizationName: orgs[0].name || '',
                organizations: orgs,
                autoDetected: true
            };
        }
        return {
            organizationId: '',
            organizationName: '',
            organizations: orgs,
            autoDetected: false
        };
    }

    /**
     * GET /api/offer-optimizer/vonhalsky/categories?q=...&forceRefresh=false
     */
    const listCategories = async (req, res) => {
        try {
            const q = String(req.query?.q || '').trim().toLowerCase();
            const forceRefresh = req.query?.forceRefresh === 'true';
            const limit = Math.min(Math.max(Number(req.query?.limit) || 100, 1), 300);

            const cfg = await vonHalskyService.getConfig(prisma);
            if (!cfg.clientId || !cfg.clientSecret) {
                return res.status(200).json({
                    apiConnected: false,
                    categories: [],
                    total: 0,
                    message: 'Brak danych dostępowych Von Halsky (Client ID / Client Secret) w Panelu Administracyjnym.'
                });
            }

            const data = await vonHalskyService.getCategories({ depth: 10, forceRefresh, injectedPrisma: prisma });
            let leaves = data.flatLeaves || [];
            if (q) {
                const terms = q.split(/\s+/).filter(Boolean);
                leaves = leaves.filter(cat => {
                    const hay = `${cat.path} ${cat.name} ${cat.id}`.toLowerCase();
                    return terms.every(t => hay.includes(t));
                });
            }

            return res.status(200).json({
                apiConnected: true,
                environment: cfg.environment,
                total: leaves.length,
                categories: leaves.slice(0, limit)
            });
        } catch (error) {
            console.error('[VonHalskyController] listCategories error:', error.message);
            return res.status(error.statusCode || 500).json({
                error: error.message || 'Błąd pobierania kategorii InPost Von Halsky.',
                code: error.code || null
            });
        }
    };

    /**
     * GET /api/offer-optimizer/vonhalsky/categories/:categoryId/attributes
     */
    const getCategoryAttributesEndpoint = async (req, res) => {
        try {
            const categoryId = trimOrNull(req.params?.categoryId);
            if (!categoryId || !isValidUuid(categoryId)) {
                return res.status(400).json({ error: 'Wymagany poprawny identyfikator UUID kategorii Von Halsky.' });
            }
            const forceRefresh = req.query?.forceRefresh === 'true';
            const [category, attributes] = await Promise.all([
                vonHalskyService.getCategoryDetails(categoryId, { injectedPrisma: prisma }),
                vonHalskyService.getCategoryAttributes(categoryId, { forceRefresh, injectedPrisma: prisma })
            ]);
            return res.status(200).json({ category, attributes });
        } catch (error) {
            console.error('[VonHalskyController] getCategoryAttributes error:', error.message);
            return res.status(error.statusCode || 500).json({
                error: error.message || 'Błąd pobierania atrybutów kategorii Von Halsky.',
                code: error.code || null
            });
        }
    };

    /**
     * GET /api/offer-optimizer/vonhalsky/offers/search?ean=&sku=&name=&organizationId=
     */
    const searchOffersAndHints = async (req, res) => {
        try {
            const { ean = '', sku = '', name = '', mpn = '', organizationId = '' } = req.query || {};
            const cfg = await vonHalskyService.getConfig(prisma);
            if (!cfg.clientId || !cfg.clientSecret) {
                return res.status(200).json({
                    apiConnected: false,
                    offers: [],
                    hints: [],
                    message: 'Integracja Von Halsky nie ma jeszcze skonfigurowanego Client ID / Client Secret.'
                });
            }

            const orgCtx = await resolveOrganizationContext(cfg, organizationId);
            if (!orgCtx.organizationId) {
                return res.status(400).json({
                    error: 'Nie wybrano Organization ID dla Von Halsky. Ustaw domyślną organizację w Panelu Admina.',
                    organizations: orgCtx.organizations
                });
            }

            const [offers, hintsRes] = await Promise.all([
                vonHalskyService.findExistingOffersForProduct({
                    organizationId: orgCtx.organizationId,
                    ean,
                    sku,
                    externalId: sku,
                    injectedPrisma: prisma
                }),
                vonHalskyService.getOfferHints({
                    organizationId: orgCtx.organizationId,
                    ean,
                    mpn: mpn || sku,
                    name,
                    limit: 5,
                    injectedPrisma: prisma
                }).catch(hintErr => {
                    console.warn('[VonHalskyController] Błąd pobierania hints (non-blocking):', hintErr.message);
                    return { data: [] };
                })
            ]);

            return res.status(200).json({
                apiConnected: true,
                environment: cfg.environment,
                organizationId: orgCtx.organizationId,
                offers,
                hints: hintsRes.data || []
            });
        } catch (error) {
            console.error('[VonHalskyController] searchOffersAndHints error:', error.message);
            return res.status(error.statusCode || 500).json({
                error: error.message || 'Błąd wyszukiwania ofert w InPost Von Halsky.',
                code: error.code || null
            });
        }
    };

    /**
     * Wspólna logika budowania pełnego kontekstu Pre-flight (reużywana w validate i export).
     */
    async function preparePreflightState(reqBody = {}) {
        const {
            ean,
            productId,
            mode = 'auto', // 'auto' | 'create' | 'update'
            offerId = '',
            organizationId = '',
            categoryId = '',
            htmlContent = null,
            images = null,
            features = null,
            overrides = {}
        } = reqBody || {};

        if (!ean && !productId) {
            const err = new Error('Wymagany kod EAN lub ID produktu.');
            err.statusCode = 400;
            throw err;
        }

        const product = await resolveProductByIdOrEan(prisma, {
            productId,
            ean,
            include: { brand: true }
        });
        if (!product) {
            const err = new Error('Nie znaleziono produktu w bazie PIM.');
            err.statusCode = 404;
            throw err;
        }

        const existingDraft = parseOfferDraftJson(product.offerDraft);
        const cfg = await vonHalskyService.getConfig(prisma);
        const apiConnected = Boolean(cfg.clientId && cfg.clientSecret);

        const effectiveHtmlContent = htmlContent || existingDraft.htmlContent || null;
        const effectiveDraftImages = Array.isArray(images) && images.length > 0
            ? images
            : (Array.isArray(existingDraft.images) ? existingDraft.images : []);
        const effectiveFeatures = (features && typeof features === 'object' && !Array.isArray(features))
            ? features
            : (product.features || {});

        // Łączymy zapisane wcześniej nadpisania produktu (np. GPSR / atrybuty) z bieżącymi overrides z modalu
        const mergedOverrides = {
            ...(existingDraft.vonhalskyGpsr ? { gpsr: existingDraft.vonhalskyGpsr } : {}),
            ...(existingDraft.vonhalskyAttributeOverrides ? { attributes: existingDraft.vonhalskyAttributeOverrides } : {}),
            ...(overrides && typeof overrides === 'object' ? overrides : {})
        };
        if (overrides?.gpsr) {
            mergedOverrides.gpsr = {
                ...(existingDraft.vonhalskyGpsr || {}),
                ...overrides.gpsr,
                manufacturer: {
                    ...(existingDraft.vonhalskyGpsr?.manufacturer || {}),
                    ...(overrides.gpsr?.manufacturer || {}),
                    responsiblePersonDetails: {
                        ...(existingDraft.vonhalskyGpsr?.manufacturer?.responsiblePersonDetails || {}),
                        ...(overrides.gpsr?.manufacturer?.responsiblePersonDetails || {})
                    }
                }
            };
        }
        if (overrides?.attributes) {
            mergedOverrides.attributes = {
                ...(existingDraft.vonhalskyAttributeOverrides || {}),
                ...overrides.attributes
            };
        }

        let resolvedOrgId = trimOrNull(organizationId) || trimOrNull(existingDraft.vonhalskyOrganizationId) || trimOrNull(cfg.organizationId) || '';
        let organizationsList = [];
        let matchedOffers = [];
        let existingOfferDetails = null;
        let existingOffer = null;
        let hints = [];
        let primaryHint = null;
        let categoryDetails = null;
        let attributeDefinitions = [];
        const preflightApiErrors = [];
        const preflightApiWarnings = [];

        let targetOfferId = trimOrNull(offerId) || (mode !== 'create' ? trimOrNull(existingDraft.vonhalskyOfferId) : '') || '';
        let targetCategoryId = trimOrNull(categoryId) || trimOrNull(mergedOverrides.categoryId) || trimOrNull(existingDraft.vonhalskyCategoryId) || '';

        if (!apiConnected) {
            preflightApiErrors.push('Integracja InPost Von Halsky nie ma jeszcze skonfigurowanego Client ID i Client Secret. Uzupełnij dane dostępowe w Panelu Administracyjnym -> Integracje API (tryb podglądu offline).');
        } else {
            try {
                const orgCtx = await resolveOrganizationContext(cfg, resolvedOrgId);
                resolvedOrgId = orgCtx.organizationId;
                organizationsList = orgCtx.organizations || [];
                if (!resolvedOrgId) {
                    preflightApiErrors.push('Nie wybrano Organization ID dla InPost Von Halsky. Ustaw domyślną organizację w Panelu Administracyjnym -> Integracje API.');
                }
            } catch (orgErr) {
                preflightApiErrors.push(`Błąd autoryzacji / pobierania organizacji Von Halsky: ${orgErr.message}`);
            }

            if (resolvedOrgId) {
                // 1. Rozpoznanie istniejącej oferty
                if (targetOfferId && isValidUuid(targetOfferId) && mode !== 'create') {
                    try {
                        existingOfferDetails = await vonHalskyService.getOfferDetails(resolvedOrgId, targetOfferId, { injectedPrisma: prisma });
                        existingOffer = existingOfferDetails?.offer || null;
                    } catch (offerErr) {
                        if (offerErr.statusCode === 404) {
                            preflightApiWarnings.push(`Zapisana oferta Von Halsky (${targetOfferId}) nie istnieje już na koncie — przełączono na wyszukiwanie / tworzenie nowej oferty.`);
                            targetOfferId = '';
                        } else {
                            preflightApiErrors.push(`Nie udało się pobrać szczegółów oferty Von Halsky (${targetOfferId}): ${offerErr.message}`);
                        }
                    }
                } else if (mode !== 'create') {
                    try {
                        matchedOffers = await vonHalskyService.findExistingOffersForProduct({
                            organizationId: resolvedOrgId,
                            ean: product.ean,
                            sku: product.sku,
                            externalId: product.sku || product.id,
                            injectedPrisma: prisma
                        });
                        if (matchedOffers.length > 0 && mode !== 'create') {
                            targetOfferId = matchedOffers[0].id;
                            existingOfferDetails = await vonHalskyService.getOfferDetails(resolvedOrgId, targetOfferId, { injectedPrisma: prisma });
                            existingOffer = existingOfferDetails?.offer || null;
                        }
                    } catch (searchErr) {
                        preflightApiWarnings.push(`Nie udało się przeszukać istniejących ofert Von Halsky: ${searchErr.message}`);
                    }
                }

                // 2. Pobranie podpowiedzi katalogowych (GET /offers/hint)
                try {
                    const hintRes = await vonHalskyService.getOfferHints({
                        organizationId: resolvedOrgId,
                        ean: product.ean,
                        mpn: product.sku,
                        name: product.name,
                        limit: 5,
                        injectedPrisma: prisma
                    });
                    hints = hintRes.data || [];
                    primaryHint = hints[0] || null;
                } catch (hintErr) {
                    preflightApiWarnings.push(`Podpowiedzi katalogowe InPost (offers/hint) niedostępne: ${hintErr.message}`);
                }

                // 3. Rozwiązanie kategorii i pobranie jej atrybutów
                if (!targetCategoryId) {
                    targetCategoryId = trimOrNull(existingOffer?.product?.categoryId)
                        || trimOrNull(primaryHint?.product?.categoryId)
                        || '';
                }
                if (targetCategoryId && isValidUuid(targetCategoryId)) {
                    try {
                        const [catDet, catAttrs] = await Promise.all([
                            vonHalskyService.getCategoryDetails(targetCategoryId, { injectedPrisma: prisma }),
                            vonHalskyService.getCategoryAttributes(targetCategoryId, { injectedPrisma: prisma })
                        ]);
                        categoryDetails = catDet;
                        attributeDefinitions = Array.isArray(catAttrs) ? catAttrs : [];
                    } catch (catErr) {
                        preflightApiErrors.push(`Nie udało się pobrać kategorii/atrybutów Von Halsky (${targetCategoryId}): ${catErr.message}`);
                    }
                }
            }
        }

        const effectiveMode = (mode === 'create')
            ? 'create'
            : ((existingOffer && existingOffer.id) ? 'update' : 'create');

        const built = buildVonHalskyOfferPayload({
            mode: effectiveMode,
            product,
            existingOffer,
            category: categoryDetails,
            attributeDefinitions,
            hint: primaryHint,
            htmlContent: effectiveHtmlContent,
            draftImages: effectiveDraftImages,
            features: effectiveFeatures,
            config: cfg,
            overrides: {
                ...mergedOverrides,
                ...(targetCategoryId ? { categoryId: targetCategoryId } : {})
            }
        });

        const allErrors = [...preflightApiErrors, ...built.errors];
        const allWarnings = [...preflightApiWarnings, ...built.warnings];

        return {
            product,
            existingDraft,
            cfg,
            apiConnected,
            resolvedOrgId,
            organizationsList,
            matchedOffers,
            existingOfferDetails,
            existingOffer,
            hints,
            categoryDetails,
            built,
            errors: allErrors,
            warnings: allWarnings
        };
    }

    /**
     * POST /api/offer-optimizer/validate-vonhalsky-export
     * Tylko odczyt / walidacja Pre-flight — zero mutacji w InPost Von Halsky!
     */
    const validateVonHalskyExport = async (req, res) => {
        try {
            const state = await preparePreflightState(req.body || {});
            const targetOfferId = state.built.mode === 'update' ? (state.existingOffer?.id || '') : '';

            let exportToken = null;
            if (state.apiConnected && state.resolvedOrgId && state.errors.length === 0 && state.built.hasChanges) {
                const fingerprint = buildTokenFingerprint({
                    mode: state.built.mode,
                    organizationId: state.resolvedOrgId,
                    offerId: targetOfferId,
                    payload: state.built.payload,
                    binaryAttachments: state.built.binaryAttachments
                });
                exportToken = signVonHalskyExportToken({
                    ean: state.product.ean,
                    mode: state.built.mode,
                    organizationId: state.resolvedOrgId,
                    offerId: targetOfferId,
                    payloadObj: fingerprint
                });
            }

            return res.status(200).json({
                apiConnected: state.apiConnected,
                environment: state.cfg.environment,
                apiBaseUrl: state.cfg.apiBaseUrl,
                organizationId: state.resolvedOrgId || null,
                organizationName: state.cfg.organizationName || null,
                organizations: state.organizationsList,
                mode: state.built.mode,
                httpMethod: state.built.httpMethod,
                contentType: state.built.contentType,
                offer: state.existingOffer ? {
                    id: state.existingOffer.id,
                    status: state.existingOffer.status,
                    externalId: state.existingOffer.externalId || null,
                    name: state.existingOffer.product?.name || '',
                    categoryId: state.existingOffer.product?.categoryId || null,
                    updatedAt: state.existingOffer.updatedAt || null,
                    validationErrors: state.existingOfferDetails?.metadata?.validationErrors || [],
                    rejectionReasons: state.existingOfferDetails?.metadata?.rejectionReasons || []
                } : null,
                matchedOffers: state.matchedOffers,
                hints: state.hints.map(h => ({
                    productId: h.product?.productId || null,
                    name: h.product?.name || '',
                    brand: h.product?.brand || '',
                    categoryId: h.product?.categoryId || null,
                    ean: h.product?.ean || null,
                    attributesCount: Array.isArray(h.product?.attributes) ? h.product.attributes.length : 0,
                    hasGpsr: Array.isArray(h.gpsr) && h.gpsr.length > 0
                })),
                preview: state.built.preview,
                payloadPreview: state.built.payload,
                hasChanges: state.built.hasChanges,
                errors: state.errors,
                warnings: state.warnings,
                canExport: Boolean(exportToken),
                requiresDoubleConfirmation: true,
                exportToken
            });
        } catch (error) {
            console.error('[VonHalskyController] validateVonHalskyExport error:', error.message);
            return res.status(error.statusCode || 500).json({
                error: error.message || 'Błąd przygotowania Pre-flight dla InPost Von Halsky.',
                code: error.code || null
            });
        }
    };

    /**
     * POST /api/offer-optimizer/export-vonhalsky
     * TWARDA BLOKADA: wymaga ręcznego wywołania + `confirmedTwice: true` + ważnego podpisanego `exportToken` z Pre-flight!
     */
    const exportToVonHalsky = async (req, res) => {
        try {
            const body = req.body || {};

            // Bramka #1: Bezwarunkowe dwukrotne potwierdzenie operatora
            if (body.confirmedTwice !== true) {
                return res.status(400).json({
                    error: 'Eksport do InPost Von Halsky wymaga dwukrotnego potwierdzenia przez operatora na frontendzie.',
                    code: 'DOUBLE_CONFIRMATION_REQUIRED'
                });
            }

            if (!body.exportToken) {
                return res.status(400).json({
                    error: 'Brak tokenu weryfikacji Pre-flight (exportToken). Otwórz podgląd Pre-flight przed wysyłką.',
                    code: 'MISSING_EXPORT_TOKEN'
                });
            }

            const state = await preparePreflightState(body);
            if (!state.apiConnected) {
                return res.status(412).json({
                    error: 'Brak skonfigurowanych danych dostępowych InPost Von Halsky (Client ID / Client Secret).',
                    code: 'VONHALSKY_NOT_CONFIGURED'
                });
            }

            if (state.errors.length > 0) {
                return res.status(400).json({
                    error: `Wykryto błędy walidacji blokujące eksport: ${state.errors.join(' | ')}`,
                    errors: state.errors
                });
            }

            if (!state.built.hasChanges) {
                return res.status(200).json({
                    status: 'SKIPPED_NO_CHANGES',
                    message: 'Brak zmian do wysłania do InPost Von Halsky.'
                });
            }

            const targetOfferId = state.built.mode === 'update' ? (state.existingOffer?.id || '') : '';
            const fingerprint = buildTokenFingerprint({
                mode: state.built.mode,
                organizationId: state.resolvedOrgId,
                offerId: targetOfferId,
                payload: state.built.payload,
                binaryAttachments: state.built.binaryAttachments
            });

            // Bramka #2: Kryptograficzna weryfikacja podpisu HMAC-SHA256 i niezmienności ładunku
            try {
                verifyVonHalskyExportToken(body.exportToken, {
                    ean: state.product.ean,
                    mode: state.built.mode,
                    organizationId: state.resolvedOrgId,
                    offerId: targetOfferId,
                    payloadObj: fingerprint
                });
            } catch (tokenErr) {
                return res.status(409).json({
                    error: tokenErr.message,
                    code: 'INVALID_EXPORT_TOKEN'
                });
            }

            let finalOfferId = targetOfferId;
            let commandId = null;
            let commandStatus = null;
            let commandErrors = [];
            let offerMetadata = null;
            let offerStatus = null;
            const exportWarnings = [...state.warnings];

            if (state.built.mode === 'create') {
                exportLogger.info(`[VONHALSKY EXPORT] POST nowa oferta dla EAN=${state.product.ean}, org=${state.resolvedOrgId}, env=${state.cfg.environment}`);
                const created = await vonHalskyService.createOffer(state.resolvedOrgId, state.built.payload, { injectedPrisma: prisma });
                finalOfferId = created.offerId;
                commandId = created.commandId || null;

                if (commandId) {
                    const polled = await vonHalskyService.pollCommandStatus(state.resolvedOrgId, commandId, { injectedPrisma: prisma });
                    commandStatus = polled.status;
                    commandErrors = Array.isArray(polled.errors) ? polled.errors : [];
                    if (commandStatus === 'FAILURE') {
                        exportLogger.error(`[VONHALSKY EXPORT] Komenda POST ${commandId} odrzucona:`, { commandErrors });
                        return res.status(422).json({
                            error: `InPost Von Halsky odrzucił utworzenie oferty (${commandErrors.map(e => `${e.fieldName ? `[${e.fieldName}] ` : ''}${e.message}`).join('; ') || 'FAILURE'}).`,
                            offerId: finalOfferId,
                            commandId,
                            commandStatus,
                            commandErrors
                        });
                    }
                }
            } else {
                exportLogger.info(`[VONHALSKY EXPORT] PATCH oferta=${finalOfferId} dla EAN=${state.product.ean}, org=${state.resolvedOrgId}, env=${state.cfg.environment}`);
                if (Object.keys(state.built.payload).length > 0) {
                    const patched = await vonHalskyService.patchOffer(state.resolvedOrgId, finalOfferId, state.built.payload, { injectedPrisma: prisma });
                    offerMetadata = patched?.metadata || null;
                    offerStatus = patched?.offer?.status || null;
                }
            }

            // Upload binarnych załączników IMAGE (np. lokalne zdjęcia Base64 AI / HTTP)
            const uploadedAttachments = [];
            if (finalOfferId && state.built.binaryAttachments.length > 0) {
                for (const att of state.built.binaryAttachments) {
                    try {
                        const attRes = await vonHalskyService.uploadImageSourceAsAttachment(state.resolvedOrgId, finalOfferId, {
                            source: att.source,
                            fileName: att.fileName,
                            priority: att.priority,
                            injectedPrisma: prisma
                        });
                        uploadedAttachments.push({
                            fileName: att.fileName,
                            priority: att.priority,
                            commandId: attRes?.commandId || null,
                            status: attRes?.status || 'PENDING'
                        });
                    } catch (attErr) {
                        exportWarnings.push(`Nie udało się wgrać załącznika zdjęcia #${att.priority} (${att.fileName}): ${attErr.message}`);
                        exportLogger.warn(`[VONHALSKY EXPORT] Błąd uploadu załącznika #${att.priority}: ${attErr.message}`);
                    }
                }
            }

            // Odczyt aktualnych metadanych oferty (validationErrors / rejectionReasons)
            if (finalOfferId && !offerMetadata) {
                try {
                    const refreshed = await vonHalskyService.getOfferDetails(state.resolvedOrgId, finalOfferId, { injectedPrisma: prisma });
                    offerMetadata = refreshed?.metadata || null;
                    offerStatus = refreshed?.offer?.status || offerStatus;
                } catch (refErr) {
                    exportWarnings.push(`Wysłano ofertę, ale nie udało się odczytać końcowych metadanych: ${refErr.message}`);
                }
            }

            // Zapis śladu powiązania i preferencji w istniejącej kolumnie JSON `Product.offerDraft` (bez zmian schematu DB!)
            const nextDraft = {
                ...state.existingDraft,
                vonhalskyOfferId: finalOfferId || state.existingDraft.vonhalskyOfferId || null,
                vonhalskyOrganizationId: state.resolvedOrgId,
                vonhalskyCategoryId: state.built.preview.categoryId || state.existingDraft.vonhalskyCategoryId || null,
                vonhalskyExternalId: state.built.preview.externalId || state.existingDraft.vonhalskyExternalId || null,
                vonhalskyEnvironment: state.cfg.environment,
                vonhalskyGpsr: body.overrides?.gpsr || state.existingDraft.vonhalskyGpsr || undefined,
                vonhalskyAttributeOverrides: body.overrides?.attributes || state.existingDraft.vonhalskyAttributeOverrides || undefined,
                vonhalskyLastExport: {
                    timestamp: new Date().toISOString(),
                    mode: state.built.mode,
                    environment: state.cfg.environment,
                    organizationId: state.resolvedOrgId,
                    offerId: finalOfferId,
                    commandId,
                    commandStatus: commandStatus || (state.built.mode === 'update' ? 'SUCCESS' : 'PENDING'),
                    offerStatus: offerStatus || null,
                    httpsImagesCount: state.built.preview.httpsImagesCount,
                    binaryAttachmentsUploaded: uploadedAttachments.length,
                    attributesCount: Array.isArray(state.built.payload?.product?.attributes) ? state.built.payload.product.attributes.length : 0
                }
            };

            await prisma.product.update({
                where: { id: state.product.id },
                data: { offerDraft: nextDraft }
            });

            eventBus.publish('PRODUCT_VONHALSKY_EXPORTED', {
                ean: state.product.ean,
                productId: state.product.id,
                environment: state.cfg.environment,
                organizationId: state.resolvedOrgId,
                offerId: finalOfferId,
                mode: state.built.mode,
                commandStatus: commandStatus || 'SUCCESS'
            });

            const statusLabel = commandStatus === 'PENDING_TIMEOUT'
                ? `Wysłano ofertę do InPost Von Halsky (${finalOfferId}) — przetwarzanie komendy w toku (${commandId}).`
                : (state.built.mode === 'create'
                    ? `Sukces! Utworzono nową ofertę w InPost Von Halsky (${finalOfferId}).`
                    : `Sukces! Zaktualizowano ofertę w InPost Von Halsky (${finalOfferId}).`);

            return res.status(200).json({
                status: commandStatus || 'SUCCESS',
                mode: state.built.mode,
                environment: state.cfg.environment,
                organizationId: state.resolvedOrgId,
                offerId: finalOfferId,
                commandId,
                offerStatus,
                validationErrors: offerMetadata?.validationErrors || [],
                rejectionReasons: offerMetadata?.rejectionReasons || [],
                uploadedAttachments,
                warnings: exportWarnings,
                message: statusLabel
            });
        } catch (error) {
            exportLogger.error(`[VONHALSKY EXPORT ERROR] ${error.message}`, { stack: error.stack });
            return res.status(error.statusCode || 500).json({
                error: error.message || 'Błąd eksportu oferty do InPost Von Halsky.',
                code: error.code || null,
                details: error.vonHalskyDetails || null
            });
        }
    };

    return {
        listCategories,
        getCategoryAttributesEndpoint,
        searchOffersAndHints,
        validateVonHalskyExport,
        exportToVonHalsky
    };
}

const defaultController = createVonHalskyController();

module.exports = {
    ...defaultController,
    createVonHalskyController,
    signVonHalskyExportToken,
    verifyVonHalskyExportToken,
    buildTokenFingerprint
};
