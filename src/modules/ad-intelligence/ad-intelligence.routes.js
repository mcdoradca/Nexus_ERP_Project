const express = require('express');
const router = express.Router();
const multer = require('multer');
const adIntelligenceController = require('./ad-intelligence.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

// Limit 50MB dla wysokorozdzielczych packshotów i plików wideo
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

router.get('/products', authenticateToken, (req, res) => adIntelligenceController.getProductsForPicker(req, res));
router.post('/enrich-product', authenticateToken, (req, res) => adIntelligenceController.enrichProduct(req, res));
router.post('/upload-material', authenticateToken, upload.single('file'), (req, res) => adIntelligenceController.uploadMediaMaterial(req, res));
router.post('/scan', authenticateToken, (req, res) => adIntelligenceController.scanAndAnalyze(req, res));
router.post('/generate-assets', authenticateToken, (req, res) => adIntelligenceController.generateCreativeAssets(req, res));
router.post('/re-render-asset', authenticateToken, (req, res) => adIntelligenceController.reRenderAsset(req, res));
router.post('/export-smi', authenticateToken, (req, res) => adIntelligenceController.exportToSmi(req, res));

module.exports = router;

