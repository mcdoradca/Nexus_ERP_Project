const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const prisma = require('../core/prisma');
const { requireSuperUser } = require('../middlewares/auth.middleware');
const workspaceService = require('../services/workspace.service');
const AllegroService = require('../modules/offer-optimizer/allegro.service');

const activeDeviceFlows = new Map();

function cleanupExpiredDeviceFlows() {
    const now = Date.now();
    for (const [fid, flow] of activeDeviceFlows.entries()) {
        if (!flow || now > flow.expiresAt) {
            activeDeviceFlows.delete(fid);
        }
    }
}

router.get('/accounts', async (req, res) => {
    try {
        const accounts = await AllegroService.listConnectedAllegroAccounts(prisma, req.workspaceId || null);
        res.json({ success: true, accounts, workspaceId: req.workspaceId || null });
    } catch (error) {
        console.error('[Allegro Auth Route] Błąd pobierania listy kont Allegro:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Błąd odczytu listy kont Allegro.' });
    }
});

router.patch('/accounts/:accountId/default', requireSuperUser, async (req, res) => {
    try {
        const wsId = req.workspaceId || null;
        const accounts = await AllegroService.setDefaultAllegroAccount(req.params.accountId, prisma, wsId);
        await workspaceService.recordSecurityAudit(prisma, {
            workspaceId: wsId,
            userId: req.user?.id,
            action: 'ALLEGRO_DEFAULT_CHANGED',
            provider: 'ALLEGRO',
            entityId: req.params.accountId
        });
        res.json({ success: true, accounts });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

router.patch('/accounts/:accountId/label', requireSuperUser, async (req, res) => {
    try {
        const wsId = req.workspaceId || null;
        const account = await AllegroService.updateAllegroAccountLabel(req.params.accountId, req.body?.label, prisma, wsId);
        await workspaceService.recordSecurityAudit(prisma, {
            workspaceId: wsId,
            userId: req.user?.id,
            action: 'ALLEGRO_LABEL_UPDATED',
            provider: 'ALLEGRO',
            entityId: req.params.accountId,
            details: { label: account?.label }
        });
        res.json({ success: true, account });
    } catch (error) {
        res.status(error.statusCode || 400).json({ success: false, error: error.message });
    }
});

router.delete('/accounts/:accountId', requireSuperUser, async (req, res) => {
    try {
        const wsId = req.workspaceId || null;
        const accounts = await AllegroService.removeAllegroAccount(req.params.accountId, prisma, wsId);
        await workspaceService.recordSecurityAudit(prisma, {
            workspaceId: wsId,
            userId: req.user?.id,
            action: 'ALLEGRO_ACCOUNT_REMOVED',
            provider: 'ALLEGRO',
            entityId: req.params.accountId
        });
        res.json({ success: true, accounts });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

router.post('/start', requireSuperUser, async (req, res) => {
    try {
        cleanupExpiredDeviceFlows();
        const wsId = req.workspaceId || null;
        const {
            label = null,
            setAsDefault = false,
            customClientId = null,
            customClientSecret = null
        } = req.body || {};

        const cleanCustomId = typeof customClientId === 'string' && customClientId.trim() ? customClientId.trim() : null;
        const cleanCustomSecret = typeof customClientSecret === 'string' && customClientSecret.trim() ? customClientSecret.trim() : null;
        if ((cleanCustomId && !cleanCustomSecret) || (!cleanCustomId && cleanCustomSecret)) {
            return res.status(400).json({
                success: false,
                error: 'Aby użyć własnej aplikacji Allegro dla klienta, podaj jednocześnie customClientId i customClientSecret.'
            });
        }

        const deviceData = await AllegroService.startDeviceFlow({
            customClientId: cleanCustomId,
            customClientSecret: cleanCustomSecret
        });
        const flowId = crypto.randomUUID();
        const flowRecord = {
            flowId,
            workspaceId: wsId,
            deviceCode: deviceData.device_code,
            label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : null,
            setAsDefault: Boolean(setAsDefault),
            customClientId: cleanCustomId,
            customClientSecret: cleanCustomSecret,
            expiresAt: Date.now() + (deviceData.expires_in * 1000)
        };
        activeDeviceFlows.set(flowId, flowRecord);
        activeDeviceFlows.set(`current:${wsId || 'default'}`, flowRecord);
        res.json({
            success: true,
            flowId,
            workspaceId: wsId,
            user_code: deviceData.user_code,
            verification_uri_complete: deviceData.verification_uri_complete,
            message: 'Proszę kliknąć w link autoryzacyjny i zalogować się na wybrane konto sprzedawcy Allegro.'
        });
    } catch (error) {
        console.error('[Allegro Auth Route] Błąd przy starcie Device Flow:', error.message, error.response?.data, error.stack);
        res.status(500).json({ success: false, error: 'Nie udało się wystartować autoryzacji Allegro: ' + (error.response?.data?.error_description || error.message) });
    }
});

router.post('/poll', requireSuperUser, async (req, res) => {
    try {
        const wsId = req.workspaceId || null;
        const requestedFlowId = req.body?.flowId || `current:${wsId || 'default'}`;
        const flow = activeDeviceFlows.get(requestedFlowId);
        if (!flow || Date.now() > flow.expiresAt) {
            if (flow) activeDeviceFlows.delete(requestedFlowId);
            return res.status(400).json({ success: false, error: 'Brak aktywnej sesji logowania lub sesja wygasła. Spróbuj ponownie.' });
        }
        if ((flow.workspaceId || null) !== wsId) {
            return res.status(403).json({ success: false, error: 'Sesja logowania Allegro została rozpoczęta dla innego klienta (Workspace).' });
        }

        const tokenData = await AllegroService.pollForToken(flow.deviceCode, {
            label: flow.label,
            setAsDefault: flow.setAsDefault,
            workspaceId: wsId,
            customClientId: flow.customClientId,
            customClientSecret: flow.customClientSecret
        }, prisma);
        activeDeviceFlows.delete(flow.flowId);
        const curKey = `current:${wsId || 'default'}`;
        if (activeDeviceFlows.get(curKey)?.flowId === flow.flowId) {
            activeDeviceFlows.delete(curKey);
        }
        const accounts = await AllegroService.listConnectedAllegroAccounts(prisma, wsId);
        await workspaceService.recordSecurityAudit(prisma, {
            workspaceId: wsId,
            userId: req.user?.id,
            action: 'ALLEGRO_ACCOUNT_CONNECTED',
            provider: 'ALLEGRO',
            integrationAccountId: tokenData.accountMeta?.integrationAccountId || null,
            entityId: tokenData.accountMeta?.accountId || null,
            details: { label: tokenData.accountMeta?.label, hasCustomApp: Boolean(flow.customClientId) }
        });
        res.json({
            success: true,
            account: tokenData.accountMeta || null,
            accounts,
            workspaceId: wsId,
            message: `Zautoryzowano konto Allegro (${tokenData.accountMeta?.label || tokenData.accountMeta?.accountId || 'OK'}) i zapisano bezpiecznie w skarbcu klienta.`
        });
    } catch (error) {
        if (error.response && error.response.data && error.response.data.error === 'authorization_pending') {
            return res.status(202).json({ success: false, pending: true, message: 'Oczekiwanie na autoryzację przez użytkownika...' });
        }
        console.error('[Allegro Auth Route] Błąd podczas pollingu:', error.message);
        res.status(500).json({ success: false, error: 'Błąd podczas sprawdzania statusu tokena.' });
    }
});

module.exports = router;
