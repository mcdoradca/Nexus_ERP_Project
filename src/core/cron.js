const cron = require('node-cron');
const AnalyticsService = require('../modules/analytics/analytics.service');
const RmaService = require('../modules/rma/rma.service');
const LogisticsService = require('../modules/logistics/logistics.service');

function initCronJobs() {
    // Odciążenie bazy OLTP (Threat 3 z poprawki.md)
    // Asynchroniczne przeliczanie True Net Margin każdej nocy o 04:00 w tle.
    // Dzięki temu, w ciągu dnia system uniknie "wielowymiarowych ułamków" 
    // podczas aktywnych operacji handlowców na Tablicy Kanban.
    cron.schedule('0 4 * * *', async () => {
        console.log('[CRON] Rozpoczynam asynchroniczne wyliczanie True Net Margin (odciążenie OLTP)...');
        try {
            // Skalowanie God-Mode (asynchroniczny bufor dla Dashboardu)
            // Przy wdrożeniu pełnej hurtowni danych, tutaj zrzucimy wyniki do Redisa
            // Aktualnie symulujemy asynchroniczne odpalenie algorytmu
            await AnalyticsService.generateGodModeReport();
            console.log('[CRON] Zakończono wyliczanie analityki biznesowej w tle.');
        } catch (error) {
            console.error('[CRON] Błąd podczas wyliczania God-Mode w tle:', error.message);
        }
    });

    // Sub-Moduł: NEXUS FRAUD PREVENTION (Tarcza Anty-Wyłudzeniowa)
    // Synchronizacja Dziennika Zwrotów BaseLinker metodą getOrderReturns.
    // Uruchamiany 2 razy dziennie w celu ochrony limitów API.
    cron.schedule('0 6,18 * * *', async () => {
        console.log('[CRON] RMA Agent: Odpytywanie dziennika zwrotów BaseLinkera...');
        try {
            await RmaService.syncReturnsFromBaselinker();
        } catch (error) {
            console.error('[CRON] Błąd w module RMA:', error.message);
        }
    });

    // Sub-Moduł: NEXUS VIRTUAL LOGISTICS (Agent Zaopatrzeniowiec)
    // Audyt stanów magazynowych na podstawie wskaźnika Burn Rate i generowanie Draftów B2B.
    // Uruchamiany codziennie o 05:00 rano przed przyjściem handlowców.
    cron.schedule('0 5 * * *', async () => {
        console.log('[CRON] Logistics Agent: Uruchamianie audytu wirtualnej półki...');
        try {
            await LogisticsService.analyzeBurnRateAndProcure();
        } catch (error) {
            console.error('[CRON] Błąd w module Logistyki B2B:', error.message);
        }
    });


}

module.exports = { initCronJobs };
