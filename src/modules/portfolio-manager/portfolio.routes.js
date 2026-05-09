const express = require('express');
const router = express.Router();
const PortfolioService = require('./portfolio.service');
const PortfolioExecutor = require('./portfolio.executor');
const fs = require('fs');
const path = require('path');
const os = require('os');
const DataPurityGuard = require('./data.purity.guard');
const MarginOverseer = require('./margin.overseer');
const EbookGeneratorService = require('./ebook.generator.service');
const SmartSentinelService = require('./smart.sentinel.service');
const AsyncTaskQueue = require('../../core/AsyncTaskQueue');

// POST /api/portfolio/analyze
router.post('/analyze', async (req, res) => {
    try {
        console.log('[API] Żądanie z frontendu: generowanie stanu portfela...');
        const state = await PortfolioService.generateDailyPortfolioState();
        res.json({ success: true, data: state });
    } catch (error) {
        console.error('[API] Błąd PortfolioService:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /api/portfolio/state
router.get('/state', (req, res) => {
    try {
        const cachePath = path.join(os.tmpdir(), 'nexus_portfolio_state.json');
        if (fs.existsSync(cachePath)) {
            const data = fs.readFileSync(cachePath, 'utf8');
            res.json({ success: true, data: JSON.parse(data) });
        } else {
            res.json({ success: true, data: null });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/portfolio/execute
router.post('/execute', async (req, res) => {
    try {
        const action = req.body.action;
        if (!action || !action.type) {
            return res.status(400).json({ success: false, error: 'Brak struktury akcji.' });
        }
        
        const result = await PortfolioExecutor.executeAction(action);
        res.json({ success: true, data: result });
        
    } catch (error) {
        console.error('[API] Błąd Egzekutora:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/portfolio/sentinel-audit
router.post('/sentinel-audit', async (req, res) => {
    try {
        console.log('[API] Wyzwalanie globalnego audytu Strażników (Sentinels)...');
        
        // Uruchamiamy strażników równolegle dla optymalizacji czasu
        const [purityResult, marginResult, smartResult] = await Promise.all([
            DataPurityGuard.auditDatabase(),
            MarginOverseer.enforceMarginDiscipline(),
            SmartSentinelService.runNightlyAudit()
        ]);

        res.json({ 
            success: true, 
            data: { 
                dataPurity: purityResult, 
                marginOverseer: marginResult,
                smartSentinel: smartResult || 'Zakończono audyt Smarta'
            } 
        });
        
    } catch (error) {
        console.error('[API] Błąd Strażników:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/portfolio/ebook/generate
router.post('/ebook/generate', async (req, res) => {
    try {
        const { productName, targetAudience } = req.body;
        if (!productName || !targetAudience) {
            return res.status(400).json({ success: false, error: 'Brak productName lub targetAudience.' });
        }
        
        console.log(`[API] Zlecono asynchroniczne generowanie E-Booka Zero-Cost Value dla ${productName}...`);
        
        // Pobieramy ID uzytkownika z req.user (middleware JWT) jesli istnieje, lub z body
        const userId = req.user ? req.user.id : (req.body.userId || 'system');
        
        const taskId = AsyncTaskQueue.enqueue(
            'EBOOK_GENERATION', 
            userId, 
            async () => {
                const pdfPath = await EbookGeneratorService.generateZeroCostValueEbook(productName, targetAudience);
                const fileName = path.basename(pdfPath);
                return { url: `/uploads/ebooks/${fileName}` };
            }
        );
        
        res.status(202).json({ 
            success: true, 
            message: 'Zadanie dodane do kolejki w tle.',
            taskId: taskId
        });
        
    } catch (error) {
        console.error('[API] Błąd kolejkowania EbookGeneratorService:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
