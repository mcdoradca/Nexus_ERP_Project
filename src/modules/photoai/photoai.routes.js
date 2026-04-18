const express = require('express');
const router = express.Router();
const multer = require('multer');
const photoAiService = require('./photoai.service');

// Zapisujemy w RAM
const upload = multer({ storage: multer.memoryStorage() });

router.post('/generate', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Brak piku." });
        }

        const { prompt, numResults, type } = req.body; 
        
        let urls = [];
        
        if (type === 'BRIA_AI') {
            urls = await photoAiService.generateBriaLifestyle(req.file.buffer, req.file.originalname, prompt, parseInt(numResults) || 1);
        }

        res.json({ urls });
    } catch (err) {
        console.error("PhotoAI Generator Error:", err);
        res.status(500).json({ error: err.message || "Błąd generacji." });
    }
});

module.exports = router;
