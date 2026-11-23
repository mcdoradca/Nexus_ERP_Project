const prisma = require('../../../core/prisma');
const BaseLinkerService = require('../../offer-optimizer/baselinker.service');
const {
    round2,
    utcDayMidnight,
    normalizeCurrencyCode,
    resolveFxRate,
    inferMarketplaceFromOrder,
    isShippingLineItem
} = require('../utils/currency.helpers');

/**
 * Klasyfikuje kanał źródłowy zamówienia Base.com na podstawie pola `order_source` i słownika `getOrderSources`.
 */
function classifyBaseLinkerOrigin(orderSource = '', orderSourceId = '', sourcesDict = {}) {
    const srcLower = String(orderSource || '').toLowerCase().trim();
    const mappedName = String(sourcesDict?.[srcLower]?.[String(orderSourceId)] || '').toLowerCase();
    const combined = `${srcLower} ${mappedName}`.trim();

    if (combined.includes('allegro')) return 'ALLEGRO';
    if (combined.includes('vonhalsky') || combined.includes('inpost') || combined.includes('inpsa')) return 'VONHALSKY';
    if (/^(shop|sklep|woocommerce|prestashop|shoper|shopify|idosell|magento|opencart|personal|phone|manual)/.test(srcLower)) {
        return 'SHOP';
    }
    return combined ? 'OTHER' : 'OTHER';
}

function parseStockTotal(stockObjOrNum) {
    if (typeof stockObjOrNum === 'number') return Number.isFinite(stockObjOrNum) ? Math.max(0, Math.trunc(stockObjOrNum)) : 0;
    if (stockObjOrNum && typeof stockObjOrNum === 'object') {
        let sum = 0;
        for (const val of Object.values(stockObjOrNum)) {
            const n = Number(val);
            if (Number.isFinite(n)) sum += Math.max(0, Math.trunc(n));
        }
        return sum;
    }
    const parsed = parseInt(String(stockObjOrNum || '0'), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

function parseFirstPrice(pricesObjOrNum) {
    if (typeof pricesObjOrNum === 'number') return Number.isFinite(pricesObjOrNum) ? pricesObjOrNum : 0;
    if (pricesObjOrNum && typeof pricesObjOrNum === 'object') {
        for (const val of Object.values(pricesObjOrNum)) {
            const n = parseFloat(val);
            if (Number.isFinite(n) && n > 0) return n;
        }
    }
    return 0;
}

/**
 * Wykrywa zrzut logów stanów z BaseLinker `getInventoryProductLogs` (typ 1 = stan, typ 2 = cena)
 * i buduje listę zmian per dzień (do wyliczania dokładnych przerw <= stockoutThreshold).
 */
function parseBaseLinkerProductLogs(rawLogs = []) {
    const entries = Array.isArray(rawLogs) ? rawLogs : [];
    const stockChanges = [];
    const priceChanges = [];

    for (const lg of entries) {
        const logType = Number(lg?.log_type || 0);
        const ts = Number(lg?.date || 0);
        if (!ts || ts <= 0) continue;

        if (logType === 1) {
            const toVal = Number(lg?.to ?? lg?.value_to ?? lg?.new_value ?? 0);
            const fromVal = Number(lg?.from ?? lg?.value_from ?? lg?.old_value ?? toVal);
            stockChanges.push({
                date: ts,
                dayKey: utcDayMidnight(ts * 1000).toISOString().slice(0, 10),
                from: Number.isFinite(fromVal) ? fromVal : 0,
                to: Number.isFinite(toVal) ? toVal : 0
            });
        } else if (logType === 2) {
            const toVal = parseFloat(lg?.to ?? lg?.value_to ?? lg?.new_value ?? 0);
            const fromVal = parseFloat(lg?.from ?? lg?.value_from ?? lg?.old_value ?? toVal);
            if (Number.isFinite(toVal)) {
                priceChanges.push({
                    date: ts,
                    dayKey: utcDayMidnight(ts * 1000).toISOString().slice(0, 10),
                    from: Number.isFinite(fromVal) ? fromVal : toVal,
                    to: toVal
                });
            }
        }
    }

    stockChanges.sort((a, b) => a.date - b.date);
    priceChanges.sort((a, b) => a.date - b.date);
    return { stockChanges, priceChanges };
}

/**
 * Główny konektor synchronizujący dane analityczne z BaseLinker API dla wskazanego Workspace:
 * - Zamówienia aktywne (`getOrders`, max 90d wg retencji panelu, z paginacją chroniącą przed pętlą)
 * - Katalogi i stany (`getInventories`, `getInventoryProductsList`, `getInventoryProductsStock`, `getInventoryProductsPrices`)
 * - Otwarte zamówienia zakupu (`getInventoryPurchaseOrders`) & dokumenty magazynowe (`getInventoryDocuments`)
 * - Logi stanów i cen dla Top SKU (`getInventoryProductLogs`)
 * - Zwroty (`getOrderReturns`) i opcjonalnie SLA paczek (`getOrderPackages` + `getCourierPackagesStatusHistory`)
 */
async function syncBaseLinkerAnalytics({
    workspaceId,
    accountId = null,
    days = 90,
    fetchProductLogsTopN = 30,
    includePurchaseOrders = true,
    includeReturns = true,
    includeCourierSla = false,
    stockoutThreshold = 2,
    fxRates = {},
    injectedPrisma = prisma,
    baseLinkerApi = null
} = {}) {
    if (!workspaceId) {
        throw new Error('Wymagany jest identyfikator klienta (workspaceId) do synchronizacji BaseLinker.');
    }

    const callApi = baseLinkerApi?.rawCall || BaseLinkerService.rawCall.bind(BaseLinkerService);

    let targetAccounts = [];
    if (accountId) {
        targetAccounts = [{ id: String(accountId), label: `BaseLinker #${accountId}` }];
    } else if (injectedPrisma?.integrationAccount?.findMany) {
        const rows = await injectedPrisma.integrationAccount.findMany({
            where: { workspaceId, provider: 'BASELINKER', isActive: true },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
        });
        targetAccounts = rows.map(r => ({ id: r.id, label: r.label || 'BaseLinker' }));
    }

    if (targetAccounts.length === 0) {
        if (baseLinkerApi) {
            targetAccounts = [{ id: null, label: 'BaseLinker (Test)' }];
        } else {
            return {
                platform: 'BASELINKER',
                configured: false,
                accountsSynced: 0,
                ordersImported: 0,
                snapshotsSaved: 0,
                warnings: ['Brak skonfigurowanego konta BaseLinker dla wybranego klienta. Dodaj token w Panelu Admina -> Integracje API.']
            };
        }
    }

    const effectiveDays = Math.min(Math.max(Number(days) || 90, 1), 120);
    const cutoffSec = Math.floor(Date.now() / 1000) - effectiveDays * 86400;
    const todayMidnight = utcDayMidnight(new Date());

    let totalOrdersImported = 0;
    let totalOrdersSkipped = 0;
    let totalSnapshotsSaved = 0;
    let totalReturnsFound = 0;
    const openPurchaseOrdersBySku = {};
    const productLogsSummary = {};
    const warnings = [];
    const accountsResults = [];

    const batch = await injectedPrisma.analyticsImportBatch.create({
        data: {
            workspaceId,
            platform: 'BASELINKER',
            sourceType: 'API_SYNC',
            accountId: accountId || null,
            status: 'PROCESSING',
            warnings: []
        }
    });

    let minOrderDate = null;
    let maxOrderDate = null;

    for (const acc of targetAccounts) {
        const ctx = acc.id ? { workspaceId, accountId: acc.id } : { workspaceId };
        const effAccountId = acc.id || 'default';
        let accOrdersCount = 0;
        let accSnapshotsCount = 0;

        // 1. Słowniki źródeł i statusów (wykrywanie anulowanych zamówień)
        let sourcesDict = {};
        const cancelledStatusIds = new Set();
        try {
            const srcRes = await callApi('getOrderSources', {}, ctx);
            sourcesDict = srcRes?.sources || {};
        } catch (err) {
            warnings.push(`[${acc.label}] Nie udało się pobrać słownika źródeł zamówień: ${err.message}`);
        }
        try {
            const stRes = await callApi('getOrderStatusList', {}, ctx);
            const statuses = Array.isArray(stRes?.statuses) ? stRes.statuses : [];
            for (const st of statuses) {
                const nm = String(st?.name || '').toLowerCase();
                if (/anul|cancel|rezygn|zwrot\s+ca[łl]k|odrzu/i.test(nm)) {
                    cancelledStatusIds.add(String(st.id));
                }
            }
        } catch (err) {
            warnings.push(`[${acc.label}] Nie udało się pobrać listy statusów zamówień: ${err.message}`);
        }

        // 2. Paginacja getOrders
        let cursorTs = cutoffSec;
        const seenOrderIds = new Set();
        const productSalesCounter = new Map();
        const recentOrderIdsForSla = [];

        for (let page = 0; page < 150; page++) {
            let ordRes;
            try {
                ordRes = await callApi('getOrders', {
                    date_confirmed_from: cursorTs,
                    get_unconfirmed_orders: false,
                    include_commission_data: true,
                    include_connect_data: true
                }, ctx);
            } catch (err) {
                warnings.push(`[${acc.label}] Błąd pobierania zamówień (strona ${page + 1}): ${err.message}`);
                break;
            }

            const batchOrders = Array.isArray(ordRes?.orders) ? ordRes.orders : [];
            if (batchOrders.length === 0) break;

            let newInPage = 0;
            let maxTsInPage = cursorTs;

            for (const ord of batchOrders) {
                const oid = String(ord?.order_id || '').trim();
                if (!oid) continue;
                const ordTs = Number(ord.date_confirmed || ord.date_add || 0);
                if (ordTs > maxTsInPage) maxTsInPage = ordTs;

                if (seenOrderIds.has(oid)) continue;
                seenOrderIds.add(oid);
                newInPage++;

                const isCancelled = cancelledStatusIds.has(String(ord.order_status_id || ''));
                const originChannel = classifyBaseLinkerOrigin(ord.order_source, ord.order_source_id, sourcesDict);
                const currency = normalizeCurrencyCode(ord.currency, ord.delivery_country_code) || 'PLN';
                const fxRate = resolveFxRate(currency, fxRates);
                const marketplace = inferMarketplaceFromOrder({
                    originChannel,
                    currency,
                    country: ord.delivery_country_code
                });

                const rawProducts = Array.isArray(ord.products) ? ord.products : [];
                const cleanItems = [];
                let itemsOrigSum = 0;

                for (const rp of rawProducts) {
                    if (isShippingLineItem(rp?.name, rp?.sku, rp?.ean)) continue;
                    const qty = Math.max(1, parseInt(rp?.quantity || 1, 10) || 1);
                    const priceOrig = Math.max(0, parseFloat(rp?.price_brutto || 0) || 0);
                    const pricePln = round2(priceOrig * fxRate);
                    const cleanSku = String(rp?.sku || '').trim();
                    const cleanEan = String(rp?.ean || '').trim();
                    const pid = rp?.product_id ? String(rp.product_id).trim() : '';

                    itemsOrigSum += qty * priceOrig;
                    cleanItems.push({
                        sku: cleanSku || cleanEan || String(rp?.name || 'NIEZNANY').trim(),
                        ean: cleanEan || null,
                        productId: pid || null,
                        auctionId: rp?.auction_id ? String(rp.auction_id).replace(/[^0-9]/g, '') : null,
                        name: String(rp?.name || cleanSku || 'Produkt').trim(),
                        qty,
                        priceOrig: round2(priceOrig),
                        pricePln
                    });

                    if (pid && !isCancelled) {
                        productSalesCounter.set(pid, (productSalesCounter.get(pid) || 0) + qty);
                    }
                }

                if (cleanItems.length === 0) {
                    totalOrdersSkipped++;
                    continue;
                }

                const shippingOrig = Math.max(0, parseFloat(ord.delivery_price || 0) || 0);
                const commRaw = ord?.commission?.net ?? ord?.commission?.gross ?? null;
                const commissionPln = commRaw !== null && Number.isFinite(Number(commRaw))
                    ? round2(Number(commRaw) * fxRate)
                    : null;

                const isSmart = /smart/i.test(`${ord.delivery_method || ''} ${ord.delivery_package_module || ''} ${ord.order_source_info || ''}`);
                const orderDate = ordTs > 0 ? new Date(ordTs * 1000) : new Date();
                if (!minOrderDate || orderDate < minOrderDate) minOrderDate = orderDate;
                if (!maxOrderDate || orderDate > maxOrderDate) maxOrderDate = orderDate;

                const externalOrderId = oid;
                const marketplaceOrderId = ord.external_order_id ? String(ord.external_order_id).trim() : null;

                await injectedPrisma.analyticsOrder.upsert({
                    where: {
                        workspaceId_platform_externalOrderId: {
                            workspaceId,
                            platform: 'BASELINKER',
                            externalOrderId
                        }
                    },
                    update: {
                        originChannel,
                        accountId: effAccountId,
                        marketplaceOrderId,
                        sourceMode: 'API',
                        importBatchId: batch.id,
                        orderDate,
                        status: isCancelled ? 'CANCELLED' : 'CONFIRMED',
                        paymentStatus: Number(ord.payment_done || 0) > 0 ? 'PAID' : 'NOT_PAID',
                        paymentMethod: ord.payment_method ? String(ord.payment_method).slice(0, 120) : null,
                        deliveryMethod: ord.delivery_method ? String(ord.delivery_method).slice(0, 120) : null,
                        deliveryCountry: String(ord.delivery_country_code || 'PL').toUpperCase().slice(0, 8),
                        marketplace,
                        currency,
                        fxRateToPln: fxRate,
                        isSmart,
                        totalGmvOriginal: round2(itemsOrigSum),
                        totalGmvPln: round2(itemsOrigSum * fxRate),
                        shippingPln: round2(shippingOrig * fxRate),
                        commissionPln,
                        items: cleanItems,
                        rawMeta: {
                            orderSource: ord.order_source || null,
                            orderSourceId: ord.order_source_id || null,
                            orderStatusId: ord.order_status_id || null,
                            confirmed: Boolean(ord.confirmed),
                            dateInStatus: ord.date_in_status || null
                        }
                    },
                    create: {
                        workspaceId,
                        platform: 'BASELINKER',
                        originChannel,
                        accountId: effAccountId,
                        externalOrderId,
                        marketplaceOrderId,
                        sourceMode: 'API',
                        importBatchId: batch.id,
                        orderDate,
                        status: isCancelled ? 'CANCELLED' : 'CONFIRMED',
                        paymentStatus: Number(ord.payment_done || 0) > 0 ? 'PAID' : 'NOT_PAID',
                        paymentMethod: ord.payment_method ? String(ord.payment_method).slice(0, 120) : null,
                        deliveryMethod: ord.delivery_method ? String(ord.delivery_method).slice(0, 120) : null,
                        deliveryCountry: String(ord.delivery_country_code || 'PL').toUpperCase().slice(0, 8),
                        marketplace,
                        currency,
                        fxRateToPln: fxRate,
                        isSmart,
                        totalGmvOriginal: round2(itemsOrigSum),
                        totalGmvPln: round2(itemsOrigSum * fxRate),
                        shippingPln: round2(shippingOrig * fxRate),
                        commissionPln,
                        items: cleanItems,
                        rawMeta: {
                            orderSource: ord.order_source || null,
                            orderSourceId: ord.order_source_id || null,
                            orderStatusId: ord.order_status_id || null,
                            confirmed: Boolean(ord.confirmed),
                            dateInStatus: ord.date_in_status || null
                        }
                    }
                });

                accOrdersCount++;
                totalOrdersImported++;
                if (includeCourierSla && recentOrderIdsForSla.length < 25 && !isCancelled) {
                    recentOrderIdsForSla.push({ orderId: oid, ordTs });
                }
            }

            if (batchOrders.length < 100 || newInPage === 0) break;
            cursorTs = maxTsInPage === cursorTs ? maxTsInPage + 1 : maxTsInPage;
        }

        // 3. Katalogi magazynowe i snapshot bieżących stanów + cen
        let inventories = [];
        try {
            const invRes = await callApi('getInventories', {}, ctx);
            inventories = Array.isArray(invRes?.inventories) ? invRes.inventories.slice(0, 5) : [];
        } catch (err) {
            warnings.push(`[${acc.label}] Błąd pobierania katalogów BaseLinker: ${err.message}`);
        }

        const catalogPidToMeta = {};
        for (const inv of inventories) {
            const invId = inv.inventory_id;
            for (let page = 1; page <= 20; page++) {
                let listRes;
                try {
                    listRes = await callApi('getInventoryProductsList', { inventory_id: invId, page }, ctx);
                } catch (err) {
                    warnings.push(`[${acc.label}] Błąd listy produktów katalogu #${invId} (str. ${page}): ${err.message}`);
                    break;
                }

                const prodsObj = listRes?.products && typeof listRes.products === 'object' ? listRes.products : {};
                const entries = Object.entries(prodsObj);
                if (entries.length === 0) break;

                for (const [pidKey, prod] of entries) {
                    const pid = String(prod?.id || pidKey).trim();
                    const stockVal = parseStockTotal(prod?.stock);
                    const priceVal = parseFirstPrice(prod?.prices);
                    const cleanSku = String(prod?.sku || '').trim() || null;
                    const cleanEan = String(prod?.ean || '').trim() || null;
                    catalogPidToMeta[pid] = { sku: cleanSku, ean: cleanEan, name: prod?.name || null, inventoryId: invId };

                    await injectedPrisma.analyticsDailyOfferSnapshot.upsert({
                        where: {
                            workspaceId_platform_snapshotDate_externalOfferId: {
                                workspaceId,
                                platform: 'BASELINKER',
                                snapshotDate: todayMidnight,
                                externalOfferId: pid
                            }
                        },
                        update: {
                            accountId: effAccountId,
                            sku: cleanSku,
                            ean: cleanEan,
                            baselinkerProductId: pid,
                            name: prod?.name ? String(prod.name).slice(0, 250) : null,
                            status: stockVal <= stockoutThreshold ? 'SOLDOUT' : 'ACTIVE',
                            stock: stockVal,
                            pricePln: round2(priceVal),
                            currency: 'PLN',
                            meta: { inventoryId: invId, inventoryName: inv.name || null }
                        },
                        create: {
                            workspaceId,
                            platform: 'BASELINKER',
                            accountId: effAccountId,
                            snapshotDate: todayMidnight,
                            externalOfferId: pid,
                            sku: cleanSku,
                            ean: cleanEan,
                            baselinkerProductId: pid,
                            name: prod?.name ? String(prod.name).slice(0, 250) : null,
                            status: stockVal <= stockoutThreshold ? 'SOLDOUT' : 'ACTIVE',
                            stock: stockVal,
                            pricePln: round2(priceVal),
                            currency: 'PLN',
                            meta: { inventoryId: invId, inventoryName: inv.name || null }
                        }
                    });
                    accSnapshotsCount++;
                    totalSnapshotsSaved++;
                }

                if (entries.length < 1000) break;
            }
        }

        // 4. Otwarte zamówienia zakupu (PO -> ilości w drodze, aby nie dublować domówień w ROP)
        if (includePurchaseOrders) {
            try {
                const poRes = await callApi('getInventoryPurchaseOrders', {}, ctx);
                const purchaseOrders = Array.isArray(poRes?.purchase_orders) ? poRes.purchase_orders : [];
                for (const po of purchaseOrders) {
                    const poStatus = String(po?.status_name || po?.status || '').toLowerCase();
                    if (/zako[ńn]cz|anul|closed|completed|cancel/i.test(poStatus)) continue;
                    const poItems = Array.isArray(po?.products) ? po.products : [];
                    for (const it of poItems) {
                        const qtyOrdered = Number(it?.quantity || 0);
                        const qtyReceived = Number(it?.quantity_received || 0);
                        const openQty = Math.max(0, qtyOrdered - qtyReceived);
                        if (openQty <= 0) continue;
                        const k = String(it?.sku || it?.ean || it?.product_id || '').trim();
                        if (k) {
                            openPurchaseOrdersBySku[k] = (openPurchaseOrdersBySku[k] || 0) + openQty;
                        }
                    }
                }
            } catch (err) {
                warnings.push(`[${acc.label}] Nie udało się pobrać otwartych zamówień zakupu (PO): ${err.message}`);
            }
        }

        // 5. Logi zmian stanów i cen dla Top N SKU (getInventoryProductLogs)
        const logLimit = Math.min(Math.max(Number(fetchProductLogsTopN) || 0, 0), 100);
        if (logLimit > 0) {
            const topPids = Array.from(productSalesCounter.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, logLimit)
                .map(([pid]) => pid);

            for (const pid of topPids) {
                try {
                    const logRes = await callApi('getInventoryProductLogs', {
                        product_id: Number(pid) || pid,
                        date_from: Math.floor(Date.now() / 1000) - 365 * 86400
                    }, ctx);
                    const parsed = parseBaseLinkerProductLogs(logRes?.logs || []);
                    if (parsed.stockChanges.length > 0 || parsed.priceChanges.length > 0) {
                        productLogsSummary[pid] = {
                            sku: catalogPidToMeta[pid]?.sku || null,
                            ean: catalogPidToMeta[pid]?.ean || null,
                            stockChanges: parsed.stockChanges,
                            priceChanges: parsed.priceChanges
                        };
                    }
                } catch (err) {
                    warnings.push(`[${acc.label}] Nie udało się pobrać logów produktu #${pid}: ${err.message}`);
                }
            }
        }

        // 6. Zwroty konsumenckie (getOrderReturns) i opcjonalnie SLA paczek
        let accReturnsCount = 0;
        const returnReasonsAgg = {};
        if (includeReturns) {
            let retCursor = cutoffSec;
            const seenReturns = new Set();
            for (let page = 0; page < 10; page++) {
                try {
                    const retRes = await callApi('getOrderReturns', { date_from: retCursor }, ctx);
                    const rets = Array.isArray(retRes?.returns) ? retRes.returns : [];
                    if (rets.length === 0) break;
                    let newRet = 0;
                    let maxRetTs = retCursor;
                    for (const r of rets) {
                        const rid = String(r?.return_id || '');
                        if (!rid || seenReturns.has(rid)) continue;
                        seenReturns.add(rid);
                        newRet++;
                        accReturnsCount++;
                        totalReturnsFound++;
                        const rTs = Number(r?.date_add || 0);
                        if (rTs > maxRetTs) maxRetTs = rTs;
                        const prods = Array.isArray(r?.products) ? r.products : [];
                        for (const rp of prods) {
                            const reason = String(rp?.return_reason_comment || rp?.reason || 'Brak podanego powodu').trim().slice(0, 120);
                            returnReasonsAgg[reason] = (returnReasonsAgg[reason] || 0) + (Number(rp?.quantity) || 1);
                        }
                    }
                    if (rets.length < 100 || newRet === 0) break;
                    retCursor = maxRetTs === retCursor ? maxRetTs + 1 : maxRetTs;
                } catch (err) {
                    warnings.push(`[${acc.label}] Błąd pobierania zwrotów BaseLinker: ${err.message}`);
                    break;
                }
            }
        }

        let courierSlaMetrics = null;
        if (includeCourierSla && recentOrderIdsForSla.length > 0) {
            try {
                const pkgIds = [];
                const pkgOrderTs = {};
                for (const item of recentOrderIdsForSla.slice(0, 15)) {
                    const pkgRes = await callApi('getOrderPackages', { order_id: Number(item.orderId) || item.orderId }, ctx);
                    const pkgs = Array.isArray(pkgRes?.packages) ? pkgRes.packages : [];
                    for (const p of pkgs) {
                        if (p?.package_id) {
                            pkgIds.push(p.package_id);
                            pkgOrderTs[String(p.package_id)] = item.ordTs;
                        }
                    }
                }
                if (pkgIds.length > 0) {
                    const histRes = await callApi('getCourierPackagesStatusHistory', { package_ids: pkgIds.slice(0, 100) }, ctx);
                    const historyMap = histRes?.packages_history || {};
                    let dispatchHoursSum = 0;
                    let dispatchCount = 0;
                    for (const [pkgId, events] of Object.entries(historyMap)) {
                        const baseTs = pkgOrderTs[pkgId];
                        if (!baseTs || !Array.isArray(events)) continue;
                        const sentEv = events.find(e => Number(e.tracking_status) >= 2 && Number(e.tracking_status_date) > baseTs);
                        if (sentEv) {
                            dispatchHoursSum += (Number(sentEv.tracking_status_date) - baseTs) / 3600;
                            dispatchCount++;
                        }
                    }
                    courierSlaMetrics = {
                        sampledPackages: pkgIds.length,
                        avgDispatchHours: dispatchCount > 0 ? round2(dispatchHoursSum / dispatchCount) : null
                    };
                }
            } catch (err) {
                warnings.push(`[${acc.label}] Nie udało się pobrać historii przesyłek kurierskich: ${err.message}`);
            }
        }

        if (accReturnsCount > 0 || courierSlaMetrics) {
            await injectedPrisma.analyticsQualitySnapshot.upsert({
                where: {
                    workspaceId_platform_accountId_snapshotDate: {
                        workspaceId,
                        platform: 'BASELINKER',
                        accountId: effAccountId,
                        snapshotDate: todayMidnight
                    }
                },
                update: {
                    returnsCount: accReturnsCount,
                    metricsJson: {
                        returnReasons: returnReasonsAgg,
                        courierSla: courierSlaMetrics
                    }
                },
                create: {
                    workspaceId,
                    platform: 'BASELINKER',
                    accountId: effAccountId,
                    snapshotDate: todayMidnight,
                    returnsCount: accReturnsCount,
                    metricsJson: {
                        returnReasons: returnReasonsAgg,
                        courierSla: courierSlaMetrics
                    }
                }
            });
        }

        accountsResults.push({
            accountId: effAccountId,
            label: acc.label,
            ordersImported: accOrdersCount,
            snapshotsSaved: accSnapshotsCount,
            returnsCount: accReturnsCount
        });
    }

    await injectedPrisma.analyticsImportBatch.update({
        where: { id: batch.id },
        data: {
            status: 'COMPLETED',
            recordsImported: totalOrdersImported + totalSnapshotsSaved,
            recordsSkipped: totalOrdersSkipped,
            dateRangeStart: minOrderDate,
            dateRangeEnd: maxOrderDate,
            warnings,
            summary: {
                accounts: accountsResults,
                ordersImported: totalOrdersImported,
                snapshotsSaved: totalSnapshotsSaved,
                returnsFound: totalReturnsFound,
                openPurchaseOrdersBySku,
                productLogsByProductId: productLogsSummary
            }
        }
    });

    return {
        batchId: batch.id,
        platform: 'BASELINKER',
        configured: true,
        accountsSynced: accountsResults.length,
        ordersImported: totalOrdersImported,
        snapshotsSaved: totalSnapshotsSaved,
        returnsFound: totalReturnsFound,
        openPurchaseOrdersCount: Object.keys(openPurchaseOrdersBySku).length,
        loggedProductsCount: Object.keys(productLogsSummary).length,
        warnings
    };
}

module.exports = {
    classifyBaseLinkerOrigin,
    parseBaseLinkerProductLogs,
    syncBaseLinkerAnalytics
};
