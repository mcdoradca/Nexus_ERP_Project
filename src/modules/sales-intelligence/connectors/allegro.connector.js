const prisma = require('../../../core/prisma');
const AllegroService = require('../../offer-optimizer/allegro.service');
const { runBatchUpserts } = require('../utils/batch.helpers');
const {
    round2,
    utcDayMidnight,
    normalizeCurrencyCode,
    resolveFxRate,
    isShippingLineItem
} = require('../utils/currency.helpers');

/**
 * Mapuje kod typu operacji billingowej Allegro (`/billing/billing-types`) na kanoniczną kategorię kosztu.
 */
function classifyAllegroBillingCategory(typeId = '', typeName = '') {
    const id = String(typeId || '').trim().toUpperCase();
    const nm = String(typeName || '').toLowerCase();

    if (id === 'SUC' || (nm.includes('prowizja') && !nm.includes('zwrot') && !nm.includes('rabat') && !nm.includes('korekta'))) {
        return 'COMMISSION';
    }
    if (id === 'SUM' || nm.includes('zwrot prowizji') || nm.includes('korekta prowizji') || nm.includes('rabat na prowizję')) {
        return 'COMMISSION_REFUND';
    }
    if (id === 'ADS' || nm.includes('allegro ads') || nm.includes('kampani') && nm.includes('reklam')) {
        return 'ADS';
    }
    if (id === 'FSF' || id === 'SMR' || id === 'SMD' || nm.includes('smart')) {
        return 'SMART';
    }
    if (/^(DPB|BRD|HLD|BRG|PRP|WYR|PRO|FEA)/.test(id) || /wyróżn|promowan|pakiet\s+promo|pogrubien|podświetl|strefa\s+okazji/i.test(nm)) {
        return 'PROMO_FEE';
    }
    if (id === 'SUB' || id === 'ABN' || nm.includes('abonament')) {
        return 'SUBSCRIPTION';
    }
    if (nm.includes('zwrot') && nm.includes('przesył')) {
        return 'RETURN_COST';
    }
    return 'OTHER';
}

function buildHeaders(token, extra = {}) {
    return {
        'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.allegro.public.v1+json',
        'Accept-Language': 'pl-PL',
        ...extra
    };
}

/**
 * Synchronizuje dane analityczne bezpośrednio z Allegro REST API (Multi-Workspace + multi-account):
 * - Oferty i statystyki (`GET /sale/offers`: visitsCount, watchersCount, stock.available, stock.sold, marketplaces)
 * - Zdarzenia 24h (`GET /sale/offer-events`), Odznaki (`GET /sale/badges`), Reguły cen (`GET /sale/price-automation/rules`)
 * - Zamówienia do 60 dni (`GET /order/checkout-forms` wg retencji Allegro)
 * - Bilingi i dokładne opłaty (`GET /billing/billing-types`, `GET /billing/billing-entries`, `GET /pricing/offer-quotes`)
 * - Jakość sprzedaży, oceny, spory i zwroty (`GET /sale/quality`, `GET /sale/user-ratings`, `GET /sale/issues`, `GET /order/customer-returns`)
 */
async function syncAllegroAnalytics({
    workspaceId,
    accountId = null,
    days = 60,
    fxRates = {},
    injectedPrisma = prisma,
    allegroApi = null,
    onProgress = null
} = {}) {
    if (!workspaceId) {
        throw new Error('Wymagany jest identyfikator klienta (workspaceId) do synchronizacji Allegro.');
    }

    const svc = allegroApi || AllegroService;
    const http = svc.apiClient || AllegroService.apiClient;

    let accounts = [];
    try {
        const connected = await svc.listConnectedAllegroAccounts(injectedPrisma, workspaceId);
        if (accountId && String(accountId).toUpperCase() !== 'ALL') {
            accounts = connected.filter(a => String(a.accountId) === String(accountId) || String(a.integrationAccountId) === String(accountId));
        } else {
            accounts = connected;
        }
    } catch (err) {
        return {
            platform: 'ALLEGRO',
            configured: false,
            accountsSynced: 0,
            ordersImported: 0,
            snapshotsSaved: 0,
            financialEntriesImported: 0,
            warnings: [`Błąd odczytu kont Allegro: ${err.message}`],
            scopeWarnings: []
        };
    }

    if (accounts.length === 0) {
        return {
            platform: 'ALLEGRO',
            configured: false,
            accountsSynced: 0,
            ordersImported: 0,
            snapshotsSaved: 0,
            financialEntriesImported: 0,
            warnings: ['Brak podłączonych kont Allegro dla tego klienta. Połącz konto w Panelu Admina -> Integracje API (Device Flow).'],
            scopeWarnings: []
        };
    }

    const effectiveOrderDays = Math.min(Math.max(Number(days) || 60, 1), 60); // Allegro retencja checkout-forms = 60d
    const effectiveBillingDays = Math.min(Math.max(Number(days) || 60, 1), 180);
    const todayMidnight = utcDayMidnight(new Date());
    const ordersFromIso = new Date(Date.now() - effectiveOrderDays * 86400000).toISOString();
    const billingFromIso = new Date(Date.now() - effectiveBillingDays * 86400000).toISOString();

    let totalOrdersImported = 0;
    let totalSnapshotsSaved = 0;
    let totalFinancialEntries = 0;
    const warnings = [];
    const scopeWarnings = [];
    const accountSummaries = [];

    const batch = await injectedPrisma.analyticsImportBatch.create({
        data: {
            workspaceId,
            platform: 'ALLEGRO',
            sourceType: 'API_SYNC',
            accountId: accountId || null,
            status: 'PROCESSING',
            warnings: []
        }
    });

    let minDate = null;
    let maxDate = null;

    const recordScopeOrApiError = (accLabel, endpointLabel, neededScope, err) => {
        const status = err?.response?.status || err?.statusCode;
        if (status === 403 || status === 401) {
            scopeWarnings.push({
                account: accLabel,
                endpoint: endpointLabel,
                requiredScope: neededScope,
                message: `[${accLabel}] Brak uprawnienia OAuth (${neededScope}) dla ${endpointLabel} (HTTP ${status}). Włącz zakres na apps.developer.allegro.pl i odśwież autoryzację.`
            });
        } else {
            warnings.push(`[${accLabel}] ${endpointLabel}: ${err?.message || 'Błąd komunikacji z Allegro API'}`);
        }
    };

    for (const acc of accounts) {
        const accId = String(acc.accountId);
        const accLabel = acc.label || acc.login || `Konto #${accId}`;
        let token;
        try {
            token = await svc.getAllegroToken(false, accId, injectedPrisma, workspaceId);
        } catch (err) {
            warnings.push(`[${accLabel}] Nie udało się pobrać tokena OAuth: ${err.message}`);
            continue;
        }

        const reqOpts = (params = {}, extraHeaders = {}) => ({
            headers: buildHeaders(token, extraHeaders),
            params,
            _allegroAccountId: accId,
            _allegroWorkspaceId: workspaceId,
            timeout: 20000
        });

        let accOffersCount = 0;
        let accOrdersCount = 0;
        let accBillingCount = 0;

        // A. Odznaki (/sale/badges) i Reguły cenowe (/sale/price-automation/rules) — do adnotacji ofert
        const badgedOfferIds = new Set();
        try {
            let offset = 0;
            for (let p = 0; p < 10; p++) {
                const res = await http.get('https://api.allegro.pl/sale/badges', reqOpts({ limit: 50, offset }));
                const badges = Array.isArray(res?.data?.badges) ? res.data.badges : [];
                for (const b of badges) {
                    const oid = b?.offer?.id;
                    if (oid && b?.process?.status === 'ACTIVE') {
                        badgedOfferIds.add(String(oid));
                    }
                }
                if (badges.length < 50) break;
                offset += 50;
            }
        } catch (err) {
            if ((err?.response?.status || 0) !== 404) {
                recordScopeOrApiError(accLabel, 'GET /sale/badges', 'allegro:api:sale:offers:read', err);
            }
        }

        // B. Nadchodzące opłaty cykliczne ofert (GET /pricing/offer-quotes)
        const quoteMapByOfferId = {};

        // C. Oferty i statystyki (GET /sale/offers)
        const allOffers = [];
        try {
            let offset = 0;
            const pageLimit = 1000;
            for (let p = 0; p < 20; p++) {
                const res = await http.get('https://api.allegro.pl/sale/offers', reqOpts({ limit: pageLimit, offset }));
                const offers = Array.isArray(res?.data?.offers) ? res.data.offers : [];
                allOffers.push(...offers);
                if (offers.length < pageLimit || allOffers.length >= Number(res?.data?.totalCount || 0)) break;
                offset += pageLimit;
            }
        } catch (err) {
            recordScopeOrApiError(accLabel, 'GET /sale/offers', 'allegro:api:sale:offers:read', err);
        }

        // Sprawdzamy nadchodzące opłaty promowania dla maksymalnie 100 aktywnych ofert (batch po 20)
        const activeOfferIds = allOffers.filter(o => o?.publication?.status === 'ACTIVE').map(o => String(o.id)).slice(0, 100);
        for (let idx = 0; idx < activeOfferIds.length; idx += 20) {
            const chunk = activeOfferIds.slice(idx, idx + 20);
            try {
                const qRes = await http.get('https://api.allegro.pl/pricing/offer-quotes', {
                    headers: buildHeaders(token),
                    params: { 'offer.id': chunk },
                    paramsSerializer: (params) => {
                        const sp = new URLSearchParams();
                        for (const id of params['offer.id'] || []) sp.append('offer.id', id);
                        return sp.toString();
                    },
                    _allegroAccountId: accId,
                    _allegroWorkspaceId: workspaceId,
                    timeout: 15000
                });
                const quotes = Array.isArray(qRes?.data?.quotes) ? qRes.data.quotes : [];
                for (const q of quotes) {
                    const oid = String(q?.offer?.id || '');
                    if (!oid) continue;
                    if (!quoteMapByOfferId[oid]) quoteMapByOfferId[oid] = [];
                    quoteMapByOfferId[oid].push({
                        name: q?.name || q?.type || null,
                        feeAmount: Number(q?.fee?.amount || 0),
                        nextDate: q?.nextDate || null
                    });
                }
            } catch (err) {
                if (idx === 0 && (err?.response?.status || 0) === 403) {
                    recordScopeOrApiError(accLabel, 'GET /pricing/offer-quotes', 'allegro:api:billing:read', err);
                }
                break;
            }
        }

        const offerSnapPayloads = new Map();
        for (const off of allOffers) {
            const oid = String(off?.id || '').trim();
            if (!oid) continue;
            const currency = normalizeCurrencyCode(off?.sellingMode?.price?.currency, 'PL') || 'PLN';
            const fx = resolveFxRate(currency, fxRates);
            const rawAmount = parseFloat(off?.sellingMode?.price?.amount || 0) || 0;
            const pricePln = round2(rawAmount * fx);
            const stockAvail = Number(off?.stock?.available ?? 0);
            const sold30d = off?.stock?.sold !== undefined ? Number(off.stock.sold) : null;
            const visitsCount = off?.stats?.visitsCount !== undefined ? Number(off.stats.visitsCount) : null;
            const watchersCount = off?.stats?.watchersCount !== undefined ? Number(off.stats.watchersCount) : null;
            const pubStatus = String(off?.publication?.status || 'INACTIVE').toUpperCase();
            const quotes = quoteMapByOfferId[oid] || [];
            const isPromoted = quotes.some(q => q.feeAmount > 0) || Boolean(off?.promotion?.emphasized || off?.promotion?.bold || off?.promotion?.highlight);
            const promoPackage = quotes.map(q => q.name).filter(Boolean).join(', ') || null;
            const marketplacesList = [];
            if (off?.publication?.marketplaces?.base?.id) marketplacesList.push(off.publication.marketplaces.base.id);
            if (Array.isArray(off?.publication?.marketplaces?.additional)) {
                for (const addMk of off.publication.marketplaces.additional) {
                    if (addMk?.id) marketplacesList.push(addMk.id);
                }
            }
            const cleanSku = off?.external?.id ? String(off.external.id).trim() : null;

            const snapData = {
                accountId: accId,
                sku: cleanSku,
                name: off?.name ? String(off.name).slice(0, 250) : null,
                status: pubStatus,
                stock: Number.isFinite(stockAvail) ? stockAvail : 0,
                pricePln,
                currency,
                visitsCount,
                watchersCount,
                sold30d,
                isPromoted,
                promoPackage,
                hasBadge: badgedOfferIds.has(oid),
                marketplaces: marketplacesList,
                meta: {
                    categoryId: off?.category?.id || null,
                    startingAt: off?.publication?.startingAt || null,
                    startedAt: off?.publication?.startedAt || null,
                    endedAt: off?.publication?.endedAt || null,
                    quotes
                }
            };
            offerSnapPayloads.set(oid, {
                oid,
                updateData: snapData,
                createData: {
                    workspaceId,
                    platform: 'ALLEGRO',
                    snapshotDate: todayMidnight,
                    externalOfferId: oid,
                    ...snapData
                }
            });
        }

        if (offerSnapPayloads.size > 0) {
            const savedOffers = await runBatchUpserts(
                Array.from(offerSnapPayloads.values()),
                (item) => injectedPrisma.analyticsDailyOfferSnapshot.upsert({
                    where: {
                        workspaceId_platform_snapshotDate_externalOfferId: {
                            workspaceId,
                            platform: 'ALLEGRO',
                            snapshotDate: todayMidnight,
                            externalOfferId: item.oid
                        }
                    },
                    update: item.updateData,
                    create: item.createData
                }),
                {
                    prismaClient: injectedPrisma,
                    chunkSize: 50,
                    onItemError: (err, item) => warnings.push(`[${accLabel}] Błąd zapisu oferty Allegro ${item.oid}: ${err.message}`)
                }
            );
            accOffersCount += savedOffers;
            totalSnapshotsSaved += savedOffers;
            onProgress?.({
                platform: 'ALLEGRO',
                stage: 'OFFERS',
                message: `[${accLabel}] Zapisano ${accOffersCount} ofert Allegro (visits/watchers/promocje)...`,
                snapshotsDelta: savedOffers
            });
        }

        // D. Zdarzenia 24h ofert (GET /sale/offer-events) — bez fałszywych OFFER_VIEWED/CLICKED
        let recentOfferEventsCount = 0;
        try {
            const evRes = await http.get('https://api.allegro.pl/sale/offer-events', reqOpts({ limit: 1000 }));
            const events = Array.isArray(evRes?.data?.events) ? evRes.data.events : [];
            recentOfferEventsCount = events.length;
        } catch (err) {
            recordScopeOrApiError(accLabel, 'GET /sale/offer-events', 'allegro:api:sale:offers:read', err);
        }

        // E. Zamówienia Allegro do 60 dni (GET /order/checkout-forms)
        try {
            let offset = 0;
            const limit = 100;
            for (let p = 0; p < 100; p++) {
                const cfRes = await http.get('https://api.allegro.pl/order/checkout-forms', reqOpts({
                    'lineItems.boughtAt.gte': ordersFromIso,
                    limit,
                    offset
                }));
                const forms = Array.isArray(cfRes?.data?.checkoutForms) ? cfRes.data.checkoutForms : [];
                if (forms.length === 0) break;

                const pageOrderPayloads = new Map();
                for (const cf of forms) {
                    const cfId = String(cf?.id || '').trim();
                    if (!cfId) continue;

                    const mkId = String(cf?.marketplace?.id || 'allegro-pl').toLowerCase();
                    const summaryCurrency = normalizeCurrencyCode(cf?.summary?.totalToPay?.currency, mkId.split('-')[1]?.toUpperCase()) || 'PLN';
                    const fxRate = resolveFxRate(summaryCurrency, fxRates);
                    const rawStatus = String(cf?.status || '').toUpperCase();
                    const fulfillStatus = String(cf?.fulfillment?.status || '').toUpperCase();
                    const isCancelled = rawStatus === 'CANCELLED' || fulfillStatus === 'CANCELLED';

                    const lineItems = Array.isArray(cf?.lineItems) ? cf.lineItems : [];
                    const cleanItems = [];
                    let boughtAtIso = cf?.updatedAt || new Date().toISOString();
                    let itemsOrigSum = 0;
                    let discountOrigSum = 0;

                    for (const li of lineItems) {
                        if (li?.boughtAt) boughtAtIso = li.boughtAt;
                        const qty = Math.max(1, parseInt(li?.quantity || 1, 10) || 1);
                        const unitOrig = parseFloat(li?.price?.amount || 0) || 0;
                        const origBeforeDisc = parseFloat(li?.originalPrice?.amount || unitOrig) || unitOrig;
                        if (origBeforeDisc > unitOrig) {
                            discountOrigSum += (origBeforeDisc - unitOrig) * qty;
                        }
                        if (isShippingLineItem(li?.offer?.name, li?.offer?.external?.id, '')) continue;

                        itemsOrigSum += qty * unitOrig;
                        cleanItems.push({
                            sku: li?.offer?.external?.id ? String(li.offer.external.id).trim() : String(li?.offer?.id || ''),
                            ean: null,
                            productId: null,
                            auctionId: li?.offer?.id ? String(li.offer.id) : null,
                            name: String(li?.offer?.name || 'Oferta Allegro'),
                            qty,
                            priceOrig: round2(unitOrig),
                            pricePln: round2(unitOrig * fxRate)
                        });
                    }

                    if (cleanItems.length === 0) continue;

                    const orderDate = new Date(boughtAtIso);
                    if (!minDate || orderDate < minDate) minDate = orderDate;
                    if (!maxDate || orderDate > maxDate) maxDate = orderDate;

                    const shipCostOrig = parseFloat(cf?.delivery?.cost?.amount || 0) || 0;
                    const isSmart = Boolean(cf?.delivery?.isSmart);

                    const orderCommonData = {
                        originChannel: 'ALLEGRO',
                        accountId: accId,
                        marketplaceOrderId: cfId,
                        sourceMode: 'API',
                        importBatchId: batch.id,
                        orderDate,
                        status: isCancelled ? 'CANCELLED' : 'CONFIRMED',
                        paymentStatus: cf?.payment?.finishedAt ? 'PAID' : 'NOT_PAID',
                        paymentMethod: cf?.payment?.type ? String(cf.payment.type) : null,
                        deliveryMethod: cf?.delivery?.method?.name ? String(cf.delivery.method.name).slice(0, 120) : null,
                        deliveryCountry: String(cf?.delivery?.address?.countryCode || mkId.split('-')[1] || 'PL').toUpperCase().slice(0, 8),
                        marketplace: mkId,
                        currency: summaryCurrency,
                        fxRateToPln: fxRate,
                        isSmart,
                        totalGmvOriginal: round2(itemsOrigSum),
                        totalGmvPln: round2(itemsOrigSum * fxRate),
                        shippingPln: round2(shipCostOrig * fxRate),
                        discountMerchantPln: round2(discountOrigSum * fxRate),
                        items: cleanItems,
                        rawMeta: {
                            fulfillmentStatus: fulfillStatus || null,
                            checkoutStatus: rawStatus || null
                        }
                    };
                    pageOrderPayloads.set(cfId, {
                        cfId,
                        updateData: orderCommonData,
                        createData: {
                            workspaceId,
                            platform: 'ALLEGRO',
                            externalOrderId: cfId,
                            ...orderCommonData
                        }
                    });
                }

                if (pageOrderPayloads.size > 0) {
                    const savedOrders = await runBatchUpserts(
                        Array.from(pageOrderPayloads.values()),
                        (item) => injectedPrisma.analyticsOrder.upsert({
                            where: {
                                workspaceId_platform_externalOrderId: {
                                    workspaceId,
                                    platform: 'ALLEGRO',
                                    externalOrderId: item.cfId
                                }
                            },
                            update: item.updateData,
                            create: item.createData
                        }),
                        {
                            prismaClient: injectedPrisma,
                            chunkSize: 50,
                            onItemError: (err, item) => warnings.push(`[${accLabel}] Błąd zapisu zamówienia Allegro ${item.cfId}: ${err.message}`)
                        }
                    );
                    accOrdersCount += savedOrders;
                    totalOrdersImported += savedOrders;
                    onProgress?.({
                        platform: 'ALLEGRO',
                        stage: 'ORDERS',
                        message: `[${accLabel}] Zapisano ${accOrdersCount} zamówień Allegro...`,
                        ordersDelta: savedOrders
                    });
                }

                if (forms.length < limit || offset + forms.length >= Number(cfRes?.data?.totalCount || 0)) break;
                offset += limit;
            }
        } catch (err) {
            recordScopeOrApiError(accLabel, 'GET /order/checkout-forms', 'allegro:api:orders:read', err);
        }

        // F. Bilingi i opłaty (/billing/billing-types + /billing/billing-entries)
        try {
            const billingTypesMap = {};
            try {
                const btRes = await http.get('https://api.allegro.pl/billing/billing-types', reqOpts({}));
                const list = Array.isArray(btRes?.data) ? btRes.data : [];
                for (const t of list) {
                    if (t?.id) billingTypesMap[String(t.id)] = t.description || t.id;
                }
            } catch (_) { /* ignore optional dictionary error */ }

            let offset = 0;
            const limit = 100;
            for (let p = 0; p < 150; p++) {
                const bRes = await http.get('https://api.allegro.pl/billing/billing-entries', reqOpts({
                    'occurredAt.gte': billingFromIso,
                    limit,
                    offset
                }));
                const entries = Array.isArray(bRes?.data?.billingEntries) ? bRes.data.billingEntries : [];
                if (entries.length === 0) break;

                const pageBillingPayloads = new Map();
                for (const be of entries) {
                    const beId = String(be?.id || '').trim();
                    if (!beId) continue;
                    const typeId = String(be?.type?.id || 'OTHER');
                    const typeName = be?.type?.name || billingTypesMap[typeId] || typeId;
                    const category = classifyAllegroBillingCategory(typeId, typeName);
                    const cur = normalizeCurrencyCode(be?.value?.currency, 'PL') || 'PLN';
                    const fx = resolveFxRate(cur, fxRates);
                    const rawAmt = parseFloat(be?.value?.amount || 0) || 0;
                    const amountPln = round2(rawAmt * fx);
                    const entryDate = be?.occurredAt ? new Date(be.occurredAt) : new Date();

                    const billCommonData = {
                        accountId: accId,
                        entryDate,
                        entryTypeCode: typeId,
                        entryTypeName: String(typeName).slice(0, 200),
                        category,
                        offerId: be?.offer?.id ? String(be.offer.id) : null,
                        orderId: be?.order?.id ? String(be.order.id) : null,
                        amountPln,
                        currency: cur,
                        taxRate: be?.tax?.percentage !== undefined ? Number(be.tax.percentage) : null,
                        importBatchId: batch.id,
                        meta: {
                            offerName: be?.offer?.name || null,
                            balanceAfter: be?.balance?.amount || null
                        }
                    };
                    pageBillingPayloads.set(beId, {
                        beId,
                        updateData: billCommonData,
                        createData: {
                            workspaceId,
                            platform: 'ALLEGRO',
                            externalEntryId: beId,
                            ...billCommonData
                        }
                    });
                }

                if (pageBillingPayloads.size > 0) {
                    const savedBillings = await runBatchUpserts(
                        Array.from(pageBillingPayloads.values()),
                        (item) => injectedPrisma.analyticsFinancialEntry.upsert({
                            where: {
                                workspaceId_platform_externalEntryId: {
                                    workspaceId,
                                    platform: 'ALLEGRO',
                                    externalEntryId: item.beId
                                }
                            },
                            update: item.updateData,
                            create: item.createData
                        }),
                        {
                            prismaClient: injectedPrisma,
                            chunkSize: 50,
                            onItemError: (err, item) => warnings.push(`[${accLabel}] Błąd zapisu operacji bilingowej ${item.beId}: ${err.message}`)
                        }
                    );
                    accBillingCount += savedBillings;
                    totalFinancialEntries += savedBillings;
                    onProgress?.({
                        platform: 'ALLEGRO',
                        stage: 'BILLING',
                        message: `[${accLabel}] Zapisano ${accBillingCount} operacji bilingowych Allegro...`,
                        financialDelta: savedBillings
                    });
                }

                if (entries.length < limit) break;
                offset += limit;
            }
        } catch (err) {
            recordScopeOrApiError(accLabel, 'GET /billing/billing-entries', 'allegro:api:billing:read', err);
        }

        // G. Jakość sprzedaży (/sale/quality), oceny (/sale/user-ratings), spory (/sale/issues — nie przestarzałe /sale/disputes!) oraz zwroty (/order/customer-returns)
        let qualityScore = null;
        let maxQualityScore = null;
        let qualityGrade = null;
        let qualityMetricsJson = {};
        let openIssuesCount = 0;
        let issuesSample = [];
        let positiveRatingsCount = 0;
        let negativeRatingsCount = 0;
        let returnsCount = 0;

        try {
            const qRes = await http.get('https://api.allegro.pl/sale/quality', reqOpts({}));
            const qArr = Array.isArray(qRes?.data?.quality) ? qRes.data.quality : [];
            const latestQ = qArr.length > 0 ? qArr[qArr.length - 1] : null;
            if (latestQ) {
                qualityScore = Number(latestQ?.resultFor?.points ?? latestQ?.points ?? 0);
                maxQualityScore = Number(latestQ?.maxPoints ?? 1000);
                qualityGrade = latestQ?.grade || latestQ?.level || null;
                qualityMetricsJson = {
                    metrics: latestQ?.metrics || [],
                    period: latestQ?.resultFor || null,
                    recentOfferEventsCount
                };
            }
        } catch (err) {
            recordScopeOrApiError(accLabel, 'GET /sale/quality', 'allegro:api:sale:settings:read', err);
        }

        try {
            const issRes = await http.get(
                'https://api.allegro.pl/sale/issues',
                reqOpts({ limit: 50 }, { Accept: 'application/vnd.allegro.beta.v1+json' })
            );
            const issues = Array.isArray(issRes?.data?.issues) ? issRes.data.issues : [];
            const openOnes = issues.filter(i => !/CLOSED|FINISHED|RESOLVED/i.test(String(i?.currentState?.status || i?.status || '')));
            openIssuesCount = openOnes.length;
            issuesSample = openOnes.slice(0, 15).map(i => ({
                id: i.id,
                type: i.type || null,
                status: i?.currentState?.status || i?.status || null,
                openedAt: i?.openedDate || null
            }));
        } catch (err) {
            recordScopeOrApiError(accLabel, 'GET /sale/issues', 'allegro:api:disputes:read', err);
        }

        try {
            const ratRes = await http.get('https://api.allegro.pl/sale/user-ratings', reqOpts({ limit: 20 }));
            const ratings = Array.isArray(ratRes?.data?.ratings) ? ratRes.data.ratings : [];
            for (const r of ratings) {
                if (r?.recommended === true) positiveRatingsCount++;
                else if (r?.recommended === false) negativeRatingsCount++;
            }
        } catch (err) {
            recordScopeOrApiError(accLabel, 'GET /sale/user-ratings', 'allegro:api:ratings:read', err);
        }

        try {
            const retRes = await http.get(
                'https://api.allegro.pl/order/customer-returns',
                reqOpts({ limit: 100 }, { Accept: 'application/vnd.allegro.beta.v1+json' })
            );
            const rets = Array.isArray(retRes?.data?.customerReturns) ? retRes.data.customerReturns : [];
            returnsCount = rets.length;
            const reasonsAgg = {};
            for (const r of rets) {
                for (const it of (r?.items || [])) {
                    const rsn = String(it?.reason?.type || it?.reason?.userComment || 'Brak podanego powodu').slice(0, 120);
                    reasonsAgg[rsn] = (reasonsAgg[rsn] || 0) + (Number(it?.quantity) || 1);
                }
            }
            qualityMetricsJson = { ...qualityMetricsJson, returnReasons: reasonsAgg };
        } catch (err) {
            recordScopeOrApiError(accLabel, 'GET /order/customer-returns', 'allegro:api:orders:read', err);
        }

        await injectedPrisma.analyticsQualitySnapshot.upsert({
            where: {
                workspaceId_platform_accountId_snapshotDate: {
                    workspaceId,
                    platform: 'ALLEGRO',
                    accountId: accId,
                    snapshotDate: todayMidnight
                }
            },
            update: {
                qualityScore,
                maxQualityScore,
                qualityGrade,
                openIssuesCount,
                returnsCount,
                negativeRatingsCount,
                positiveRatingsCount,
                metricsJson: qualityMetricsJson,
                issuesSample
            },
            create: {
                workspaceId,
                platform: 'ALLEGRO',
                accountId: accId,
                snapshotDate: todayMidnight,
                qualityScore,
                maxQualityScore,
                qualityGrade,
                openIssuesCount,
                returnsCount,
                negativeRatingsCount,
                positiveRatingsCount,
                metricsJson: qualityMetricsJson,
                issuesSample
            }
        });

        accountSummaries.push({
            accountId: accId,
            label: accLabel,
            offersSynced: accOffersCount,
            ordersImported: accOrdersCount,
            financialEntriesImported: accBillingCount,
            qualityScore,
            openIssuesCount
        });
    }

    await injectedPrisma.analyticsImportBatch.update({
        where: { id: batch.id },
        data: {
            status: 'COMPLETED',
            recordsImported: totalOrdersImported + totalSnapshotsSaved + totalFinancialEntries,
            dateRangeStart: minDate,
            dateRangeEnd: maxDate,
            warnings: [...warnings, ...scopeWarnings.map(s => s.message)],
            summary: {
                accounts: accountSummaries,
                scopeWarnings
            }
        }
    });

    return {
        batchId: batch.id,
        platform: 'ALLEGRO',
        configured: true,
        accountsSynced: accountSummaries.length,
        ordersImported: totalOrdersImported,
        snapshotsSaved: totalSnapshotsSaved,
        financialEntriesImported: totalFinancialEntries,
        warnings,
        scopeWarnings,
        accounts: accountSummaries
    };
}

module.exports = {
    classifyAllegroBillingCategory,
    syncAllegroAnalytics
};
