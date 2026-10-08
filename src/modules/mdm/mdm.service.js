const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const pricingService = require('../pricing/pricing.service');
const baselinkerService = require('../offer-optimizer/baselinker.service');
const { exportLogger } = require('../../utils/logger');

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
    exportLogger.info(`[MDM SERVICE] 🌟 Złapano event: PRODUCT_CONTENT_OPTIMIZED dla EAN: ${ean}`);
    
    try {
        const hasAgentPayload = product.offerDraft && product.offerDraft.agentPayload;

        let inventoryId = product.baselinkerInventoryId;
        
        // Jeżeli produkt ma baselinkerId a w bazie brakuje mu baselinkerInventoryId
        // pozyskujemy go z BaseLinkera i uzupełniamy w PIM
        if (product.baselinkerId && !inventoryId) {
            exportLogger.info(`[MDM SERVICE] Brak baselinkerInventoryId dla EAN: ${ean}. Rozpoczynam poszukiwania w BaseLinkerze...`);
            inventoryId = await baselinkerService.resolveInventoryId(product.baselinkerId);
            
            if (inventoryId) {
                // Aktualizujemy PIM, aby zapamiętać odnaleziony katalog
                await prisma.product.update({
                    where: { id: product.id },
                    data: { baselinkerInventoryId: parseInt(inventoryId, 10) }
                });
                exportLogger.info(`[MDM SERVICE] Uzupełniono baselinkerInventoryId (${inventoryId}) w PIM dla EAN: ${ean}`);
            } else {
                exportLogger.warn(`[MDM SERVICE WARNING] Nie udało się odnaleźć produktu ${product.baselinkerId} w żadnym katalogu BaseLinker.`);
            }
        }
        
        // Fallback dla nowych produktów utworzonych z poziomu Agenta
        if (!inventoryId && hasAgentPayload && product.offerDraft.agentPayload.inventory_id) {
            inventoryId = product.offerDraft.agentPayload.inventory_id;
        }

        // --- HARD LOCK WDROŻONY ---
        // Zdarzenie PRODUCT_CONTENT_OPTIMIZED służy teraz wyłącznie jako sygnał o aktualizacji bazy PIM.
        // Fizyczny eksport do zewnętrznego systemu BaseLinker został w całości przeniesiony
        // do dedykowanego kontrolera zabezpieczonego kryptograficznym Tokenem Eksportu.
        exportLogger.info(`[MDM SERVICE] Zaktualizowano dane PIM dla EAN: ${ean}. Eksport zewnętrzny zablokowany - oczekuje na ręczne wyzwolenie z UI.`);

    } catch (err) {
         exportLogger.error(`[MDM SERVICE ERROR] Wystąpił błąd podczas obsługi zaktualizowanego produktu PIM:`, { error: err.message, stack: err.stack });
    }
}

// In-memory cache wymaganych parametrów kategorii Allegro dla DQS (TTL: 1h)
const categoryRequiredParamsCache = new Map();
const categoryInFlightPromises = new Map();
const CATEGORY_PARAMS_CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Pobiera i cache'uje minimalny zestaw wymaganych parametrów dla kategorii Allegro.
 * Zamiast ładować 140+ KB JSON-a parametrów przy każdym produkcie, pobiera tylko tablicę { id, name }.
 * Wykorzystuje In-Flight Promise Coalescing, eliminując efekt "Thundering Herd" przy starcie serwera.
 */
async function getRequiredParamsForCategory(categoryId) {
    if (!categoryId) return [];
    const cached = categoryRequiredParamsCache.get(categoryId);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CATEGORY_PARAMS_CACHE_TTL_MS)) {
        return cached.params;
    }

    if (categoryInFlightPromises.has(categoryId)) {
        return categoryInFlightPromises.get(categoryId);
    }

    const promise = (async () => {
        try {
            const cat = await prisma.marketplaceCategory.findUnique({
                where: { id: categoryId },
                select: { parameters: true }
            });
            
            let rawParams = [];
            if (Array.isArray(cat?.parameters)) {
                rawParams = cat.parameters;
            } else if (typeof cat?.parameters === 'string') {
                try { rawParams = JSON.parse(cat.parameters); } catch (_) { rawParams = []; }
            }

            const required = (Array.isArray(rawParams) ? rawParams : [])
                .filter(p => p && (p.required || (p.restrictions && p.restrictions.requiredForProduct)))
                .map(p => ({ id: p.id, name: p.name }));

            categoryRequiredParamsCache.set(categoryId, {
                params: required,
                timestamp: Date.now()
            });
            return required;
        } catch (err) {
            exportLogger.error(`[MDM SERVICE] Błąd podczas pobierania parametrów kategorii ${categoryId} do cache DQS:`, { error: err.message });
            return [];
        } finally {
            categoryInFlightPromises.delete(categoryId);
        }
    })();

    categoryInFlightPromises.set(categoryId, promise);
    return promise;
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
    
    const categoryId = product.allegroCategoryId || product.allegroCategory?.id;
    if (!categoryId) {
        missingChannel.push('Nie przypisano do kategorii docelowej Allegro (Brak weryfikacji)');
    } else {
        let requiredParams = [];
        if (Array.isArray(product.allegroCategory?.parameters)) {
            // Filtrujemy tylko te, które są wymagane (required: true lub requiredForProduct)
            requiredParams = product.allegroCategory.parameters
                .filter(p => p && (p.required || (p.restrictions && p.restrictions.requiredForProduct)));
        } else {
            // Bezpieczne pobranie ze zoptymalizowanego in-memory cache'a kategorii
            requiredParams = await getRequiredParamsForCategory(categoryId);
        }
        
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
