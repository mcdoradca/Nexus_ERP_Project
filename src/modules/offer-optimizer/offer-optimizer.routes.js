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
router.post('/analyze-single', express.json(), controller.analyzeSingle);
router.get('/status/:jobId', controller.checkStatus);

module.exports = router;
