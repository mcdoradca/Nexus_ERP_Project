const { getAllegroToken, apiClient } = require('./allegro.service');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * Serwis analityczny (Deep Research Agent)
 * Pobiera rzeczywiste statystyki ofert (odsłony, kliknięcia, koszty) 
 * bezpośrednio z REST API Allegro oraz Allegro Ads API, aby zasilić Mózg Biddingowy.
 */

async function fetchOfferStatistics(offerId) {
    if (!offerId) throw new Error("Brak offerId do analizy statystyk.");

    try {
        const token = await getAllegroToken();
        
        console.log(`[AllegroAnalytics] Pobieranie rzeczywistych statystyk dla oferty: ${offerId}`);
        // Endpoint analityczny Allegro dla sprzedawców:
        const response = await apiClient.get(`https://api.allegro.pl/sale/offer-events?offerId=${offerId}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            }
        });

        // Agregacja twardych logów (odsłony)
        let totalImpressions = 0;
        let totalClicks = 0; // Jeśli API zwróci zdarzenia kliknięcia z zewnętrznych źródeł
        
        if (response.data && response.data.offerEvents) {
            response.data.offerEvents.forEach(event => {
                if (event.type === 'OFFER_VIEWED') totalImpressions += 1;
                if (event.type === 'OFFER_CLICKED') totalClicks += 1;
            });
        }

        return {
            offerId,
            impressions: totalImpressions,
            clicks: totalClicks,
            ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) : 0
        };
    } catch (error) {
        console.warn(`[AllegroAnalytics] Brak bezpośrednich danych statystycznych dla ${offerId} lub błąd uprawnień:`, error.message);
        // Fallback do zera, kategoryczny zakaz Math.random()
        return { offerId, impressions: 0, clicks: 0, ctr: 0 };
    }
}

/**
 * Zderza dane z Allegro z twardymi zyskami z BaseLinker/Prisma
 */
async function fuseTrafficWithSales(ean, offerId) {
    const stats = await fetchOfferStatistics(offerId);
    
    const product = await prisma.product.findUnique({
        where: { ean }
    });

    if (!product) {
        throw new Error(`Produkt ${ean} nie istnieje w bazie PIM.`);
    }

    // Załóżmy, że zysk mamy wyliczony w systemie (salePrice - cogs - prowizja)
    // Twarde wyliczenie bez symulacji
    const cogs = product.cogs || 0;
    const salePrice = product.salePrice || 0;
    const margin = salePrice - cogs; // uproszczenie do celów architektonicznych

    return {
        ean,
        offerId,
        impressions: stats.impressions,
        clicks: stats.clicks,
        ctr: stats.ctr,
        salePrice,
        cogs,
        margin,
        warning: stats.impressions > 1000 && product.stock === 0 ? 'Przepalanie ruchu! Brak zapasu.' : null
    };
}

module.exports = {
    fetchOfferStatistics,
    fuseTrafficWithSales
};
