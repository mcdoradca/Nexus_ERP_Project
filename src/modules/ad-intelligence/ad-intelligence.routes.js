const express = require('express');
const router = express.Router();
const adIntelligenceController = require('./ad-intelligence.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');

router.post('/scan', authenticateToken, (req, res) => adIntelligenceController.scanAndAnalyze(req, res));
router.post('/generate-assets', authenticateToken, (req, res) => adIntelligenceController.generateCreativeAssets(req, res));
router.post('/export-smi', authenticateToken, (req, res) => adIntelligenceController.exportToSmi(req, res));

module.exports = router;
