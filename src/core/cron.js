const cron = require('node-cron');
const prisma = require('./prisma');
const AnalyticsService = require('../modules/analytics/analytics.service');
const RmaService = require('../modules/rma/rma.service');
const LogisticsService = require('../modules/logistics/logistics.service');
const SalesIntelligenceService = require('../modules/sales-intelligence/sales-intelligence.service');

function initCronJobs() {
    // Odciążenie bazy OLTP (Threat 3 z poprawki.md)
    // Asynchroniczne przeliczanie True Net Margin każdej nocy o 04:00 w tle (niezależnie per aktywny workspace).
    cron.schedule('0 4 * * *', async () => {
        console.log('[CRON] Rozpoczynam asynchroniczne wyliczanie True Net Margin (odciążenie OLTP)...');
        try {
            const workspaces = await prisma.workspace.findMany({ where: { isActive: true }, select: { id: true, name: true } });
            for (const ws of workspaces) {
                try {
                    await AnalyticsService.generateGodModeReport(null, ws.id);
                    console.log(`[CRON] Zakończono wyliczanie analityki biznesowej w tle dla klienta "${ws.name}" (${ws.id}).`);
                } catch (wsErr) {
                    console.warn(`[CRON] Analityka God-Mode dla klienta "${ws.name}" (${ws.id}) pominięta/błąd: ${wsErr.message}`);
                }
            }
        } catch (error) {
            console.error('[CRON] Błąd podczas wyliczania God-Mode w tle:', error.message);
        }
    });

    // Sub-Moduł: NEXUS FRAUD PREVENTION (Tarcza Anty-Wyłudzeniowa)
    // Synchronizacja Dziennika Zwrotów BaseLinker metodą getOrderReturns (izolowana pętla po wszystkich aktywnych klientach).
    cron.schedule('0 6,18 * * *', async () => {
        console.log('[CRON] RMA Agent: Odpytywanie dziennika zwrotów BaseLinkera dla aktywnych klientów...');
        try {
            const workspaces = await prisma.workspace.findMany({ where: { isActive: true }, select: { id: true, name: true } });
            for (const ws of workspaces) {
                try {
                    await RmaService.syncReturnsFromBaselinker(null, ws.id);
                } catch (wsErr) {
                    console.error(`[CRON] Błąd RMA dla klienta "${ws.name}" (${ws.id}):`, wsErr.message);
                }
            }
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

    // Sub-Moduł: NEXUS SALES INTELLIGENCE COMMAND CENTER
    // Codzienne nocne migawki stanów, ofert (visits/watchers), zamówień i jakości (BaseLinker + Allegro + InPost Von Halsky)
    // Uruchamiane o 03:30 dla każdego aktywnego klienta (Multi-Workspace).
    cron.schedule('30 3 * * *', async () => {
        console.log('[CRON] Sales Intelligence: Budowanie dziennych migawek Multi-Workspace...');
        try {
            const workspaces = await prisma.workspace.findMany({ where: { isActive: true }, select: { id: true, name: true } });
            for (const ws of workspaces) {
                try {
                    await SalesIntelligenceService.runDailySnapshotForWorkspace(ws.id);
                    console.log(`[CRON] Sales Intelligence snapshot zakończony dla klienta "${ws.name}" (${ws.id}).`);
                } catch (wsErr) {
                    console.warn(`[CRON] Sales Intelligence snapshot dla klienta "${ws.name}" (${ws.id}) błąd: ${wsErr.message}`);
                }
            }
        } catch (error) {
            console.error('[CRON] Błąd krytyczny CRON Sales Intelligence:', error.message);
        }
    });


}

module.exports = { initCronJobs };
