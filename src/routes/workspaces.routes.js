const express = require('express');
const router = express.Router();
const prisma = require('../core/prisma');
const { requireSuperUser } = require('../middlewares/auth.middleware');
const workspaceService = require('../services/workspace.service');
const { getPublicContentPresetsCatalog } = require('../services/workspaceContentProfile.service');
const { testBaseLinkerToken } = require('../utils/secretVault');
const VonHalskyService = require('../modules/offer-optimizer/vonhalsky.service');
const baselinkerExportService = require('../modules/offer-optimizer-v2/baselinker.export.service');

router.get('/', async (req, res) => {
    try {
        const workspaces = await workspaceService.listWorkspacesWithIntegrationSummary(prisma);
        return res.json({ success: true, workspaces });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/content-presets', async (req, res) => {
    try {
        const catalog = getPublicContentPresetsCatalog();
        return res.json({ success: true, ...catalog });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/', requireSuperUser, async (req, res) => {
    try {
        const ws = await workspaceService.createWorkspace(prisma, {
            ...(req.body || {}),
            userId: req.user?.id
        });
        const workspaces = await workspaceService.listWorkspacesWithIntegrationSummary(prisma);
        return res.status(201).json({ success: true, workspace: ws, workspaces });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.patch('/:workspaceId', requireSuperUser, async (req, res) => {
    try {
        const ws = await workspaceService.updateWorkspace(prisma, req.params.workspaceId, {
            ...(req.body || {}),
            userId: req.user?.id
        });
        const workspaces = await workspaceService.listWorkspacesWithIntegrationSummary(prisma);
        return res.json({ success: true, workspace: ws, workspaces });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.delete('/:workspaceId', requireSuperUser, async (req, res) => {
    try {
        const result = await workspaceService.archiveWorkspace(prisma, req.params.workspaceId, req.user?.id);
        const workspaces = await workspaceService.listWorkspacesWithIntegrationSummary(prisma);
        return res.json({ success: true, ...result, workspaces });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.get('/:workspaceId/integrations', async (req, res) => {
    try {
        await workspaceService.resolveWorkspace(prisma, req.params.workspaceId);
        const accounts = await workspaceService.listIntegrationAccounts(
            prisma,
            req.params.workspaceId,
            req.query?.provider || null
        );
        return res.json({ success: true, accounts });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.post('/:workspaceId/integrations/baselinker', requireSuperUser, async (req, res) => {
    try {
        const ws = await workspaceService.resolveWorkspace(prisma, req.params.workspaceId);
        const { accountId = null, label, token, isDefault = false } = req.body || {};
        const cleanToken = typeof token === 'string' ? token.trim() : '';

        if (!accountId && !cleanToken) {
            return res.status(400).json({ success: false, error: 'Token API BaseLinker jest wymagany przy dodawaniu nowego konta.' });
        }

        let inventories = [];
        let lastVerifiedAt = undefined;
        let credentialsObj = {};

        if (cleanToken) {
            const verification = await testBaseLinkerToken(cleanToken);
            if (!verification.ok) {
                return res.status(400).json({
                    success: false,
                    error: verification.errorMessage,
                    errorCode: verification.errorCode
                });
            }
            inventories = verification.inventories || [];
            lastVerifiedAt = new Date();
            credentialsObj = { token: cleanToken };
        }

        const saved = await workspaceService.upsertIntegrationAccount(prisma, {
            workspaceId: ws.id,
            accountId,
            provider: 'BASELINKER',
            label: (label && String(label).trim()) || 'Konto BaseLinker',
            externalAccountId: inventories[0]?.inventory_id ? String(inventories[0].inventory_id) : null,
            environment: 'production',
            isDefault: Boolean(isDefault),
            credentialsObj,
            metadata: cleanToken ? { inventories, inventoriesCount: inventories.length } : null,
            lastVerifiedAt,
            userId: req.user?.id
        });

        baselinkerExportService.clearInventoryParametersCache(ws.id);
        const accounts = await workspaceService.listIntegrationAccounts(prisma, ws.id, 'BASELINKER');
        return res.json({ success: true, account: saved, accounts, inventories });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.post('/:workspaceId/integrations/:accountId/verify', requireSuperUser, async (req, res) => {
    try {
        const ws = await workspaceService.resolveWorkspace(prisma, req.params.workspaceId);
        const { accountId } = req.params;
        const row = await prisma.integrationAccount.findFirst({
            where: { id: accountId, workspaceId: ws.id, isActive: true }
        });
        if (!row) {
            return res.status(404).json({ success: false, error: 'Konto integracji nie należy do wybranego klienta.' });
        }

        if (row.provider === 'BASELINKER') {
            const decrypted = await workspaceService.getDecryptedIntegrationAccount(prisma, {
                workspaceId: ws.id,
                provider: 'BASELINKER',
                accountId: row.id
            });
            const check = await testBaseLinkerToken(decrypted?.credentials?.token || '');
            if (check.ok) {
                await prisma.integrationAccount.update({
                    where: { id: row.id },
                    data: {
                        lastVerifiedAt: new Date(),
                        metadata: { ...(row.metadata || {}), inventories: check.inventories, inventoriesCount: check.inventories.length }
                    }
                });
            }
            return res.json({ success: check.ok, ...check });
        }

        if (row.provider === 'VONHALSKY') {
            const check = await VonHalskyService.verifyConnection(null, {
                injectedPrisma: prisma,
                workspaceId: ws.id,
                accountId: row.id
            });
            return res.json({ success: check.ok, ...check });
        }

        return res.status(400).json({ success: false, error: `Weryfikacja ręczna nie dotyczy kanału ${row.provider}.` });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.patch('/:workspaceId/integrations/:accountId', requireSuperUser, async (req, res) => {
    try {
        const ws = await workspaceService.resolveWorkspace(prisma, req.params.workspaceId);
        const updated = await workspaceService.updateIntegrationAccountMeta(prisma, {
            workspaceId: ws.id,
            accountId: req.params.accountId,
            label: req.body?.label,
            isDefault: req.body?.isDefault,
            userId: req.user?.id
        });
        const accounts = await workspaceService.listIntegrationAccounts(prisma, ws.id);
        return res.json({ success: true, account: updated, accounts });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.delete('/:workspaceId/integrations/:accountId', requireSuperUser, async (req, res) => {
    try {
        const ws = await workspaceService.resolveWorkspace(prisma, req.params.workspaceId);
        const removed = await workspaceService.deleteIntegrationAccount(prisma, {
            workspaceId: ws.id,
            accountId: req.params.accountId,
            userId: req.user?.id
        });
        baselinkerExportService.clearInventoryParametersCache(ws.id);
        const accounts = await workspaceService.listIntegrationAccounts(prisma, ws.id);
        return res.json({ success: true, ...removed, accounts });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

router.get('/:workspaceId/audit-logs', requireSuperUser, async (req, res) => {
    try {
        const ws = await workspaceService.resolveWorkspace(prisma, req.params.workspaceId);
        const logs = await prisma.securityAuditLog.findMany({
            where: { workspaceId: ws.id },
            orderBy: { createdAt: 'desc' },
            take: 50
        });
        return res.json({ success: true, logs });
    } catch (err) {
        return res.status(err.statusCode || 500).json({ success: false, error: err.message });
    }
});

module.exports = router;
