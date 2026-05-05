const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const BaseLinkerService = require('../offer-optimizer/baselinker.service');

// Stała prowizji Allegro (można docelowo przenieść do bazy)
const DEFAULT_PLATFORM_COMMISSION = 0.12; // 12% 

async function getTargetMargin() {
    try {
        const setting = await prisma.systemSetting.findUnique({
            where: { key: 'TARGET_MARGIN_PERCENT' }
        });
        if (setting && setting.value) {
            return parseFloat(setting.value) / 100;
        }
        return 0.20; // 20% domyślna marża
    } catch (err) {
        return 0.20;
    }
}

async function recalculateSalePrice(productId) {
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new Error("Produkt nie istnieje");

    // 1. Wyliczenie kosztu prawdziwego (True Cost)
    const trueCost = (product.basePrice || 0) 
                   + (product.inboundTransportCost || 0) 
                   + (product.packagingCost || 0) 
                   + (product.bdoEprCost || 0) 
                   + (product.outboundTransportCost || 0)
                   + (product.aiImageCost || 0);

    // 2. Dynamiczne Reguły Cenowe (Dynamic Pricing Protection)
    // Jeśli zapas wyczerpie się w mniej niż 7 dni na podstawie sprzedaży z ostatnich 30 dni, zwiększamy marżę
    let targetMargin = product.targetMargin || 0.20;
    let pricingAlert = null;

    try {
        const recentSales = await BaseLinkerService.getRecentSalesForEan(product.ean, 30);
        if (recentSales > 0 && product.stock > 0) {
            const dailySalesVelocity = recentSales / 30;
            const daysOfStockCovered = product.stock / dailySalesVelocity;

            if (daysOfStockCovered < 7) {
                const protectiveBoost = 0.15; // Zwiększamy marżę o 15 punktów procentowych jako blokada
                targetMargin += protectiveBoost;
                pricingAlert = `Zapas wystarczy tylko na ok. ${daysOfStockCovered.toFixed(1)} dni! Automatycznie zastosowano cenę zaporową (marża +15%), aby spowolnić wyprzedaż do zera.`;
                console.log(`[AlgoPricing] OCHRONA ZAPASÓW AKTYWNA: ${product.ean}. ${pricingAlert}`);
            } else if (daysOfStockCovered > 90) {
                // Opcjonalnie: Zbyt duży zapas - sugestia obniżenia ceny? Na razie tylko ostrzegamy
                pricingAlert = `Zapas zalega (starczy na ${daysOfStockCovered.toFixed(0)} dni). Rozważ ręczne obniżenie marży, by napędzić popyt.`;
            }
        }
    } catch (err) {
        console.warn(`[AlgoPricing] Nie udało się pobrać velocity z BL dla ${product.ean}, pomijam reguły dynamiczne.`);
    }
    
    // Wzór na cenę BRUTTO uwzględniający VAT (prowizja od BRUTTO, koszty i marża od NETTO):
    // SalePrice = TrueCost / [ (1 - TargetMargin) / (1 + VAT) - PlatformCommission ]
    const vatRate = (product.taxRate || 23) / 100;
    const denominator = ((1 - targetMargin) / (1 + vatRate)) - DEFAULT_PLATFORM_COMMISSION;
    
    if (denominator <= 0) {
        throw new Error("Marża docelowa, prowizja i podatek VAT przekraczają próg rentowności. Obniż marżę.");
    }

    const calculatedSalePrice = trueCost / denominator;
    
    // Zaokrąglenie do 2 miejsc po przecinku:
    const finalPrice = Math.ceil(calculatedSalePrice * 100) / 100;

    // 3. Aktualizacja bazy (zapisujemy jako propozycję, nie nadpisujemy obecnej ceny)
    const updated = await prisma.product.update({
        where: { id: productId },
        data: { proposedSalePrice: finalPrice }
    });

    console.log(`[AlgoPricing] Przeliczono nową proponowaną cenę dla EAN ${updated.ean}. TrueCost: ${trueCost} PLN, ProposedSalePrice: ${finalPrice} PLN`);
    
    return { ...updated, pricingAlert, dynamicMarginUsed: targetMargin };
}

// Funkcja masowa (np. wywoływana przez CRON w razie zmiany globalnej marży)
async function recalculateAllPrices() {
    const products = await prisma.product.findMany();
    let updatedCount = 0;
    
    for (const p of products) {
        try {
            await recalculateSalePrice(p.id);
            updatedCount++;
        } catch (e) {
            console.error(`Błąd przeliczania ceny dla ${p.ean}:`, e.message);
        }
    }
    return updatedCount;
}

module.exports = {
    recalculateSalePrice,
    recalculateAllPrices,
    getTargetMargin
};
