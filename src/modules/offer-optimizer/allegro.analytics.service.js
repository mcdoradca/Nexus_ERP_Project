const { getAllegroToken, apiClient } = require('./allegro.service');
const prisma = require('../../core/prisma');

/**
 * Serwis analityczny Allegro (Read-Only)
 * Pobiera rzeczywiste statystyki oferty (visitsCount, watchersCount, stock.available, stock.sold)
 * z GET /sale/offers oraz wylicza przyrosty dzienne na bazie migawek AnalyticsDailyOfferSnapshot.
 */
async function fetchOfferStatistics(offerId, opts = {}) {
    if (!offerId) throw new Error('Brak offerId do analizy statystyk.');
    const cleanOfferId = String(offerId).trim();
    const {
        workspaceId = null,
        accountId = null,
        injectedPrisma = prisma,
        httpClient = apiClient
    } = opts || {};

    try {
        const token = await getAllegroToken(false, accountId, injectedPrisma, workspaceId);

        console.log(`[AllegroAnalytics] Pobieranie rzeczywistych statystyk dla oferty: ${cleanOfferId}`);
        const response = await httpClient.get('https://api.allegro.pl/sale/offers', {
            params: { 'offer.id': cleanOfferId, limit: 1 },
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 15000
        });

        const offer = Array.isArray(response?.data?.offers) ? response.data.offers[0] : null;
        const totalVisits = Number(offer?.stats?.visitsCount || 0);
        const watchersCount = Number(offer?.stats?.watchersCount || 0);
        const availableStock = offer?.stock?.available !== undefined ? Number(offer.stock.available) : null;
        const sold30d = offer?.stock?.sold !== undefined ? Number(offer.stock.sold) : 0;
        const publicationStatus = offer?.publication?.status || null;

        let deltaVisits = null;
        let deltaWatchers = null;
        if (workspaceId && injectedPrisma?.analyticsDailyOfferSnapshot) {
            try {
                const snapshots = await injectedPrisma.analyticsDailyOfferSnapshot.findMany({
                    where: {
                        workspaceId,
                        platform: 'ALLEGRO',
                        externalOfferId: cleanOfferId
                    },
                    orderBy: { snapshotDate: 'asc' },
                    take: 60
                });
                const withVisits = snapshots.filter(s => typeof s.visitsCount === 'number');
                if (withVisits.length >= 2) {
                    const first = withVisits[0];
                    const last = withVisits[withVisits.length - 1];
                    deltaVisits = Math.max(0, Number(last.visitsCount || 0) - Number(first.visitsCount || 0));
                    deltaWatchers = Number(last.watchersCount || 0) - Number(first.watchersCount || 0);
                }
            } catch (snapErr) {
                console.warn(`[AllegroAnalytics] Nie udało się wyliczyć delty z migawek dla ${cleanOfferId}: ${snapErr.message}`);
            }
        }

        const effectiveVisits = deltaVisits !== null ? deltaVisits : totalVisits;
        const conversionRate = effectiveVisits > 0 ? (sold30d / effectiveVisits) : 0;

        return {
            offerId: cleanOfferId,
            visitsCount: totalVisits,
            watchersCount,
            availableStock,
            sold30d,
            publicationStatus,
            deltaVisits,
            deltaWatchers,
            impressions: effectiveVisits,
            clicks: effectiveVisits,
            ctr: conversionRate
        };
    } catch (error) {
        console.warn(`[AllegroAnalytics] Brak bezpośrednich danych statystycznych dla ${cleanOfferId} lub błąd uprawnień:`, error.message);
        return {
            offerId: cleanOfferId,
            visitsCount: 0,
            watchersCount: 0,
            availableStock: null,
            sold30d: 0,
            publicationStatus: null,
            deltaVisits: null,
            deltaWatchers: null,
            impressions: 0,
            clicks: 0,
            ctr: 0
        };
    }
}

/**
 * Zderza rzeczywiste statystyki oferty Allegro z kosztami produktu w bazie PIM (Product.basePrice).
 */
async function fuseTrafficWithSales(ean, offerId, { workspaceId = null, accountId = null, stockoutThreshold = 2, injectedPrisma = prisma } = {}) {
    const stats = await fetchOfferStatistics(offerId, { workspaceId, accountId, injectedPrisma });

    const product = await injectedPrisma.product.findFirst({
        where: workspaceId ? { workspaceId, ean } : { ean }
    });

    if (!product) {
        throw new Error(`Produkt ${ean} nie istnieje w bazie PIM.`);
    }

    const basePrice = Number(product.basePrice || 0);
    const hasVerifiedCogs = basePrice > 0;
    const salePrice = Number(product.salePrice || 0);
    const taxRate = Number(product.taxRate || 23);
    const netSalePrice = salePrice / (1 + (taxRate / 100));
    const margin = hasVerifiedCogs ? (netSalePrice - basePrice) : null;
    const effectiveStock = stats.availableStock !== null ? stats.availableStock : Number(product.stock || 0);

    return {
        ean,
        offerId: String(offerId),
        visitsCount: stats.visitsCount,
        watchersCount: stats.watchersCount,
        sold30d: stats.sold30d,
        impressions: stats.impressions,
        clicks: stats.clicks,
        ctr: stats.ctr,
        salePrice,
        basePrice: hasVerifiedCogs ? basePrice : null,
        hasVerifiedCogs,
        margin,
        stock: effectiveStock,
        warning: stats.visitsCount > 200 && effectiveStock <= stockoutThreshold
            ? `Przepalanie ruchu przy braku w ofercie (stan ${effectiveStock} ≤ ${stockoutThreshold} szt.).`
            : null
    };
}

module.exports = {
    fetchOfferStatistics,
    fuseTrafficWithSales
};
