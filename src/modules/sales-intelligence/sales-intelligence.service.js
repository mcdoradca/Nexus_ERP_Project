const crypto = require('crypto');
const prisma = require('../../core/prisma');
const AllegroService = require('../offer-optimizer/allegro.service');
const VonHalskyService = require('../offer-optimizer/vonhalsky.service');
const { syncBaseLinkerAnalytics } = require('./connectors/baselinker.connector');
const { syncAllegroAnalytics } = require('./connectors/allegro.connector');
const { syncVonHalskyAnalytics } = require('./connectors/vonhalsky.connector');
const { importFilesForWorkspace, deleteImportBatch } = require('./importers/csv-importer.service');
const { runSalesIntelligenceAnalysis, deduplicateOrders } = require('./engine/analytics.engine');
const { buildExecutiveXlsxBuffer, buildExecutiveCsvString } = require('./export.service');

// Rejestr aktywnych/ostatnich zadań synchronizacji API w izolacji per workspaceId
const syncJobsByWorkspace = new Map();
const STALE_SYNC_JOB_MS = 20 * 60 * 1000;

function getSyncJobStatus(workspaceId) {
    if (!workspaceId) return null;
    const job = syncJobsByWorkspace.get(String(workspaceId));
    if (!job) return null;
    if (job.status === 'RUNNING') {
        const lastUpdateMs = new Date(job.updatedAt || job.startedAt).getTime();
        if (Number.isFinite(lastUpdateMs) && Date.now() - lastUpdateMs > STALE_SYNC_JOB_MS) {
            job.status = 'FAILED';
            job.error = 'Przekroczono maksymalny czas oczekiwania na synchronizację (20 min).';
            job.stageMessage = job.error;
            job.finishedAt = new Date().toISOString();
            job.updatedAt = job.finishedAt;
        }
    }
    return {
        ...job,
        counters: { ...(job.counters || {}) }
    };
}

/**
 * Ładuje pełny zestaw danych analitycznych z bazy PostgreSQL dla wskazanego klienta (`workspaceId`).
 * Każde zapytanie zawiera twardą izolację `where: { workspaceId }`.
 */
async function loadWorkspaceDataset(workspaceId, { dateFrom = null, dateTo = null } = {}, injectedPrisma = prisma) {
    if (!workspaceId) {
        const err = new Error('Brak kontekstu klienta (workspaceId).');
        err.statusCode = 400;
        throw err;
    }

    const orderDateFilter = {};
    if (dateFrom) orderDateFilter.gte = new Date(dateFrom);
    if (dateTo) orderDateFilter.lte = new Date(new Date(dateTo).getTime() + 86399999);
    const hasDateFilter = Object.keys(orderDateFilter).length > 0;

    const [
        orders,
        snapshots,
        financialEntries,
        adsMetrics,
        qualitySnapshots,
        products,
        recentSyncBatches
    ] = await Promise.all([
        injectedPrisma.analyticsOrder.findMany({
            where: {
                workspaceId,
                ...(hasDateFilter ? { orderDate: orderDateFilter } : {})
            },
            orderBy: { orderDate: 'asc' }
        }),
        injectedPrisma.analyticsDailyOfferSnapshot.findMany({
            where: {
                workspaceId,
                ...(hasDateFilter ? { snapshotDate: orderDateFilter } : {})
            },
            orderBy: { snapshotDate: 'asc' }
        }),
        injectedPrisma.analyticsFinancialEntry.findMany({
            where: {
                workspaceId,
                ...(hasDateFilter ? { entryDate: orderDateFilter } : {})
            },
            orderBy: { entryDate: 'asc' }
        }),
        injectedPrisma.analyticsAdsMetric.findMany({
            where: { workspaceId },
            orderBy: { periodStart: 'asc' }
        }),
        injectedPrisma.analyticsQualitySnapshot.findMany({
            where: { workspaceId },
            orderBy: { snapshotDate: 'desc' },
            take: 120
        }),
        injectedPrisma.product.findMany({
            where: { workspaceId },
            select: {
                id: true,
                sku: true,
                ean: true,
                name: true,
                stock: true,
                salePrice: true,
                basePrice: true,
                inboundTransportCost: true,
                packagingCost: true,
                bdoEprCost: true,
                outboundTransportCost: true,
                baselinkerId: true,
                baselinkerInventoryId: true,
                taxRate: true,
                leadTimeDays: true,
                targetMargin: true
            }
        }),
        injectedPrisma.analyticsImportBatch.findMany({
            where: {
                workspaceId,
                status: 'COMPLETED'
            },
            orderBy: { createdAt: 'desc' },
            take: 15,
            select: {
                platform: true,
                sourceType: true,
                summary: true,
                createdAt: true
            }
        })
    ]);

    // Łączenie otwartych PO oraz logów stanów z ostatnich synchronizacji BaseLinker / JSON cache
    let openPurchaseOrdersBySku = {};
    const stockLogsByProductId = {};

    for (const b of recentSyncBatches) {
        const sum = b?.summary;
        if (!sum || typeof sum !== 'object') continue;
        if (sum.openPurchaseOrdersBySku && typeof sum.openPurchaseOrdersBySku === 'object' && Object.keys(openPurchaseOrdersBySku).length === 0) {
            openPurchaseOrdersBySku = sum.openPurchaseOrdersBySku;
        }
        if (sum.productLogsByProductId && typeof sum.productLogsByProductId === 'object') {
            for (const [pid, logObj] of Object.entries(sum.productLogsByProductId)) {
                if (!stockLogsByProductId[pid] && logObj && Array.isArray(logObj.stockChanges)) {
                    stockLogsByProductId[pid] = logObj;
                }
            }
        }
    }

    return {
        orders,
        snapshots,
        financialEntries,
        adsMetrics,
        qualitySnapshots,
        products,
        openPurchaseOrdersBySku,
        stockLogsByProductId
    };
}

/**
 * Normalizuje opcje filtrowania i progi analityczne przekazywane z UI/API.
 */
function normalizeAnalysisOptions(queryOpts = {}) {
    const threshold = queryOpts.stockoutThreshold !== undefined
        ? Math.max(0, Math.min(50, Math.trunc(Number(queryOpts.stockoutThreshold))))
        : 2;

    return {
        platform: String(queryOpts.platform || 'ALL').toUpperCase(),
        marketFilter: String(queryOpts.marketFilter || 'ALL').toUpperCase(),
        accountFilter: queryOpts.accountFilter ? String(queryOpts.accountFilter) : 'ALL',
        stockoutThreshold: Number.isFinite(threshold) ? threshold : 2,
        smartThresholdPln: Number(queryOpts.smartThresholdPln) > 0 ? Number(queryOpts.smartThresholdPln) : 49.90,
        leadTimeDays: Number(queryOpts.leadTimeDays) > 0 ? Number(queryOpts.leadTimeDays) : 14,
        safetyBufferPct: queryOpts.safetyBufferPct !== undefined ? Number(queryOpts.safetyBufferPct) : 0.25,
        applySeasonalFilter: queryOpts.applySeasonalFilter !== 'false' && queryOpts.applySeasonalFilter !== false,
        dateFrom: queryOpts.dateFrom || null,
        dateTo: queryOpts.dateTo || null
    };
}

/**
 * Zwraca kompletny raport analityczny dla wybranego widoku (`ALL`, `BASELINKER`, `ALLEGRO`, `VONHALSKY`).
 */
async function getDashboard(workspaceId, queryOpts = {}, injectedPrisma = prisma) {
    const opts = normalizeAnalysisOptions(queryOpts);
    const dataset = await loadWorkspaceDataset(workspaceId, { dateFrom: opts.dateFrom, dateTo: opts.dateTo }, injectedPrisma);
    const analysis = runSalesIntelligenceAnalysis(dataset, opts);

    return {
        workspaceId,
        generatedAt: new Date().toISOString(),
        dataCounts: {
            rawOrdersCount: dataset.orders.length,
            snapshotsCount: dataset.snapshots.length,
            financialEntriesCount: dataset.financialEntries.length,
            adsMetricsCount: dataset.adsMetrics.length,
            qualitySnapshotsCount: dataset.qualitySnapshots.length,
            pimProductsCount: dataset.products.length
        },
        ...analysis
    };
}

/**
 * Zwraca status kont API, historię importów, pokrycie 24M dla zamówień/bilingów/Ads/migawek oraz daty ostatnich synchronizacji.
 */
async function getStatus(workspaceId, injectedPrisma = prisma) {
    if (!workspaceId) {
        const err = new Error('Brak kontekstu klienta (workspaceId).');
        err.statusCode = 400;
        throw err;
    }

    const [
        blAccountsRows,
        allegroAccounts,
        vonHalskyAccounts,
        batches,
        ordersSummaryRows,
        adsSummaryRows,
        financialSummaryRows,
        snapshotCount
    ] = await Promise.all([
        injectedPrisma.integrationAccount.findMany({
            where: { workspaceId, provider: 'BASELINKER', isActive: true },
            select: { id: true, label: true, isDefault: true, updatedAt: true }
        }),
        AllegroService.listConnectedAllegroAccounts(injectedPrisma, workspaceId).catch(() => []),
        VonHalskyService.listAccounts(workspaceId, injectedPrisma).catch(() => []),
        injectedPrisma.analyticsImportBatch.findMany({
            where: { workspaceId },
            orderBy: { createdAt: 'desc' },
            take: 40
        }),
        injectedPrisma.analyticsOrder.findMany({
            where: { workspaceId },
            select: { orderDate: true, platform: true, sourceMode: true }
        }),
        injectedPrisma.analyticsAdsMetric.count({ where: { workspaceId } }),
        injectedPrisma.analyticsFinancialEntry.count({ where: { workspaceId } }),
        injectedPrisma.analyticsDailyOfferSnapshot.count({ where: { workspaceId } })
    ]);

    // Budowa mapy pokrycia miesięcznego (ostatnie 24 miesiące)
    const now = new Date();
    const monthlyCoverageMap = {};
    for (let i = 23; i >= 0; i--) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
        const key = d.toISOString().slice(0, 7);
        monthlyCoverageMap[key] = { month: key, totalOrders: 0, apiOrders: 0, csvOrders: 0 };
    }

    const platformCounts = { BASELINKER: 0, ALLEGRO: 0, VONHALSKY: 0 };
    let earliestOrderDate = null;
    let latestOrderDate = null;

    for (const o of ordersSummaryRows) {
        const dt = new Date(o.orderDate);
        if (!earliestOrderDate || dt < earliestOrderDate) earliestOrderDate = dt;
        if (!latestOrderDate || dt > latestOrderDate) latestOrderDate = dt;
        const mKey = dt.toISOString().slice(0, 7);
        if (monthlyCoverageMap[mKey]) {
            monthlyCoverageMap[mKey].totalOrders++;
            if (o.sourceMode === 'API') monthlyCoverageMap[mKey].apiOrders++;
            else monthlyCoverageMap[mKey].csvOrders++;
        }
        if (platformCounts[o.platform] !== undefined) {
            platformCounts[o.platform]++;
        }
    }

    return {
        workspaceId,
        accounts: {
            BASELINKER: blAccountsRows.map(a => ({ id: a.id, label: a.label, isDefault: a.isDefault })),
            ALLEGRO: allegroAccounts.map(a => ({ id: a.accountId || a.integrationAccountId || 'default', label: a.label || a.allegroLogin || 'Allegro', login: a.allegroLogin || null })),
            VONHALSKY: vonHalskyAccounts.filter(a => a.configured).map(a => ({ id: a.accountId || 'default', label: a.label || 'Von Halsky', organizationId: a.organizationId || null }))
        },
        totals: {
            ordersByPlatform: platformCounts,
            totalOrders: ordersSummaryRows.length,
            dailySnapshots: snapshotCount,
            financialEntries: financialSummaryRows,
            adsMetrics: adsSummaryRows,
            earliestOrderDate,
            latestOrderDate
        },
        monthlyCoverage: Object.values(monthlyCoverageMap),
        activeSyncJob: getSyncJobStatus(workspaceId),
        batches: batches.map(b => ({
            id: b.id,
            platform: b.platform,
            sourceType: b.sourceType,
            fileName: b.fileName,
            status: b.status,
            recordsImported: b.recordsImported,
            recordsSkipped: b.recordsSkipped,
            dateRangeStart: b.dateRangeStart,
            dateRangeEnd: b.dateRangeEnd,
            warnings: b.warnings,
            createdAt: b.createdAt
        }))
    };
}

/**
 * Uruchamia synchronizację na żądanie dla wskazanych platform (`['BASELINKER', 'ALLEGRO', 'VONHALSKY']`).
 * Domyślnie używa szybkiego trybu (bez ciężkich zapytań per SKU `getInventoryProductLogs`, chyba że `deepMode: true`).
 */
async function syncPlatforms(workspaceId, body = {}, injectedPrisma = prisma) {
    if (!workspaceId) {
        const err = new Error('Brak kontekstu klienta (workspaceId).');
        err.statusCode = 400;
        throw err;
    }

    const requested = Array.isArray(body.platforms) && body.platforms.length > 0
        ? body.platforms.map(p => String(p).toUpperCase())
        : ['BASELINKER', 'ALLEGRO', 'VONHALSKY'];

    const days = Math.min(Math.max(Number(body.days) || 60, 1), 180);
    const deepMode = Boolean(body.deepMode);
    const fetchProductLogsTopN = body.fetchProductLogsTopN !== undefined
        ? Number(body.fetchProductLogsTopN)
        : (deepMode ? 20 : 0);
    const includeCourierSla = body.includeCourierSla !== undefined
        ? Boolean(body.includeCourierSla)
        : deepMode;
    const stockoutThreshold = body.stockoutThreshold !== undefined ? Number(body.stockoutThreshold) : 2;
    const accountId = body.accountId || null;
    const onProgress = typeof body.onProgress === 'function' ? body.onProgress : null;

    const results = {};
    const allWarnings = [];
    const allScopeWarnings = [];

    if (requested.includes('BASELINKER')) {
        onProgress?.({ platform: 'BASELINKER', stage: 'START', message: 'Pobieranie danych Base.com / BaseLinker...' });
        try {
            const blRes = await syncBaseLinkerAnalytics({
                workspaceId,
                accountId,
                days,
                fetchProductLogsTopN,
                includePurchaseOrders: true,
                includeReturns: true,
                includeCourierSla,
                stockoutThreshold,
                injectedPrisma,
                onProgress
            });
            results.BASELINKER = blRes;
            if (Array.isArray(blRes.warnings)) allWarnings.push(...blRes.warnings);
            onProgress?.({ platform: 'BASELINKER', stage: 'DONE', message: `Zakończono BaseLinker (${blRes.ordersImported || 0} zam., ${blRes.snapshotsSaved || 0} stanów).` });
        } catch (err) {
            results.BASELINKER = { platform: 'BASELINKER', error: err.message };
            allWarnings.push(`BaseLinker sync error: ${err.message}`);
        }
    }

    if (requested.includes('ALLEGRO')) {
        onProgress?.({ platform: 'ALLEGRO', stage: 'START', message: 'Pobieranie ofert, zamówień i bilingów Allegro...' });
        try {
            const alRes = await syncAllegroAnalytics({
                workspaceId,
                accountId,
                days: Math.min(days, 60),
                injectedPrisma,
                onProgress
            });
            results.ALLEGRO = alRes;
            if (Array.isArray(alRes.warnings)) allWarnings.push(...alRes.warnings);
            if (Array.isArray(alRes.scopeWarnings)) allScopeWarnings.push(...alRes.scopeWarnings);
            onProgress?.({ platform: 'ALLEGRO', stage: 'DONE', message: `Zakończono Allegro (${alRes.snapshotsSaved || 0} ofert, ${alRes.ordersImported || 0} zam.).` });
        } catch (err) {
            results.ALLEGRO = { platform: 'ALLEGRO', error: err.message };
            allWarnings.push(`Allegro sync error: ${err.message}`);
        }
    }

    if (requested.includes('VONHALSKY')) {
        onProgress?.({ platform: 'VONHALSKY', stage: 'START', message: 'Pobieranie danych InPost Von Halsky...' });
        try {
            const vhRes = await syncVonHalskyAnalytics({
                workspaceId,
                accountId,
                days,
                injectedPrisma,
                onProgress
            });
            results.VONHALSKY = vhRes;
            if (Array.isArray(vhRes.warnings)) allWarnings.push(...vhRes.warnings);
            if (Array.isArray(vhRes.scopeWarnings)) allScopeWarnings.push(...vhRes.scopeWarnings);
            onProgress?.({ platform: 'VONHALSKY', stage: 'DONE', message: `Zakończono InPost Von Halsky (${vhRes.snapshotsSaved || 0} ofert, ${vhRes.ordersImported || 0} zam.).` });
        } catch (err) {
            results.VONHALSKY = { platform: 'VONHALSKY', error: err.message };
            allWarnings.push(`InPost Von Halsky sync error: ${err.message}`);
        }
    }

    return {
        workspaceId,
        syncedAt: new Date().toISOString(),
        results,
        warnings: allWarnings,
        scopeWarnings: allScopeWarnings
    };
}

/**
 * Uruchamia asynchroniczne zadanie synchronizacji API w tle dla wskazanego klienta (`workspaceId`)
 * i natychmiast zwraca identyfikator/status zadania do pollingu przez frontend.
 */
function startSyncJob(workspaceId, body = {}, injectedPrisma = prisma, deps = {}) {
    if (!workspaceId) {
        const err = new Error('Brak kontekstu klienta (workspaceId).');
        err.statusCode = 400;
        throw err;
    }

    const existing = getSyncJobStatus(workspaceId);
    if (existing && existing.status === 'RUNNING') {
        return {
            accepted: true,
            alreadyRunning: true,
            job: existing
        };
    }

    const requested = Array.isArray(body.platforms) && body.platforms.length > 0
        ? body.platforms.map(p => String(p).toUpperCase())
        : ['BASELINKER', 'ALLEGRO', 'VONHALSKY'];

    const nowIso = new Date().toISOString();
    const job = {
        jobId: crypto.randomUUID(),
        workspaceId: String(workspaceId),
        status: 'RUNNING',
        startedAt: nowIso,
        updatedAt: nowIso,
        finishedAt: null,
        platforms: requested,
        deepMode: Boolean(body.deepMode),
        days: Math.min(Math.max(Number(body.days) || 60, 1), 180),
        progressPct: 5,
        currentPlatform: requested[0] || null,
        stageMessage: 'Uruchamianie synchronizacji API...',
        counters: { orders: 0, snapshots: 0, financial: 0 },
        results: {},
        warnings: [],
        scopeWarnings: [],
        syncedAt: null,
        error: null
    };
    syncJobsByWorkspace.set(String(workspaceId), job);

    const runner = typeof deps.runSync === 'function' ? deps.runSync : syncPlatforms;
    void (async () => {
        try {
            const totalPlatforms = Math.max(1, requested.length);
            const onProgress = (evt = {}) => {
                const idx = evt.platform ? requested.indexOf(evt.platform) : -1;
                const safeIdx = idx >= 0 ? idx : 0;
                const basePct = Math.round((safeIdx / totalPlatforms) * 90) + 5;
                const boost = evt.stage === 'DONE'
                    ? Math.round(90 / totalPlatforms)
                    : Math.min(Math.round(80 / totalPlatforms), (job.progressPct - basePct) + 6);

                job.updatedAt = new Date().toISOString();
                if (evt.platform) job.currentPlatform = evt.platform;
                if (evt.message) job.stageMessage = evt.message;
                job.progressPct = Math.min(96, Math.max(job.progressPct, basePct + boost));
                if (evt.ordersDelta) job.counters.orders += Number(evt.ordersDelta || 0);
                if (evt.snapshotsDelta) job.counters.snapshots += Number(evt.snapshotsDelta || 0);
                if (evt.financialDelta) job.counters.financial += Number(evt.financialDelta || 0);
            };

            const syncRes = await runner(workspaceId, { ...body, onProgress }, injectedPrisma);
            job.results = syncRes?.results || {};
            job.warnings = Array.isArray(syncRes?.warnings) ? syncRes.warnings : [];
            job.scopeWarnings = Array.isArray(syncRes?.scopeWarnings) ? syncRes.scopeWarnings : [];
            job.syncedAt = syncRes?.syncedAt || new Date().toISOString();
            job.progressPct = 100;
            job.status = 'COMPLETED';
            job.stageMessage = 'Synchronizacja API zakończona.';
            job.finishedAt = new Date().toISOString();
            job.updatedAt = job.finishedAt;
        } catch (err) {
            job.status = 'FAILED';
            job.error = err.message || 'Nieznany błąd synchronizacji API.';
            job.stageMessage = `Błąd synchronizacji: ${job.error}`;
            job.finishedAt = new Date().toISOString();
            job.updatedAt = job.finishedAt;
        }
    })();

    return {
        accepted: true,
        alreadyRunning: false,
        job: getSyncJobStatus(workspaceId)
    };
}

/**
 * Zwraca dogłębną analizę pojedynczego SKU / EAN wraz z historią dziennych migawek,
 * bilingów, Ads, wydarzeń braków i koszykowych par współwystępowania.
 */
async function getSkuDeepDive(workspaceId, skuOrEan, queryOpts = {}, injectedPrisma = prisma) {
    const cleanTarget = String(skuOrEan || '').trim();
    if (!cleanTarget) {
        const err = new Error('Brak symbolu SKU lub EAN.');
        err.statusCode = 400;
        throw err;
    }

    const opts = normalizeAnalysisOptions(queryOpts);
    const dataset = await loadWorkspaceDataset(workspaceId, { dateFrom: opts.dateFrom, dateTo: opts.dateTo }, injectedPrisma);
    const analysis = runSalesIntelligenceAnalysis(dataset, opts);

    const low = cleanTarget.toLowerCase();
    const skuEntry = (analysis.skus || []).find(s =>
        String(s.sku || '').toLowerCase() === low ||
        String(s.ean || '').toLowerCase() === low ||
        String(s.skuKey || '').toLowerCase() === low
    );

    if (!skuEntry) {
        const err = new Error(`Nie znaleziono produktu "${cleanTarget}" w analizie dla wybranego klienta.`);
        err.statusCode = 404;
        throw err;
    }

    // Dzienne migawki tego produktu z ostatnich 90 dni
    const offerIdsSet = new Set([
        ...(skuEntry.allegroOfferIds || []),
        ...(skuEntry.vonHalskyOfferIds || []),
        skuEntry.baselinkerProductId || ''
    ].filter(Boolean));

    const snapTimeline = dataset.snapshots
        .filter(sn =>
            (sn.sku && String(sn.sku).toLowerCase() === low) ||
            (sn.ean && String(sn.ean).toLowerCase() === low) ||
            offerIdsSet.has(String(sn.externalOfferId))
        )
        .map(sn => ({
            date: new Date(sn.snapshotDate).toISOString().slice(0, 10),
            platform: sn.platform,
            externalOfferId: sn.externalOfferId,
            status: sn.status,
            stock: sn.stock,
            pricePln: sn.pricePln,
            visitsCount: sn.visitsCount,
            watchersCount: sn.watchersCount,
            isPromoted: sn.isPromoted,
            hasBadge: sn.hasBadge,
            inPriceProgram: sn.inPriceProgram,
            rejectionReasons: sn.rejectionReasons
        }));

    // Powiązane pary koszykowe
    const relatedPairs = (analysis.pairs || []).filter(p =>
        p.skuKeyA === skuEntry.skuKey || p.skuKeyB === skuEntry.skuKey
    ).slice(0, 15);

    // Zdarzenia skoków/spadków dla tego SKU
    const skuSpikesAndDrops = (analysis.spikesAndDrops || []).filter(e =>
        String(e.sku || '').toLowerCase() === String(skuEntry.sku || '').toLowerCase()
    );

    // Ostatnie zamówienia zawierające ten produkt
    const deduped = deduplicateOrders(dataset.orders, opts.platform);
    const matchingOrders = [];
    for (let i = deduped.length - 1; i >= 0 && matchingOrders.length < 25; i--) {
        const ord = deduped[i];
        const hit = (ord.items || []).some(it =>
            String(it.sku || '').toLowerCase() === low ||
            String(it.ean || '').toLowerCase() === low ||
            (skuEntry.ean && String(it.ean || '').toLowerCase() === String(skuEntry.ean).toLowerCase())
        );
        if (hit) {
            matchingOrders.push({
                externalOrderId: ord.externalOrderId,
                platform: ord.platform,
                originChannel: ord.originChannel,
                orderDate: ord.orderDate,
                currency: ord.currency,
                totalPln: ord.totalPln,
                isSmart: ord.isSmart,
                itemsCount: (ord.items || []).length
            });
        }
    }

    return {
        workspaceId,
        meta: analysis.meta,
        sku: skuEntry,
        snapshotsTimeline: snapTimeline,
        relatedPairs,
        spikesAndDrops: skuSpikesAndDrops,
        recentOrders: matchingOrders
    };
}

/**
 * Codzienny nocny CRON dla wskazanego Workspace:
 * Odświeża migawki magazynowe i ofertowe (ostatnie 3 dni zamówień + stany + Quality/Issues/Returns),
 * budując w PostgreSQL ciągłą historię `AnalyticsDailyOfferSnapshot` (działa nawet wtedy, gdy BaseLinker nie ma długich logów).
 */
async function runDailySnapshotForWorkspace(workspaceId, injectedPrisma = prisma) {
    if (!workspaceId) return null;

    const summary = {
        workspaceId,
        baselinker: null,
        allegro: null,
        vonhalsky: null,
        errors: []
    };

    try {
        summary.baselinker = await syncBaseLinkerAnalytics({
            workspaceId,
            days: 3,
            fetchProductLogsTopN: 0,
            includePurchaseOrders: true,
            includeReturns: true,
            includeCourierSla: false,
            injectedPrisma
        });
    } catch (err) {
        summary.errors.push(`BASELINKER: ${err.message}`);
    }

    try {
        summary.allegro = await syncAllegroAnalytics({
            workspaceId,
            days: 3,
            injectedPrisma
        });
    } catch (err) {
        summary.errors.push(`ALLEGRO: ${err.message}`);
    }

    try {
        summary.vonhalsky = await syncVonHalskyAnalytics({
            workspaceId,
            days: 7,
            injectedPrisma
        });
    } catch (err) {
        summary.errors.push(`VONHALSKY: ${err.message}`);
    }

    return summary;
}

async function exportXlsx(workspaceId, queryOpts = {}, injectedPrisma = prisma) {
    const analysis = await getDashboard(workspaceId, queryOpts, injectedPrisma);
    const buffer = buildExecutiveXlsxBuffer(analysis);
    return { buffer, analysis };
}

async function exportCsv(workspaceId, queryOpts = {}, injectedPrisma = prisma) {
    const analysis = await getDashboard(workspaceId, queryOpts, injectedPrisma);
    const csv = buildExecutiveCsvString(analysis);
    return { csv, analysis };
}

module.exports = {
    loadWorkspaceDataset,
    normalizeAnalysisOptions,
    getDashboard,
    getStatus,
    syncPlatforms,
    startSyncJob,
    getSyncJobStatus,
    importUploadedFiles: (workspaceId, files, opts = {}, injectedPrisma = prisma) =>
        importFilesForWorkspace({ workspaceId, files, ...opts, injectedPrisma }),
    removeImportBatch: (workspaceId, batchId, injectedPrisma = prisma) => deleteImportBatch(workspaceId, batchId, injectedPrisma),
    getSkuDeepDive,
    runDailySnapshotForWorkspace,
    exportXlsx,
    exportCsv
};
