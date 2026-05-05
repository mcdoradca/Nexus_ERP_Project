const express = require('express');
const router = express.Router();
const controller = require('./offer-optimizer.controller');
const multer = require('multer');

// Rezerwujemy szybki RAM buffor dla obrazu bez jego zapisu na dysk
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 } // Do 15 MB na "długie" zrzuty Allegro z rozszerzenia
});

// Zakładając, że na poziomie głównego `server.js` na te endpointy i tak jest nakładany middleware authMiddleware 
// który chroni całą apikację (tzw. authenticateToken).
// Zatem definiujemy tylko same ścieżki i podpinamy metody:

router.post('/start', controller.startOptimization);
router.post('/analyze-single', express.json({ limit: '50mb' }), controller.analyzeSingle);
router.get('/status/:jobId', controller.checkStatus);
router.post('/regenerate-title', express.json({ limit: '5mb' }), controller.regenerateTitle);
router.get('/proxy-image', controller.proxyImage);
router.post('/save-draft', express.json({ limit: '50mb' }), controller.saveDraft);
router.post('/export-baselinker', express.json({ limit: '50mb' }), controller.exportToBaselinker);
router.post('/generate-lifestyle', express.json({ limit: '50mb' }), controller.generateLifestyle);

module.exports = router;
