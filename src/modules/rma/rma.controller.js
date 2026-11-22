const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getBlacklist(req, res) {
    try {
        const profiles = await prisma.customerRiskProfile.findMany({ 
            where: req.workspaceId ? { workspaceId: req.workspaceId } : {},
            orderBy: { fraudScore: 'desc' } 
        });
        res.status(200).json(profiles);
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function getReturns(req, res) {
    try {
        const returns = await prisma.returnRecord.findMany({ 
            where: req.workspaceId ? { workspaceId: req.workspaceId } : {},
            orderBy: { createdAt: 'desc' }, 
            take: 200 
        });
        res.status(200).json(returns);
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function banUser(req, res) {
    try {
        const { id } = req.params;
        const target = await prisma.customerRiskProfile.findFirst({
            where: req.workspaceId ? { id, workspaceId: req.workspaceId } : { id }
        });
        if (!target) {
            return res.status(404).json({ error: 'Profil klienta nie istnieje w wybranym workspace.' });
        }
        await prisma.customerRiskProfile.update({
            where: { id: target.id },
            data: { isBlacklisted: true, reviewStatus: 'BANNED' }
        });
        res.status(200).json({ message: 'Zablokowano pomyślnie' });
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function dismissUser(req, res) {
    try {
        const { id } = req.params;
        const target = await prisma.customerRiskProfile.findFirst({
            where: req.workspaceId ? { id, workspaceId: req.workspaceId } : { id }
        });
        if (!target) {
            return res.status(404).json({ error: 'Profil klienta nie istnieje w wybranym workspace.' });
        }
        await prisma.customerRiskProfile.update({
            where: { id: target.id },
            data: { reviewStatus: 'SAFE', fraudScore: 0 } // Resetowanie alarmu
        });
        res.status(200).json({ message: 'Odrzucono pomyślnie' });
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function syncHistory(req, res) {
    try {
        // Wymuszamy 365 dni (1 rok) w stecz
        const daysBack = 365;
        const forceDateFrom = Math.floor(Date.now() / 1000) - (daysBack * 24 * 60 * 60);
        
        // Zwracamy status ZANIM skończy się pobieranie
        res.status(202).json({ message: 'Synchronizacja historyczna rozpoczęta w tle.', workspaceId: req.workspaceId || null });
        
        // Odpalenie w tle (Fire & Forget) w kontekście wybranego klienta
        const RmaService = require('./rma.service');
        RmaService.syncReturnsFromBaselinker(forceDateFrom, req.workspaceId || null).catch(err => {
            console.error('[RMA Historical Sync] Błąd:', err);
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
}

async function getSyncStatus(req, res) {
    const RmaService = require('./rma.service');
    const status = RmaService.getSyncStatus(req.workspaceId || null);
    res.status(200).json(status);
}

module.exports = { getBlacklist, getReturns, banUser, dismissUser, syncHistory, getSyncStatus };
