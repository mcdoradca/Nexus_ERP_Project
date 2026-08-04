const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const pricingService = require('../pricing/pricing.service');
const baselinkerService = require('../offer-optimizer/baselinker.service');

/**
 * Serwis Master Data Management (MDM).
 * Pełni rolę Centralnego Mózgu. Przyjmuje ustrukturyzowane eventy i dystrybuuje je
 * po odpowiednich systemach domeny.
 */

async function handleProductCostUpdated(payload) {
    const { product, source } = payload;
    console.log(`[MDM SERVICE] Odebrano aktualizację kosztów z ${source} dla EAN: ${product.ean}`);

    try {

        // Aktualizujemy AlgoPricing
        console.log(`[MDM SERVICE] Zlecam przeliczenie AlgoPricing dla produktu ID: ${product.id}`);
        await pricingService.recalculateSalePrice(product.id);
        
        console.log(`[MDM SERVICE] Propagacja zakończona sukcesem dla EAN: ${product.ean}`);
    } catch (err) {
        console.error(`[MDM SERVICE ERROR] Błąd podczas obsługi PRODUCT_COST_UPDATED:`, err.message);
    }
}

async function handleProductDataUpdated(payload) {
    const { product, source } = payload;
    console.log(`[MDM SERVICE] Aktualizacja danych produktu z ${source} dla EAN: ${product.ean}`);
    
    // Zabezpieczenie przed pętlą: jeśli event przyszedł z samego MDM/AlgoPricing, ignorujemy
    if (source === 'ALGO_PRICING_AUTO') return;

    try {
        // Usunięto wywołanie AlgoPricing z potoku EAN Pipeline (PIM) zgodnie z żądaniem.
        // Ceny będą zarządzane wyłącznie z poziomu BaseLinkera.
    } catch (err) {
        console.error(`[MDM SERVICE ERROR] Błąd podczas obsługi PRODUCT_DATA_UPDATED:`, err.message);
    }
}

async function handleDealMarketingCostUpdated(payload) {
    const { deal, source } = payload;
    console.log(`[MDM SERVICE] Przyszły event MARKETING_COST z ${source}. Deal ID: ${deal.id}`);

    try {
        if (deal.productId) {
            console.log(`[MDM SERVICE] Aktualizacja Dealów wpływa na marketing ROI. Zlecam rekalkulację AlgoPricing dla Produktu ID: ${deal.productId}`);
            await pricingService.recalculateSalePrice(deal.productId);
        }
    } catch (err) {
        console.error(`[MDM SERVICE ERROR] Błąd podczas obsługi DEAL_MARKETING_COST_UPDATED:`, err.message);
    }
}

async function handleProductContentOptimized(payload) {
    const { ean, product } = payload;
    console.log(`[MDM SERVICE] 🌟 Złapano event: PRODUCT_CONTENT_OPTIMIZED dla EAN: ${ean}`);
    
    try {
        const hasAgentPayload = product.offerDraft && product.offerDraft.agentPayload;

        // Wypychamy najlepszą jakość danych na zewnątrz (BaseLinker)
        if ((product.baselinkerInventoryId && product.baselinkerId) || hasAgentPayload) {
            console.log(`[MDM SERVICE] Uruchamiam BaseLinkerService aby zaktualizować dane w zewnętrznym systemie...`);
            
            if (product.offerDraft && typeof product.offerDraft === 'object') {
                // Jeśli mamy bogatego drafta (w tym SSOT agentPayload lub 6 sekcji htmlContent i features)
                // wysyłamy go pełnym obiektem do exportOfferToBaselinker, by zmapowało do extra_fields
                await baselinkerService.exportOfferToBaselinker(
                    product.baselinkerInventoryId || (hasAgentPayload ? product.offerDraft.agentPayload.inventory_id : null),
                    product.baselinkerId || (hasAgentPayload ? product.offerDraft.agentPayload.product_id : ""),
                    product.offerDraft
                );
            } else {
                // Fallback do prostego update'u z konkatenacją (wymaga ID)
                if (product.baselinkerInventoryId && product.baselinkerId) {
                    await baselinkerService.updateProductDescriptionAndTitle(
                        product.baselinkerInventoryId,
                        product.baselinkerId,
                        product.name,
                        product.descriptionHtml
                    );
                }
            }
            
            console.log(`[MDM SERVICE] ✅ Zewnętrzny BaseLinker został zaktualizowany! Źródło prawdy zachowane.`);
        }
    } catch (err) {
         console.error(`[MDM SERVICE ERROR] Nie udało się wypchnąć nowej prawdy o produkcie do zewnętrznych systemów:`, err.message);
    }
}

/**
 * Algorytm obliczający Data Quality Score (PXM Readiness) dla produktu.
 * Weryfikuje Filar 1 (PIM Core) oraz Filar 2 (Zależny od kanału - Allegro).
 */
async function calculateProductDQS(product) {
    let coreScore = 0;
    const missingCore = [];
    
    // FILAR 1: Core PIM (Max 60%)
    if (product.ean && product.sku) {
        coreScore += 15;
    } else {
        missingCore.push('Brak EAN lub SKU');
    }

    if (product.name && product.descriptionHtml && product.descriptionHtml.length > 50) {
        coreScore += 15;
    } else {
        missingCore.push('Brak odpowiednio długiego opisu HTML lub Nazwy');
    }

    if (product.imageUrl) {
        coreScore += 10;
    } else {
        missingCore.push('Brak zdjęcia głównego');
    }

    if (product.basePrice && product.basePrice > 0) {
        coreScore += 10;
    } else {
        missingCore.push('Brak kosztów bazowych (Unit Economics)');
    }

    if (product.bomElements && product.bomElements.length > 0) {
        coreScore += 10;
    } else {
        missingCore.push('Brak zadeklarowanego drzewa BOM (EPR/BDO)');
    }

    // FILAR 2: Wymogi Kanałowe - Allegro (Max 40%)
    let channelScore = 0;
    const missingChannel = [];
    
    if (!product.allegroCategoryId || !product.allegroCategory) {
        missingChannel.push('Nie przypisano do kategorii docelowej Allegro (Brak weryfikacji)');
    } else {
        const schemaParams = product.allegroCategory.parameters;
        // Filtrujemy tylko te, które są wymagane (required: true) 
        // UWAGA: Allegro oznacza wymagane pola we flagach, nie zawsze jako proste 'required: true'. Czasem jest 'requiredForProduct'.
        // Upraszczamy logikę dla wdrożenia w oparciu o obiekt z API Allegro
        const requiredParams = schemaParams.filter(p => p.required || (p.restrictions && p.restrictions.requiredForProduct));
        
        if (requiredParams.length === 0) {
            // Brak specjalnych wymagań poza domyślnymi
            channelScore = 40;
        } else {
            let fulfilled = 0;
            const features = product.features || {}; // Zakładamy słownik klucz: wartość
            
            requiredParams.forEach(param => {
                // Szukamy w naszym PIM po nazwie parametru (np. "Marka", "Pojemność") lub po jego ID
                // W docelowym UI kluczem w features powinno być id parametru z Allegro, lub jego zmapowana nazwa.
                const hasParam = features[param.id] || features[param.name];
                if (hasParam) {
                    fulfilled += 1;
                } else {
                    missingChannel.push(`Wymagane z Allegro: ${param.name}`);
                }
            });
            
            channelScore = Math.round((fulfilled / requiredParams.length) * 40);
        }
    }

    return {
        totalScore: coreScore + channelScore,
        coreScore,
        channelScore,
        missingCore,
        missingChannel,
        isSyndicationReady: (coreScore + channelScore) === 100
    };
}

module.exports = {
    handleProductCostUpdated,
    handleProductDataUpdated,
    handleDealMarketingCostUpdated,
    handleProductContentOptimized,
    calculateProductDQS
};
