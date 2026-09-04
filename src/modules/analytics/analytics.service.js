const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const BaseLinkerService = require('../offer-optimizer/baselinker.service');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { generateWithRetry } = require('../offer-optimizer/ai.service');

/**
 * 🛡️ Nexus Sentinel: God-Mode Analytics Service
 * Generuje twarde dowody matematyczne (True ROI, iROAS, Halo Effect) ucinające dyskusje na spotkaniach zarządu.
 */
class AnalyticsService {

    /**
     * Generuje pełen raport "God-Mode" dla wskazanego EAN/SKU.
     * Symuluje zaawansowane wyliczenia na bazie danych w PIM.
     * @param {string} sku - Opcjonalne SKU do analizy
     */
    static async generateGodModeReport(sku = null) {
        console.log(`[Sentinel Analytics] 🧠 Rozpoczynam dekonstrukcję ROI dla ${sku ? sku : 'całego portfela'}...`);

        // W rzeczywistości tutaj odpytywalibyśmy BaseLinker API o zamówienia z ostatnich 90 dni
        // oraz Allegro Ads API o koszty kliknięć. Na potrzeby Nexus Sentinel, analizujemy 
        // bieżący stan bazy PIM i tworzymy "Dowód Matematyczny" na bazie algorytmów.

        let product;
        if (sku) {
            // Użytkownik mógł wpisać SKU lub EAN
            product = await prisma.product.findFirst({ 
                where: { 
                    OR: [
                        { sku: sku },
                        { ean: sku }
                    ]
                } 
            });
        } else {
            // Jeśli nie podano SKU, bierzemy pierwszą aktywną Lokomotywę
            product = await prisma.product.findFirst({ 
                where: { salePrice: { gt: 0 } },
                orderBy: { stock: 'desc' }
            });
        }

        if (!product) {
            throw new Error('PIM_MISSING_DATA: Produkt nie istnieje w PIM. Uzupełnij asortyment, aby uzyskać analitykę.');
        }

        // Sprawdzenie jakości danych PIM
        const isPimIncomplete = (!product.basePrice || !product.packagingCost || parseFloat(product.basePrice) === 0);
        if (isPimIncomplete) {
            throw new Error('PIM_INCOMPLETE_DATA: Produkt posiada braki w kosztach (np. brak kosztu zakupu COGS, BDO, lub opakowania). Uzupełnij dane w module PIM, aby moduł Sentinel mógł wyliczyć True Net Margin.');
        }
        
        const finalDataSource = 'PIM_VERIFIED';

        // ==========================================
        // 1. Wodospad Prawdy (True Cost Waterfall)
        // ==========================================
        const salePrice = parseFloat(product.salePrice) || 89.99;
        const taxRate = parseFloat(product.taxRate) || 23;
        const netSalePrice = salePrice / (1 + (taxRate / 100)); // Przychód Netto
        
        const allegroFee = salePrice * 0.12; // Prowizja 12%
        const cogs = parseFloat(product.basePrice) || (salePrice * 0.3); // Cena zakupu
        const logistics = (parseFloat(product.packagingCost) || 1.5) + (parseFloat(product.bdoEprCost) || 0.5) + (parseFloat(product.outboundTransportCost) || 9.99);
        const adsCostPerUnit = 0; // BRAK DANYCH: Będzie integrowane z Allegro Ads API
        const returnRateCost = 0; // BRAK DANYCH: Wymaga integracji z modułem zwrotów

        const trueNetProfit = netSalePrice - allegroFee - cogs - logistics - adsCostPerUnit - returnRateCost;
        const trueNetMarginPct = (trueNetProfit / netSalePrice) * 100;

        const waterfall = [
            { name: 'Przychód Brutto', value: salePrice, fill: '#10b981' },
            { name: 'VAT', value: -(salePrice - netSalePrice), fill: '#f43f5e' },
            { name: 'Prowizja Allegro', value: -allegroFee, fill: '#f97316' },
            { name: 'Koszt Towaru (COGS)', value: -cogs, fill: '#8b5cf6' },
            { name: 'Logistyka & BDO', value: -logistics, fill: '#64748b' },
            { name: 'Koszty CPC (Ads)', value: -adsCostPerUnit, fill: '#eab308' },
            { name: 'Koszty Zwrotów', value: -returnRateCost, fill: '#ef4444' },
            { name: 'Twardy Zysk Netto', value: trueNetProfit, fill: trueNetProfit > 0 ? '#10b981' : '#dc2626' }
        ];

        // ==========================================
        // TWARDA ANALIZA: EFEKT HALO NA BAZIE PRAWDZIWYCH ZAMÓWIEŃ Z BASELINKERA
        // ==========================================
        console.log(`[Sentinel Analytics] 📡 Pobieram prawdziwe zamówienia z BaseLinker dla EAN/SKU: ${product.sku}...`);
        let realOrders = [];
        try {
            const blResponse = await BaseLinkerService.rawCall('getOrders', { get_unconfirmed_orders: true });
            realOrders = blResponse.orders || [];
        } catch (err) {
            console.error('[Sentinel Analytics] ❌ Błąd pobierania zamówień BL:', err.message);
        }

        let targetOccurrences = 0;
        let haloRevenue = 0;

        // Przeszukujemy ostatnie 100 zamówień
        realOrders.forEach(order => {
            const products = order.products || [];
            // Czy w zamówieniu jest nasz badany produkt (po SKU lub EAN)
            const hasTarget = products.some(p => p.sku === product.sku || p.ean === product.sku || p.ean === product.ean);
            
            if (hasTarget) {
                targetOccurrences++;
                // Liczymy przychód ze WSZYSTKICH INNYCH produktów w tym samym koszyku
                products.forEach(p => {
                    if (p.sku !== product.sku && p.ean !== product.sku && p.ean !== product.ean) {
                        haloRevenue += (parseFloat(p.price_brutto) || 0) * (parseInt(p.quantity) || 1);
                    }
                });
            }
        });

        // Jeśli produkt nie wystąpił, zyski są zerowe
        const clicks = targetOccurrences > 0 ? targetOccurrences : 1; 
        const directAdsProfit = trueNetProfit * targetOccurrences;
        
        // BRAK DANYCH: Oczekujemy na wdrożenie Data Warehouse by poznać dokładną marżę produktów w cross-sellu
        const haloAdsProfit = null; 
        const canCalculateHalo = false;

        const totalCampaignProfit = directAdsProfit;

        const totalAdSpend = targetOccurrences * adsCostPerUnit;
        const totalAdRevenue = targetOccurrences * salePrice;
        
        // Zamiast hasha liczymy realny stosunek przychodu bezpośredniego i z cross-selli
        const iROAS = totalAdSpend > 0 ? (((totalAdRevenue + haloRevenue) / totalAdSpend) * 100) : 0;

        // ==========================================
        // 3. Kanibalizacja Zestawów (Cannibalization Rate) - ZERO FAKE DATA
        // ==========================================
        // PRAWDA BIZNESOWA: Nexus nie ma jeszcze tabeli `SalesHistory` akumulującej codziennie wolumen.
        // Zwracamy NULL, by zakomunikować jasno w UI, że brakuje danych.
        const cannibalizationData = null;

        return {
            productDetails: {
                sku: product.sku,
                name: product.name,
                stock: product.stock,
                dataSource: finalDataSource
            },
            metrics: {
                trueNetMarginPct: trueNetMarginPct.toFixed(2),
                totalCampaignProfit: totalCampaignProfit.toFixed(2),
                haloProfit: null,
                canCalculateHalo: false,
                directProfit: directAdsProfit.toFixed(2),
                iRoas: targetOccurrences === 0 ? "BRAK DANYCH" : iROAS.toFixed(0),
                standardRoas: targetOccurrences === 0 ? "BRAK DANYCH" : ((totalAdRevenue / totalAdSpend) * 100).toFixed(0)
            },
            waterfall,
            cannibalizationData,
            // Dowody dla sceptyków oparte o twarde znaleziska
            nexusNarrative: {
                haloEffect: `Zysk Krzyżowy (Halo Effect) nie może zostać na chwilę obecną wyliczony. System odnotował wprawdzie sprzedaż innych produktów o wartości ${haloRevenue.toFixed(2)} PLN brutto, jednak bez podpięcia bazy Data Warehouse nie jest w stanie dokładnie oszacować marży netto z tych konkretnych koszyków. Estymacje stałe (np. 20%) zostały wyłączone w celu zachowania rygoru danych.`,
                iroas: targetOccurrences > 0
                    ? `Przychód brutto zebrany z zamówień to ${haloRevenue.toFixed(2)} PLN, jednak iROAS nie zostanie podany jako fakt, dopóki nie pobierzemy dokładnych kosztów kliknięć (API Allegro Ads) w miejsce symulacji.`
                    : `Brak wystąpień w ostatnich 100 zamówieniach BL. Konieczna akumulacja danych.`,
                cannibalization: `[BRAK DANYCH HISTORYCZNYCH] Aby obliczyć rzeczywisty proces kanibalizacji (wpływ sprzedaży Zestawów na spadek wolumenu Pojedynczej Oferty), Nexus wymaga integracji z dziennym rejestrem sprzedaży. Na tym etapie brak danych do wyliczenia tej metryki.`
            }
        };
    }

    /**
     * Odtworzona metoda Demand Forecast. Analizuje popyt opierając się na twardych metrykach.
     */
    static async generateDemandForecast(productId) {
        console.log(`[DemandForecast] 🧠 Inicjalizacja prognozy popytu dla produktu: ${productId}...`);
        
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: {
                dealsIRM: true,
                campaignsAsMain: true
            }
        });

        if (!product) {
            throw new Error(`Produkt ${productId} nie istnieje w bazie PIM.`);
        }

        const salePrice = parseFloat(product.salePrice) || 0;
        const cogs = parseFloat(product.basePrice) || 0;
        const logistics = (parseFloat(product.packagingCost) || 0) + (parseFloat(product.bdoEprCost) || 0) + (parseFloat(product.outboundTransportCost) || 0);
        const taxRate = parseFloat(product.taxRate) || 23;
        const netSalePrice = salePrice / (1 + (taxRate / 100));
        const trueCost = cogs + logistics + (salePrice * 0.12); // Prowizja 12%
        const profitNetto = netSalePrice - trueCost;
        const marginPercent = salePrice > 0 ? (profitNetto / netSalePrice) * 100 : 0;

        const recentSales90Days = product.ean ? await BaseLinkerService.getRecentSalesForEan(product.ean, 90) : 0;

        const contextUsed = {
            stock: product.stock,
            salePrice: salePrice,
            trueCost: trueCost.toFixed(2),
            profitNetto: profitNetto.toFixed(2),
            marginPercent: marginPercent.toFixed(2),
            dealsCount: product.dealsIRM ? product.dealsIRM.length : 0,
            campaignsCount: product.campaignsAsMain ? product.campaignsAsMain.length : 0,
            recentSales: Math.round(recentSales90Days / 3), // Średnia sprzedaż na 30 dni z ostatnich 90
            webGroundingActive: true
        };

        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-3.7-flash',
            tools: [{ googleSearch: {} }]
        });

        const prompt = `
Jesteś zaawansowanym algorytmem Demand Forecasting (Agentem Wywiadowczym) w systemie Nexus ERP. 
Twoim zadaniem jest oszacowanie popytu na produkt w ciągu najbliższych 30 dni na podstawie twardych danych historycznych z 90 dni, a także WYWIADU RYNKOWEGO.

Wykorzystaj zintegrowane narzędzie Google Search, aby zbadać:
1. Bieżące trendy dla tej kategorii produktów.
2. Wpływ zbliżających się świąt, pory roku i pogody na sprzedaż tego asortymentu.
3. Działania i ceny konkurencji.

Oto twarde dane o produkcie z systemu ERP:
Nazwa produktu: ${product.name}
${JSON.stringify(contextUsed, null, 2)}

Logika wyliczania rekomendacji (Safety Stock):
Rekomendowane domówienie (recommendedRestock) musi uwzględniać Zapas Bezpieczeństwa (Safety Stock). Jeśli przewidywana sprzedaż (predictedSales30Days) jest wyższa lub bliska obecnemu stanowi magazynowemu (stock), oblicz ile sztuk zabraknie i DODAJ do tej różnicy minimum 20% bufora (lub wartość dla bezpiecznych 14 dni sprzedaży), aby zapobiec "pustej półce" w przypadku nagłego skoku popytu. Jeśli obecny zapas w pełni pokrywa przewidywaną sprzedaż i zapas bezpieczeństwa, zwróć 0.

WYMOGI:
Musisz odpowiedzieć WYŁĄCZNIE poprawnym obiektem JSON i niczym więcej. 
Nie używaj znaczników markdown (np. \`\`\`json).

Wymagany format JSON:
{
  "predictedSales30Days": (int, przewidywana sprzedaż uwzględniająca wywiad rynkowy),
  "recommendedRestock": (int, wyliczone domówienie + bufor zapasu bezpieczeństwa),
  "revenueForecast": (int, przewidywany przychód w PLN),
  "confidenceScore": (int 0-100),
  "analyticalCommentary": (zwięzły komentarz wymieniający konkretne czynniki zewnętrzne jak pogoda/święta i krótko uzasadniający zastosowany bufor)
}`;

        try {
            const result = await generateWithRetry(model, prompt, 3, "Agent_Data_Analyst");
            let responseText = result.response.text().trim();
            // Solidny parser oczyszczający ewentualne formatowanie markdown
            responseText = responseText.replace(/^\`\`\`json\n?/, '').replace(/\n?\`\`\`$/, '');
            const parsed = JSON.parse(responseText);

            return {
                forecastData: parsed,
                contextUsed
            };
        } catch (error) {
            console.error('[DemandForecast] Błąd analizy Gemini:', error);
            throw new Error('Nie udało się wygenerować estymacji AI.');
        }
    }
}

module.exports = AnalyticsService;
