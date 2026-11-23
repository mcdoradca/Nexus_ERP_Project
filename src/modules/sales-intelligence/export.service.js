const XLSX = require('xlsx');
const { round2 } = require('./utils/currency.helpers');

function fmtOptional(val, decimals = 2) {
    if (val === null || val === undefined || !Number.isFinite(Number(val))) return 'Brak danych';
    return Number(Number(val).toFixed(decimals));
}

function safeSheetColumns(rows = [], widths = []) {
    return widths.map((w, idx) => ({ wch: w || 18 }));
}

function buildCsvCell(val) {
    const str = val === null || val === undefined ? '' : String(val);
    if (/[;"\n\r]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Buduje 8-zakładkowy skoroszyt .XLSX dla Zarządu i Zespołu Operacyjnego.
 * Zachowuje jednolity próg braku w ofercie (stock <= stockoutThreshold = BRAK W OFERCIE, ZERO podziału 0 vs 1-2).
 */
function buildExecutiveXlsxBuffer(analysis = {}) {
    const wb = XLSX.utils.book_new();
    const meta = analysis.meta || {};
    const kpis = analysis.kpis || {};
    const threshold = Number.isFinite(Number(meta.stockoutThreshold)) ? Number(meta.stockoutThreshold) : 2;
    const smartThreshold = Number(meta.smartThresholdPln || 49.90);

    // 1. Podsumowanie Zarzadcze
    const summaryRows = [
        ['RAPORT ZARZĄDCZY — NEXUS SALES INTELLIGENCE COMMAND CENTER', ''],
        ['Platforma analizy', String(meta.platform || 'ALL')],
        ['Rynek / Waluta', String(meta.marketFilter || 'ALL')],
        ['Zakres analizy (dni)', Number(meta.spanDays || 0)],
        ['Jednolity próg wyłączenia ofert (BRAK W OFERCIE)', `Stan ≤ ${threshold} szt.`],
        ['Próg Allegro Smart!', `${smartThreshold.toFixed(2)} PLN (martwa strefa od ${Number(meta.smartDeadZoneMin || 34).toFixed(2)} PLN)`],
        ['Pokrycie COGS w PIM (%)', `${Number(meta.cogsCoveragePct || 0).toFixed(2)}%`],
        ['', ''],
        ['KLUCZOWE WSKAŹNIKI (KPI)', 'WARTOŚĆ'],
        ['Obrót Brutto (GMV) [PLN]', round2(kpis.totalGmvPln || 0)],
        ['Pełny Potencjał GMV [PLN]', round2(kpis.fullPotentialGmvPln || 0)],
        ['Realizacja Potencjału [%]', round2(kpis.potentialRealizedPct || 0)],
        ['Liczba zamówień (zdeduplikowane)', Number(kpis.totalOrders || 0)],
        ['Sprzedane sztuki łącznie', Number(kpis.totalUnits || 0)],
        ['Koszyki wieloprzedmiotowe (2+) [%]', round2(kpis.multiOrdersSharePct || 0)],
        ['Średni koszyk 2+ [PLN]', round2(kpis.avgBasketMultiPln || 0)],
        ['Średni koszyk Solo [PLN]', round2(kpis.avgBasketSoloPln || 0)],
        ['Wygenerowany Cross-Sell [PLN]', round2(kpis.crossSellTotalPln || 0)],
        ['', ''],
        [`STRATY PRZEZ BRAKI W OFERCIE (STAN ≤ ${threshold} SZT.)`, 'PLN'],
        ['1) Strata bezpośrednia (niezrealizowana sprzedaż) [PLN]', round2(kpis.totalLostDirectPln || 0)],
        ['2) Utracony Cross-Sell (brakujące koszyki 2+) [PLN]', round2(kpis.totalLostCrossSellPln || 0)],
        ['3) Kara Trafności po powrocie (utrata rankingu 14d) [PLN]', round2(kpis.totalLostRelevancePln || 0)],
        ['Łączny Utracony GMV [PLN]', round2(kpis.totalLostGmvPln || 0)],
        ['Łączny Utracony Zysk Netto (dla SKU z COGS) [PLN]', round2(kpis.totalLostNetProfitPln || 0)],
        [`Liczba SKU obecnie niedostępnych (stan ≤ ${threshold} szt.)`, Number(kpis.unavailableNowCount || 0)],
        ['Łączna liczba dni braku w ofercie', Number(kpis.totalStockoutDays || 0)],
        ['Sugerowany Budżet Zatowarowania ROP [PLN]', round2(kpis.recommendedPurchaseBudgetPln || 0)],
        ['', ''],
        ['EKONOMIA NETTO I REKLAMY (WYŁĄCZNIE ZWERYFIKOWANE COGS)', 'WARTOŚĆ'],
        ['Zweryfikowany Zysk Netto [PLN]', round2(kpis.verifiedNetProfitPln || 0)],
        ['Zweryfikowana Marża Netto [%]', fmtOptional(kpis.verifiedNetMarginPct, 2)],
        ['Efektywne wydatki Ads (Netto) [PLN]', round2(kpis.effectiveAdsSpendPln || 0)],
        ['Przychód z Ads [PLN]', round2(kpis.adsRevenuePln || 0)],
        ['ROAS', fmtOptional(kpis.roas, 2)],
        ['POAS (Zwrot z zysku na Ads)', fmtOptional(kpis.poas, 2)],
        ['TACOS [%]', fmtOptional(kpis.tacosPct, 2)],
        ['GMROI (Zwrot na kapitale magazynowym)', fmtOptional(kpis.gmroi, 2)],
        ['Krwawiące oferty (wyróżnienie/Ads bez zysku lub przy braku)', Number(kpis.bleedingOffersCount || 0)],
        ['Leżaki magazynowe (szt. pozycji)', Number(kpis.deadStockCount || 0)],
        ['Zamrożony kapitał w leżakach [PLN]', round2(kpis.deadStockFrozenPln || 0)],
        ['Luki Cross-Channel Allegro ↔ InPost Von Halsky', Number(kpis.crossChannelGapsCount || 0)],
        ['', ''],
        ['RACHUNEK P&L WATERFALL', 'PLN'],
        ...(analysis.pnlWaterfall || []).map(row => [row.name, round2(row.value || 0)]),
        ['', ''],
        ['PODZIAŁ RYNKÓW I WALUT', 'ZAMÓWIENIA / GMV [PLN]'],
        ...(analysis.marketBreakdown || []).map(m => [`${m.label} (${m.code})`, `${m.orders} zam. | ${round2(m.plnSum)} PLN (${round2(m.rawSum)} ${m.code})`]),
        ['', ''],
        ['PODZIAŁ KANAŁÓW SPRZEDAŻY', 'ZAMÓWIENIA / SZT. / GMV [PLN]'],
        ...(analysis.channelBreakdown || []).map(c => [c.channel, `${c.orders} zam. | ${c.units} szt. | ${round2(c.gmvPln)} PLN`])
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows);
    ws1['!cols'] = safeSheetColumns(summaryRows, [54, 42]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Podsumowanie Zarzadcze');

    // 2. Zatowarowanie ROP
    const ropSorted = [...(analysis.skus || [])]
        .filter(s => s.recommendedOrderQty > 0 || s.isCurrentlyUnavailable || s.totalLostGmvPln > 0)
        .sort((a, b) => {
            if (a.isCurrentlyUnavailable !== b.isCurrentlyUnavailable) return a.isCurrentlyUnavailable ? -1 : 1;
            if ((b.recommendedOrderQty > 0) !== (a.recommendedOrderQty > 0)) return b.recommendedOrderQty > 0 ? 1 : -1;
            return (b.totalLostGmvPln || 0) - (a.totalLostGmvPln || 0);
        });
    const ropHeader = [
        'SKU', 'EAN', 'Nazwa produktu', 'Rola koszykowa', 'ABC-XYZ',
        `Status dostępności (próg ≤ ${threshold})`, 'Stan fizyczny (szt.)',
        'Zapas sprzedażowy (szt.)', 'Otwarte PO w drodze (szt.)',
        'Tempo dzienne aktywne (szt./d)', 'Dni zapasu (DOI)',
        'Zalecane ROP (szt.)', 'Sugerowane domówienie (szt.)',
        'Cena zakupu COGS [PLN]', 'Budżet zakupu [PLN]', 'Łączne straty przez braki [PLN]'
    ];
    const ropRows = [
        ropHeader,
        ...ropSorted.map(s => [
            s.sku || '',
            s.ean || '',
            s.name || '',
            s.role || 'SOLO',
            s.abcXyz || 'CZ',
            s.isCurrentlyUnavailable ? `BRAK W OFERCIE (≤ ${threshold} szt.)` : 'AKTYWNE',
            s.currentStock ?? 'Brak danych',
            s.sellableStock ?? 'Brak danych',
            s.openPoQty || 0,
            round2(s.dailyVelocityWhenActive || 0),
            s.daysOfInventory ?? 'Brak danych',
            s.recommendedRop || 0,
            s.recommendedOrderQty || 0,
            s.cogsPerUnit ?? 'Brak w PIM',
            s.purchaseBudgetPln ?? 'Brak COGS',
            round2(s.totalLostGmvPln || 0)
        ])
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(ropRows);
    ws2['!cols'] = safeSheetColumns(ropRows, [18, 16, 40, 14, 10, 26, 16, 18, 18, 18, 14, 16, 18, 18, 18, 22]);
    XLSX.utils.book_append_sheet(wb, ws2, 'Zatowarowanie ROP');

    // 3. Pelny Wykaz SKU (100%) z wierszem sumy kontrolnej
    const allSkus = analysis.skus || [];
    const skuHeader = [
        'SKU', 'EAN', 'Nazwa', 'Rola', 'ABC-XYZ',
        'Stan', 'Zapas sprzedażowy', 'Status oferty',
        'Sztuki sprzedane', 'Zamówienia', 'Koszyki 2+',
        'Śr. cena [PLN]', 'Obrót GMV [PLN]', 'Cross-Sell [PLN]',
        'COGS/szt [PLN]', 'Zysk Netto [PLN]', 'Marża Netto [%]',
        `Dni braku (≤ ${threshold} szt.)`, 'Strata bezp. [PLN]', 'Utracony Cross-Sell [PLN]',
        'Kara trafności [PLN]', 'Utracony GMV razem [PLN]', 'Utracony zysk netto [PLN]',
        'Domówienie ROP [szt.]', 'Budżet zakupu [PLN]', 'Kanały sprzedaży'
    ];
    let sumUnits = 0; let sumOrders = 0; let sumMulti = 0;
    let sumRev = 0; let sumCross = 0; let sumNetProfit = 0;
    let sumStockoutDays = 0; let sumLostDir = 0; let sumLostCross = 0;
    let sumLostRel = 0; let sumLostAll = 0; let sumLostNet = 0;
    let sumOrderQty = 0; let sumBudget = 0;

    const skuDataRows = allSkus.map(s => {
        sumUnits += Number(s.totalUnits || 0);
        sumOrders += Number(s.ordersCount || 0);
        sumMulti += Number(s.multiOrdersCount || 0);
        sumRev += Number(s.totalRevenuePln || 0);
        sumCross += Number(s.crossSellGeneratedPln || 0);
        if (s.verifiedNetProfitPln !== null && s.verifiedNetProfitPln !== undefined) sumNetProfit += Number(s.verifiedNetProfitPln);
        sumStockoutDays += Number(s.stockoutDays || 0);
        sumLostDir += Number(s.lostDirectPln || 0);
        sumLostCross += Number(s.lostCrossSellPln || 0);
        sumLostRel += Number(s.lostRelevancePln || 0);
        sumLostAll += Number(s.totalLostGmvPln || 0);
        if (s.lostNetProfitPln !== null && s.lostNetProfitPln !== undefined) sumLostNet += Number(s.lostNetProfitPln);
        sumOrderQty += Number(s.recommendedOrderQty || 0);
        if (s.purchaseBudgetPln !== null && s.purchaseBudgetPln !== undefined) sumBudget += Number(s.purchaseBudgetPln);

        return [
            s.sku || '',
            s.ean || '',
            s.name || '',
            s.role || 'SOLO',
            s.abcXyz || 'CZ',
            s.currentStock ?? 'Brak danych',
            s.sellableStock ?? 'Brak danych',
            s.isCurrentlyUnavailable ? `BRAK W OFERCIE (≤ ${threshold})` : 'AKTYWNE',
            Number(s.totalUnits || 0),
            Number(s.ordersCount || 0),
            Number(s.multiOrdersCount || 0),
            round2(s.avgPricePln || 0),
            round2(s.totalRevenuePln || 0),
            round2(s.crossSellGeneratedPln || 0),
            s.cogsPerUnit ?? 'Brak COGS',
            s.verifiedNetProfitPln ?? 'Brak COGS',
            s.verifiedNetMarginPct ?? 'Brak COGS',
            Number(s.stockoutDays || 0),
            round2(s.lostDirectPln || 0),
            round2(s.lostCrossSellPln || 0),
            round2(s.lostRelevancePln || 0),
            round2(s.totalLostGmvPln || 0),
            s.lostNetProfitPln ?? 'Brak COGS',
            Number(s.recommendedOrderQty || 0),
            s.purchaseBudgetPln ?? 'Brak COGS',
            Array.isArray(s.channelsSold) ? s.channelsSold.join(', ') : ''
        ];
    });

    const controlRow = [
        `SUMA KONTROLNA (100% SKU: ${allSkus.length})`, '', '', '', '',
        '', '', '',
        sumUnits, sumOrders, sumMulti,
        '', round2(sumRev), round2(sumCross),
        '', round2(sumNetProfit), '',
        sumStockoutDays, round2(sumLostDir), round2(sumLostCross),
        round2(sumLostRel), round2(sumLostAll), round2(sumLostNet),
        sumOrderQty, round2(sumBudget), ''
    ];

    const skuSheetRows = [skuHeader, ...skuDataRows, controlRow];
    const ws3 = XLSX.utils.aoa_to_sheet(skuSheetRows);
    ws3['!cols'] = safeSheetColumns(skuSheetRows, [20, 15, 38, 12, 10, 10, 14, 22, 14, 12, 12, 14, 16, 16, 14, 16, 14, 18, 16, 18, 16, 18, 18, 16, 16, 24]);
    XLSX.utils.book_append_sheet(wb, ws3, 'Pelny Wykaz SKU (100%)');

    // 4. Koszyki i Zestawy
    const pairHeader = [
        'SKU A', 'Produkt A', 'SKU B', 'Produkt B',
        'Wspólne zamówienia', 'Support [%]', 'Confidence [%]', 'Lift (Siła powiązania)',
        'Śr. wartość koszyka [PLN]', 'Rekomendacja biznesowa'
    ];
    const pairRows = [
        pairHeader,
        ...(analysis.pairs || []).map(p => [
            p.skuKeyA || '',
            p.nameA || '',
            p.skuKeyB || '',
            p.nameB || '',
            Number(p.coCount || 0),
            round2(p.supportPct || 0),
            round2(p.confidencePct || 0),
            round2(p.lift || 0),
            round2(p.avgBasketPln || 0),
            p.recommendation || ''
        ])
    ];
    const ws4 = XLSX.utils.aoa_to_sheet(pairRows);
    ws4['!cols'] = safeSheetColumns(pairRows, [18, 36, 18, 36, 16, 12, 14, 18, 20, 44]);
    XLSX.utils.book_append_sheet(wb, ws4, 'Koszyki i Zestawy');

    // 5. Audyt i Krwawienie
    const auditRows = [
        ['KRWAWIĄCE OFERTY (WYRÓŻNIENIA / ADS BEZ ZYSKU LUB PRZY BRAKU)', '', '', '', ''],
        ['SKU', 'Nazwa produktu', 'Stan', 'Koszt Promo/Ads [PLN]', 'Zysk Netto [PLN]', 'Powód alertu'],
        ...(analysis.bleedingOffers || []).map(b => [
            b.sku || '', b.name || '', b.currentStock ?? 'Brak danych',
            round2(b.promoAndAdsCostPln || 0), b.verifiedNetProfitPln ?? 'Brak COGS', b.reason || ''
        ]),
        ['', '', '', '', '', ''],
        ['PROBLEMY TECHNICZNE OFERT (CIĄGŁOŚĆ ID / KANIBALIZACJA / MARTWA STREFA SMART!)', '', '', '', '', ''],
        ['Typ problemu', 'SKU', 'Nazwa produktu', 'Szczegóły', 'Liczba aukcji / zam. solo', 'Priorytet'],
        ...allSkus.filter(s => s.brokenAuctionContinuity || s.parallelAuctionsDetected || s.soloUnderSmartCount >= 3).map(s => {
            const flags = [];
            if (s.brokenAuctionContinuity) flags.push('Zerwana ciągłość ID aukcji');
            if (s.parallelAuctionsDetected) flags.push('Równoległe aukcje (kanibalizacja)');
            if (s.soloUnderSmartCount >= 3) flags.push(`Martwa strefa Smart! (${s.soloUnderSmartCount}x solo < ${smartThreshold} zł)`);
            return [
                flags.join(' + '),
                s.sku || '',
                s.name || '',
                `ID aukcji Allegro: ${(s.allegroOfferIds || []).join(', ') || 'brak'}`,
                s.soloUnderSmartCount || s.auctionCount || 0,
                s.brokenAuctionContinuity || s.parallelAuctionsDetected ? 'WYSOKI' : 'ŚREDNI'
            ];
        })
    ];
    const ws5 = XLSX.utils.aoa_to_sheet(auditRows);
    ws5['!cols'] = safeSheetColumns(auditRows, [28, 24, 38, 22, 22, 48]);
    XLSX.utils.book_append_sheet(wb, ws5, 'Audyt i Krwawienie');

    // 6. Lezaki i ABC-XYZ
    const deadRows = [
        ['LEŻAKI MAGAZYNOWE (BRAK ROTACJI / NADZAPAS > 150 DNI)', '', '', '', '', '', ''],
        ['SKU', 'Nazwa produktu', 'Stan [szt.]', 'Sprzedaż w okresie [szt.]', 'Dni od ost. sprzedaży', 'Dni zapasu (DOI)', 'Zamrożony kapitał COGS [PLN]', 'Rekomendowana akcja'],
        ...(analysis.deadStockItems || []).map(d => [
            d.sku || '', d.name || '', d.currentStock ?? 0, d.totalUnitsSold || 0,
            d.daysSinceLastSale || 0, d.daysOfInventory ?? 'Brak obrotu',
            d.frozenCapitalPln ?? 'Brak COGS', d.recommendedAction || ''
        ])
    ];
    const ws6 = XLSX.utils.aoa_to_sheet(deadRows);
    ws6['!cols'] = safeSheetColumns(deadRows, [18, 40, 12, 18, 18, 16, 24, 34]);
    XLSX.utils.book_append_sheet(wb, ws6, 'Lezaki i ABC-XYZ');

    // 7. Allegro Ads i Bilingi
    const fees = analysis.feeTotals || {};
    const adsRows = [
        ['PODSUMOWANIE BILINGÓW ALLEGRO (API / CSV)', 'PLN'],
        ['Prowizje od sprzedaży brutto [PLN]', round2(fees.commissionPln || 0)],
        ['Zwroty i korekty prowizji [PLN]', round2(fees.commissionRefundPln || 0)],
        ['Opłaty Allegro Smart! [PLN]', round2(fees.smartFeePln || 0)],
        ['Pakiety promowania i wyróżnienia [PLN]', round2(fees.promoFeePln || 0)],
        ['Rozliczenia Allegro Ads z bilingu [PLN]', round2(fees.adsBillingPln || 0)],
        ['Abonamenty [PLN]', round2(fees.subscriptionPln || 0)],
        ['Koszty zwrotów i inne [PLN]', round2((fees.returnCostPln || 0) + (fees.otherPln || 0))],
        ['', ''],
        ['KAMPANIE ALLEGRO ADS (Z IMPORTU CSV / XLSX)', '', '', '', '', '', '', '', ''],
        ['Kampania', 'Oferty ID', 'Wyświetlenia', 'Kliknięcia', 'CTR [%]', 'Koszt Netto [PLN]', 'CPC [PLN]', 'Przychód Ads [PLN]', 'Sztuki', 'ROAS'],
        ...(analysis.adsCampaigns || []).map(c => [
            c.campaignName || '',
            (c.offerIds || []).slice(0, 10).join(', '),
            Number(c.impressions || 0),
            Number(c.clicks || 0),
            round2(c.ctrPct || 0),
            round2(c.costNetPln || 0),
            round2(c.cpcPln || 0),
            round2(c.adRevenuePln || 0),
            Number(c.unitsSold || 0),
            round2(c.roas || 0)
        ])
    ];
    const ws7 = XLSX.utils.aoa_to_sheet(adsRows);
    ws7['!cols'] = safeSheetColumns(adsRows, [34, 24, 14, 12, 10, 16, 12, 18, 10, 10]);
    XLSX.utils.book_append_sheet(wb, ws7, 'Allegro Ads i Bilingi');

    // 8. InPost i Luki Cross-Channel
    const vh = analysis.vonHalskyDiagnostics || {};
    const inpostRows = [
        ['DIAGNOSTYKA INPOST VON HALSKY (OPENAPI v1.7.12)', 'WARTOŚĆ'],
        ['Statusy ofert (PUBLISHED / REJECTED / SOLDOUT / PENDING / CLOSED)', JSON.stringify(vh.offerStatusCounts || {})],
        ['Struktura dostaw (APM Paczkomat vs Kurier)', JSON.stringify(vh.deliveryMix || {})],
        ['Metody płatności', JSON.stringify(vh.paymentMix || {})],
        ['Średni czas akceptacji zamówienia [h]', vh.avgAcceptHours ?? 'Brak danych'],
        ['Średni czas nadania paczki [h]', vh.avgShipHours ?? 'Brak danych'],
        ['Zamówienia w Programie Cenowym InPost', Number(vh.programOrdersCount || 0)],
        ['Dopłata InPost (inpostShare) [PLN]', round2(vh.programDiscountPlatformPln || 0)],
        ['Wkład Sprzedawcy (merchantShare) [PLN]', round2(vh.programDiscountMerchantPln || 0)],
        ['', ''],
        ['POWODY ODRZUCEŃ OFERT VON HALSKY (GRUPOWANE)', 'LICZBA OFERT'],
        ...((vh.rejectionGroups || []).map(g => [g.reason, g.count])),
        ['', ''],
        ['LUKI CROSS-CHANNEL (BESTSELLERY ALLEGRO BRAKUJĄCE / ODRZUCONE NA VON HALSKY)', '', '', '', ''],
        ['SKU', 'Nazwa produktu', 'Obrót na Allegro [PLN]', 'Stan [szt.]', 'Status na Von Halsky', 'Powód luki', 'Szac. potencjał miesięczny [PLN]'],
        ...(analysis.crossChannelGaps || []).map(g => [
            g.sku || '', g.name || '', round2(g.allegroRevenuePln || 0),
            g.currentStock ?? 'Brak danych', g.vonHalskyStatus || 'MISSING',
            g.gapReason || '', round2(g.estimatedMonthlyOpportunityPln || 0)
        ])
    ];
    const ws8 = XLSX.utils.aoa_to_sheet(inpostRows);
    ws8['!cols'] = safeSheetColumns(inpostRows, [24, 42, 22, 14, 20, 40, 26]);
    XLSX.utils.book_append_sheet(wb, ws8, 'InPost i Cross-Channel');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Buduje plik CSV (UTF-8 BOM, separator ';') ze 100% analizowanych SKU oraz wierszem sumy kontrolnej.
 * Nie stosuje podziału braków 0 vs 1-2 — tylko jednolity stan `<= stockoutThreshold`.
 */
function buildExecutiveCsvString(analysis = {}) {
    const threshold = Number.isFinite(Number(analysis?.meta?.stockoutThreshold)) ? Number(analysis.meta.stockoutThreshold) : 2;
    const allSkus = analysis.skus || [];

    const headers = [
        'SKU', 'EAN', 'Nazwa', 'Rola', 'ABC-XYZ',
        'Stan', 'Zapas_Sprzedazowy', `Status_Oferty_Prog_${threshold}`,
        'Sztuki', 'Zamowienia', 'Koszyki_2plus',
        'Sr_Cena_PLN', 'Obrot_GMV_PLN', 'Cross_Sell_PLN',
        'COGS_PLN', 'Zysk_Netto_PLN', 'Marza_Netto_Pct',
        `Dni_Braku_Ponizej_${threshold}`, 'Strata_Bezp_PLN', 'Utracony_CrossSell_PLN',
        'Kara_Trafnosci_PLN', 'Utracony_GMV_Razem_PLN', 'Utracony_Zysk_Netto_PLN',
        'Domowienie_ROP_Szt', 'Budzet_Zakupu_PLN', 'Kanaly'
    ];

    let sumUnits = 0; let sumOrders = 0; let sumMulti = 0;
    let sumRev = 0; let sumCross = 0; let sumNet = 0;
    let sumDays = 0; let sumDir = 0; let sumLostCross = 0;
    let sumRel = 0; let sumAll = 0; let sumLostNet = 0;
    let sumOrder = 0; let sumBudget = 0;

    const lines = [headers.map(buildCsvCell).join(';')];

    for (const s of allSkus) {
        sumUnits += Number(s.totalUnits || 0);
        sumOrders += Number(s.ordersCount || 0);
        sumMulti += Number(s.multiOrdersCount || 0);
        sumRev += Number(s.totalRevenuePln || 0);
        sumCross += Number(s.crossSellGeneratedPln || 0);
        if (s.verifiedNetProfitPln !== null && s.verifiedNetProfitPln !== undefined) sumNet += Number(s.verifiedNetProfitPln);
        sumDays += Number(s.stockoutDays || 0);
        sumDir += Number(s.lostDirectPln || 0);
        sumLostCross += Number(s.lostCrossSellPln || 0);
        sumRel += Number(s.lostRelevancePln || 0);
        sumAll += Number(s.totalLostGmvPln || 0);
        if (s.lostNetProfitPln !== null && s.lostNetProfitPln !== undefined) sumLostNet += Number(s.lostNetProfitPln);
        sumOrder += Number(s.recommendedOrderQty || 0);
        if (s.purchaseBudgetPln !== null && s.purchaseBudgetPln !== undefined) sumBudget += Number(s.purchaseBudgetPln);

        const row = [
            s.sku || '',
            s.ean || '',
            s.name || '',
            s.role || 'SOLO',
            s.abcXyz || 'CZ',
            s.currentStock ?? '',
            s.sellableStock ?? '',
            s.isCurrentlyUnavailable ? `BRAK_W_OFERCIE_LE_${threshold}` : 'AKTYWNE',
            Number(s.totalUnits || 0),
            Number(s.ordersCount || 0),
            Number(s.multiOrdersCount || 0),
            round2(s.avgPricePln || 0),
            round2(s.totalRevenuePln || 0),
            round2(s.crossSellGeneratedPln || 0),
            s.cogsPerUnit ?? '',
            s.verifiedNetProfitPln ?? '',
            s.verifiedNetMarginPct ?? '',
            Number(s.stockoutDays || 0),
            round2(s.lostDirectPln || 0),
            round2(s.lostCrossSellPln || 0),
            round2(s.lostRelevancePln || 0),
            round2(s.totalLostGmvPln || 0),
            s.lostNetProfitPln ?? '',
            Number(s.recommendedOrderQty || 0),
            s.purchaseBudgetPln ?? '',
            Array.isArray(s.channelsSold) ? s.channelsSold.join('|') : ''
        ];
        lines.push(row.map(buildCsvCell).join(';'));
    }

    const totalRow = [
        `SUMA_KONTROLNA_100PCT (${allSkus.length} SKU)`, '', '', '', '',
        '', '', '',
        sumUnits, sumOrders, sumMulti,
        '', round2(sumRev), round2(sumCross),
        '', round2(sumNet), '',
        sumDays, round2(sumDir), round2(sumLostCross),
        round2(sumRel), round2(sumAll), round2(sumLostNet),
        sumOrder, round2(sumBudget), ''
    ];
    lines.push(totalRow.map(buildCsvCell).join(';'));

    return '\uFEFF' + lines.join('\r\n');
}

module.exports = {
    buildExecutiveXlsxBuffer,
    buildExecutiveCsvString
};
