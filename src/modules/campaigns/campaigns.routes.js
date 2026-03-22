const express = require('express');
const router = express.Router();
const campaignsController = require('./campaigns.controller');
const { authenticateToken } = require('../../middlewares/auth.middleware');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } }); // Limit 50MB dla grafików

router.get('/', authenticateToken, campaignsController.getAll);
router.get('/:id', authenticateToken, campaignsController.getOne);

router.post('/', authenticateToken, campaignsController.create);
router.patch('/:id', authenticateToken, campaignsController.update);
router.post('/:id/products', authenticateToken, campaignsController.addProduct);

router.post('/:id/assets', authenticateToken, upload.single('file'), campaignsController.uploadAsset);
router.patch('/:id/assets/:assetId/approve', authenticateToken, campaignsController.approveAsset);

// ROUTY MODUŁU ŚRODOWISKA SMI (Social Media Integration)
router.get('/smi/all', authenticateToken, campaignsController.getGlobalSmi);
router.get('/:id/smi', authenticateToken, campaignsController.getSmiPosts);
router.post('/:id/smi', authenticateToken, campaignsController.createSmiPost);
router.patch('/:id/smi/:smiId', authenticateToken, campaignsController.updateSmiPost);
router.delete('/:id/smi/:smiId', authenticateToken, campaignsController.deleteSmiPost);

// MEDIA UPLOAD SMI
router.post('/:id/smi/:smiId/media', authenticateToken, upload.single('file'), campaignsController.uploadSmiMedia);

module.exports = router;