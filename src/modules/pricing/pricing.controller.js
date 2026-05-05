const pricingService = require('./pricing.service');

async function recalculateProductPrice(req, res) {
    try {
        const { id } = req.params;
        const updated = await pricingService.recalculateSalePrice(id);
        res.status(200).json({ success: true, data: updated });
    } catch (err) {
        console.error("Pricing Controller Error:", err.message);
        res.status(500).json({ error: err.message });
    }
}

async function recommendPrice(req, res) {
    try {
        const { id } = req.params;
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const product = await prisma.product.findUnique({ where: { id } });
        
        if (!product) return res.status(404).json({ error: 'Brak produktu' });

        const trueCost = product.basePrice + product.inboundTransportCost + product.packagingCost + product.bdoEprCost + product.outboundTransportCost + product.aiImageCost;
        
        // Dynamic Pricing Risk Alert logic
        const targetMargin = product.targetMargin || 0.20;
        const recommendedSalePrice = trueCost / (1 - targetMargin);
        
        const riskLevel = product.salePrice < recommendedSalePrice * 0.9 ? 'HIGH' : (product.salePrice < recommendedSalePrice ? 'MEDIUM' : 'LOW');
        
        res.status(200).json({ 
            success: true, 
            recommendation: {
                trueCost,
                recommendedSalePrice,
                currentSalePrice: product.salePrice,
                riskLevel,
                message: riskLevel === 'HIGH' ? 'KRYTYCZNE: Cena sprzedaży poniżej bezpiecznej marży!' : 'Cena jest bezpieczna.'
            } 
        });
    } catch (err) {
        console.error("Pricing Controller Error:", err.message);
        res.status(500).json({ error: err.message });
    }
}

async function recalculateAll(req, res) {
    try {
        const count = await pricingService.recalculateAllPrices();
        res.status(200).json({ success: true, updatedCount: count });
    } catch (err) {
        console.error("Pricing Controller Error:", err.message);
        res.status(500).json({ error: err.message });
    }
}

module.exports = {
    recalculateProductPrice,
    recalculateAll,
    recommendPrice
};
