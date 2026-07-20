const ResiService = require('./resi.service');

exports.processImages = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'Nie wybrano plików.' });
        }

        const mode = req.body.mode || 'full';
        const asinPrefix = (req.body.asin || '').trim().replace(/ /g, "-");
        
        let folderName = "Gotowe_Zdjecia";
        if (req.files[0].originalname && req.files[0].originalname.includes('/')) {
            folderName = req.files[0].originalname.split('/')[0];
        }

        const zipBuffer = await ResiService.processBatch(req.files, mode, asinPrefix);
        
        const safeFolderName = folderName.replace(/[^a-zA-Z0-9\-_ ]/g, "").trim() || "Gotowe_Zdjecia";
        const zipFilename = `${safeFolderName}_packshot.zip`;

        res.set({
            'Content-Type': 'application/zip',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(zipFilename)}`,
            'Access-Control-Expose-Headers': 'Content-Disposition'
        });

        res.send(zipBuffer);
    } catch (error) {
        console.error("[ResiController] Błąd:", error);
        res.status(500).json({ error: error.message || 'Wewnętrzny błąd serwera przy obróbce Claid AI.' });
    }
};
