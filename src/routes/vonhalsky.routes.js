const express = require('express');
const router = express.Router();
const prisma = require('../core/prisma');
const workspaceService = require('../services/workspace.service');
const VonHalskyService = require('../modules/offer-optimizer/vonhalsky.service');

function requireAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'ADMIN') {
        return res.status(403).json({ success: false, error: 'Brak uprawnień administratora.' });
    }
    return next();
}

/**
 * Zwraca listę kont InPost Von Halsky przypisanych do wybranego klienta (bez ujawniania clientSecret).
 */
router.get('/accounts', async (req, res) => {
    try {
        const accounts = await VonHalskyService.listAccounts(req.workspaceId || null, prisma);
        return res.json({ success: true, accounts, workspaceId: req.workspaceId || null });
    } catch (error) {
        console.error('[VonHalsky Routes] Błąd odczytu kont:', error.message);
        return res.status(500).json({ success: false, error: error.message || 'Błąd odczytu kont Von Halsky.' });
    }
});

/**
 * Zwraca publiczny status konfiguracji integracji InPost Von Halsky (bez ujawniania clientSecret).
 * Dostępne dla wszystkich zalogowanych operatorów (potrzebne w widoku Offer Optimizer).
 */
router.get('/status', async (req, res) => {
    try {
        const accountId = req.query?.accountId || null;
        const cfg = await VonHalskyService.getPublicConfig(prisma, {
            workspaceId: req.workspaceId || null,
            accountId
        });
        return res.json({
            success: true,
            workspaceId: req.workspaceId || null,
            accountId: cfg.accountId || null,
            label: cfg.label || null,
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
        const accountId = req.query?.accountId || null;
        const config = await VonHalskyService.getPublicConfig(prisma, {
            workspaceId: req.workspaceId || null,
            accountId
        });
        return res.json({ success: true, config, workspaceId: req.workspaceId || null });
    } catch (error) {
        console.error('[VonHalsky Routes] Błąd pobierania konfiguracji:', error.message);
        return res.status(error.statusCode || 500).json({ success: false, error: error.message || 'Błąd odczytu konfiguracji Von Halsky.' });
    }
});

/**
 * Zapis konfiguracji InPost Von Halsky w szyfrowanym skarbcu IntegrationAccount (AES-256-GCM + AAD).
 */
router.post('/config', requireAdmin, async (req, res) => {
    try {
        const body = req.body || {};
        const wsId = req.workspaceId || body.workspaceId || null;
        const accountId = body.accountId || req.query?.accountId || null;
        const config = await VonHalskyService.saveConfig(body, req.user, prisma, {
            workspaceId: wsId,
            accountId
        });
        const accounts = wsId ? await VonHalskyService.listAccounts(wsId, prisma) : [config];
        await workspaceService.recordSecurityAudit(prisma, {
            workspaceId: wsId,
            userId: req.user?.id,
            action: 'VONHALSKY_CONFIG_SAVED',
            provider: 'VONHALSKY',
            integrationAccountId: config.accountId || null,
            entityId: config.accountId || null,
            details: { environment: config.environment, organizationId: config.organizationId || null }
        });
        return res.json({
            success: true,
            config,
            accounts,
            workspaceId: wsId,
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
 * Usuwa wybrane konto Von Halsky dla aktywnego klienta.
 */
router.delete('/accounts/:accountId', requireAdmin, async (req, res) => {
    try {
        const wsId = req.workspaceId || null;
        const accounts = await VonHalskyService.deleteAccount(wsId, req.params.accountId, prisma);
        await workspaceService.recordSecurityAudit(prisma, {
            workspaceId: wsId,
            userId: req.user?.id,
            action: 'VONHALSKY_ACCOUNT_DELETED',
            provider: 'VONHALSKY',
            integrationAccountId: req.params.accountId,
            entityId: req.params.accountId
        });
        return res.json({ success: true, accounts, workspaceId: wsId });
    } catch (error) {
        console.error('[VonHalsky Routes] Błąd usuwania konta:', error.message);
        return res.status(error.statusCode || 500).json({
            success: false,
            error: error.message || 'Nie udało się usunąć konta Von Halsky.'
        });
    }
});

/**
 * Testuje połączenie OAuth 2.1 i pobiera listę organizacji z GET /v1/organizations.
 */
router.post('/verify', requireAdmin, async (req, res) => {
    try {
        const candidate = req.body && Object.keys(req.body).length > 0 ? req.body : null;
        const result = await VonHalskyService.verifyConnection(candidate, {
            injectedPrisma: prisma,
            workspaceId: req.workspaceId || candidate?.workspaceId || null,
            accountId: req.query?.accountId || candidate?.accountId || null
        });
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
        const organizations = await VonHalskyService.getOrganizations({
            workspaceId: req.workspaceId || null,
            accountId: req.query?.accountId || null
        });
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
