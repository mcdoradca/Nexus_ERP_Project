const express = require('express');
const router = express.Router();
const multer = require('multer');
const sdsController = require('./sds.controller');

// Ogranicznik rozmiaru pamieci (SDSy rzadko przekraczają 5MB, dajemy bufor do 10MB)
const upload = multer({ 
    storage: multer.memoryStorage(), 
    limits: { fileSize: 10 * 1024 * 1024 } 
});

router.post('/process', upload.single('sdsFile'), sdsController.processSds);
router.post('/resume-process', upload.single('sdsFile'), sdsController.resumeProcess);
router.post('/investigate-cas', express.json(), sdsController.investigateAnomalies);

module.exports = router;
