const crypto = require('crypto');
const OfferOptimizerService = require('./offer-optimizer.service');
const AiService = require('./ai.service');
const AllegroService = require('./allegro.service');
const BaseLinkerService = require('./baselinker.service');
const EanPipelineService = require('./ean.pipeline.service');
const knowledgeRagService = require('./knowledge.rag.service');
const socketService = require('../../core/socket');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EventBus = require('../../core/EventBus');
const baselinkerExportAgent = require('../offer-optimizer-v2/baselinker.export.agent');
const baselinkerExtract = require('../offer-optimizer-v2/baselinker.extract');
const { stripRawInciFooterFromSection3 } = require('../offer-optimizer-v2/normalization');
const googleSuggestFaqService = require('../offer-optimizer-v2/services/google-suggest-faq.service');
const titleOptimizer = require('../offer-optimizer-v2/services/title-optimizer.service');
const {
    stripHtmlAndEmoticons,
    extractSafetyInformationText,
    extractCleanInciForAllegro,
    buildAllegroParameterPatchPayload,
    hasCompositionInPatchBody,
    stripCompositionFromPatchBody,
    collectPipelineImagesForAllegro,
    buildAllegroDescriptionSections,
    buildAllegroContentPreflight,
    buildAllegroContentPatchBody
} = require('../../utils/allegro_mapper');
const { trimOrNull, resolveProductByIdOrEan, buildNumericProductUpdateFields } = require('../../utils/productLookup');
const workspaceService = require('../../services/workspace.service');
const {
    resolveWorkspaceContentProfile,
    resolveOrderedVisibleDescriptionSections,
    loadSiblingCopyFingerprints
} = require('../../services/workspaceContentProfile.service');
const { signScopedExportToken, verifyAndConsumeScopedExportToken } = require('../../utils/exportTokenGuard');
const { exportLogger } = require('../../utils/logger');
const sharp = require('sharp');

// --- HARD LOCK: Zabezpieczenie Eksportu BaseLinkera ---
const EXPORT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
// ------------------------------------------------------

// Magazyn pamięci dla asynchronicznych zadań Lifestyle AI z automatycznym czyszczeniem (TTL 15 min)
const lifestyleJobs = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [jobId, job] of lifestyleJobs.entries()) {
        if (now - job.createdAt > 15 * 60 * 1000) {
            lifestyleJobs.delete(jobId);
        }
    }
}, 5 * 60 * 1000);

const startOptimization = async (req, res) => {
    try {
        const { inventoryId, productIds } = req.body;

        if (!inventoryId || !Array.isArray(productIds) || productIds.length === 0) {
            return res.status(400).json({ error: "Wymagane poprawne ID magazynu (inventoryId) oraz niepusta tablica (productIds)." });
        }

        // Puszcza asynchronicznie, nie blokujemy klienta czekaniem na koniec - zwracamy mu JOB TICKET
        const jobTicket = await OfferOptimizerService.startBulkOptimization(inventoryId, productIds);

        res.status(202).json({
            message: "Masowa restrukturyzacja GEO 2026 i Audyt graficzny rozpoczęte pomyślnie.",
            jobId: jobTicket.id,
            status: jobTicket.status,
            total_items: jobTicket.total
        });

    } catch (error) {
        console.error("[OfferOptimizerController] Błąd Initacji Zlecenia:", error);
        res.status(500).json({ error: error.message || "Wystąpił błąd wewnętrzny serwera." });
    }
};

const checkStatus = (req, res) => {
    try {
        const jobId = req.params.jobId;
        const jobStatus = OfferOptimizerService.getJobStatus(jobId);

        if (!jobStatus) {
            return res.status(404).json({ error: "Brak zlecenia o podanym Job ID w maszynie kolejkującej." });
        }

        res.status(200).json(jobStatus);

    } catch (error) {
        console.error("[OfferOptimizerController] Błąd sprawdzania statusu:", error);
        res.status(500).json({ error: "Błąd odczytu instancji bazy/kolejki pamięci." });
    }
};

const analyzeSingle = async (req, res) => {
    try {
        const { ean, analysisMode, forceRegenerate } = req.body;
        const mode = analysisMode || "STANDARD";

        if (!ean) {
            return res.status(400).json({ error: "Wymagany jest kod EAN." });
        }

        console.log(`[Vision API] Rozpoczęto natywną analizę dla EAN: ${ean}. Tryb: ${mode}`);
        
        // Faza 1: Sprawdzenie / Synchronizacja PIM
        let product = await resolveProductByIdOrEan(prisma, { productId: req.body?.productId, ean, workspaceId: req.workspaceId || null });
        
        // Jeśli produktu nie ma w bazie lub nie jest zsynchronizowany, odrzucamy żądanie (brak lokalnych danych PIM)
        if (!product || !product.isSynced) {
             console.error(`[PIM] EAN ${ean} brak w bazie lub isSynced=false. Synchronizacja z BaseLinkerem została ZABLOKOWANA przez politykę.`);
             return res.status(404).json({ error: `Produkt o EAN ${ean} nie istnieje w lokalnej bazie PIM lub nie jest zsynchronizowany. Pobieranie w locie z BaseLinkera wyłączone.` });
        }

        if (!product.images || product.images.length === 0) {
             console.warn("[Vision API] Ostrzeżenie: Rekord PIM nie posiada żadnych zdjęć.");
        }

        // Faza 1.5: Sprawdzenie Kopii Roboczej
        if (product.offerDraft && Object.keys(product.offerDraft).length > 0 && !forceRegenerate) {
            console.log("[PIM] Zwracam zapisaną kopię roboczą z bazy!");
            
            let sekcja1 = '', sekcja2 = '', sekcja3 = '', sekcja4 = '', sekcja5 = '', sekcja6 = '', sekcjaTips = '', sekcja7 = '';
            const draft = product.offerDraft;
            if (draft.htmlContent) {
                if (typeof draft.htmlContent === 'string') {
                    sekcja1 = draft.htmlContent;
                } else if (typeof draft.htmlContent === 'object') {
                    sekcja1 = draft.htmlContent.sekcja1 || '';
                    sekcja2 = draft.htmlContent.sekcja2 || '';
                    sekcja3 = stripRawInciFooterFromSection3(draft.htmlContent.sekcja3 || '');
                    sekcja4 = draft.htmlContent.sekcja4 || '';
                    sekcja5 = draft.htmlContent.sekcja5 || '';
                    sekcja6 = draft.htmlContent.sekcja6 || '';
                    sekcjaTips = draft.htmlContent.sekcjaTips || '';
                    sekcja7 = draft.htmlContent.sekcja7 || '';
                }
            } else {
                sekcja1 = draft.sekcja1 || '';
                sekcja2 = draft.sekcja2 || '';
                sekcja3 = stripRawInciFooterFromSection3(draft.sekcja3 || '');
                sekcja4 = draft.sekcja4 || '';
                sekcja5 = draft.sekcja5 || '';
                sekcja6 = draft.sekcja6 || '';
                sekcjaTips = draft.sekcjaTips || '';
                sekcja7 = draft.sekcja7 || '';
            }

            return res.status(200).json({
                title: product.offerDraft.title || product.name,
                ean: product.ean,
                htmlContent: { sekcja1, sekcja2, sekcja3, sekcja4, sekcja5, sekcja6, sekcjaTips, sekcja7 },
                images: ((product.offerDraft.visionTickets?.length ? product.offerDraft.visionTickets : null) || (product.offerDraft.images?.length ? product.offerDraft.images : null) || product.images || []).map(img => {
                    if (typeof img === 'string') return { originalUrl: img, isCompliant: true, alerts: [] };
                    return {
                        originalUrl: img.originalUrl || img.url || '',
                        replacedUrl: img.replacedUrl || null,
                        isCompliant: img.isCompliant !== undefined ? img.isCompliant : true,
                        alerts: img.alerts || []
                    };
                }),
                isDraftRestored: true
            });
        }

        // Faza 1.8: Agent Badawczy (Research Agent) - Pobieranie twardych specyfikacji i INCI
        console.log("[PIM] Uruchamianie Agenta Badawczego (Google Search) dla EAN...");
        let intelligenceData = "Brak dodatkowych danych (Tryb offline lub błąd Agenta).";
        try {
            intelligenceData = await AiService.gatherProductIntelligence(product.ean, product.name);
        } catch (researchErr) {
            console.error("[PIM] Błąd Agenta Badawczego:", researchErr.message);
        }

        // Faza 1.9: Agent Audytor Prawny (Compliance Agent)
        console.log("[PIM] Uruchamianie Agenta Prawnego (Compliance Agent) analizującego regulaminy PDF...");
        let complianceReport = "Brak raportu prawnego.";
        try {
            complianceReport = await AiService.generateComplianceReport(product.name, product.aeoContent, product.descriptionHtml);
        } catch (compErr) {
            console.error("[PIM] Błąd Agenta Prawnego:", compErr.message);
        }

        // Faza 2: Karmienie Bestii (Gemini 2.5 Pro / 3.1) - Native Analysis jako Copywriter / GEO Optimizer
        console.log("[AiService] Odpalanie silnika Multimodalnego dla Native API w tle...");
        const featuresString = product.features ? JSON.stringify(product.features) : '';
        const textContent = `NAZWA: ${product.name}\n\nCECHY TECHNICZNE PIM: ${featuresString}\n\nTREŚĆ AEO (Answer Engine Optimization): ${product.aeoContent || ''}\n\nOPIS HTML: ${product.descriptionHtml || ''}\n\n--- DANE Z INTERNETU (AGENT BADAWCZY: INCI & SPEC) ---\n${intelligenceData}\n\n--- RAPORT ZGODNOŚCI PRAWNEJ (COMPLIANCE AGENT) ---\n${complianceReport}`;
        const imageUrls = product.images || [];
        
        const payloadFromGemini = await AiService.generateNativeAnalysis(textContent, imageUrls, mode);

        if (!payloadFromGemini || (payloadFromGemini.title === undefined && !payloadFromGemini.htmlContent)) {
             throw new Error("Generative Engine nie zwróciło poprawnej struktury.");
        }

        // TARCZA ANTY-LENIWOŚCI LLM: Model LLM może zignorować i uciąć zdjęcia na wyjściu by oszczędzić tokeny
        // Bierzemy twardą, oryginalną tablicę z PIM i szukamy dla niej audytów z modelu.
        const mergedImages = imageUrls.map(originalUrl => {
            const auditObj = (payloadFromGemini.images || []).find(aiImg => aiImg.originalUrl === originalUrl);
            if (auditObj) return auditObj;
            return { originalUrl, isCompliant: true, alerts: [] }; // Zakładamy sukces, jeśli AI pominęło
        });

        // Dorzucamy ewentualne sztuczne "Alerty Ilościowe", które AI wrzuca jako fałszywe URL-e na koniec tablicy
        const fakeAuditCards = (payloadFromGemini.images || []).filter(aiImg => !aiImg.originalUrl || !aiImg.originalUrl.startsWith('http'));
        mergedImages.push(...fakeAuditCards);

        return res.status(200).json({
            title: payloadFromGemini.title,
            ean: product.ean,
            htmlContent: payloadFromGemini.htmlContent,
            images: mergedImages
        });

    } catch (error) {
        console.error("CRASH: Błąd optymalizatora API:", error.message, error.stack);
        return res.status(500).json({ error: error.message, details: error.message });
    }
};

const regenerateTitle = async (req, res) => {
    try {
        const { ean, productId, currentTitle } = req.body;
        if (!ean && !productId) return res.status(400).json({ error: "Wymagany EAN." });

        const wsId = req.workspaceId || null;
        const product = await resolveProductByIdOrEan(prisma, { productId, ean, workspaceId: wsId });
        if (!product) return res.status(404).json({ error: "Produkt nie znaleziony w PIM." });

        const contentProfile = req.workspace ? resolveWorkspaceContentProfile(req.workspace) : null;
        const fingerprints = wsId
            ? await loadSiblingCopyFingerprints(prisma, { ean: product.ean, currentWorkspaceId: wsId })
            : { used_titles: [] };

        const prodFeatures = (product.features && typeof product.features === 'object') ? product.features : {};
        const brandName = prodFeatures['Marka'] || product.brand?.name || '';
        const capVal = prodFeatures['Pojemność'] || prodFeatures['Pojemność / Waga'] || '';

        let allegroCatalogInfo = { found: false, name: null, categoryId: null };
        if (product.ean && process.env.DATA_SOURCE_MODE !== 'fixture') {
            try {
                allegroCatalogInfo = await AllegroService.getCatalogProductInfoByEan(product.ean, { workspaceId: wsId });
            } catch (catErr) {
                exportLogger.warn(`[TitleRegenerate] Ostrzeżenie odczytu karty Katalogu Allegro dla ${product.ean}: ${catErr.message}`);
            }
        }

        let titleSignals = { suggested_phrases: [] };
        try {
            titleSignals = await googleSuggestFaqService.harvestTitleKeywordSignals({
                productName: product.name,
                brand: brandName,
                category: prodFeatures['Kategoria'] || '',
                scent: prodFeatures['Zapach'] || prodFeatures['Nuta zapachowa'] || '',
                features: prodFeatures,
                inci: prodFeatures['Skład/INCI'] || prodFeatures['Skład'] || '',
                offlineOnly: process.env.DATA_SOURCE_MODE === 'fixture'
            });
        } catch (sigErr) {
            exportLogger.warn(`[TitleRegenerate] Ostrzeżenie Google Suggest dla ${product.ean}: ${sigErr.message}`);
        }

        const featuresString = product.features ? JSON.stringify(product.features) : '';
        const textContent = `NAZWA: ${product.name}\n\nCECHY TECHNICZNE PIM: ${featuresString}\n\nOPIS HTML: ${product.descriptionHtml || ''}`;

        const payload = await AiService.generateTitleOnly(textContent, currentTitle || product.name, {
            contentProfile,
            avoidTitles: fingerprints.used_titles,
            allegroCatalogName: allegroCatalogInfo?.name,
            keywordHints: titleSignals?.suggested_phrases || [],
            brand: brandName,
            capacity: capVal
        });

        let matchingCategories = [];
        const targetCategoryId = product.allegroCategoryId || allegroCatalogInfo?.categoryId || null;
        if (payload?.title && targetCategoryId && process.env.DATA_SOURCE_MODE !== 'fixture') {
            try {
                matchingCategories = await AllegroService.getMatchingCategoriesForTitle(payload.title, { workspaceId: wsId });
            } catch {
                matchingCategories = [];
            }
        }

        const seoScore = titleOptimizer.scoreTitleForAllegroAds(payload.title, {
            targetCategoryId,
            matchingCategories,
            keywordHints: titleSignals?.suggested_phrases || [],
            brand: brandName
        });

        res.status(200).json({
            title: payload.title,
            validation: payload.validation || seoScore,
            seoScore,
            sources: {
                allegroCatalogName: allegroCatalogInfo?.name || null,
                keywordHints: titleSignals?.suggested_phrases || [],
                matchingCategories
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const proxyImage = async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send("No url provided");
    try {
        if (url.startsWith('data:image/')) {
            const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const mimeType = matches[1];
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, 'base64');
                
                res.setHeader('Content-Disposition', 'inline; filename="nexus_lifestyle.jpg"');
                res.setHeader('Content-Type', mimeType);
                return res.status(200).send(buffer);
            }
        }

        // Zabezpieczony pobieracz z ai.service omijający WAF za pomocą IPv4 i odpowiednich nagłówków
        const response = await AiService.fetchImageSecure(url, 15000);
        
        res.setHeader('Content-Disposition', 'inline; filename="nexus_image.jpg"');
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        if (response.headers['cache-control']) {
            res.setHeader('Cache-Control', response.headers['cache-control']);
        }
        
        return res.status(200).send(Buffer.from(response.data));
    } catch (e) {
        console.error("[ProxyImage] Błąd proxy dla URL:", url, e.message);
        // TARCZA BŁĘDÓW (Defensive AI) - Fallback
        // Bezpieczny fallback: zwracamy 404 z informacją o błędzie zamiast redirectu do S3, który generowałby AccessDenied XML
        return res.status(404).json({ error: "Nie udało się pobrać obrazu (link wygasł lub serwer odrzucił połączenie).", details: e.message });
    }
};

const isValidOfferImageUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    if (
        trimmed.includes('Wymagane nowe zdjęcie') ||
        trimmed.includes('Pusty slot') ||
        trimmed.includes('Slot #') ||
        trimmed.includes('Audyt') ||
        trimmed.includes('Analiza') ||
        trimmed.includes('placeholder.com')
    ) {
        return false;
    }
    return trimmed.startsWith('http') || trimmed.startsWith('data:image');
};

const saveDraft = async (req, res) => {
    try {
        const { ean, productId, draftData } = req.body || {};
        if ((!ean && !productId && !draftData?.id) || !draftData) {
            return res.status(400).json({ error: "Brak EAN/ID produktu lub danych szkicu (draftData)." });
        }

        const existingProduct = await resolveProductByIdOrEan(prisma, {
            productId: productId || draftData.id,
            ean,
            workspaceId: req.workspaceId || null
        });
        if (!existingProduct) {
            return res.status(404).json({
                error: "Nie znaleziono produktu o podanym EAN/ID w bazie PIM. Zapisz najpierw kartotekę PIM (Nazwa, SKU, Marka, EAN)."
            });
        }

        let existingDraft = {};
        if (existingProduct.offerDraft) {
            try {
                existingDraft = typeof existingProduct.offerDraft === 'string'
                    ? JSON.parse(existingProduct.offerDraft)
                    : existingProduct.offerDraft;
            } catch (_) {
                existingDraft = {};
            }
        }

        // Ochrona przed przypadkowym nadpisaniem istniejącego opisu pustymi sekcjami
        const hasIncomingHtml = draftData.htmlContent && (
            (typeof draftData.htmlContent === 'string' && draftData.htmlContent.replace(/<[^>]*>/g, '').trim() !== '') ||
            (typeof draftData.htmlContent === 'object' && ['sekcja1', 'sekcja2', 'sekcja3', 'sekcja4', 'sekcja5', 'sekcja6', 'sekcjaTips', 'sekcja7'].some(
                k => typeof draftData.htmlContent[k] === 'string' && draftData.htmlContent[k].replace(/<[^>]*>/g, '').trim() !== ''
            ))
        );
        const rawEffectiveHtmlContent = hasIncomingHtml
            ? draftData.htmlContent
            : (existingDraft.htmlContent || draftData.htmlContent);
        const effectiveHtmlContent = (rawEffectiveHtmlContent && typeof rawEffectiveHtmlContent === 'object' && typeof rawEffectiveHtmlContent.sekcja3 === 'string')
            ? { ...rawEffectiveHtmlContent, sekcja3: stripRawInciFooterFromSection3(rawEffectiveHtmlContent.sekcja3) }
            : rawEffectiveHtmlContent;

        // Ochrona przed przypadkowym nadpisaniem wygenerowanych zdjęć samymi pustymi placeholderami
        const incomingTickets = Array.isArray(draftData.visionTickets) && draftData.visionTickets.length > 0
            ? draftData.visionTickets
            : (Array.isArray(draftData.images) ? draftData.images : []);
        const hasIncomingValidPhotos = incomingTickets.some(img => {
            if (typeof img === 'string') return isValidOfferImageUrl(img);
            return isValidOfferImageUrl(img?.replacedUrl) || isValidOfferImageUrl(img?.url) || isValidOfferImageUrl(img?.originalUrl);
        });
        const existingTickets = Array.isArray(existingDraft.visionTickets) && existingDraft.visionTickets.length > 0
            ? existingDraft.visionTickets
            : (Array.isArray(existingDraft.images) ? existingDraft.images : []);
        const effectiveTickets = hasIncomingValidPhotos ? incomingTickets : (existingTickets.length > 0 ? existingTickets : incomingTickets);

        const mergedDraftData = {
            ...existingDraft,
            ...draftData,
            htmlContent: effectiveHtmlContent,
            images: effectiveTickets,
            visionTickets: effectiveTickets
        };

        const updatePayload = {
            offerDraft: mergedDraftData,
            ...buildNumericProductUpdateFields(draftData)
        };

        // Automatyczne uzdrowienie EAN ze spacją w bazie (np. "8032680390036 "), o ile brak kolizji w obrębie tego klienta
        const cleanExistingEan = trimOrNull(existingProduct.ean);
        if (cleanExistingEan && cleanExistingEan !== existingProduct.ean) {
            const eanCollision = await prisma.product.findFirst({
                where: { workspaceId: existingProduct.workspaceId, ean: cleanExistingEan },
                select: { id: true }
            });
            if (!eanCollision) {
                updatePayload.ean = cleanExistingEan;
            }
        }

        // Synchronizacja głównych pól PIM (Tytuł, Opis HTML, Zdjęcia)
        if (mergedDraftData.title && typeof mergedDraftData.title === 'string' && mergedDraftData.title.trim() !== '') {
            updatePayload.name = mergedDraftData.title.trim();
        }
        if (effectiveHtmlContent && hasIncomingHtml) {
            const fullHtml = typeof effectiveHtmlContent === 'object'
                ? Object.values(effectiveHtmlContent).join("")
                : String(effectiveHtmlContent);
            updatePayload.descriptionHtml = fullHtml;
        }
        if (Array.isArray(effectiveTickets) && effectiveTickets.length > 0) {
            const imageUrls = effectiveTickets
                .map(img => typeof img === 'string' ? img : (img.replacedUrl || img.url || img.originalUrl))
                .filter(isValidOfferImageUrl);
            if (imageUrls.length > 0) {
                updatePayload.images = imageUrls;
                updatePayload.imageUrl = imageUrls[0];
            }
        }

        const cleanSku = trimOrNull(draftData.sku);
        if (cleanSku) {
            updatePayload.sku = cleanSku;
        }

        if (draftData.brandId !== undefined) {
            const cleanBrandId = trimOrNull(draftData.brandId);
            if (cleanBrandId) {
                const brandExists = await prisma.brand.findUnique({ where: { id: cleanBrandId }, select: { id: true } });
                if (brandExists) {
                    updatePayload.brandId = cleanBrandId;
                }
            } else {
                updatePayload.brandId = null;
            }
        }

        if (draftData.subiektId !== undefined) {
            updatePayload.subiektId = trimOrNull(draftData.subiektId);
        }
        if (draftData.baselinkerId !== undefined) {
            updatePayload.baselinkerId = trimOrNull(draftData.baselinkerId);
        }
        if (draftData.status !== undefined) updatePayload.status = draftData.status;
        if (draftData.videoUrl !== undefined) updatePayload.videoUrl = trimOrNull(draftData.videoUrl);

        if (draftData.allegroCategoryId !== undefined) {
            const cleanCatId = trimOrNull(draftData.allegroCategoryId);
            if (cleanCatId) {
                let categoryExists = await prisma.marketplaceCategory.findUnique({
                    where: { id: cleanCatId },
                    select: { id: true }
                });
                if (!categoryExists) {
                    try {
                        await AllegroService.fetchCategoryParameters(cleanCatId, { workspaceId: req.workspaceId || null });
                        categoryExists = await prisma.marketplaceCategory.findUnique({
                            where: { id: cleanCatId },
                            select: { id: true }
                        });
                    } catch (_) {}
                }
                if (categoryExists) {
                    updatePayload.allegroCategoryId = cleanCatId;
                }
            } else {
                updatePayload.allegroCategoryId = null;
            }
        }

        if (draftData.features !== undefined && typeof draftData.features === 'object' && !Array.isArray(draftData.features)) {
            updatePayload.features = draftData.features;
        }

        const product = await prisma.product.update({
            where: { id: existingProduct.id },
            data: updatePayload
        });
        
        EventBus.publish('PRODUCT_DATA_UPDATED', { product, source: 'OFFER_OPTIMIZER_SAVE' });
        
        res.status(200).json({ message: "Zapisano kopię roboczą oraz zaktualizowano twarde dane PIM", product });
    } catch (e) {
        if (e.code === 'P2002') {
            return res.status(409).json({ error: `Konflikt unikalnego pola (SKU, EAN, BaseLinker ID lub Subiekt ID): ${e.meta?.target || e.message}` });
        }
        if (e.code === 'P2003') {
            return res.status(400).json({ error: `Nieprawidłowe powiązanie (Marka lub Kategoria Allegro nie istnieje w słowniku): ${e.meta?.field_name || e.message}` });
        }
        console.error("[Controller.saveDraft] Błąd zapisu szkicu:", e);
        res.status(500).json({ error: e.message });
    }
};

async function resolveBaselinkerAccountContext(workspaceId, requestedAccountId = null) {
    if (!workspaceId) {
        return { id: null, label: 'Konto Domyślne BaseLinker' };
    }
    const cleanReqAcc = trimOrNull(requestedAccountId);
    const decrypted = await workspaceService.getDecryptedIntegrationAccount(prisma, {
        workspaceId,
        provider: 'BASELINKER',
        accountId: cleanReqAcc || null
    });
    if (cleanReqAcc && !decrypted) {
        const err = new Error('Wybrane konto BaseLinker nie istnieje u tego klienta.');
        err.statusCode = 404;
        throw err;
    }
    if (!decrypted) {
        return { id: '', label: 'Brak skonfigurowanego konta BaseLinker' };
    }
    return {
        id: decrypted.id,
        label: decrypted.label || 'BaseLinker'
    };
}

const validateBaselinkerExport = async (req, res) => {
    try {
        const { ean, productId, draftData, baselinkerAccountId = null, accountId = null } = req.body || {};
        const wsId = req.workspaceId || null;
        exportLogger.info(`[PIPELINE START] Uruchomiono walidację przed eksportem dla EAN: ${ean}`, { workspaceId: wsId || 'legacy' });
        
        if ((!ean && !productId) || !draftData) return res.status(400).json({ error: "Brak danych" });

        const product = await resolveProductByIdOrEan(prisma, { productId, ean, workspaceId: wsId });
        if (!product) {
            return res.status(404).json({ error: "Nie znaleziono produktu o podanym EAN." });
        }

        const blAcc = await resolveBaselinkerAccountContext(wsId, baselinkerAccountId || accountId);
        const contentProfile = req.workspace ? resolveWorkspaceContentProfile(req.workspace) : null;
        const blContext = { workspaceId: wsId, accountId: blAcc?.id || null, contentProfile };

        // Wykorzystanie nowego deterministycznego serwisu zamiast Agentów AI (LLM)
        const baselinkerExportService = require('../offer-optimizer-v2/baselinker.export.service');
        const BaseLinkerService = require('./baselinker.service');
        
        let inventoryId = product.baselinkerInventoryId;
        if (!inventoryId && product.baselinkerId) {
            inventoryId = await BaseLinkerService.resolveInventoryId(product.baselinkerId, blContext);
            if (inventoryId) {
                await prisma.product.update({ where: { id: product.id }, data: { baselinkerInventoryId: parseInt(inventoryId, 10) } });
            }
        }
        if (!inventoryId) inventoryId = "307";
        
        const { payload: generatedPayload, warnings: preflightWarnings } = await baselinkerExportService.buildPayloadWithDiagnostics(
            inventoryId,
            product.baselinkerId,
            draftData,
            product,
            blContext
        );
        
        exportLogger.info(`[NEXUS EXPORT] Wygenerowano deterministyczny payload dla EAN: ${ean}`);

        // --- HARD LOCK: Generowanie Tokenu Eksportu ---
        let exportToken;
        if (wsId) {
            exportToken = signScopedExportToken({
                workspaceId: wsId,
                userId: req.user?.id || '',
                provider: 'BASELINKER',
                integrationAccountId: blAcc?.id || '',
                targetId: String(product.id),
                ean: product.ean || ean,
                payloadObj: { ean: product.ean || ean }
            });
        } else {
            const timestamp = Date.now();
            const payloadToSign = `${ean}:${timestamp}`;
            const signature = crypto.createHmac('sha256', EXPORT_SECRET).update(payloadToSign).digest('hex');
            exportToken = Buffer.from(JSON.stringify({ ean, timestamp, signature })).toString('base64');
        }
        exportLogger.info(`[NEXUS EXPORT] Wygenerowano Export Token dla EAN: ${ean}`);

        const titleValidationExport = titleOptimizer.validateAllegroOfferTitle(draftData.title || '');
        const exportValidationErrors = [...titleValidationExport.errors];
        const exportValidationWarnings = [
            ...(Array.isArray(preflightWarnings) ? preflightWarnings : []),
            ...titleValidationExport.warnings
        ];

        const mappedResult = {
            workspace: req.workspace ? {
                id: req.workspace.id,
                name: req.workspace.name,
                slug: req.workspace.slug,
                badgeColor: req.workspace.badgeColor
            } : null,
            account: blAcc,
            validation: {
                is_valid: exportValidationErrors.length === 0,
                errors: exportValidationErrors,
                warnings: exportValidationWarnings
            },
            title: draftData.title || "",
            sections: draftData.htmlContent || {},
            parameters: generatedPayload?.text_fields?.features || {},
            agentPayload: generatedPayload,
            requiresDoubleConfirmation: true,
            exportToken: exportToken // Przekazujemy na frontend
        };

        return res.status(200).json(mappedResult);
    } catch (e) {
        exportLogger.error(`[PIPELINE START ERROR] Błąd podczas walidacji: ${e.message}`, { stack: e.stack });
        return res.status(e.statusCode || 500).json({ error: e.message });
    }
};


const exportToBaselinker = async (req, res) => {
    try {
        const { ean, draftData, exportToken, baselinkerAccountId = null, accountId = null, confirmedTwice } = req.body || {};
        const wsId = req.workspaceId || null;
        if (!ean || !draftData || !exportToken) return res.status(400).json({ error: "Brak danych lub brak tokenu eksportu! Wymagana uprzednia walidacja." });
        if (confirmedTwice === false) {
            return res.status(400).json({ error: "Eksport do BaseLinkera wymaga dwukrotnego potwierdzenia przez operatora." });
        }

        const existingBeforeExport = await resolveProductByIdOrEan(prisma, {
            productId: req.body?.productId,
            ean,
            workspaceId: wsId,
            select: { id: true, ean: true, offerDraft: true, features: true }
        });
        if (!existingBeforeExport) {
            return res.status(404).json({ error: "Nie znaleziono produktu o podanym EAN/ID w bazie PIM." });
        }

        const blAcc = await resolveBaselinkerAccountContext(wsId, baselinkerAccountId || accountId);
        const contentProfile = req.workspace ? resolveWorkspaceContentProfile(req.workspace) : null;
        const blContext = { workspaceId: wsId, accountId: blAcc?.id || null, contentProfile };

        // --- HARD LOCK: Weryfikacja Tokenu Eksportu ---
        if (wsId) {
            try {
                verifyAndConsumeScopedExportToken(exportToken, {
                    workspaceId: wsId,
                    userId: req.user?.id || '',
                    provider: 'BASELINKER',
                    integrationAccountId: blAcc?.id || '',
                    targetId: String(existingBeforeExport.id),
                    ean: existingBeforeExport.ean || ean,
                    payloadObj: { ean: existingBeforeExport.ean || ean }
                });
            } catch (tokErr) {
                return res.status(tokErr.statusCode || 403).json({ error: tokErr.message, code: tokErr.code || 'INVALID_EXPORT_TOKEN' });
            }
        } else {
            try {
                const decodedToken = JSON.parse(Buffer.from(exportToken, 'base64').toString('utf8'));
                const { ean: tokenEan, timestamp, signature } = decodedToken;
                
                if (tokenEan !== ean) {
                    return res.status(403).json({ error: "Niezgodność EAN w tokenie eksportu." });
                }
                if (Date.now() - timestamp > 5 * 60 * 1000) {
                    return res.status(403).json({ error: "Token eksportu wygasł. Zwaliduj ofertę ponownie." });
                }
                
                const expectedSignature = crypto.createHmac('sha256', EXPORT_SECRET).update(`${tokenEan}:${timestamp}`).digest('hex');
                if (signature !== expectedSignature) {
                    return res.status(403).json({ error: "Nieważny podpis tokenu eksportu." });
                }
            } catch (err) {
                return res.status(403).json({ error: "Krytyczny błąd weryfikacji tokenu eksportu." });
            }
        }
        // ----------------------------------------------

        // Faza 3 MDM: AI wygenerowało wybitny opis. Nadpisujemy nim TRZON produktu w PIM
        // i oznaczamy twardo, że Źródłem Prawdy jest Sztuczna Inteligencja
        let newTitle = draftData.title;
        
        let newDescHtml = '';
        if (draftData.htmlContent) {
            if (typeof draftData.htmlContent === 'string') {
                newDescHtml = draftData.htmlContent;
            } else if (typeof draftData.htmlContent === 'object') {
                const orderedBlSections = resolveOrderedVisibleDescriptionSections(draftData.htmlContent, contentProfile);
                newDescHtml = orderedBlSections.map(s => s.html).filter(Boolean).join('\n\n');
            }
        } else {
            const orderedBlSections = resolveOrderedVisibleDescriptionSections(draftData, contentProfile);
            newDescHtml = orderedBlSections.map(s => s.html).filter(Boolean).join('\n\n');
        }

        const aiActDisclosure = `<p>Zdjęcia aranżacyjne: tła wygenerowane cyfrowo. Wygląd produktu i opakowania jest autentyczny.</p>`;
        if (newDescHtml && !newDescHtml.includes('tła wygenerowane cyfrowo')) {
            newDescHtml += `\n\n${aiActDisclosure}`;
        }

        let preservedExistingDraft = {};
        try {
            preservedExistingDraft = typeof existingBeforeExport?.offerDraft === 'string'
                ? JSON.parse(existingBeforeExport.offerDraft)
                : (existingBeforeExport?.offerDraft || {});
        } catch (_) {}

        let existingDbFeatures = {};
        try {
            existingDbFeatures = typeof existingBeforeExport?.features === 'string'
                ? JSON.parse(existingBeforeExport.features)
                : (existingBeforeExport?.features || {});
        } catch (_) {}

        const mergedExportDraft = {
            ...preservedExistingDraft,
            ...draftData
        };

        const productUpdateData = {
            offerDraft: mergedExportDraft,
            name: newTitle, // Nadpisujemy trzon!
            descriptionHtml: newDescHtml, // Nadpisujemy trzon!
            lastContentSource: 'OFFER_OPTIMIZER_AI' // Ustawiamy pieczątkę wysokiego zaufania
        };

        if (draftData.features && typeof draftData.features === 'object' && !Array.isArray(draftData.features) && (Object.keys(draftData.features).length > 0 || draftData.featuresAuthoritative)) {
            const preservedInternalImages = {};
            for (const [k, v] of Object.entries(existingDbFeatures)) {
                const nk = String(k).toLowerCase().trim();
                if ((nk === 'zdjęcie tyłu opakowania' || nk === 'zdjecie tylu opakowania' || nk === '_backimageurl') && v) {
                    preservedInternalImages[k] = v;
                }
            }
            productUpdateData.features = {
                ...preservedInternalImages,
                ...(draftData.featuresAuthoritative ? {} : existingDbFeatures),
                ...draftData.features
            };
        }

        const product = await prisma.product.update({
            where: { id: existingBeforeExport.id },
            data: productUpdateData
        });

        const hasAgentPayload = product.offerDraft && product.offerDraft.agentPayload;
        
        const BaseLinkerService = require('./baselinker.service');
        let inventoryId = product.baselinkerInventoryId;
        if (!inventoryId && product.baselinkerId) {
            inventoryId = await BaseLinkerService.resolveInventoryId(product.baselinkerId, blContext);
            if (inventoryId) {
                await prisma.product.update({ where: { id: product.id }, data: { baselinkerInventoryId: parseInt(inventoryId, 10) } });
            }
        }
        if (!inventoryId && hasAgentPayload && product.offerDraft.agentPayload.inventory_id) {
            inventoryId = product.offerDraft.agentPayload.inventory_id;
        }
        if (!inventoryId) inventoryId = "307";
        
        if (!product.offerDraft.images || !Array.isArray(product.offerDraft.images) || product.offerDraft.images.length === 0) {
            const exportImages = [];
            if (product.imageUrl) exportImages.push(product.imageUrl);
            if (product.images && Array.isArray(product.images)) {
                exportImages.push(...product.images);
            }
            product.offerDraft.images = exportImages;
        }

        exportLogger.info(`[PIPELINE EXPORT] Użytkownik pomyślnie przeszedł autoryzację. Rozpoczynam wysyłkę do BaseLinkera dla EAN: ${ean}.`, {
            workspaceId: wsId || 'legacy',
            accountId: blAcc?.id || null
        });
        
        const response = await BaseLinkerService.exportOfferToBaselinker(
            inventoryId,
            product.baselinkerId || (hasAgentPayload && product.offerDraft.agentPayload.product_id ? product.offerDraft.agentPayload.product_id : ""),
            product.offerDraft,
            blContext
        );
        
        if (response && response.product_id) {
            const returnedId = response.product_id.toString();
            if (returnedId !== product.baselinkerId) {
                await prisma.product.update({
                    where: { id: product.id },
                    data: { baselinkerId: returnedId }
                });
            }
        }

        const baselinkerExportService = require('../offer-optimizer-v2/baselinker.export.service');
        const apiWarnings = baselinkerExportService.formatBaselinkerApiWarnings(response?.warnings);
        if (apiWarnings.length > 0) {
            exportLogger.warn(`[PIPELINE EXPORT] BaseLinker zwrócił ostrzeżenia API dla EAN ${ean}: ${apiWarnings.join(' | ')}`);
        }

        if (wsId) {
            await workspaceService.recordSecurityAudit(prisma, {
                workspaceId: wsId,
                userId: req.user?.id || null,
                action: 'EXPORT_BASELINKER',
                provider: 'BASELINKER',
                integrationAccountId: blAcc?.id || null,
                entityId: response?.product_id?.toString() || product.baselinkerId || product.id,
                details: { ean, inventoryId, warningsCount: apiWarnings.length }
            });
        }

        let msg = "Zapisano AI w PIM i poprawnie wyeksportowano zautoryzowany ładunek do BaseLinkera!";
        if (apiWarnings.length > 0) {
            msg += `\n\nOstrzeżenia z API BaseLinkera:\n- ${apiWarnings.join('\n- ')}`;
        }

        // Publikujemy zdarzenie czysto informacyjne. MDM nie będzie już samowolnie uderzał do zewnętrznego API.
        EventBus.publish('PRODUCT_CONTENT_OPTIMIZED', { ean, product, workspaceId: wsId });

        res.status(200).json({ message: msg, warnings: apiWarnings, account: blAcc, workspaceId: wsId });
    } catch (e) {
        exportLogger.error(`[PIPELINE EXPORT ERROR] Błąd podczas eksportu (kontroler): ${e.message}`, { stack: e.stack });
        res.status(e.statusCode || 500).json({ error: e.message });
    }
};

const generateLifestyle = async (req, res) => {
    try {
        const { ean, imageIndex, sourceImageUrl } = req.body;
        let { imageBase64 } = req.body;
        
        if (!imageBase64 && !sourceImageUrl) {
             return res.status(400).json({ error: "Brak zdjęcia wejściowego (wymagany imageBase64 lub sourceImageUrl)." });
        }

        const jobId = `lifestyle_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        lifestyleJobs.set(jobId, {
            status: 'PROCESSING',
            createdAt: Date.now(),
            ean,
            imageIndex
        });

        const wsId = req.workspaceId || null;
        const wsObj = req.workspace || null;

        // Zwracamy HTTP 202 natychmiast z jobId
        res.status(202).json({
            status: 'PROCESSING',
            jobId,
            message: "Zlecenie generowania zdjęcia AI rozpoczęte w tle."
        });

        // Przetwarzanie w tle
        (async () => {
            try {
                console.log(`[Lifestyle AI Async] Rozpoczęto przetwarzanie zadania ${jobId} dla EAN: ${ean}, Slot: ${imageIndex}`);
                
                const PhotoroomServiceV2 = require('../offer-optimizer-v2/photoroom.service');
                const socketService = require('../../core/socket');
                
                const onLog = (msg) => {
                    const logObj = { time: new Date().toLocaleTimeString(), agentId: `Agent 11 (Slot ${Number(imageIndex) + 1})`, message: msg, ean, imageIndex: Number(imageIndex) };
                    socketService.emitToWorkspace(wsId, 'nexus-notification', {
                        type: 'LIFESTYLE_LOG',
                        jobId,
                        imageIndex: Number(imageIndex),
                        ...logObj
                    });
                };
                
                const aiResult = await PhotoroomServiceV2.generateLifestyle(imageBase64, sourceImageUrl, ean, imageIndex, onLog, {
                    workspaceId: wsId,
                    workspaceSettings: wsObj?.settings,
                    workspaceIsDefault: wsObj?.isDefault,
                    workspaceSlug: wsObj?.slug
                });
                const newImageBase64 = aiResult.base64;
                const visualTrendReport = aiResult.visualTrendReport;
                
                if (ean) {
                    try {
                        const targetProd = await resolveProductByIdOrEan(prisma, { ean, workspaceId: wsId, select: { id: true } });
                        if (targetProd) {
                            await prisma.product.update({
                                where: { id: targetProd.id },
                                data: { aiImageCost: { increment: 5.0 } }
                            });
                        }
                    } catch (err) {
                        console.error("[Billing] Nie udalo sie zaktualizowac licznika kosztow AI dla ean:", ean, err);
                    }
                }

                lifestyleJobs.set(jobId, {
                    status: 'COMPLETED',
                    createdAt: Date.now(),
                    result: { newImageBase64, visualTrendReport }
                });
                console.log(`[Lifestyle AI Async] Zadanie ${jobId} zakończone sukcesem.`);
            } catch (e) {
                console.error(`[Lifestyle AI Async] Błąd przetwarzania zadania ${jobId}:`, e.message);
                lifestyleJobs.set(jobId, {
                    status: 'ERROR',
                    createdAt: Date.now(),
                    error: e.message || "Wewnętrzny błąd serwera przy obróbce wizualnej AI."
                });
            }
        })();

    } catch (e) {
        console.error("Błąd inicjalizacji generowania lifestyle (Visual API):", e.message);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message || "Wewnętrzny błąd serwera przy obróbce wizualnej AI." });
        }
    }
};

const checkLifestyleStatus = (req, res) => {
    try {
        const jobId = req.params.jobId;
        const job = lifestyleJobs.get(jobId);

        if (!job) {
            return res.status(404).json({ error: "Nie znaleziono zlecenia generowania zdjęcia o podanym ID." });
        }

        if (job.status === 'PROCESSING') {
            return res.status(200).json({ status: 'PROCESSING' });
        }

        if (job.status === 'ERROR') {
            return res.status(200).json({ status: 'ERROR', error: job.error });
        }

        if (job.status === 'COMPLETED') {
            const responseData = {
                status: 'COMPLETED',
                newImageBase64: job.result.newImageBase64,
                visualTrendReport: job.result.visualTrendReport
            };
            return res.status(200).json(responseData);
        }

        res.status(200).json({ status: 'PROCESSING' });
    } catch (error) {
        console.error("[OfferOptimizerController] Błąd sprawdzania statusu lifestyle:", error);
        res.status(500).json({ error: "Błąd odczytu stanu zadania generowania zdjęcia." });
    }
};

const triggerUltimatePipeline = async (req, res) => {
    try {
        const { ean, productId, hitlOverrides, forceRestart } = req.body;
        if (!ean && !productId) return res.status(400).json({ error: "Wymagany kod EAN do inicjalizacji potoku." });

        const wsId = req.workspaceId || null;

        // Oznaczamy istniejący produkt w bazie jako PROCESSING, zachowując dotychczasowe bilety zdjęć visionTickets
        const existingProduct = await resolveProductByIdOrEan(prisma, { productId, ean, workspaceId: wsId });
        const canonicalEan = trimOrNull(existingProduct?.ean) || trimOrNull(ean);
        const effWsId = existingProduct?.workspaceId || wsId || null;

        console.log(`[Controller] Rozpoczynam Asynchroniczne Wykonanie Master Agenta V2 dla EAN: ${canonicalEan} (workspace: ${effWsId || 'legacy'})`);

        if (existingProduct) {
            let existingDraft = {};
            try {
                existingDraft = typeof existingProduct.offerDraft === 'string'
                    ? JSON.parse(existingProduct.offerDraft)
                    : (existingProduct.offerDraft || {});
            } catch (e) {}

            await prisma.product.update({
                where: { id: existingProduct.id },
                data: {
                    offerDraft: {
                        ...existingDraft,
                        status: 'PROCESSING',
                        startedAt: Date.now()
                    }
                }
            });
        }

        // Zwracamy HTTP 202 natychmiast
        const reqWorkspace = req.workspace || null;
        res.status(202).json({ status: "processing", ean: canonicalEan, workspaceId: effWsId, message: "Pipeline V2 uruchomiony w tle." });

        // Procesujemy w tle (V2 Orchestrator)
        (async () => {
            try {
                const { Orchestrator } = require('../offer-optimizer-v2/orchestrator');
                const orch = new Orchestrator(canonicalEan, {
                    workspaceId: effWsId,
                    workspaceSettings: reqWorkspace?.settings,
                    workspaceIsDefault: reqWorkspace?.isDefault,
                    workspaceSlug: reqWorkspace?.slug
                });

                if (forceRestart) {
                    console.log(`[Controller] Wymuszono restart potoku dla EAN: ${canonicalEan}. Ignorowanie poprzedniego stanu.`);
                } else {
                    // Szukamy najświeższego stanu potoku (resume) w logach izolowanego na workspace klienta
                    const fs = require('fs');
                    const path = require('path');
                    const logsDir = path.join(__dirname, '../offer-optimizer-v2/logs');
                    let latestState = null;
                    let latestMtime = 0;
                    const wsTag = effWsId ? String(effWsId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12) : '';
                    const allowLegacyDefaultResume = !effWsId || Boolean(reqWorkspace?.isDefault);
                    
                    if (fs.existsSync(logsDir)) {
                        const files = fs.readdirSync(logsDir);
                        const scopedPrefix = wsTag ? `state_PL-${wsTag}-${canonicalEan}-` : null;
                        const legacyPrefix = `state_PL-${canonicalEan}-`;
                        let eanFiles = scopedPrefix ? files.filter(f => f.startsWith(scopedPrefix) && f.endsWith('.json')) : [];
                        if (eanFiles.length === 0 && allowLegacyDefaultResume) {
                            eanFiles = files.filter(f => f.startsWith(legacyPrefix) && f.endsWith('.json'));
                        }
                        for (let f of eanFiles) {
                            const fp = path.join(logsDir, f);
                            const stats = fs.statSync(fp);
                            if (stats.mtimeMs > latestMtime) {
                                latestMtime = stats.mtimeMs;
                                try {
                                    latestState = JSON.parse(fs.readFileSync(fp, 'utf8'));
                                } catch (e) {
                                    console.error(`[Controller] Nie udało się odczytać pliku stanu: ${f}`);
                                }
                            }
                        }
                    }

                    if (latestState) {
                        orch.resumeFromState(latestState);
                        // Sanacja stanu: jeśli poprzedni stan zakończył się zatrzymaniem (HALT), a użytkownik
                        // uruchamia potok na nowo bez jawnych hitlOverrides, resetujemy flagę akcji,
                        // aby potok nie utknął ponownie w martwym punkcie HALT.
                        if (orch.state.next_action === 'HALT' && (!Array.isArray(hitlOverrides) || hitlOverrides.length === 0)) {
                            console.log(`[Controller] Poprzedni stan potoku dla EAN: ${canonicalEan} zakończył się na HALT (${orch.state.hitl_alert || 'Brak opisu'}). Resetowanie next_action na RUN_EXTRACT w celu ponownego, czystego przejścia.`);
                            orch.state.next_action = 'RUN_EXTRACT';
                            orch.state.hitl_alert = null;
                            orch.state.aggregated_hitl_errors = [];
                            for (let k in orch.state.node_status) {
                                if (orch.state.node_status[k] === 'HALTED_HITL_REQUIRED' || orch.state.node_status[k] === 'ERROR') {
                                    delete orch.state.node_status[k];
                                }
                            }
                        }
                    }
                }

                // Zastosowanie opcjonalnych nadpisań HITL (z przeglądarki)
                if (Array.isArray(hitlOverrides) && hitlOverrides.length > 0) {
                    hitlOverrides.forEach(node => {
                        if (orch.state.node_status[node] === 'HALTED_HITL_REQUIRED' || orch.state.node_status[node] === 'ERROR') {
                            try {
                                orch.resolveHitl({ node, decision: 'ACCEPT_AND_CONTINUE', operator_note: 'Overridden via PIM frontend.' });
                            } catch(e) {
                                orch.state.node_status[node] = 'HITL_OVERRIDDEN';
                            }
                        } else {
                            orch.state.node_status[node] = 'HITL_OVERRIDDEN';
                        }
                    });
                }
                
                // Budujemy obiekt udający odpowiedź z BaseLinkera używając danych z bazy Prisma (PIM)
                let featuresObj = {};
                try {
                    featuresObj = typeof existingProduct?.features === 'string' ? JSON.parse(existingProduct.features) : (existingProduct?.features || {});
                } catch(e) {}
                
                // Pobranie schematu Allegro dla dynamicznego uzupełniania braków
                // Podczas ręcznej interpolacji ZAWSZE odpytujemy API Allegro o kategorię (nawet jeśli mamy już przypisaną w bazie), 
                // ponieważ użytkownik/Allegro mógł ją w międzyczasie zaktualizować dla tego EAN-u.
                let requiredSchema = [];
                let catId = await AllegroService.findCategoryByEan(canonicalEan, { workspaceId: effWsId });
                
                if (!catId && existingProduct?.name) {
                    catId = await AllegroService.findMatchingCategoryByName(existingProduct.name, { workspaceId: effWsId });
                }

                if (catId && existingProduct) {
                    // Zapisujemy nową kategorię w bazie, na wypadek gdyby uległa zmianie
                    await prisma.product.update({ where: { id: existingProduct.id }, data: { allegroCategoryId: catId } });
                    existingProduct.allegroCategoryId = catId;
                }

                if (!catId && existingProduct?.allegroCategoryId) {
                    // Fallback do starej bazy tylko jeśli API Allegro z jakiegoś powodu nie zwróciło żadnej kategorii
                    catId = existingProduct.allegroCategoryId;
                }

                if (catId) {
                    let category = await prisma.marketplaceCategory.findUnique({ where: { id: catId } });
                    if (!category || !category.parameters || (Array.isArray(category.parameters) && category.parameters.length === 0)) {
                        await AllegroService.fetchCategoryParameters(catId, { workspaceId: effWsId });
                        category = await prisma.marketplaceCategory.findUnique({ where: { id: catId } });
                    }
                    if (category && category.parameters) {
                        requiredSchema = category.parameters;
                    }
                }
                
                const frontImageUrl = existingProduct?.imageUrl || (Array.isArray(existingProduct?.images) && existingProduct.images.length > 0 ? existingProduct.images[0] : null);
                const backImageUrl = featuresObj?.['Zdjęcie tyłu opakowania'] || featuresObj?.['_backImageUrl'] || null;
                const galleryImages = Array.isArray(existingProduct?.images) ? [...existingProduct.images] : [];

                const localPimData = {
                    text_fields: {
                        name: existingProduct?.name || "PIM Name",
                        description: existingProduct?.descriptionHtml || "",
                        features: featuresObj
                    },
                    allegro_schema: requiredSchema,
                    imageUrl: frontImageUrl,
                    backImageUrl: backImageUrl,
                    images: galleryImages,
                    ean: canonicalEan
                };
                
                await orch.run(localPimData);

                const persistDraftStatusSafely = async (draftPatch) => {
                    const targetRow = existingProduct || await resolveProductByIdOrEan(prisma, { productId, ean: canonicalEan, workspaceId: effWsId, select: { id: true, offerDraft: true } });
                    if (!targetRow) return;
                    let existingRowDraft = {};
                    try {
                        const pCur = await prisma.product.findUnique({ where: { id: targetRow.id }, select: { offerDraft: true } });
                        existingRowDraft = typeof pCur?.offerDraft === 'string' ? JSON.parse(pCur.offerDraft) : (pCur?.offerDraft || {});
                    } catch (_) {}
                    await prisma.product.update({
                        where: { id: targetRow.id },
                        data: { offerDraft: { ...existingRowDraft, ...draftPatch } }
                    });
                };

                if (orch.state.next_action === 'HALT' && orch.state.hitl_alert) {
                     await persistDraftStatusSafely({ status: 'HITL_PAUSED', error: orch.state.hitl_alert });
                     console.log(`[Controller] Zatrzymano na bramce HITL: ${orch.state.hitl_alert}`);
                     
                     // Zatrzymujemy potok ale informujemy frontend o alertach, by pozwolil overrideowac
                     const haltedStatuses = ['HALTED_HITL_REQUIRED', 'CRITICAL_MISSING_INCI', 'CRITICAL_INPUT_ERROR', 'ERROR'];
                     const nonHaltingStatuses = ['OK', 'SKIPPED', 'ERROR_IGNORED', 'HITL_OVERRIDDEN', 'COMPLETED'];
                     const nodeKeysReversed = Object.keys(orch.state.node_status || {}).reverse();
                     const haltedNode = nodeKeysReversed.find(k => haltedStatuses.includes(orch.state.node_status[k]))
                         || nodeKeysReversed.find(k => !nonHaltingStatuses.includes(orch.state.node_status[k]))
                         || 'UNKNOWN';
                     socketService.emitToWorkspace(effWsId, 'nexus-notification', {
                         type: 'PIPELINE_HITL_ALERT',
                         ean: canonicalEan,
                         alert: orch.state.hitl_alert,
                         node: haltedNode,
                         candidates: orch.state.hitl_inci_candidates
                     });
                } else if (orch.state.final_offer) {
                     let freshProductForDraft = null;
                     try {
                         freshProductForDraft = await resolveProductByIdOrEan(prisma, { productId: existingProduct?.id || productId, ean: canonicalEan, workspaceId: effWsId });
                     } catch (_) {}
                     let currentOfferDraft = {};
                     try {
                         const rawDraftSource = freshProductForDraft?.offerDraft || existingProduct?.offerDraft;
                         currentOfferDraft = typeof rawDraftSource === 'string' ? JSON.parse(rawDraftSource) : (rawDraftSource || {});
                     } catch (e) {}
                     
                     const editorHtmlObj = {
                         sekcja1: orch.state.a10_result?.section_1_html || "",
                         sekcja2: orch.state.a10_result?.section_2_html || "",
                         sekcja3: stripRawInciFooterFromSection3(orch.state.a10_result?.section_3_html || ""),
                         sekcja4: orch.state.a10_result?.section_4_html || "",
                         sekcja5: orch.state.a10_result?.section_5_html || "",
                         sekcja6: orch.state.a10_result?.section_6_html || "",
                         sekcjaTips: orch.state.a10_result?.section_tips_html || orch.state.final_offer?.section_tips_html || "",
                         sekcja7: orch.state.a10_result?.section_7_html || orch.state.final_offer?.extra_field_4245 || orch.workspaceContentProfile?.defaultSekcja7 || ""
                     };

                     let freshProduct = freshProductForDraft;

                     let updatedFeatures = {};
                     try {
                         const rawDbFeatures = freshProduct?.features || existingProduct?.features;
                         updatedFeatures = typeof rawDbFeatures === 'string' ? JSON.parse(rawDbFeatures) : (rawDbFeatures || {});
                     } catch(e) {}
                     
                     // KRYTYCZNA TARCZA TRWAŁOŚCI: Ochrona i wstrzyknięcie cech fizycznych odczytanych przez Agenta 0
                     if (orch.state.vision_extracted_features && typeof orch.state.vision_extracted_features === 'object') {
                         for (const [k, v] of Object.entries(orch.state.vision_extracted_features)) {
                             if (v && (!updatedFeatures[k] || String(updatedFeatures[k]).trim() === '')) {
                                 updatedFeatures[k] = v;
                             }
                         }
                     }
                     
                     if (orch.state.extracted_data) {
                         if (orch.state.extracted_data.features && typeof orch.state.extracted_data.features === 'object') {
                             for (const [k, v] of Object.entries(orch.state.extracted_data.features)) {
                                 if (v && (!updatedFeatures[k] || String(updatedFeatures[k]).trim() === '')) {
                                     updatedFeatures[k] = v;
                                 }
                             }
                         }

                         const orchInci = orch.state.extracted_data.inci?.value;
                         const currentPimInci = updatedFeatures['Skład/INCI'] || updatedFeatures['INCI'] || updatedFeatures['Skład'];
                         
                         // Jeśli potok posiada zweryfikowany, poprawny skład INCI
                         if (orchInci && baselinkerExtract.isValidInciValue(orchInci)) {
                             updatedFeatures['Skład/INCI'] = orchInci;
                             delete updatedFeatures['INCI'];
                             delete updatedFeatures['Skład'];
                             delete updatedFeatures['SKŁAD'];
                             delete updatedFeatures['skład'];
                         } else if (currentPimInci && baselinkerExtract.isValidInciValue(currentPimInci)) {
                             // Jeśli w PIM był już poprawny skład, nie pozwól na jego nadpisanie ani degradację
                             updatedFeatures['Skład/INCI'] = currentPimInci;
                             delete updatedFeatures['INCI'];
                             delete updatedFeatures['Skład'];
                             delete updatedFeatures['SKŁAD'];
                             delete updatedFeatures['skład'];
                         }
                         
                         // Jeśli w starych parametrach 'Skład' była np. postać "Koncentrat", przenieś do 'Postać' jeśli puste
                         const legacySkladVal = updatedFeatures['Skład'] || (existingProduct?.features && existingProduct.features['Skład']);
                         if (legacySkladVal && !baselinkerExtract.isValidInciValue(legacySkladVal) && !updatedFeatures['Postać']) {
                             updatedFeatures['Postać'] = legacySkladVal;
                         }
                         if (orch.state.extracted_data.country_of_origin?.value && (!updatedFeatures['Kraj pochodzenia'] || String(updatedFeatures['Kraj pochodzenia']).trim() === '')) {
                             updatedFeatures['Kraj pochodzenia'] = orch.state.extracted_data.country_of_origin.value;
                         }
                         if (orch.state.extracted_data.brand?.value && (!updatedFeatures['Marka'] || String(updatedFeatures['Marka']).trim() === '')) {
                             updatedFeatures['Marka'] = orch.state.extracted_data.brand.value;
                         }
                         if (orch.state.extracted_data.capacity?.value && (!updatedFeatures['Pojemność'] || String(updatedFeatures['Pojemność']).trim() === '')) {
                             updatedFeatures['Pojemność'] = orch.state.extracted_data.capacity.value;
                         }
                         if (orch.state.extracted_data.warnings?.value && (!updatedFeatures['Ostrzeżenia'] || String(updatedFeatures['Ostrzeżenia']).trim() === '')) {
                             updatedFeatures['Ostrzeżenia'] = orch.state.extracted_data.warnings.value;
                         }
                         if (orch.state.extracted_data.usage?.value && (!updatedFeatures['Sposób użycia'] || String(updatedFeatures['Sposób użycia']).trim() === '')) {
                             updatedFeatures['Sposób użycia'] = orch.state.extracted_data.usage.value;
                         }
                         if (orch.state.extracted_data.eu_responsible_person?.data) {
                             const eu = orch.state.extracted_data.eu_responsible_person.data;
                             const euText = typeof eu === 'object' ? `${eu.name || ''} ${eu.address_eu || ''} ${eu.contact || ''}`.trim() : eu;
                             if (euText) updatedFeatures['INFORMACJE O BEZPIECZEŃSTWIE'] = euText;
                         }
                     }

                     if (orch.state.auto_mapped_allegro_params && typeof orch.state.auto_mapped_allegro_params === 'object') {
                         for (const [ak, av] of Object.entries(orch.state.auto_mapped_allegro_params)) {
                             if (av !== undefined && av !== null && String(av).trim() !== '' && (!updatedFeatures[ak] || String(updatedFeatures[ak]).trim() === '')) {
                                 updatedFeatures[ak] = av;
                             }
                         }
                     }

                     const targetIdToUpdate = freshProduct?.id || existingProduct?.id;
                     if (targetIdToUpdate) {
                         await prisma.product.update({
                             where: { id: targetIdToUpdate },
                             data: { 
                                 features: updatedFeatures,
                                 offerDraft: { 
                                     ...currentOfferDraft,
                                     status: 'COMPLETE', 
                                     title: orch.state.final_offer.title || existingProduct?.name || "Nowy Tytuł", 
                                     htmlContent: editorHtmlObj
                                 } 
                             }
                         });
                     }
                     console.log(`[Controller] Sukces potoku V2 dla EAN: ${canonicalEan}`);
                     // Powiadomienie socketowe dla frontendu (izolowane na workspace klienta)
                     socketService.emitToWorkspace(effWsId, 'nexus-notification', {
                         type: 'PIPELINE_COMPLETE',
                         ean: canonicalEan,
                         result: {
                             editorHtml: editorHtmlObj,
                             title: orch.state.final_offer.title || existingProduct?.name,
                             features: updatedFeatures,
                             aeoContent: existingProduct?.aeoContent || '',
                             visionTickets: (currentOfferDraft.visionTickets?.length ? currentOfferDraft.visionTickets : null) || (currentOfferDraft.images?.length ? currentOfferDraft.images : null) || (existingProduct?.images?.map(img => typeof img === 'string' ? { originalUrl: img, isCompliant: true, alerts: [] } : img) || [])
                         }
                     });
                } else {
                     const errorMsg = orch.state.hitl_alert || 'Orchestrator V2 zakończył pracę, ale nie wygenerował wyniku A10';
                     await persistDraftStatusSafely({ status: 'ERROR', error: errorMsg });
                     socketService.emitToWorkspace(effWsId, 'nexus-notification', {
                         type: 'PIPELINE_ERROR',
                         ean: canonicalEan,
                         error: errorMsg
                     });
                }
            } catch (err) {
                console.error(`[Controller] Błąd asynchronicznego potoku V2 dla: ${canonicalEan}`, err);
                try {
                    const targetRow = existingProduct || await resolveProductByIdOrEan(prisma, { productId, ean: canonicalEan, workspaceId: effWsId, select: { id: true, offerDraft: true } });
                    if (targetRow) {
                        const existingCatchDraft = typeof targetRow.offerDraft === 'string' ? JSON.parse(targetRow.offerDraft) : (targetRow.offerDraft || {});
                        await prisma.product.update({
                            where: { id: targetRow.id },
                            data: { offerDraft: { ...existingCatchDraft, status: 'ERROR', error: err.message || 'Krytyczny błąd Orchestratora V2' } }
                        });
                    }
                } catch (_) {}
                socketService.emitToWorkspace(effWsId, 'nexus-notification', {
                    type: 'PIPELINE_ERROR',
                    ean: canonicalEan,
                    error: err.message || 'Krytyczny błąd Orchestratora V2'
                });
            }
        })();

    } catch (e) {
        console.error(`[Controller] Błąd inicjalizacji EAN Pipeline V2 dla: ${req.body?.ean}`, e.message);
        if (!res.headersSent) {
            return res.status(500).json({ error: e.message || "Błąd wewnętrzny serwera." });
        }
    }
};

const checkPipelineStatus = async (req, res) => {
    try {
        const { ean } = req.params;
        const product = await resolveProductByIdOrEan(prisma, {
            ean,
            workspaceId: req.workspaceId || null,
            include: { brand: true, allegroCategory: true }
        });
        
        // Jeśli produkt nie został jeszcze utworzony w bazie lub jest przetwarzany
        if (!product || !product.offerDraft || product.offerDraft.status === 'PROCESSING') {
            return res.status(200).json({ status: 'PROCESSING' });
        }

        // Jeśli wystąpił błąd podczas wykonywania w tle
        if (product.offerDraft.status === 'ERROR') {
            return res.status(200).json({ status: 'ERROR', error: product.offerDraft.error || 'Błąd potoku AI' });
        }

        if (product.offerDraft.status === 'HITL_PAUSED') {
            return res.status(200).json({ status: 'HITL_PAUSED', error: product.offerDraft.error || 'Oczekiwanie na decyzję (HITL)' });
        }

        // Wykrycie uszkodzonego/błędnego szkicu (np. stary "Błąd systemu GEO")
        const hasGeoError = product.offerDraft.htmlContent && 
            typeof product.offerDraft.htmlContent === 'object' && 
            product.offerDraft.htmlContent.sekcja1 && 
            product.offerDraft.htmlContent.sekcja1.includes('Błąd systemu GEO');

        if (hasGeoError) {
            return res.status(200).json({ status: 'ERROR', error: 'Poprzednia generacja zawierała błąd GEO. Uruchom ponowną generację dla tego EAN.' });
        }

        // Weryfikacja czy opisy HTML zostały rzeczywiście wygenerowane przez Agentów AI
        const hasValidHtml = product.offerDraft.htmlContent && 
            typeof product.offerDraft.htmlContent === 'object' && 
            product.offerDraft.htmlContent.sekcja1 && 
            product.offerDraft.htmlContent.sekcja1.trim() !== '';

        if (product.offerDraft.title && hasValidHtml) {
            const result = {
                ...product,
                finalDraft: product.offerDraft
            };
            return res.status(200).json({ status: 'COMPLETE', result });
        }

        // Dopóki opisy nie są gotowe, informujemy frontend o trwającym procesie
        return res.status(200).json({ status: 'PROCESSING' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
};

const ingestKnowledgeDocument = async (req, res) => {
    try {
        const { text, title } = req.body;
        if (!text || !title) {
            return res.status(400).json({ error: 'Brakuje tekstu lub tytułu dokumentu.' });
        }
        const result = await knowledgeRagService.ingestDocument(text, title);
        return res.status(200).json(result);
    } catch (error) {
        console.error('[Knowledge RAG] Błąd wchłaniania dokumentu:', error);
        return res.status(500).json({ error: error.message });
    }
};

const listKnowledgeDocuments = async (req, res) => {
    try {
        const docs = await knowledgeRagService.getGroupedDocuments();
        return res.status(200).json({ documents: docs });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

const deleteKnowledgeDocument = async (req, res) => {
    try {
        const { title } = req.params;
        if (!title) {
            return res.status(400).json({ error: "Missing document title" });
        }
        
        const count = await knowledgeRagService.deleteDocumentByTitle(title);
        if (count === 0) {
            return res.status(404).json({ error: "Document not found" });
        }
        
        return res.status(200).json({ message: `Successfully deleted document: ${title}`, chunksDeleted: count });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};

const generateItalianFrame = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Brak pliku obrazu." });
        }

        const borderThickness = parseInt(req.body.borderThickness, 10) || 6;
        const imageBuffer = req.file.buffer;

        // Odczyt właściwości obrazka
        const metadata = await sharp(imageBuffer).metadata();
        const { width, height } = metadata;
        
        const thirdW = Math.floor(width / 3);

        // Generujemy SVG reprezentujące ramkę
        const svgBorder = `
            <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
                <!-- ZIELONA (Lewa strona i lewa 1/3 góry/dołu) -->
                <rect x="0" y="0" width="${thirdW}" height="${borderThickness}" fill="rgb(0, 146, 70)" />
                <rect x="0" y="${height - borderThickness}" width="${thirdW}" height="${borderThickness}" fill="rgb(0, 146, 70)" />
                <rect x="0" y="0" width="${borderThickness}" height="${height}" fill="rgb(0, 146, 70)" />

                <!-- BIAŁA (Środek - 1/3 góry i dołu) -->
                <rect x="${thirdW}" y="0" width="${thirdW}" height="${borderThickness}" fill="rgb(255, 255, 255)" />
                <rect x="${thirdW}" y="${height - borderThickness}" width="${thirdW}" height="${borderThickness}" fill="rgb(255, 255, 255)" />

                <!-- CZERWONA (Prawa strona i prawa 1/3 góry/dołu) -->
                <rect x="${thirdW * 2}" y="0" width="${width - (thirdW * 2)}" height="${borderThickness}" fill="rgb(206, 43, 55)" />
                <rect x="${thirdW * 2}" y="${height - borderThickness}" width="${width - (thirdW * 2)}" height="${borderThickness}" fill="rgb(206, 43, 55)" />
                <rect x="${width - borderThickness}" y="0" width="${borderThickness}" height="${height}" fill="rgb(206, 43, 55)" />
            </svg>
        `;

        // Kompozycja
        const processedBuffer = await sharp(imageBuffer)
            .composite([{ input: Buffer.from(svgBorder), blend: 'over' }])
            // Zachowanie oryginalnego formatu
            .jpeg({ quality: 95, force: false }) 
            .png({ force: false })
            .toBuffer();

        res.set('Content-Type', metadata.format === 'png' ? 'image/png' : 'image/jpeg');
        // Set filename header
        const originalName = req.file.originalname || 'image.jpg';
        res.set('Content-Disposition', `attachment; filename="framed_${originalName}"`);
        res.send(processedBuffer);

    } catch (error) {
        console.error("[ItalianFrame] Błąd generowania:", error);
        res.status(500).json({ error: "Błąd serwera podczas nakładania włoskiej ramki.", details: error.message });
    }
};

const extractBackLabel = async (req, res) => {
    try {
        const { ean, backImageUrl, productId } = req.body || {};
        if (!backImageUrl || typeof backImageUrl !== 'string' || !backImageUrl.trim()) {
            return res.status(400).json({ error: 'Wymagane zdjęcie tyłu opakowania (backImageUrl).' });
        }

        const visionExtractorService = require('../offer-optimizer-v2/vision-extractor.service');
        const baselinkerExtract = require('../offer-optimizer-v2/baselinker.extract');
        const socketService = require('../../core/socket');

        const onLog = (msg) => {
            console.log(msg);
            if (ean) {
                socketService.emitToWorkspace(req.workspaceId || null, 'nexus-notification', {
                    type: 'PIPELINE_LOG',
                    ean,
                    agentId: 'Vision Back-Pack OCR',
                    message: msg
                });
            }
        };

        const existingProduct = await resolveProductByIdOrEan(prisma, {
            productId,
            ean,
            workspaceId: req.workspaceId || null
        });

        let existingFeaturesObj = {};
        if (existingProduct) {
            try {
                const rawFeatures = existingProduct.features;
                existingFeaturesObj = typeof rawFeatures === 'string' ? JSON.parse(rawFeatures) : { ...(rawFeatures || {}) };
            } catch (_) {
                existingFeaturesObj = {};
            }
        }

        const frontContext = {
            ...existingFeaturesObj,
            ...(existingProduct?.name && !existingFeaturesObj['Nazwa produktu (Etykieta Front)'] ? { 'Nazwa produktu (Etykieta Front)': existingFeaturesObj['Nazwa produktu (Etykieta Front)'] || undefined } : {})
        };
        if (!frontContext['Pojemność / Waga'] && existingFeaturesObj['Pojemność']) {
            const { normalizeCapacityValue } = require('../offer-optimizer-v2/services/deterministic-pipeline.engine');
            frontContext['Pojemność / Waga'] = normalizeCapacityValue(existingFeaturesObj['Pojemność'], existingProduct?.name || '', existingFeaturesObj);
        }

        let frontImage = null;
        const frontImgCandidate = existingProduct?.imageUrl || (Array.isArray(existingProduct?.images) ? existingProduct.images[0] : null);
        if (frontImgCandidate && typeof frontImgCandidate === 'string' && frontImgCandidate.trim() !== backImageUrl.trim()) {
            try {
                const frontBuf = await visionExtractorService.fetchImageBuffer(frontImgCandidate.trim(), 8000, () => {});
                if (frontBuf?.buffer) {
                    frontImage = {
                        mimeType: frontBuf.mimeType || 'image/jpeg',
                        base64: frontBuf.buffer.toString('base64')
                    };
                }
            } catch (_) {
                // Opcjonalny kontekst zdjęcia frontowego — brak sieci nie przerywa skanu tyłu
            }
        }

        const extractionResult = await visionExtractorService.extractInciFromBackPack(
            [backImageUrl.trim()],
            ean || null,
            onLog,
            null,
            {
                frontContext,
                frontImage,
                productName: existingProduct?.name || ''
            }
        );

        let updatedFeatures = { ...existingFeaturesObj };
        let autoMappedParams = {};

        if (existingProduct) {
            updatedFeatures['Zdjęcie tyłu opakowania'] = backImageUrl.trim();
            if (extractionResult.inci && baselinkerExtract.isValidInciValue(extractionResult.inci)) {
                updatedFeatures['Skład/INCI'] = extractionResult.inci;
                delete updatedFeatures['INCI'];
                delete updatedFeatures['Skład'];
            }
            if (extractionResult.warnings) {
                updatedFeatures['Ostrzeżenia'] = extractionResult.warnings;
                updatedFeatures['Ostrzeżenia (Etykieta)'] = extractionResult.warnings;
            }
            if (extractionResult.usageInstructions) {
                updatedFeatures['Sposób użycia'] = extractionResult.usageInstructions;
                updatedFeatures['Sposób użycia (Etykieta)'] = extractionResult.usageInstructions;
            }
            if (extractionResult.pimFeatures) {
                const copyBackKeys = [
                    'Przeznaczenie (Etykieta)',
                    'Wyróżniki / Certyfikaty (Etykieta)',
                    'Producent',
                    'Kraj pochodzenia (Etykieta)',
                    'Opakowanie (Etykieta)',
                    'Liczba sztuk (Etykieta)',
                    'pH (Etykieta)',
                    'Piktogramy CLP (Etykieta)',
                    'Nazwa produktu (Kontretykieta)',
                    'Pojemność nakrętki (Etykieta)',
                    'Postać (Etykieta)',
                    'Sposób użycia (Etykieta)',
                    'Ostrzeżenia (Etykieta)'
                ];
                for (const k of copyBackKeys) {
                    if (extractionResult.pimFeatures[k]) {
                        updatedFeatures[k] = extractionResult.pimFeatures[k];
                    }
                }
                const { resolveLabelPhysicalForm } = require('../offer-optimizer-v2/services/label-truth.helpers');
                const resolvedForm = resolveLabelPhysicalForm({
                    visionFeatures: extractionResult.pimFeatures,
                    features: updatedFeatures,
                    officialLabelName: updatedFeatures['Nazwa produktu (Etykieta Front)'] || extractionResult.pimFeatures['Nazwa produktu (Kontretykieta)'] || ''
                });
                if (resolvedForm.isVerifiedFromLabel && resolvedForm.canonicalForm) {
                    updatedFeatures['Postać'] = resolvedForm.canonicalForm;
                }
            }

            if (existingProduct.allegroCategoryId) {
                try {
                    const cat = await prisma.marketplaceCategory.findUnique({
                        where: { id: existingProduct.allegroCategoryId }
                    });
                    if (cat && Array.isArray(cat.parameters) && cat.parameters.length > 0) {
                        const { mapPackagingFeaturesToAllegroSchema } = require('../offer-optimizer-v2/services/allegro-param-automapper.service');
                        const autoRes = mapPackagingFeaturesToAllegroSchema({
                            allegroSchema: cat.parameters,
                            currentFeatures: updatedFeatures,
                            visionFront: existingFeaturesObj,
                            visionBack: extractionResult.pimFeatures || {},
                            product: existingProduct
                        });
                        updatedFeatures = autoRes.updatedFeatures;
                        autoMappedParams = autoRes.mappedParams || {};
                    }
                } catch (mapErr) {
                    console.warn('[extractBackLabel] Ostrzeżenie auto-mapowania Allegro:', mapErr.message);
                }
            }

            await prisma.product.update({
                where: { id: existingProduct.id },
                data: { features: updatedFeatures }
            }).catch((dbErr) => console.warn('[extractBackLabel] Ostrzeżenie zapisu do DB:', dbErr.message));
        }

        return res.status(200).json({
            found: Boolean(extractionResult.found),
            inci: extractionResult.inci || null,
            warnings: extractionResult.warnings || null,
            usageInstructions: extractionResult.usageInstructions || null,
            autoMappedParams,
            pimFeatures: {
                ...(extractionResult.pimFeatures || {}),
                'Zdjęcie tyłu opakowania': backImageUrl.trim()
            }
        });
    } catch (error) {
        console.error('[extractBackLabel] Błąd analizy zdjęcia tyłu opakowania:', error);
        return res.status(500).json({ error: error.message || 'Błąd analizy zdjęcia tyłu opakowania przez Vision AI.' });
    }
};

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

function signAllegroExportToken({ ean, offerId, accountId = '', payloadObj }) {
    const timestamp = Date.now();
    const acc = accountId ? String(accountId).trim() : '';
    const patchHash = computeCanonicalHash(payloadObj);
    const sigPayload = `${ean}:${acc}:${offerId}:${patchHash}:${timestamp}`;
    const signature = crypto.createHmac('sha256', EXPORT_SECRET).update(sigPayload).digest('hex');
    return Buffer.from(JSON.stringify({ ean, accountId: acc, offerId: String(offerId), patchHash, timestamp, signature })).toString('base64');
}

function verifyAllegroExportToken(token, { ean, offerId, accountId = '', payloadObj }) {
    const decoded = JSON.parse(Buffer.from(String(token), 'base64').toString('utf8'));
    const expectedAcc = accountId ? String(accountId).trim() : '';
    if (
        String(decoded.ean) !== String(ean) ||
        String(decoded.offerId) !== String(offerId) ||
        String(decoded.accountId || '') !== expectedAcc
    ) {
        throw new Error('Niezgodność produktu, konta lub oferty w tokenie eksportu Allegro.');
    }
    if (Date.now() - Number(decoded.timestamp) > 5 * 60 * 1000) {
        throw new Error('Token eksportu Allegro wygasł. Odśwież podgląd (Pre-flight).');
    }
    const expectedHash = computeCanonicalHash(payloadObj);
    if (decoded.patchHash !== expectedHash) {
        throw new Error('Zmieniono dane od ostatniego podglądu Pre-flight. Wykonaj ponowną weryfikację.');
    }
    const expectedSig = crypto.createHmac('sha256', EXPORT_SECRET)
        .update(`${decoded.ean}:${decoded.accountId || ''}:${decoded.offerId}:${decoded.patchHash}:${decoded.timestamp}`)
        .digest('hex');
    if (decoded.signature !== expectedSig) {
        throw new Error('Nieważny podpis kryptograficzny tokenu eksportu Allegro.');
    }
}

async function resolveAllegroOfferContext({ product, existingDraft, requestedOfferId, requestedAccountId, categoryId, workspaceId = null }) {
    let effAccountId = requestedAccountId && String(requestedAccountId).trim() !== '' && String(requestedAccountId).trim().toUpperCase() !== 'ALL'
        ? String(requestedAccountId).trim()
        : (existingDraft?.allegroAccountId ? String(existingDraft.allegroAccountId).trim() : null);

    let authCheck;
    if (requestedAccountId && String(requestedAccountId).trim().toUpperCase() === 'ALL') {
        authCheck = await AllegroService.ensureSellerWriteToken(null, prisma, workspaceId);
        effAccountId = authCheck.accountId;
    } else {
        authCheck = await AllegroService.ensureSellerWriteToken(effAccountId, prisma, workspaceId);
        effAccountId = authCheck.accountId;
    }

    let targetOfferId = requestedOfferId ? String(requestedOfferId).trim() : (existingDraft?.allegroOfferId ? String(existingDraft.allegroOfferId).trim() : '');
    let matchedCandidates = [];

    if (!targetOfferId) {
        const searchAcc = (requestedAccountId && String(requestedAccountId).trim().toUpperCase() === 'ALL') ? 'ALL' : effAccountId;
        matchedCandidates = await AllegroService.findSellerOffersForProduct({
            ean: product.ean,
            sku: product.sku,
            name: product.name,
            baselinkerId: product.baselinkerId,
            categoryId: categoryId || product.allegroCategoryId || '',
            accountId: searchAcc,
            workspaceId
        });
        if (matchedCandidates.length > 0) {
            targetOfferId = matchedCandidates[0].id;
            if (matchedCandidates[0].accountId) {
                effAccountId = matchedCandidates[0].accountId;
            }
        }
    }

    return {
        targetOfferId,
        effAccountId,
        accountLabel: authCheck.accountLabel,
        integrationAccountId: authCheck.integrationAccountId || null,
        tokenClaims: authCheck.claims,
        matchedCandidates
    };
}

const searchAllegroOffers = async (req, res) => {
    try {
        const { ean = '', sku = '', name = '', baselinkerId = '', categoryId = '', accountId = '' } = req.query || {};
        const wsId = req.workspaceId || null;
        const reqAcc = String(accountId || '').trim();
        let tokenClaims = null;
        if (!reqAcc || reqAcc.toUpperCase() !== 'ALL') {
            const auth = await AllegroService.ensureSellerWriteToken(reqAcc || null, prisma, wsId);
            tokenClaims = auth.claims;
        }
        const offers = await AllegroService.findSellerOffersForProduct({
            ean,
            sku,
            name,
            baselinkerId,
            categoryId,
            accountId: reqAcc || null,
            workspaceId: wsId
        });
        return res.status(200).json({ offers, tokenClaims, workspaceId: wsId });
    } catch (error) {
        const status = error.statusCode || error.response?.status || 500;
        return res.status(status).json({
            error: error.message || 'Błąd wyszukiwania ofert Allegro.',
            code: error.code || null,
            missingScopes: error.missingScopes || null
        });
    }
};

const validateAllegroParamsExport = async (req, res) => {
    try {
        const {
            ean,
            productId,
            offerId,
            accountId,
            categoryId,
            features,
            htmlContent,
            title = null,
            includeTitle = true,
            includeSafetyInfo = true,
            customSafetyText = null,
            includeComposition = true,
            forceCompositionRetry = false,
            selectedParamIds = null,
            forceRefreshCategory = false
        } = req.body || {};

        if (!ean && !productId) {
            return res.status(400).json({ error: 'Wymagany kod EAN lub ID produktu.' });
        }

        const wsId = req.workspaceId || null;
        const product = await resolveProductByIdOrEan(prisma, {
            productId,
            ean,
            workspaceId: wsId,
            include: { brand: true }
        });
        if (!product) {
            return res.status(404).json({ error: 'Nie znaleziono produktu w bazie PIM wybranego klienta.' });
        }

        const existingDraft = parseOfferDraftJson(product.offerDraft);

        let ctx;
        try {
            ctx = await resolveAllegroOfferContext({
                product,
                existingDraft,
                requestedOfferId: offerId,
                requestedAccountId: accountId,
                categoryId,
                workspaceId: wsId
            });
        } catch (authErr) {
            return res.status(authErr.statusCode || 403).json({
                error: authErr.message,
                code: authErr.code || 'ALLEGRO_AUTH_ERROR',
                missingScopes: authErr.missingScopes || null
            });
        }

        if (!ctx.targetOfferId) {
            return res.status(404).json({
                error: 'Nie odnaleziono automatycznie oferty na koncie Allegro dla tego SKU/EAN. Wpisz numer oferty Allegro (offerId) ręcznie przed weryfikacją.',
                candidates: []
            });
        }

        const { offer, catalogProduct, accountId: resolvedAccountId, accountLabel, tokenClaims } = await AllegroService.getOfferAndCatalogForParams(ctx.targetOfferId, {
            accountId: ctx.effAccountId,
            workspaceId: wsId
        });
        if (resolvedAccountId) {
            ctx.effAccountId = resolvedAccountId;
        }
        const offerCatId = offer?.category?.id ? String(offer.category.id) : null;
        const requestedCatId = categoryId ? String(categoryId).trim() : (product.allegroCategoryId ? String(product.allegroCategoryId).trim() : null);
        const effectiveCatId = offerCatId || requestedCatId;

        if (!effectiveCatId) {
            return res.status(400).json({ error: 'Nie udało się określić ID kategorii Allegro dla wybranej oferty.' });
        }

        const catSchema = await AllegroService.getCategoryParametersFull(effectiveCatId, {
            forceRefresh: Boolean(forceRefreshCategory),
            workspaceId: wsId,
            accountId: ctx.effAccountId
        });

        let dbFeatures = {};
        try {
            dbFeatures = typeof product.features === 'string' ? JSON.parse(product.features) : (product.features || {});
        } catch (_) {
            dbFeatures = {};
        }
        const effectiveFeatures = {
            ...dbFeatures,
            ...(features && typeof features === 'object' ? features : {})
        };

        // 1. Ekstrakcja i czyszczenie ostrzeżeń z opisu (bez HTML i emotikonów) pod GPSR safetyInformation
        const extractedSafety = extractSafetyInformationText({
            htmlContent: htmlContent || existingDraft?.htmlContent || null,
            descriptionHtml: product.descriptionHtml || '',
            features: effectiveFeatures
        });

        const finalSafetyText = (typeof customSafetyText === 'string' && customSafetyText.trim() !== '')
            ? stripHtmlAndEmoticons(customSafetyText)
            : extractedSafety.text;

        const safetyInfoPayload = {
            apply: Boolean(includeSafetyInfo && finalSafetyText && finalSafetyText.trim().length > 0),
            description: finalSafetyText
        };

        // 2. Ekstrakcja i walidacja INCI przez endpoint POST /ingredients/parse + weryfikacja wsparcia kategorii
        const rawInci = extractCleanInciForAllegro({
            features: effectiveFeatures,
            ingredientsInci: existingDraft?.ingredients_inci || ''
        });

        const catCompSupport = await AllegroService.getCategoryCompositionSupport(effectiveCatId);
        const categorySupportsComp = catCompSupport.supported !== false;

        let compositionDiagnostics = {
            rawInci,
            supported: false,
            parserValid: false,
            categorySupported: categorySupportsComp,
            categoryUnsupportedReason: catCompSupport.reason || null,
            components: null,
            warnings: [],
            errors: []
        };

        if (rawInci) {
            try {
                const parsedRes = await AllegroService.parseIngredientsWithAllegro({
                    categoryId: effectiveCatId,
                    productId: product.ean,
                    productName: offer?.name || product.name,
                    rawInci,
                    accountId: ctx.effAccountId,
                    workspaceId: wsId
                });
                const parserValid = Boolean(parsedRes.supported);
                compositionDiagnostics = {
                    rawInci,
                    ...parsedRes,
                    parserValid,
                    categorySupported: categorySupportsComp,
                    categoryUnsupportedReason: catCompSupport.reason || null,
                    supported: Boolean(parserValid && (categorySupportsComp || forceCompositionRetry))
                };
            } catch (parseErr) {
                compositionDiagnostics.errors = [parseErr.message || 'Błąd parsera składników Allegro (/ingredients/parse).'];
            }
        }

        const compositionPayload = {
            apply: Boolean(includeComposition && compositionDiagnostics.supported && Array.isArray(compositionDiagnostics.components) && compositionDiagnostics.components.length > 0),
            components: compositionDiagnostics.components
        };

        const incomingTitle = (typeof title === 'string' && title.trim() !== '')
            ? title.trim()
            : (existingDraft?.title ? String(existingDraft.title).trim() : '');

        const patchResult = buildAllegroParameterPatchPayload({
            product,
            features: effectiveFeatures,
            categoryParameters: catSchema.parameters,
            existingOffer: offer,
            catalogProduct,
            selectedParamIds,
            safetyInfoPayload,
            compositionPayload,
            titlePayload: {
                apply: Boolean(includeTitle && incomingTitle),
                title: incomingTitle,
                brand: product?.brand?.name || effectiveFeatures?.Marka || ''
            }
        });

        if (compositionDiagnostics.rawInci && compositionDiagnostics.parserValid && !categorySupportsComp && !forceCompositionRetry) {
            patchResult.warnings.unshift(
                `Uwaga: Kategoria Allegro #${effectiveCatId} (${catSchema.name}) nie obsługuje jeszcze pola składu produktu (productSet[0].composition). Skład INCI został automatycznie pominięty, aby nie zablokować wysyłki pozostałych parametrów i GPSR.`
            );
        }

        if (offerCatId && requestedCatId && offerCatId !== requestedCatId) {
            patchResult.warnings.unshift(
                `Uwaga: Kategoria w ofercie Allegro (${offerCatId} - ${catSchema.name}) różni się od kategorii w karcie PIM (${requestedCatId}). Walidację wykonano względem kategorii aktywnej oferty.`
            );
        }

        const exportToken = wsId
            ? signScopedExportToken({
                workspaceId: wsId,
                userId: req.user?.id || '',
                provider: 'ALLEGRO_PARAMS',
                integrationAccountId: ctx.effAccountId || '',
                targetId: String(ctx.targetOfferId),
                ean: product.ean,
                payloadObj: patchResult.patchBody
            })
            : signAllegroExportToken({
                ean: product.ean,
                offerId: ctx.targetOfferId,
                accountId: ctx.effAccountId,
                payloadObj: patchResult.patchBody
            });

        return res.status(200).json({
            workspace: req.workspace ? {
                id: req.workspace.id,
                name: req.workspace.name,
                slug: req.workspace.slug,
                badgeColor: req.workspace.badgeColor
            } : null,
            offer: {
                id: String(offer.id),
                name: offer.name,
                status: offer.publication?.status || 'UNKNOWN',
                categoryId: effectiveCatId,
                categoryName: catSchema.name,
                productId: offer.productSet?.[0]?.product?.id || null
            },
            account: {
                id: ctx.effAccountId,
                label: accountLabel
            },
            matchedCandidates: ctx.matchedCandidates,
            tokenClaims,
            category: {
                id: catSchema.id,
                name: catSchema.name,
                refreshed: catSchema.refreshed
            },
            diffRows: patchResult.diffRows,
            missingRequired: patchResult.missingRequired,
            errors: patchResult.errors,
            warnings: patchResult.warnings,
            changesSummary: patchResult.changesSummary,
            preservedOfferFields: patchResult.preservedOfferFields,
            safetyExtract: {
                text: finalSafetyText,
                source: customSafetyText ? 'operator_modal' : extractedSafety.source,
                truncated: extractedSafety.truncated
            },
            safetyPreview: patchResult.safetyPreview,
            compositionDiagnostics,
            compositionPreview: patchResult.compositionPreview,
            titlePreview: patchResult.titlePreview,
            effectiveIncludeTitle: patchResult.effectiveIncludeTitle,
            patchBody: patchResult.patchBody,
            hasChanges: patchResult.hasChanges,
            requiresDoubleConfirmation: true,
            exportToken
        });
    } catch (error) {
        exportLogger.error(`[ALLEGRO PREFLIGHT ERROR] ${error.message}`, { stack: error.stack });
        const status = error.statusCode || error.response?.status || 500;
        const msg = error.response?.data ? AllegroService.formatAllegroApiErrors(error.response.data) : error.message;
        return res.status(status).json({ error: msg, code: error.code || null });
    }
};

function buildTitleStripFallbackOn422(workingPatchBody, patchErr, { offerId, scopeLabel, remainingLabel }) {
    if (!workingPatchBody?.name || !AllegroService.isAllegroTitleEditError(patchErr)) {
        return null;
    }
    const withoutName = { ...workingPatchBody };
    delete withoutName.name;
    if (Object.keys(withoutName).length === 0) {
        return null;
    }
    const warning = `Allegro zablokowało zmianę tytułu dla tej oferty (${patchErr.message}) — pominięto pole name, a ${remainingLabel} zostały wysłane ponownie.`;
    exportLogger.warn(`[${scopeLabel}] Fallback 422 name dla oferty ${offerId} — ponawiam PATCH bez pola name.`);
    return { nextPatchBody: withoutName, warning };
}

const exportAllegroParams = async (req, res) => {
    try {
        const { ean, productId, offerId, accountId = '', patchBody, exportToken, updatedFeatures, categoryId, confirmedTwice } = req.body || {};
        const wsId = req.workspaceId || null;
        if ((!ean && !productId) || !offerId || !patchBody || !exportToken) {
            return res.status(400).json({ error: 'Brak wymaganych danych lub tokenu autoryzacji Pre-flight.' });
        }
        if (confirmedTwice === false) {
            return res.status(400).json({ error: 'Eksport parametrów do Allegro wymaga dwukrotnego potwierdzenia przez operatora.' });
        }

        const product = await resolveProductByIdOrEan(prisma, { productId, ean, workspaceId: wsId });
        if (!product) {
            return res.status(404).json({ error: 'Nie znaleziono produktu w bazie PIM wybranego klienta.' });
        }

        const effAccountId = accountId ? String(accountId).trim() : '';
        try {
            if (wsId) {
                verifyAndConsumeScopedExportToken(exportToken, {
                    workspaceId: wsId,
                    userId: req.user?.id || '',
                    provider: 'ALLEGRO_PARAMS',
                    integrationAccountId: effAccountId,
                    targetId: String(offerId),
                    ean: product.ean,
                    payloadObj: patchBody
                });
            } else {
                verifyAllegroExportToken(exportToken, {
                    ean: product.ean,
                    offerId: String(offerId),
                    accountId: effAccountId,
                    payloadObj: patchBody
                });
            }
        } catch (tokErr) {
            return res.status(tokErr.statusCode || 403).json({ error: tokErr.message, code: tokErr.code || 'INVALID_EXPORT_TOKEN' });
        }

        if (!patchBody || (Object.keys(patchBody).length === 0)) {
            return res.status(400).json({ error: 'Brak zmian do wysłania na Allegro.' });
        }

        const requestedPatchTitle = (typeof patchBody.name === 'string' && patchBody.name.trim()) ? patchBody.name.trim() : null;
        const preservedImagesCnt = Array.isArray(patchBody.images) ? patchBody.images.length : 0;
        const preservedDescCnt = Array.isArray(patchBody.description?.sections) ? patchBody.description.sections.length : 0;
        const suppressCatalogImgs = Boolean(patchBody.productSet?.[0]?.product && Array.isArray(patchBody.productSet[0].product.images) && patchBody.productSet[0].product.images.length === 0);
        exportLogger.info(`[ALLEGRO EXPORT PARAMS] Wysyłanie PATCH do oferty ${offerId} (Workspace: ${wsId || 'legacy'}, Konto: ${effAccountId || 'domyślne'}, EAN: ${product.ean}, Ochrona treści: zdjęcia=${preservedImagesCnt}, opisSekcje=${preservedDescCnt}, blokadaKataloguZdjec=${suppressCatalogImgs}, tytuł=${Boolean(requestedPatchTitle)})`);

        const cleanCategoryId = categoryId ? String(categoryId).trim() : '';
        let workingPatchBody = { ...patchBody };
        let patchResult = null;
        let compositionSkippedForCategory = false;
        let compositionSkippedForValidation = false;
        let compositionSkipWarning = null;
        let titleSkippedDueToAllegroError = false;
        let titleSkipWarning = null;
        let skippedNoRemainingChanges = false;
        let resolvedCategoryId = cleanCategoryId;

        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                patchResult = await AllegroService.patchProductOffer(offerId, workingPatchBody, {
                    accountId: effAccountId || null,
                    workspaceId: wsId
                });
                if (cleanCategoryId && hasCompositionInPatchBody(workingPatchBody)) {
                    await AllegroService.clearCategoryCompositionUnsupported(cleanCategoryId);
                }
                break;
            } catch (patchErr) {
                if (!titleSkippedDueToAllegroError) {
                    const titleFallback = buildTitleStripFallbackOn422(workingPatchBody, patchErr, {
                        offerId,
                        scopeLabel: 'ALLEGRO EXPORT PARAMS',
                        remainingLabel: 'pozostałe parametry i dane GPSR'
                    });
                    if (titleFallback) {
                        titleSkippedDueToAllegroError = true;
                        titleSkipWarning = titleFallback.warning;
                        workingPatchBody = titleFallback.nextPatchBody;
                        continue;
                    }
                }

                const isCategoryCompErr = AllegroService.isAllegroCompositionCategoryError(patchErr);
                const isValidationCompErr = !isCategoryCompErr && AllegroService.isAllegroCompositionValidationError(patchErr);

                if (compositionSkippedForCategory || compositionSkippedForValidation || !hasCompositionInPatchBody(workingPatchBody) || (!isCategoryCompErr && !isValidationCompErr)) {
                    throw patchErr;
                }

                let latestOffer = null;
                try {
                    const fetched = await AllegroService.getOfferAndCatalogForParams(offerId, {
                        accountId: effAccountId || null,
                        workspaceId: wsId
                    });
                    latestOffer = fetched?.offer || null;
                    if (!resolvedCategoryId && latestOffer?.category?.id) {
                        resolvedCategoryId = String(latestOffer.category.id).trim();
                    }
                } catch (fetchErr) {
                    exportLogger.warn(`[ALLEGRO EXPORT PARAMS] Nie udało się pobrać oferty ${offerId} przy fallbacku composition: ${fetchErr.message}`);
                }

                // Cache TTL kategorii uzupełniamy WYŁĄCZNIE gdy cała kategoria nie obsługuje composition (nie dla błędu konkretnego składu produktu!)
                if (isCategoryCompErr && resolvedCategoryId) {
                    await AllegroService.markCategoryCompositionUnsupported(resolvedCategoryId, patchErr.message);
                }

                const stripped = stripCompositionFromPatchBody(workingPatchBody, latestOffer);
                compositionSkippedForCategory = isCategoryCompErr;
                compositionSkippedForValidation = isValidationCompErr;
                const catLabel = resolvedCategoryId ? `#${resolvedCategoryId}` : 'docelowa';

                if (!stripped.hasRemainingChanges) {
                    skippedNoRemainingChanges = true;
                    compositionSkipWarning = isCategoryCompErr
                        ? `Kategoria Allegro ${catLabel} nie obsługuje jeszcze pola składu produktu (productSet[0].composition). Skład INCI został pominięty, a pozostałe parametry i GPSR w ofercie ${offerId} były już aktualne.`
                        : `Allegro odrzuciło pole składu (composition) dla tej oferty (${patchErr.message}). Skład został pominięty, a pozostałe parametry i GPSR w ofercie ${offerId} były już aktualne.`;
                    patchResult = { status: isCategoryCompErr ? 'SKIPPED_COMPOSITION_UNSUPPORTED' : 'SKIPPED_COMPOSITION_VALIDATION' };
                    exportLogger.warn(`[ALLEGRO EXPORT PARAMS] Oferta ${offerId} (kategoria ${catLabel}): pominięto composition po 422 (${isCategoryCompErr ? 'category' : 'validation'}), brak innych różnic do wysyłki.`);
                    break;
                }

                compositionSkipWarning = isCategoryCompErr
                    ? `Kategoria Allegro ${catLabel} nie obsługuje jeszcze pola składu produktu (productSet[0].composition) — pominięto skład INCI, a pozostałe parametry i dane GPSR zostały wysłane ponownie.`
                    : `Allegro odrzuciło format/język pola składu (composition) dla tego produktu (${patchErr.message}) — pominięto pole składu, a pozostałe parametry i dane GPSR zostały wysłane ponownie.`;
                exportLogger.warn(`[ALLEGRO EXPORT PARAMS] Fallback 422 composition (${isCategoryCompErr ? 'category' : 'validation'}) dla oferty ${offerId} (kategoria ${catLabel}) — ponawiam PATCH bez productSet[].composition.`);
                workingPatchBody = stripped.patchBody;
            }
        }

        const existingDraft = parseOfferDraftJson(product.offerDraft);
        const exportedTitle = (requestedPatchTitle && !titleSkippedDueToAllegroError && !skippedNoRemainingChanges)
            ? requestedPatchTitle
            : null;
        const onlyTitleSent = Boolean(exportedTitle && Object.keys(workingPatchBody).length === 1 && workingPatchBody.name);

        const updateData = {
            offerDraft: {
                ...existingDraft,
                ...(exportedTitle ? { title: exportedTitle } : {}),
                allegroOfferId: String(offerId),
                ...(effAccountId ? { allegroAccountId: effAccountId } : {}),
                allegroLastParamsExport: {
                    timestamp: new Date().toISOString(),
                    accountId: effAccountId || null,
                    offerId: String(offerId),
                    status: patchResult.status,
                    compositionSkippedForCategory,
                    ...(exportedTitle ? { exportedTitle } : {}),
                    titleSkippedDueToAllegroError
                }
            }
        };
        if (updatedFeatures && typeof updatedFeatures === 'object') {
            updateData.features = updatedFeatures;
        }
        if (resolvedCategoryId) {
            updateData.allegroCategoryId = resolvedCategoryId;
        }

        await prisma.product.update({
            where: { id: product.id },
            data: updateData
        });

        if (wsId) {
            await workspaceService.recordSecurityAudit(prisma, {
                workspaceId: wsId,
                userId: req.user?.id || null,
                action: 'EXPORT_ALLEGRO_PARAMS',
                provider: 'ALLEGRO',
                entityId: String(offerId),
                details: {
                    ean: product.ean,
                    accountId: effAccountId || null,
                    status: patchResult.status,
                    ...(exportedTitle ? { exportedTitle } : {}),
                    titleSkippedDueToAllegroError
                }
            });
        }

        if (!skippedNoRemainingChanges) {
            EventBus.publish('PRODUCT_ALLEGRO_PARAMS_EXPORTED', {
                workspaceId: wsId,
                ean: product.ean,
                accountId: effAccountId || null,
                offerId: String(offerId),
                status: patchResult.status,
                compositionSkippedForCategory,
                ...(exportedTitle ? { exportedTitle } : {})
            });
        }

        const allWarnings = [compositionSkipWarning, titleSkipWarning].filter(Boolean);
        const titleFragment = exportedTitle ? 'tytuł, ' : '';
        let responseMessage;
        if (skippedNoRemainingChanges) {
            responseMessage = compositionSkipWarning;
        } else if (titleSkippedDueToAllegroError && (compositionSkippedForCategory || compositionSkippedForValidation)) {
            responseMessage = `Częściowy sukces! Zaktualizowano parametry w ofercie Allegro (${offerId}), pomijając zmianę tytułu oraz pole składu INCI.`;
        } else if (titleSkippedDueToAllegroError) {
            responseMessage = patchResult.status === 'PENDING_TIMEOUT'
                ? `Wysłano parametry i dane GPSR do oferty ${offerId} (Allegro przetwarza zadanie w tle). Pominięto tytuł — ${titleSkipWarning}`
                : `Częściowy sukces! Zaktualizowano parametry i dane zgodności w ofercie Allegro (${offerId}), pomijając zmianę tytułu.`;
        } else if (compositionSkippedForCategory) {
            responseMessage = patchResult.status === 'PENDING_TIMEOUT'
                ? `Wysłano ${titleFragment}pozostałe parametry do oferty ${offerId} (Allegro nadal przetwarza zadanie w tle). Pominięto skład INCI — ${compositionSkipWarning}`
                : `Częściowy sukces! Zaktualizowano ${titleFragment}parametry i dane GPSR w ofercie Allegro (${offerId}), pomijając skład INCI (kategoria ${resolvedCategoryId ? `#${resolvedCategoryId}` : ''} nie obsługuje jeszcze pola composition w API Allegro).`;
        } else if (compositionSkippedForValidation) {
            responseMessage = patchResult.status === 'PENDING_TIMEOUT'
                ? `Wysłano ${titleFragment}pozostałe parametry do oferty ${offerId} (Allegro nadal przetwarza zadanie w tle). Pominięto pole składu — ${compositionSkipWarning}`
                : `Częściowy sukces! Zaktualizowano ${titleFragment}parametry i dane GPSR w ofercie Allegro (${offerId}), pomijając pole składu odrzucone przez walidator Allegro (np. format detergentu zamiast INCI).`;
        } else if (onlyTitleSent) {
            responseMessage = patchResult.status === 'PENDING_TIMEOUT'
                ? `Wysłano nowy tytuł do oferty ${offerId} (Allegro nadal przetwarza zadanie w tle).`
                : `Sukces! Zaktualizowano tytuł oferty Allegro (${offerId}).`;
        } else {
            responseMessage = patchResult.status === 'PENDING_TIMEOUT'
                ? `Wysłano aktualizację do oferty ${offerId} (Allegro nadal przetwarza zadanie w tle).`
                : `Sukces! Zaktualizowano ${titleFragment}parametry i dane zgodności w ofercie Allegro (${offerId}).`;
        }

        return res.status(200).json({
            status: patchResult.status,
            offerId: String(offerId),
            accountId: effAccountId || null,
            categoryId: resolvedCategoryId || null,
            exportedTitle,
            titleSkippedDueToAllegroError,
            compositionSkippedForCategory,
            compositionSkippedForValidation,
            skippedNoRemainingChanges,
            warnings: allWarnings,
            message: responseMessage,
            patchResult
        });
    } catch (error) {
        exportLogger.error(`[ALLEGRO EXPORT PARAMS ERROR] ${error.message}`, { stack: error.stack });
        const status = error.statusCode || error.response?.status || 500;
        return res.status(status).json({
            error: error.message || 'Błąd wysyłki parametrów do Allegro.',
            allegroErrors: error.allegroErrors || null
        });
    }
};

function buildCanonicalContentDescriptor({ product, existingDraft, htmlContent, images, aiFlagsOverride, includeImages, includeDescription, title = null, includeTitle = false, contentProfile = null }) {
    const effectiveHtmlContent = htmlContent || existingDraft?.htmlContent || null;
    const effectiveDescriptionHtml = product?.descriptionHtml || '';
    const effectiveTitle = (typeof title === 'string' && title.trim() !== '')
        ? title.replace(/\s+/g, ' ').trim()
        : (existingDraft?.title ? String(existingDraft.title).replace(/\s+/g, ' ').trim() : '');
    const effectiveDraftImages = (Array.isArray(images) && images.length > 0)
        ? images
        : (Array.isArray(existingDraft?.visionTickets) && existingDraft.visionTickets.length > 0
            ? existingDraft.visionTickets
            : (Array.isArray(existingDraft?.images) ? existingDraft.images : []));

    const collected = collectPipelineImagesForAllegro({
        draftImages: effectiveDraftImages,
        productImageUrl: product?.imageUrl || null,
        productImages: product?.images || [],
        aiFlagsOverride
    });

    const tokenDigestObj = {
        includeImages: Boolean(includeImages),
        includeDescription: Boolean(includeDescription),
        includeTitle: Boolean(includeTitle),
        title: effectiveTitle,
        images: collected.images.map(i => ({ source: i.source, isAiCoCreated: i.isAiCoCreated })),
        htmlContent: effectiveHtmlContent,
        descriptionHtml: effectiveDescriptionHtml,
        ...(contentProfile ? {
            layoutKey: {
                sectionOrder: contentProfile.sectionOrder,
                hiddenSections: contentProfile.hiddenSections,
                imageTextLayout: contentProfile.imageTextLayout,
                includeTipsSection: contentProfile.includeTipsSection
            }
        } : {})
    };

    return {
        effectiveHtmlContent,
        effectiveDescriptionHtml,
        effectiveTitle,
        effectiveDraftImages,
        collected,
        tokenDigestObj
    };
}

const validateAllegroContentExport = async (req, res) => {
    try {
        const {
            ean,
            productId,
            offerId,
            accountId,
            htmlContent = null,
            images = null,
            title = null,
            includeImages = true,
            includeDescription = true,
            includeTitle = false,
            aiFlagsOverride = null
        } = req.body || {};

        if (!ean && !productId) {
            return res.status(400).json({ error: 'Wymagany kod EAN lub ID produktu.' });
        }

        const wsId = req.workspaceId || null;
        const product = await resolveProductByIdOrEan(prisma, { productId, ean, workspaceId: wsId, include: { brand: true } });
        if (!product) {
            return res.status(404).json({ error: 'Nie znaleziono produktu w bazie PIM wybranego klienta.' });
        }

        const existingDraft = parseOfferDraftJson(product.offerDraft);

        let ctx;
        try {
            ctx = await resolveAllegroOfferContext({
                product,
                existingDraft,
                requestedOfferId: offerId,
                requestedAccountId: accountId,
                categoryId: product.allegroCategoryId || '',
                workspaceId: wsId
            });
        } catch (authErr) {
            return res.status(authErr.statusCode || 403).json({
                error: authErr.message,
                code: authErr.code || 'ALLEGRO_AUTH_ERROR',
                missingScopes: authErr.missingScopes || null
            });
        }

        if (!ctx.targetOfferId) {
            return res.status(404).json({
                error: 'Nie odnaleziono automatycznie oferty na koncie Allegro dla tego SKU/EAN. Wpisz numer oferty Allegro (offerId) ręcznie przed weryfikacją.',
                candidates: []
            });
        }

        const { offer, catalogProduct, accountId: resolvedAccountId, accountLabel, tokenClaims } = await AllegroService.getOfferAndCatalogForParams(ctx.targetOfferId, {
            accountId: ctx.effAccountId,
            workspaceId: wsId
        });
        if (resolvedAccountId) {
            ctx.effAccountId = resolvedAccountId;
        }

        const contentProfile = req.workspace ? resolveWorkspaceContentProfile(req.workspace) : null;
        const descriptor = buildCanonicalContentDescriptor({
            product,
            existingDraft,
            htmlContent,
            images,
            aiFlagsOverride,
            includeImages,
            includeDescription,
            title,
            includeTitle,
            contentProfile
        });

        const preflight = buildAllegroContentPreflight({
            existingOffer: offer,
            catalogProduct,
            htmlContent: descriptor.effectiveHtmlContent,
            descriptionHtml: descriptor.effectiveDescriptionHtml,
            draftImages: descriptor.effectiveDraftImages,
            productImageUrl: product.imageUrl,
            productImages: product.images,
            includeImages,
            includeDescription,
            includeTitle,
            title: descriptor.effectiveTitle,
            brand: product?.brand?.name || '',
            aiFlagsOverride,
            contentProfile
        });

        const exportToken = wsId
            ? signScopedExportToken({
                workspaceId: wsId,
                userId: req.user?.id || '',
                provider: 'ALLEGRO_CONTENT',
                integrationAccountId: ctx.effAccountId || '',
                targetId: String(ctx.targetOfferId),
                ean: product.ean,
                payloadObj: descriptor.tokenDigestObj
            })
            : signAllegroExportToken({
                ean: product.ean,
                offerId: ctx.targetOfferId,
                accountId: ctx.effAccountId,
                payloadObj: descriptor.tokenDigestObj
            });

        return res.status(200).json({
            workspace: req.workspace ? {
                id: req.workspace.id,
                name: req.workspace.name,
                slug: req.workspace.slug,
                badgeColor: req.workspace.badgeColor
            } : null,
            offer: {
                id: String(offer.id),
                name: offer.name,
                status: offer.publication?.status || 'UNKNOWN',
                categoryId: offer?.category?.id ? String(offer.category.id) : null,
                productId: offer?.productSet?.[0]?.product?.id || null
            },
            account: {
                id: ctx.effAccountId,
                label: accountLabel
            },
            matchedCandidates: ctx.matchedCandidates,
            tokenClaims,
            requiresDoubleConfirmation: true,
            ...preflight,
            exportToken
        });
    } catch (error) {
        exportLogger.error(`[ALLEGRO CONTENT PREFLIGHT ERROR] ${error.message}`, { stack: error.stack });
        const status = error.statusCode || error.response?.status || 500;
        const msg = error.response?.data ? AllegroService.formatAllegroApiErrors(error.response.data) : error.message;
        return res.status(status).json({ error: msg, code: error.code || null });
    }
};

const exportAllegroContent = async (req, res) => {
    try {
        const {
            ean,
            productId,
            offerId,
            accountId = '',
            htmlContent = null,
            images = null,
            title = null,
            includeImages = true,
            includeDescription = true,
            includeTitle = false,
            aiFlagsOverride = null,
            exportToken,
            confirmedTwice
        } = req.body || {};

        const wsId = req.workspaceId || null;
        if ((!ean && !productId) || !offerId || !exportToken) {
            return res.status(400).json({ error: 'Brak wymaganych danych lub tokenu autoryzacji Pre-flight.' });
        }
        if (confirmedTwice === false) {
            return res.status(400).json({ error: 'Eksport opisu i zdjęć do Allegro wymaga dwukrotnego potwierdzenia przez operatora.' });
        }

        const product = await resolveProductByIdOrEan(prisma, { productId, ean, workspaceId: wsId, include: { brand: true } });
        if (!product) {
            return res.status(404).json({ error: 'Nie znaleziono produktu w bazie PIM.' });
        }

        const existingDraft = parseOfferDraftJson(product.offerDraft);
        const effAccountId = accountId ? String(accountId).trim() : '';

        const contentProfile = req.workspace ? resolveWorkspaceContentProfile(req.workspace) : null;
        const descriptor = buildCanonicalContentDescriptor({
            product,
            existingDraft,
            htmlContent,
            images,
            aiFlagsOverride,
            includeImages,
            includeDescription,
            title,
            includeTitle,
            contentProfile
        });

        try {
            if (wsId) {
                verifyAndConsumeScopedExportToken(exportToken, {
                    workspaceId: wsId,
                    userId: req.user?.id || '',
                    provider: 'ALLEGRO_CONTENT',
                    integrationAccountId: effAccountId,
                    targetId: String(offerId),
                    ean: product.ean,
                    payloadObj: descriptor.tokenDigestObj
                });
            } else {
                verifyAllegroExportToken(exportToken, {
                    ean: product.ean,
                    offerId: String(offerId),
                    accountId: effAccountId,
                    payloadObj: descriptor.tokenDigestObj
                });
            }
        } catch (tokErr) {
            return res.status(tokErr.statusCode || 403).json({ error: tokErr.message, code: tokErr.code || 'INVALID_EXPORT_TOKEN' });
        }

        const { offer, catalogProduct } = await AllegroService.getOfferAndCatalogForParams(offerId, {
            accountId: effAccountId || null,
            workspaceId: wsId
        });

        const preflightCheck = buildAllegroContentPreflight({
            existingOffer: offer,
            catalogProduct,
            htmlContent: descriptor.effectiveHtmlContent,
            descriptionHtml: descriptor.effectiveDescriptionHtml,
            draftImages: descriptor.effectiveDraftImages,
            productImageUrl: product.imageUrl,
            productImages: product.images,
            includeImages,
            includeDescription,
            includeTitle,
            title: descriptor.effectiveTitle,
            brand: product?.brand?.name || '',
            aiFlagsOverride,
            contentProfile
        });

        if (preflightCheck.errors.length > 0) {
            return res.status(400).json({ error: preflightCheck.errors.join(' | ') });
        }
        const shouldPatchTitle = Boolean(preflightCheck.effectiveIncludeTitle && preflightCheck.titlePreview?.willUpdate);
        if (!preflightCheck.effectiveIncludeImages && !preflightCheck.effectiveIncludeDescription && !shouldPatchTitle) {
            return res.status(400).json({ error: 'Brak pól do aktualizacji (zablokowane przez Trusted Content, identyczne wartości lub odznaczone).' });
        }

        let uploadedImages = [];
        if (preflightCheck.effectiveIncludeImages) {
            exportLogger.info(`[ALLEGRO EXPORT CONTENT] Upload ${descriptor.collected.images.length} zdjęć na upload.allegro.pl dla oferty ${offerId} (workspace: ${wsId || 'legacy'}, konto: ${effAccountId || 'domyślne'})`);
            const batchResults = [];
            for (const item of descriptor.collected.images) {
                const upRes = await AllegroService.uploadImageToAllegro({
                    source: item.source,
                    isAiCoCreated: item.isAiCoCreated,
                    accountId: effAccountId || null,
                    workspaceId: wsId
                });
                batchResults.push(upRes);
            }
            uploadedImages = batchResults;
        }

        const imageUrlsForDescription = preflightCheck.effectiveIncludeImages
            ? uploadedImages.map(u => u.url)
            : (preflightCheck.imagesPreview.current || []);

        let builtDesc = null;
        if (preflightCheck.effectiveIncludeDescription) {
            builtDesc = buildAllegroDescriptionSections({
                htmlContent: descriptor.effectiveHtmlContent,
                descriptionHtml: descriptor.effectiveDescriptionHtml,
                imageUrls: imageUrlsForDescription,
                appendAiDisclosure: uploadedImages.some(u => u.isAiCoCreated),
                contentProfile
            });
            if (builtDesc.exceedsLimit || builtDesc.sectionsCount === 0) {
                return res.status(400).json({ error: 'Finalny opis po podstawieniu zdjęć przekracza limit 40 000 bajtów lub jest pusty.' });
            }
        }

        const patchBody = buildAllegroContentPatchBody({
            existingOffer: offer,
            uploadedImages,
            description: builtDesc ? builtDesc.description : null,
            includeImages: preflightCheck.effectiveIncludeImages,
            includeDescription: preflightCheck.effectiveIncludeDescription,
            title: shouldPatchTitle ? preflightCheck.titlePreview.next : null,
            includeTitle: shouldPatchTitle
        });

        if (Object.keys(patchBody).length === 0) {
            return res.status(400).json({ error: 'Brak zmian do wysłania na Allegro.' });
        }

        exportLogger.info(`[ALLEGRO EXPORT CONTENT] Wysyłanie PATCH (opis/zdjęcia/tytuł) do oferty ${offerId} (Workspace: ${wsId || 'legacy'}, Konto: ${effAccountId || 'domyślne'}, EAN: ${product.ean}, tytuł=${Boolean(patchBody.name)})`);
        let patchResult = null;
        let titleSkippedDueToAllegroError = false;
        let titleSkipWarning = null;
        let executedPatchBody = patchBody;

        try {
            patchResult = await AllegroService.patchProductOffer(offerId, patchBody, {
                accountId: effAccountId || null,
                workspaceId: wsId
            });
        } catch (patchErr) {
            const titleFallback = buildTitleStripFallbackOn422(patchBody, patchErr, {
                offerId,
                scopeLabel: 'ALLEGRO EXPORT CONTENT',
                remainingLabel: 'opis i zdjęcia'
            });
            if (!titleFallback) {
                throw patchErr;
            }
            titleSkippedDueToAllegroError = true;
            titleSkipWarning = titleFallback.warning;
            executedPatchBody = titleFallback.nextPatchBody;
            patchResult = await AllegroService.patchProductOffer(offerId, executedPatchBody, {
                accountId: effAccountId || null,
                workspaceId: wsId
            });
        }

        const exportedTitle = (patchBody.name && !titleSkippedDueToAllegroError) ? patchBody.name : null;

        await prisma.product.update({
            where: { id: product.id },
            data: {
                offerDraft: {
                    ...existingDraft,
                    ...(exportedTitle ? { title: exportedTitle } : {}),
                    allegroOfferId: String(offerId),
                    ...(effAccountId ? { allegroAccountId: effAccountId } : {}),
                    allegroLastContentExport: {
                        timestamp: new Date().toISOString(),
                        accountId: effAccountId || null,
                        offerId: String(offerId),
                        status: patchResult.status,
                        exportedImagesCount: uploadedImages.length,
                        exportedSectionsCount: builtDesc ? builtDesc.sectionsCount : 0,
                        uploadedUrls: uploadedImages.map(u => u.url),
                        ...(exportedTitle ? { exportedTitle } : {}),
                        titleSkippedDueToAllegroError
                    }
                }
            }
        });

        if (wsId) {
            await workspaceService.recordSecurityAudit(prisma, {
                workspaceId: wsId,
                userId: req.user?.id || null,
                action: 'EXPORT_ALLEGRO_CONTENT',
                provider: 'ALLEGRO',
                entityId: String(offerId),
                details: {
                    ean: product.ean,
                    accountId: effAccountId || null,
                    uploadedImagesCount: uploadedImages.length,
                    sectionsCount: builtDesc ? builtDesc.sectionsCount : 0,
                    status: patchResult.status,
                    ...(exportedTitle ? { exportedTitle } : {}),
                    titleSkippedDueToAllegroError
                }
            });
        }

        EventBus.publish('PRODUCT_ALLEGRO_CONTENT_EXPORTED', {
            workspaceId: wsId,
            ean: product.ean,
            accountId: effAccountId || null,
            offerId: String(offerId),
            status: patchResult.status,
            ...(exportedTitle ? { exportedTitle } : {})
        });

        const onlyTitleContent = Boolean(exportedTitle && Object.keys(executedPatchBody).length === 1 && executedPatchBody.name);
        let msg;
        if (titleSkippedDueToAllegroError) {
            msg = patchResult.status === 'PENDING_TIMEOUT'
                ? `Wysłano opis/zdjęcia do oferty ${offerId} (Allegro przetwarza zadanie w tle). Pominięto tytuł — ${titleSkipWarning}`
                : `Częściowy sukces! Zaktualizowano opis i zdjęcia w ofercie Allegro (${offerId}), pomijając zmianę tytułu.`;
        } else if (onlyTitleContent) {
            msg = patchResult.status === 'PENDING_TIMEOUT'
                ? `Wysłano nowy tytuł do oferty ${offerId} (Allegro nadal przetwarza zadanie w tle).`
                : `Sukces! Zaktualizowano tytuł oferty Allegro (${offerId}).`;
        } else {
            const titleFrag = exportedTitle ? 'tytuł, ' : '';
            msg = patchResult.status === 'PENDING_TIMEOUT'
                ? `Wysłano ${titleFrag}opis/zdjęcia do oferty ${offerId} (Allegro nadal przetwarza zadanie w tle).`
                : `Sukces! Zaktualizowano ${titleFrag}opis i zdjęcia w ofercie Allegro (${offerId}).`;
        }

        return res.status(200).json({
            status: patchResult.status,
            offerId: String(offerId),
            accountId: effAccountId || null,
            uploadedImagesCount: uploadedImages.length,
            sectionsCount: builtDesc ? builtDesc.sectionsCount : 0,
            exportedTitle,
            titleSkippedDueToAllegroError,
            warnings: titleSkipWarning ? [titleSkipWarning] : [],
            message: msg,
            patchResult
        });
    } catch (error) {
        exportLogger.error(`[ALLEGRO EXPORT CONTENT ERROR] ${error.message}`, { stack: error.stack });
        const status = error.statusCode || error.response?.status || 500;
        return res.status(status).json({
            error: error.message || 'Błąd wysyłki opisu i zdjęć do Allegro.',
            allegroErrors: error.allegroErrors || null
        });
    }
};

module.exports = {
    startOptimization,
    checkStatus,
    analyzeSingle,
    regenerateTitle,
    proxyImage,
    saveDraft,
    validateBaselinkerExport,
    exportToBaselinker,
    generateLifestyle,
    checkLifestyleStatus,
    extractBackLabel,
    triggerUltimatePipeline,
    checkPipelineStatus,
    ingestKnowledgeDocument,
    listKnowledgeDocuments,
    deleteKnowledgeDocument,
    generateItalianFrame,
    searchAllegroOffers,
    validateAllegroParamsExport,
    exportAllegroParams,
    validateAllegroContentExport,
    exportAllegroContent
};
