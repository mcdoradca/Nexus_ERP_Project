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
            if ((file.startsWith('temp_sds_') && (file.endsWith('.pdf') || file.endsWith('.rtf'))) ||
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
    let tempFilePath = null;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Brak pliku źródłowego (PDF lub RTF).' });
        }

        const productName = req.body.productName || 'PRODUKT CHEMICZNY';
        const isRtf = (req.file.originalname && req.file.originalname.toLowerCase().endsWith('.rtf')) ||
                      (req.file.buffer && req.file.buffer.slice(0, 10).toString('binary').startsWith('{\\rtf'));
        const ext = isRtf ? '.rtf' : '.pdf';
        tempFilePath = path.join(process.cwd(), `temp_sds_${Date.now()}${ext}`);
        fs.writeFileSync(tempFilePath, req.file.buffer);

        const agentResult = await processSdsWithAgent(tempFilePath, productName);
        const outputDocxPath = (typeof agentResult === 'object' && agentResult.docxPath) ? agentResult.docxPath : agentResult;
        const resolvedTradeName = (typeof agentResult === 'object' && agentResult.resolvedProductName) ? agentResult.resolvedProductName : (productName || 'PRODUKT_CHEMICZNY');

        if (!outputDocxPath || !fs.existsSync(outputDocxPath)) {
             return res.status(500).json({ error: 'Agent nie wygenerował pliku DOCX.' });
        }

        // Nazwa pliku wyjściowego zachowuje w 100% tożsamość pliku źródłowego (1:1), podmieniając jedynie rozszerzenie na .docx
        const originalBaseName = (req.file.originalname || 'Karta_Charakterystyki')
            .replace(/\.(pdf|rtf)$/i, '')
            .replace(/[\r\n\x00]/g, '');
        const downloadFileName = `${originalBaseName}.docx`;

        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Resolved-Product-Name');
        res.setHeader('X-Resolved-Product-Name', encodeURIComponent(resolvedTradeName));

        res.download(outputDocxPath, downloadFileName, (err) => {
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
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }
    }
}

async function resumeProcess(req, res) {
    let tempFilePath = null;
    try {
        if (!req.file) return res.status(400).json({ error: 'Brak pliku źródłowego (PDF lub RTF).' });
        const productName = req.body.productName || 'PRODUKT CHEMICZNY';
        const manualOverrides = req.body.manualOverrides ? JSON.parse(req.body.manualOverrides) : {};
        
        const isRtf = (req.file.originalname && req.file.originalname.toLowerCase().endsWith('.rtf')) ||
                      (req.file.buffer && req.file.buffer.slice(0, 10).toString('binary').startsWith('{\\rtf'));
        const ext = isRtf ? '.rtf' : '.pdf';
        tempFilePath = path.join(process.cwd(), `temp_sds_${Date.now()}${ext}`);
        fs.writeFileSync(tempFilePath, req.file.buffer);

        const agentResult = await processSdsWithAgent(tempFilePath, productName, manualOverrides);
        const outputDocxPath = (typeof agentResult === 'object' && agentResult.docxPath) ? agentResult.docxPath : agentResult;
        const resolvedTradeName = (typeof agentResult === 'object' && agentResult.resolvedProductName) ? agentResult.resolvedProductName : (productName || 'PRODUKT_CHEMICZNY');
        
        if (!outputDocxPath || !fs.existsSync(outputDocxPath)) {
             return res.status(500).json({ error: 'Agent nie wygenerował pliku DOCX.' });
        }

        // Nazwa pliku wyjściowego zachowuje w 100% tożsamość pliku źródłowego (1:1)
        const originalBaseName = (req.file.originalname || 'Karta_Charakterystyki')
            .replace(/\.(pdf|rtf)$/i, '')
            .replace(/[\r\n\x00]/g, '');
        const downloadFileName = `${originalBaseName}.docx`;

        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, X-Resolved-Product-Name');
        res.setHeader('X-Resolved-Product-Name', encodeURIComponent(resolvedTradeName));

        res.download(outputDocxPath, downloadFileName, (err) => {
            if (err) console.error("Błąd podczas pobierania:", err);
            if (fs.existsSync(outputDocxPath)) fs.unlinkSync(outputDocxPath);
        });
    } catch (error) {
        console.error("Błąd resumeProcess [STACK]:", error.stack);
        res.status(500).json({ error: 'Błąd podczas wznowienia procesu SDS.', details: error.message, stack: error.stack });
    } finally {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
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
