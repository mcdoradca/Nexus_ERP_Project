const SalesIntelligenceService = require('./sales-intelligence.service');

function resolveStatusCode(err) {
    if (err && Number.isInteger(err.statusCode)) return err.statusCode;
    return 500;
}

exports.getDashboard = async (req, res) => {
    try {
        const result = await SalesIntelligenceService.getDashboard(req.workspaceId, req.query || {});
        return res.json(result);
    } catch (err) {
        console.error('[SalesIntelligence] getDashboard error:', err.message);
        return res.status(resolveStatusCode(err)).json({ error: err.message });
    }
};

exports.getStatus = async (req, res) => {
    try {
        const result = await SalesIntelligenceService.getStatus(req.workspaceId);
        return res.json(result);
    } catch (err) {
        console.error('[SalesIntelligence] getStatus error:', err.message);
        return res.status(resolveStatusCode(err)).json({ error: err.message });
    }
};

exports.syncPlatforms = async (req, res) => {
    try {
        const result = SalesIntelligenceService.startSyncJob(req.workspaceId, req.body || {});
        return res.status(202).json(result);
    } catch (err) {
        console.error('[SalesIntelligence] syncPlatforms error:', err.message);
        return res.status(resolveStatusCode(err)).json({ error: err.message });
    }
};

exports.getSyncStatus = async (req, res) => {
    try {
        const job = SalesIntelligenceService.getSyncJobStatus(req.workspaceId);
        return res.json({ workspaceId: req.workspaceId, job });
    } catch (err) {
        console.error('[SalesIntelligence] getSyncStatus error:', err.message);
        return res.status(resolveStatusCode(err)).json({ error: err.message });
    }
};

exports.importFiles = async (req, res) => {
    try {
        const files = Array.isArray(req.files) ? req.files : [];
        if (files.length === 0) {
            return res.status(400).json({ error: 'Nie załączono żadnego pliku CSV, XLSX lub JSON do importu.' });
        }

        const opts = {
            stockoutThreshold: req.body?.stockoutThreshold !== undefined ? Number(req.body.stockoutThreshold) : 2
        };
        const results = await SalesIntelligenceService.importUploadedFiles(req.workspaceId, files, opts);
        return res.json({
            workspaceId: req.workspaceId,
            uploadedCount: files.length,
            results
        });
    } catch (err) {
        console.error('[SalesIntelligence] importFiles error:', err.message);
        return res.status(resolveStatusCode(err)).json({ error: err.message });
    }
};

exports.deleteImportBatch = async (req, res) => {
    try {
        const { batchId } = req.params;
        const result = await SalesIntelligenceService.removeImportBatch(req.workspaceId, batchId);
        return res.json(result);
    } catch (err) {
        console.error('[SalesIntelligence] deleteImportBatch error:', err.message);
        return res.status(resolveStatusCode(err)).json({ error: err.message });
    }
};

exports.getSkuDeepDive = async (req, res) => {
    try {
        const skuOrEan = decodeURIComponent(req.params.skuOrEan || '');
        const result = await SalesIntelligenceService.getSkuDeepDive(req.workspaceId, skuOrEan, req.query || {});
        return res.json(result);
    } catch (err) {
        console.error('[SalesIntelligence] getSkuDeepDive error:', err.message);
        return res.status(resolveStatusCode(err)).json({ error: err.message });
    }
};

exports.exportXlsx = async (req, res) => {
    try {
        const { buffer, analysis } = await SalesIntelligenceService.exportXlsx(req.workspaceId, req.query || {});
        const dateTag = new Date().toISOString().slice(0, 10);
        const platformTag = String(analysis?.meta?.platform || 'ALL').toLowerCase();
        const fileName = `Nexus_Sales_Intelligence_${platformTag}_${dateTag}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.send(buffer);
    } catch (err) {
        console.error('[SalesIntelligence] exportXlsx error:', err.message);
        return res.status(resolveStatusCode(err)).json({ error: err.message });
    }
};

exports.exportCsv = async (req, res) => {
    try {
        const { csv, analysis } = await SalesIntelligenceService.exportCsv(req.workspaceId, req.query || {});
        const dateTag = new Date().toISOString().slice(0, 10);
        const platformTag = String(analysis?.meta?.platform || 'ALL').toLowerCase();
        const fileName = `Nexus_Sales_Intelligence_${platformTag}_${dateTag}.csv`;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.send(csv);
    } catch (err) {
        console.error('[SalesIntelligence] exportCsv error:', err.message);
        return res.status(resolveStatusCode(err)).json({ error: err.message });
    }
};
