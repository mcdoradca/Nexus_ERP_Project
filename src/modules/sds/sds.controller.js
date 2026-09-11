const { processSdsWithAgent } = require('./sds.agent');
const { investigateAnomaliesAgent } = require('./sds.investigator.agent');
const { HITLError } = require('./sds.service');
const path = require('path');
const fs = require('fs');

// --- BACKGROUND CLEANUP CRON ---
function cleanupOrphanPdfs() {
    try {
        const cwd = process.cwd();
        const files = fs.readdirSync(cwd);
        const now = Date.now();
        const MAX_AGE_MS = 60 * 60 * 1000; // 1 godzina

        files.forEach(file => {
            if ((file.startsWith('temp_sds_') && file.endsWith('.pdf')) ||
                (file.startsWith('Karta_Charakterystyki_PL_') && file.endsWith('.docx'))) {
                const filePath = path.join(cwd, file);
                const stats = fs.statSync(filePath);
                if (now - stats.mtimeMs > MAX_AGE_MS) {
                    fs.unlinkSync(filePath);
                    console.log(`[SDS Cleanup] Usunięto osierocony plik: ${file}`);
                }
            }
        });
    } catch (e) {
        console.error('[SDS Cleanup] Błąd podczas czyszczenia śmieci:', e.message);
    }
}
// Odpal przy starcie oraz co godzinę
cleanupOrphanPdfs();
setInterval(cleanupOrphanPdfs, 60 * 60 * 1000);
// -------------------------------

async function processSds(req, res) {
    let tempPdfPath = null;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Brak pliku PDF.' });
        }

        const productName = req.body.productName || 'PRODUKT CHEMICZNY';
        tempPdfPath = path.join(process.cwd(), `temp_sds_${Date.now()}.pdf`);
        fs.writeFileSync(tempPdfPath, req.file.buffer);

        const outputDocxPath = await processSdsWithAgent(tempPdfPath, productName);

        if (!outputDocxPath || !fs.existsSync(outputDocxPath)) {
             return res.status(500).json({ error: 'Agent nie wygenerował pliku DOCX.' });
        }

        res.download(outputDocxPath, `Karta_Charakterystyki_PL_${productName.replace(/\s+/g, '_')}.docx`, (err) => {
            if (err) console.error("Błąd podczas pobierania:", err);
            if (fs.existsSync(outputDocxPath)) fs.unlinkSync(outputDocxPath);
        });

    } catch (error) {
        if (error instanceof HITLError || error.name === 'HITLError') {
             console.warn('[HITL] Wykryto anomalie wymagające interwencji człowieka.');
             return res.status(422).json({ error: 'Wymagana interwencja eksperta (HITL).', requiresHITL: true, anomalies: error.anomalies });
        }
        console.error("Błąd processSds [STACK]:", error.stack);
        res.status(500).json({ error: 'Błąd podczas przetwarzania karty SDS.', details: error.message, stack: error.stack });
    } finally {
        if (tempPdfPath && fs.existsSync(tempPdfPath)) {
            fs.unlinkSync(tempPdfPath);
        }
    }
}

async function resumeProcess(req, res) {
    let tempPdfPath = null;
    try {
        if (!req.file) return res.status(400).json({ error: 'Brak pliku PDF.' });
        const productName = req.body.productName || 'PRODUKT CHEMICZNY';
        const manualOverrides = req.body.manualOverrides ? JSON.parse(req.body.manualOverrides) : {};
        
        tempPdfPath = path.join(process.cwd(), `temp_sds_${Date.now()}.pdf`);
        fs.writeFileSync(tempPdfPath, req.file.buffer);

        const outputDocxPath = await processSdsWithAgent(tempPdfPath, productName, manualOverrides);
        
        if (!outputDocxPath || !fs.existsSync(outputDocxPath)) {
             return res.status(500).json({ error: 'Agent nie wygenerował pliku DOCX.' });
        }
        res.download(outputDocxPath, `Karta_Charakterystyki_PL_${productName.replace(/\s+/g, '_')}.docx`, (err) => {
            if (err) console.error("Błąd podczas pobierania:", err);
            if (fs.existsSync(outputDocxPath)) fs.unlinkSync(outputDocxPath);
        });
    } catch (error) {
        console.error("Błąd resumeProcess [STACK]:", error.stack);
        res.status(500).json({ error: 'Błąd podczas wznowienia procesu SDS.', details: error.message, stack: error.stack });
    } finally {
        if (tempPdfPath && fs.existsSync(tempPdfPath)) {
            fs.unlinkSync(tempPdfPath);
        }
    }
}

async function investigateAnomalies(req, res) {
    try {
        const { anomalies } = req.body;
        if (!anomalies || !Array.isArray(anomalies)) {
             return res.status(400).json({ error: 'Brak tablicy anomalies.' });
        }
        
        const resolution = await investigateAnomaliesAgent(anomalies);
        res.json(resolution);
    } catch (error) {
        console.error("Błąd investigateAnomalies [STACK]:", error.stack);
        res.status(500).json({ error: 'Agent śledczy napotkał błąd.', details: error.message, stack: error.stack });
    }
}

module.exports = {
    processSds,
    resumeProcess,
    investigateAnomalies
};
