const OfferOptimizerService = require('./offer-optimizer.service');
const AiService = require('./ai.service');
const AllegroService = require('./allegro.service');
const BaseLinkerService = require('./baselinker.service');
const EanPipelineService = require('./ean.pipeline.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EventBus = require('../../core/EventBus');

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
        let product = await prisma.product.findUnique({ where: { ean } });
        
        // Jeśli produktu nie ma w bazie lub nie jest zsynchronizowany, pobieramy z BaseLinkera
        if (!product || !product.isSynced) {
             console.log(`[PIM] EAN ${ean} brak w bazie lub isSynced=false. Wywołuję wymuszoną synchronizację z BaseLinkerem...`);
             const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
             const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
             
             // BaseLinker nie dostarcza brandId per se, szukamy brandu 'Nieznany' lub tworzymy PIM bez powiązania marki jeśli dopuszczalne
             // Schemat nakazuje brandId. Dla uproszczenia, sprawdzamy czy istnieje default
             let safeBrandId = product ? product.brandId : null;
             if (!safeBrandId) {
                 let defaultBrand = await prisma.brand.findFirst({ where: { name: 'PIM-IMPORT' } });
                 if (!defaultBrand) defaultBrand = await prisma.brand.create({ data: { name: 'PIM-IMPORT' } });
                 safeBrandId = defaultBrand.id;
             }
             
             if (!product) {
                 product = await prisma.product.create({
                     data: {
                         ean,
                         sku: deepData.sku || '',
                         name: deepData.name || `PIM Product ${ean}`,
                         brandId: safeBrandId,
                         status: 'Aktywny',
                         baselinkerInventoryId: deepData.baselinkerInventoryId,
                         baselinkerId: deepData.baselinkerId,
                         descriptionHtml: deepData.descriptionHtml,
                         features: deepData.features,
                         images: deepData.images,
                         weight: deepData.weight,
                         length: deepData.length,
                         width: deepData.width,
                         height: deepData.height,
                         taxRate: deepData.taxRate,
                         videoUrl: deepData.videoUrl,
                         attachments: deepData.attachments,
                         stockErpUnits: deepData.stockErpUnits,
                         stockWmsUnits: deepData.stockWmsUnits,
                         isSynced: true,
                         stock: deepData.stock
                     }
                 });
                 EventBus.publish('PRODUCT_DATA_UPDATED', { product, source: 'BASELINKER_SYNC_CREATE' });
             } else {
                 // STRAŻNIK DANYCH (MDM Data Gatekeeper)
                 // Sprawdzamy czy produkt ma opisy chronione lepszym znacznikiem "Źródła Prawdy"
                 const isProtectedContent = product.lastContentSource === 'OFFER_OPTIMIZER_AI' || product.lastContentSource === 'PIM_UI_MANUAL';
                 
                 let updateData = {
                     baselinkerInventoryId: deepData.baselinkerInventoryId,
                     baselinkerId: deepData.baselinkerId,
                     images: deepData.images, // Zwykle przyjmujemy że zdjęcia się synchronizują
                     weight: deepData.weight,
                     length: deepData.length,
                     width: deepData.width,
                     height: deepData.height,
                     taxRate: deepData.taxRate,
                     videoUrl: deepData.videoUrl,
                     attachments: deepData.attachments,
                     stockErpUnits: deepData.stockErpUnits,
                     stockWmsUnits: deepData.stockWmsUnits,
                     isSynced: true,
                     stock: deepData.stock
                 };
                 
                 // Jeśli nie jest chroniony - pozwalamy BaseLinkerowi nadpisać opisy tekstowe
                 if (!isProtectedContent) {
                     updateData.descriptionHtml = deepData.descriptionHtml;
                     updateData.features = deepData.features;
                     // ewentualnie updateData.name = deepData.name; (w zależności od wymagań)
                 } else {
                     console.log(`[MDM] Zablokowano nadpisanie opisów dla EAN: ${ean} z BaseLinkera. Posiada on wyższy Trust Score: ${product.lastContentSource}.`);
                 }

                 product = await prisma.product.update({
                     where: { id: product.id },
                     data: updateData
                 });
                 EventBus.publish('PRODUCT_DATA_UPDATED', { product, source: 'BASELINKER_SYNC_UPDATE' });
             }
        }

        if (!product.images || product.images.length === 0) {
             console.warn("[Vision API] Ostrzeżenie: Rekord PIM nie posiada żadnych zdjęć.");
        }

        // Faza 1.5: Sprawdzenie Kopii Roboczej
        if (product.offerDraft && Object.keys(product.offerDraft).length > 0 && !forceRegenerate) {
            console.log("[PIM] Zwracam zapisaną kopię roboczą z bazy!");
            return res.status(200).json({
                title: product.offerDraft.title || product.name,
                ean: product.ean,
                htmlContent: {
                    opis1: product.offerDraft.opis1 || '',
                    opis2: product.offerDraft.opis2 || '',
                    opis3: product.offerDraft.opis3 || '',
                    opis4: product.offerDraft.opis4 || '',
                    opis5: product.offerDraft.opis5 || ''
                },
                images: (product.offerDraft.images || []).map(img => ({ originalUrl: img.url, isCompliant: true, alerts: [] })),
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
        const { ean, currentTitle } = req.body;
        if (!ean) return res.status(400).json({ error: "Wymagany EAN." });

        const product = await prisma.product.findUnique({ where: { ean } });
        if (!product) return res.status(404).json({ error: "Produkt nie znaleziony w PIM." });

        const featuresString = product.features ? JSON.stringify(product.features) : '';
        const textContent = `NAZWA: ${product.name}\n\nCECHY TECHNICZNE PIM: ${featuresString}\n\nOPIS HTML: ${product.descriptionHtml || ''}`;

        const payload = await AiService.generateTitleOnly(textContent, currentTitle || product.name);
        res.status(200).json({ title: payload.title });
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
                
                res.setHeader('Content-Disposition', 'attachment; filename="nexus_lifestyle.jpg"');
                res.setHeader('Content-Type', mimeType);
                return res.status(200).send(buffer);
            }
        }

        const response = await require('axios').get(url, { responseType: 'stream' });
        res.setHeader('Content-Disposition', 'attachment; filename="nexus_image.jpg"');
        res.setHeader('Content-Type', response.headers['content-type'] || 'image/jpeg');
        response.data.pipe(res);
    } catch (e) {
        console.error("Image proxy error", e);
        res.status(500).send("Proxy error");
    }
};

const saveDraft = async (req, res) => {
    try {
        const { ean, draftData } = req.body;
        if (!ean || !draftData) return res.status(400).json({ error: "Brak EAN lub danych draftu" });

        const product = await prisma.product.update({
            where: { ean },
            data: { offerDraft: draftData }
        });
        res.status(200).json({ message: "Zapisano kopię roboczą" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const exportToBaselinker = async (req, res) => {
    try {
        const { ean, draftData } = req.body;
        if (!ean || !draftData) return res.status(400).json({ error: "Brak danych" });

        // Faza 3 MDM: AI wygenerowało wybitny opis. Nadpisujemy nim TRZON produktu w PIM
        // i oznaczamy twardo, że Źródłem Prawdy jest Sztuczna Inteligencja
        let newTitle = draftData.title;
        let newDescHtml = Object.values(draftData.htmlContent).join('');

        const product = await prisma.product.update({
            where: { ean },
            data: { 
                offerDraft: draftData,
                name: newTitle, // Nadpisujemy trzon!
                descriptionHtml: newDescHtml, // Nadpisujemy trzon!
                lastContentSource: 'OFFER_OPTIMIZER_AI' // Ustawiamy pieczątkę wysokiego zaufania
            }
        });

        if (!product.baselinkerInventoryId || !product.baselinkerId) {
             return res.status(400).json({ error: "Brak przypisania do BaseLinker w bazie (inventoryId/productId)." });
        }

        // Publikujemy zdarzenie. Moduł MDM wyłapie je i samodzielnie skomunikuje się z BaseLinkerem.
        EventBus.publish('PRODUCT_CONTENT_OPTIMIZED', { ean, product });

        res.status(200).json({ message: "Zapisano AI w PIM. MDM aktualizuje BaseLinker w tle!" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};

const generateLifestyle = async (req, res) => {
    try {
        const { ean, imageIndex, sourceImageUrl } = req.body;
        let { imageBase64 } = req.body;
        
        if (!imageBase64 && !sourceImageUrl) {
             return res.status(400).json({ error: "Brak zdjęcia wejściowego (wymagany imageBase64 lub sourceImageUrl)." });
        }

        const aiResult = await AiService.generateClaidLifestyle(imageBase64, sourceImageUrl, ean, imageIndex);
        const newImageBase64 = aiResult.base64;
        const visualTrendReport = aiResult.visualTrendReport;
        
        if (ean) {
            try {
                await prisma.product.update({
                    where: { ean },
                    data: { aiImageCost: { increment: 5.0 } }
                });
            } catch (err) {
                console.error("[Billing] Nie udalo sie zaktualizowac licznika kosztow AI dla ean:", ean, err);
            }
        }
        
        res.json({ newImageBase64, visualTrendReport });
    } catch (e) {
        console.error("Błąd generowania lifestyle (Claid API):", e.message);
        res.status(500).json({ error: e.message || "Wewnętrzny błąd serwera przy obróbce Claid AI." });
    }
};

const triggerUltimatePipeline = async (req, res) => {
    try {
        const { ean } = req.body;
        if (!ean) return res.status(400).json({ error: "Wymagany kod EAN do inicjalizacji potoku." });

        console.log(`[Controller] Rozpoczynam Synchroniczne Wykonanie Master Agenta EAN Pipeline: ${ean}`);
        const finalDraft = await EanPipelineService.execute(ean);

        console.log(`[Controller] Potok EAN Pipeline sfinalizowany. Zwracam pomyślny wynik HitL.`);
        return res.status(200).json(finalDraft);
    } catch (e) {
        console.error(`[Controller] Zablokowano błąd EAN Pipeline dla: ${req.body?.ean}`, e.message);
        return res.status(500).json({ error: e.message || "Błąd wewnętrzny serwera podczas procesowania EAN Pipeline." });
    }
};

module.exports = {
    startOptimization,
    checkStatus,
    analyzeSingle,
    regenerateTitle,
    proxyImage,
    saveDraft,
    exportToBaselinker,
    generateLifestyle,
    triggerUltimatePipeline
};
