const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const BaseLinkerService = require('./baselinker.service');
const AiService = require('./ai.service');

class EanPipelineService {
    static async execute(ean) {
        console.log(`[Ultimate EAN Pipeline] ROZPOCZĘCIE PROCESU DLA: ${ean}`);
        
        try {
            // FAZA 1: DATA ENRICHMENT & COMPLIANCE
            let product = await prisma.product.findUnique({ where: { ean } });
            
            // 1. Auto-Weryfikacja GUS/BaseLinker
            console.log(`[EAN Pipeline] 1. Auto-Weryfikacja BaseLinker`);
            if (!product || !product.isSynced) {
                const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
                const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
                
                let brandId = product ? product.brandId : null;
                if (!brandId) {
                    let defaultBrand = await prisma.brand.findFirst({ where: { name: 'PIM-IMPORT' } });
                    if (!defaultBrand) defaultBrand = await prisma.brand.create({ data: { name: 'PIM-IMPORT' } });
                    brandId = defaultBrand.id;
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

                product = await prisma.product.upsert({
                    where: { ean },
                    create: { ean, name: deepData.name, brandId, ...deepPayload },
                    update: deepPayload
                });
            }

            // 2. Agent Badawczy (INCI) & Audyt Wizualny (Równolegle)
            console.log(`[EAN Pipeline] 2. Agent Badawczy (INCI) & Audyt Wizualny - Równolegle`);
            
            const visionPromise = (async () => {
                let vAudit = { images: (product.images || []).map(url => ({ originalUrl: url, isCompliant: true, alerts: [] })) };
                try {
                    if (product.images && product.images.length > 0) {
                        vAudit = await AiService.auditOfferImages(product.images[0], product.images.slice(1));
                    }
                } catch (err) { console.error("[EAN Pipeline] Ostrzeżenie Vision AI:", err.message); }
                return vAudit;
            })();

            const intelligenceData = await AiService.gatherProductIntelligence(ean, product.name);

            // 2.5 Auto-Fill PIM Parameters (Asynchronicznie, nie blokuje AEO)
            console.log(`[EAN Pipeline] 2.5 Agent Auto-Fill (PIM Parameters)`);
            const autofillPromise = AiService.autofillMissingParameters(ean, product.name, product.features || {}, []).then(filledFeatures => {
                if (filledFeatures && Object.keys(filledFeatures).length > 0) {
                     return prisma.product.update({ where: { ean }, data: { features: filledFeatures } });
                }
            }).catch(err => console.error("[EAN Pipeline] Błąd Auto-Fill:", err.message));

            // 4. Agent AEO (wymaga intelligenceData)
            console.log(`[EAN Pipeline] 4. Agent AEO - Struktura Perplexity/SGE - Temperatura 0.4`);
            const aeoContent = await AiService.generateAEOContent(product.name, product.descriptionHtml, intelligenceData);

            // 5. GEO Text & Optymalizacja Tytułu (Równolegle, wymagają AEO)
            console.log(`[EAN Pipeline] 5. Agent GEO Text & Agent Tytułu - Równolegle`);
            const titlePromise = AiService.generateTitleOnly(aeoContent, product.name);
            const geoPromise = AiService.generateGEOTextContent(product.name, aeoContent, intelligenceData);

            const [titleResult, geoResult] = await Promise.all([titlePromise, geoPromise]);

            // 6. Agent Audytor Prawny (Compliance)
            console.log(`[EAN Pipeline] 6. Agent Audytor Prawny (WE 1223/2009) - Temperatura 0.0`);
            const fullHtml = Object.values(geoResult.htmlContent || {}).join("");
            const complianceReport = await AiService.generateComplianceReport(product.name, aeoContent, fullHtml);

            // Oczekiwanie na poboczne procesy (Vision AI i Auto-Fill) przed finalizacją
            const [visualAudit] = await Promise.all([visionPromise, autofillPromise]);

            // ZAKOŃCZENIE FAZY 2 - Tarcza Błędu: Weryfikacja Człowieka (HitL)
            console.log(`[EAN Pipeline] Zapisywanie rezultatu do Kopii Roboczej PIM (HitL)...`);
            const finalDraft = {
                title: titleResult.title,
                htmlContent: geoResult.htmlContent,
                complianceReport,
                images: visualAudit.images || []
            };

            const updatedProduct = await prisma.product.update({
                where: { ean },
                data: { offerDraft: finalDraft }
            });

            console.log(`[Ultimate EAN Pipeline] ZAKOŃCZONO POMYŚLNIE. Produkt oczekuje na zatwierdzenie w bazie PIM.`);
            return { ...updatedProduct, finalDraft };

        } catch (error) {
            console.error(`[Ultimate EAN Pipeline] KRYTYCZNY BŁĄD PRZEPŁYWU:`, error.message);
            throw new Error(`Pipeline upadł z powodu: ${error.message}`);
        }
    }
}

module.exports = EanPipelineService;
