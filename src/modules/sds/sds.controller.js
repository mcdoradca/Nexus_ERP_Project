const { processSdsWithAgent } = require('./sds.agent');
const path = require('path');
const fs = require('fs');

async function processSds(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Brak pliku PDF.' });
        }

        const productName = req.body.productName || 'PRODUKT CHEMICZNY';
        
        // Zapis tymczasowy bufora PDF
        const tempPdfPath = path.join(process.cwd(), `temp_sds_${Date.now()}.pdf`);
        fs.writeFileSync(tempPdfPath, req.file.buffer);

        // Uruchomienie procesu
        const outputDocxPath = await processSdsWithAgent(tempPdfPath, productName);
        
        // Sprzątanie temp PDF
        if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);

        if (!outputDocxPath || !fs.existsSync(outputDocxPath)) {
             return res.status(500).json({ error: 'Agent nie wygenerował pliku DOCX.' });
        }

        res.download(outputDocxPath, `Karta_Charakterystyki_PL_${productName.replace(/\s+/g, '_')}.docx`, (err) => {
            if (err) console.error("Błąd podczas pobierania:", err);
            if (fs.existsSync(outputDocxPath)) fs.unlinkSync(outputDocxPath);
        });

    } catch (error) {
        console.error("Błąd processSds:", error);
        res.status(500).json({ error: 'Błąd podczas przetwarzania karty SDS.', details: error.message });
    }
}

module.exports = {
    processSds
};
