const {
    round2,
    round4,
    toDayKey,
    resolveFxRate
} = require('../utils/currency.helpers');

const SEASONAL_KEYWORDS_RX = /komar|kleszcz|meszk|os i szerszeni|owad|mrówk|much|insekt|ogrodow|nawoz|nawóz|grill|brykiet|podpałk|odladzacz|odmrażacz/i;

function computeCoefficientOfVariation(values = []) {
    if (!Array.isArray(values) || values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    if (mean <= 0) return 0;
    const variance = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance) / mean;
}

/**
 * Deduplikacja zamówień dla widoku Omnichannel (`ALL`) oraz łączenie lustra Base.com z bezpośrednim API Allegro/VonHalsky.
 * Zero podwójnego zliczania GMV!
 */
function deduplicateOrders(rawOrders = [], targetPlatform = 'ALL') {
    const filtered = rawOrders.filter(o => {
        if (!o || o.status === 'CANCELLED') return false;
        if (targetPlatform === 'ALL') return true;
        if (targetPlatform === 'ALLEGRO') {
            return o.platform === 'ALLEGRO' || (o.platform === 'BASELINKER' && o.originChannel === 'ALLEGRO');
        }
        if (targetPlatform === 'VONHALSKY') {
            return o.platform === 'VONHALSKY' || (o.platform === 'BASELINKER' && o.originChannel === 'VONHALSKY');
        }
        return o.platform === targetPlatform;
    });

    const canonicalMap = new Map();
    const priorityScore = (o) => {
        if (o.platform === 'ALLEGRO' || o.platform === 'VONHALSKY') return 3;
        if (o.platform === 'BASELINKER' && o.sourceMode === 'API') return 2;
        return 1;
    };

    for (const ord of filtered) {
        const mktId = ord.marketplaceOrderId ? String(ord.marketplaceOrderId).trim() : '';
        const key = mktId
            ? `${String(ord.originChannel || 'OTHER').toUpperCase()}:${mktId}`
            : `${String(ord.platform || 'BASELINKER').toUpperCase()}:${String(ord.externalOrderId || ord.id)}`;

        const existing = canonicalMap.get(key);
        if (!existing) {
            canonicalMap.set(key, { ...ord, items: Array.isArray(ord.items) ? ord.items : [] });
            continue;
        }

        const existingScore = priorityScore(existing);
        const incomingScore = priorityScore(ord);
        const primary = incomingScore > existingScore ? ord : existing;
        const secondary = incomingScore > existingScore ? existing : ord;

        // Łączymy brakujące SKU/EAN z lustra BaseLinker z metadanymi bezpośredniego API platformy
        const secByName = new Map();
        for (const it of (secondary.items || [])) {
            const k = String(it.auctionId || it.name || '').toLowerCase().trim();
            if (k) secByName.set(k, it);
        }
        const mergedItems = (primary.items || []).map((it, idx) => {
            const match = secByName.get(String(it.auctionId || it.name || '').toLowerCase().trim()) || (secondary.items || [])[idx] || {};
            return {
                ...it,
                sku: it.sku && it.sku !== it.auctionId ? it.sku : (match.sku || it.sku),
                ean: it.ean || match.ean || null,
                productId: it.productId || match.productId || null
            };
        });

        canonicalMap.set(key, {
            ...primary,
            commissionPln: primary.commissionPln ?? secondary.commissionPln ?? null,
            discountMerchantPln: Number(primary.discountMerchantPln || 0) || Number(secondary.discountMerchantPln || 0),
            discountPlatformPln: Number(primary.discountPlatformPln || 0) || Number(secondary.discountPlatformPln || 0),
            isSmart: Boolean(primary.isSmart || secondary.isSmart),
            acceptedAt: primary.acceptedAt || secondary.acceptedAt || null,
            shippedAt: primary.shippedAt || secondary.shippedAt || null,
            items: mergedItems
        });
    }

    return Array.from(canonicalMap.values());
}

function buildPimLookup(products = []) {
    const bySku = new Map();
    const byEan = new Map();
    const byBlId = new Map();
    for (const p of products) {
        if (p?.sku) bySku.set(String(p.sku).trim(), p);
        if (p?.ean) byEan.set(String(p.ean).trim(), p);
        if (p?.baselinkerId) byBlId.set(String(p.baselinkerId).trim(), p);
    }
    return {
        find(item = {}) {
            return (item.sku && bySku.get(String(item.sku).trim()))
                || (item.ean && byEan.get(String(item.ean).trim()))
                || (item.productId && byBlId.get(String(item.productId).trim()))
                || null;
        }
    };
}

/**
 * Główny deterministyczny silnik analityczny i decyzyjny (Sales Intelligence Engine).
 * Wylicza jednolity stan braku (stock <= stockoutThreshold, BEZ podziału 0 vs 1-2 szt.),
 * prawdziwą marżę netto (wyłącznie dla zweryfikowanego COGS w PIM), koszyki Smart! (49,90 zł),
 * zakupy ROP Min-Max, krwawiące oferty, leżaki ABC-XYZ, luki Cross-Channel oraz kolejkę decyzji.
 */
function runSalesIntelligenceAnalysis(dataset = {}, options = {}) {
    const {
        orders = [],
        snapshots = [],
        financialEntries = [],
        adsMetrics = [],
        qualitySnapshots = [],
        products = [],
        openPurchaseOrdersBySku = {},
        stockLogsByProductId = {}
    } = dataset;

    const platform = String(options.platform || 'ALL').toUpperCase();
    const marketFilter = String(options.marketFilter || 'ALL').toUpperCase();
    const accountFilter = options.accountFilter ? String(options.accountFilter) : 'ALL';
    const fxRates = options.fxRates || {};
    const stockoutThreshold = Number.isFinite(Number(options.stockoutThreshold))
        ? Math.max(0, Math.min(50, Math.trunc(Number(options.stockoutThreshold))))
        : 2;
    const smartThresholdPln = Number.isFinite(Number(options.smartThresholdPln)) && Number(options.smartThresholdPln) > 0
        ? Number(options.smartThresholdPln)
        : 49.90;
    const smartDeadZoneMin = round2(smartThresholdPln * 0.68); // ~34.00 PLN przy progu 49.90 zł
    const defaultLeadTimeDays = Math.max(1, Number(options.leadTimeDays) || 14);
    const defaultSafetyBufferPct = Number.isFinite(Number(options.safetyBufferPct)) ? Number(options.safetyBufferPct) : 0.25;
    const applySeasonalFilter = options.applySeasonalFilter !== false;

    const dateFromMs = options.dateFrom ? new Date(options.dateFrom).getTime() : 0;
    const dateToMs = options.dateTo ? new Date(options.dateTo).getTime() + 86399999 : Infinity;

    const pimLookup = buildPimLookup(products);
    const dedupedOrders = deduplicateOrders(orders, platform);

    // Zliczanie przychodzących dostaw PO po SKU/EAN
    const poMap = {};
    for (const [k, qty] of Object.entries(openPurchaseOrdersBySku || {})) {
        poMap[String(k).trim()] = Number(qty || 0);
    }

    // 1. Filtrowanie zamówień wg daty, konta i rynku/waluty oraz agregacja koszyków
    const marketBreakdown = {
        PLN: { code: 'PLN', label: 'Polska (PLN)', orders: 0, rawSum: 0, plnSum: 0 },
        CZK: { code: 'CZK', label: 'Czechy (CZK)', orders: 0, rawSum: 0, plnSum: 0 },
        EUR: { code: 'EUR', label: 'Słowacja / EU (EUR)', orders: 0, rawSum: 0, plnSum: 0 },
        HUF: { code: 'HUF', label: 'Węgry (HUF)', orders: 0, rawSum: 0, plnSum: 0 }
    };
    const channelBreakdown = {
        ALLEGRO: { channel: 'ALLEGRO', orders: 0, gmvPln: 0, units: 0 },
        VONHALSKY: { channel: 'VONHALSKY', orders: 0, gmvPln: 0, units: 0 },
        SHOP: { channel: 'SHOP', orders: 0, gmvPln: 0, units: 0 },
        OTHER: { channel: 'OTHER', orders: 0, gmvPln: 0, units: 0 }
    };

    const skuMap = {};
    const pairMap = {};
    const monthlyAgg = {};
    const auctionToSkuKey = {};
    const vhDeliveryMix = { APM: 0, COURIER: 0, UNKNOWN: 0 };
    const vhPaymentMix = {};
    let vhAcceptHoursSum = 0;
    let vhAcceptCnt = 0;
    let vhShipHoursSum = 0;
    let vhShipCnt = 0;
    let vhProgramDiscountPlatformPln = 0;
    let vhProgramDiscountMerchantPln = 0;
    let vhProgramOrdersCount = 0;

    let totalGmvPln = 0;
    let totalOrders = 0;
    let totalUnits = 0;
    let multiOrdersCount = 0;
    let multiGmvPln = 0;
    let soloOrdersCount = 0;
    let soloGmvPln = 0;
    let minOrderTs = Infinity;
    let maxOrderTs = 0;

    for (const ord of dedupedOrders) {
        const ordTimeMs = new Date(ord.orderDate).getTime();
        if (!Number.isFinite(ordTimeMs) || ordTimeMs < dateFromMs || ordTimeMs > dateToMs) continue;
        if (accountFilter !== 'ALL' && String(ord.accountId || '') !== accountFilter) continue;

        const cur = String(ord.currency || 'PLN').toUpperCase();
        const fx = resolveFxRate(cur, fxRates);

        const rawItems = Array.isArray(ord.items) ? ord.items : [];
        let orderSumOrig = 0;
        for (const it of rawItems) {
            const q = Math.max(1, Number(it.qty || 1));
            const pOrig = Number(it.priceOrig ?? it.pricePln ?? 0);
            orderSumOrig += q * pOrig;
        }
        if (orderSumOrig <= 0) continue;

        if (marketBreakdown[cur]) {
            marketBreakdown[cur].orders += 1;
            marketBreakdown[cur].rawSum += orderSumOrig;
            marketBreakdown[cur].plnSum += orderSumOrig * fx;
        }

        if (marketFilter === 'ONLY_PLN' && cur !== 'PLN') continue;
        if (marketFilter === 'ONLY_FOREIGN' && cur === 'PLN') continue;
        if (marketFilter === 'ONLY_CZK' && cur !== 'CZK') continue;
        if (marketFilter === 'ONLY_EUR' && cur !== 'EUR') continue;
        if (marketFilter === 'ONLY_HUF' && cur !== 'HUF') continue;

        const ordSec = Math.floor(ordTimeMs / 1000);
        if (ordSec < minOrderTs) minOrderTs = ordSec;
        if (ordSec > maxOrderTs) maxOrderTs = ordSec;

        const dObj = new Date(ordTimeMs);
        const dayKey = dObj.toISOString().slice(0, 10);
        const monthKey = dayKey.slice(0, 7);
        const dow = (dObj.getUTCDay() + 6) % 7;
        const weekKey = new Date(ordTimeMs - dow * 86400000).toISOString().slice(0, 10);

        const basketItems = [];
        for (const it of rawItems) {
            const qty = Math.max(1, Number(it.qty || 1));
            const priceOrig = Math.max(0, Number(it.priceOrig ?? it.pricePln ?? 0));
            const pricePln = priceOrig * fx;
            const lineVal = qty * pricePln;
            const pim = pimLookup.find(it);
            const cleanSku = String(it.sku || pim?.sku || it.ean || it.name || 'NIEZNANY').trim();
            const cleanEan = String(it.ean || pim?.ean || '').trim() || null;
            const skuKey = cleanSku || cleanEan || String(it.name || 'NIEZNANY').trim();

            if (it.auctionId) auctionToSkuKey[String(it.auctionId)] = skuKey;
            basketItems.push({
                skuKey,
                sku: cleanSku,
                ean: cleanEan,
                pimId: pim?.id || null,
                productId: it.productId || pim?.baselinkerId || null,
                auctionId: it.auctionId || null,
                name: String(it.name || pim?.name || skuKey),
                qty,
                pricePln,
                lineVal,
                pim
            });
        }

        if (basketItems.length === 0) continue;

        const basketTotal = basketItems.reduce((acc, it) => acc + it.lineVal, 0);
        const basketUnits = basketItems.reduce((acc, it) => acc + it.qty, 0);
        totalOrders += 1;
        totalUnits += basketUnits;
        totalGmvPln += basketTotal;

        const ch = String(ord.originChannel || 'OTHER').toUpperCase();
        const chBucket = channelBreakdown[ch] || channelBreakdown.OTHER;
        chBucket.orders += 1;
        chBucket.gmvPln += basketTotal;
        chBucket.units += basketUnits;

        if (ord.platform === 'VONHALSKY' || ch === 'VONHALSKY') {
            const dType = String(ord.deliveryMethod || 'UNKNOWN').toUpperCase();
            if (dType === 'APM' || dType === 'COURIER') vhDeliveryMix[dType]++;
            else vhDeliveryMix.UNKNOWN++;
            const pType = String(ord.paymentMethod || 'UNKNOWN').toUpperCase();
            vhPaymentMix[pType] = (vhPaymentMix[pType] || 0) + 1;
            if (ord.acceptedAt) {
                const hrs = (new Date(ord.acceptedAt).getTime() - ordTimeMs) / 3600000;
                if (hrs >= 0 && hrs <= 240) { vhAcceptHoursSum += hrs; vhAcceptCnt++; }
            }
            if (ord.shippedAt) {
                const hrs = (new Date(ord.shippedAt).getTime() - ordTimeMs) / 3600000;
                if (hrs >= 0 && hrs <= 480) { vhShipHoursSum += hrs; vhShipCnt++; }
            }
            if (Number(ord.discountPlatformPln || 0) > 0 || Number(ord.discountMerchantPln || 0) > 0) {
                vhProgramDiscountPlatformPln += Number(ord.discountPlatformPln || 0);
                vhProgramDiscountMerchantPln += Number(ord.discountMerchantPln || 0);
                vhProgramOrdersCount++;
            }
        }

        if (!monthlyAgg[monthKey]) {
            monthlyAgg[monthKey] = { month: monthKey, gmvPln: 0, orders: 0, multiOrders: 0, stockoutStarts: 0, netProfitPln: 0 };
        }
        monthlyAgg[monthKey].gmvPln += basketTotal;
        monthlyAgg[monthKey].orders += 1;

        const isMultiBasket = basketItems.length >= 2;
        if (isMultiBasket) {
            multiOrdersCount += 1;
            multiGmvPln += basketTotal;
            monthlyAgg[monthKey].multiOrders += 1;
        } else {
            soloOrdersCount += 1;
            soloGmvPln += basketTotal;
        }

        let primaryDriverSkuKey = basketItems[0].skuKey;
        let maxLine = -1;
        for (const it of basketItems) {
            if (it.lineVal > maxLine) {
                maxLine = it.lineVal;
                primaryDriverSkuKey = it.skuKey;
            }
        }

        for (const it of basketItems) {
            if (!skuMap[it.skuKey]) {
                const pim = it.pim;
                const pimCogs = pim && Number(pim.basePrice) > 0 ? Number(pim.basePrice) : null;
                const pimLogistics = pim
                    ? (Number(pim.packagingCost || 0) + Number(pim.bdoEprCost || 0) + Number(pim.inboundTransportCost || 0) + Number(pim.outboundTransportCost || 0))
                    : 0;
                const pimTax = pim && Number(pim.taxRate) > 0 ? Number(pim.taxRate) : 23;
                const pimLeadTime = pim && Number(pim.leadTimeDays) > 0 ? Number(pim.leadTimeDays) : defaultLeadTimeDays;

                skuMap[it.skuKey] = {
                    skuKey: it.skuKey,
                    sku: it.sku,
                    ean: it.ean,
                    pimProductId: it.pimId,
                    baselinkerProductId: it.productId,
                    name: it.name,
                    currentStock: pim ? Number(pim.stock ?? 0) : null,
                    cogsPerUnit: pimCogs,
                    logisticsPerUnit: pimLogistics,
                    taxRate: pimTax,
                    leadTimeDays: pimLeadTime,
                    openPoQty: poMap[it.sku] || poMap[it.ean] || poMap[it.productId] || 0,
                    totalUnits: 0,
                    totalRevenuePln: 0,
                    ordersCount: 0,
                    multiOrdersCount: 0,
                    primaryDriverCount: 0,
                    multiShareSum: 0,
                    multiBasketValueSum: 0,
                    crossSellGeneratedPln: 0,
                    soloUnderSmartCount: 0,
                    orderTimestamps: [],
                    dailyUnits: {},
                    weeklyBuckets: {},
                    auctionHistory: new Map(),
                    channelsSold: new Set(),
                    // Dane z migawek, bilingów i reklam:
                    allegroOfferIds: new Set(),
                    vonHalskyOfferIds: new Set(),
                    allegroStatus: null,
                    vonHalskyStatus: null,
                    vonHalskyRejections: [],
                    allegroIsPromoted: false,
                    allegroHasBadge: false,
                    vonHalskyInPriceProgram: false,
                    visitsStart: null,
                    visitsEnd: null,
                    watchersStart: null,
                    watchersEnd: null,
                    deltaVisits: 0,
                    deltaWatchers: 0,
                    billingCommissionPln: 0,
                    billingSmartPln: 0,
                    billingPromoFeePln: 0,
                    billingAdsPln: 0,
                    adsCsvImpressions: 0,
                    adsCsvClicks: 0,
                    adsCsvCostNetPln: 0,
                    adsCsvRevenuePln: 0,
                    adsCsvUnitsSold: 0,
                    // Straty i braki (zjednoczony stan <= stockoutThreshold, zero podziału 0 vs 1-2!)
                    stockoutDays: 0,
                    stockouts: [],
                    brokenAuctionContinuity: false,
                    parallelAuctionsDetected: false,
                    snapshotDaysBelowThreshold: new Set(),
                    snapshotDaysTotal: new Set()
                };
            }

            const sObj = skuMap[it.skuKey];
            if (!sObj.ean && it.ean) sObj.ean = it.ean;
            if (!sObj.baselinkerProductId && it.productId) sObj.baselinkerProductId = it.productId;
            sObj.channelsSold.add(ch);
            sObj.totalUnits += it.qty;
            sObj.totalRevenuePln += it.lineVal;
            sObj.ordersCount += 1;
            sObj.orderTimestamps.push(ordSec);
            sObj.dailyUnits[dayKey] = (sObj.dailyUnits[dayKey] || 0) + it.qty;

            if (!isMultiBasket && basketTotal >= smartDeadZoneMin && basketTotal < smartThresholdPln) {
                sObj.soloUnderSmartCount += 1;
            }

            if (it.auctionId) {
                const aid = String(it.auctionId);
                if (ch === 'ALLEGRO') sObj.allegroOfferIds.add(aid);
                if (ch === 'VONHALSKY') sObj.vonHalskyOfferIds.add(aid);
                const prevA = sObj.auctionHistory.get(aid) || { firstTs: ordSec, lastTs: ordSec, units: 0 };
                if (ordSec < prevA.firstTs) prevA.firstTs = ordSec;
                if (ordSec > prevA.lastTs) prevA.lastTs = ordSec;
                prevA.units += it.qty;
                sObj.auctionHistory.set(aid, prevA);
            }

            if (!sObj.weeklyBuckets[weekKey]) {
                sObj.weeklyBuckets[weekKey] = { units: 0, orders: 0, revenue: 0, multiPackOrders: 0, companionUnits: 0, auctionsSet: new Set() };
            }
            const wb = sObj.weeklyBuckets[weekKey];
            wb.units += it.qty;
            wb.orders += 1;
            wb.revenue += it.lineVal;
            if (it.qty >= 2) wb.multiPackOrders += 1;
            if (it.auctionId) wb.auctionsSet.add(String(it.auctionId));

            if (isMultiBasket) {
                sObj.multiOrdersCount += 1;
                const share = basketTotal > 0 ? it.lineVal / basketTotal : 0;
                sObj.multiShareSum += share;
                sObj.multiBasketValueSum += basketTotal;
                if (it.skuKey === primaryDriverSkuKey) {
                    sObj.primaryDriverCount += 1;
                    sObj.crossSellGeneratedPln += Math.max(0, basketTotal - it.lineVal);
                } else {
                    wb.companionUnits += it.qty;
                }
            }
        }

        if (isMultiBasket) {
            for (let i = 0; i < basketItems.length; i++) {
                for (let j = 0; j < basketItems.length; j++) {
                    if (i === j) continue;
                    const itemA = basketItems[i];
                    const itemB = basketItems[j];
                    if (itemA.lineVal < itemB.lineVal) continue;
                    if (itemA.lineVal === itemB.lineVal && itemA.skuKey > itemB.skuKey) continue;
                    const pKey = `${itemA.skuKey}|||${itemB.skuKey}`;
                    if (!pairMap[pKey]) {
                        pairMap[pKey] = {
                            skuKeyA: itemA.skuKey,
                            skuA: itemA.sku,
                            nameA: itemA.name,
                            skuKeyB: itemB.skuKey,
                            skuB: itemB.sku,
                            nameB: itemB.name,
                            coCount: 0,
                            basketValSum: 0
                        };
                    }
                    pairMap[pKey].coCount += 1;
                    pairMap[pKey].basketValSum += basketTotal;
                }
            }
        }
    }

    // 2. Dodajemy produkty z PIM oraz z dziennych migawek, nawet jeśli miały 0 sprzedaży (pod Leżaki, Odrzucenia i Luki Cross-Channel!)
    for (const p of products) {
        const skuKey = String(p.sku || p.ean || p.id).trim();
        if (!skuMap[skuKey]) {
            skuMap[skuKey] = {
                skuKey,
                sku: p.sku || skuKey,
                ean: p.ean || null,
                pimProductId: p.id,
                baselinkerProductId: p.baselinkerId || null,
                name: p.name || skuKey,
                currentStock: Number(p.stock ?? 0),
                cogsPerUnit: Number(p.basePrice) > 0 ? Number(p.basePrice) : null,
                logisticsPerUnit: Number(p.packagingCost || 0) + Number(p.bdoEprCost || 0) + Number(p.inboundTransportCost || 0) + Number(p.outboundTransportCost || 0),
                taxRate: Number(p.taxRate) > 0 ? Number(p.taxRate) : 23,
                leadTimeDays: Number(p.leadTimeDays) > 0 ? Number(p.leadTimeDays) : defaultLeadTimeDays,
                openPoQty: poMap[p.sku] || poMap[p.ean] || poMap[p.baselinkerId] || 0,
                totalUnits: 0,
                totalRevenuePln: 0,
                ordersCount: 0,
                multiOrdersCount: 0,
                primaryDriverCount: 0,
                multiShareSum: 0,
                multiBasketValueSum: 0,
                crossSellGeneratedPln: 0,
                soloUnderSmartCount: 0,
                orderTimestamps: [],
                dailyUnits: {},
                weeklyBuckets: {},
                auctionHistory: new Map(),
                channelsSold: new Set(),
                allegroOfferIds: new Set(),
                vonHalskyOfferIds: new Set(),
                allegroStatus: null,
                vonHalskyStatus: null,
                vonHalskyRejections: [],
                allegroIsPromoted: false,
                allegroHasBadge: false,
                vonHalskyInPriceProgram: false,
                visitsStart: null,
                visitsEnd: null,
                watchersStart: null,
                watchersEnd: null,
                deltaVisits: 0,
                deltaWatchers: 0,
                billingCommissionPln: 0,
                billingSmartPln: 0,
                billingPromoFeePln: 0,
                billingAdsPln: 0,
                adsCsvImpressions: 0,
                adsCsvClicks: 0,
                adsCsvCostNetPln: 0,
                adsCsvRevenuePln: 0,
                adsCsvUnitsSold: 0,
                stockoutDays: 0,
                stockouts: [],
                brokenAuctionContinuity: false,
                parallelAuctionsDetected: false,
                snapshotDaysBelowThreshold: new Set(),
                snapshotDaysTotal: new Set()
            };
        }
    }

    // 3. Nakładanie dziennych migawek ofert (`AnalyticsDailyOfferSnapshot`)
    const filteredSnapshots = snapshots
        .filter(s => {
            const ms = new Date(s.snapshotDate).getTime();
            if (!Number.isFinite(ms) || ms < dateFromMs || ms > dateToMs) return false;
            if (platform !== 'ALL' && s.platform !== platform) return false;
            if (accountFilter !== 'ALL' && String(s.accountId || '') !== accountFilter) return false;
            return true;
        })
        .sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime());

    const vhStatusCounts = { PUBLISHED: 0, REJECTED: 0, SOLDOUT: 0, CLOSED: 0, PENDING: 0 };
    const vhRejectionGroups = {};
    const latestVhOfferSeen = new Set();

    // Grupujemy najnowsze migawki per (platform + externalOfferId)
    const latestSnapByOffer = new Map();
    for (const s of filteredSnapshots) {
        const pim = pimLookup.find({ sku: s.sku, ean: s.ean, productId: s.baselinkerProductId });
        const skuKey = String(
            (s.sku && skuMap[s.sku] ? s.sku : null)
            || (pim?.sku && skuMap[pim.sku] ? pim.sku : null)
            || auctionToSkuKey[String(s.externalOfferId)]
            || s.sku
            || s.ean
            || s.externalOfferId
        ).trim();

        if (s.externalOfferId) auctionToSkuKey[String(s.externalOfferId)] = skuKey;
        const sObj = skuMap[skuKey];
        if (!sObj) continue;

        const dayStr = toDayKey(s.snapshotDate);
        sObj.snapshotDaysTotal.add(dayStr);

        const isUnavailableSnap = Number(s.stock ?? 0) <= stockoutThreshold
            || ['ENDED', 'SOLDOUT', 'CLOSED', 'REJECTED'].includes(String(s.status || '').toUpperCase());
        if (isUnavailableSnap) {
            sObj.snapshotDaysBelowThreshold.add(dayStr);
        }

        if (s.platform === 'ALLEGRO') {
            sObj.allegroOfferIds.add(String(s.externalOfferId));
            if (typeof s.visitsCount === 'number') {
                if (sObj.visitsStart === null) sObj.visitsStart = s.visitsCount;
                sObj.visitsEnd = s.visitsCount;
            }
            if (typeof s.watchersCount === 'number') {
                if (sObj.watchersStart === null) sObj.watchersStart = s.watchersCount;
                sObj.watchersEnd = s.watchersCount;
            }
        }
        if (s.platform === 'VONHALSKY') {
            sObj.vonHalskyOfferIds.add(String(s.externalOfferId));
        }

        latestSnapByOffer.set(`${s.platform}:${s.externalOfferId}`, { snap: s, sObj });
    }

    for (const { snap, sObj } of latestSnapByOffer.values()) {
        if (snap.platform === 'BASELINKER' || sObj.currentStock === null) {
            sObj.currentStock = Number(snap.stock ?? 0);
        }
        if (snap.platform === 'ALLEGRO') {
            sObj.allegroStatus = snap.status;
            if (snap.isPromoted) sObj.allegroIsPromoted = true;
            if (snap.hasBadge) sObj.allegroHasBadge = true;
            if (sObj.visitsEnd !== null && sObj.visitsStart !== null) {
                sObj.deltaVisits = Math.max(0, sObj.visitsEnd - sObj.visitsStart);
                if (sObj.deltaVisits === 0 && sObj.visitsEnd > 0) sObj.deltaVisits = sObj.visitsEnd; // przy pojedynczej migawce
            }
            if (sObj.watchersEnd !== null && sObj.watchersStart !== null) {
                sObj.deltaWatchers = sObj.watchersEnd - sObj.watchersStart;
            }
        }
        if (snap.platform === 'VONHALSKY') {
            sObj.vonHalskyStatus = snap.status;
            if (snap.inPriceProgram) sObj.vonHalskyInPriceProgram = true;
            if (!latestVhOfferSeen.has(snap.externalOfferId)) {
                latestVhOfferSeen.add(snap.externalOfferId);
                const st = String(snap.status || 'PENDING').toUpperCase();
                vhStatusCounts[st] = (vhStatusCounts[st] || 0) + 1;
                const reasons = [
                    ...(Array.isArray(snap.rejectionReasons) ? snap.rejectionReasons.map(r => r?.reasonMessage || String(r)) : []),
                    ...(Array.isArray(snap.validationErrors) ? snap.validationErrors.map(v => `${v?.field ? `[${v.field}] ` : ''}${v?.detail || v?.message || String(v)}`) : [])
                ].filter(Boolean);
                if (reasons.length > 0) {
                    sObj.vonHalskyRejections = reasons;
                    for (const rsn of reasons) {
                        vhRejectionGroups[rsn] = (vhRejectionGroups[rsn] || 0) + 1;
                    }
                }
            }
        }
    }

    // 4. Bilingi i opłaty (`AnalyticsFinancialEntry`) + Statystyki Reklam (`AnalyticsAdsMetric`)
    const feeTotals = {
        commissionPln: 0,
        commissionRefundPln: 0,
        smartFeePln: 0,
        promoFeePln: 0,
        adsBillingPln: 0,
        subscriptionPln: 0,
        returnCostPln: 0,
        otherPln: 0
    };

    for (const fe of financialEntries) {
        const ms = new Date(fe.entryDate).getTime();
        if (!Number.isFinite(ms) || ms < dateFromMs || ms > dateToMs) continue;
        if (platform !== 'ALL' && fe.platform !== platform) continue;
        if (accountFilter !== 'ALL' && String(fe.accountId || '') !== accountFilter) continue;

        const amt = Number(fe.amountPln || 0);
        const cat = String(fe.category || 'OTHER');
        const absCost = amt < 0 ? Math.abs(amt) : -amt;

        if (cat === 'COMMISSION') feeTotals.commissionPln += absCost;
        else if (cat === 'COMMISSION_REFUND') feeTotals.commissionRefundPln += Math.abs(amt);
        else if (cat === 'SMART') feeTotals.smartFeePln += absCost;
        else if (cat === 'PROMO_FEE') feeTotals.promoFeePln += absCost;
        else if (cat === 'ADS') feeTotals.adsBillingPln += absCost;
        else if (cat === 'SUBSCRIPTION') feeTotals.subscriptionPln += absCost;
        else if (cat === 'RETURN_COST') feeTotals.returnCostPln += absCost;
        else feeTotals.otherPln += absCost;

        const targetSkuKey = (fe.sku && skuMap[fe.sku] ? fe.sku : null) || (fe.offerId ? auctionToSkuKey[String(fe.offerId)] : null);
        if (targetSkuKey && skuMap[targetSkuKey]) {
            const sObj = skuMap[targetSkuKey];
            if (cat === 'COMMISSION') sObj.billingCommissionPln += absCost;
            else if (cat === 'COMMISSION_REFUND') sObj.billingCommissionPln -= Math.abs(amt);
            else if (cat === 'SMART') sObj.billingSmartPln += absCost;
            else if (cat === 'PROMO_FEE') {
                sObj.billingPromoFeePln += absCost;
                if (absCost > 0) sObj.allegroIsPromoted = true;
            } else if (cat === 'ADS') sObj.billingAdsPln += absCost;
        }
    }

    let adsCsvTotalSpendNet = 0;
    let adsCsvTotalSpendGross = 0;
    let adsCsvTotalRevenue = 0;
    let adsCsvTotalClicks = 0;
    let adsCsvTotalImpressions = 0;
    const adsCampaignsMap = {};

    for (const ad of adsMetrics) {
        const msEnd = new Date(ad.periodEnd || ad.periodStart).getTime();
        if (Number.isFinite(msEnd) && (msEnd < dateFromMs || new Date(ad.periodStart).getTime() > dateToMs)) continue;
        if (platform !== 'ALL' && platform !== 'ALLEGRO') continue;

        const costNet = Number(ad.costNetPln || 0);
        const costGross = Number(ad.costGrossPln || costNet * 1.23);
        const rev = Number(ad.adRevenuePln || 0);
        const clicks = Number(ad.clicks || 0);
        const impr = Number(ad.impressions || 0);
        const units = Number(ad.unitsSold || 0);

        adsCsvTotalSpendNet += costNet;
        adsCsvTotalSpendGross += costGross;
        adsCsvTotalRevenue += rev;
        adsCsvTotalClicks += clicks;
        adsCsvTotalImpressions += impr;

        const camp = ad.campaignName || 'Kampania';
        if (!adsCampaignsMap[camp]) {
            adsCampaignsMap[camp] = { campaignName: camp, impressions: 0, clicks: 0, costNetPln: 0, adRevenuePln: 0, unitsSold: 0 };
        }
        adsCampaignsMap[camp].impressions += impr;
        adsCampaignsMap[camp].clicks += clicks;
        adsCampaignsMap[camp].costNetPln += costNet;
        adsCampaignsMap[camp].adRevenuePln += rev;
        adsCampaignsMap[camp].unitsSold += units;

        const targetSkuKey = (ad.sku && skuMap[ad.sku] ? ad.sku : null) || (ad.offerId ? auctionToSkuKey[String(ad.offerId)] : null);
        if (targetSkuKey && skuMap[targetSkuKey]) {
            const sObj = skuMap[targetSkuKey];
            sObj.adsCsvImpressions += impr;
            sObj.adsCsvClicks += clicks;
            sObj.adsCsvCostNetPln += costNet;
            sObj.adsCsvRevenuePln += rev;
            sObj.adsCsvUnitsSold += units;
        }
    }

    // 5. Wyliczanie braków (JEDEN zjednoczony stan `stock <= stockoutThreshold`), ROP, ABC-XYZ, Leżaki, True Net Profit, Krwawiące Oferty
    const spanDays = (maxOrderTs > minOrderTs && minOrderTs < Infinity)
        ? Math.max(1, Math.round((maxOrderTs - minOrderTs) / 86400))
        : 30;

    const allStockouts = [];
    const bleedingOffers = [];
    const deadStockItems = [];
    const spikesAndDrops = [];
    const crossChannelGaps = [];
    const actionQueue = [];

    let totalLostDirectPln = 0;
    let totalLostCrossSellPln = 0;
    let totalLostRelevancePln = 0;
    let totalLostNetProfitPln = 0;
    let totalRecommendedPurchaseBudgetPln = 0;

    let verifiedRevenueGrossPln = 0;
    let verifiedRevenueNetPln = 0;
    let verifiedCogsPln = 0;
    let verifiedLogisticsPln = 0;
    let verifiedFeesPln = 0;
    let verifiedAdsCostPln = 0;
    let verifiedNetProfitPln = 0;
    let totalInventoryCostPln = 0;

    for (const sObj of Object.values(skuMap)) {
        sObj.orderTimestamps.sort((a, b) => a - b);
        sObj.avgPricePln = sObj.totalUnits > 0 ? (sObj.totalRevenuePln / sObj.totalUnits) : 0;
        sObj.avgMultiShare = sObj.multiOrdersCount > 0 ? (sObj.multiShareSum / sObj.multiOrdersCount) : 0;
        sObj.avgMultiBasketValue = sObj.multiOrdersCount > 0 ? (sObj.multiBasketValueSum / sObj.multiOrdersCount) : sObj.avgPricePln;
        sObj.isSeasonalProduct = SEASONAL_KEYWORDS_RX.test(sObj.name);

        // Rola w koszyku
        if (sObj.primaryDriverCount >= 5 && sObj.avgMultiShare >= 0.48) {
            sObj.role = 'ANCHOR';
        } else if (sObj.multiOrdersCount >= 5 && sObj.avgMultiShare < 0.38) {
            sObj.role = 'FILLER';
        } else {
            sObj.role = 'SOLO';
        }

        // Ciągłość ID i kanibalizacja aukcji
        for (const wb of Object.values(sObj.weeklyBuckets)) {
            if (wb.auctionsSet.size >= 2) sObj.parallelAuctionsDetected = true;
        }
        if (sObj.auctionHistory.size >= 2) {
            const sortedAuc = Array.from(sObj.auctionHistory.values()).sort((a, b) => a.firstTs - b.firstTs);
            for (let k = 1; k < sortedAuc.length; k++) {
                if (sortedAuc[k].firstTs > sortedAuc[k - 1].lastTs) {
                    sObj.brokenAuctionContinuity = true;
                }
            }
        }

        // Detekcja braków (WYŁĄCZNIE jednolity próg stock <= stockoutThreshold — brak podziału 0 vs 1-2!)
        const blLogs = sObj.baselinkerProductId && stockLogsByProductId[sObj.baselinkerProductId]
            ? stockLogsByProductId[sObj.baselinkerProductId]?.stockChanges || []
            : [];

        if (blLogs.length > 0) {
            sObj.stockoutSource = `LOGI API (Stan ≤ ${stockoutThreshold} szt.)`;
            let inOutage = false;
            let outageStart = 0;
            for (const lg of blLogs) {
                if (!inOutage && lg.to <= stockoutThreshold) {
                    inOutage = true;
                    outageStart = lg.date;
                } else if (inOutage && lg.to > stockoutThreshold) {
                    const days = Math.max(1, Math.round((lg.date - outageStart) / 86400));
                    sObj.stockouts.push({ startTs: outageStart, endTs: lg.date, days, source: sObj.stockoutSource });
                    inOutage = false;
                }
            }
            if (inOutage && maxOrderTs > outageStart) {
                const days = Math.max(1, Math.round((maxOrderTs - outageStart) / 86400));
                sObj.stockouts.push({ startTs: outageStart, endTs: maxOrderTs, days, source: `Trwający brak (≤ ${stockoutThreshold} szt.)` });
            }
        } else if (sObj.snapshotDaysTotal.size >= 2 && sObj.snapshotDaysBelowThreshold.size > 0) {
            sObj.stockoutSource = `Migawki dzienne (Stan ≤ ${stockoutThreshold} szt.)`;
            const sortedDays = Array.from(sObj.snapshotDaysTotal).sort();
            let inOutage = false;
            let startMs = 0;
            let prevMs = 0;
            for (const dStr of sortedDays) {
                const ms = new Date(`${dStr}T00:00:00Z`).getTime();
                const below = sObj.snapshotDaysBelowThreshold.has(dStr);
                if (!inOutage && below) {
                    inOutage = true;
                    startMs = ms;
                } else if (inOutage && !below) {
                    const days = Math.max(1, Math.round((prevMs - startMs) / 86400000) + 1);
                    sObj.stockouts.push({ startTs: Math.floor(startMs / 1000), endTs: Math.floor(ms / 1000), days, source: sObj.stockoutSource });
                    inOutage = false;
                }
                prevMs = ms;
            }
            if (inOutage) {
                const days = Math.max(1, Math.round((prevMs - startMs) / 86400000) + 1);
                sObj.stockouts.push({ startTs: Math.floor(startMs / 1000), endTs: Math.floor(prevMs / 1000), days, source: sObj.stockoutSource });
            }
        } else if (sObj.ordersCount >= 10) {
            sObj.stockoutSource = `Luka w transakcjach (Stan ≤ ${stockoutThreshold} szt.)`;
            const avgGapSec = (maxOrderTs - minOrderTs) / Math.max(1, sObj.ordersCount);
            const threshSec = Math.max(7 * 86400, avgGapSec * 4.2);
            for (let i = 1; i < sObj.orderTimestamps.length; i++) {
                const gapSec = sObj.orderTimestamps[i] - sObj.orderTimestamps[i - 1];
                if (gapSec >= threshSec) {
                    const rawDays = Math.round(gapSec / 86400);
                    if (applySeasonalFilter && sObj.isSeasonalProduct && rawDays >= 60) continue;
                    const days = applySeasonalFilter ? Math.min(rawDays, 45) : rawDays;
                    sObj.stockouts.push({ startTs: sObj.orderTimestamps[i - 1], endTs: sObj.orderTimestamps[i], days, source: sObj.stockoutSource });
                }
            }
        } else {
            sObj.stockoutSource = 'Brak przerw';
        }

        sObj.stockoutDays = sObj.stockouts.reduce((a, b) => a + b.days, 0);
        const activeSellingDays = Math.max(30, spanDays - sObj.stockoutDays);
        sObj.dailyVelocityWhenActive = sObj.totalUnits / activeSellingDays;
        const dailyOrdersWhenActive = sObj.ordersCount / activeSellingDays;

        // Kara Trafności po powrocie (14 dni przed vs 14 dni po braku)
        let preVelSum = 0;
        let postVelSum = 0;
        let measuredOutages = 0;
        for (const st of sObj.stockouts) {
            const mKey = new Date(st.startTs * 1000).toISOString().slice(0, 7);
            if (monthlyAgg[mKey]) monthlyAgg[mKey].stockoutStarts += 1;

            let unitsBefore = 0;
            let unitsAfter = 0;
            for (const [dStr, uCnt] of Object.entries(sObj.dailyUnits)) {
                const dTs = Math.floor(new Date(`${dStr}T12:00:00Z`).getTime() / 1000);
                if (dTs >= st.startTs - 14 * 86400 && dTs < st.startTs) unitsBefore += uCnt;
                if (dTs > st.endTs && dTs <= st.endTs + 14 * 86400) unitsAfter += uCnt;
            }
            const vPre = unitsBefore / 14;
            const vPost = unitsAfter / 14;
            if (vPre > 0) {
                preVelSum += vPre;
                postVelSum += vPost;
                measuredOutages++;
            }
        }
        sObj.preOutageVelocity = measuredOutages > 0 ? preVelSum / measuredOutages : sObj.dailyVelocityWhenActive;
        sObj.postOutageVelocity = measuredOutages > 0 ? postVelSum / measuredOutages : sObj.dailyVelocityWhenActive;
        sObj.relevanceDropPct = sObj.preOutageVelocity > 0
            ? round2(Math.max(0, (sObj.preOutageVelocity - sObj.postOutageVelocity) / sObj.preOutageVelocity) * 100)
            : 0;

        sObj.lostDirectPln = round2(sObj.stockoutDays * sObj.dailyVelocityWhenActive * sObj.avgPricePln);
        const avgCrossPerOrder = sObj.ordersCount > 0 ? sObj.crossSellGeneratedPln / sObj.ordersCount : 0;
        sObj.lostCrossSellPln = round2(sObj.stockoutDays * dailyOrdersWhenActive * avgCrossPerOrder);
        sObj.lostRelevancePln = round2(sObj.stockouts.length * 14 * Math.max(0, sObj.preOutageVelocity - sObj.postOutageVelocity) * sObj.avgPricePln);
        sObj.totalLostGmvPln = round2(sObj.lostDirectPln + sObj.lostCrossSellPln + sObj.lostRelevancePln);

        totalLostDirectPln += sObj.lostDirectPln;
        totalLostCrossSellPln += sObj.lostCrossSellPln;
        totalLostRelevancePln += sObj.lostRelevancePln;

        // Jednolity zapas sprzedażowy (stan <= stockoutThreshold => sellableStock = 0, BRAK W OFERCIE)
        sObj.isCurrentlyUnavailable = sObj.currentStock !== null && sObj.currentStock <= stockoutThreshold;
        sObj.sellableStock = sObj.currentStock !== null ? Math.max(0, sObj.currentStock - stockoutThreshold) : null;
        sObj.daysOfInventory = (sObj.sellableStock !== null && sObj.dailyVelocityWhenActive > 0)
            ? round2(sObj.sellableStock / sObj.dailyVelocityWhenActive)
            : null;

        // Kalkulator zatowarowania ROP Min-Max (z uwzględnieniem otwartych PO i boostem +10pp bufora dla Kotwic)
        const effSafety = sObj.role === 'ANCHOR' ? defaultSafetyBufferPct + 0.10 : defaultSafetyBufferPct;
        sObj.recommendedRop = Math.ceil(sObj.dailyVelocityWhenActive * sObj.leadTimeDays * (1 + effSafety)) + stockoutThreshold;
        if (sObj.currentStock !== null && sObj.currentStock <= sObj.recommendedRop && sObj.dailyVelocityWhenActive > 0) {
            const targetMaxStock = Math.ceil(sObj.recommendedRop + sObj.dailyVelocityWhenActive * 21);
            sObj.recommendedOrderQty = Math.max(0, targetMaxStock - sObj.currentStock - sObj.openPoQty);
        } else {
            sObj.recommendedOrderQty = 0;
        }
        sObj.purchaseBudgetPln = sObj.cogsPerUnit ? round2(sObj.recommendedOrderQty * sObj.cogsPerUnit) : null;
        if (sObj.purchaseBudgetPln) totalRecommendedPurchaseBudgetPln += sObj.purchaseBudgetPln;

        // True Unit & SKU Economics (WYŁĄCZNIE dla zweryfikowanego COGS w PIM!)
        const effectiveAdsCost = sObj.adsCsvCostNetPln > 0 ? sObj.adsCsvCostNetPln : sObj.billingAdsPln;
        const effectiveFees = sObj.billingCommissionPln + sObj.billingSmartPln + sObj.billingPromoFeePln;
        sObj.hasVerifiedCogs = sObj.cogsPerUnit !== null && sObj.cogsPerUnit > 0;
        sObj.conversionRatePct = sObj.deltaVisits > 0 ? round2((sObj.ordersCount / sObj.deltaVisits) * 100) : null;

        if (sObj.hasVerifiedCogs) {
            const netRevPln = sObj.totalRevenuePln / (1 + (sObj.taxRate / 100));
            const totalCogs = sObj.totalUnits * sObj.cogsPerUnit;
            const totalLog = sObj.totalUnits * sObj.logisticsPerUnit;
            const netProfit = netRevPln - totalCogs - totalLog - effectiveFees - effectiveAdsCost;
            const netMarginPct = netRevPln > 0 ? (netProfit / netRevPln) * 100 : 0;

            sObj.verifiedNetRevenuePln = round2(netRevPln);
            sObj.verifiedCogsPln = round2(totalCogs);
            sObj.verifiedLogisticsPln = round2(totalLog);
            sObj.verifiedFeesPln = round2(effectiveFees);
            sObj.verifiedAdsCostPln = round2(effectiveAdsCost);
            sObj.verifiedNetProfitPln = round2(netProfit);
            sObj.verifiedNetMarginPct = round2(netMarginPct);
            sObj.lostNetProfitPln = round2(sObj.totalLostGmvPln * (netMarginPct > 0 ? netMarginPct / 100 : 0));

            if (sObj.totalUnits > 0) {
                verifiedRevenueGrossPln += sObj.totalRevenuePln;
                verifiedRevenueNetPln += netRevPln;
                verifiedCogsPln += totalCogs;
                verifiedLogisticsPln += totalLog;
                verifiedFeesPln += effectiveFees;
                verifiedAdsCostPln += effectiveAdsCost;
                verifiedNetProfitPln += netProfit;
                totalLostNetProfitPln += sObj.lostNetProfitPln;
            }
            if (sObj.currentStock !== null && sObj.currentStock > 0) {
                totalInventoryCostPln += sObj.currentStock * sObj.cogsPerUnit;
            }
        } else {
            sObj.verifiedNetProfitPln = null;
            sObj.verifiedNetMarginPct = null;
            sObj.lostNetProfitPln = null;
        }

        // Wykrywanie Krwawiących Ofert (wyróżnienie/Ads przy braku <= stockoutThreshold lub ujemnej marży lub 0 sprzedaży)
        const hasActivePaidPromo = sObj.allegroIsPromoted || sObj.billingPromoFeePln > 0 || effectiveAdsCost > 0;
        if (hasActivePaidPromo && (sObj.isCurrentlyUnavailable || (sObj.verifiedNetProfitPln !== null && sObj.verifiedNetProfitPln < 0) || sObj.totalUnits === 0)) {
            const bleedReason = sObj.isCurrentlyUnavailable
                ? `Płatne promowanie/Ads aktywne mimo braku w ofercie (stan ${sObj.currentStock} ≤ ${stockoutThreshold} szt.)`
                : (sObj.verifiedNetProfitPln !== null && sObj.verifiedNetProfitPln < 0
                    ? `Ujemny zysk netto (${round2(sObj.verifiedNetProfitPln)} zł) po kosztach prowizji i promocji`
                    : 'Płatne promowanie/Ads przy 0 sprzedanych sztukach w analizowanym okresie');
            bleedingOffers.push({
                sku: sObj.sku,
                name: sObj.name,
                pimProductId: sObj.pimProductId,
                currentStock: sObj.currentStock,
                promoAndAdsCostPln: round2(sObj.billingPromoFeePln + effectiveAdsCost),
                verifiedNetProfitPln: sObj.verifiedNetProfitPln,
                reason: bleedReason
            });
        }

        // Wykrywanie Leżaków Magazynowych (Dead Stock / Slow Movers)
        const lastSaleTs = sObj.orderTimestamps.length > 0 ? sObj.orderTimestamps[sObj.orderTimestamps.length - 1] : 0;
        const refNowSec = maxOrderTs > 0 ? maxOrderTs : Math.floor(Date.now() / 1000);
        const daysSinceLastSale = lastSaleTs > 0 ? Math.round((refNowSec - lastSaleTs) / 86400) : 999;
        if (sObj.currentStock !== null && sObj.currentStock > stockoutThreshold && (sObj.totalUnits === 0 || daysSinceLastSale >= 60 || (sObj.daysOfInventory !== null && sObj.daysOfInventory > 150))) {
            const frozenPln = sObj.cogsPerUnit ? round2(sObj.currentStock * sObj.cogsPerUnit) : null;
            let deadAction = 'OBNIZ_CENE_LUB_ZESTAW';
            if (hasActivePaidPromo) deadAction = 'WYLACZ_WYR_I_ADS';
            else if (sObj.currentStock <= stockoutThreshold + 3) deadAction = 'WYPRZEDAJ_DO_ZERA_PROG_0';
            else if (sObj.totalUnits === 0) deadAction = 'STREFA_OKAZJI_LUB_ZESTAW_Z_KOTWICA';
            deadStockItems.push({
                sku: sObj.sku,
                name: sObj.name,
                pimProductId: sObj.pimProductId,
                currentStock: sObj.currentStock,
                totalUnitsSold: sObj.totalUnits,
                daysSinceLastSale,
                daysOfInventory: sObj.daysOfInventory,
                frozenCapitalPln: frozenPln,
                recommendedAction: deadAction
            });
        }

        // Luki Cross-Channel (Allegro <-> InPost Von Halsky)
        const hasAllegroPresence = sObj.allegroOfferIds.size > 0 || sObj.channelsSold.has('ALLEGRO');
        const hasVhPublished = sObj.vonHalskyStatus === 'PUBLISHED';
        if (hasAllegroPresence && sObj.totalRevenuePln >= 300 && !hasVhPublished) {
            const gapReason = sObj.vonHalskyStatus === 'REJECTED'
                ? `Oferta ODRZUCONA na Von Halsky (${sObj.vonHalskyRejections[0] || 'błąd walidacji'})`
                : (sObj.vonHalskyStatus ? `Status na Von Halsky: ${sObj.vonHalskyStatus}` : 'Brak oferty na InPost Von Halsky');
            crossChannelGaps.push({
                sku: sObj.sku,
                name: sObj.name,
                pimProductId: sObj.pimProductId,
                allegroRevenuePln: round2(sObj.totalRevenuePln),
                currentStock: sObj.currentStock,
                vonHalskyStatus: sObj.vonHalskyStatus || 'MISSING',
                gapReason,
                estimatedMonthlyOpportunityPln: round2((sObj.totalRevenuePln / Math.max(1, spanDays / 30)) * 0.15)
            });
        }

        if (sObj.stockouts.length > 0) allStockouts.push(sObj);

        // Detektor skoków (+65%) i spadków (-40%) sprzedaży tydzień do tygodnia
        const weekKeys = Object.keys(sObj.weeklyBuckets).sort();
        if (weekKeys.length >= 4 && sObj.totalUnits >= 12) {
            const avgWeekly = sObj.totalUnits / weekKeys.length;
            const wkVals = weekKeys.map(k => sObj.weeklyBuckets[k].units);
            sObj.weeklyCv = round2(computeCoefficientOfVariation(wkVals));

            for (const wk of weekKeys) {
                const wb = sObj.weeklyBuckets[wk];
                const wkTs = Math.floor(new Date(`${wk}T00:00:00Z`).getTime() / 1000);
                const wkPrice = wb.units > 0 ? wb.revenue / wb.units : sObj.avgPricePln;
                const priceDiffPct = sObj.avgPricePln > 0 ? ((wkPrice - sObj.avgPricePln) / sObj.avgPricePln) * 100 : 0;

                if (wb.units >= Math.max(6, avgWeekly * 1.65)) {
                    const justRestocked = sObj.stockouts.some(st => Math.abs(wkTs - st.endTs) <= 9 * 86400);
                    let cause = 'Skok popytu organicznego / sezonowego';
                    let action = 'Podnieś bufor bezpieczeństwa ROP przed kolejnym szczytem.';
                    if (priceDiffPct <= -7) {
                        cause = `Obniżka ceny (${priceDiffPct.toFixed(1)}%) — wysoka elastyczność cenowa`;
                        action = 'Produkt silnie reaguje na promocję cenową i kampanie.';
                    } else if (justRestocked) {
                        cause = `Odbicie po wyjściu ze stanu braku (≤ ${stockoutThreshold} szt.)`;
                        action = `Utrzymuj zapas powyżej progu zamknięcia (${stockoutThreshold} szt.).`;
                    } else if (wb.companionUnits / wb.units >= 0.55) {
                        cause = 'Efekt pociągowy Kotwicy (Cross-sell w koszykach 2+)';
                        action = 'Utwórz gotowy zestaw Kup Razem z główną Kotwicą.';
                    } else if (wb.multiPackOrders / Math.max(1, wb.orders) >= 0.4) {
                        cause = `Efekt wielopaku pod próg Smart! (${smartThresholdPln.toFixed(2)} zł)`;
                        action = 'Włącz rabat wielosztukowy (np. -5% na kolejną sztukę).';
                    }
                    spikesAndDrops.push({
                        type: 'SPIKE',
                        week: wk,
                        sku: sObj.sku,
                        name: sObj.name,
                        weekUnits: wb.units,
                        avgWeeklyUnits: round2(avgWeekly),
                        changePct: round2(((wb.units - avgWeekly) / avgWeekly) * 100),
                        cause,
                        action
                    });
                } else if (avgWeekly >= 5 && wb.units <= avgWeekly * 0.55) {
                    const hadOutage = sObj.stockouts.some(st => wkTs >= st.startTs - 86400 && wkTs <= st.endTs + 7 * 86400);
                    let cause = 'Spadek konwersji lub wzrost konkurencji cenowej';
                    let action = 'Sprawdź cenę konkurencji, konwersję z odwiedzin oraz Jakość Sprzedaży.';
                    if (hadOutage) {
                        cause = `Wyłączenie ofert z powodu braku (stan ≤ ${stockoutThreshold} szt.)`;
                        action = 'Uzupełnij stan magazynowy i zachowaj oryginalne ID aukcji.';
                    } else if (priceDiffPct >= 7) {
                        cause = `Podwyżka ceny (+${priceDiffPct.toFixed(1)}%) — opór cenowy klientów`;
                        action = 'Przetestuj powrót ceny bazowej lub dołączenie do Programu Cenowego.';
                    }
                    spikesAndDrops.push({
                        type: 'DROP',
                        week: wk,
                        sku: sObj.sku,
                        name: sObj.name,
                        weekUnits: wb.units,
                        avgWeeklyUnits: round2(avgWeekly),
                        changePct: round2(((wb.units - avgWeekly) / avgWeekly) * 100),
                        cause,
                        action
                    });
                }
            }
        } else {
            sObj.weeklyCv = 0;
        }
    }

    // 6. Klasyfikacja ABC-XYZ na posortowanej liście przychodów
    const skuList = Object.values(skuMap).sort((a, b) => (b.totalRevenuePln + b.crossSellGeneratedPln) - (a.totalRevenuePln + a.crossSellGeneratedPln));
    let cumRev = 0;
    for (const sObj of skuList) {
        cumRev += sObj.totalRevenuePln;
        const cumPct = totalGmvPln > 0 ? (cumRev / totalGmvPln) * 100 : 100;
        sObj.abcClass = cumPct <= 80 ? 'A' : (cumPct <= 95 ? 'B' : 'C');
        sObj.xyzClass = sObj.weeklyCv <= 0.5 ? 'X' : (sObj.weeklyCv <= 1.0 ? 'Y' : 'Z');
        sObj.abcXyz = `${sObj.abcClass}${sObj.xyzClass}`;

        // Konwertujemy Set -> Array do serializacji JSON
        sObj.channelsSold = Array.from(sObj.channelsSold);
        sObj.allegroOfferIds = Array.from(sObj.allegroOfferIds);
        sObj.vonHalskyOfferIds = Array.from(sObj.vonHalskyOfferIds);
        sObj.auctionCount = sObj.auctionHistory.size;
        delete sObj.auctionHistory;
        delete sObj.snapshotDaysBelowThreshold;
        delete sObj.snapshotDaysTotal;
        delete sObj.weeklyBuckets;
        delete sObj.orderTimestamps;
    }

    // 7. Pary koszykowe (Lift, Confidence, Smart! 49.90)
    const pairs = Object.values(pairMap)
        .map(p => {
            const cntA = skuMap[p.skuKeyA]?.ordersCount || 1;
            const cntB = skuMap[p.skuKeyB]?.ordersCount || 1;
            const suppA = cntA / Math.max(1, totalOrders);
            const suppB = cntB / Math.max(1, totalOrders);
            const suppPair = p.coCount / Math.max(1, totalOrders);
            const confidence = suppA > 0 ? suppPair / suppA : 0;
            const lift = suppB > 0 ? confidence / suppB : 1;
            return {
                ...p,
                confidencePct: round2(confidence * 100),
                supportPct: round2(suppPair * 100),
                lift: round2(lift),
                avgBasketPln: round2(p.basketValSum / Math.max(1, p.coCount)),
                recommendation: lift >= 1.5
                    ? 'Silna synergia (Lift ≥ 1.5) — utwórz stały Zestaw Allegro + Program Cenowy'
                    : 'Dobre parowanie pod próg Smart! (49,90 zł)'
            };
        })
        .sort((a, b) => b.coCount - a.coCount || b.lift - a.lift);

    // 8. Podsumowanie P&L i Jakości
    const totalLostGmvPln = round2(totalLostDirectPln + totalLostCrossSellPln + totalLostRelevancePln);
    const fullPotentialGmvPln = round2(totalGmvPln + totalLostGmvPln);
    const cogsCoveragePct = totalGmvPln > 0 ? round2((verifiedRevenueGrossPln / totalGmvPln) * 100) : 0;
    const verifiedNetMarginPct = verifiedRevenueNetPln > 0 ? round2((verifiedNetProfitPln / verifiedRevenueNetPln) * 100) : null;

    const effectiveTotalAdsSpend = adsCsvTotalSpendNet > 0 ? adsCsvTotalSpendNet : feeTotals.adsBillingPln;
    const roas = effectiveTotalAdsSpend > 0 && adsCsvTotalRevenue > 0 ? round2(adsCsvTotalRevenue / effectiveTotalAdsSpend) : null;
    const tacosPct = effectiveTotalAdsSpend > 0 && totalGmvPln > 0 ? round2((effectiveTotalAdsSpend / totalGmvPln) * 100) : null;
    const poas = (effectiveTotalAdsSpend > 0 && verifiedNetMarginPct !== null && adsCsvTotalRevenue > 0)
        ? round2((adsCsvTotalRevenue * (verifiedNetMarginPct / 100)) / effectiveTotalAdsSpend)
        : null;
    const annualizedNetProfit = verifiedNetProfitPln * (365 / Math.max(30, spanDays));
    const gmroi = totalInventoryCostPln > 0 ? round2(annualizedNetProfit / totalInventoryCostPln) : null;

    const pnlWaterfall = [
        { name: 'Obrót Brutto (GMV)', value: round2(verifiedRevenueGrossPln || totalGmvPln) },
        { name: 'VAT', value: -round2(Math.max(0, (verifiedRevenueGrossPln || 0) - verifiedRevenueNetPln)) },
        { name: 'COGS (Zakup)', value: -round2(verifiedCogsPln) },
        { name: 'Logistyka & BDO', value: -round2(verifiedLogisticsPln) },
        { name: 'Prowizje & Smart!', value: -round2(feeTotals.commissionPln - feeTotals.commissionRefundPln + feeTotals.smartFeePln) },
        { name: 'Wyróżnienia & Ads', value: -round2(feeTotals.promoFeePln + effectiveTotalAdsSpend) },
        { name: 'Zysk Netto (Zweryfik.)', value: round2(verifiedNetProfitPln) }
    ];

    // Najnowsze snapshoty jakości (Allegro + Von Halsky + BaseLinker)
    const latestQualityByPlatform = {};
    for (const q of qualitySnapshots.sort((a, b) => new Date(b.snapshotDate).getTime() - new Date(a.snapshotDate).getTime())) {
        if (!latestQualityByPlatform[`${q.platform}:${q.accountId}`]) {
            latestQualityByPlatform[`${q.platform}:${q.accountId}`] = q;
        }
    }

    // 9. Złożenie Kolejki Decyzyjnej (`actionQueue`)
    const anchorsAtRisk = skuList.filter(s => s.role === 'ANCHOR' && (s.isCurrentlyUnavailable || (s.currentStock !== null && s.currentStock <= s.recommendedRop)));
    for (const a of anchorsAtRisk.slice(0, 10)) {
        actionQueue.push({
            severity: a.isCurrentlyUnavailable ? 'CRITICAL' : 'HIGH',
            category: 'PROCUREMENT',
            platform: 'OMNICHANNEL',
            sku: a.sku,
            pimProductId: a.pimProductId,
            title: `Pilne domówienie Kotwicy: ${a.name}`,
            detail: `Stan: ${a.currentStock ?? '?'} szt. (próg wyłączenia ≤ ${stockoutThreshold} szt.). Zamów min. ${a.recommendedOrderQty} szt. (ROP: ${a.recommendedRop} szt., w drodze PO: ${a.openPoQty}).`,
            impactPln: a.totalLostGmvPln
        });
    }
    for (const b of bleedingOffers.slice(0, 10)) {
        actionQueue.push({
            severity: 'CRITICAL',
            category: 'BLEEDING_PROMO',
            platform: 'ALLEGRO',
            sku: b.sku,
            pimProductId: b.pimProductId,
            title: `Wyłącz krwawiącą promocję / Ads: ${b.name}`,
            detail: b.reason,
            impactPln: b.promoAndAdsCostPln
        });
    }
    const deadZoneSkus = skuList.filter(s => s.soloUnderSmartCount >= 3).sort((a, b) => b.soloUnderSmartCount - a.soloUnderSmartCount);
    for (const dz of deadZoneSkus.slice(0, 8)) {
        actionQueue.push({
            severity: 'HIGH',
            category: 'SMART_BUNDLE',
            platform: 'ALLEGRO',
            sku: dz.sku,
            pimProductId: dz.pimProductId,
            title: `Martwa strefa Smart! (< ${smartThresholdPln.toFixed(2)} zł): ${dz.name}`,
            detail: `${dz.soloUnderSmartCount}x zakupiony solo w przedziale ${smartDeadZoneMin.toFixed(0)}–${(smartThresholdPln - 0.01).toFixed(2)} zł. Podepnij Zestaw Kup Razem z dopełniaczem.`,
            impactPln: round2(dz.soloUnderSmartCount * 18)
        });
    }
    for (const g of crossChannelGaps.slice(0, 8)) {
        actionQueue.push({
            severity: g.vonHalskyStatus === 'REJECTED' ? 'HIGH' : 'MEDIUM',
            category: 'EXPANSION',
            platform: 'VONHALSKY',
            sku: g.sku,
            pimProductId: g.pimProductId,
            title: `${g.vonHalskyStatus === 'REJECTED' ? 'Napraw odrzuconą ofertę' : 'Wystaw bestseller'} na InPost Von Halsky: ${g.name}`,
            detail: g.gapReason,
            impactPln: g.estimatedMonthlyOpportunityPln
        });
    }
    for (const d of deadStockItems.slice(0, 8)) {
        actionQueue.push({
            severity: 'MEDIUM',
            category: 'DEAD_STOCK',
            platform: 'OMNICHANNEL',
            sku: d.sku,
            pimProductId: d.pimProductId,
            title: `Uwolnij gotówkę z leżaka: ${d.name}`,
            detail: `Zapas: ${d.currentStock} szt., brak sprzedaży od ${d.daysSinceLastSale} dni. Akcja: ${d.recommendedAction}.`,
            impactPln: d.frozenCapitalPln || 0
        });
    }

    const sevWeight = { CRITICAL: 3, HIGH: 2, MEDIUM: 1 };
    actionQueue.sort((a, b) => (sevWeight[b.severity] || 0) - (sevWeight[a.severity] || 0) || (b.impactPln || 0) - (a.impactPln || 0));

    const brokenIdSkus = skuList.filter(s => s.brokenAuctionContinuity);
    const parallelDupSkus = skuList.filter(s => s.parallelAuctionsDetected);
    const unavailableNowCount = skuList.filter(s => s.isCurrentlyUnavailable).length;

    return {
        meta: {
            platform,
            marketFilter,
            stockoutThreshold,
            smartThresholdPln,
            smartDeadZoneMin,
            leadTimeDays: defaultLeadTimeDays,
            safetyBufferPct: defaultSafetyBufferPct,
            spanDays,
            totalSkusAnalyzed: skuList.length,
            cogsCoveragePct
        },
        kpis: {
            totalGmvPln: round2(totalGmvPln),
            fullPotentialGmvPln,
            potentialRealizedPct: fullPotentialGmvPln > 0 ? round2((totalGmvPln / fullPotentialGmvPln) * 100) : 100,
            totalOrders,
            totalUnits,
            multiOrdersCount,
            multiOrdersSharePct: totalOrders > 0 ? round2((multiOrdersCount / totalOrders) * 100) : 0,
            multiGmvPln: round2(multiGmvPln),
            avgBasketMultiPln: multiOrdersCount > 0 ? round2(multiGmvPln / multiOrdersCount) : 0,
            avgBasketSoloPln: soloOrdersCount > 0 ? round2(soloGmvPln / soloOrdersCount) : 0,
            crossSellTotalPln: round2(skuList.reduce((acc, s) => acc + s.crossSellGeneratedPln, 0)),
            totalLostDirectPln: round2(totalLostDirectPln),
            totalLostCrossSellPln: round2(totalLostCrossSellPln),
            totalLostRelevancePln: round2(totalLostRelevancePln),
            totalLostGmvPln,
            totalLostNetProfitPln: round2(totalLostNetProfitPln),
            totalStockoutDays: skuList.reduce((acc, s) => acc + s.stockoutDays, 0),
            stockoutSkusCount: allStockouts.length,
            unavailableNowCount,
            recommendedPurchaseBudgetPln: round2(totalRecommendedPurchaseBudgetPln),
            verifiedNetProfitPln: round2(verifiedNetProfitPln),
            verifiedNetMarginPct,
            effectiveAdsSpendPln: round2(effectiveTotalAdsSpend),
            adsRevenuePln: round2(adsCsvTotalRevenue),
            roas,
            poas,
            tacosPct,
            gmroi,
            bleedingOffersCount: bleedingOffers.length,
            deadStockCount: deadStockItems.length,
            deadStockFrozenPln: round2(deadStockItems.reduce((a, d) => a + (d.frozenCapitalPln || 0), 0)),
            brokenIdSkusCount: brokenIdSkus.length,
            parallelDuplicatesCount: parallelDupSkus.length,
            deadZoneSmartCount: deadZoneSkus.length,
            crossChannelGapsCount: crossChannelGaps.length,
            anchorsCount: skuList.filter(s => s.role === 'ANCHOR').length,
            fillersCount: skuList.filter(s => s.role === 'FILLER').length
        },
        pnlWaterfall,
        feeTotals: Object.fromEntries(Object.entries(feeTotals).map(([k, v]) => [k, round2(v)])),
        marketBreakdown: Object.values(marketBreakdown).map(m => ({ ...m, rawSum: round2(m.rawSum), plnSum: round2(m.plnSum) })),
        channelBreakdown: Object.values(channelBreakdown).map(c => ({ ...c, gmvPln: round2(c.gmvPln) })),
        monthlyTrend: Object.values(monthlyAgg).sort((a, b) => a.month.localeCompare(b.month)).map(m => ({ ...m, gmvPln: round2(m.gmvPln) })),
        skus: skuList,
        pairs: pairs.slice(0, 100),
        bleedingOffers,
        deadStockItems: deadStockItems.sort((a, b) => (b.frozenCapitalPln || 0) - (a.frozenCapitalPln || 0)),
        crossChannelGaps: crossChannelGaps.sort((a, b) => b.estimatedMonthlyOpportunityPln - a.estimatedMonthlyOpportunityPln),
        spikesAndDrops: spikesAndDrops.sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct)).slice(0, 120),
        adsCampaigns: Object.values(adsCampaignsMap).map(c => ({
            ...c,
            costNetPln: round2(c.costNetPln),
            adRevenuePln: round2(c.adRevenuePln),
            ctrPct: c.impressions > 0 ? round2((c.clicks / c.impressions) * 100) : 0,
            cpcPln: c.clicks > 0 ? round2(c.costNetPln / c.clicks) : 0,
            roas: c.costNetPln > 0 ? round2(c.adRevenuePln / c.costNetPln) : 0
        })),
        vonHalskyDiagnostics: {
            offerStatusCounts: vhStatusCounts,
            rejectionGroups: Object.entries(vhRejectionGroups).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
            deliveryMix: vhDeliveryMix,
            paymentMix: vhPaymentMix,
            avgAcceptHours: vhAcceptCnt > 0 ? round2(vhAcceptHoursSum / vhAcceptCnt) : null,
            avgShipHours: vhShipCnt > 0 ? round2(vhShipHoursSum / vhShipCnt) : null,
            programOrdersCount: vhProgramOrdersCount,
            programDiscountPlatformPln: round2(vhProgramDiscountPlatformPln),
            programDiscountMerchantPln: round2(vhProgramDiscountMerchantPln)
        },
        qualitySnapshots: Object.values(latestQualityByPlatform),
        actionQueue: actionQueue.slice(0, 50)
    };
}

module.exports = {
    deduplicateOrders,
    runSalesIntelligenceAnalysis
};
