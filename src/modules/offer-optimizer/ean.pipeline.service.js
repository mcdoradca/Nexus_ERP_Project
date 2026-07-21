const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const BaseLinkerService = require('./baselinker.service');
const AiService = require('./ai.service');

class EanPipelineService {
    static async execute(ean) {
        const startTime = Date.now();
        console.log(`[Ultimate EAN Pipeline] === ROZPOCZĘCIE PROCESU DLA: ${ean} ===`);
        
        try {
            // FAZA 1: DATA ENRICHMENT & COMPLIANCE
            console.log(`[EAN Pipeline] Pobieranie produktu z bazy danych...`);
            let product = await prisma.product.findUnique({ where: { ean }, include: { brand: true } });
            
            // 1. Auto-Weryfikacja GUS/BaseLinker
            console.log(`[EAN Pipeline] 1. Auto-Weryfikacja BaseLinker (Faza 1)`);
            const needsSync = !product || !product.isSynced || (product.brand && product.brand.name === 'PIM-IMPORT');
            if (needsSync) {
                console.log(`[EAN Pipeline] Wymagana synchronizacja z BaseLinker...`);
                const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
                console.log(`[EAN Pipeline] Znaleziono w BL: invId=${inventoryId}, prodId=${productId}`);
                const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
                console.log(`[EAN Pipeline] Pobrano deepData z BL. Nazwa: ${deepData.name}`);
                
                let brandId = product ? product.brandId : null;
                const isPimImportId = product && product.brand && product.brand.name === 'PIM-IMPORT';
                if (!brandId || isPimImportId) {
                    let brandNameRaw = deepData.manufacturer;
                    if (!brandNameRaw || brandNameRaw.trim() === '') {
                        if (deepData.features && deepData.features['Marka']) {
                            brandNameRaw = deepData.features['Marka'];
                        } else if (deepData.features && deepData.features['Producent']) {
                            brandNameRaw = deepData.features['Producent'];
                        }
                    }

                    if (brandNameRaw && brandNameRaw.trim() !== '') {
                        const brandName = brandNameRaw.trim();
                        let matchedBrand = await prisma.brand.findUnique({ where: { name: brandName } });
                        if (!matchedBrand) {
                            matchedBrand = await prisma.brand.create({ data: { name: brandName } });
                        }
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

                console.log(`[EAN Pipeline] Upsertowanie produktu w bazie danych...`);
                product = await prisma.product.upsert({
                    where: { ean },
                    create: { ean, sku: deepData.sku || ean, name: deepData.name, brandId, ...deepPayload },
                    update: deepPayload
                });
                console.log(`[EAN Pipeline] Baza danych zaktualizowana.`);
            }

            // 2. Agent Badawczy (INCI) & Audyt Wizualny (Równolegle)
            console.log(`[EAN Pipeline] 2. Rozpoczynanie Agenta Badawczego (INCI) & Audytu Wizualnego...`);
            
            const visionPromise = (async () => {
                console.log(`[EAN Pipeline] -> Uruchamianie visionPromise...`);
                let vAudit = { images: (product.images || []).map(url => ({ originalUrl: url, isCompliant: true, alerts: [] })) };
                try {
                    if (product.images && product.images.length > 0) {
                        vAudit = await AiService.auditOfferImages(product.images[0], product.images.slice(1));
                        console.log(`[EAN Pipeline] -> visionPromise ZAKOŃCZONY SUKCESEM.`);
                    } else {
                        console.log(`[EAN Pipeline] -> visionPromise POMINIĘTY (brak obrazów).`);
                    }
                } catch (err) {
                    console.error("[EAN Pipeline] -> visionPromise OSTRZEŻENIE:", err.message);
                    console.error(err.stack);
                }
                return vAudit;
            })();

            console.log(`[EAN Pipeline] Pobieranie IntelligenceData (gatherProductIntelligence) & SentimentData (gatherCustomerSentiment)...`);
            const [intelligenceData, sentimentData] = await Promise.all([
                AiService.gatherProductIntelligence(ean, product.name),
                AiService.gatherCustomerSentiment(ean, product.name)
            ]);
            console.log(`[EAN Pipeline] Intelligence & Sentiment Data ZAKOŃCZONE.`);

            // 2.5 Auto-Fill PIM Parameters (Asynchronicznie, nie blokuje AEO)
            console.log(`[EAN Pipeline] 2.5 Rozpoczynanie Agenta Auto-Fill (PIM Parameters)...`);
            const allegroService = require('./allegro.service');
            const autofillPromise = (async () => {
                console.log(`[EAN Pipeline] -> Uruchamianie autofillPromise...`);
                try {
                    let catId = product.allegroCategoryId;
                    
                    if (!catId) {
                         console.log(`[EAN Pipeline] -> Szukanie kategorii w Allegro...`);
                         catId = await allegroService.findCategoryByEan(ean);
                         if (!catId && product.name) catId = await allegroService.findMatchingCategoryByName(product.name);
                         if (catId) {
                              console.log(`[EAN Pipeline] -> Znaleziono kategorię Allegro: ${catId}`);
                              await allegroService.fetchCategoryParameters(catId);
                              await prisma.product.update({ where: { ean }, data: { allegroCategoryId: catId } });
                              product.allegroCategoryId = catId;
                         }
                    }
                    
                    let requiredSchema = [];
                    if (catId) {
                         const category = await prisma.marketplaceCategory.findUnique({ where: { id: catId } });
                         if (category && category.parameters) requiredSchema = category.parameters;
                    }
                    
                    const currentFeatures = product.features && typeof product.features === 'object' ? { ...product.features } : {};
                    console.log(`[EAN Pipeline] -> Uruchamianie autofillMissingParameters...`);
                    const filledFeatures = await AiService.autofillMissingParameters(ean, product.name, currentFeatures, requiredSchema);
                    console.log(`[EAN Pipeline] -> autofillMissingParameters ZAKOŃCZONE.`);
                    
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
                        const r = await prisma.product.update({ where: { ean }, data: dataToUpdate });
                        console.log(`[EAN Pipeline] -> autofillPromise ZAKOŃCZONY SUKCESEM.`);
                        return r;
                    }
                    console.log(`[EAN Pipeline] -> autofillPromise ZAKOŃCZONY BEZ ZMIAN.`);
                } catch (err) {
                    console.error("[EAN Pipeline] -> Błąd autofillPromise:", err.message);
                    console.error(err.stack);
                }
            })();

            // 4. Agent AEO (wymaga intelligenceData)
            console.log(`[EAN Pipeline] 4. Agent AEO - Start...`);
            const aeoContent = await AiService.generateAEOContent(product.name, product.descriptionHtml, intelligenceData);
            console.log(`[EAN Pipeline] 4. Agent AEO - ZAKOŃCZONE.`);

            // 5. GEO Text & Optymalizacja Tytułu (Równolegle, wymagają AEO & Sentiment)
            console.log(`[EAN Pipeline] 5. Agent GEO Text & Agent Tytułu - Start równoległy z analizą opinii...`);
            const titlePromise = (async () => {
                console.log(`[EAN Pipeline] -> Uruchamianie titlePromise...`);
                const res = await AiService.generateTitleOnly(aeoContent, product.name);
                console.log(`[EAN Pipeline] -> titlePromise ZAKOŃCZONY.`);
                return res;
            })();
            const geoPromise = (async () => {
                console.log(`[EAN Pipeline] -> Uruchamianie geoPromise z kontekstem Sentimentu...`);
                const res = await AiService.generateGEOTextContent(product.name, aeoContent, intelligenceData, sentimentData);
                console.log(`[EAN Pipeline] -> geoPromise ZAKOŃCZONY.`);
                return res;
            })();

            const [titleResult, geoResult] = await Promise.all([titlePromise, geoPromise]);
            console.log(`[EAN Pipeline] 5. Agenci GEO i Title ZAKOŃCZENI SUKCESEM.`);

            // 6. Agent Audytor Prawny (Compliance)
            console.log(`[EAN Pipeline] 6. Agent Audytor Prawny (WE 1223/2009) - Start...`);
            const fullHtml = Object.values(geoResult.htmlContent || {}).join("");
            const complianceReport = await AiService.generateComplianceReport(product.name, aeoContent, fullHtml);
            console.log(`[EAN Pipeline] 6. Agent Audytor Prawny ZAKOŃCZONY SUKCESEM.`);

            // Oczekiwanie na poboczne procesy (Vision AI i Auto-Fill) przed finalizacją
            console.log(`[EAN Pipeline] Oczekiwanie na zakończenie visionPromise i autofillPromise...`);
            const [visualAudit] = await Promise.all([visionPromise, autofillPromise]);
            console.log(`[EAN Pipeline] Równoległe procesy (Vision/Autofill) odebrane.`);

            // ZAKOŃCZENIE FAZY 2 - Tarcza Błędu: Weryfikacja Człowieka (HitL - EU AI Act Art. 14)
            console.log(`[EAN Pipeline] Zapisywanie rezultatu do Kopii Roboczej PIM z metadanymi EU AI Act (Art. 50 & 14)...`);
            const finalDraft = {
                title: titleResult.title,
                htmlContent: geoResult.htmlContent,
                complianceReport,
                images: visualAudit.images || [],
                customerSentiment: sentimentData,
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
        }
    }
}

module.exports = EanPipelineService;
