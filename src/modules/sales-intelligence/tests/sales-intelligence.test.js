const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');

const prisma = require('../../../core/prisma');
const {
    normalizeCurrencyCode,
    resolveFxRate,
    inferMarketplaceFromOrder,
    isShippingLineItem,
    buildPlnReferencePriceMap,
    inferForeignCurrencyFromPlnPrices
} = require('../utils/currency.helpers');
const { deduplicateOrders, runSalesIntelligenceAnalysis } = require('../engine/analytics.engine');
const {
    decodeTextSmart,
    detectImportFormat,
    parseBaseLinkerRowsToOrders,
    parseAllegroAdsRows,
    parseAllegroAnalyticsOrBillingRows,
    importFilesForWorkspace,
    deleteImportBatch
} = require('../importers/csv-importer.service');
const { classifyBaseLinkerOrigin, parseBaseLinkerProductLogs, syncBaseLinkerAnalytics } = require('../connectors/baselinker.connector');
const { classifyAllegroBillingCategory, syncAllegroAnalytics } = require('../connectors/allegro.connector');
const { syncVonHalskyAnalytics } = require('../connectors/vonhalsky.connector');
const { buildExecutiveXlsxBuffer, buildExecutiveCsvString } = require('../export.service');
const SalesIntelligenceService = require('../sales-intelligence.service');

function createInMemoryPrismaMock() {
    let seq = 1;
    const batches = [];
    const orders = [];
    const snapshots = [];
    const financial = [];
    const quality = [];
    const ads = [];

    return {
        _store: { batches, orders, snapshots, financial, quality, ads },
        analyticsImportBatch: {
            create: async ({ data }) => {
                const row = { id: `batch_${seq++}`, createdAt: new Date(), ...data };
                batches.push(row);
                return row;
            },
            update: async ({ where, data }) => {
                const idx = batches.findIndex(b => b.id === where.id);
                if (idx >= 0) {
                    batches[idx] = { ...batches[idx], ...data };
                    return batches[idx];
                }
                return null;
            }
        },
        analyticsOrder: {
            upsert: async ({ where, update, create }) => {
                const k = where.workspaceId_platform_externalOrderId;
                const idx = orders.findIndex(o =>
                    o.workspaceId === k.workspaceId &&
                    o.platform === k.platform &&
                    o.externalOrderId === k.externalOrderId
                );
                if (idx >= 0) {
                    orders[idx] = { ...orders[idx], ...update };
                    return orders[idx];
                }
                const row = { id: `ord_${seq++}`, ...create };
                orders.push(row);
                return row;
            }
        },
        analyticsDailyOfferSnapshot: {
            upsert: async ({ where, update, create }) => {
                const k = where.workspaceId_platform_snapshotDate_externalOfferId;
                const ts = new Date(k.snapshotDate).getTime();
                const idx = snapshots.findIndex(s =>
                    s.workspaceId === k.workspaceId &&
                    s.platform === k.platform &&
                    new Date(s.snapshotDate).getTime() === ts &&
                    s.externalOfferId === k.externalOfferId
                );
                if (idx >= 0) {
                    snapshots[idx] = { ...snapshots[idx], ...update };
                    return snapshots[idx];
                }
                const row = { id: `snap_${seq++}`, ...create };
                snapshots.push(row);
                return row;
            }
        },
        analyticsFinancialEntry: {
            upsert: async ({ where, update, create }) => {
                const k = where.workspaceId_platform_externalEntryId;
                const idx = financial.findIndex(f =>
                    f.workspaceId === k.workspaceId &&
                    f.platform === k.platform &&
                    f.externalEntryId === k.externalEntryId
                );
                if (idx >= 0) {
                    financial[idx] = { ...financial[idx], ...update };
                    return financial[idx];
                }
                const row = { id: `fin_${seq++}`, ...create };
                financial.push(row);
                return row;
            }
        },
        analyticsQualitySnapshot: {
            upsert: async ({ where, update, create }) => {
                const k = where.workspaceId_platform_accountId_snapshotDate;
                const ts = new Date(k.snapshotDate).getTime();
                const idx = quality.findIndex(q =>
                    q.workspaceId === k.workspaceId &&
                    q.platform === k.platform &&
                    q.accountId === k.accountId &&
                    new Date(q.snapshotDate).getTime() === ts
                );
                if (idx >= 0) {
                    quality[idx] = { ...quality[idx], ...update };
                    return quality[idx];
                }
                const row = { id: `qual_${seq++}`, ...create };
                quality.push(row);
                return row;
            }
        }
    };
}

describe('Sales Intelligence Module — Unit, Engine, Connector & Multi-Workspace DB Suite', () => {
    const tempWorkspaceIds = [];

    after(async () => {
        for (const wsId of tempWorkspaceIds) {
            try {
                await prisma.workspace.delete({ where: { id: wsId } });
            } catch (_) {
                // ignore already deleted
            }
        }
        await prisma.$disconnect();
    });

    it('Currency helpers: normalizes FX, detects shipping items and infers foreign currency from PLN baselines', () => {
        assert.equal(normalizeCurrencyCode('czk', 'CZ'), 'CZK');
        assert.equal(normalizeCurrencyCode('', 'DE'), 'EUR');
        assert.equal(resolveFxRate('EUR'), 4.32);
        assert.equal(inferMarketplaceFromOrder({ originChannel: 'ALLEGRO', currency: 'CZK', country: 'CZ' }), 'allegro-cz');
        assert.equal(isShippingLineItem('Dostawa InPost Paczkomat 24/7', '', ''), true);
        assert.equal(isShippingLineItem('Olej silnikowy 5W40 4L', 'OIL-5W40', '5901234567890'), false);

        const refMap = buildPlnReferencePriceMap([
            {
                currency: 'PLN',
                items: [{ sku: 'SKU-A', ean: '5900001', pricePln: 100, priceOrig: 100 }]
            }
        ]);
        const inferred = inferForeignCurrencyFromPlnPrices([
            { sku: 'SKU-A', ean: '5900001', priceOrig: 540 }
        ], refMap, 'CZ');
        assert.equal(inferred.currency, 'CZK');
    });

    it('Engine enforces unified stockout rule (stock <= 2 = BRAK W OFERCIE, ZERO 0 vs 1-2 split) & ROP with PO subtraction', () => {
        const now = Date.now();
        const mkDate = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();

        const orders = [];
        for (let d = 1; d <= 30; d++) {
            orders.push({
                platform: 'BASELINKER',
                originChannel: 'ALLEGRO',
                externalOrderId: `BL-${d}`,
                orderDate: mkDate(d),
                currency: 'PLN',
                fxRateToPln: 1,
                totalPln: 100,
                items: [{ sku: 'SKU-LOW2', ean: '590111', name: 'Produkt Progowy', qty: 1, priceOrig: 100, pricePln: 100 }]
            });
            orders.push({
                platform: 'BASELINKER',
                originChannel: 'ALLEGRO',
                externalOrderId: `BL-OK-${d}`,
                orderDate: mkDate(d),
                currency: 'PLN',
                fxRateToPln: 1,
                totalPln: 80,
                items: [{ sku: 'SKU-STOCK5', ean: '590222', name: 'Produkt Dostepny', qty: 1, priceOrig: 80, pricePln: 80 }]
            });
        }

        const snapshots = [
            {
                platform: 'BASELINKER',
                externalOfferId: '101',
                snapshotDate: mkDate(1),
                sku: 'SKU-LOW2',
                ean: '590111',
                name: 'Produkt Progowy',
                stock: 2,
                pricePln: 100,
                status: 'SOLDOUT'
            },
            {
                platform: 'BASELINKER',
                externalOfferId: '102',
                snapshotDate: mkDate(1),
                sku: 'SKU-STOCK5',
                ean: '590222',
                name: 'Produkt Dostepny',
                stock: 5,
                pricePln: 80,
                status: 'ACTIVE'
            }
        ];

        const products = [
            { id: 'p1', sku: 'SKU-LOW2', ean: '590111', name: 'Produkt Progowy', stock: 2, basePrice: 40, taxRate: 23, leadTimeDays: 14 },
            { id: 'p2', sku: 'SKU-STOCK5', ean: '590222', name: 'Produkt Dostepny', stock: 5, basePrice: 30, taxRate: 23, leadTimeDays: 14 }
        ];

        const analysis = runSalesIntelligenceAnalysis({
            orders,
            snapshots,
            products,
            openPurchaseOrdersBySku: { 'SKU-LOW2': 10 }
        }, { stockoutThreshold: 2, leadTimeDays: 14 });

        const lowSku = analysis.skus.find(s => s.sku === 'SKU-LOW2');
        const okSku = analysis.skus.find(s => s.sku === 'SKU-STOCK5');

        assert.equal(lowSku.isCurrentlyUnavailable, true);
        assert.equal(lowSku.sellableStock, 0);
        assert.equal(lowSku.openPoQty, 10);
        assert.equal(okSku.isCurrentlyUnavailable, false);
        assert.equal(okSku.sellableStock, 3);
        assert.equal(analysis.kpis.unavailableNowCount, 1);

        // Weryfikujemy, że w raporcie oraz eksportach NIE MA żadnego podziału 0 vs 1-2 / Zombie Stock
        const csvStr = buildExecutiveCsvString(analysis);
        assert.equal(/zombie/i.test(csvStr), false);
        assert.equal(/0\s*szt\.?\s*vs\s*1/i.test(csvStr), false);
        assert.ok(csvStr.includes('BRAK_W_OFERCIE_LE_2'));
        assert.ok(csvStr.includes('SUMA_KONTROLNA_100PCT'));
    });

    it('Omnichannel deduplication prevents double counting BaseLinker mirror + direct Allegro order', () => {
        const orders = [
            {
                id: 'o1',
                platform: 'BASELINKER',
                originChannel: 'ALLEGRO',
                sourceMode: 'API',
                externalOrderId: '998877',
                marketplaceOrderId: 'ALL-CHK-555',
                orderDate: '2026-10-01T10:00:00Z',
                currency: 'PLN',
                totalPln: 120,
                items: [{ sku: 'MY-SKU-1', ean: '590999', name: 'Bestseller', qty: 2, priceOrig: 60, pricePln: 60 }]
            },
            {
                id: 'o2',
                platform: 'ALLEGRO',
                originChannel: 'ALLEGRO',
                sourceMode: 'API',
                externalOrderId: 'ALL-CHK-555',
                marketplaceOrderId: 'ALL-CHK-555',
                orderDate: '2026-10-01T10:00:00Z',
                currency: 'PLN',
                totalPln: 120,
                isSmart: true,
                items: [{ auctionId: '1500001', sku: '1500001', ean: null, name: 'Bestseller', qty: 2, priceOrig: 60, pricePln: 60 }]
            }
        ];

        const deduped = deduplicateOrders(orders, 'ALL');
        assert.equal(deduped.length, 1);
        assert.equal(deduped[0].platform, 'ALLEGRO');
        assert.equal(deduped[0].isSmart, true);
        // SKU z lustra BaseLinker zostało scalone do pozycji zamówienia Allegro
        assert.equal(deduped[0].items[0].sku, 'MY-SKU-1');
        assert.equal(deduped[0].items[0].ean, '590999');
    });

    it('Market Basket Analysis detects Anchor/Filler, Lift >= 1, Smart! 49.90 dead zone, True Net Profit/POAS/GMROI & Zero Fake COGS', () => {
        const orders = [];
        for (let i = 1; i <= 12; i++) {
            const dt = new Date(Date.now() - i * 2 * 86400000).toISOString();
            orders.push({
                platform: 'ALLEGRO',
                originChannel: 'ALLEGRO',
                externalOrderId: `M-${i}`,
                orderDate: dt,
                currency: 'PLN',
                totalPln: 140,
                items: [
                    { sku: 'ANCHOR-A', name: 'Produkt Kotwica', qty: 1, priceOrig: 100, pricePln: 100 },
                    { sku: 'FILLER-B', name: 'Produkt Dopełniacz', qty: 1, priceOrig: 40, pricePln: 40 }
                ]
            });
        }
        // Zamówienia solo w martwej strefie Smart! (< 49.90 zł, >= 33.93 zł)
        for (let i = 1; i <= 5; i++) {
            const dt = new Date(Date.now() - (i + 20) * 86400000).toISOString();
            orders.push({
                platform: 'ALLEGRO',
                originChannel: 'ALLEGRO',
                externalOrderId: `DZ-${i}`,
                orderDate: dt,
                currency: 'PLN',
                totalPln: 42,
                items: [
                    { sku: 'SOLO-DEADZONE', name: 'Solo w martwej strefie', qty: 1, priceOrig: 42, pricePln: 42 }
                ]
            });
        }
        // Zamówienia produktu bez uzupełnionego COGS w PIM
        for (let i = 1; i <= 3; i++) {
            orders.push({
                platform: 'ALLEGRO',
                originChannel: 'ALLEGRO',
                externalOrderId: `NOCOGS-${i}`,
                orderDate: new Date(Date.now() - i * 86400000).toISOString(),
                currency: 'PLN',
                totalPln: 100,
                items: [
                    { sku: 'SKU-NO-COGS', name: 'Brak COGS PIM', qty: 1, priceOrig: 100, pricePln: 100 }
                ]
            });
        }

        const products = [
            { id: 'pa', sku: 'ANCHOR-A', name: 'Produkt Kotwica', stock: 25, basePrice: 45, inboundTransportCost: 1, packagingCost: 1, bdoEprCost: 0.2, outboundTransportCost: 0, taxRate: 23 },
            { id: 'pb', sku: 'FILLER-B', name: 'Produkt Dopełniacz', stock: 1, basePrice: 12, inboundTransportCost: 0.5, packagingCost: 0.5, taxRate: 23 },
            { id: 'pdz', sku: 'SOLO-DEADZONE', name: 'Solo w martwej strefie', stock: 15, basePrice: 15, taxRate: 23 },
            { id: 'pnc', sku: 'SKU-NO-COGS', name: 'Brak COGS PIM', stock: 10, basePrice: null, taxRate: 23 }
        ];

        const financialEntries = [
            { platform: 'ALLEGRO', entryDate: new Date().toISOString(), category: 'COMMISSION', amountPln: -120 },
            { platform: 'ALLEGRO', entryDate: new Date().toISOString(), category: 'PROMO_FEE', amountPln: -19, offerId: 'OF-FILLER' }
        ];
        const adsMetrics = [
            { campaignName: 'Ads Kotwica', sku: 'ANCHOR-A', costNetPln: 100, adRevenuePln: 700, impressions: 5000, clicks: 200, unitsSold: 7 }
        ];
        const snapshots = [
            { platform: 'ALLEGRO', externalOfferId: 'OF-FILLER', snapshotDate: new Date().toISOString(), sku: 'FILLER-B', stock: 1, pricePln: 40, isPromoted: true, status: 'ENDED' },
            { platform: 'VONHALSKY', externalOfferId: 'VH-REJECTED-1', snapshotDate: new Date().toISOString(), sku: 'ANCHOR-A', stock: 25, pricePln: 100, status: 'REJECTED', rejectionReasons: [{ reasonMessage: 'Brak wymaganego EAN w katalogu InPost' }] }
        ];

        const analysis = runSalesIntelligenceAnalysis(
            { orders, products, financialEntries, adsMetrics, snapshots },
            { platform: 'ALL', stockoutThreshold: 2, smartThresholdPln: 49.90 }
        );

        const anchor = analysis.skus.find(s => s.sku === 'ANCHOR-A');
        const noCogs = analysis.skus.find(s => s.sku === 'SKU-NO-COGS');
        const dz = analysis.skus.find(s => s.sku === 'SOLO-DEADZONE');

        assert.equal(anchor.role, 'ANCHOR');
        assert.ok(anchor.crossSellGeneratedPln > 0);
        assert.ok(anchor.verifiedNetProfitPln !== null);

        // Zero Fake Data: SKU bez basePrice nie dostaje wyssanej marży ani zysku
        assert.equal(noCogs.hasVerifiedCogs, false);
        assert.equal(noCogs.verifiedNetProfitPln, null);
        assert.ok(analysis.meta.cogsCoveragePct < 100 && analysis.meta.cogsCoveragePct > 0);

        // Martwa strefa Smart! 49.90 zł
        assert.equal(dz.soloUnderSmartCount, 5);
        assert.ok(analysis.actionQueue.some(q => q.category === 'SMART_BUNDLE' && q.sku === 'SOLO-DEADZONE'));

        // Krwawiąca oferta (FILLER-B ma stock 1 <= 2 oraz isPromoted: true)
        assert.ok(analysis.bleedingOffers.some(b => b.sku === 'FILLER-B'));

        // Luka cross-channel Allegro -> Von Halsky (ANCHOR-A odrzucony na Von Halsky!)
        assert.ok(analysis.crossChannelGaps.some(g => g.sku === 'ANCHOR-A' && g.vonHalskyStatus === 'REJECTED'));
        assert.ok(analysis.vonHalskyDiagnostics.rejectionGroups.length >= 1);

        // ROAS & POAS wyliczone poprawnie
        assert.equal(analysis.kpis.roas, 7);
        assert.ok(analysis.kpis.poas !== null);
    });

    it('CSV/XLSX/JSON Importer handles UTF-8 BOM, Windows-1250, Base.com archive orders, Allegro Ads & Billing CSV', () => {
        // Test dekodowania Windows-1250
        const win1250Buf = Buffer.from([0x5a, 0x61, 0xb3, 0xf3, 0xbf, 0x20]); // "Załóż " w CP1250
        assert.ok(decodeTextSmart(win1250Buf).includes('Załóż'));

        const blCsv = [
            'order_id;external_order_id;order_source;date_add;currency;delivery_country_code;product_sku;product_ean;product_name;product_quantity;product_price_brutto',
            'BL100;AL-100;allegro;2025-11-10 12:00:00;PLN;PL;SKU-1;5901;Płyn do felg;2;35,50',
            'BL100;AL-100;allegro;2025-11-10 12:00:00;PLN;PL;DOSTAWA;0;InPost Paczkomat 24/7;1;10,99',
            'BL101;CZ-200;allegro_cz;2025-11-12 09:00:00;CZK;CZ;SKU-1;5901;Płyn do felg;1;210,00'
        ].join('\n');

        const fmtBl = detectImportFormat('base_archive.csv', Buffer.from(blCsv, 'utf8'), [blCsv.split('\n')[0].split(';'), blCsv.split('\n')[1].split(';')]);
        assert.equal(fmtBl, 'BASELINKER_ARCHIVE_CSV');

        const parsedOrders = parseBaseLinkerRowsToOrders(blCsv.split('\n').map(l => l.split(';')), 'base_archive.csv');
        assert.equal(parsedOrders.length, 2);
        assert.equal(parsedOrders[0].items.length, 1); // wysyłka odfiltrowana!
        assert.equal(parsedOrders[0].items[0].qty, 2);
        assert.equal(parsedOrders[0].items[0].priceOrig, 35.5);
        assert.equal(parsedOrders[1].currency, 'CZK');

        const adsCsv = 'Kampania;Wyświetlenia;Kliknięcia;Koszt netto;Przychód z reklam;ID oferty;SKU\nKampania Lato;10000;250;125,00;1125,00;155001;SKU-1';
        const fmtAds = detectImportFormat('allegro_ads.csv', Buffer.from(adsCsv, 'utf8'), adsCsv.split('\n').map(l => l.split(';')));
        assert.equal(fmtAds, 'ALLEGRO_ADS_CSV');
        const adsParsed = parseAllegroAdsRows(adsCsv.split('\n').map(l => l.split(';')));
        assert.equal(adsParsed.length, 1);
        assert.equal(adsParsed[0].roas, 9);
        assert.equal(adsParsed[0].costNetPln, 125);

        const billingCsv = 'ID operacji;Data;Typ operacji;ID oferty;Kwota\nOP-1;2025-11-10;Prowizja od sprzedaży;155001;-14,50\nOP-2;2025-11-10;Opłata za wyróżnienie;155001;-19,00';
        const parsedBill = parseAllegroAnalyticsOrBillingRows(billingCsv.split('\n').map(l => l.split(';')));
        assert.equal(parsedBill.entries.length, 2);
        assert.equal(parsedBill.entries[0].category, 'COMMISSION');
        assert.equal(parsedBill.entries[1].category, 'PROMO_FEE');
    });

    it('Connectors handle BaseLinker logs, Allegro 403 scope isolation & Von Halsky invalid_scope fallback gracefully', async () => {
        assert.equal(classifyBaseLinkerOrigin('allegro_cz', '', {}), 'ALLEGRO');
        assert.equal(classifyBaseLinkerOrigin('inpost', '', {}), 'VONHALSKY');
        assert.equal(classifyAllegroBillingCategory('SUC', 'Prowizja od sprzedaży'), 'COMMISSION');
        assert.equal(classifyAllegroBillingCategory('FSF', 'Allegro Smart!'), 'SMART');

        const logsParsed = parseBaseLinkerProductLogs([
            { log_type: 1, date: 1700000000, from: 10, to: 2 },
            { log_type: 1, date: 1700259200, from: 2, to: 25 },
            { log_type: 2, date: 1700259200, from: 49.9, to: 54.9 }
        ]);
        assert.equal(logsParsed.stockChanges.length, 2);
        assert.equal(logsParsed.priceChanges.length, 1);

        // 1. BaseLinker mock connector
        const mockPrismaBl = createInMemoryPrismaMock();
        const blRes = await syncBaseLinkerAnalytics({
            workspaceId: 'ws_mock_1',
            days: 30,
            fetchProductLogsTopN: 1,
            includeCourierSla: false,
            injectedPrisma: mockPrismaBl,
            baseLinkerApi: {
                rawCall: async (method) => {
                    if (method === 'getOrderSources') return { sources: { allegro: { '1': 'Allegro PL' } } };
                    if (method === 'getOrders') {
                        return {
                            orders: [{
                                order_id: 9001,
                                order_source: 'allegro',
                                order_source_id: 1,
                                date_add: Math.floor(Date.now() / 1000) - 3600,
                                currency: 'PLN',
                                delivery_country_code: 'PL',
                                payment_done: 100,
                                products: [{ product_id: 501, sku: 'BL-SKU-1', ean: '590501', name: 'Produkt BL', quantity: 2, price_brutto: 50 }]
                            }]
                        };
                    }
                    if (method === 'getInventories') return { inventories: [{ inventory_id: 10, name: 'Główny' }] };
                    if (method === 'getInventoryProductsList') return { products: { '501': { sku: 'BL-SKU-1', ean: '590501', name: 'Produkt BL', stock: { 'bl_1': 8 }, prices: { '1': 50 } } } };
                    if (method === 'getInventoryPurchaseOrders') return { purchase_orders: [{ status_name: 'Wysłane', products: [{ sku: 'BL-SKU-1', quantity: 20, quantity_received: 5 }] }] };
                    if (method === 'getInventoryProductLogs') return { logs: [{ log_type: 1, date: 1700000000, from: 5, to: 1 }] };
                    if (method === 'getOrderReturns') return { returns: [] };
                    return {};
                }
            }
        });
        assert.equal(blRes.ordersImported, 1);
        assert.equal(blRes.openPurchaseOrdersCount, 1);
        assert.equal(blRes.loggedProductsCount, 1);

        // 2. Allegro mock connector z symulacją 403 na billing-entries
        const mockPrismaAl = createInMemoryPrismaMock();
        const alRes = await syncAllegroAnalytics({
            workspaceId: 'ws_mock_1',
            days: 30,
            injectedPrisma: mockPrismaAl,
            allegroApi: {
                listConnectedAllegroAccounts: async () => [{ accountId: 'al_1', label: 'Konto Allegro Mock', login: 'mock' }],
                getAllegroToken: async () => 'mock-token',
                apiClient: {
                    get: async (url) => {
                        if (url.includes('/billing/billing-entries')) {
                            const err = new Error('Missing scope allegro:api:billing:read');
                            err.response = { status: 403 };
                            throw err;
                        }
                        if (url.includes('/sale/offers')) {
                            return {
                                data: {
                                    offers: [{
                                        id: '16000001',
                                        name: 'Oferta Mock',
                                        external: { id: 'BL-SKU-1' },
                                        sellingMode: { price: { amount: '50.00', currency: 'PLN' } },
                                        stock: { available: 8, sold: 4 },
                                        stats: { visitsCount: 320, watchersCount: 15 },
                                        publication: { status: 'ACTIVE', marketplaces: { base: { id: 'allegro-pl' } } }
                                    }],
                                    totalCount: 1
                                }
                            };
                        }
                        if (url.includes('/order/checkout-forms')) {
                            return {
                                data: {
                                    checkoutForms: [{
                                        id: 'chk-1',
                                        status: 'READY_FOR_PROCESSING',
                                        updatedAt: new Date().toISOString(),
                                        marketplace: { id: 'allegro-pl' },
                                        delivery: { method: { name: 'Allegro Paczkomat Smart!' }, smart: true },
                                        summary: { totalToPay: { amount: '50.00', currency: 'PLN' } },
                                        lineItems: [{ id: 'li-1', offer: { id: '16000001', name: 'Oferta Mock', external: { id: 'BL-SKU-1' } }, quantity: 1, price: { amount: '50.00', currency: 'PLN' } }]
                                    }]
                                }
                            };
                        }
                        return { data: {} };
                    }
                }
            }
        });
        assert.equal(alRes.snapshotsSaved, 1);
        assert.equal(alRes.ordersImported, 1);
        assert.ok(alRes.scopeWarnings.some(w => w.requiredScope === 'allegro:api:billing:read'));

        // 3. InPost Von Halsky mock connector z fallbackiem `invalid_scope` przy braku `api:orders:read`
        const mockPrismaVh = createInMemoryPrismaMock();
        const vhRes = await syncVonHalskyAnalytics({
            workspaceId: 'ws_mock_1',
            days: 30,
            injectedPrisma: mockPrismaVh,
            vonHalskyApi: {
                listAccounts: async () => [{ accountId: 'vh_1', label: 'Von Halsky Mock', organizationId: 'org-1', configured: true }],
                getAccessToken: async ({ scopeOverride }) => {
                    if (String(scopeOverride || '').includes('api:orders:read')) {
                        const err = new Error('invalid_scope: api:orders:read');
                        err.statusCode = 400;
                        throw err;
                    }
                    return 'mock-vh-token';
                },
                listCampaigns: async () => ({ data: [{ id: 'camp-1', name: 'InPost Okazje' }] }),
                listCampaignDeclarations: async () => ({ data: [], page: { total: 0 } }),
                listOffers: async () => ({
                    data: [{
                        offer: {
                            id: 'vh-off-1',
                            status: 'REJECTED',
                            product: { sku: 'BL-SKU-1', ean: '590501', name: 'Produkt Von Halsky' },
                            price: { grossPrice: { amount: '49.90', currency: 'PLN' } },
                            stock: { quantity: 8 }
                        }
                    }],
                    page: { total: 1 }
                }),
                getOfferDetails: async () => ({
                    metadata: { rejectionReasons: [{ reasonMessage: 'Zbyt niska rozdzielczość zdjęcia głównego' }], validationErrors: [] }
                }),
                listOfferEvents: async () => ({ data: [{ offerEventType: 'REJECTED' }] })
            }
        });
        assert.equal(vhRes.snapshotsSaved, 1);
        assert.equal(vhRes.ordersImported, 0);
        assert.ok(vhRes.scopeWarnings.some(w => w.requiredScope === 'api:orders:read'));
    });

    it('XLSX Executive export builds all 8 sheets with 100% SKU control sum & zero 0-vs-1-2 split', () => {
        const analysis = runSalesIntelligenceAnalysis({
            orders: [
                {
                    platform: 'BASELINKER',
                    originChannel: 'ALLEGRO',
                    externalOrderId: 'EX-1',
                    orderDate: '2026-10-15T10:00:00Z',
                    currency: 'PLN',
                    totalPln: 150,
                    items: [
                        { sku: 'EXP-1', name: 'Towar Eksport 1', qty: 1, priceOrig: 100, pricePln: 100 },
                        { sku: 'EXP-2', name: 'Towar Eksport 2', qty: 1, priceOrig: 50, pricePln: 50 }
                    ]
                }
            ],
            products: [
                { sku: 'EXP-1', name: 'Towar Eksport 1', stock: 1, basePrice: 40, taxRate: 23 },
                { sku: 'EXP-2', name: 'Towar Eksport 2', stock: 20, basePrice: 20, taxRate: 23 }
            ]
        });

        const xlsxBuf = buildExecutiveXlsxBuffer(analysis);
        assert.ok(Buffer.isBuffer(xlsxBuf) && xlsxBuf.length > 1000);

        const wb = XLSX.read(xlsxBuf, { type: 'buffer' });
        assert.equal(wb.SheetNames.length, 8);
        assert.ok(wb.SheetNames.includes('Podsumowanie Zarzadcze'));
        assert.ok(wb.SheetNames.includes('Pelny Wykaz SKU (100%)'));
        assert.ok(wb.SheetNames.includes('Zatowarowanie ROP'));

        const sheet100 = XLSX.utils.sheet_to_json(wb.Sheets['Pelny Wykaz SKU (100%)'], { header: 1 });
        const lastRow = sheet100[sheet100.length - 1];
        assert.ok(String(lastRow[0]).includes('SUMA KONTROLNA (100% SKU: 2)'));
        assert.equal(lastRow[8], 2); // suma sprzedanych sztuk
        assert.equal(lastRow[12], 150); // suma obrotu GMV
    });

    it('Live PostgreSQL Multi-Workspace isolation & CSV batch upload/rollback works cleanly', async () => {
        const wsA = await prisma.workspace.create({
            data: {
                name: 'SI_TEST_WS_A',
                slug: `si-test-a-${Date.now()}`,
                isActive: true
            }
        });
        const wsB = await prisma.workspace.create({
            data: {
                name: 'SI_TEST_WS_B',
                slug: `si-test-b-${Date.now()}`,
                isActive: true
            }
        });
        tempWorkspaceIds.push(wsA.id, wsB.id);

        const sampleCsv = [
            'order_id;external_order_id;order_source;date_add;currency;delivery_country_code;product_sku;product_ean;product_name;product_quantity;product_price_brutto',
            'LIVE-1;MKT-LIVE-1;allegro;2026-10-10 12:00:00;PLN;PL;ISOLATED-SKU-A;590999111;Izolowany Produkt A;3;45,00'
        ].join('\n');

        const importRes = await importFilesForWorkspace({
            workspaceId: wsA.id,
            files: [{ originalname: 'test_ws_a.csv', buffer: Buffer.from(sampleCsv, 'utf8') }],
            injectedPrisma: prisma
        });
        assert.equal(importRes.length, 1);
        assert.equal(importRes[0].recordsImported, 1);
        const batchId = importRes[0].batchId;

        const dashA = await SalesIntelligenceService.getDashboard(wsA.id, {}, prisma);
        const dashB = await SalesIntelligenceService.getDashboard(wsB.id, {}, prisma);

        assert.equal(dashA.dataCounts.rawOrdersCount, 1);
        assert.equal(dashA.kpis.totalGmvPln, 135);
        assert.equal(dashB.dataCounts.rawOrdersCount, 0);
        assert.equal(dashB.skus.length, 0);

        const deepA = await SalesIntelligenceService.getSkuDeepDive(wsA.id, 'ISOLATED-SKU-A', {}, prisma);
        assert.equal(deepA.sku.totalUnits, 3);
        assert.equal(deepA.recentOrders.length, 1);

        // Próba usunięcia batcha A z kontekstu WS B musi zwrócić 404 (twarda izolacja)
        await assert.rejects(
            () => deleteImportBatch(wsB.id, batchId, prisma),
            (err) => err.statusCode === 404
        );

        // Wycofanie batcha w ramach WS A musi całkowicie usunąć zamówienie
        const delRes = await deleteImportBatch(wsA.id, batchId, prisma);
        assert.equal(delRes.deletedOrders, 1);

        const dashAAfter = await SalesIntelligenceService.getDashboard(wsA.id, {}, prisma);
        assert.equal(dashAAfter.dataCounts.rawOrdersCount, 0);
    });
});
