const express = require('express');
const multer = require('multer');
const SalesIntelligenceController = require('./sales-intelligence.controller');

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        files: 20,
        fileSize: 25 * 1024 * 1024 // 25 MB na plik
    }
});

function handleMultipartUpload(req, res, next) {
    upload.array('files', 20)(req, res, (err) => {
        if (err) {
            return res.status(400).json({
                error: err.code === 'LIMIT_FILE_SIZE'
                    ? 'Plik przekracza maksymalny limit 25 MB.'
                    : `Błąd przesyłania plików: ${err.message}`
            });
        }
        return next();
    });
}

router.get('/dashboard', SalesIntelligenceController.getDashboard);
router.get('/status', SalesIntelligenceController.getStatus);
router.post('/sync', SalesIntelligenceController.syncPlatforms);
router.get('/sync/status', SalesIntelligenceController.getSyncStatus);
router.post('/import', handleMultipartUpload, SalesIntelligenceController.importFiles);
router.delete('/imports/:batchId', SalesIntelligenceController.deleteImportBatch);
router.get('/sku/:skuOrEan', SalesIntelligenceController.getSkuDeepDive);
router.get('/export/xlsx', SalesIntelligenceController.exportXlsx);
router.get('/export/csv', SalesIntelligenceController.exportCsv);

module.exports = router;
