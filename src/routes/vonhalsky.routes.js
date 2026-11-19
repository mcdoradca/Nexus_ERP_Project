const express = require('express');
const router = express.Router();
const VonHalskyService = require('../modules/offer-optimizer/vonhalsky.service');

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, error: 'Brak uprawnień administratora.' });
    }
    return next();
}

/**
 * Zwraca publiczny status konfiguracji integracji InPost Von Halsky (bez ujawniania clientSecret).
 * Dostępne dla wszystkich zalogowanych operatorów (potrzebne w widoku Offer Optimizer).
 */
router.get('/status', async (req, res) => {
    try {
        const cfg = await VonHalskyService.getPublicConfig();
        return res.json({
            success: true,
            configured: cfg.configured,
            environment: cfg.environment,
            organizationId: cfg.organizationId,
            organizationName: cfg.organizationName,
            defaultDaysToShip: cfg.defaultDaysToShip,
            defaultDescriptionFormat: cfg.defaultDescriptionFormat
        });
    } catch (error) {
        console.error('[VonHalsky Routes] Błąd odczytu statusu:', error.message);
        return res.status(500).json({ success: false, error: error.message || 'Błąd odczytu statusu Von Halsky.' });
    }
});

/**
 * Pełna publiczna konfiguracja do Panelu Administracyjnego (wyłącznie ADMIN, nadal bez clientSecret).
 */
router.get('/config', requireAdmin, async (req, res) => {
    try {
        const config = await VonHalskyService.getPublicConfig();
        return res.json({ success: true, config });
    } catch (error) {
        console.error('[VonHalsky Routes] Błąd pobierania konfiguracji:', error.message);
        return res.status(500).json({ success: false, error: error.message || 'Błąd odczytu konfiguracji Von Halsky.' });
    }
});

/**
 * Zapis konfiguracji InPost Von Halsky w szyfrowanym skarbcu SystemSetting (AES-256-GCM).
 */
router.post('/config', requireAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const config = await VonHalskyService.saveConfig(body, req.user);
        return res.json({
            success: true,
            config,
            message: config.configured
                ? `Zapisano szyfrowaną konfigurację InPost Von Halsky (${config.environment.toUpperCase()}).`
                : 'Zapisano ustawienia domyślne Von Halsky (oczekuje na uzupełnienie Client ID i Client Secret).'
        });
    } catch (error) {
        console.error('[VonHalsky Routes] Błąd zapisu konfiguracji:', error.message);
        return res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Nie udało się zapisać konfiguracji Von Halsky.'
        });
    }
});

/**
 * Testuje połączenie OAuth 2.1 i pobiera listę organizacji z GET /v1/organizations.
 */
router.post('/verify', requireAdmin, async (req, res) => {
    try {
        const candidate = req.body && Object.keys(req.body).length > 0 ? req.body : null;
        const result = await VonHalskyService.verifyConnection(candidate);
        return res.json({ success: result.ok, ...result });
    } catch (error) {
        console.error('[VonHalsky Routes] Błąd weryfikacji połączenia:', error.message);
        return res.status(error.statusCode || 500).json({
            success: false,
            ok: false,
            error: error.message || 'Błąd weryfikacji połączenia z InPost Von Halsky.'
        });
    }
});

/**
 * Lista aktywnych organizacji (GET /v1/organizations).
 */
router.get('/organizations', requireAdmin, async (req, res) => {
    try {
        const organizations = await VonHalskyService.getOrganizations();
        return res.json({ success: true, organizations });
    } catch (error) {
        console.error('[VonHalsky Routes] Błąd pobierania organizacji:', error.message);
        return res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Nie udało się pobrać listy organizacji Von Halsky.',
            code: error.code || null
        });
    }
});

module.exports = router;
