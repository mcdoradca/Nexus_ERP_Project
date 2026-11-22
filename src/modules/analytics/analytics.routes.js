const express = require('express');
const router = express.Router();
const AnalyticsService = require('./analytics.service');
const analyticsController = require('./analytics.controller');

// GET /api/analytics/forecast/:productId
router.get('/forecast/:productId', analyticsController.getProductForecast);

// GET /api/analytics/god-mode
router.get('/god-mode', async (req, res) => {
    try {
        console.log(`[API] Wczytywanie Nexus Sentinel God-Mode Analytics dla: Cały portfel (ws=${req.workspaceId || 'all'})`);
        const report = await AnalyticsService.generateGodModeReport(null, req.workspaceId || null);
        res.json({ success: true, data: report });
    } catch (error) {
        console.error('[API] Błąd God-Mode Analytics:', error.message);
        // Tarcza Błędów: Jeśli to brak danych z PIM, nie rzucajmy 500 (Server Error) bo psuje logi.
        if (error.message.includes('PIM_')) {
            return res.status(200).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/analytics/god-mode/:sku
router.get('/god-mode/:sku', async (req, res) => {
    try {
        const sku = req.params.sku;
        console.log(`[API] Wczytywanie Nexus Sentinel God-Mode Analytics dla: ${sku} (ws=${req.workspaceId || 'all'})`);
        const report = await AnalyticsService.generateGodModeReport(sku, req.workspaceId || null);
        res.json({ success: true, data: report });
    } catch (error) {
        console.error('[API] Błąd God-Mode Analytics:', error.message);
        if (error.message.includes('PIM_')) {
            return res.status(200).json({ success: false, error: error.message });
        }
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
