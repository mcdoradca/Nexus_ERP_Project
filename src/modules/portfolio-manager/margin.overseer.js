const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EventBus = require('../../core/EventBus');

/**
 * 🛡️ Margin Overseer (Strażnik Marży)
 * Cel: Niezależny matematyczny audytor, który weryfikuje twarde Unit Economics.
 * Jeśli zysk netto na produkcie = STRATA, natychmiastowo wstrzymuje ofertę, odcinając kroplówkę budżetu.
 */
class MarginOverseer {
    
    /**
     * Główny proces audytu rentowności
     */
    static async enforceMarginDiscipline() {
        console.log('⚔️ [Margin Overseer] Inicjacja twardego audytu Unit Economics...');
        
        let frozenCount = 0;
        
        // Pobieramy wszystkie aktywne produkty
        const products = await prisma.product.findMany({
            where: { 
                status: { notIn: ['Wstrzymany (Strata)', 'Zablokowany - Błąd Danych'] } 
            }
        });

        for (const prod of products) {
            // Bezpieczeństwo: Jeśli produkt nie ma ceny, pomijamy (to szkic)
            if (!prod.salePrice || prod.salePrice <= 0) continue;

            const netProfit = this._calculateTrueNetProfit(prod);

            if (netProfit < 0) {
                frozenCount++;
                console.error(`🚨 [Margin Overseer] UWAGA! Produkt ${prod.sku} generuje STRATĘ: ${netProfit.toFixed(2)} PLN na każdej sztuce! ZAMRAŻAM.`);
                
                const updated = await prisma.product.update({
                    where: { id: prod.id },
                    data: {
                        status: 'Wstrzymany (Strata)',
                        // Dokumentujemy stratę w notatkach
                        descriptionHtml: `<div style="background:#000; color:#fff; padding:15px; border-left:5px solid red;"><b>ZAMROŻENIE BIZNESOWE:</b> Produkt wstrzymany przez Margin Overseer. Matematyczna strata: ${netProfit.toFixed(2)} PLN na transakcji.</div>` + (prod.descriptionHtml || '')
                    }
                });

                EventBus.publish('PRODUCT_DATA_UPDATED', { product: updated, source: 'MARGIN_OVERSEER' });
                EventBus.publish('SYSTEM_ALERT', { level: 'CRITICAL', message: `Zamrożono produkt ${prod.sku}. Ujemna marża: ${netProfit.toFixed(2)} PLN.` });
            }
        }

        console.log(`✅ [Margin Overseer] Audyt zakończony. Skontrolowano: ${products.length} SKU. Odcięto kroplówkę dla: ${frozenCount} SKU.`);
        return { checked: products.length, frozen: frozenCount };
    }

    /**
     * Bezlitosna matematyka Unit Economics (True Cost Analysis)
     */
    static _calculateTrueNetProfit(product) {
        const salePrice = parseFloat(product.salePrice) || 0;
        const cogs = parseFloat(product.basePrice) || 0;
        const inbound = parseFloat(product.inboundTransportCost) || 0;
        const outbound = parseFloat(product.outboundTransportCost) || 0;
        const packaging = parseFloat(product.packagingCost) || 0;
        const bdo = parseFloat(product.bdoEprCost) || 0;
        const aiCost = parseFloat(product.aiImageCost) || 0;
        
        // Prowizja Allegro (szacunkowo 12% od ceny detalicznej)
        const allegroFee = salePrice * 0.12;
        
        // VAT (obliczany z ceny brutto)
        const taxRate = parseFloat(product.taxRate) || 23;
        const netSalePrice = salePrice / (1 + (taxRate / 100));

        // Twardy Zysk Netto na Czysto
        const totalCosts = cogs + inbound + outbound + packaging + bdo + aiCost + allegroFee;
        const netProfit = netSalePrice - totalCosts;

        return parseFloat(netProfit.toFixed(2));
    }
}

module.exports = MarginOverseer;
