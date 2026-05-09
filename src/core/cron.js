const cron = require('node-cron');
const AnalyticsService = require('../modules/analytics/analytics.service');

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
}

module.exports = { initCronJobs };
