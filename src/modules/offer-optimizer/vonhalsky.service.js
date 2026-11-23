const crypto = require('crypto');
const axios = require('axios');
const FormData = require('form-data');
const sharp = require('sharp');
const { PrismaClient } = require('@prisma/client');
const {
    encryptSecret,
    decryptSecret,
    encryptSecretWithAad,
    decryptSecretWithAad,
    buildIntegrationAad
} = require('../../utils/secretVault');
const { trimOrNull, parseLocaleInt } = require('../../utils/productLookup');

const prisma = new PrismaClient();

const VONHALSKY_VAULT_KEY = 'VONHALSKY_CONFIG_VAULT';
const VONHALSKY_USER_AGENT = 'NexusERP-VonHalsky/1.0 (+https://n-e-s.pl)';

const ENVIRONMENTS = {
    production: {
        apiBaseUrl: 'https://api.inpost-group.com/inpsa',
        tokenUrl: 'https://api.inpost-group.com/oauth2/token'
    },
    stage: {
        apiBaseUrl: 'https://stage-api.inpost-group.com/inpsa',
        tokenUrl: 'https://stage-api.inpost-group.com/oauth2/token'
    }
};

const DEFAULT_SCOPES = 'api:categories:read api:offers:read api:offers:write';
const CATEGORY_CACHE_TTL_MS = 30 * 60 * 1000;
const ATTR_CACHE_TTL_MS = 15 * 60 * 1000;

const tokenCache = new Map(); // cacheKey -> { accessToken, expiresAtMs, scope }
const tokenInflight = new Map(); // cacheKey -> Promise<string>
const categoryTreeCache = new Map(); // envKey -> { fetchedAtMs, tree, flatLeaves, byId }
const categoryAttrCache = new Map(); // `${envKey}:${categoryId}` -> { fetchedAtMs, attributes }

function normalizeEnvironment(envRaw) {
    const clean = String(envRaw || '').trim().toLowerCase();
    return clean === 'stage' || clean === 'sandbox' ? 'stage' : 'production';
}

function getEnvDefaults(environment) {
    return ENVIRONMENTS[normalizeEnvironment(environment)] || ENVIRONMENTS.production;
}

function maskClientId(clientId) {
    const clean = String(clientId || '').trim();
    if (!clean) return '';
    if (clean.length <= 8) return `${clean.slice(0, 2)}***${clean.slice(-2)}`;
    return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function parseRetryAfterMs(headerVal) {
    if (!headerVal) return 1500;
    const asNum = Number(headerVal);
    if (Number.isFinite(asNum) && asNum > 0) {
        return Math.min(asNum * 1000, 10000);
    }
    const asDate = Date.parse(String(headerVal));
    if (!Number.isNaN(asDate)) {
        const diff = asDate - Date.now();
        if (diff > 0) return Math.min(diff, 10000);
    }
    return 1500;
}

/**
 * Normalizuje komunikat błędu z formatu OpenAPI `ErrorResponse` (`errorCode`, `errorMessage`, `details[]`).
 */
function buildVonHalskyApiError(error, fallbackMessage = 'Błąd komunikacji z InPost Von Halsky API.') {
    const status = error?.response?.status || error?.statusCode || 500;
    const data = error?.response?.data;
    let message = fallbackMessage;
    let errorCode = data?.errorCode || error?.code || null;
    let details = Array.isArray(data?.details) ? data.details : null;

    if (data && typeof data === 'object') {
        const baseMsg = data.errorMessage || data.error_description || data.message || data.error;
        if (baseMsg) {
            message = String(baseMsg);
        }
        if (Array.isArray(details) && details.length > 0) {
            const formattedDetails = details
                .map(d => `${d.field ? `[${d.field}] ` : ''}${d.detail || ''}`.trim())
                .filter(Boolean)
                .join('; ');
            if (formattedDetails) {
                message = `${message} (${formattedDetails})`;
            }
        }
    } else if (error?.message) {
        message = error.message;
    }

    const wrapped = new Error(message);
    wrapped.statusCode = status;
    wrapped.code = errorCode;
    wrapped.vonHalskyDetails = details;
    wrapped.rawResponse = data || null;
    return wrapped;
}

/**
 * Odczytuje pełną konfigurację Von Halsky:
 * - W trybie Multi-Workspace (`workspaceId` + tabela `IntegrationAccount`): wyłącznie z `IntegrationAccount` (AES-256-GCM + AAD, fail-closed bez dziedziczenia `.env` między klientami).
 * - W trybie legacy/unit-test (bez `workspaceId`): z `SystemSetting.VONHALSKY_CONFIG_VAULT` -> fallback `.env`.
 */
async function getConfig(injectedPrisma = prisma, opts = {}) {
    const cleanWsId = trimOrNull(opts?.workspaceId);
    const cleanAccId = trimOrNull(opts?.accountId);
    const envName = normalizeEnvironment(process.env.VONHALSKY_ENV || 'production');
    const envDefaults = getEnvDefaults(envName);

    const emptyWsConfig = {
        workspaceId: cleanWsId || null,
        accountId: cleanAccId || null,
        label: 'InPost Von Halsky',
        isDefault: false,
        environment: 'production',
        apiBaseUrl: ENVIRONMENTS.production.apiBaseUrl,
        tokenUrl: ENVIRONMENTS.production.tokenUrl,
        clientId: '',
        clientSecret: '',
        organizationId: '',
        organizationName: '',
        scope: DEFAULT_SCOPES,
        defaultDaysToShip: 1,
        defaultDescriptionFormat: 'html',
        defaultManufacturerEmail: '',
        defaultManufacturerPhone: '',
        defaultReturnPolicy: '',
        defaultComplaintPolicy: '',
        source: 'none',
        updatedAt: null,
        audit: null
    };

    if (cleanWsId && injectedPrisma?.integrationAccount && typeof injectedPrisma.integrationAccount.findFirst === 'function') {
        try {
            const where = { workspaceId: cleanWsId, provider: 'VONHALSKY', isActive: true };
            if (cleanAccId) {
                where.id = cleanAccId;
            }
            const row = await injectedPrisma.integrationAccount.findFirst({
                where,
                orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
            });
            if (!row) {
                if (cleanAccId) {
                    const err = new Error(`Wybrane konto InPost Von Halsky (${cleanAccId}) nie należy do tego klienta lub nie istnieje.`);
                    err.statusCode = 404;
                    err.code = 'VONHALSKY_ACCOUNT_NOT_FOUND';
                    throw err;
                }
                return emptyWsConfig;
            }

            let creds = {};
            if (row.credentialsEnc) {
                const plain = decryptSecretWithAad(
                    row.credentialsEnc,
                    buildIntegrationAad(row.workspaceId, 'VONHALSKY', row.id)
                );
                creds = JSON.parse(plain || '{}');
            }
            const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
            const effEnv = normalizeEnvironment(row.environment || 'production');
            const effDefaults = getEnvDefaults(effEnv);
            const effClientId = trimOrNull(creds.clientId) || '';
            const effClientSecret = trimOrNull(creds.clientSecret) || '';

            return {
                workspaceId: row.workspaceId,
                accountId: row.id,
                label: row.label || 'InPost Von Halsky',
                isDefault: Boolean(row.isDefault),
                environment: effEnv,
                apiBaseUrl: trimOrNull(meta.apiBaseUrl) || effDefaults.apiBaseUrl,
                tokenUrl: trimOrNull(meta.tokenUrl) || effDefaults.tokenUrl,
                clientId: effClientId,
                clientSecret: effClientSecret,
                organizationId: trimOrNull(meta.organizationId || row.externalAccountId) || '',
                organizationName: trimOrNull(meta.organizationName) || '',
                scope: trimOrNull(meta.scope) || DEFAULT_SCOPES,
                defaultDaysToShip: parseLocaleInt(meta.defaultDaysToShip) ?? 1,
                defaultDescriptionFormat: meta.defaultDescriptionFormat === 'plain' ? 'plain' : 'html',
                defaultManufacturerEmail: trimOrNull(meta.defaultManufacturerEmail) || '',
                defaultManufacturerPhone: trimOrNull(meta.defaultManufacturerPhone) || '',
                defaultReturnPolicy: trimOrNull(meta.defaultReturnPolicy) || '',
                defaultComplaintPolicy: trimOrNull(meta.defaultComplaintPolicy) || '',
                source: (effClientId && effClientSecret) ? 'db' : 'partial',
                updatedAt: row.updatedAt || null,
                audit: meta.audit || null
            };
        } catch (err) {
            if (err.code === 'VONHALSKY_ACCOUNT_NOT_FOUND') throw err;
            console.error('[VonHalskyService] Błąd odczytu IntegrationAccount Von Halsky:', err.message);
            return emptyWsConfig;
        }
    }

    const envConfig = {
        workspaceId: null,
        accountId: null,
        label: 'InPost Von Halsky Domyślny',
        isDefault: true,
        environment: envName,
        apiBaseUrl: trimOrNull(process.env.VONHALSKY_API_BASE_URL) || envDefaults.apiBaseUrl,
        tokenUrl: trimOrNull(process.env.VONHALSKY_TOKEN_URL) || envDefaults.tokenUrl,
        clientId: trimOrNull(process.env.VONHALSKY_CLIENT_ID) || '',
        clientSecret: trimOrNull(process.env.VONHALSKY_CLIENT_SECRET) || '',
        organizationId: trimOrNull(process.env.VONHALSKY_ORGANIZATION_ID) || '',
        organizationName: '',
        scope: trimOrNull(process.env.VONHALSKY_SCOPE) || DEFAULT_SCOPES,
        defaultDaysToShip: parseLocaleInt(process.env.VONHALSKY_DEFAULT_DAYS_TO_SHIP) ?? 1,
        defaultDescriptionFormat: 'html',
        defaultManufacturerEmail: trimOrNull(process.env.VONHALSKY_DEFAULT_MANUFACTURER_EMAIL) || '',
        defaultManufacturerPhone: trimOrNull(process.env.VONHALSKY_DEFAULT_MANUFACTURER_PHONE) || '',
        defaultReturnPolicy: '',
        defaultComplaintPolicy: '',
        source: (process.env.VONHALSKY_CLIENT_ID && process.env.VONHALSKY_CLIENT_SECRET) ? 'env' : 'none',
        updatedAt: null,
        audit: null
    };

    if (!injectedPrisma?.systemSetting || typeof injectedPrisma.systemSetting.findUnique !== 'function') {
        return envConfig;
    }

    try {
        const rec = await injectedPrisma.systemSetting.findUnique({ where: { key: VONHALSKY_VAULT_KEY } });
        if (!rec || !rec.value) {
            return envConfig;
        }
        const parsed = JSON.parse(rec.value);
        const effEnv = normalizeEnvironment(parsed.environment || envConfig.environment);
        const effDefaults = getEnvDefaults(effEnv);

        let decryptedSecret = envConfig.clientSecret;
        if (parsed.clientSecretEnc) {
            decryptedSecret = decryptSecret(parsed.clientSecretEnc) || '';
        }

        const effectiveClientId = trimOrNull(parsed.clientId) || envConfig.clientId;
        const source = (parsed.clientId && parsed.clientSecretEnc)
            ? 'db'
            : (envConfig.clientId && envConfig.clientSecret ? 'env' : 'partial');

        return {
            workspaceId: null,
            accountId: null,
            label: 'InPost Von Halsky Domyślny',
            isDefault: true,
            environment: effEnv,
            apiBaseUrl: trimOrNull(parsed.apiBaseUrl) || effDefaults.apiBaseUrl,
            tokenUrl: trimOrNull(parsed.tokenUrl) || effDefaults.tokenUrl,
            clientId: effectiveClientId,
            clientSecret: decryptedSecret,
            organizationId: trimOrNull(parsed.organizationId) || envConfig.organizationId,
            organizationName: trimOrNull(parsed.organizationName) || '',
            scope: trimOrNull(parsed.scope) || envConfig.scope,
            defaultDaysToShip: parseLocaleInt(parsed.defaultDaysToShip) ?? envConfig.defaultDaysToShip,
            defaultDescriptionFormat: parsed.defaultDescriptionFormat === 'plain' ? 'plain' : 'html',
            defaultManufacturerEmail: trimOrNull(parsed.defaultManufacturerEmail) || envConfig.defaultManufacturerEmail,
            defaultManufacturerPhone: trimOrNull(parsed.defaultManufacturerPhone) || envConfig.defaultManufacturerPhone,
            defaultReturnPolicy: trimOrNull(parsed.defaultReturnPolicy) || '',
            defaultComplaintPolicy: trimOrNull(parsed.defaultComplaintPolicy) || '',
            source,
            updatedAt: rec.updatedAt || null,
            audit: parsed.audit || null
        };
    } catch (err) {
        console.error('[VonHalskyService] Błąd odczytu konfiguracji ze skarbca SystemSetting:', err.message);
        return envConfig;
    }
}

/**
 * Zwraca bezpieczną (bez `clientSecret`) konfigurację do wyświetlenia w Panelu Admina i Pre-flight.
 */
async function getPublicConfig(injectedPrisma = prisma, opts = {}) {
    const cfg = await getConfig(injectedPrisma, opts);
    return {
        workspaceId: cfg.workspaceId || null,
        accountId: cfg.accountId || null,
        label: cfg.label || 'InPost Von Halsky',
        isDefault: Boolean(cfg.isDefault),
        configured: Boolean(cfg.clientId && cfg.clientSecret),
        hasClientId: Boolean(cfg.clientId),
        hasClientSecret: Boolean(cfg.clientSecret),
        clientIdMasked: maskClientId(cfg.clientId),
        environment: cfg.environment,
        apiBaseUrl: cfg.apiBaseUrl,
        tokenUrl: cfg.tokenUrl,
        organizationId: cfg.organizationId,
        organizationName: cfg.organizationName,
        scope: cfg.scope,
        defaultDaysToShip: cfg.defaultDaysToShip,
        defaultDescriptionFormat: cfg.defaultDescriptionFormat,
        defaultManufacturerEmail: cfg.defaultManufacturerEmail,
        defaultManufacturerPhone: cfg.defaultManufacturerPhone,
        defaultReturnPolicy: cfg.defaultReturnPolicy,
        defaultComplaintPolicy: cfg.defaultComplaintPolicy,
        source: cfg.source,
        updatedAt: cfg.updatedAt,
        audit: cfg.audit,
        environmentPresets: ENVIRONMENTS
    };
}

/**
 * Lista kont Von Halsky przypisanych do danego klienta (workspaceId) bez ujawniania sekretów.
 */
async function listAccounts(workspaceId, injectedPrisma = prisma) {
    const cleanWsId = trimOrNull(workspaceId);
    if (!cleanWsId || !injectedPrisma?.integrationAccount) {
        const single = await getPublicConfig(injectedPrisma);
        return single.configured || single.organizationId || single.defaultManufacturerEmail ? [single] : [];
    }
    const rows = await injectedPrisma.integrationAccount.findMany({
        where: { workspaceId: cleanWsId, provider: 'VONHALSKY', isActive: true },
        orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });
    const out = [];
    for (const row of rows) {
        const cfg = await getPublicConfig(injectedPrisma, { workspaceId: cleanWsId, accountId: row.id });
        out.push(cfg);
    }
    return out;
}

/**
 * Usuwa konto Von Halsky z wybranego workspace i czyści cache tokenów.
 */
async function deleteAccount(workspaceId, accountId, injectedPrisma = prisma) {
    const cleanWsId = trimOrNull(workspaceId);
    const cleanAccId = trimOrNull(accountId);
    if (!cleanWsId || !cleanAccId || !injectedPrisma?.integrationAccount) {
        const err = new Error('Brak workspaceId lub accountId do usunięcia konta Von Halsky.');
        err.statusCode = 400;
        throw err;
    }
    const row = await injectedPrisma.integrationAccount.findFirst({
        where: { id: cleanAccId, workspaceId: cleanWsId, provider: 'VONHALSKY' }
    });
    if (!row) {
        const err = new Error('Wybrane konto Von Halsky nie istnieje u tego klienta.');
        err.statusCode = 404;
        throw err;
    }
    await injectedPrisma.$transaction(async (tx) => {
        await tx.integrationAccount.delete({ where: { id: row.id } });
        if (row.isDefault) {
            const next = await tx.integrationAccount.findFirst({
                where: { workspaceId: cleanWsId, provider: 'VONHALSKY', isActive: true },
                orderBy: { createdAt: 'asc' }
            });
            if (next) {
                await tx.integrationAccount.update({ where: { id: next.id }, data: { isDefault: true } });
            }
        }
    });
    for (const k of tokenCache.keys()) {
        if (k.startsWith(`${cleanWsId}:${cleanAccId}|`)) tokenCache.delete(k);
    }
    for (const k of tokenInflight.keys()) {
        if (k.startsWith(`${cleanWsId}:${cleanAccId}|`)) tokenInflight.delete(k);
    }
    return listAccounts(cleanWsId, injectedPrisma);
}

/**
 * Zapisuje konfigurację Von Halsky w `IntegrationAccount` (z AAD per workspace/account) lub `SystemSetting` (legacy).
 */
async function saveConfig(input = {}, auditUser = null, injectedPrisma = prisma, opts = {}) {
    const cleanWsId = trimOrNull(opts?.workspaceId || input?.workspaceId);
    const requestedAccId = trimOrNull(opts?.accountId || input?.accountId);
    const createNew = Boolean(input?.createNew);

    const existing = createNew
        ? await getConfig(injectedPrisma, { workspaceId: cleanWsId, accountId: '__non_existent__' }).catch(() => ({
            workspaceId: cleanWsId,
            accountId: null,
            label: trimOrNull(input?.label) || 'InPost Von Halsky',
            isDefault: Boolean(input?.isDefault),
            environment: 'production',
            apiBaseUrl: ENVIRONMENTS.production.apiBaseUrl,
            tokenUrl: ENVIRONMENTS.production.tokenUrl,
            clientId: '',
            clientSecret: '',
            organizationId: '',
            organizationName: '',
            scope: DEFAULT_SCOPES,
            defaultDaysToShip: 1,
            defaultDescriptionFormat: 'html',
            defaultManufacturerEmail: '',
            defaultManufacturerPhone: '',
            defaultReturnPolicy: '',
            defaultComplaintPolicy: ''
        }))
        : await getConfig(injectedPrisma, { workspaceId: cleanWsId, accountId: requestedAccId });

    const environment = normalizeEnvironment(input.environment || existing.environment);
    const preset = getEnvDefaults(environment);

    const nextClientId = input.clientId !== undefined
        ? (trimOrNull(input.clientId) || '')
        : existing.clientId;

    let nextClientSecretPlain = existing.clientSecret;
    if (input.clearSecret === true) {
        nextClientSecretPlain = '';
    } else if (typeof input.clientSecret === 'string' && input.clientSecret.trim().length > 0) {
        nextClientSecretPlain = input.clientSecret.trim();
    }

    const customApiBase = input.apiBaseUrl !== undefined ? trimOrNull(input.apiBaseUrl) : null;
    const customTokenUrl = input.tokenUrl !== undefined ? trimOrNull(input.tokenUrl) : null;

    const envChanged = environment !== existing.environment;
    const resolvedApiBase = customApiBase
        ? customApiBase.replace(/\/+$/, '')
        : (envChanged ? preset.apiBaseUrl : (existing.apiBaseUrl || preset.apiBaseUrl));
    const resolvedTokenUrl = customTokenUrl
        ? customTokenUrl
        : (envChanged ? preset.tokenUrl : (existing.tokenUrl || preset.tokenUrl));

    if (!/^https:\/\/.+/i.test(resolvedApiBase)) {
        const err = new Error('Adres API Von Halsky (apiBaseUrl) musi używać protokołu HTTPS.');
        err.statusCode = 400;
        throw err;
    }
    if (!/^https:\/\/.+/i.test(resolvedTokenUrl)) {
        const err = new Error('Adres serwera OAuth2 (tokenUrl) musi używać protokołu HTTPS.');
        err.statusCode = 400;
        throw err;
    }

    const daysToShipParsed = input.defaultDaysToShip !== undefined
        ? parseLocaleInt(input.defaultDaysToShip)
        : existing.defaultDaysToShip;
    const safeDays = (daysToShipParsed !== null && daysToShipParsed >= 0 && daysToShipParsed <= 60) ? daysToShipParsed : 1;

    const resolvedOrgId = input.organizationId !== undefined ? (trimOrNull(input.organizationId) || '') : existing.organizationId;
    const resolvedOrgName = input.organizationName !== undefined ? (trimOrNull(input.organizationName) || '') : existing.organizationName;
    const resolvedScope = input.scope !== undefined ? (trimOrNull(input.scope) || DEFAULT_SCOPES) : existing.scope;
    const resolvedDescFmt = input.defaultDescriptionFormat === 'plain'
        ? 'plain'
        : (input.defaultDescriptionFormat === 'html' ? 'html' : existing.defaultDescriptionFormat);
    const resolvedMfgEmail = input.defaultManufacturerEmail !== undefined
        ? (trimOrNull(input.defaultManufacturerEmail) || '')
        : existing.defaultManufacturerEmail;
    const resolvedMfgPhone = input.defaultManufacturerPhone !== undefined
        ? (trimOrNull(input.defaultManufacturerPhone) || '')
        : existing.defaultManufacturerPhone;
    const resolvedRetPolicy = input.defaultReturnPolicy !== undefined
        ? (trimOrNull(input.defaultReturnPolicy) || '')
        : existing.defaultReturnPolicy;
    const resolvedCompPolicy = input.defaultComplaintPolicy !== undefined
        ? (trimOrNull(input.defaultComplaintPolicy) || '')
        : existing.defaultComplaintPolicy;

    const auditObj = {
        updatedAt: new Date().toISOString(),
        updatedByUserId: auditUser?.id || null,
        updatedByEmail: auditUser?.email || null
    };

    if (cleanWsId && injectedPrisma?.integrationAccount) {
        const existingCount = await injectedPrisma.integrationAccount.count({
            where: { workspaceId: cleanWsId, provider: 'VONHALSKY', isActive: true }
        });
        const targetId = (!createNew && existing.accountId) ? existing.accountId : crypto.randomUUID();
        const isExistingRow = Boolean(!createNew && existing.accountId);
        const shouldBeDefault = input.isDefault === true || (!isExistingRow && existingCount === 0);
        const nextLabel = (typeof input.label === 'string' && input.label.trim())
            ? input.label.trim().slice(0, 80)
            : (existing.label || resolvedOrgName || `InPost Von Halsky (${environment.toUpperCase()})`);

        const enc = encryptSecretWithAad(
            JSON.stringify({ clientId: nextClientId, clientSecret: nextClientSecretPlain }),
            buildIntegrationAad(cleanWsId, 'VONHALSKY', targetId)
        );
        const metaPayload = {
            apiBaseUrl: resolvedApiBase,
            tokenUrl: resolvedTokenUrl,
            organizationId: resolvedOrgId,
            organizationName: resolvedOrgName,
            scope: resolvedScope,
            defaultDaysToShip: safeDays,
            defaultDescriptionFormat: resolvedDescFmt,
            defaultManufacturerEmail: resolvedMfgEmail,
            defaultManufacturerPhone: resolvedMfgPhone,
            defaultReturnPolicy: resolvedRetPolicy,
            defaultComplaintPolicy: resolvedCompPolicy,
            audit: auditObj
        };

        await injectedPrisma.$transaction(async (tx) => {
            if (shouldBeDefault) {
                await tx.integrationAccount.updateMany({
                    where: { workspaceId: cleanWsId, provider: 'VONHALSKY', isDefault: true, NOT: { id: targetId } },
                    data: { isDefault: false }
                });
            }
            if (isExistingRow) {
                await tx.integrationAccount.update({
                    where: { id: targetId },
                    data: {
                        label: nextLabel,
                        externalAccountId: resolvedOrgId || null,
                        environment,
                        isDefault: shouldBeDefault ? true : existing.isDefault,
                        credentialsEnc: enc,
                        metadata: metaPayload
                    }
                });
            } else {
                await tx.integrationAccount.create({
                    data: {
                        id: targetId,
                        workspaceId: cleanWsId,
                        provider: 'VONHALSKY',
                        label: nextLabel,
                        externalAccountId: resolvedOrgId || null,
                        environment,
                        isDefault: shouldBeDefault,
                        isActive: true,
                        credentialsEnc: enc,
                        metadata: metaPayload
                    }
                });
            }
        });

        for (const k of tokenCache.keys()) {
            if (k.startsWith(`${cleanWsId}:`)) tokenCache.delete(k);
        }
        for (const k of tokenInflight.keys()) {
            if (k.startsWith(`${cleanWsId}:`)) tokenInflight.delete(k);
        }

        return getPublicConfig(injectedPrisma, { workspaceId: cleanWsId, accountId: targetId });
    }

    const storedPayload = {
        version: 1,
        environment,
        apiBaseUrl: resolvedApiBase,
        tokenUrl: resolvedTokenUrl,
        clientId: nextClientId,
        clientSecretEnc: nextClientSecretPlain ? encryptSecret(nextClientSecretPlain) : '',
        organizationId: resolvedOrgId,
        organizationName: resolvedOrgName,
        scope: resolvedScope,
        defaultDaysToShip: safeDays,
        defaultDescriptionFormat: resolvedDescFmt,
        defaultManufacturerEmail: resolvedMfgEmail,
        defaultManufacturerPhone: resolvedMfgPhone,
        defaultReturnPolicy: resolvedRetPolicy,
        defaultComplaintPolicy: resolvedCompPolicy,
        audit: auditObj
    };

    await injectedPrisma.systemSetting.upsert({
        where: { key: VONHALSKY_VAULT_KEY },
        update: { value: JSON.stringify(storedPayload) },
        create: { key: VONHALSKY_VAULT_KEY, value: JSON.stringify(storedPayload) }
    });

    // Unieważniamy cache tokenów po zmianie konfiguracji
    tokenCache.clear();
    tokenInflight.clear();

    return getPublicConfig(injectedPrisma);
}

/**
 * Pobiera token Bearer OAuth 2.1 (grant_type=client_credentials) z cache (izolowanego per workspace+account+scope) i deduplikacją zapytań.
 */
async function getAccessToken({ forceRefresh = false, configOverride = null, scopeOverride = null, httpClient = axios, injectedPrisma = prisma, workspaceId = null, accountId = null } = {}) {
    const cfg = configOverride || await getConfig(injectedPrisma, { workspaceId, accountId });
    if (!cfg.clientId || !cfg.clientSecret) {
        const err = new Error('Brak skonfigurowanych danych dostępowych InPost Von Halsky (Client ID / Client Secret). Uzupełnij je w Panelu Administracyjnym -> Integracje API.');
        err.statusCode = 412;
        err.code = 'VONHALSKY_NOT_CONFIGURED';
        throw err;
    }

    const effectiveScope = trimOrNull(scopeOverride) || cfg.scope || '';
    const wsKey = cfg.workspaceId || workspaceId || 'legacy';
    const accKey = cfg.accountId || accountId || 'default';
    const cacheKey = `${wsKey}:${accKey}|${cfg.environment}|${cfg.tokenUrl}|${cfg.clientId}|${effectiveScope}`;
    const now = Date.now();

    if (!forceRefresh) {
        const cached = tokenCache.get(cacheKey);
        if (cached && cached.expiresAtMs - 60000 > now) {
            return cached.accessToken;
        }
        if (tokenInflight.has(cacheKey)) {
            return tokenInflight.get(cacheKey);
        }
    }

    const fetchPromise = (async () => {
        try {
            const params = new URLSearchParams();
            params.append('grant_type', 'client_credentials');
            params.append('client_id', cfg.clientId);
            params.append('client_secret', cfg.clientSecret);
            if (effectiveScope) {
                params.append('scope', effectiveScope);
            }

            const response = await httpClient.post(cfg.tokenUrl, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Accept': 'application/json',
                    'User-Agent': VONHALSKY_USER_AGENT
                },
                timeout: 15000
            });

            const data = response?.data || {};
            const accessToken = trimOrNull(data.access_token);
            if (!accessToken) {
                const err = new Error('Serwer OAuth2 InPost Von Halsky nie zwrócił pola access_token.');
                err.statusCode = 502;
                err.code = 'VONHALSKY_AUTH_NO_TOKEN';
                throw err;
            }

            const expiresInSec = Number(data.expires_in) > 0 ? Number(data.expires_in) : 300;
            tokenCache.set(cacheKey, {
                accessToken,
                expiresAtMs: Date.now() + (expiresInSec * 1000),
                scope: data.scope || effectiveScope
            });
            return accessToken;
        } catch (err) {
            throw buildVonHalskyApiError(err, 'Nie udało się pobrać tokena OAuth2 z InPost Von Halsky.');
        } finally {
            tokenInflight.delete(cacheKey);
        }
    })();

    tokenInflight.set(cacheKey, fetchPromise);
    return fetchPromise;
}

/**
 * Wspólny wywoływacz HTTP dla InPost Von Halsky API z obsługą:
 * - automatycznego Bearer OAuth2 + 1x retry po 401
 * - retry po 429 Too Many Requests z poszanowaniem nagłówka Retry-After
 * - domyślnego Accept-Language: pl
 */
async function apiRequest({
    method = 'GET',
    path,
    params = undefined,
    data = undefined,
    headers = {},
    acceptLanguage = 'pl',
    timeout = 25000,
    configOverride = null,
    scopeOverride = null,
    workspaceId = null,
    accountId = null,
    httpClient = axios,
    injectedPrisma = prisma,
    _retryAuth = false,
    _retryRateLimitCount = 0
} = {}) {
    const cfg = configOverride || await getConfig(injectedPrisma, { workspaceId, accountId });
    const token = await getAccessToken({
        forceRefresh: _retryAuth,
        configOverride: cfg,
        scopeOverride,
        workspaceId: cfg.workspaceId || workspaceId,
        accountId: cfg.accountId || accountId,
        httpClient,
        injectedPrisma
    });

    const baseUrl = String(cfg.apiBaseUrl || '').replace(/\/+$/, '');
    const cleanPath = String(path || '').startsWith('/') ? path : `/${path}`;
    const url = `${baseUrl}${cleanPath}`;

    const reqHeaders = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Accept-Language': acceptLanguage || 'pl',
        'User-Agent': VONHALSKY_USER_AGENT,
        ...headers
    };

    try {
        const res = await httpClient.request({
            method,
            url,
            params,
            data,
            headers: reqHeaders,
            timeout
        });
        return {
            status: res.status,
            data: res.data,
            headers: res.headers || {}
        };
    } catch (err) {
        const status = err?.response?.status;
        if (status === 401 && !_retryAuth) {
            return apiRequest({
                method,
                path,
                params,
                data,
                headers,
                acceptLanguage,
                timeout,
                configOverride: cfg,
                scopeOverride,
                workspaceId: cfg.workspaceId || workspaceId,
                accountId: cfg.accountId || accountId,
                httpClient,
                injectedPrisma,
                _retryAuth: true,
                _retryRateLimitCount
            });
        }
        if (status === 429 && _retryRateLimitCount < 2) {
            const waitMs = parseRetryAfterMs(err.response?.headers?.['retry-after']);
            await sleep(waitMs);
            return apiRequest({
                method,
                path,
                params,
                data,
                headers,
                acceptLanguage,
                timeout,
                configOverride: cfg,
                scopeOverride,
                workspaceId: cfg.workspaceId || workspaceId,
                accountId: cfg.accountId || accountId,
                httpClient,
                injectedPrisma,
                _retryAuth,
                _retryRateLimitCount: _retryRateLimitCount + 1
            });
        }
        throw buildVonHalskyApiError(err, `Błąd API InPost Von Halsky (${method} ${cleanPath}).`);
    }
}

async function getOrganizations(opts = {}) {
    const res = await apiRequest({ method: 'GET', path: '/v1/organizations', ...opts });
    return Array.isArray(res.data) ? res.data : [];
}

/**
 * Weryfikuje połączenie (OAuth2 + GET /v1/organizations) przed lub po zapisaniu konfiguracji.
 */
async function verifyConnection(candidateOverride = null, { httpClient = axios, injectedPrisma = prisma, workspaceId = null, accountId = null } = {}) {
    try {
        const effWsId = workspaceId || candidateOverride?.workspaceId || null;
        const effAccId = accountId || candidateOverride?.accountId || null;
        const baseCfg = await getConfig(injectedPrisma, { workspaceId: effWsId, accountId: effAccId });
        let cfg = baseCfg;
        if (candidateOverride && typeof candidateOverride === 'object') {
            const effEnv = normalizeEnvironment(candidateOverride.environment || baseCfg.environment);
            const preset = getEnvDefaults(effEnv);
            cfg = {
                ...baseCfg,
                environment: effEnv,
                apiBaseUrl: trimOrNull(candidateOverride.apiBaseUrl) || preset.apiBaseUrl,
                tokenUrl: trimOrNull(candidateOverride.tokenUrl) || preset.tokenUrl,
                clientId: trimOrNull(candidateOverride.clientId) || baseCfg.clientId,
                clientSecret: trimOrNull(candidateOverride.clientSecret) || baseCfg.clientSecret,
                scope: trimOrNull(candidateOverride.scope) || baseCfg.scope
            };
        }

        if (!cfg.clientId || !cfg.clientSecret) {
            return {
                ok: false,
                errorCode: 'VONHALSKY_NOT_CONFIGURED',
                errorMessage: 'Brak Client ID lub Client Secret. Uzupełnij dane z InPost API Portal, aby przetestować połączenie.',
                organizations: []
            };
        }

        const orgs = await getOrganizations({
            configOverride: cfg,
            workspaceId: effWsId,
            accountId: effAccId,
            httpClient,
            injectedPrisma
        });
        return {
            ok: true,
            environment: cfg.environment,
            apiBaseUrl: cfg.apiBaseUrl,
            organizations: orgs.map(o => ({
                id: o.id,
                name: o.name,
                type: o.type,
                status: o.status,
                operationalRegion: o.operationalRegion || null
            }))
        };
    } catch (err) {
        return {
            ok: false,
            errorCode: err.code || `HTTP_${err.statusCode || 500}`,
            errorMessage: err.message || 'Nie udało się połączyć z API InPost Von Halsky.',
            organizations: []
        };
    }
}

/**
 * Spłaszcza drzewo kategorii z `GET /v1/categories` do listy liści z pełną ścieżką nawigacyjną.
 */
function flattenCategoryTree(nodes = [], parentTrail = [], outLeaves = [], byId = new Map()) {
    for (const node of (Array.isArray(nodes) ? nodes : [])) {
        if (!node || !node.id) continue;
        const trail = [...parentTrail, node.name || node.id];
        const pathLabel = trail.join(' > ');
        const entry = {
            id: String(node.id),
            name: node.name || '',
            path: pathLabel,
            leaf: Boolean(node.leaf),
            doesNotRequireGpsrInfo: Boolean(node.doesNotRequireGpsrInfo),
            description: node.description || ''
        };
        byId.set(entry.id, entry);
        if (entry.leaf) {
            outLeaves.push(entry);
        }
        if (Array.isArray(node.children) && node.children.length > 0) {
            flattenCategoryTree(node.children, trail, outLeaves, byId);
        }
    }
    return { flatLeaves: outLeaves, byId };
}

async function getCategories({ categoryId = null, depth = 10, forceRefresh = false, configOverride = null, workspaceId = null, accountId = null, httpClient = axios, injectedPrisma = prisma } = {}) {
    const cfg = configOverride || await getConfig(injectedPrisma, { workspaceId, accountId });
    const cacheKey = `${cfg.environment}:${cfg.apiBaseUrl}:${categoryId || 'ROOT'}:${depth}`;
    const cached = categoryTreeCache.get(cacheKey);
    if (!forceRefresh && cached && (Date.now() - cached.fetchedAtMs) < CATEGORY_CACHE_TTL_MS) {
        return cached;
    }

    const params = { depth };
    if (categoryId) params.categoryId = categoryId;

    const res = await apiRequest({
        method: 'GET',
        path: '/v1/categories',
        params,
        configOverride: cfg,
        workspaceId: cfg.workspaceId || workspaceId,
        accountId: cfg.accountId || accountId,
        httpClient,
        injectedPrisma
    });

    const tree = Array.isArray(res.data) ? res.data : [];
    const { flatLeaves, byId } = flattenCategoryTree(tree);
    const record = { fetchedAtMs: Date.now(), tree, flatLeaves, byId };
    categoryTreeCache.set(cacheKey, record);
    return record;
}

async function getCategoryDetails(categoryId, opts = {}) {
    const res = await apiRequest({
        method: 'GET',
        path: `/v1/categories/${encodeURIComponent(categoryId)}`,
        params: { depth: 0 },
        ...opts
    });
    return res.data;
}

async function getCategoryAttributes(categoryId, { forceRefresh = false, configOverride = null, workspaceId = null, accountId = null, httpClient = axios, injectedPrisma = prisma } = {}) {
    const cfg = configOverride || await getConfig(injectedPrisma, { workspaceId, accountId });
    const cacheKey = `${cfg.environment}:${cfg.apiBaseUrl}:${categoryId}`;
    const cached = categoryAttrCache.get(cacheKey);
    if (!forceRefresh && cached && (Date.now() - cached.fetchedAtMs) < ATTR_CACHE_TTL_MS) {
        return cached.attributes;
    }

    const res = await apiRequest({
        method: 'GET',
        path: `/v1/categories/${encodeURIComponent(categoryId)}/attributes`,
        configOverride: cfg,
        workspaceId: cfg.workspaceId || workspaceId,
        accountId: cfg.accountId || accountId,
        httpClient,
        injectedPrisma
    });

    const attributes = Array.isArray(res.data) ? res.data : [];
    categoryAttrCache.set(cacheKey, { fetchedAtMs: Date.now(), attributes });
    return attributes;
}

async function getOfferHints({ organizationId, ean = '', mpn = '', name = '', limit = 10, offset = 0, ...opts } = {}) {
    const params = { limit, offset };
    if (trimOrNull(ean)) params.ean = trimOrNull(ean);
    if (trimOrNull(mpn)) params.mpn = trimOrNull(mpn);
    if (trimOrNull(name)) params.name = trimOrNull(name);

    const res = await apiRequest({
        method: 'GET',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers/hint`,
        params,
        ...opts
    });
    return {
        page: res.data?.page || null,
        data: Array.isArray(res.data?.data) ? res.data.data : []
    };
}

async function listOffers({ organizationId, offerStatus = null, limit = 30, offset = 0, sort = ['-updatedAt'], ...opts } = {}) {
    const params = {
        limit: Math.min(Math.max(Number(limit) || 10, 1), 30),
        offset: Math.max(Number(offset) || 0, 0),
        sort
    };
    if (Array.isArray(offerStatus) && offerStatus.length > 0) {
        params.offerStatus = offerStatus;
    }
    const res = await apiRequest({
        method: 'GET',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers`,
        params,
        ...opts
    });
    return {
        page: res.data?.page || null,
        data: Array.isArray(res.data?.data) ? res.data.data : []
    };
}

/**
 * Wyszukuje istniejące oferty organizacji dopasowane po EAN, SKU lub externalId (stronicowanie do `maxPages`).
 */
async function findExistingOffersForProduct({
    organizationId,
    ean = '',
    sku = '',
    externalId = '',
    maxPages = 5,
    ...opts
} = {}) {
    const cleanEan = trimOrNull(ean) || '';
    const cleanSku = trimOrNull(sku)?.toLowerCase() || '';
    const cleanExt = trimOrNull(externalId)?.toLowerCase() || '';

    const matches = [];
    const seenIds = new Set();
    const limit = 30;

    for (let pageIdx = 0; pageIdx < maxPages; pageIdx++) {
        const res = await listOffers({
            organizationId,
            limit,
            offset: pageIdx * limit,
            sort: ['-updatedAt'],
            ...opts
        });

        const items = res.data || [];
        for (const item of items) {
            const offer = item?.offer || item;
            if (!offer || !offer.id || seenIds.has(offer.id)) continue;

            const oEan = trimOrNull(offer.product?.ean) || '';
            const oSku = trimOrNull(offer.product?.sku)?.toLowerCase() || '';
            const oExt = trimOrNull(offer.externalId)?.toLowerCase() || '';

            let matchReason = null;
            if (cleanEan && oEan === cleanEan) matchReason = 'EAN';
            else if (cleanExt && oExt === cleanExt) matchReason = 'EXTERNAL_ID';
            else if (cleanSku && (oSku === cleanSku || oExt === cleanSku)) matchReason = 'SKU';

            if (matchReason) {
                seenIds.add(offer.id);
                matches.push({
                    id: offer.id,
                    status: offer.status,
                    externalId: offer.externalId || null,
                    name: offer.product?.name || '',
                    ean: offer.product?.ean || null,
                    sku: offer.product?.sku || null,
                    categoryId: offer.product?.categoryId || null,
                    priceAmount: offer.price?.grossPrice?.amount ?? null,
                    currency: offer.price?.grossPrice?.currency || 'PLN',
                    stockQuantity: offer.stock?.quantity ?? null,
                    updatedAt: offer.updatedAt || null,
                    matchReason,
                    validationErrors: item?.metadata?.validationErrors || [],
                    rejectionReasons: item?.metadata?.rejectionReasons || []
                });
            }
        }

        const total = Number(res.page?.total || 0);
        if (items.length < limit || (pageIdx + 1) * limit >= total) {
            break;
        }
    }

    return matches;
}

async function getOfferDetails(organizationId, offerId, opts = {}) {
    const res = await apiRequest({
        method: 'GET',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}`,
        ...opts
    });
    return res.data; // { metadata, offer }
}

/**
 * Tworzy nową ofertę: POST /v1/organizations/{organizationId}/offers (`application/json`).
 */
async function createOffer(organizationId, offerProposal, opts = {}) {
    const res = await apiRequest({
        method: 'POST',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers`,
        data: offerProposal,
        headers: { 'Content-Type': 'application/json' },
        ...opts
    });
    return res.data; // { commandId, offerId, externalId }
}

/**
 * Częściowo aktualizuje ofertę: PATCH /v1/organizations/{organizationId}/offers/{offerId}
 * ZGODNIE Z OPENAPI v1.7.12: wymagany nagłówek `Content-Type: application/merge-patch+json`!
 */
async function patchOffer(organizationId, offerId, offerPatch, opts = {}) {
    const res = await apiRequest({
        method: 'PATCH',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}`,
        data: offerPatch,
        headers: { 'Content-Type': 'application/merge-patch+json' },
        ...opts
    });
    return res.data; // { metadata, offer }
}

/**
 * Częściowo aktualizuje atrybuty oferty: PATCH /v1/organizations/{organizationId}/offers/{offerId}/attributes (`application/json`).
 */
async function patchOfferAttributes(organizationId, offerId, operations = [], opts = {}) {
    const res = await apiRequest({
        method: 'PATCH',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/attributes`,
        data: { operations },
        headers: { 'Content-Type': 'application/json' },
        ...opts
    });
    return res.data; // { commandId, offerId, status }
}

async function getOfferAttachments(organizationId, offerId, { limit = 30, offset = 0, ...opts } = {}) {
    const res = await apiRequest({
        method: 'GET',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/attachments`,
        params: { limit, offset },
        ...opts
    });
    return {
        page: res.data?.page || null,
        data: Array.isArray(res.data?.data) ? res.data.data : []
    };
}

/**
 * Wgrywa binarny załącznik oferty (np. zdjęcie z Base64/HTTP):
 * POST /v1/organizations/{organizationId}/offers/{offerId}/attachments?attachmentType=IMAGE&priority=N
 */
async function uploadOfferAttachment(organizationId, offerId, {
    buffer,
    fileName = 'product_image.jpg',
    contentType = 'image/jpeg',
    attachmentType = 'IMAGE',
    priority = undefined,
    ...opts
} = {}) {
    const form = new FormData();
    form.append('file', buffer, { filename: fileName, contentType });

    const params = { attachmentType };
    if (Number.isInteger(priority) && priority >= 1 && priority <= 1000) {
        params.priority = priority;
    }

    const res = await apiRequest({
        method: 'POST',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/attachments`,
        params,
        data: form,
        headers: form.getHeaders(),
        timeout: 40000,
        ...opts
    });
    return res.data; // { commandId, status }
}

/**
 * Konwertuje źródło obrazu (`data:image/...` lub `http(s)://...`) do bufora JPEG/PNG i wgrywa jako załącznik IMAGE.
 */
async function uploadImageSourceAsAttachment(organizationId, offerId, {
    source,
    fileName = 'product_image.jpg',
    priority = undefined,
    httpClient = axios,
    ...opts
} = {}) {
    let buffer;
    let contentType = 'image/jpeg';

    if (typeof source === 'string' && source.startsWith('data:image/')) {
        const match = source.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
        if (!match) {
            throw new Error(`Nieprawidłowy format obrazu DataURI dla pliku ${fileName}.`);
        }
        contentType = match[1].toLowerCase();
        buffer = Buffer.from(match[2], 'base64');
    } else if (typeof source === 'string' && /^https?:\/\//i.test(source)) {
        const dl = await httpClient.get(source, { responseType: 'arraybuffer', timeout: 20000 });
        buffer = Buffer.from(dl.data);
        contentType = String(dl.headers?.['content-type'] || 'image/jpeg').split(';')[0].trim();
    } else {
        throw new Error(`Nieobsługiwane źródło obrazu do uploadu binarnego: ${fileName}`);
    }

    // Normalizujemy WebP/nietypowe formaty lub zbyt duże pliki (> 5 MB) przez sharp do czystego JPEG
    if (!['image/jpeg', 'image/png'].includes(contentType) || buffer.length > 5 * 1024 * 1024) {
        try {
            buffer = await sharp(buffer).jpeg({ quality: 90 }).toBuffer();
            contentType = 'image/jpeg';
            if (!/\.jpe?g$/i.test(fileName)) {
                fileName = fileName.replace(/\.[^.]+$/, '') + '.jpg';
            }
        } catch (sharpErr) {
            console.warn(`[VonHalskyService] Pominięto konwersję sharp dla ${fileName}: ${sharpErr.message}`);
        }
    }

    return uploadOfferAttachment(organizationId, offerId, {
        buffer,
        fileName,
        contentType,
        attachmentType: 'IMAGE',
        priority,
        httpClient,
        ...opts
    });
}

async function updateAttachmentsPriority(organizationId, offerId, priorities = [], opts = {}) {
    const res = await apiRequest({
        method: 'PUT',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/attachments/priority`,
        data: priorities,
        headers: { 'Content-Type': 'application/json' },
        ...opts
    });
    return res.data;
}

async function deleteOfferAttachment(organizationId, offerId, attachmentId, opts = {}) {
    await apiRequest({
        method: 'DELETE',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers/${encodeURIComponent(offerId)}/attachments/${encodeURIComponent(attachmentId)}`,
        ...opts
    });
    return { deleted: true };
}

async function getCommandStatus(organizationId, commandId, opts = {}) {
    const res = await apiRequest({
        method: 'GET',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers/commands/${encodeURIComponent(commandId)}`,
        ...opts
    });
    return res.data; // { commandId, status: PENDING|SUCCESS|FAILURE, errors?: [...] }
}

/**
 * Odpytuje status asynchronicznej komendy oferty do zakończenia (SUCCESS/FAILURE) lub bezpiecznego limitu prób.
 */
async function pollCommandStatus(organizationId, commandId, { maxAttempts = 6, intervalMs = 1500, ...opts } = {}) {
    let lastStatus = { commandId, status: 'PENDING', errors: [] };
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            lastStatus = await getCommandStatus(organizationId, commandId, opts);
            if (lastStatus?.status === 'SUCCESS' || lastStatus?.status === 'FAILURE') {
                return lastStatus;
            }
        } catch (err) {
            if (attempt === maxAttempts) {
                return {
                    commandId,
                    status: 'PENDING_TIMEOUT',
                    errors: [{ message: `Nie udało się pobrać końcowego statusu komendy: ${err.message}` }]
                };
            }
        }
        if (attempt < maxAttempts) {
            await sleep(intervalMs);
        }
    }
    return {
        ...lastStatus,
        status: lastStatus?.status === 'PENDING' ? 'PENDING_TIMEOUT' : (lastStatus?.status || 'PENDING_TIMEOUT')
    };
}

async function getDepositTypes(opts = {}) {
    const res = await apiRequest({
        method: 'GET',
        path: '/v1/offers/deposit-types',
        ...opts
    });
    return res.data;
}

/**
 * Zdarzenia ofert InPost Von Halsky (OpenAPI v1.7.12): CREATED, REJECTED, REOPENED, CLOSED, PUBLISHED, VALIDATION_FAILED, SOLDOUT, UPDATED.
 */
async function listOfferEvents({ organizationId, untilId = null, offerEventType = null, limit = 100, ...opts } = {}) {
    const params = {
        limit: Math.min(Math.max(Number(limit) || 100, 1), 1000)
    };
    if (trimOrNull(untilId)) params.untilId = trimOrNull(untilId);
    if (Array.isArray(offerEventType) && offerEventType.length > 0) {
        params.eventType = offerEventType;
    } else if (trimOrNull(offerEventType)) {
        params.eventType = [trimOrNull(offerEventType)];
    }

    const res = await apiRequest({
        method: 'GET',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/offers/events`,
        params,
        ...opts
    });
    return {
        data: Array.isArray(res.data?.data) ? res.data.data : []
    };
}

/**
 * Lista dostępnych kampanii cenowych InPost Von Halsky (np. PRICE_HIT / Cenowy Sztos).
 */
async function listCampaigns({ limit = 30, offset = 0, ...opts } = {}) {
    const params = {
        limit: Math.min(Math.max(Number(limit) || 30, 1), 30),
        offset: Math.max(Number(offset) || 0, 0)
    };
    const res = await apiRequest({
        method: 'GET',
        path: '/v1/campaigns',
        params,
        ...opts
    });
    return {
        page: res.data?.page || null,
        data: Array.isArray(res.data?.data) ? res.data.data : []
    };
}

/**
 * Deklaracje udziału ofert organizacji w programie cenowym i kampaniach.
 */
async function listCampaignDeclarations({ organizationId, limit = 30, offset = 0, offerIds = null, ...opts } = {}) {
    const params = {
        limit: Math.min(Math.max(Number(limit) || 30, 1), 30),
        offset: Math.max(Number(offset) || 0, 0)
    };
    if (Array.isArray(offerIds) && offerIds.length > 0) {
        params.offerIds = offerIds;
    }
    const res = await apiRequest({
        method: 'GET',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/campaigns/declarations`,
        params,
        ...opts
    });
    return {
        page: res.data?.page || null,
        data: Array.isArray(res.data?.data) ? res.data.data : []
    };
}

/**
 * Lista zamówień InPost Von Halsky (wymaga zakresu api:orders:read).
 */
async function listOrders({
    organizationId,
    orderStatus = null,
    paymentStatus = null,
    updatedAtGte = null,
    limit = 30,
    offset = 0,
    sort = ['-createdAt'],
    ...opts
} = {}) {
    const params = {
        limit: Math.min(Math.max(Number(limit) || 30, 1), 30),
        offset: Math.max(Number(offset) || 0, 0),
        sort
    };
    if (Array.isArray(orderStatus) && orderStatus.length > 0) params.orderStatus = orderStatus;
    if (Array.isArray(paymentStatus) && paymentStatus.length > 0) params.paymentStatus = paymentStatus;
    if (trimOrNull(updatedAtGte)) params.updatedAtGte = trimOrNull(updatedAtGte);

    const res = await apiRequest({
        method: 'GET',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/orders`,
        params,
        ...opts
    });
    return {
        page: res.data?.page || null,
        data: Array.isArray(res.data?.data) ? res.data.data : []
    };
}

/**
 * Zdarzenia zamówień InPost Von Halsky (CREATED, ACCEPTED, SHIPPED, REFUSED, CANCELLED, RETURN_CREATED).
 */
async function listOrderEvents({ organizationId, untilId = null, orderEventType = null, limit = 100, ...opts } = {}) {
    const params = {
        limit: Math.min(Math.max(Number(limit) || 100, 1), 1000)
    };
    if (trimOrNull(untilId)) params.untilId = trimOrNull(untilId);
    if (Array.isArray(orderEventType) && orderEventType.length > 0) {
        params.eventType = orderEventType;
    } else if (trimOrNull(orderEventType)) {
        params.eventType = [trimOrNull(orderEventType)];
    }

    const res = await apiRequest({
        method: 'GET',
        path: `/v1/organizations/${encodeURIComponent(organizationId)}/orders/events`,
        params,
        ...opts
    });
    return {
        data: Array.isArray(res.data?.data) ? res.data.data : []
    };
}

/**
 * Zwroty konsumenckie v2 (wymaga zakresu api:orders:read).
 */
async function listReturnsV2({ organizationId, status = null, limit = 30, offset = 0, ...opts } = {}) {
    const params = {
        limit: Math.min(Math.max(Number(limit) || 30, 1), 30),
        offset: Math.max(Number(offset) || 0, 0)
    };
    if (Array.isArray(status) && status.length > 0) params.status = status;

    const res = await apiRequest({
        method: 'GET',
        path: `/v2/organizations/${encodeURIComponent(organizationId)}/returns`,
        params,
        ...opts
    });
    return {
        page: res.data?.page || null,
        items: Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data?.data) ? res.data.data : [])
    };
}

/**
 * Reklamacje v2 (wymaga zakresu api:orders:read).
 */
async function listClaimsV2({
    organizationId,
    states = null,
    submissionDateFrom = null,
    submissionDateTo = null,
    limit = 30,
    offset = 0,
    sort = ['-submission_date'],
    ...opts
} = {}) {
    const params = {
        limit: Math.min(Math.max(Number(limit) || 30, 1), 30),
        offset: Math.max(Number(offset) || 0, 0),
        sort
    };
    if (Array.isArray(states) && states.length > 0) params.states = states;
    if (trimOrNull(submissionDateFrom)) params.submissionDateFrom = trimOrNull(submissionDateFrom);
    if (trimOrNull(submissionDateTo)) params.submissionDateTo = trimOrNull(submissionDateTo);

    const res = await apiRequest({
        method: 'GET',
        path: `/v2/organizations/${encodeURIComponent(organizationId)}/claims`,
        params,
        ...opts
    });
    return {
        page: res.data?.page || null,
        items: Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data?.data) ? res.data.data : [])
    };
}

/**
 * Zwroty płatności (Refundy) v2 (wymaga zakresu api:orders:read).
 */
async function listRefundsV2({
    organizationId,
    caseStatus = null,
    refundPaymentStatus = null,
    submissionDateFrom = null,
    submissionDateTo = null,
    limit = 30,
    offset = 0,
    sortBy = null,
    sortOrder = 'DESC',
    ...opts
} = {}) {
    const params = {
        limit: Math.min(Math.max(Number(limit) || 30, 1), 30),
        offset: Math.max(Number(offset) || 0, 0)
    };
    if (trimOrNull(caseStatus)) params.status = trimOrNull(caseStatus);
    if (trimOrNull(refundPaymentStatus)) params.refundPaymentStatus = trimOrNull(refundPaymentStatus);
    if (trimOrNull(submissionDateFrom)) params.submissionDateFrom = trimOrNull(submissionDateFrom);
    if (trimOrNull(submissionDateTo)) params.submissionDateTo = trimOrNull(submissionDateTo);
    if (trimOrNull(sortBy)) params.sortBy = trimOrNull(sortBy);
    if (trimOrNull(sortOrder)) params.sortOrder = trimOrNull(sortOrder);

    const res = await apiRequest({
        method: 'GET',
        path: `/v2/organizations/${encodeURIComponent(organizationId)}/refunds`,
        params,
        ...opts
    });
    return {
        page: res.data?.page || null,
        items: Array.isArray(res.data?.items) ? res.data.items : (Array.isArray(res.data?.data) ? res.data.data : [])
    };
}

/**
 * Pobiera słowniki posprzedażowe v2 (z defensywną obsługą błędów per słownik).
 */
async function getPostSalesDictionaries(opts = {}) {
    const dictPaths = {
        claimTypes: '/v2/dictionaries/claim-types',
        refundReasons: '/v2/dictionaries/refund-reasons',
        returnRejectReasons: '/v2/dictionaries/return-reject-reasons',
        claimRejectReasons: '/v2/dictionaries/claim-reject-reasons'
    };
    const out = {};
    const entries = await Promise.allSettled(
        Object.entries(dictPaths).map(async ([key, path]) => {
            const res = await apiRequest({ method: 'GET', path, ...opts });
            return [key, res.data?.data || res.data || []];
        })
    );
    for (const settled of entries) {
        if (settled.status === 'fulfilled') {
            const [k, v] = settled.value;
            out[k] = v;
        }
    }
    return out;
}

function clearCaches() {
    tokenCache.clear();
    tokenInflight.clear();
    categoryTreeCache.clear();
    categoryAttrCache.clear();
}

module.exports = {
    VONHALSKY_VAULT_KEY,
    ENVIRONMENTS,
    DEFAULT_SCOPES,
    normalizeEnvironment,
    getEnvDefaults,
    maskClientId,
    buildVonHalskyApiError,
    getConfig,
    getPublicConfig,
    listAccounts,
    deleteAccount,
    saveConfig,
    getAccessToken,
    apiRequest,
    getOrganizations,
    verifyConnection,
    flattenCategoryTree,
    getCategories,
    getCategoryDetails,
    getCategoryAttributes,
    getOfferHints,
    listOffers,
    findExistingOffersForProduct,
    getOfferDetails,
    createOffer,
    patchOffer,
    patchOfferAttributes,
    getOfferAttachments,
    uploadOfferAttachment,
    uploadImageSourceAsAttachment,
    updateAttachmentsPriority,
    deleteOfferAttachment,
    getCommandStatus,
    pollCommandStatus,
    getDepositTypes,
    listOfferEvents,
    listCampaigns,
    listCampaignDeclarations,
    listOrders,
    listOrderEvents,
    listReturnsV2,
    listClaimsV2,
    listRefundsV2,
    getPostSalesDictionaries,
    clearCaches
};
