const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const BaseLinkerService = require('./baselinker.service');
const AiService = require('./ai.service');

const activePipelines = new Set(); // Local Mutex zapobiegający wyścigom wywołań (Race Conditions)

class EanPipelineService {
    static async execute(ean) {
        if (activePipelines.has(ean)) {
            console.log(`[EAN Pipeline Mutex] Zablokowano wejście. EAN ${ean} jest aktualnie procesowany.`);
            throw new Error(`Zadanie odrzucone (Mutex Lock): Proces dla EAN ${ean} już trwa.`);
        }
        
        activePipelines.add(ean);
        const startTime = Date.now();
        console.log(`[Ultimate EAN Pipeline] === ROZPOCZĘCIE PROCESU SEKWENCYJNEGO DLA: ${ean} ===`);
        
        try {
            // FAZA 1: DATA ENRICHMENT Z PIM I BASELINKER
            console.log(`[EAN Pipeline] Pobieranie produktu z bazy danych...`);
            let product = await prisma.product.findUnique({ where: { ean }, include: { brand: true } });
            
            // 1. Auto-Weryfikacja BaseLinker
            console.log(`[EAN Pipeline] 1. Auto-Weryfikacja BaseLinker (API-First)`);
            const needsSync = !product || !product.isSynced || (product.brand && product.brand.name === 'PIM-IMPORT');
            if (needsSync) {
                console.log(`[EAN Pipeline] Pobieranie specyfikacji w BaseLinker...`);
                const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
                const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
                
                let brandId = product ? product.brandId : null;
                const isPimImportId = product && product.brand && product.brand.name === 'PIM-IMPORT';
                if (!brandId || isPimImportId) {
                    let brandNameRaw = deepData.manufacturer;
                    if (!brandNameRaw || brandNameRaw.trim() === '') {
                        if (deepData.features && deepData.features['Marka']) brandNameRaw = deepData.features['Marka'];
                        else if (deepData.features && deepData.features['Producent']) brandNameRaw = deepData.features['Producent'];
                    }

                    if (brandNameRaw && brandNameRaw.trim() !== '') {
                        const brandName = brandNameRaw.trim();
                        let matchedBrand = await prisma.brand.findUnique({ where: { name: brandName } });
                        if (!matchedBrand) matchedBrand = await prisma.brand.create({ data: { name: brandName } });
                        brandId = matchedBrand.id;
                    } else if (!brandId) {
                        let defaultBrand = await prisma.brand.findUnique({ where: { name: 'PIM-IMPORT' } });
                        if (!defaultBrand) defaultBrand = await prisma.brand.create({ data: { name: 'PIM-IMPORT' } });
                        brandId = defaultBrand.id;
                    }
                }
                
                const deepPayload = {
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
                };

                console.log(`[EAN Pipeline] Aktualizacja produktu w bazie danych...`);
                if (!product) {
                    product = await prisma.product.create({
                        data: { ean, sku: deepData.sku || ean, name: deepData.name, brandId, ...deepPayload }
                    });
                } else {
                    product = await prisma.product.update({
                        where: { ean },
                        data: deepPayload
                    });
                }
            }

            // FAZA 2: AUTOFILL PIM PARAMETERS Z FALLBACKIEM
            console.log(`[EAN Pipeline] 2. Agent Auto-Fill (Uzupełnianie PIM)...`);
            const allegroService = require('./allegro.service');
            let catId = product.allegroCategoryId;
            if (!catId) {
                 catId = await allegroService.findCategoryByEan(ean);
                 if (!catId && product.name) catId = await allegroService.findMatchingCategoryByName(product.name);
                 if (catId) {
                      await allegroService.fetchCategoryParameters(catId);
                      await prisma.product.update({ where: { ean }, data: { allegroCategoryId: catId } });
                      product.allegroCategoryId = catId;
                 }
            }
            
            let requiredSchema = [];
            if (catId) {
                 let category = await prisma.marketplaceCategory.findUnique({ where: { id: catId } });
                 if (!category || !category.parameters || (Array.isArray(category.parameters) && category.parameters.length === 0)) {
                      console.log(`[EAN Pipeline] Brak cache parametrów dla kategorii ${catId}, doczytuję na żywo z API...`);
                      await allegroService.fetchCategoryParameters(catId);
                      category = await prisma.marketplaceCategory.findUnique({ where: { id: catId } });
                 }
                 if (category && category.parameters) requiredSchema = category.parameters;
            }
            
            let currentFeatures = product.features && typeof product.features === 'object' ? { ...product.features } : {};
            
            // ETAP 1. Pobieranie sztywnych parametrów z Allegro Catalog API (Zamiast zgadywania przez AI)
            console.log(`[EAN Pipeline] -> Pobieranie twardych parametrów z Allegro Catalog API dla EAN: ${ean}`);
            const hardCatalogFeatures = await allegroService.getProductParametersByEan(ean);
            if (hardCatalogFeatures && Object.keys(hardCatalogFeatures).length > 0) {
                currentFeatures = { ...currentFeatures, ...hardCatalogFeatures };
                console.log(`[EAN Pipeline] -> Zaimportowano ${Object.keys(hardCatalogFeatures).length} gotowych parametrów z API Allegro.`);
            }

            // ETAP 2. Ostatnia Linia Wsparcia: Agent AI Lite (Tylko dla wciąż brakujących danych)
            console.log(`[EAN Pipeline] -> Uruchomienie Agenta Lite dla braków słownikowych...`);
            const filledFeatures = await AiService.autofillMissingParameters(ean, product.name, currentFeatures, requiredSchema);
            if (filledFeatures && Object.keys(filledFeatures).length > 0) {
                let dataToUpdate = { features: filledFeatures };
                if (filledFeatures["Marka"]) {
                    const detectedBrandName = filledFeatures["Marka"].trim();
                    const currentBrand = await prisma.brand.findUnique({ where: { id: product.brandId } });
                    if (!currentBrand || currentBrand.name === 'PIM-IMPORT') {
                        let b = await prisma.brand.findUnique({ where: { name: detectedBrandName } });
                        if (!b) b = await prisma.brand.create({ data: { name: detectedBrandName } });
                        dataToUpdate.brandId = b.id;
                    }
                }
                product = await prisma.product.update({ where: { ean }, data: dataToUpdate });
            }

            // FAZA 3: USTRUKTURYZOWANY OSINT I SENTYMENT (Czekamy w kolejności, brak Promise.all)
            console.log(`[EAN Pipeline] 3. Agent Sentimentu Klientów...`);
            let existingSentiment = null;
            if (product.offerDraft && typeof product.offerDraft === 'object' && product.offerDraft.customerSentiment) {
                existingSentiment = product.offerDraft.customerSentiment; // Bufor
            }
            const sentimentData = await AiService.gatherCustomerSentiment(ean, product.name, existingSentiment);

            console.log(`[EAN Pipeline] 4. Agent Badawczy OSINT...`);
            const existingPimString = product.features ? JSON.stringify(product.features) : null;
            const intelligenceData = await AiService.gatherProductIntelligence(ean, product.name, existingPimString);

            // FAZA 4: GENERACJA LOKALNA (AEO -> GEO -> Title -> Compliance) - W PEŁNI SEKWENCYJNA
            console.log(`[EAN Pipeline] 5. Audyt Wizualny (Oczekujemy)...`);
            let visualAudit = { images: (product.images || []).map(url => ({ originalUrl: url, isCompliant: true, alerts: [] })) };
            if (product.images && product.images.length > 0) {
                visualAudit = await AiService.auditOfferImages(product.images[0], product.images.slice(1));
            }

            console.log(`[EAN Pipeline] 6. Agent AEO...`);
            const aeoContent = await AiService.generateAEOContent(product.name, product.descriptionHtml, intelligenceData);

            console.log(`[EAN Pipeline] 7. Agent Tytułu (SEO)...`);
            const titleResult = await AiService.generateTitleOnly(aeoContent, product.name);

            console.log(`[EAN Pipeline] 8. Agent GEO Text...`);
            const geoResult = await AiService.generateGEOTextContent(product.name, aeoContent, intelligenceData, sentimentData);

            console.log(`[EAN Pipeline] 9. Agent Audytor Prawny...`);
            const fullHtml = Object.values(geoResult.htmlContent || {}).join("");
            const complianceReport = await AiService.generateComplianceReport(product.name, aeoContent, fullHtml);

            // FAZA 5: ZAPIS KOŃCOWY
            console.log(`[EAN Pipeline] Zapisywanie rezultatu do Kopii Roboczej PIM...`);
            const finalDraft = {
                title: titleResult.title,
                htmlContent: geoResult.htmlContent,
                complianceReport,
                images: visualAudit.images || [],
                customerSentiment: sentimentData, // Cache na zawsze
                intelligenceData: intelligenceData, // Cache na zawsze
                aiMetadata: {
                    isAiGenerated: true,
                    aiModel: "gemini-3.1-pro-preview",
                    generatedAt: new Date().toISOString(),
                    complianceNotice: "EU AI Act Transparency Compliant (Art. 50)"
                }
            };

            const updatedProduct = await prisma.product.update({
                where: { ean },
                data: { offerDraft: finalDraft }
            });

            console.log(`[Ultimate EAN Pipeline] === ZAKOŃCZONO POMYŚLNIE (Czas całkowity: ${Date.now() - startTime}ms) ===`);
            return { ...updatedProduct, finalDraft };

        } catch (error) {
            console.error(`[Ultimate EAN Pipeline] ❌ KRYTYCZNY BŁĄD PRZEPŁYWU:`, error.message);
            console.error(error.stack);
            throw new Error(`Pipeline upadł z powodu: ${error.message}`);
        } finally {
            activePipelines.delete(ean); // Zwalnianie locka mutex!
        }
    }
}

module.exports = EanPipelineService;
