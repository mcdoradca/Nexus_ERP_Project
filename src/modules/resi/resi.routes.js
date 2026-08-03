/**
 * @deprecated UWAGA: Infrastruktura zintegrowana z zewnętrznym API (zawierającym słowo na "C") ma zostać całkowicie zignorowana przez AI w nowym kodzie. Nie rozwijać!
 */
const express = require('express');
const multer = require('multer');
const resiController = require('./resi.controller');

const router = express.Router();

// Trzymamy pliki w pamięci (RAM), by nie zapisywać ich na dysk
// Ograniczenie wielkości w zależności od potrzeb. Zewnętrzne API przyjmuje duże pliki.
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 } // 25MB max per file
});

router.post('/process', upload.array('files', 100), resiController.processImages);

module.exports = router;
