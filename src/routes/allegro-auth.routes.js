const express = require('express');
const router = express.Router();
const AllegroService = require('../modules/offer-optimizer/allegro.service');

let activeDeviceFlows = {};

router.post('/start', async (req, res) => {
    try {
        const deviceData = await AllegroService.startDeviceFlow();
        activeDeviceFlows['current'] = {
            deviceCode: deviceData.device_code,
            expiresAt: Date.now() + (deviceData.expires_in * 1000)
        };
        res.json({
            success: true,
            user_code: deviceData.user_code,
            verification_uri_complete: deviceData.verification_uri_complete,
            message: "Proszę kliknąć w link autoryzacyjny i wkleić kod jeśli będzie wymagany."
        });
    } catch (error) {
        console.error("[Allegro Auth Route] Błąd przy starcie Device Flow:", error.message, error.response?.data, error.stack);
        res.status(500).json({ success: false, error: "Nie udało się wystartować autoryzacji Allegro: " + (error.response?.data?.error_description || error.message) });
    }
});

router.post('/poll', async (req, res) => {
    try {
        const flow = activeDeviceFlows['current'];
        if (!flow || Date.now() > flow.expiresAt) {
            return res.status(400).json({ success: false, error: "Brak aktywnej sesji logowania lub sesja wygasła. Spróbuj ponownie." });
        }
        const tokenData = await AllegroService.pollForToken(flow.deviceCode);
        delete activeDeviceFlows['current'];
        res.json({
            success: true,
            message: "Udało się! Token został zautoryzowany i zapisany w bazie PIM."
        });
    } catch (error) {
        if (error.response && error.response.data && error.response.data.error === 'authorization_pending') {
            return res.status(202).json({ success: false, pending: true, message: "Oczekiwanie na autoryzację przez użytkownika..." });
        }
        console.error("[Allegro Auth Route] Błąd podczas pollingu:", error.message);
        res.status(500).json({ success: false, error: "Błąd podczas sprawdzania statusu tokena." });
    }
});

module.exports = router;
