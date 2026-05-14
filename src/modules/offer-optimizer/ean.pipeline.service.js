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
                
                product = await prisma.product.upsert({
                    where: { ean },
                    create: { ean, name: deepData.name, brandId, baselinkerInventoryId: deepData.baselinkerInventoryId, baselinkerId: deepData.baselinkerId, descriptionHtml: deepData.descriptionHtml, images: deepData.images, isSynced: true },
                    update: { baselinkerInventoryId: deepData.baselinkerInventoryId, baselinkerId: deepData.baselinkerId, images: deepData.images, descriptionHtml: deepData.descriptionHtml, isSynced: true }
                });
            }

            // 2. Agent Badawczy (INCI Intelligence)
            console.log(`[EAN Pipeline] 2. Agent Badawczy (INCI Intelligence) - Temperatura 0.2`);
            const intelligenceData = await AiService.gatherProductIntelligence(ean, product.name);

            // FAZA 2: TRANSFORMACJA WIZUALNO-SPRZEDAŻOWA (AEO & Claid)
            // 3. Agent Audytor Wizualny (Vision AI)
            console.log(`[EAN Pipeline] 3. Agent Audytor Wizualny (Vision AI) - Regulamin Allegro`);
            let visualAudit = { images: (product.images || []).map(url => ({ originalUrl: url, isCompliant: true, alerts: [] })) };
            try {
                if (product.images && product.images.length > 0) {
                    visualAudit = await AiService.auditOfferImages(product.images[0], product.images.slice(1));
                }
            } catch (err) { console.error("[EAN Pipeline] Ostrzeżenie Vision AI:", err.message); }

            // 4. Generowanie AEO (Allegro Enrichment Optimizer)
            console.log(`[EAN Pipeline] 4. Agent AEO - Struktura Perplexity/SGE - Temperatura 0.4`);
            const aeoContent = await AiService.generateAEOContent(product.name, product.descriptionHtml, intelligenceData);

            // 5. Agent GEO Text (Sprzedażowy Copywriter)
            console.log(`[EAN Pipeline] 5. Agent GEO Text - Restrykcja 7 tagów HTML - Temperatura 0.6`);
            const geoResult = await AiService.generateGEOTextContent(product.name, aeoContent, intelligenceData);

            // 6. Agent Audytor Prawny (Compliance)
            console.log(`[EAN Pipeline] 6. Agent Audytor Prawny (WE 1223/2009) - Temperatura 0.0`);
            const fullHtml = Object.values(geoResult.htmlContent || {}).join("");
            const complianceReport = await AiService.generateComplianceReport(product.name, aeoContent, fullHtml);

            // 7. Optymalizacja Tytułu Aukcji (generateTitleOnly)
            console.log(`[EAN Pipeline] 7. Optymalizacja Tytułu (Google Trends, brak "HIT") - Temperatura 0.8`);
            const titleResult = await AiService.generateTitleOnly(aeoContent, product.name);

            // ZAKOŃCZENIE FAZY 2 - Tarcza Błędu: Weryfikacja Człowieka (HitL)
            console.log(`[EAN Pipeline] Zapisywanie rezultatu do Kopii Roboczej PIM (HitL)...`);
            const finalDraft = {
                title: titleResult.title,
                htmlContent: geoResult.htmlContent,
                complianceReport,
                images: visualAudit.images || []
            };

            await prisma.product.update({
                where: { ean },
                data: { offerDraft: finalDraft }
            });

            console.log(`[Ultimate EAN Pipeline] ZAKOŃCZONO POMYŚLNIE. Produkt oczekuje na zatwierdzenie w bazie PIM.`);
            return finalDraft;

        } catch (error) {
            console.error(`[Ultimate EAN Pipeline] KRYTYCZNY BŁĄD PRZEPŁYWU:`, error.message);
            throw new Error(`Pipeline upadł z powodu: ${error.message}`);
        }
    }
}

module.exports = EanPipelineService;
