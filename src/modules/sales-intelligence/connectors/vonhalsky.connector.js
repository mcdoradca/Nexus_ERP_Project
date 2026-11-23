const prisma = require('../../../core/prisma');
const VonHalskyService = require('../../offer-optimizer/vonhalsky.service');
const { runBatchUpserts } = require('../utils/batch.helpers');
const {
    round2,
    utcDayMidnight,
    normalizeCurrencyCode,
    resolveFxRate
} = require('../utils/currency.helpers');

/**
 * Synchronizuje pełne dane analityczne z InPost Von Halsky API (OpenAPI v1.7.12):
 * - Oferty i szczegóły odrzuceń (`validationErrors`, `rejectionReasons`)
 * - Zdarzenia ofert (`SOLDOUT`, `CLOSED`, `REOPENED`, `REJECTED`)
 * - Kampanie cenowe i deklaracje udziału (Program Cenowy)
 * - Zamówienia i `programPrice.discountSplit` (`inpostShare` vs `merchantShare`), metody płatności/dostaw
 * - Zdarzenia zamówień (czasy akceptacji i wysyłki SLA)
 * - Posprzedaż v2: Zwroty, Reklamacje, Refundy i terminy `decisionDueDate`
 *
 * Zachowuje pełne bezpieczeństwo: w razie braku uprawnień `api:orders:read` wykonuje fallback na `api:categories:read api:offers:read`.
 */
async function syncVonHalskyAnalytics({
    workspaceId,
    accountId = null,
    days = 90,
    fxRates = {},
    injectedPrisma = prisma,
    vonHalskyApi = null,
    onProgress = null
} = {}) {
    if (!workspaceId) {
        throw new Error('Wymagany jest identyfikator klienta (workspaceId) do synchronizacji InPost Von Halsky.');
    }

    const vh = vonHalskyApi || VonHalskyService;

    let accounts = [];
    try {
        const allAccs = await vh.listAccounts(workspaceId, injectedPrisma);
        if (accountId) {
            accounts = allAccs.filter(a => String(a.accountId) === String(accountId));
        } else {
            accounts = allAccs.filter(a => a.configured);
        }
    } catch (err) {
        return {
            platform: 'VONHALSKY',
            configured: false,
            accountsSynced: 0,
            ordersImported: 0,
            snapshotsSaved: 0,
            warnings: [`Błąd odczytu kont InPost Von Halsky: ${err.message}`],
            scopeWarnings: []
        };
    }

    if (accounts.length === 0) {
        return {
            platform: 'VONHALSKY',
            configured: false,
            accountsSynced: 0,
            ordersImported: 0,
            snapshotsSaved: 0,
            warnings: ['Brak skonfigurowanego konta InPost Von Halsky dla wybranego klienta. Uzupełnij Client ID / Client Secret w Panelu Admina.'],
            scopeWarnings: []
        };
    }

    const effectiveDays = Math.min(Math.max(Number(days) || 90, 1), 180);
    const updatedAtGte = new Date(Date.now() - effectiveDays * 86400000).toISOString();
    const todayMidnight = utcDayMidnight(new Date());

    let totalOrdersImported = 0;
    let totalSnapshotsSaved = 0;
    const warnings = [];
    const scopeWarnings = [];
    const accountSummaries = [];

    const batch = await injectedPrisma.analyticsImportBatch.create({
        data: {
            workspaceId,
            platform: 'VONHALSKY',
            sourceType: 'API_SYNC',
            accountId: accountId || null,
            status: 'PROCESSING',
            warnings: []
        }
    });

    let minDate = null;
    let maxDate = null;

    for (const acc of accounts) {
        const accId = acc.accountId || 'default';
        const accLabel = acc.label || 'InPost Von Halsky';
        let orgId = acc.organizationId;

        const baseScopeOpts = {
            workspaceId,
            accountId: acc.accountId || null,
            injectedPrisma
        };

        // Sprawdzamy, czy klucz ma też zakres api:orders:read (nie zmieniając DEFAULT_SCOPES eksportu!)
        let activeReadScope = 'api:categories:read api:offers:read api:orders:read';
        let hasOrdersScope = true;
        try {
            await vh.getAccessToken({ ...baseScopeOpts, scopeOverride: activeReadScope });
        } catch (scopeErr) {
            const msg = String(scopeErr?.message || '').toLowerCase();
            if (msg.includes('scope') || scopeErr?.statusCode === 400 || scopeErr?.statusCode === 403) {
                hasOrdersScope = false;
                activeReadScope = 'api:categories:read api:offers:read';
                scopeWarnings.push({
                    account: accLabel,
                    endpoint: 'GET /v1/organizations/{id}/orders & /v2/returns|claims|refunds',
                    requiredScope: 'api:orders:read',
                    message: `[${accLabel}] Klucz API InPost nie ma uprawnienia api:orders:read — pobrano wyłącznie oferty, odrzucenia i program cenowy (bez zamówień i zwrotów).`
                });
            } else {
                warnings.push(`[${accLabel}] Błąd autoryzacji InPost Von Halsky: ${scopeErr.message}`);
                continue;
            }
        }

        const optsWithScope = { ...baseScopeOpts, scopeOverride: activeReadScope };

        if (!orgId) {
            try {
                const orgs = await vh.getOrganizations(optsWithScope);
                orgId = orgs[0]?.id || '';
            } catch (err) {
                warnings.push(`[${accLabel}] Nie udało się pobrać organizationId: ${err.message}`);
            }
        }

        if (!orgId) {
            warnings.push(`[${accLabel}] Brak Organization UUID w konfiguracji InPost Von Halsky.`);
            continue;
        }

        let accOffersCount = 0;
        let accOrdersCount = 0;

        // 1. Kampanie cenowe i deklaracje udziału ofert
        let availableCampaigns = [];
        const priceProgramOfferIds = new Set();
        try {
            const campRes = await vh.listCampaigns({ limit: 30, offset: 0, ...optsWithScope });
            availableCampaigns = campRes.data || [];
        } catch (err) {
            warnings.push(`[${accLabel}] Nie udało się pobrać listy kampanii cenowych: ${err.message}`);
        }

        try {
            let offset = 0;
            for (let p = 0; p < 20; p++) {
                const declRes = await vh.listCampaignDeclarations({ organizationId: orgId, limit: 30, offset, ...optsWithScope });
                const decls = declRes.data || [];
                for (const d of decls) {
                    const oid = String(d?.offerId || '');
                    const hasActiveCamp = Array.isArray(d?.campaignDeclarations) && d.campaignDeclarations.some(cd => cd?.participationMode && cd.participationMode !== 'NONE');
                    const hasDecl = d?.declaration?.participationMode && d.declaration.participationMode !== 'NONE';
                    if (oid && (hasActiveCamp || hasDecl)) {
                        priceProgramOfferIds.add(oid);
                    }
                }
                const total = Number(declRes?.page?.total || 0);
                if (decls.length < 30 || offset + decls.length >= total) break;
                offset += 30;
            }
        } catch (err) {
            warnings.push(`[${accLabel}] Nie udało się pobrać deklaracji Programu Cenowego: ${err.message}`);
        }

        // 2. Oferty + szczegóły odrzuceń (validationErrors & rejectionReasons)
        const offersList = [];
        try {
            let offset = 0;
            const limit = 30;
            for (let p = 0; p < 50; p++) {
                const res = await vh.listOffers({ organizationId: orgId, limit, offset, sort: ['-updatedAt'], ...optsWithScope });
                const items = res.data || [];
                offersList.push(...items);
                const total = Number(res?.page?.total || 0);
                if (items.length < limit || offset + items.length >= total) break;
                offset += limit;
            }
        } catch (err) {
            warnings.push(`[${accLabel}] Błąd pobierania ofert Von Halsky: ${err.message}`);
        }

        // Dociągamy szczegóły dla REJECTED / PENDING (max 40 w jednym przebiegu)
        const detailsByOfferId = {};
        const rejectedIds = offersList
            .map(it => it?.offer || it)
            .filter(o => o && ['REJECTED', 'PENDING'].includes(String(o.status || '').toUpperCase()))
            .map(o => String(o.id))
            .slice(0, 40);

        for (const oid of rejectedIds) {
            try {
                const det = await vh.getOfferDetails(orgId, oid, optsWithScope);
                if (det) detailsByOfferId[oid] = det;
            } catch (_) { /* ignore single detail fetch failure */ }
        }

        // 3. Zdarzenia ofert (SOLDOUT, CLOSED, REOPENED, REJECTED)
        const offerEventsSummary = {};
        try {
            const evRes = await vh.listOfferEvents({ organizationId: orgId, limit: 1000, ...optsWithScope });
            for (const ev of evRes.data || []) {
                const t = String(ev?.offerEventType || 'UNKNOWN');
                offerEventsSummary[t] = (offerEventsSummary[t] || 0) + 1;
            }
        } catch (err) {
            warnings.push(`[${accLabel}] Nie udało się pobrać zdarzeń ofert Von Halsky: ${err.message}`);
        }

        const offerSnapPayloads = new Map();
        for (const item of offersList) {
            const off = item?.offer || item;
            if (!off?.id) continue;
            const oid = String(off.id);
            const detMeta = detailsByOfferId[oid]?.metadata || item?.metadata || {};
            const grossOrig = parseFloat(off?.price?.grossPrice?.amount || 0) || 0;
            const promoOrig = off?.price?.promotionPrice?.amount ? parseFloat(off.price.promotionPrice.amount) : null;
            const currency = normalizeCurrencyCode(off?.price?.grossPrice?.currency, 'PL') || 'PLN';
            const fx = resolveFxRate(currency, fxRates);

            const stockQty = Number(off?.stock?.quantity ?? 0);
            const offerStatus = String(off?.status || 'PENDING').toUpperCase();
            const inPriceProgram = priceProgramOfferIds.has(oid) || Boolean(off?.priceProgram?.mode && off.priceProgram.mode !== 'NONE');

            const snapData = {
                accountId: accId,
                sku: off?.product?.sku ? String(off.product.sku).trim() : (off?.externalId ? String(off.externalId).trim() : null),
                ean: off?.product?.ean ? String(off.product.ean).trim() : null,
                name: off?.product?.name ? String(off.product.name).slice(0, 250) : null,
                status: offerStatus,
                stock: Number.isFinite(stockQty) ? stockQty : 0,
                pricePln: round2(grossOrig * fx),
                promotionPricePln: promoOrig !== null ? round2(promoOrig * fx) : null,
                currency,
                isPromoted: Boolean(off?.promotion && promoOrig !== null),
                inPriceProgram,
                rejectionReasons: Array.isArray(detMeta.rejectionReasons) ? detMeta.rejectionReasons : [],
                validationErrors: Array.isArray(detMeta.validationErrors) ? detMeta.validationErrors : [],
                meta: {
                    externalId: off.externalId || null,
                    categoryId: off?.product?.categoryId || null,
                    daysToShip: off?.shippingTime?.daysToShip ?? null,
                    priceProgramMode: off?.priceProgram?.mode || null
                }
            };
            offerSnapPayloads.set(oid, {
                oid,
                updateData: snapData,
                createData: {
                    workspaceId,
                    platform: 'VONHALSKY',
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
                            platform: 'VONHALSKY',
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
                    onItemError: (err, item) => warnings.push(`[${accLabel}] Błąd zapisu oferty Von Halsky ${item.oid}: ${err.message}`)
                }
            );
            accOffersCount += savedOffers;
            totalSnapshotsSaved += savedOffers;
            onProgress?.({
                platform: 'VONHALSKY',
                stage: 'OFFERS',
                message: `[${accLabel}] Zapisano ${accOffersCount} ofert InPost Von Halsky...`,
                snapshotsDelta: savedOffers
            });
        }

        // 4. Zamówienia, zdarzenia SLA oraz posprzedaż v2 (wymaga api:orders:read)
        let returnsCount = 0;
        let claimsCount = 0;
        const postSalesAlerts = [];
        const returnReasonsAgg = {};
        const claimCategoriesAgg = {};
        let declinedRefundsCount = 0;

        if (hasOrdersScope) {
            // 4A. Zdarzenia zamówień do wyliczenia czasów ACCEPTED i SHIPPED (SLA)
            const slaTimestampsByOrderId = {};
            try {
                const ordEvRes = await vh.listOrderEvents({ organizationId: orgId, limit: 1000, ...optsWithScope });
                for (const ev of ordEvRes.data || []) {
                    const oid = String(ev?.order?.id || '');
                    if (!oid || !ev?.occurredAt) continue;
                    if (!slaTimestampsByOrderId[oid]) slaTimestampsByOrderId[oid] = {};
                    const t = String(ev.orderEventType || '').toUpperCase();
                    if (t === 'ACCEPTED') slaTimestampsByOrderId[oid].acceptedAt = new Date(ev.occurredAt);
                    if (t === 'SHIPPED') slaTimestampsByOrderId[oid].shippedAt = new Date(ev.occurredAt);
                }
            } catch (err) {
                warnings.push(`[${accLabel}] Nie udało się pobrać zdarzeń zamówień Von Halsky: ${err.message}`);
            }

            // 4B. Zamówienia (listOrders)
            try {
                let offset = 0;
                const limit = 30;
                for (let p = 0; p < 60; p++) {
                    const ordRes = await vh.listOrders({
                        organizationId: orgId,
                        updatedAtGte,
                        limit,
                        offset,
                        sort: ['-createdAt'],
                        ...optsWithScope
                    });
                    const orders = ordRes.data || [];
                    if (orders.length === 0) break;

                    const pageOrderPayloads = new Map();
                    for (const ord of orders) {
                        const oid = String(ord?.id || '').trim();
                        if (!oid) continue;
                        const currency = normalizeCurrencyCode(ord?.finalPrice?.currency || ord?.basePrice?.currency, 'PL') || 'PLN';
                        const fx = resolveFxRate(currency, fxRates);
                        const ordStatus = String(ord?.status || 'CREATED').toUpperCase();
                        const isCancelled = ['REFUSED', 'REJECTED', 'CANCELED', 'CANCELLED'].includes(ordStatus);

                        const lines = Array.isArray(ord?.orderLines) ? ord.orderLines : [];
                        const cleanItems = [];
                        let itemsOrigSum = 0;
                        let merchantDiscountOrig = 0;
                        let platformDiscountOrig = 0;

                        for (const line of lines) {
                            const offerInfo = line?.offer || line;
                            if (!offerInfo) continue;
                            const qty = Math.max(1, parseInt(line?.quantity || offerInfo?.quantity || 1, 10) || 1);
                            const finalAmt = parseFloat(offerInfo?.finalPrice?.amount ?? offerInfo?.price?.amount ?? 0) || 0;
                            const baseAmt = parseFloat(offerInfo?.basePrice?.amount ?? finalAmt) || finalAmt;
                            const promoAmt = offerInfo?.promotionPrice?.amount !== undefined ? (parseFloat(offerInfo.promotionPrice.amount) || 0) : null;

                            // Rabat promocji własnej sprzedawcy
                            if (promoAmt !== null && baseAmt > promoAmt) {
                                merchantDiscountOrig += (baseAmt - promoAmt) * qty;
                            }
                            // Rabat Programu Cenowego ("Cenowy Sztos") z dokładnym podziałem inpostShare vs merchantShare
                            const split = offerInfo?.programPrice?.discountSplit;
                            if (split) {
                                platformDiscountOrig += (parseFloat(split?.inpostShare?.amount || 0) || 0) * qty;
                                merchantDiscountOrig += (parseFloat(split?.merchantShare?.amount || 0) || 0) * qty;
                            } else if (offerInfo?.programPrice?.discount?.amount) {
                                merchantDiscountOrig += (parseFloat(offerInfo.programPrice.discount.amount) || 0) * qty;
                            }

                            itemsOrigSum += finalAmt * qty;
                            const prod = offerInfo?.product || {};
                            cleanItems.push({
                                sku: prod?.sku ? String(prod.sku).trim() : (offerInfo?.externalId ? String(offerInfo.externalId).trim() : String(offerInfo.offerId || '')),
                                ean: prod?.ean ? String(prod.ean).trim() : null,
                                productId: prod?.productId ? String(prod.productId) : null,
                                auctionId: offerInfo?.offerId ? String(offerInfo.offerId) : null,
                                name: String(prod?.name || 'Produkt InPost'),
                                qty,
                                priceOrig: round2(finalAmt),
                                pricePln: round2(finalAmt * fx),
                                inPriceProgram: Boolean(offerInfo?.programPrice)
                            });
                        }

                        if (cleanItems.length === 0) continue;

                        const orderDate = ord?.createdAt ? new Date(ord.createdAt) : new Date();
                        if (!minDate || orderDate < minDate) minDate = orderDate;
                        if (!maxDate || orderDate > maxDate) maxDate = orderDate;

                        const shipOrig = parseFloat(ord?.delivery?.price?.amount || 0) || 0;
                        const sla = slaTimestampsByOrderId[oid] || {};

                        const ordCommonData = {
                            originChannel: 'VONHALSKY',
                            accountId: accId,
                            marketplaceOrderId: oid,
                            sourceMode: 'API',
                            importBatchId: batch.id,
                            orderDate,
                            status: isCancelled ? 'CANCELLED' : 'CONFIRMED',
                            paymentStatus: ord?.paymentDetails?.payments?.[0]?.paymentDate ? 'PAID' : 'NOT_PAID',
                            paymentMethod: ord?.paymentDetails?.selectedPaymentType ? String(ord.paymentDetails.selectedPaymentType) : null,
                            deliveryMethod: ord?.delivery?.deliveryType ? String(ord.delivery.deliveryType) : null,
                            deliveryCountry: 'PL',
                            marketplace: 'inpost-vonhalsky',
                            currency,
                            fxRateToPln: fx,
                            isSmart: false,
                            totalGmvOriginal: round2(itemsOrigSum),
                            totalGmvPln: round2(itemsOrigSum * fx),
                            shippingPln: round2(shipOrig * fx),
                            discountMerchantPln: round2(merchantDiscountOrig * fx),
                            discountPlatformPln: round2(platformDiscountOrig * fx),
                            acceptedAt: sla.acceptedAt || null,
                            shippedAt: sla.shippedAt || null,
                            items: cleanItems,
                            rawMeta: {
                                vonHalskyStatus: ordStatus,
                                deliveryPoint: ord?.delivery?.deliveryPoint || null
                            }
                        };
                        pageOrderPayloads.set(oid, {
                            oid,
                            updateData: ordCommonData,
                            createData: {
                                workspaceId,
                                platform: 'VONHALSKY',
                                externalOrderId: oid,
                                ...ordCommonData
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
                                        platform: 'VONHALSKY',
                                        externalOrderId: item.oid
                                    }
                                },
                                update: item.updateData,
                                create: item.createData
                            }),
                            {
                                prismaClient: injectedPrisma,
                                chunkSize: 50,
                                onItemError: (err, item) => warnings.push(`[${accLabel}] Błąd zapisu zamówienia Von Halsky ${item.oid}: ${err.message}`)
                            }
                        );
                        accOrdersCount += savedOrders;
                        totalOrdersImported += savedOrders;
                        onProgress?.({
                            platform: 'VONHALSKY',
                            stage: 'ORDERS',
                            message: `[${accLabel}] Zapisano ${accOrdersCount} zamówień InPost Von Halsky...`,
                            ordersDelta: savedOrders
                        });
                    }

                    const total = Number(ordRes?.page?.total || 0);
                    if (orders.length < limit || offset + orders.length >= total) break;
                    offset += limit;
                }
            } catch (err) {
                warnings.push(`[${accLabel}] Błąd pobierania zamówień Von Halsky: ${err.message}`);
            }

            // 4C. Posprzedaż v2: Zwroty, Reklamacje i Refundy
            try {
                const retRes = await vh.listReturnsV2({ organizationId: orgId, limit: 30, offset: 0, ...optsWithScope });
                const returns = retRes.items || [];
                returnsCount = Number(retRes?.page?.total || returns.length);
                for (const r of returns) {
                    const reasonText = String(r?.returnReason?.text || r?.description || 'Brak podanego powodu').slice(0, 120);
                    returnReasonsAgg[reasonText] = (returnReasonsAgg[reasonText] || 0) + 1;
                    if (r?.status === 'NEW' && r?.expiresAt) {
                        const hrsLeft = (new Date(r.expiresAt).getTime() - Date.now()) / 3600000;
                        if (hrsLeft <= 48) {
                            postSalesAlerts.push({ type: 'RETURN_DUE', id: r.displayId || r.id, hoursLeft: round2(hrsLeft) });
                        }
                    }
                }
            } catch (err) {
                warnings.push(`[${accLabel}] Nie udało się pobrać zwrotów v2 Von Halsky: ${err.message}`);
            }

            try {
                const clmRes = await vh.listClaimsV2({ organizationId: orgId, limit: 30, offset: 0, ...optsWithScope });
                const claims = clmRes.items || [];
                claimsCount = Number(clmRes?.page?.total || claims.length);
                for (const c of claims) {
                    const cType = String(c?.specification?.claimTypeDescription || 'Reklamacja').slice(0, 120);
                    claimCategoriesAgg[cType] = (claimCategoriesAgg[cType] || 0) + 1;
                    if (c?.state === 'NEW' && c?.decisionDueDate) {
                        const hrsLeft = (new Date(c.decisionDueDate).getTime() - Date.now()) / 3600000;
                        if (hrsLeft <= 48) {
                            postSalesAlerts.push({ type: 'CLAIM_DUE', id: c.displayId || c.claimId, hoursLeft: round2(hrsLeft) });
                        }
                    }
                }
            } catch (err) {
                warnings.push(`[${accLabel}] Nie udało się pobrać reklamacji v2 Von Halsky: ${err.message}`);
            }

            try {
                const refRes = await vh.listRefundsV2({ organizationId: orgId, limit: 30, offset: 0, ...optsWithScope });
                for (const rf of refRes.items || []) {
                    if (rf?.refundPaymentStatus === 'DECLINED') {
                        declinedRefundsCount++;
                    }
                }
            } catch (err) {
                warnings.push(`[${accLabel}] Nie udało się pobrać refundów v2 Von Halsky: ${err.message}`);
            }
        }

        await injectedPrisma.analyticsQualitySnapshot.upsert({
            where: {
                workspaceId_platform_accountId_snapshotDate: {
                    workspaceId,
                    platform: 'VONHALSKY',
                    accountId: accId,
                    snapshotDate: todayMidnight
                }
            },
            update: {
                openIssuesCount: postSalesAlerts.length + declinedRefundsCount,
                returnsCount,
                claimsCount,
                metricsJson: {
                    availableCampaigns: availableCampaigns.map(c => ({ id: c.id, name: c.name })),
                    offerEventsSummary,
                    returnReasons: returnReasonsAgg,
                    claimCategories: claimCategoriesAgg,
                    declinedRefundsCount
                },
                issuesSample: postSalesAlerts
            },
            create: {
                workspaceId,
                platform: 'VONHALSKY',
                accountId: accId,
                snapshotDate: todayMidnight,
                openIssuesCount: postSalesAlerts.length + declinedRefundsCount,
                returnsCount,
                claimsCount,
                metricsJson: {
                    availableCampaigns: availableCampaigns.map(c => ({ id: c.id, name: c.name })),
                    offerEventsSummary,
                    returnReasons: returnReasonsAgg,
                    claimCategories: claimCategoriesAgg,
                    declinedRefundsCount
                },
                issuesSample: postSalesAlerts
            }
        });

        accountSummaries.push({
            accountId: accId,
            label: accLabel,
            organizationId: orgId,
            hasOrdersScope,
            offersSynced: accOffersCount,
            ordersImported: accOrdersCount,
            returnsCount,
            claimsCount
        });
    }

    await injectedPrisma.analyticsImportBatch.update({
        where: { id: batch.id },
        data: {
            status: 'COMPLETED',
            recordsImported: totalOrdersImported + totalSnapshotsSaved,
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
        platform: 'VONHALSKY',
        configured: true,
        accountsSynced: accountSummaries.length,
        ordersImported: totalOrdersImported,
        snapshotsSaved: totalSnapshotsSaved,
        warnings,
        scopeWarnings,
        accounts: accountSummaries
    };
}

module.exports = {
    syncVonHalskyAnalytics
};
