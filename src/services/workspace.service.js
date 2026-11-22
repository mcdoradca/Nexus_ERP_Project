const crypto = require('crypto');
const {
    encryptSecretWithAad,
    decryptSecretWithAad,
    buildIntegrationAad
} = require('../utils/secretVault');

const VALID_PROVIDERS = new Set(['BASELINKER', 'ALLEGRO', 'VONHALSKY']);
const VALID_HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function slugifyWorkspaceName(name = '') {
    const base = String(name || '')
        .toLowerCase()
        .replace(/ł/g, 'l')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
    return base || `klient-${Date.now().toString(36)}`;
}

function maskTokenOrId(val = '') {
    const clean = String(val || '').trim();
    if (!clean) return '';
    if (clean.length <= 8) return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
    return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

async function recordSecurityAudit(prisma, entry = {}) {
    if (!prisma?.securityAuditLog || typeof prisma.securityAuditLog.create !== 'function') return null;
    try {
        return await prisma.securityAuditLog.create({
            data: {
                workspaceId: entry.workspaceId || null,
                userId: entry.userId || null,
                action: String(entry.action || 'UNKNOWN'),
                provider: entry.provider || null,
                integrationAccountId: entry.integrationAccountId || null,
                entityId: entry.entityId ? String(entry.entityId) : null,
                status: entry.status || 'SUCCESS',
                details: entry.details && typeof entry.details === 'object' ? entry.details : undefined
            }
        });
    } catch (err) {
        console.warn(`[SecurityAuditLog] Nie udało się zapisać wpisu audytu (${entry.action}): ${err.message}`);
        return null;
    }
}

async function ensureDefaultWorkspace(prisma) {
    if (!prisma?.workspace || typeof prisma.workspace.findFirst !== 'function') {
        return null;
    }
    let def = await prisma.workspace.findFirst({
        where: { isDefault: true, isActive: true }
    });
    if (def) return def;

    const firstActive = await prisma.workspace.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' }
    });
    if (firstActive) {
        return prisma.workspace.update({
            where: { id: firstActive.id },
            data: { isDefault: true }
        });
    }

    return prisma.workspace.upsert({
        where: { slug: 'default' },
        update: { isDefault: true, isActive: true },
        create: {
            slug: 'default',
            name: 'Domyślny Klient',
            badgeColor: '#4f46e5',
            isDefault: true,
            isActive: true
        }
    });
}

async function resolveWorkspace(prisma, requestedIdOrSlug = null) {
    const clean = requestedIdOrSlug ? String(requestedIdOrSlug).trim() : '';
    if (!clean) {
        return ensureDefaultWorkspace(prisma);
    }
    const found = await prisma.workspace.findFirst({
        where: {
            isActive: true,
            OR: [{ id: clean }, { slug: clean }]
        }
    });
    if (!found) {
        const err = new Error(`Wybrany klient/workspace ("${clean}") nie istnieje lub jest nieaktywny.`);
        err.statusCode = 404;
        err.code = 'WORKSPACE_NOT_FOUND';
        throw err;
    }
    return found;
}

async function listWorkspacesWithIntegrationSummary(prisma) {
    await ensureDefaultWorkspace(prisma);
    const workspaces = await prisma.workspace.findMany({
        where: { isActive: true },
        include: {
            _count: { select: { products: true } },
            integrations: {
                where: { isActive: true },
                select: {
                    id: true,
                    provider: true,
                    label: true,
                    externalAccountId: true,
                    environment: true,
                    isDefault: true,
                    lastVerifiedAt: true
                }
            }
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }]
    });

    return workspaces.map(ws => {
        const byProvider = { BASELINKER: 0, ALLEGRO: 0, VONHALSKY: 0 };
        for (const acc of ws.integrations || []) {
            if (byProvider[acc.provider] !== undefined) {
                byProvider[acc.provider] += 1;
            }
        }
        return {
            id: ws.id,
            slug: ws.slug,
            name: ws.name,
            badgeColor: ws.badgeColor,
            isDefault: ws.isDefault,
            isActive: ws.isActive,
            settings: ws.settings || {},
            productCount: ws._count?.products || 0,
            integrationsSummary: {
                baselinkerCount: byProvider.BASELINKER,
                allegroCount: byProvider.ALLEGRO,
                vonhalskyCount: byProvider.VONHALSKY
            },
            createdAt: ws.createdAt,
            updatedAt: ws.updatedAt
        };
    });
}

async function createWorkspace(prisma, { name, slug = null, badgeColor = '#4f46e5', isDefault = false, settings = {}, userId = null }) {
    const cleanName = String(name || '').trim();
    if (!cleanName || cleanName.length < 2) {
        const err = new Error('Nazwa klienta (workspace) musi mieć co najmniej 2 znaki.');
        err.statusCode = 400;
        throw err;
    }

    let baseSlug = slug ? slugifyWorkspaceName(slug) : slugifyWorkspaceName(cleanName);
    const existingSlug = await prisma.workspace.findUnique({ where: { slug: baseSlug } });
    if (existingSlug) {
        baseSlug = `${baseSlug}-${crypto.randomBytes(2).toString('hex')}`;
    }

    const safeColor = VALID_HEX_COLOR.test(String(badgeColor || '').trim()) ? String(badgeColor).trim() : '#4f46e5';

    const created = await prisma.$transaction(async (tx) => {
        if (isDefault) {
            await tx.workspace.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
        }
        return tx.workspace.create({
            data: {
                slug: baseSlug,
                name: cleanName.slice(0, 80),
                badgeColor: safeColor,
                isDefault: Boolean(isDefault),
                isActive: true,
                settings: settings && typeof settings === 'object' ? settings : {}
            }
        });
    });

    await recordSecurityAudit(prisma, {
        workspaceId: created.id,
        userId,
        action: 'WORKSPACE_CREATED',
        entityId: created.id,
        details: { name: created.name, slug: created.slug, isDefault: created.isDefault }
    });

    return created;
}

async function updateWorkspace(prisma, workspaceId, { name, badgeColor, isDefault, settings, userId = null }) {
    const existing = await prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!existing || !existing.isActive) {
        const err = new Error('Klient (workspace) nie został znaleziony.');
        err.statusCode = 404;
        throw err;
    }

    const data = {};
    if (typeof name === 'string' && name.trim().length >= 2) {
        data.name = name.trim().slice(0, 80);
    }
    if (badgeColor && VALID_HEX_COLOR.test(String(badgeColor).trim())) {
        data.badgeColor = String(badgeColor).trim();
    }
    if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
        data.settings = { ...(existing.settings && typeof existing.settings === 'object' ? existing.settings : {}), ...settings };
    }

    const updated = await prisma.$transaction(async (tx) => {
        if (isDefault === true) {
            await tx.workspace.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
            data.isDefault = true;
        }
        return tx.workspace.update({ where: { id: workspaceId }, data });
    });

    await recordSecurityAudit(prisma, {
        workspaceId: updated.id,
        userId,
        action: 'WORKSPACE_UPDATED',
        entityId: updated.id,
        details: { name: updated.name, badgeColor: updated.badgeColor, isDefault: updated.isDefault }
    });

    return updated;
}

async function archiveWorkspace(prisma, workspaceId, userId = null) {
    const existing = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: { _count: { select: { products: true } } }
    });
    if (!existing) {
        const err = new Error('Klient (workspace) nie został znaleziony.');
        err.statusCode = 404;
        throw err;
    }
    if (existing.isDefault) {
        const err = new Error('Nie można usunąć ani dezaktywować domyślnego klienta. Ustaw najpierw innego klienta jako domyślnego.');
        err.statusCode = 400;
        throw err;
    }
    const activeCount = await prisma.workspace.count({ where: { isActive: true } });
    if (activeCount <= 1) {
        const err = new Error('System musi posiadać co najmniej jednego aktywnego klienta.');
        err.statusCode = 400;
        throw err;
    }

    if ((existing._count?.products || 0) === 0) {
        await prisma.workspace.delete({ where: { id: workspaceId } });
    } else {
        await prisma.workspace.update({
            where: { id: workspaceId },
            data: { isActive: false }
        });
    }

    await recordSecurityAudit(prisma, {
        workspaceId: null,
        userId,
        action: 'WORKSPACE_ARCHIVED',
        entityId: workspaceId,
        details: { name: existing.name, hadProducts: existing._count?.products || 0 }
    });

    return { archivedId: workspaceId };
}

function formatSafeIntegrationAccount(row) {
    if (!row) return null;
    let hasSecret = Boolean(row.credentialsEnc);
    let maskedId = '';
    let hasCustomApp = false;
    let hasRefreshToken = false;
    let scopes = [];
    let tokenExpiresAt = null;

    try {
        if (row.credentialsEnc) {
            const plain = decryptSecretWithAad(
                row.credentialsEnc,
                buildIntegrationAad(row.workspaceId, row.provider, row.id)
            );
            const creds = JSON.parse(plain || '{}');
            if (row.provider === 'BASELINKER') {
                hasSecret = Boolean(creds.token);
                maskedId = maskTokenOrId(creds.token || '');
            } else if (row.provider === 'VONHALSKY') {
                hasSecret = Boolean(creds.clientId && creds.clientSecret);
                maskedId = maskTokenOrId(creds.clientId || '');
            } else if (row.provider === 'ALLEGRO') {
                hasSecret = Boolean(creds.refreshToken || creds.accessToken);
                hasRefreshToken = Boolean(creds.refreshToken);
                hasCustomApp = Boolean(creds.customClientId && creds.customClientSecret);
                maskedId = maskTokenOrId(creds.customClientId || row.externalAccountId || '');
                scopes = Array.isArray(creds.scopes) ? creds.scopes : [];
                tokenExpiresAt = creds.expiresAt ? new Date(Number(creds.expiresAt)).toISOString() : null;
            }
        }
    } catch (_) {
        hasSecret = false;
    }

    return {
        id: row.id,
        workspaceId: row.workspaceId,
        provider: row.provider,
        label: row.label,
        externalAccountId: row.externalAccountId || null,
        environment: row.environment || 'production',
        isDefault: Boolean(row.isDefault),
        isActive: Boolean(row.isActive),
        configured: hasSecret,
        maskedCredential: maskedId,
        hasCustomApp,
        hasRefreshToken,
        scopes,
        tokenExpiresAt,
        metadata: row.metadata || {},
        lastVerifiedAt: row.lastVerifiedAt || null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
    };
}

async function listIntegrationAccounts(prisma, workspaceId, provider = null) {
    const where = { workspaceId, isActive: true };
    if (provider) {
        const cleanProv = String(provider).trim().toUpperCase();
        if (!VALID_PROVIDERS.has(cleanProv)) {
            const err = new Error(`Nieobsługiwany kanał integracji: ${provider}`);
            err.statusCode = 400;
            throw err;
        }
        where.provider = cleanProv;
    }
    const rows = await prisma.integrationAccount.findMany({
        where,
        orderBy: [{ provider: 'asc' }, { isDefault: 'desc' }, { createdAt: 'asc' }]
    });
    return rows.map(formatSafeIntegrationAccount);
}

async function upsertIntegrationAccount(prisma, {
    workspaceId,
    accountId = null,
    provider,
    label,
    externalAccountId = null,
    environment = 'production',
    isDefault = false,
    credentialsObj = {},
    metadata = null,
    lastVerifiedAt = undefined,
    userId = null
}) {
    const cleanProv = String(provider || '').trim().toUpperCase();
    if (!VALID_PROVIDERS.has(cleanProv)) {
        const err = new Error(`Nieobsługiwany kanał integracji: ${provider}`);
        err.statusCode = 400;
        throw err;
    }
    const cleanLabel = String(label || '').trim();
    if (!cleanLabel) {
        const err = new Error('Etykieta konta integracji jest wymagana.');
        err.statusCode = 400;
        throw err;
    }

    const existingCount = await prisma.integrationAccount.count({
        where: { workspaceId, provider: cleanProv, isActive: true }
    });

    let existingRow = null;
    if (accountId) {
        existingRow = await prisma.integrationAccount.findFirst({
            where: { id: accountId, workspaceId, provider: cleanProv }
        });
        if (!existingRow) {
            const err = new Error('Konto integracji nie należy do wybranego klienta lub nie istnieje.');
            err.statusCode = 404;
            throw err;
        }
    }

    const targetId = existingRow?.id || crypto.randomUUID();
    const effectiveDefault = Boolean(isDefault) || (!existingRow && existingCount === 0);

    let mergedCreds = { ...(credentialsObj && typeof credentialsObj === 'object' ? credentialsObj : {}) };
    if (existingRow?.credentialsEnc) {
        try {
            const prevPlain = decryptSecretWithAad(
                existingRow.credentialsEnc,
                buildIntegrationAad(workspaceId, cleanProv, existingRow.id)
            );
            const prevObj = JSON.parse(prevPlain || '{}');
            mergedCreds = { ...prevObj, ...mergedCreds };
        } catch (_) {}
    }

    const encrypted = encryptSecretWithAad(
        JSON.stringify(mergedCreds),
        buildIntegrationAad(workspaceId, cleanProv, targetId)
    );

    const nextMeta = metadata !== null && typeof metadata === 'object'
        ? { ...(existingRow?.metadata && typeof existingRow.metadata === 'object' ? existingRow.metadata : {}), ...metadata }
        : (existingRow?.metadata || {});

    const saved = await prisma.$transaction(async (tx) => {
        if (effectiveDefault) {
            await tx.integrationAccount.updateMany({
                where: { workspaceId, provider: cleanProv, isDefault: true, NOT: { id: targetId } },
                data: { isDefault: false }
            });
        }
        if (existingRow) {
            return tx.integrationAccount.update({
                where: { id: targetId },
                data: {
                    label: cleanLabel.slice(0, 80),
                    externalAccountId: externalAccountId !== null ? externalAccountId : existingRow.externalAccountId,
                    environment: environment || existingRow.environment,
                    isDefault: effectiveDefault ? true : existingRow.isDefault,
                    isActive: true,
                    credentialsEnc: encrypted,
                    metadata: nextMeta,
                    ...(lastVerifiedAt !== undefined ? { lastVerifiedAt } : {})
                }
            });
        }
        return tx.integrationAccount.create({
            data: {
                id: targetId,
                workspaceId,
                provider: cleanProv,
                label: cleanLabel.slice(0, 80),
                externalAccountId: externalAccountId ? String(externalAccountId) : null,
                environment: environment || 'production',
                isDefault: effectiveDefault,
                isActive: true,
                credentialsEnc: encrypted,
                metadata: nextMeta,
                lastVerifiedAt: lastVerifiedAt || null
            }
        });
    });

    await recordSecurityAudit(prisma, {
        workspaceId,
        userId,
        action: existingRow ? 'INTEGRATION_UPDATED' : 'INTEGRATION_CREATED',
        provider: cleanProv,
        integrationAccountId: saved.id,
        entityId: saved.id,
        details: { label: saved.label, externalAccountId: saved.externalAccountId, isDefault: saved.isDefault }
    });

    return formatSafeIntegrationAccount(saved);
}

async function getDecryptedIntegrationAccount(prisma, { workspaceId, provider, accountId = null }) {
    if (!workspaceId) {
        const err = new Error('Brak workspaceId przy próbie odczytu sekretu integracji.');
        err.statusCode = 400;
        throw err;
    }
    const cleanProv = String(provider || '').trim().toUpperCase();
    const where = { workspaceId, provider: cleanProv, isActive: true };
    if (accountId) {
        where.id = String(accountId).trim();
    }

    const row = await prisma.integrationAccount.findFirst({
        where,
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });
    if (!row) return null;

    const aad = buildIntegrationAad(row.workspaceId, cleanProv, row.id);
    const plain = decryptSecretWithAad(row.credentialsEnc, aad);
    let credentials = {};
    try {
        credentials = JSON.parse(plain || '{}');
    } catch (_) {
        credentials = { raw: plain };
    }

    return {
        id: row.id,
        workspaceId: row.workspaceId,
        provider: row.provider,
        label: row.label,
        externalAccountId: row.externalAccountId || null,
        environment: row.environment,
        isDefault: Boolean(row.isDefault),
        metadata: row.metadata || {},
        lastVerifiedAt: row.lastVerifiedAt,
        updatedAt: row.updatedAt,
        credentials
    };
}

async function updateIntegrationAccountMeta(prisma, { workspaceId, accountId, label, isDefault, userId = null }) {
    const row = await prisma.integrationAccount.findFirst({
        where: { id: accountId, workspaceId, isActive: true }
    });
    if (!row) {
        const err = new Error('Konto integracji nie istnieje w kontekście wybranego klienta.');
        err.statusCode = 404;
        throw err;
    }

    const updated = await prisma.$transaction(async (tx) => {
        if (isDefault === true) {
            await tx.integrationAccount.updateMany({
                where: { workspaceId, provider: row.provider, isDefault: true, NOT: { id: row.id } },
                data: { isDefault: false }
            });
        }
        return tx.integrationAccount.update({
            where: { id: row.id },
            data: {
                ...(typeof label === 'string' && label.trim() ? { label: label.trim().slice(0, 80) } : {}),
                ...(isDefault === true ? { isDefault: true } : {})
            }
        });
    });

    await recordSecurityAudit(prisma, {
        workspaceId,
        userId,
        action: 'INTEGRATION_META_UPDATED',
        provider: row.provider,
        integrationAccountId: row.id,
        entityId: row.id,
        details: { label: updated.label, isDefault: updated.isDefault }
    });

    return formatSafeIntegrationAccount(updated);
}

async function deleteIntegrationAccount(prisma, { workspaceId, accountId, userId = null }) {
    const row = await prisma.integrationAccount.findFirst({
        where: { id: accountId, workspaceId }
    });
    if (!row) {
        const err = new Error('Konto integracji nie istnieje w kontekście wybranego klienta.');
        err.statusCode = 404;
        throw err;
    }

    await prisma.$transaction(async (tx) => {
        await tx.integrationAccount.delete({ where: { id: row.id } });
        if (row.isDefault) {
            const next = await tx.integrationAccount.findFirst({
                where: { workspaceId, provider: row.provider, isActive: true },
                orderBy: { createdAt: 'asc' }
            });
            if (next) {
                await tx.integrationAccount.update({
                    where: { id: next.id },
                    data: { isDefault: true }
                });
            }
        }
    });

    await recordSecurityAudit(prisma, {
        workspaceId,
        userId,
        action: 'INTEGRATION_DELETED',
        provider: row.provider,
        integrationAccountId: row.id,
        entityId: row.id,
        details: { label: row.label, externalAccountId: row.externalAccountId }
    });

    return { deletedId: row.id, provider: row.provider };
}

module.exports = {
    VALID_PROVIDERS,
    slugifyWorkspaceName,
    maskTokenOrId,
    recordSecurityAudit,
    ensureDefaultWorkspace,
    resolveWorkspace,
    listWorkspacesWithIntegrationSummary,
    createWorkspace,
    updateWorkspace,
    archiveWorkspace,
    formatSafeIntegrationAccount,
    listIntegrationAccounts,
    upsertIntegrationAccount,
    getDecryptedIntegrationAccount,
    updateIntegrationAccountMeta,
    deleteIntegrationAccount
};
