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
        let product = await prisma.product.findUnique({ where: { ean } });
        
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
            
            let sekcja1 = '', sekcja2 = '', sekcja3 = '', sekcja4 = '', sekcja5 = '', sekcja6 = '';
            const draft = product.offerDraft;
            if (draft.htmlContent) {
                if (typeof draft.htmlContent === 'string') {
                    sekcja1 = draft.htmlContent;
                } else if (typeof draft.htmlContent === 'object') {
                    sekcja1 = draft.htmlContent.sekcja1 || '';
                    sekcja2 = draft.htmlContent.sekcja2 || '';
                    sekcja3 = draft.htmlContent.sekcja3 || '';
                    sekcja4 = draft.htmlContent.sekcja4 || '';
                    sekcja5 = draft.htmlContent.sekcja5 || '';
                    sekcja6 = draft.htmlContent.sekcja6 || '';
                }
            } else {
                sekcja1 = draft.sekcja1 || '';
                sekcja2 = draft.sekcja2 || '';
                sekcja3 = draft.sekcja3 || '';
                sekcja4 = draft.sekcja4 || '';
                sekcja5 = draft.sekcja5 || '';
                sekcja6 = draft.sekcja6 || '';
            }

            return res.status(200).json({
                title: product.offerDraft.title || product.name,
                ean: product.ean,
                htmlContent: { sekcja1, sekcja2, sekcja3, sekcja4, sekcja5, sekcja6 },
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
        res.redirect(url);
    }
};

const saveDraft = async (req, res) => {
    try {
        const { ean, draftData } = req.body;
        if (!ean || !draftData) return res.status(400).json({ error: "Brak EAN lub danych draftu" });

        const updatePayload = {
            offerDraft: draftData,
        };

        // Synchronizacja głównych pól PIM (Tytuł, Opis HTML, Zdjęcia)
        if (draftData.title) {
            updatePayload.name = draftData.title;
        }
        if (draftData.htmlContent) {
            const fullHtml = typeof draftData.htmlContent === 'object'
                ? Object.values(draftData.htmlContent).join("")
                : String(draftData.htmlContent);
            updatePayload.descriptionHtml = fullHtml;
        }
        if (Array.isArray(draftData.images) && draftData.images.length > 0) {
            const imageUrls = draftData.images
                .map(img => typeof img === 'string' ? img : (img.url || img.replacedUrl || img.originalUrl))
                .filter(Boolean);
            if (imageUrls.length > 0) {
                updatePayload.images = imageUrls;
                updatePayload.imageUrl = imageUrls[0];
            }
        }

        if (draftData.sku !== undefined && draftData.sku !== null && String(draftData.sku).trim() !== '') {
            updatePayload.sku = String(draftData.sku).trim();
        }
        if (draftData.brandId !== undefined) updatePayload.brandId = draftData.brandId;
        if (draftData.subiektId !== undefined) {
            updatePayload.subiektId = (draftData.subiektId && typeof draftData.subiektId === 'string' && draftData.subiektId.trim() !== '')
                ? draftData.subiektId.trim()
                : null;
        }
        if (draftData.baselinkerId !== undefined) {
            updatePayload.baselinkerId = (draftData.baselinkerId && typeof draftData.baselinkerId === 'string' && draftData.baselinkerId.trim() !== '')
                ? draftData.baselinkerId.trim()
                : null;
        }
        if (draftData.status !== undefined) updatePayload.status = draftData.status;
        if (draftData.videoUrl !== undefined) updatePayload.videoUrl = draftData.videoUrl;
        
        if (draftData.weight !== undefined) updatePayload.weight = draftData.weight;
        if (draftData.length !== undefined) updatePayload.length = draftData.length;
        if (draftData.width !== undefined) updatePayload.width = draftData.width;
        if (draftData.height !== undefined) updatePayload.height = draftData.height;
        if (draftData.taxRate !== undefined) updatePayload.taxRate = draftData.taxRate;
        if (draftData.stock !== undefined) updatePayload.stock = draftData.stock;
        if (draftData.stockErpUnits !== undefined) updatePayload.stockErpUnits = draftData.stockErpUnits;
        if (draftData.stockWmsUnits !== undefined) updatePayload.stockWmsUnits = draftData.stockWmsUnits;
        if (draftData.allegroCategoryId !== undefined) updatePayload.allegroCategoryId = draftData.allegroCategoryId;
        if (draftData.features !== undefined) updatePayload.features = draftData.features;

        if (draftData.basePrice !== undefined) updatePayload.basePrice = draftData.basePrice;
        if (draftData.salePrice !== undefined) updatePayload.salePrice = draftData.salePrice;
        if (draftData.inboundTransportCost !== undefined) updatePayload.inboundTransportCost = draftData.inboundTransportCost;
        if (draftData.packagingCost !== undefined) updatePayload.packagingCost = draftData.packagingCost;
        if (draftData.bdoEprCost !== undefined) updatePayload.bdoEprCost = draftData.bdoEprCost;
        if (draftData.outboundTransportCost !== undefined) updatePayload.outboundTransportCost = draftData.outboundTransportCost;

        const product = await prisma.product.update({
            where: { ean },
            data: updatePayload
        });
        
        EventBus.publish('PRODUCT_DATA_UPDATED', { product, source: 'OFFER_OPTIMIZER_SAVE' });
        
        res.status(200).json({ message: "Zapisano kopię roboczą oraz zaktualizowano twarde dane PIM" });
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
        
        let newDescHtml = '';
        if (draftData.htmlContent) {
            if (typeof draftData.htmlContent === 'string') {
                newDescHtml = draftData.htmlContent;
            } else if (typeof draftData.htmlContent === 'object') {
                newDescHtml = [
                    draftData.htmlContent.sekcja1 || '',
                    draftData.htmlContent.sekcja2 || '',
                    draftData.htmlContent.sekcja3 || '',
                    draftData.htmlContent.sekcja4 || '',
                    draftData.htmlContent.sekcja5 || '',
                    draftData.htmlContent.sekcja6 || ''
                ].filter(Boolean).join('\n\n');
            }
        } else {
            // fallback if flat
            newDescHtml = [
                draftData.sekcja1 || '',
                draftData.sekcja2 || '',
                draftData.sekcja3 || '',
                draftData.sekcja4 || '',
                draftData.sekcja5 || '',
                draftData.sekcja6 || ''
            ].filter(Boolean).join('\n\n');
        }

        const aiActDisclosure = `<p>Zdjęcia aranżacyjne: tła wygenerowane cyfrowo. Wygląd produktu i opakowania jest autentyczny.</p>`;
        if (newDescHtml && !newDescHtml.includes('tła wygenerowane cyfrowo')) {
            newDescHtml += `\n\n${aiActDisclosure}`;
        }

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

        const jobId = `lifestyle_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        lifestyleJobs.set(jobId, {
            status: 'PROCESSING',
            createdAt: Date.now(),
            ean,
            imageIndex
        });

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
                
                let scenography = null;
                if (ean) {
                    const product = await prisma.product.findUnique({ where: { ean } });
                    if (product && product.offerDraft && product.offerDraft.scenography) {
                        scenography = product.offerDraft.scenography;
                    }
                }
                
                const aiResult = await AiService.generateClaidLifestyle(imageBase64, sourceImageUrl, ean, imageIndex, scenography);
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
                    error: e.message || "Wewnętrzny błąd serwera przy obróbce Claid AI."
                });
            }
        })();

    } catch (e) {
        console.error("Błąd inicjalizacji generowania lifestyle (Claid API):", e.message);
        if (!res.headersSent) {
            res.status(500).json({ error: e.message || "Wewnętrzny błąd serwera przy obróbce Claid AI." });
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
        const { ean, hitlOverrides } = req.body;
        if (!ean) return res.status(400).json({ error: "Wymagany kod EAN do inicjalizacji potoku." });

        console.log(`[Controller] Rozpoczynam Asynchroniczne Wykonanie Master Agenta V2 dla EAN: ${ean}`);
        
        // Oznaczamy istniejący produkt w bazie jako PROCESSING, aby zapobiec zwracaniu przestarzałych wyników przez polling
        const existingProduct = await prisma.product.findUnique({ where: { ean } });
        if (existingProduct) {
            await prisma.product.update({
                where: { ean },
                data: { offerDraft: { status: 'PROCESSING', startedAt: Date.now() } }
            });
        }

        // Zwracamy HTTP 202 natychmiast
        res.status(202).json({ status: "processing", ean, message: "Pipeline V2 uruchomiony w tle." });

        // Procesujemy w tle (V2 Orchestrator)
        (async () => {
            try {
                const { Orchestrator } = require('../offer-optimizer-v2/orchestrator');
                const orch = new Orchestrator(ean);

                // Szukamy najświeższego stanu potoku (resume) w logach
                const fs = require('fs');
                const path = require('path');
                const logsDir = path.join(__dirname, '../offer-optimizer-v2/logs');
                let latestState = null;
                let latestMtime = 0;
                
                if (fs.existsSync(logsDir)) {
                    const files = fs.readdirSync(logsDir);
                    const eanFiles = files.filter(f => f.startsWith(`state_PL-${ean}-`) && f.endsWith('.json'));
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
                }

                // Zastosowanie opcjonalnych nadpisań HITL (z przeglądarki)
                if (Array.isArray(hitlOverrides) && hitlOverrides.length > 0) {
                    hitlOverrides.forEach(node => {
                        if (orch.state.node_status[node] === 'HALTED_HITL_REQUIRED') {
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
                // aby V2 Orchestrator mógł go strawić bez odpytywania zablokowanego API.
                let featuresObj = {};
                try {
                    featuresObj = typeof existingProduct?.features === 'string' ? JSON.parse(existingProduct.features) : (existingProduct?.features || {});
                } catch(e) {}
                
                const localPimData = {
                    text_fields: {
                        name: existingProduct?.name || "PIM Name",
                        description: existingProduct?.descriptionHtml || "",
                        features: featuresObj
                    }
                };
                
                await orch.run(localPimData);

                if (orch.state.next_action === 'HALT' && orch.state.hitl_alert) {
                     await prisma.product.update({
                         where: { ean },
                         data: { offerDraft: { status: 'HITL_PAUSED', error: orch.state.hitl_alert } }
                     });
                     console.log(`[Controller] Zatrzymano na bramce HITL: ${orch.state.hitl_alert}`);
                     
                     // Zatrzymujemy potok ale informujemy frontend o alertach, by pozwolil overrideowac
                     const haltedNode = Object.keys(orch.state.node_status).find(k => orch.state.node_status[k] !== 'OK' && orch.state.node_status[k] !== 'SKIPPED' && orch.state.node_status[k] !== 'HITL_OVERRIDDEN') || 'UNKNOWN';
                     socketService.broadcast('nexus-notification', {
                         type: 'PIPELINE_HITL_ALERT',
                         ean: ean,
                         alert: orch.state.hitl_alert,
                         node: haltedNode
                     });
                } else if (orch.state.final_offer) {
                     let currentOfferDraft = {};
                     try {
                         currentOfferDraft = typeof existingProduct?.offerDraft === 'string' ? JSON.parse(existingProduct.offerDraft) : (existingProduct?.offerDraft || {});
                     } catch (e) {}
                     
                     const editorHtmlObj = {
                         sekcja1: orch.state.a10_result?.section_1_html || "",
                         sekcja2: orch.state.a10_result?.section_2_html || "",
                         sekcja3: orch.state.a10_result?.section_3_html || "",
                         sekcja4: orch.state.a10_result?.section_4_html || "",
                         sekcja5: orch.state.a10_result?.section_5_html || "",
                         sekcja6: orch.state.a10_result?.section_6_html || ""
                     };

                     let updatedFeatures = {};
                     try {
                          updatedFeatures = typeof existingProduct?.features === 'string' ? JSON.parse(existingProduct.features) : (existingProduct?.features || {});
                     } catch(e) {}
                     
                     if (orch.state.extracted_data) {
                         if (orch.state.extracted_data.inci?.value) {
                             updatedFeatures['INCI'] = orch.state.extracted_data.inci.value;
                             updatedFeatures['SKŁAD'] = orch.state.extracted_data.inci.value;
                         }
                         if (orch.state.extracted_data.country_of_origin?.value) {
                             updatedFeatures['Kraj pochodzenia'] = orch.state.extracted_data.country_of_origin.value;
                         }
                         if (orch.state.extracted_data.brand?.value) {
                             updatedFeatures['Marka'] = orch.state.extracted_data.brand.value;
                         }
                         if (orch.state.extracted_data.capacity?.value) {
                             updatedFeatures['Pojemność'] = orch.state.extracted_data.capacity.value;
                         }
                         if (orch.state.extracted_data.eu_responsible_person?.data) {
                             const eu = orch.state.extracted_data.eu_responsible_person.data;
                             const euText = typeof eu === 'object' ? `${eu.name || ''} ${eu.address_eu || ''} ${eu.contact || ''}`.trim() : eu;
                             if (euText) updatedFeatures['INFORMACJE O BEZPIECZEŃSTWIE'] = euText;
                         }
                     }

                     await prisma.product.update({
                         where: { ean },
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
                     console.log(`[Controller] Sukces potoku V2 dla EAN: ${ean}`);
                     // Powiadomienie socketowe dla frontendu (zachowanie kompatybilności wstecz)
                     socketService.broadcast('nexus-notification', {
                         type: 'PIPELINE_COMPLETE',
                         ean: ean,
                         result: {
                             editorHtml: editorHtmlObj,
                             title: orch.state.final_offer.title || existingProduct?.name,
                             features: updatedFeatures,
                             aeoContent: existingProduct?.aeoContent || '',
                             visionTickets: (currentOfferDraft.visionTickets?.length ? currentOfferDraft.visionTickets : null) || (currentOfferDraft.images?.length ? currentOfferDraft.images : null) || (existingProduct?.images?.map(img => typeof img === 'string' ? { originalUrl: img, isCompliant: true, alerts: [] } : img) || [])
                         }
                     });
                } else {
                     await prisma.product.update({
                         where: { ean },
                         data: { offerDraft: { status: 'ERROR', error: 'Orchestrator V2 zakończył pracę, ale nie wygenerował wyniku A10' } }
                     });
                }
            } catch (err) {
                console.error(`[Controller] Błąd asynchronicznego potoku V2 dla: ${ean}`, err);
                await prisma.product.update({
                    where: { ean },
                    data: { offerDraft: { status: 'ERROR', error: err.message || 'Krytyczny błąd Orchestratora V2' } }
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
        const product = await prisma.product.findUnique({ 
            where: { ean },
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

module.exports = {
    startOptimization,
    checkStatus,
    analyzeSingle,
    regenerateTitle,
    proxyImage,
    saveDraft,
    exportToBaselinker,
    generateLifestyle,
    checkLifestyleStatus,
    triggerUltimatePipeline,
    checkPipelineStatus,
    ingestKnowledgeDocument,
    listKnowledgeDocuments,
    deleteKnowledgeDocument
};
