const prisma = require('../../core/prisma');

/**
 * Usługa Unit Economics dla Allegro
 * Wylicza Rzeczywiste ROI (True Profitability) oraz Maksymalne Dopuszczalne CPA
 * (Zasada: Ignorujemy ROAS, liczymy tylko Zysk Netto).
 */

class AllegroEconomicsService {
    
    /**
     * Główny kalkulator zysku netto dla pojedynczej sztuki produktu.
     * Uwzględnia wszystkie ukryte koszty operacyjne i prowizyjne Allegro.
     */
    async calculateUnitEconomics(productId, options = {}) {
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: { allegroCategory: true }
        });

        if (!product) throw new Error("Nie znaleziono produktu w PIM.");
        if (!product.basePrice || !product.salePrice) throw new Error("Brakujące dane finansowe (COGS/SalePrice).");

        // 1. Przychód
        const grossRevenue = product.salePrice; // Cena brutto
        // Założenie VAT 23% dla uproszczenia (docelowo z product.taxRate)
        const taxRate = product.taxRate || 0.23;
        const netRevenue = grossRevenue / (1 + taxRate); 

        // 2. Koszty Bezpośrednie (COGS + Logistyka Własna)
        const cogs = product.basePrice; // Cena zakupu (netto)
        const logisticsInternal = (product.inboundTransportCost || 0) + (product.packagingCost || 0) + (product.outboundTransportCost || 0);
        const bdoEpr = product.bdoEprCost || 0;

        // 3. Koszty Ukryte Allegro (Symulacja na podstawie twardych reguł)
        // A. Prowizja Podstawowa (szacunkowo 10% jeśli brak ścisłej definicji z API)
        const categoryCommissionRate = product.allegroCategory?.commissionRate || 0.10; 
        const basicCommission = grossRevenue * categoryCommissionRate; 

        // B. Koszty Programu Smart! 
        // Od 2025 r. system pobiera opłatę od sprzedawcy. Szacujemy średnio 3.99 PLN do 6.99 PLN dla standardowych paczek.
        // Jeśli sprzedajemy za > 45 zł, dopłacamy do paczki.
        let smartContributionFee = 0;
        if (options.isSmart && grossRevenue >= 45) {
            smartContributionFee = 4.99; // Średnia rynkowa dopłata sprzedawcy dla InPost w 2025.
        }

        // C. Smart! Monety
        const coinsIssued = options.coinsIssued || 0;
        const coinsCost = coinsIssued * 1.23; // 1 moneta kosztuje sprzedawcę 1.23 PLN brutto

        // D. Strefa Okazji (Daily fee + dodatkowa prowizja)
        let zoneFee = 0;
        if (options.inDealZone) {
            zoneFee = (grossRevenue * 0.03) + 1.90; // Przykład: 3% + stała opłata dzienna per sprzedaż
        }

        // --- SUMA KOSZTÓW ---
        const totalHiddenCosts = basicCommission + smartContributionFee + coinsCost + zoneFee;
        const totalDirectCosts = cogs + logisticsInternal + bdoEpr;

        // --- ZYSK NETTO BEZ REKLAM (Organic Net Profit) ---
        const organicNetProfit = netRevenue - totalDirectCosts - (totalHiddenCosts / (1 + taxRate)); 
        
        // --- DOCELOWA RENTOWNOŚĆ (Target Margin) ---
        const targetMarginPct = product.targetMargin || 0.15; // Domyślnie 15% marży netto
        const requiredProfit = netRevenue * targetMarginPct;

        // --- MAKSYMALNE CPA (Cost Per Action) ---
        // Ile możemy maksymalnie wydać na zdobycie tego klienta z Adsów, by nadal utrzymać Target Margin?
        const maxCpaNet = organicNetProfit - requiredProfit;

        return {
            productName: product.name,
            netRevenue: parseFloat(netRevenue.toFixed(2)),
            costs: {
                cogs: parseFloat(cogs.toFixed(2)),
                logistics: parseFloat(logisticsInternal.toFixed(2)),
                allegroCommissions: parseFloat(totalHiddenCosts.toFixed(2))
            },
            organicNetProfit: parseFloat(organicNetProfit.toFixed(2)),
            targetMarginPct: targetMarginPct,
            requiredProfit: parseFloat(requiredProfit.toFixed(2)),
            maxCpaNet: parseFloat(maxCpaNet.toFixed(2)),
            isProfitableWithoutAds: organicNetProfit > 0,
            canAffordAds: maxCpaNet > 0 
        };
    }

    /**
     * Weryfikacja w locie, czy obecna kampania nadal ma sens.
     * Sprawdza, czy bieżący koszt pozyskania (Current CPA z API Allegro Ads) 
     * nie przekracza dopuszczalnego Max CPA obliczonego przez Unit Economics.
     */
    async validateAdProfitability(productId, currentCpaNet, options = {}) {
        const economics = await this.calculateUnitEconomics(productId, options);
        
        // Jeśli nasz rzeczywisty koszt kliknięć prowadzących do zakupu (CPA) 
        // jest wyższy niż max dopuszczalny, tracimy pieniądze w stosunku do celu marżowego.
        const isBleeding = currentCpaNet > economics.maxCpaNet;
        
        // Realne ROI z uwzględnieniem obecnego CPA
        const actualNetProfit = economics.organicNetProfit - currentCpaNet;
        const actualRoi = (actualNetProfit / (economics.costs.cogs + currentCpaNet)) * 100;

        return {
            economics,
            currentCpaNet,
            isBleeding, // True = Należy natychmiast wyłączyć lub obniżyć CPC (Kill Switch)
            actualNetProfit: parseFloat(actualNetProfit.toFixed(2)),
            actualRoiPct: parseFloat(actualRoi.toFixed(2))
        };
    }
}

module.exports = new AllegroEconomicsService();
