const express = require('express');
const crypto = require('crypto');
const router = express.Router();
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
        const accounts = await AllegroService.listConnectedAllegroAccounts();
        res.json({ success: true, accounts });
    } catch (error) {
        console.error('[Allegro Auth Route] Błąd pobierania listy kont Allegro:', error.message);
        res.status(500).json({ success: false, error: error.message || 'Błąd odczytu listy kont Allegro.' });
    }
});

router.patch('/accounts/:accountId/default', async (req, res) => {
    try {
        const accounts = await AllegroService.setDefaultAllegroAccount(req.params.accountId);
        res.json({ success: true, accounts });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

router.patch('/accounts/:accountId/label', async (req, res) => {
    try {
        const account = await AllegroService.updateAllegroAccountLabel(req.params.accountId, req.body?.label);
        res.json({ success: true, account });
    } catch (error) {
        res.status(error.statusCode || 400).json({ success: false, error: error.message });
    }
});

router.delete('/accounts/:accountId', async (req, res) => {
    try {
        const accounts = await AllegroService.removeAllegroAccount(req.params.accountId);
        res.json({ success: true, accounts });
    } catch (error) {
        res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

router.post('/start', async (req, res) => {
    try {
        cleanupExpiredDeviceFlows();
        const { label = null, setAsDefault = false } = req.body || {};
        const deviceData = await AllegroService.startDeviceFlow();
        const flowId = crypto.randomUUID();
        const flowRecord = {
            flowId,
            deviceCode: deviceData.device_code,
            label: typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : null,
            setAsDefault: Boolean(setAsDefault),
            expiresAt: Date.now() + (deviceData.expires_in * 1000)
        };
        activeDeviceFlows.set(flowId, flowRecord);
        activeDeviceFlows.set('current', flowRecord);
        res.json({
            success: true,
            flowId,
            user_code: deviceData.user_code,
            verification_uri_complete: deviceData.verification_uri_complete,
            message: 'Proszę kliknąć w link autoryzacyjny i zalogować się na wybrane konto sprzedawcy Allegro.'
        });
    } catch (error) {
        console.error('[Allegro Auth Route] Błąd przy starcie Device Flow:', error.message, error.response?.data, error.stack);
        res.status(500).json({ success: false, error: 'Nie udało się wystartować autoryzacji Allegro: ' + (error.response?.data?.error_description || error.message) });
    }
});

router.post('/poll', async (req, res) => {
    try {
        const requestedFlowId = req.body?.flowId || 'current';
        const flow = activeDeviceFlows.get(requestedFlowId);
        if (!flow || Date.now() > flow.expiresAt) {
            if (flow) activeDeviceFlows.delete(requestedFlowId);
            return res.status(400).json({ success: false, error: 'Brak aktywnej sesji logowania lub sesja wygasła. Spróbuj ponownie.' });
        }
        const tokenData = await AllegroService.pollForToken(flow.deviceCode, {
            label: flow.label,
            setAsDefault: flow.setAsDefault
        });
        activeDeviceFlows.delete(flow.flowId);
        if (activeDeviceFlows.get('current')?.flowId === flow.flowId) {
            activeDeviceFlows.delete('current');
        }
        const accounts = await AllegroService.listConnectedAllegroAccounts();
        res.json({
            success: true,
            account: tokenData.accountMeta || null,
            accounts,
            message: `Zautoryzowano konto Allegro (${tokenData.accountMeta?.label || tokenData.accountMeta?.accountId || 'OK'}) i zapisano bezpiecznie w skarbcu PIM.`
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
