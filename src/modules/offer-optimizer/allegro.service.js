const axios = require('axios');
const crypto = require('crypto');
const sharp = require('sharp');
const dotenv = require('dotenv');
dotenv.config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
    encryptSecret,
    decryptSecret,
    encryptSecretWithAad,
    decryptSecretWithAad,
    buildIntegrationAad
} = require('../../utils/secretVault');
const { isAllegroHostedImageUrl, normalizeOfferImageUrls } = require('../../utils/allegro_mapper');

const ALLEGRO_VAULT_KEY = 'ALLEGRO_ACCOUNTS_VAULT';
const ALLEGRO_COMPOSITION_UNSUPPORTED_KEY = 'ALLEGRO_COMPOSITION_UNSUPPORTED_CATEGORIES';
const ALLEGRO_COMPOSITION_UNSUPPORTED_TTL_MS = 24 * 60 * 60 * 1000;
const ALLEGRO_USER_AGENT = 'NexusSentinelv2/2.0 (+http://n-e-s.pl)';

const apiClient = axios.create();

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response && error.response.status === 401 && originalRequest && !originalRequest._retry) {
            if (originalRequest.url && (originalRequest.url.includes('/auth/oauth/token') || originalRequest.url.includes('/auth/oauth/device'))) {
                return Promise.reject(error);
            }
            originalRequest._retry = true;
            const targetAccountId = originalRequest._allegroAccountId || null;
            const targetWorkspaceId = originalRequest._allegroWorkspaceId || null;
            console.log(`[AllegroService] Otrzymano 401 Unauthorized z API Allegro (workspace: ${targetWorkspaceId || 'legacy'}, konto: ${targetAccountId || 'domyślne'}). Wymuszam odswiezenie tokena (forceRefresh)...`);
            try {
                const newToken = await getAllegroToken(true, targetAccountId, prisma, targetWorkspaceId);
                originalRequest.headers['Authorization'] = 'Bearer ' + newToken;
                return apiClient(originalRequest);
            } catch (refreshError) {
                console.error('[AllegroService] Odswiezenie tokena zawiodlo po 401.');
                return Promise.reject(refreshError);
            }
        }
        return Promise.reject(error);
    }
);


/**
 * Serwis integrujacy oficjalne API Allegro (obsluga wielu kont sprzedawcow pod jednym CLIENT_ID)
 * Wymaga podania ALLEGRO_CLIENT_ID oraz ALLEGRO_CLIENT_SECRET w pliku .env
 */

const tokenCacheByAccount = new Map(); // accountKey -> { token, expiry }
const tokenRefreshPromises = new Map(); // accountKey -> Promise<string>
const uploadedImageCache = new Map(); // sha256 -> { url, expiresAt }
const unsupportedCompositionCategoryCache = new Map(); // categoryId -> { expiresAtMs, reason, updatedAt }

/**
 * Rozpoznaje błąd Allegro 422 informujący, że docelowa kategoria produktu nie obsługuje jeszcze pola `productSet[].composition`.
 */
function isAllegroCompositionCategoryError(error) {
    if (!error) return false;
    const status = error.statusCode || error.response?.status || null;
    if (status !== null && status !== 422 && status !== 400) {
        return false;
    }

    const patterns = [
        /nie\s+można\s+podać\s+składników\s+dla\s+kategorii/i,
        /nie\s+mozna\s+podac\s+skladnikow\s+dla\s+kategorii/i,
        /(?:cannot|can\s+not)\s+(?:provide|specify)\s+(?:ingredients|composition)\s+for\s+(?:product\s+)?category/i,
        /ingredients?\s+(?:cannot|can\s+not)\s+be\s+specified\s+for\s+(?:this\s+|the\s+|product\s+)?category/i,
        /composition.*not\s+(?:supported|allowed)\s+(?:for|in)\s+(?:this\s+|the\s+|product\s+)?category/i
    ];

    const matchesText = (text) => typeof text === 'string' && patterns.some(rx => rx.test(text));

    const allegroErrors = Array.isArray(error.allegroErrors)
        ? error.allegroErrors
        : (Array.isArray(error.response?.data?.errors) ? error.response.data.errors : []);

    for (const item of allegroErrors) {
        if (!item || typeof item !== 'object') continue;
        if (matchesText(item.userMessage) || matchesText(item.message) || matchesText(item.details) || matchesText(item.code)) {
            return true;
        }
    }

    return matchesText(error.message || '');
}

/**
 * Rozpoznaje błąd Allegro 422/400 dotyczący wyłącznie walidacji zawartości pola `composition`
 * (np. `Użyj języka odpowiedniego dla rynku... [offer.modules.composition.data.products[0].items[0].ingredients]`),
 * który dotyczy konkretnego składu produktu (np. deklaracji detergentu WE 648/2004), a nie blokady całej kategorii.
 */
function isAllegroCompositionValidationError(error) {
    if (!error) return false;
    const status = error.statusCode || error.response?.status || null;
    if (status !== null && status !== 422 && status !== 400) {
        return false;
    }

    const allegroErrors = Array.isArray(error.allegroErrors)
        ? error.allegroErrors
        : (Array.isArray(error.response?.data?.errors) ? error.response.data.errors : []);

    const isCompositionPath = (pathStr) => typeof pathStr === 'string' && /(?:offer\.modules\.composition|productSet(?:\[\d+\])?\.composition)/i.test(pathStr);

    if (allegroErrors.length > 0) {
        return allegroErrors.every(item => item && typeof item === 'object' && isCompositionPath(item.path));
    }

    return isCompositionPath(error.message || '');
}

/**
 * Rozpoznaje błąd Allegro 422/400 dotyczący wyłącznie pola tytułu oferty (`name` / `offer.name`),
 * np. gdy aukcja ma aktywne oferty/licytację lub zablokowaną zmianę nazwy na poziomie Allegro.
 */
function isAllegroTitleEditError(error) {
    if (!error) return false;
    const status = error.statusCode || error.response?.status || null;
    if (status !== null && status !== 422 && status !== 400) {
        return false;
    }

    const allegroErrors = Array.isArray(error.allegroErrors)
        ? error.allegroErrors
        : (Array.isArray(error.response?.data?.errors) ? error.response.data.errors : []);

    const isTitlePath = (pathStr) => typeof pathStr === 'string' && /^(?:offer\.)?name$/i.test(pathStr.trim());

    if (allegroErrors.length > 0) {
        return allegroErrors.every(item => item && typeof item === 'object' && isTitlePath(item.path));
    }

    return /\[(?:offer\.)?name\]/i.test(String(error.message || ''));
}

async function readUnsupportedCompositionCategoriesMap(injectedPrisma = prisma, nowMs = Date.now()) {
    const out = {};
    if (!injectedPrisma?.systemSetting || typeof injectedPrisma.systemSetting.findUnique !== 'function') {
        return out;
    }
    try {
        const rec = await injectedPrisma.systemSetting.findUnique({ where: { key: ALLEGRO_COMPOSITION_UNSUPPORTED_KEY } });
        if (rec?.value) {
            const parsed = JSON.parse(rec.value);
            const cats = parsed && typeof parsed.categories === 'object' && parsed.categories ? parsed.categories : {};
            for (const [catId, entry] of Object.entries(cats)) {
                if (entry && Number(entry.expiresAtMs) > nowMs) {
                    out[String(catId)] = entry;
                }
            }
        }
    } catch (err) {
        console.warn(`[AllegroService] Nie udało się odczytać cache kategorii composition: ${err.message}`);
    }
    return out;
}

async function writeUnsupportedCompositionCategoriesMap(categoriesMap, injectedPrisma = prisma) {
    if (!injectedPrisma?.systemSetting || typeof injectedPrisma.systemSetting.upsert !== 'function') {
        return;
    }
    try {
        await injectedPrisma.systemSetting.upsert({
            where: { key: ALLEGRO_COMPOSITION_UNSUPPORTED_KEY },
            update: { value: JSON.stringify({ version: 1, categories: categoriesMap }) },
            create: { key: ALLEGRO_COMPOSITION_UNSUPPORTED_KEY, value: JSON.stringify({ version: 1, categories: categoriesMap }) }
        });
    } catch (err) {
        console.warn(`[AllegroService] Nie udało się zapisać cache kategorii composition: ${err.message}`);
    }
}

/**
 * Sprawdza, czy kategoria Allegro jest w lokalnym cache TTL jako nieobsługująca `productSet[].composition`.
 */
async function getCategoryCompositionSupport(categoryId, { injectedPrisma = prisma, nowMs = Date.now(), skipMemoryCache = false } = {}) {
    const cleanCatId = categoryId ? String(categoryId).trim() : '';
    if (!cleanCatId) {
        return { supported: true, reason: null, cachedAt: null, expiresAt: null };
    }

    if (!skipMemoryCache) {
        const memEntry = unsupportedCompositionCategoryCache.get(cleanCatId);
        if (memEntry) {
            if (Number(memEntry.expiresAtMs) > nowMs) {
                return {
                    supported: false,
                    reason: memEntry.reason || null,
                    cachedAt: memEntry.updatedAt || null,
                    expiresAt: new Date(memEntry.expiresAtMs).toISOString()
                };
            }
            unsupportedCompositionCategoryCache.delete(cleanCatId);
        }
    }

    const dbMap = await readUnsupportedCompositionCategoriesMap(injectedPrisma, nowMs);
    for (const [k, v] of Object.entries(dbMap)) {
        unsupportedCompositionCategoryCache.set(k, v);
    }

    const dbEntry = dbMap[cleanCatId];
    if (dbEntry && Number(dbEntry.expiresAtMs) > nowMs) {
        return {
            supported: false,
            reason: dbEntry.reason || null,
            cachedAt: dbEntry.updatedAt || null,
            expiresAt: new Date(dbEntry.expiresAtMs).toISOString()
        };
    }

    return { supported: true, reason: null, cachedAt: null, expiresAt: null };
}

/**
 * Zapisuje kategorię Allegro w cache TTL (24h) jako nieobsługującą jeszcze `productSet[].composition`.
 */
async function markCategoryCompositionUnsupported(categoryId, reason = '', { injectedPrisma = prisma, ttlMs = ALLEGRO_COMPOSITION_UNSUPPORTED_TTL_MS, nowMs = Date.now() } = {}) {
    const cleanCatId = categoryId ? String(categoryId).trim() : '';
    if (!cleanCatId) return null;

    const entry = {
        expiresAtMs: nowMs + ttlMs,
        reason: String(reason || 'Kategoria Allegro nie obsługuje pola składu produktu (composition).').slice(0, 350),
        updatedAt: new Date(nowMs).toISOString()
    };
    unsupportedCompositionCategoryCache.set(cleanCatId, entry);

    const dbMap = await readUnsupportedCompositionCategoriesMap(injectedPrisma, nowMs);
    dbMap[cleanCatId] = entry;
    await writeUnsupportedCompositionCategoriesMap(dbMap, injectedPrisma);
    return entry;
}

/**
 * Usuwa kategorię z cache nieobsługiwanych (np. gdy Allegro uruchomi wsparcie składu i PATCH przejdzie).
 */
async function clearCategoryCompositionUnsupported(categoryId, { injectedPrisma = prisma, nowMs = Date.now() } = {}) {
    const cleanCatId = categoryId ? String(categoryId).trim() : '';
    if (!cleanCatId) return;

    unsupportedCompositionCategoryCache.delete(cleanCatId);
    const dbMap = await readUnsupportedCompositionCategoriesMap(injectedPrisma, nowMs);
    if (Object.prototype.hasOwnProperty.call(dbMap, cleanCatId)) {
        delete dbMap[cleanCatId];
        await writeUnsupportedCompositionCategoriesMap(dbMap, injectedPrisma);
    }
}

function buildAllegroHeaders(token, extra = {}) {
    return {
        'User-Agent': ALLEGRO_USER_AGENT,
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.allegro.public.v1+json',
        ...extra
    };
}

/**
 * Odczytuje zaszyfrowany rejestr kont Allegro:
 * - Jeśli podano `workspaceId` i tabela `IntegrationAccount` jest dostępna -> wyłącznie z `IntegrationAccount` (z AAD i bez dziedziczenia SystemSetting między klientami!).
 * - W trybie legacy/unit-test (`workspaceId === null`) -> z `SystemSetting.ALLEGRO_ACCOUNTS_VAULT` (z fallbackiem do starych kluczy).
 */
async function readAllegroAccountsVault(injectedPrisma = prisma, workspaceId = null) {
    const cleanWsId = workspaceId ? String(workspaceId).trim() : null;
    if (cleanWsId && injectedPrisma?.integrationAccount && typeof injectedPrisma.integrationAccount.findMany === 'function') {
        const rows = await injectedPrisma.integrationAccount.findMany({
            where: { workspaceId: cleanWsId, provider: 'ALLEGRO', isActive: true },
            orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
        });
        const accounts = {};
        let defaultAccountId = null;

        for (const row of rows) {
            let creds = {};
            try {
                if (row.credentialsEnc) {
                    const plain = decryptSecretWithAad(
                        row.credentialsEnc,
                        buildIntegrationAad(cleanWsId, 'ALLEGRO', row.id)
                    );
                    creds = JSON.parse(plain || '{}');
                }
            } catch (err) {
                console.error(`[AllegroService] Błąd deszyfrowania konta Allegro ${row.id} w workspace ${cleanWsId}:`, err.message);
                continue;
            }
            const meta = (row.metadata && typeof row.metadata === 'object') ? row.metadata : {};
            const keyId = String(row.externalAccountId || row.id);
            accounts[keyId] = {
                integrationAccountId: row.id,
                accountId: keyId,
                externalAccountId: row.externalAccountId || null,
                workspaceId: cleanWsId,
                label: row.label || `Konto #${keyId}`,
                login: meta.login || null,
                email: meta.email || null,
                companyName: meta.companyName || null,
                accessToken: creds.accessToken || null,
                refreshToken: creds.refreshToken || null,
                expiresAt: Number(creds.expiresAt || 0),
                scopes: Array.isArray(creds.scopes) ? creds.scopes : [],
                customClientId: creds.customClientId || null,
                customClientSecret: creds.customClientSecret || null,
                updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : new Date().toISOString()
            };
            if (row.isDefault && !defaultAccountId) {
                defaultAccountId = keyId;
            }
        }

        if (!defaultAccountId) {
            defaultAccountId = Object.keys(accounts)[0] || null;
        }
        return { version: 2, workspaceId: cleanWsId, defaultAccountId, accounts };
    }

    const vaultSetting = await injectedPrisma.systemSetting.findUnique({ where: { key: ALLEGRO_VAULT_KEY } });
    if (vaultSetting && vaultSetting.value && vaultSetting.value.trim()) {
        const plainJson = decryptSecret(vaultSetting.value);
        const parsed = JSON.parse(plainJson);
        const accounts = parsed && typeof parsed.accounts === 'object' && parsed.accounts ? parsed.accounts : {};
        const keys = Object.keys(accounts);
        const defaultAccountId = (parsed.defaultAccountId && accounts[parsed.defaultAccountId])
            ? parsed.defaultAccountId
            : (keys[0] || null);
        return { version: 1, workspaceId: null, defaultAccountId, accounts };
    }

    const [legacyAccess, legacyRefresh, legacyExpiry] = await Promise.all([
        injectedPrisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_ACCESS_TOKEN' } }),
        injectedPrisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_REFRESH_TOKEN' } }),
        injectedPrisma.systemSetting.findUnique({ where: { key: 'ALLEGRO_TOKEN_EXPIRY' } })
    ]);

    if (legacyRefresh?.value || legacyAccess?.value) {
        const accessVal = legacyAccess?.value ? decryptSecret(legacyAccess.value) : null;
        const refreshVal = legacyRefresh?.value ? decryptSecret(legacyRefresh.value) : null;
        const expiryVal = legacyExpiry?.value ? parseInt(legacyExpiry.value, 10) : 0;
        const claims = inspectTokenClaims(accessVal || '');
        const accId = claims.userName ? String(claims.userName) : 'default';
        return {
            version: 1,
            workspaceId: null,
            defaultAccountId: accId,
            accounts: {
                [accId]: {
                    accountId: accId,
                    label: accId === 'default' ? 'Konto Domyślne' : `Konto #${accId}`,
                    login: null,
                    email: null,
                    companyName: null,
                    accessToken: accessVal,
                    refreshToken: refreshVal,
                    expiresAt: Number.isFinite(expiryVal) ? expiryVal : 0,
                    scopes: claims.scopes || [],
                    updatedAt: (legacyAccess?.updatedAt || legacyRefresh?.updatedAt || new Date()).toISOString()
                }
            }
        };
    }

    return { version: 1, workspaceId: null, defaultAccountId: null, accounts: {} };
}

async function writeAllegroAccountsVault(vault, injectedPrisma = prisma) {
    const normalized = {
        version: 1,
        defaultAccountId: vault.defaultAccountId || Object.keys(vault.accounts || {})[0] || null,
        accounts: vault.accounts || {}
    };
    const encrypted = encryptSecret(JSON.stringify(normalized));
    await injectedPrisma.systemSetting.upsert({
        where: { key: ALLEGRO_VAULT_KEY },
        update: { value: encrypted },
        create: { key: ALLEGRO_VAULT_KEY, value: encrypted }
    });
    return normalized;
}

function formatSafeAccountMeta(acc, defaultAccountId) {
    const claims = inspectTokenClaims(acc.accessToken || '');
    const scopes = Array.isArray(acc.scopes) && acc.scopes.length > 0 ? acc.scopes : (claims.scopes || []);
    return {
        id: acc.integrationAccountId || String(acc.accountId),
        integrationAccountId: acc.integrationAccountId || null,
        accountId: String(acc.accountId),
        externalAccountId: acc.externalAccountId || String(acc.accountId),
        workspaceId: acc.workspaceId || null,
        label: acc.label || `Konto #${acc.accountId}`,
        login: acc.login || null,
        email: acc.email || null,
        companyName: acc.companyName || null,
        isDefault: String(acc.accountId) === String(defaultAccountId),
        hasWriteScope: scopes.includes('allegro:api:sale:offers:write') && scopes.includes('allegro:api:sale:offers:read'),
        hasRefreshToken: Boolean(acc.refreshToken),
        hasCustomApp: Boolean(acc.customClientId && acc.customClientSecret),
        scopes,
        tokenExpiresAt: acc.expiresAt ? new Date(acc.expiresAt).toISOString() : (claims.expIso || null),
        updatedAt: acc.updatedAt || null
    };
}

async function listConnectedAllegroAccounts(injectedPrisma = prisma, workspaceId = null) {
    const vault = await readAllegroAccountsVault(injectedPrisma, workspaceId);
    const list = Object.values(vault.accounts || {}).map(acc => formatSafeAccountMeta(acc, vault.defaultAccountId));
    list.sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return String(a.label).localeCompare(String(b.label), 'pl');
    });
    return list;
}

function findAccountInVaultByAnyId(vault, requested) {
    if (!requested) return null;
    if (vault.accounts[requested]) {
        return { key: requested, account: vault.accounts[requested] };
    }
    for (const [k, acc] of Object.entries(vault.accounts || {})) {
        if (acc && (acc.integrationAccountId === requested || String(acc.accountId) === requested)) {
            return { key: k, account: acc };
        }
    }
    return null;
}

async function resolveAccountIdOrDefault(requestedAccountId, injectedPrisma = prisma, workspaceId = null) {
    const vault = await readAllegroAccountsVault(injectedPrisma, workspaceId);
    const requested = requestedAccountId ? String(requestedAccountId).trim() : '';
    if (requested && requested.toUpperCase() !== 'ALL') {
        const hit = findAccountInVaultByAnyId(vault, requested);
        if (!hit) {
            const err = new Error(`Wybrane konto Allegro (#${requested}) nie jest podłączone w wybranym kliencie/systemie. Przejdź do Panelu Admina -> Integracje API i dodaj konto.`);
            err.statusCode = 404;
            err.code = 'ALLEGRO_ACCOUNT_NOT_FOUND';
            throw err;
        }
        return { vault, accountId: hit.key, account: hit.account };
    }
    const defId = vault.defaultAccountId || Object.keys(vault.accounts || {})[0] || null;
    return {
        vault,
        accountId: defId,
        account: defId ? vault.accounts[defId] : null
    };
}

function resolveAllegroAppCredentials(account = null, override = {}) {
    const clientId = (override?.customClientId && String(override.customClientId).trim())
        || (account?.customClientId && String(account.customClientId).trim())
        || process.env.ALLEGRO_CLIENT_ID;
    const clientSecret = (override?.customClientSecret && String(override.customClientSecret).trim())
        || (account?.customClientSecret && String(account.customClientSecret).trim())
        || process.env.ALLEGRO_CLIENT_SECRET;
    return { clientId, clientSecret };
}

async function getAllegroToken(forceRefresh = false, requestedAccountId = null, injectedPrisma = prisma, workspaceId = null) {
    const cleanWsId = workspaceId ? String(workspaceId).trim() : null;
    const explicitReq = requestedAccountId && String(requestedAccountId).trim() !== '' && String(requestedAccountId).trim().toUpperCase() !== 'ALL';
    const preResolved = await resolveAccountIdOrDefault(requestedAccountId, injectedPrisma, cleanWsId);
    const cacheKey = `${cleanWsId || 'legacy'}:${preResolved.accountId || '__app__'}`;

    if (!forceRefresh) {
        const mem = tokenCacheByAccount.get(cacheKey);
        if (mem && mem.token && mem.expiry && Date.now() < mem.expiry) {
            return mem.token;
        }
        if (preResolved.account?.accessToken && preResolved.account.expiresAt && Date.now() < Number(preResolved.account.expiresAt)) {
            tokenCacheByAccount.set(cacheKey, { token: preResolved.account.accessToken, expiry: Number(preResolved.account.expiresAt) });
            return preResolved.account.accessToken;
        }
    }

    if (tokenRefreshPromises.has(cacheKey)) {
        return tokenRefreshPromises.get(cacheKey);
    }

    const lockPrefix = cleanWsId ? `ALLEGRO_REFRESH_LOCK:${cleanWsId}` : 'ALLEGRO_REFRESH_LOCK';
    const LOCK_KEY = preResolved.accountId ? `${lockPrefix}:${preResolved.accountId}` : lockPrefix;

    const refreshPromise = (async () => {
        try {
            let acquiredLock = false;

            for (let i = 0; i < 20; i++) {
                const now = Date.now();
                const lockRecord = await injectedPrisma.systemSetting.findUnique({ where: { key: LOCK_KEY } });

                if (!lockRecord) {
                    try {
                        await injectedPrisma.systemSetting.create({ data: { key: LOCK_KEY, value: (now + 30000).toString() } });
                        acquiredLock = true;
                        break;
                    } catch (e) {}
                } else if (parseInt(lockRecord.value, 10) < now) {
                    const updated = await injectedPrisma.systemSetting.updateMany({
                        where: { key: LOCK_KEY, value: lockRecord.value },
                        data: { value: (now + 30000).toString() }
                    });
                    if (updated.count > 0) {
                        acquiredLock = true;
                        break;
                    }
                }

                const freshResolved = await resolveAccountIdOrDefault(requestedAccountId, injectedPrisma, cleanWsId);
                const freshMem = tokenCacheByAccount.get(cacheKey);
                if (freshResolved.account?.accessToken && freshResolved.account.expiresAt && Date.now() < Number(freshResolved.account.expiresAt) && freshResolved.account.accessToken !== freshMem?.token) {
                    tokenCacheByAccount.set(cacheKey, { token: freshResolved.account.accessToken, expiry: Number(freshResolved.account.expiresAt) });
                    return freshResolved.account.accessToken;
                }

                await new Promise(r => setTimeout(r, 1000));
            }

            if (!acquiredLock) {
                throw new Error('Timeout oczekiwania na blokadę odświeżania tokenu z bazy danych (Allegro).');
            }

            const { vault, accountId, account } = await resolveAccountIdOrDefault(requestedAccountId, injectedPrisma, cleanWsId);
            if (!forceRefresh && account?.accessToken && account.expiresAt && Date.now() < Number(account.expiresAt)) {
                tokenCacheByAccount.set(cacheKey, { token: account.accessToken, expiry: Number(account.expiresAt) });
                await injectedPrisma.systemSetting.updateMany({ where: { key: LOCK_KEY }, data: { value: '0' } });
                return account.accessToken;
            }

            const { clientId, clientSecret } = resolveAllegroAppCredentials(account);
            if (!clientId || !clientSecret) {
                throw new Error('Brak autoryzacji do API Allegro. Skonfiguruj klucze deweloperskie (ALLEGRO_CLIENT_ID / ALLEGRO_CLIENT_SECRET) w pliku .env lub własne klucze aplikacji dla konta.');
            }
            const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

            if (!account || !account.refreshToken) {
                if (explicitReq) {
                    throw new Error(`Konto Allegro #${accountId} nie posiada aktywnego refresh_token. Przeprowadź ponowną autoryzację Device Flow.`);
                }
                console.warn('[AllegroService] Brak Refresh Tokenu! Proba pobrania client_credentials (publicznego).');
                const response = await axios.post('https://allegro.pl/auth/oauth/token', 'grant_type=client_credentials', {
                    headers: {
                        'User-Agent': ALLEGRO_USER_AGENT,
                        'Authorization': `Basic ${authString}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                const appToken = response.data.access_token;
                const appExpiry = Date.now() + (response.data.expires_in - 300) * 1000;
                tokenCacheByAccount.set(`${cleanWsId || 'legacy'}:__app__`, { token: appToken, expiry: appExpiry });
                return appToken;
            }

            const response = await axios.post(
                'https://allegro.pl/auth/oauth/token',
                `grant_type=refresh_token&refresh_token=${encodeURIComponent(account.refreshToken)}`,
                {
                    headers: {
                        'User-Agent': ALLEGRO_USER_AGENT,
                        'Authorization': `Basic ${authString}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            const nextAccessToken = response.data.access_token;
            const nextExpiresAt = Date.now() + (response.data.expires_in - 300) * 1000;
            const nextRefreshToken = response.data.refresh_token || account.refreshToken;
            const refreshedClaims = inspectTokenClaims(nextAccessToken);
            const nextScopes = refreshedClaims.scopes.length > 0 ? refreshedClaims.scopes : (account.scopes || []);

            if (cleanWsId && account.integrationAccountId && injectedPrisma?.integrationAccount) {
                const updatedCreds = {
                    accessToken: nextAccessToken,
                    refreshToken: nextRefreshToken,
                    expiresAt: nextExpiresAt,
                    scopes: nextScopes,
                    customClientId: account.customClientId || null,
                    customClientSecret: account.customClientSecret || null
                };
                const enc = encryptSecretWithAad(
                    JSON.stringify(updatedCreds),
                    buildIntegrationAad(cleanWsId, 'ALLEGRO', account.integrationAccountId)
                );
                await injectedPrisma.integrationAccount.update({
                    where: { id: account.integrationAccountId },
                    data: { credentialsEnc: enc, lastVerifiedAt: new Date() }
                });
            } else {
                vault.accounts[accountId] = {
                    ...account,
                    accountId,
                    accessToken: nextAccessToken,
                    refreshToken: nextRefreshToken,
                    expiresAt: nextExpiresAt,
                    scopes: nextScopes,
                    updatedAt: new Date().toISOString()
                };
                await writeAllegroAccountsVault(vault, injectedPrisma);
            }
            tokenCacheByAccount.set(cacheKey, { token: nextAccessToken, expiry: nextExpiresAt });

            console.log(`[AllegroService] Odświeżono Token OAuth2 dla konta #${accountId} (workspace: ${cleanWsId || 'legacy'}).`);
            return nextAccessToken;
        } catch (error) {
            console.error('[AllegroService] Błąd odświeżania tokenu:', error.response ? error.response.data : error.message);
            try {
                const { createAndSendNotification } = require('../communication/notifications.service');
                await createAndSendNotification(
                    'admin-id',
                    'Awaria autoryzacji Allegro',
                    'Token wygasł lub został cofnięty. Wymagane ponowne logowanie przez Device Flow.',
                    'error'
                );
            } catch (notifErr) {
                console.error('[AllegroService] Nie udało się wysłać powiadomienia o błędzie:', notifErr.message);
            }
            throw new Error(error.message || 'Nie udało się odświeżyć tokenu. Przeprowadź ponowne logowanie Device Flow.');
        } finally {
            try {
                await injectedPrisma.systemSetting.updateMany({ where: { key: LOCK_KEY }, data: { value: '0' } });
            } catch (_) { /* ignore */ }
            tokenRefreshPromises.delete(cacheKey);
        }
    })();

    tokenRefreshPromises.set(cacheKey, refreshPromise);
    return refreshPromise;
}

async function startDeviceFlow({ customClientId = null, customClientSecret = null } = {}) {
    const { clientId, clientSecret } = resolveAllegroAppCredentials(null, { customClientId, customClientSecret });

    if (!clientId || !clientSecret) {
        throw new Error('Brak kluczy ALLEGRO_CLIENT_ID lub ALLEGRO_CLIENT_SECRET (w .env ani we własnych kluczach aplikacji).');
    }

    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post('https://allegro.pl/auth/oauth/device', `client_id=${clientId}`, {
        headers: {
            'User-Agent': ALLEGRO_USER_AGENT,
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    });

    return response.data;
}

async function saveAccountFromTokenData(tokenData, { label = null, setAsDefault = false, workspaceId = null, customClientId = null, customClientSecret = null } = {}, injectedPrisma = prisma) {
    const cleanWsId = workspaceId ? String(workspaceId).trim() : null;
    const accessToken = tokenData?.access_token;
    const refreshToken = tokenData?.refresh_token || null;
    const expiresIn = Number(tokenData?.expires_in || 43200);
    const expiresAt = Date.now() + Math.max(60, expiresIn - 300) * 1000;
    const claims = inspectTokenClaims(accessToken || '');
    const accountId = claims.userName ? String(claims.userName) : 'default';

    let meInfo = null;
    if (accessToken && claims.scopes.includes('allegro:api:profile:read')) {
        try {
            const meRes = await axios.get('https://api.allegro.pl/me', {
                headers: buildAllegroHeaders(accessToken),
                timeout: 8000
            });
            meInfo = meRes.data || null;
        } catch (_) {
            meInfo = null;
        }
    }

    if (cleanWsId && injectedPrisma?.integrationAccount) {
        const existingRows = await injectedPrisma.integrationAccount.findMany({
            where: { workspaceId: cleanWsId, provider: 'ALLEGRO', isActive: true }
        });
        const existingRow = existingRows.find(r => String(r.externalAccountId) === accountId) || null;
        const targetId = existingRow?.id || crypto.randomUUID();

        let prevCreds = {};
        if (existingRow?.credentialsEnc) {
            try {
                prevCreds = JSON.parse(decryptSecretWithAad(existingRow.credentialsEnc, buildIntegrationAad(cleanWsId, 'ALLEGRO', existingRow.id)) || '{}');
            } catch (_) {}
        }
        const prevMeta = (existingRow?.metadata && typeof existingRow.metadata === 'object') ? existingRow.metadata : {};
        const cleanLabel = (typeof label === 'string' && label.trim())
            ? label.trim()
            : (existingRow?.label || meInfo?.company?.name || meInfo?.login || `Konto #${accountId}`);

        const credsPayload = {
            accessToken,
            refreshToken: refreshToken || prevCreds.refreshToken || null,
            expiresAt,
            scopes: claims.scopes || [],
            customClientId: customClientId || prevCreds.customClientId || null,
            customClientSecret: customClientSecret || prevCreds.customClientSecret || null
        };
        const encrypted = encryptSecretWithAad(
            JSON.stringify(credsPayload),
            buildIntegrationAad(cleanWsId, 'ALLEGRO', targetId)
        );
        const metaPayload = {
            ...prevMeta,
            login: meInfo?.login || prevMeta.login || null,
            email: meInfo?.email || prevMeta.email || null,
            companyName: meInfo?.company?.name || prevMeta.companyName || null
        };

        const shouldBeDefault = Boolean(setAsDefault) || existingRows.length === 0 || Boolean(existingRow?.isDefault);
        const savedRow = await injectedPrisma.$transaction(async (tx) => {
            if (shouldBeDefault) {
                await tx.integrationAccount.updateMany({
                    where: { workspaceId: cleanWsId, provider: 'ALLEGRO', isDefault: true, NOT: { id: targetId } },
                    data: { isDefault: false }
                });
            }
            if (existingRow) {
                return tx.integrationAccount.update({
                    where: { id: targetId },
                    data: {
                        label: cleanLabel.slice(0, 80),
                        externalAccountId: accountId,
                        isDefault: shouldBeDefault,
                        credentialsEnc: encrypted,
                        metadata: metaPayload,
                        lastVerifiedAt: new Date()
                    }
                });
            }
            return tx.integrationAccount.create({
                data: {
                    id: targetId,
                    workspaceId: cleanWsId,
                    provider: 'ALLEGRO',
                    label: cleanLabel.slice(0, 80),
                    externalAccountId: accountId,
                    environment: 'production',
                    isDefault: shouldBeDefault,
                    isActive: true,
                    credentialsEnc: encrypted,
                    metadata: metaPayload,
                    lastVerifiedAt: new Date()
                }
            });
        });

        tokenCacheByAccount.set(`${cleanWsId}:${accountId}`, { token: accessToken, expiry: expiresAt });
        return formatSafeAccountMeta({
            integrationAccountId: savedRow.id,
            accountId,
            externalAccountId: accountId,
            workspaceId: cleanWsId,
            label: savedRow.label,
            ...metaPayload,
            ...credsPayload,
            updatedAt: savedRow.updatedAt ? new Date(savedRow.updatedAt).toISOString() : new Date().toISOString()
        }, savedRow.isDefault ? accountId : null);
    }

    const vault = await readAllegroAccountsVault(injectedPrisma);
    const prevAccount = vault.accounts[accountId] || {};
    const cleanLabel = (typeof label === 'string' && label.trim())
        ? label.trim()
        : (prevAccount.label || meInfo?.company?.name || meInfo?.login || `Konto #${accountId}`);

    vault.accounts[accountId] = {
        ...prevAccount,
        accountId,
        label: cleanLabel,
        login: meInfo?.login || prevAccount.login || null,
        email: meInfo?.email || prevAccount.email || null,
        companyName: meInfo?.company?.name || prevAccount.companyName || null,
        accessToken,
        refreshToken: refreshToken || prevAccount.refreshToken || null,
        expiresAt,
        scopes: claims.scopes || [],
        customClientId: customClientId || prevAccount.customClientId || null,
        customClientSecret: customClientSecret || prevAccount.customClientSecret || null,
        updatedAt: new Date().toISOString()
    };

    if (!vault.defaultAccountId || setAsDefault || Object.keys(vault.accounts).length === 1) {
        vault.defaultAccountId = accountId;
    }

    const savedVault = await writeAllegroAccountsVault(vault, injectedPrisma);
    tokenCacheByAccount.set(`legacy:${accountId}`, { token: accessToken, expiry: expiresAt });

    return formatSafeAccountMeta(savedVault.accounts[accountId], savedVault.defaultAccountId);
}

async function pollForToken(deviceCode, { label = null, setAsDefault = false, workspaceId = null, customClientId = null, customClientSecret = null } = {}, injectedPrisma = prisma) {
    const { clientId, clientSecret } = resolveAllegroAppCredentials(null, { customClientId, customClientSecret });
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await axios.post(
        'https://allegro.pl/auth/oauth/token',
        `grant_type=urn:ietf:params:oauth:grant-type:device_code&device_code=${deviceCode}`,
        {
            headers: {
                'User-Agent': ALLEGRO_USER_AGENT,
                'Authorization': `Basic ${authString}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        }
    );

    const tokenData = response.data;
    const accountMeta = await saveAccountFromTokenData(
        tokenData,
        { label, setAsDefault, workspaceId, customClientId, customClientSecret },
        injectedPrisma
    );
    return { ...tokenData, accountMeta };
}

async function setDefaultAllegroAccount(accountId, injectedPrisma = prisma, workspaceId = null) {
    const cleanId = String(accountId || '').trim();
    const cleanWsId = workspaceId ? String(workspaceId).trim() : null;

    if (cleanWsId && injectedPrisma?.integrationAccount) {
        const row = await injectedPrisma.integrationAccount.findFirst({
            where: {
                workspaceId: cleanWsId,
                provider: 'ALLEGRO',
                isActive: true,
                OR: [{ id: cleanId }, { externalAccountId: cleanId }]
            }
        });
        if (!row) {
            const err = new Error(`Konto Allegro #${cleanId} nie istnieje u wybranego klienta.`);
            err.statusCode = 404;
            throw err;
        }
        await injectedPrisma.$transaction([
            injectedPrisma.integrationAccount.updateMany({
                where: { workspaceId: cleanWsId, provider: 'ALLEGRO', isDefault: true, NOT: { id: row.id } },
                data: { isDefault: false }
            }),
            injectedPrisma.integrationAccount.update({
                where: { id: row.id },
                data: { isDefault: true }
            })
        ]);
        return listConnectedAllegroAccounts(injectedPrisma, cleanWsId);
    }

    const vault = await readAllegroAccountsVault(injectedPrisma);
    if (!vault.accounts[cleanId]) {
        const err = new Error(`Konto Allegro #${cleanId} nie istnieje w skarbcu.`);
        err.statusCode = 404;
        throw err;
    }
    vault.defaultAccountId = cleanId;
    await writeAllegroAccountsVault(vault, injectedPrisma);
    return listConnectedAllegroAccounts(injectedPrisma);
}

async function updateAllegroAccountLabel(accountId, label, injectedPrisma = prisma, workspaceId = null) {
    const cleanId = String(accountId || '').trim();
    const cleanLabel = String(label || '').trim();
    if (!cleanLabel) throw new Error('Nazwa etykiety konta nie może być pusta.');
    const cleanWsId = workspaceId ? String(workspaceId).trim() : null;

    if (cleanWsId && injectedPrisma?.integrationAccount) {
        const row = await injectedPrisma.integrationAccount.findFirst({
            where: {
                workspaceId: cleanWsId,
                provider: 'ALLEGRO',
                isActive: true,
                OR: [{ id: cleanId }, { externalAccountId: cleanId }]
            }
        });
        if (!row) {
            const err = new Error(`Konto Allegro #${cleanId} nie istnieje u wybranego klienta.`);
            err.statusCode = 404;
            throw err;
        }
        await injectedPrisma.integrationAccount.update({
            where: { id: row.id },
            data: { label: cleanLabel.slice(0, 80) }
        });
        const list = await listConnectedAllegroAccounts(injectedPrisma, cleanWsId);
        return list.find(a => a.id === row.id || a.accountId === cleanId) || list[0];
    }

    const vault = await readAllegroAccountsVault(injectedPrisma);
    if (!vault.accounts[cleanId]) {
        const err = new Error(`Konto Allegro #${cleanId} nie istnieje w skarbcu.`);
        err.statusCode = 404;
        throw err;
    }
    vault.accounts[cleanId] = {
        ...vault.accounts[cleanId],
        label: cleanLabel.slice(0, 80),
        updatedAt: new Date().toISOString()
    };
    await writeAllegroAccountsVault(vault, injectedPrisma);
    return formatSafeAccountMeta(vault.accounts[cleanId], vault.defaultAccountId);
}

async function removeAllegroAccount(accountId, injectedPrisma = prisma, workspaceId = null) {
    const cleanId = String(accountId || '').trim();
    const cleanWsId = workspaceId ? String(workspaceId).trim() : null;

    if (cleanWsId && injectedPrisma?.integrationAccount) {
        const row = await injectedPrisma.integrationAccount.findFirst({
            where: {
                workspaceId: cleanWsId,
                provider: 'ALLEGRO',
                OR: [{ id: cleanId }, { externalAccountId: cleanId }]
            }
        });
        if (!row) {
            const err = new Error(`Konto Allegro #${cleanId} nie istnieje u wybranego klienta.`);
            err.statusCode = 404;
            throw err;
        }
        await injectedPrisma.$transaction(async (tx) => {
            await tx.integrationAccount.delete({ where: { id: row.id } });
            if (row.isDefault) {
                const next = await tx.integrationAccount.findFirst({
                    where: { workspaceId: cleanWsId, provider: 'ALLEGRO', isActive: true },
                    orderBy: { createdAt: 'asc' }
                });
                if (next) {
                    await tx.integrationAccount.update({ where: { id: next.id }, data: { isDefault: true } });
                }
            }
        });
        tokenCacheByAccount.delete(`${cleanWsId}:${row.externalAccountId || row.id}`);
        tokenCacheByAccount.delete(`${cleanWsId}:${row.id}`);
        return listConnectedAllegroAccounts(injectedPrisma, cleanWsId);
    }

    const vault = await readAllegroAccountsVault(injectedPrisma);
    if (!vault.accounts[cleanId]) {
        const err = new Error(`Konto Allegro #${cleanId} nie istnieje w skarbcu.`);
        err.statusCode = 404;
        throw err;
    }
    delete vault.accounts[cleanId];
    tokenCacheByAccount.delete(`legacy:${cleanId}`);
    const remainingKeys = Object.keys(vault.accounts);
    if (vault.defaultAccountId === cleanId) {
        vault.defaultAccountId = remainingKeys[0] || null;
    }
    await writeAllegroAccountsVault(vault, injectedPrisma);
    return listConnectedAllegroAccounts(injectedPrisma);
}

/**
 * Pobiera ofertę na podstawie ID i ekstrahuje oryginalne adresy zdjęć.
 */
async function getOfferImages(offerId, { accountId = null, workspaceId = null } = {}) {
    if (!offerId) return [];

    try {
        const token = await getAllegroToken(false, accountId, prisma, workspaceId);

        console.log(`[AllegroService] Odpytywanie /sale/product-offers/${offerId}...`);
        const response = await apiClient.get(`https://api.allegro.pl/sale/product-offers/${offerId}`, {
            headers: buildAllegroHeaders(token),
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 15000
        });

        const data = response.data;
        if (!data || !data.images) {
            return [];
        }

        const imageUrls = normalizeOfferImageUrls(data.images);
        console.log(`[AllegroService] Pobrano ${imageUrls.length} oryginalnych obrazów z oferty.`);
        return imageUrls;

    } catch (error) {
        if (error.response && error.response.status === 404) {
            console.warn(`[AllegroService] Oferta ${offerId} nie została znaleziona w API.`);
            return [];
        }
        console.error(`[AllegroService] Błąd pobierania danych oferty ${offerId}:`, error.response ? error.response.data : error.message);
        throw new Error(`Błąd integracji z ofertą Allegro: ${error.message}`);
    }
}

/**
 * PeĹ‚ne pobranie danych z API Allegro - zastÄ™puje analizÄ™ obrazu.
 */
async function getFullOfferData(offerId, { accountId = null, workspaceId = null } = {}) {
    if (!offerId) throw new Error("Brak ID oferty do pobrania");

    try {
        const token = await getAllegroToken(false, accountId, prisma, workspaceId);
        console.log(`[AllegroService] Odpytywanie FULL DATA /sale/product-offers/${offerId}...`);
        
        const response = await apiClient.get(`https://api.allegro.pl/sale/product-offers/${offerId}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 15000
        });

        const data = response.data;
        
        // 1. Tytuł (name lub productSet[0].product.name)
        const primaryProduct = data.productSet?.[0]?.product || data.product || null;
        const title = data.name || primaryProduct?.name || "";
        
        // 2. Zdjęcia
        const imageUrls = normalizeOfferImageUrls(data.images);
        
        // 3. Kod EAN (GTIN) i Parametry (korzeń oferty + parametry produktowe)
        let ean = data.ean || "";
        let paramsText = "";
        const combinedParams = [
            ...(Array.isArray(data.parameters) ? data.parameters : []),
            ...(Array.isArray(primaryProduct?.parameters) ? primaryProduct.parameters : [])
        ];
        combinedParams.forEach(p => {
            const vals = p.values ? p.values.join(", ") : (p.valuesIds ? p.valuesIds.join(", ") : "");
            paramsText += `- [ID: ${p.id}] ${p.name || ''}: ${vals}\n`;
            if ((String(p.id) === '225693' || (p.name && /\b(?:ean|gtin)\b/i.test(p.name))) && !ean) {
                if (p.values && p.values.length > 0) {
                    ean = p.values[0];
                }
            }
        });
        
        // 4. Opis z sekcji (tylko TYPE: TEXT)
        let descriptionHtml = "";
        if (data.description && data.description.sections) {
            data.description.sections.forEach(section => {
                if (section.items) {
                    section.items.forEach(item => {
                        if (item.type === 'TEXT') {
                            descriptionHtml += item.content + "<br/><br/>";
                        }
                    });
                }
            });
        }
        
        const textContent = `
TYTUĹ AUKCJI: ${title}
EAN: ${ean}

PARAMETRY OFERTY:
${paramsText}

GĹĂ“WNY OPIS (HTML):
${descriptionHtml}
`;

        return {
            title,
            ean,
            textContent,
            imageUrls
        };

    } catch (error) {
        if (error.response && error.response.status === 404) {
             throw new Error(`Oferta Allegro o ID ${offerId} nie istnieje (BĹ‚Ä…d 404). Upewnij siÄ™, ĹĽe podajesz poprawny numer i ĹĽe oferta jest na Twoim koncie.`);
        } else if (error.response && error.response.status === 403) {
             throw new Error(`Brak uprawnieĹ„ (BĹ‚Ä…d 403) do odczytu /sale/product-offers/${offerId}. Token OAuth musi dotyczyÄ‡ konta, z ktĂłrego wystawiono tÄ™ ofertÄ™.`);
        }
        throw new Error(`BĹ‚Ä…d integracji z API Allegro: ${error.message}`);
    }
}

/**
 * Pobiera sĹ‚ownik parametrĂłw dla podanej kategorii (Lazy Schema Caching) i zapisuje do bazy Nexus.
 */
async function fetchCategoryParameters(categoryId, { workspaceId = null, accountId = null } = {}) {
    if (!categoryId) throw new Error("Brak categoryId do pobrania parametrów.");

    try {
        const token = await getAllegroToken(false, accountId, prisma, workspaceId);
        
        console.log(`[AllegroService] Pobieram parametry dla kategorii ID: ${categoryId}`);
        const response = await apiClient.get(`https://api.allegro.pl/sale/categories/${categoryId}/parameters`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 15000
        });

        const parameters = response.data.parameters;
        
        // Pobieranie nazwy kategorii do ładnego wyświetlania w PIM
        const catResponse = await apiClient.get(`https://api.allegro.pl/sale/categories/${categoryId}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null
        });
        const categoryName = catResponse.data.name || `Kategoria ${categoryId}`;

        // Zapis Cache'u w bazie (Lazy Caching) przy użyciu współdzielonego klienta Prisma
        const marketplaceCategory = await prisma.marketplaceCategory.upsert({
            where: { id: categoryId },
            update: {
                name: categoryName,
                parameters: parameters
            },
            create: {
                id: categoryId,
                name: categoryName,
                parameters: parameters
            }
        });
        
        // Minifikacja dla Agenta (ochrona tokenów)
        return {
            id: marketplaceCategory.id,
            name: marketplaceCategory.name,
            parameters: (marketplaceCategory.parameters || []).map(p => ({
                id: p.id,
                name: p.name,
                type: p.type,
                required: p.required,
                options: p.dictionary ? p.dictionary.slice(0, 10).map(d => d.value) : []
            }))
        };

    } catch (error) {
        console.error(`[AllegroService] Błąd pobierania schematu dla kategorii ${categoryId}:`, error.response ? error.response.data : error.message);
        throw new Error(`Błąd integracji słownika parametrów: ${error.message}`);
    }
}

/**
 * Szuka w globalnym Katalogu Produktów Allegro kategorii przypisanej do danego EAN.
 */
async function findCategoryByEan(ean, opts = {}) {
    if (!ean) return null;
    const { workspaceId = null, accountId = null } = (opts && typeof opts === 'object') ? opts : {};
    try {
        const token = await getAllegroToken(false, accountId, prisma, workspaceId);
        const response = await apiClient.get(`https://api.allegro.pl/sale/products?phrase=${ean}&mode=GTIN`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 15000
        });
        
        if (response.data.products && response.data.products.length > 0) {
            return response.data.products[0].category.id;
        }
        return null;
    } catch (error) {
        console.error(`[AllegroService] Błąd wyszukiwania kategorii po EAN ${ean}:`, error.message);
        return null;
    }
}

/**
 * Szuka w globalnym Katalogu Produktów Allegro parametrów twardych przypisanych do danego EAN.
 */
async function getProductParametersByEan(ean, opts = {}) {
    if (!ean) return {};
    const { workspaceId = null, accountId = null } = (opts && typeof opts === 'object') ? opts : {};
    try {
        const token = await getAllegroToken(false, accountId, prisma, workspaceId);
        const response = await apiClient.get(`https://api.allegro.pl/sale/products?phrase=${ean}&mode=GTIN`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 15000
        });
        
        let hardFeatures = {};
        if (response.data.products && response.data.products.length > 0) {
            const product = response.data.products[0];
            if (product.parameters) {
                product.parameters.forEach(p => {
                    // Endpoint /sale/products nie zwraca pola "type", 
                    // dlatego sprawdzamy po prostu czy są dostępne etykiety (słowniki)
                    if (p.valuesLabels && p.valuesLabels.length > 0) {
                        hardFeatures[p.name] = p.valuesLabels[0];
                    } else if (p.values && p.values.length > 0) {
                        hardFeatures[p.name] = p.values[0];
                    }
                });
            }
        }
        return hardFeatures;
    } catch (error) {
        console.error(`[AllegroService] Błąd pobierania parametrów z katalogu dla EAN ${ean}:`, error.message);
        return {};
    }
}

/**
 * Pobiera oficjalne informacje o produkcie w globalnym Katalogu Produktów Allegro po EAN (`mode=GTIN`):
 * nazwę katalogową (`name`), `productId`, `categoryId` oraz parametry twarde.
 */
async function getCatalogProductInfoByEan(ean, opts = {}) {
    const cleanEan = String(ean || '').trim();
    if (!cleanEan) {
        return { found: false, productId: null, name: null, categoryId: null, parameters: {} };
    }
    const { workspaceId = null, accountId = null } = (opts && typeof opts === 'object') ? opts : {};
    try {
        const token = await getAllegroToken(false, accountId, prisma, workspaceId);
        const response = await apiClient.get(`https://api.allegro.pl/sale/products?phrase=${encodeURIComponent(cleanEan)}&mode=GTIN`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 15000
        });

        const products = Array.isArray(response?.data?.products) ? response.data.products : [];
        if (products.length === 0) {
            return { found: false, productId: null, name: null, categoryId: null, parameters: {} };
        }

        const product = products[0];
        const parameters = {};
        if (Array.isArray(product.parameters)) {
            product.parameters.forEach((p) => {
                if (p?.valuesLabels && p.valuesLabels.length > 0) {
                    parameters[p.name] = p.valuesLabels[0];
                } else if (p?.values && p.values.length > 0) {
                    parameters[p.name] = p.values[0];
                }
            });
        }

        return {
            found: true,
            productId: product.id || null,
            name: product.name ? String(product.name).trim() : null,
            categoryId: product.category?.id ? String(product.category.id) : null,
            parameters
        };
    } catch (error) {
        console.warn(`[AllegroService] Nie udało się pobrać karty katalogowej po EAN ${cleanEan}: ${error.message}`);
        return { found: false, productId: null, name: null, categoryId: null, parameters: {} };
    }
}

/**
 * Zwraca listę kategorii sugerowanych przez Allegro dla proponowanego tytułu oferty (`GET /sale/matching-categories`).
 * Pozwala zweryfikować, czy tytuł kieruje algorytm Trafności/Ads w docelową kategorię produktu.
 */
async function getMatchingCategoriesForTitle(title, opts = {}) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return [];
    const { workspaceId = null, accountId = null } = (opts && typeof opts === 'object') ? opts : {};
    try {
        const token = await getAllegroToken(false, accountId, prisma, workspaceId);
        const response = await apiClient.get(`https://api.allegro.pl/sale/matching-categories?name=${encodeURIComponent(cleanTitle)}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 10000
        });

        const matching = Array.isArray(response?.data?.matchingCategories) ? response.data.matchingCategories : [];
        return matching.slice(0, 5).map(cat => ({
            id: cat?.id ? String(cat.id) : null,
            name: cat?.name || null
        })).filter(c => c.id);
    } catch (error) {
        console.warn(`[AllegroService] Ostrzeżenie matching-categories dla "${cleanTitle.slice(0, 40)}": ${error.message}`);
        return [];
    }
}

/**
 * Szuka rekomendowanej kategorii Allegro na podstawie nazwy produktu (Smart Fallback).
 */
async function findMatchingCategoryByName(name, opts = {}) {
    if (!name) return null;
    const { workspaceId = null, accountId = null } = (opts && typeof opts === 'object') ? opts : {};
    try {
        const token = await getAllegroToken(false, accountId, prisma, workspaceId);
        const response = await apiClient.get(`https://api.allegro.pl/sale/matching-categories?name=${encodeURIComponent(name)}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 15000
        });
        
        if (response.data.matchingCategories && response.data.matchingCategories.length > 0) {
            // Zwracamy pierwszą (najbardziej trafną) kategorię
            return response.data.matchingCategories[0].id;
        }
        return null;
    } catch (error) {
        console.error(`[AllegroService] Błąd wyszukiwania dopasowania kategorii dla nazwy "${name}":`, error.message);
        return null;
    }
}
/**
 * Przeszukuje Katalog Produktów Allegro (endpoint dla agenta)
 */
async function searchProducts(phrase, mode = "NAME", opts = {}) {
    if (!phrase) return { error: "Brak frazy do wyszukania w katalogu." };
    const { workspaceId = null, accountId = null } = (opts && typeof opts === 'object') ? opts : {};
    try {
        const token = await getAllegroToken(false, accountId, prisma, workspaceId);
        let queryParam = mode === "GTIN" ? `ean=${encodeURIComponent(phrase)}` : `phrase=${encodeURIComponent(phrase)}`;
        
        const response = await apiClient.get(`https://api.allegro.pl/sale/products?${queryParam}`, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 15000
        });
        
        if (response.data.products && response.data.products.length > 0) {
            // Zwracamy uproszczone dane dla agenta (nazwa, marka, kategoria, parametry ograniczajÄ…ce budĹĽet tokenĂłw)
            return response.data.products.slice(0, 3).map(p => ({
                id: p.id,
                name: p.name,
                category: p.category ? { id: p.category.id } : null,
                parameters: (p.parameters || []).slice(0, 8).map(param => ({
                    name: param.name,
                    values: param.valuesLabels ? param.valuesLabels.slice(0, 2) : (param.values ? param.values.slice(0, 2) : [])
                }))
            }));
        }
        return { message: "Nie znaleziono produktĂłw w katalogu Allegro." };
    } catch (error) {
        console.warn(`[AllegroService] BĹ‚Ä…d w searchProducts dla frazy "${phrase}":`, error.message);
        return { error: error.message };
    }
}

/**
 * Zwraca listing ofert konkurencji (endpoint zastrzeżony, best-effort)
 */
async function getListingCompetitors(phrase, categoryId, limit = 60, opts = {}) {
    if (!phrase) return { error: "Brak frazy" };
    const { workspaceId = null, accountId = null } = (opts && typeof opts === 'object') ? opts : {};
    try {
        const token = await getAllegroToken(false, accountId, prisma, workspaceId);
        let url = `https://api.allegro.pl/offers/listing?phrase=${encodeURIComponent(phrase)}&sort=-popularity&limit=${limit}`;
        if (categoryId) url += `&category.id=${categoryId}`;

        const response = await apiClient.get(url, {
            headers: {
                'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.allegro.public.v1+json'
            },
            _allegroAccountId: accountId || null,
            _allegroWorkspaceId: workspaceId || null,
            timeout: 15000
        });

        // Agregacja tytułów z ofert sponsorowanych i zwykłych
        const promoted = (response.data.items.promoted || []).map(i => i.name);
        const regular = (response.data.items.regular || []).map(i => i.name);
        const titles = [...promoted, ...regular];
        
        // Zwracamy same tytuły, filtry są usuwane ze względu na gigantyczny rozmiar JSON (zabezpieczenie 429 Quota Exceeded)
        return {
            titles
        };
    } catch (error) {
        if (error.response && error.response.status === 403) {
            return { error: "ALLEGRO_FORBIDDEN", hint: "Aplikacja wymaga weryfikacji przez Allegro do użycia tego endpointu." };
        }
        console.warn(`[AllegroService] Błąd w getListingCompetitors:`, error.message);
        return { error: error.message };
    }
}

/**
 * Dekoduje bezpiecznie publiczne roszczenia (scope, user_name, exp) z tokenu JWT Allegro bez ujawniania sekretu.
 */
function inspectTokenClaims(token) {
    if (!token || typeof token !== 'string') {
        return { validFormat: false, scopes: [], isUserToken: false, userName: null, expIso: null };
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
        return { validFormat: false, scopes: [], isUserToken: false, userName: null, expIso: null };
    }
    try {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        const scopes = Array.isArray(payload.scope) ? payload.scope : [];
        return {
            validFormat: true,
            scopes,
            isUserToken: Boolean(payload.user_name),
            userName: payload.user_name || null,
            expIso: payload.exp ? new Date(payload.exp * 1000).toISOString() : null
        };
    } catch (_) {
        return { validFormat: false, scopes: [], isUserToken: false, userName: null, expIso: null };
    }
}

/**
 * Weryfikuje czy aktualny token (dla wybranego lub domyślnego konta) jest tokenem sprzedawcy i posiada uprawnienia zapisu ofert.
 */
async function ensureSellerWriteToken(accountId = null, injectedPrisma = prisma, workspaceId = null) {
    const cleanWsId = workspaceId ? String(workspaceId).trim() : null;
    const resolved = await resolveAccountIdOrDefault(accountId, injectedPrisma, cleanWsId);
    if (cleanWsId && !resolved.account) {
        const err = new Error('Brak podłączonego konta sprzedawcy Allegro dla wybranego klienta. Przejdź do Panelu Administracyjnego -> Integracje API i dodaj konto.');
        err.statusCode = 401;
        err.code = 'ALLEGRO_USER_AUTH_REQUIRED';
        throw err;
    }

    const token = await getAllegroToken(false, resolved.accountId, injectedPrisma, cleanWsId);
    const claims = inspectTokenClaims(token);

    if (!claims.isUserToken) {
        const err = new Error('Brak autoryzacji konta sprzedawcy Allegro (użyto wyłącznie tokena aplikacyjnego lub brak ALLEGRO_REFRESH_TOKEN). Przeprowadź logowanie Device Flow w Ustawieniach Integracji.');
        err.statusCode = 401;
        err.code = 'ALLEGRO_USER_AUTH_REQUIRED';
        throw err;
    }

    const requiredScopes = ['allegro:api:sale:offers:read', 'allegro:api:sale:offers:write'];
    const missingScopes = requiredScopes.filter(sc => !claims.scopes.includes(sc));
    if (missingScopes.length > 0) {
        const err = new Error(
            `Token Allegro nie posiada wymaganych uprawnień zapisu (${missingScopes.join(', ')}). ` +
            'Wejdź na https://apps.developer.allegro.pl, włącz brakujące uprawnienia dla aplikacji, a następnie wykonaj ponownie autoryzację konta Allegro (Device Flow) w Nexus ERP.'
        );
        err.statusCode = 403;
        err.code = 'ALLEGRO_MISSING_SCOPES';
        err.missingScopes = missingScopes;
        throw err;
    }

    const effAccountId = resolved.accountId || claims.userName || null;
    const accountLabel = resolved.account?.label || (effAccountId ? `Konto #${effAccountId}` : 'Konto Domyślne');
    return {
        token,
        claims,
        accountId: effAccountId,
        accountLabel,
        integrationAccountId: resolved.account?.integrationAccountId || null,
        workspaceId: cleanWsId
    };
}

/**
 * Pobiera pełny schemat parametrów kategorii Allegro (z options, restrictions, requiredIf i pełnym słownikiem).
 */
async function getCategoryParametersFull(categoryId, {
    forceRefresh = false,
    workspaceId = null,
    accountId = null,
    injectedPrisma = prisma,
    injectedApiClient = apiClient,
    injectedGetToken = getAllegroToken
} = {}) {
    if (!categoryId) throw new Error('Brak categoryId do pobrania parametrów kategorii.');
    const catIdStr = String(categoryId).trim();

    let category = await injectedPrisma.marketplaceCategory.findUnique({ where: { id: catIdStr } });
    const hasValidCachedParams = category && Array.isArray(category.parameters) && category.parameters.length > 0;

    let refreshed = false;
    if (!hasValidCachedParams || forceRefresh) {
        try {
            const token = await injectedGetToken(false, accountId, injectedPrisma, workspaceId);
            const [paramsRes, catRes] = await Promise.all([
                injectedApiClient.get(`https://api.allegro.pl/sale/categories/${encodeURIComponent(catIdStr)}/parameters`, {
                    headers: {
                        'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.allegro.public.v1+json'
                    },
                    _allegroAccountId: accountId || null,
                    _allegroWorkspaceId: workspaceId || null,
                    timeout: 15000
                }),
                injectedApiClient.get(`https://api.allegro.pl/sale/categories/${encodeURIComponent(catIdStr)}`, {
                    headers: {
                        'User-Agent': 'NexusSentinelv2/2.0 (+http://n-e-s.pl)',
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/vnd.allegro.public.v1+json'
                    },
                    _allegroAccountId: accountId || null,
                    _allegroWorkspaceId: workspaceId || null,
                    timeout: 15000
                }).catch(() => null)
            ]);

            const rawParams = Array.isArray(paramsRes.data?.parameters) ? paramsRes.data.parameters : [];
            const categoryName = catRes?.data?.name || category?.name || `Kategoria ${catIdStr}`;

            category = await injectedPrisma.marketplaceCategory.upsert({
                where: { id: catIdStr },
                update: { name: categoryName, parameters: rawParams },
                create: { id: catIdStr, name: categoryName, parameters: rawParams }
            });
            refreshed = true;
        } catch (err) {
            if (hasValidCachedParams) {
                console.warn(`[AllegroService] Nie udało się odświeżyć kategorii ${catIdStr} z Allegro API (${err.message}). Zwracam zbuforowany schemat.`);
                return {
                    id: category.id,
                    name: category.name,
                    parameters: category.parameters,
                    refreshed: false,
                    staleFallback: true,
                    refreshError: err.message
                };
            }
            throw err;
        }
    }

    return {
        id: category.id,
        name: category.name,
        parameters: Array.isArray(category.parameters) ? category.parameters : [],
        refreshed
    };
}

async function findSellerOffersOnSingleAccount({ ean = '', sku = '', name = '', baselinkerId = '', categoryId = '', accountId = null, workspaceId = null } = {}) {
    const { token, accountId: resolvedAccountId, accountLabel } = await ensureSellerWriteToken(accountId, prisma, workspaceId);
    const headers = buildAllegroHeaders(token);

    const collected = new Map();

    const addOffersFromResponse = (offers, matchSource) => {
        if (!Array.isArray(offers)) return;
        for (const o of offers) {
            if (!o || !o.id) continue;
            if (!collected.has(String(o.id))) {
                collected.set(String(o.id), {
                    id: String(o.id),
                    name: o.name || '',
                    categoryId: o.category?.id ? String(o.category.id) : null,
                    status: o.publication?.status || 'UNKNOWN',
                    externalId: o.external?.id || null,
                    matchSource,
                    accountId: resolvedAccountId,
                    accountLabel
                });
            }
        }
    };

    const extCandidates = [sku, baselinkerId].map(v => (v ? String(v).trim() : '')).filter(Boolean);
    for (const extId of [...new Set(extCandidates)]) {
        try {
            const res = await apiClient.get(`https://api.allegro.pl/sale/offers?external.id=${encodeURIComponent(extId)}&limit=10`, {
                headers,
                _allegroAccountId: resolvedAccountId,
                _allegroWorkspaceId: workspaceId || null,
                timeout: 12000
            });
            addOffersFromResponse(res.data?.offers, extId === sku ? 'external_sku' : 'external_bl');
        } catch (err) {
            console.warn(`[AllegroService] Błąd wyszukiwania oferty po external.id=${extId} (konto ${resolvedAccountId}):`, err.message);
        }
    }

    if (collected.size === 0 && name) {
        const cleanQuery = String(name).trim().split(/\s+/).slice(0, 4).join(' ');
        if (cleanQuery.length >= 3) {
            const params = new URLSearchParams({ name: cleanQuery, limit: '10' });
            if (categoryId) params.set('category.id', String(categoryId));
            try {
                const res = await apiClient.get(`https://api.allegro.pl/sale/offers?${params.toString()}`, {
                    headers,
                    _allegroAccountId: resolvedAccountId,
                    _allegroWorkspaceId: workspaceId || null,
                    timeout: 12000
                });
                addOffersFromResponse(res.data?.offers, 'name_search');
            } catch (err) {
                console.warn(`[AllegroService] Błąd wyszukiwania oferty po nazwie "${cleanQuery}" (konto ${resolvedAccountId}):`, err.message);
            }
        }
    }

    const candidates = Array.from(collected.values()).slice(0, 6);

    // Weryfikujemy EAN wewnątrz top kandydatów przez GET /sale/product-offers/{id}
    const normTargetEan = ean ? String(ean).trim() : '';
    const enriched = await Promise.all(candidates.map(async (cand) => {
        try {
            const detail = await apiClient.get(`https://api.allegro.pl/sale/product-offers/${cand.id}`, {
                headers,
                _allegroAccountId: resolvedAccountId,
                _allegroWorkspaceId: workspaceId || null,
                timeout: 10000
            });
            const prodParams = detail.data?.productSet?.[0]?.product?.parameters || [];
            const eanParam = prodParams.find(p => String(p.id) === '225693' || /\b(?:ean|gtin)\b/i.test(p.name || ''));
            const offerEan = eanParam?.values?.[0] ? String(eanParam.values[0]).trim() : null;
            return {
                ...cand,
                offerEan,
                eanMatch: Boolean(normTargetEan && offerEan && normTargetEan === offerEan)
            };
        } catch (_) {
            return { ...cand, offerEan: null, eanMatch: false };
        }
    }));

    return enriched;
}

/**
 * Wyszukuje oferty na koncie sprzedawcy Allegro (lub równolegle na wszystkich podłączonych kontach wybranego klienta przy accountId='ALL').
 */
async function findSellerOffersForProduct({ ean = '', sku = '', name = '', baselinkerId = '', categoryId = '', accountId = null, workspaceId = null } = {}) {
    const reqAcc = accountId ? String(accountId).trim() : '';
    let results = [];

    if (reqAcc.toUpperCase() === 'ALL') {
        const accounts = await listConnectedAllegroAccounts(prisma, workspaceId);
        if (accounts.length === 0) {
            results = await findSellerOffersOnSingleAccount({ ean, sku, name, baselinkerId, categoryId, accountId: null, workspaceId });
        } else {
            const writeAccounts = accounts.filter(a => a.hasWriteScope);
            const targetAccounts = writeAccounts.length > 0 ? writeAccounts : accounts;
            const settled = await Promise.allSettled(
                targetAccounts.map(acc => findSellerOffersOnSingleAccount({
                    ean, sku, name, baselinkerId, categoryId, accountId: acc.accountId, workspaceId
                }))
            );
            for (const item of settled) {
                if (item.status === 'fulfilled' && Array.isArray(item.value)) {
                    results.push(...item.value);
                }
            }
        }
    } else {
        results = await findSellerOffersOnSingleAccount({ ean, sku, name, baselinkerId, categoryId, accountId: reqAcc || null, workspaceId });
    }

    results.sort((a, b) => {
        if (a.eanMatch !== b.eanMatch) return a.eanMatch ? -1 : 1;
        if (a.status !== b.status) return a.status === 'ACTIVE' ? -1 : (b.status === 'ACTIVE' ? 1 : 0);
        return 0;
    });

    return results;
}

async function tryFetchOfferOnAccount({ cleanOfferId, accountId = null, workspaceId = null, injectedPrisma = prisma, httpClient = apiClient }) {
    const { token, claims, accountId: resolvedAccountId, accountLabel, integrationAccountId } = await ensureSellerWriteToken(accountId, injectedPrisma, workspaceId);
    const headers = buildAllegroHeaders(token, { 'Accept-Language': 'pl-PL' });
    const offerRes = await httpClient.get(`https://api.allegro.pl/sale/product-offers/${encodeURIComponent(cleanOfferId)}`, {
        headers,
        _allegroAccountId: resolvedAccountId,
        _allegroWorkspaceId: workspaceId || null,
        timeout: 15000
    });
    return {
        offer: offerRes.data,
        token,
        claims,
        accountId: resolvedAccountId,
        accountLabel,
        integrationAccountId: integrationAccountId || null
    };
}

/**
 * Pobiera pełne dane konkretnej oferty oraz (opcjonalnie) dane powiązanego produktu z Katalogu Allegro (trustedContent).
 * Jeśli oferta zwraca 403/404 na wskazanym/domyślnym koncie, sprawdza wyłącznie pozostałe konta TEGO SAMEGO klienta (workspaceId).
 */
async function getOfferAndCatalogForParams(offerId, { accountId = null, workspaceId = null, allowCrossAccountFallback = true, injectedPrisma = prisma, httpClient = apiClient } = {}) {
    if (!offerId) throw new Error('Brak numeru oferty Allegro (offerId).');
    const cleanOfferId = String(offerId).trim();

    let fetched = null;
    const triedAccounts = new Set();
    const triedLabels = [];

    try {
        fetched = await tryFetchOfferOnAccount({ cleanOfferId, accountId, workspaceId, injectedPrisma, httpClient });
    } catch (primaryErr) {
        const status = primaryErr.response?.status || primaryErr.statusCode;
        const primaryAccKey = accountId ? String(accountId).trim() : '';
        if (primaryAccKey) {
            triedAccounts.add(primaryAccKey);
            triedLabels.push(`#${primaryAccKey}`);
        } else {
            // Ustal ID domyślnego konta z błędu/Vault, aby uniknąć ponownej próby na tym samym koncie
            try {
                const def = await ensureSellerWriteToken(null, injectedPrisma, workspaceId);
                if (def?.accountId) {
                    triedAccounts.add(String(def.accountId));
                    triedLabels.push(def.accountLabel || `#${def.accountId}`);
                }
            } catch (_) {
                // ignorujemy przy fallbacku diagnostycznym
            }
        }

        if (!allowCrossAccountFallback || (status !== 403 && status !== 404)) {
            throw primaryErr;
        }

        const connectedAccounts = await listConnectedAllegroAccounts(injectedPrisma, workspaceId);
        const candidates = connectedAccounts
            .filter(acc => !triedAccounts.has(String(acc.accountId)))
            .sort((a, b) => (b.hasWriteScope ? 1 : 0) - (a.hasWriteScope ? 1 : 0));

        for (const acc of candidates) {
            const candId = String(acc.accountId);
            triedAccounts.add(candId);
            triedLabels.push(acc.label || `#${candId}`);
            try {
                fetched = await tryFetchOfferOnAccount({ cleanOfferId, accountId: candId, workspaceId, injectedPrisma, httpClient });
                if (fetched) break;
            } catch (candErr) {
                const candStatus = candErr.response?.status || candErr.statusCode;
                if (candStatus !== 403 && candStatus !== 404) {
                    throw candErr;
                }
            }
        }

        if (!fetched) {
            const scopeHint = triedLabels.length > 0 ? triedLabels.join(', ') : 'domyślne';
            const err = new Error(
                `Nie znaleziono oferty #${cleanOfferId} na żadnym z autoryzowanych kont Allegro tego klienta (${scopeHint}). ` +
                `Jeśli aukcja należy do innego konta, podłącz jego token OAuth w Panelu Admina -> Integracje API.`
            );
            err.statusCode = 404;
            err.code = 'ALLEGRO_OFFER_NOT_OWNED_BY_CONNECTED_ACCOUNTS';
            throw err;
        }
    }

    const { offer, token, claims, accountId: resolvedAccountId, accountLabel, integrationAccountId } = fetched;
    const productId = offer?.productSet?.[0]?.product?.id || null;
    const headers = buildAllegroHeaders(token, { 'Accept-Language': 'pl-PL' });

    let catalogProduct = null;
    if (productId) {
        try {
            const catRes = await httpClient.get(`https://api.allegro.pl/sale/products/${encodeURIComponent(productId)}`, {
                headers,
                _allegroAccountId: resolvedAccountId,
                _allegroWorkspaceId: workspaceId || null,
                timeout: 12000
            });
            catalogProduct = catRes.data;
        } catch (err) {
            console.warn(`[AllegroService] Nie udało się pobrać szczegółów katalogowych produktu ${productId}:`, err.message);
        }
    }

    return { offer, catalogProduct, tokenClaims: claims, accountId: resolvedAccountId, accountLabel, integrationAccountId: integrationAccountId || null };
}

/**
 * Deterministycznie ocenia odpowiedź `POST /ingredients/parse` z Allegro API.
 * Agreguje `errors` i `warnings` zarówno z poziomu `products[0]`, jak i z każdego `products[0].items[i]`,
 * odrzucając deklaracje detergentów/biocydów (WE 648/2004) i nierozpoznane składy, przy jednoczesnym przepuszczaniu
 * poprawnych składów kosmetycznych INCI.
 */
function evaluateParsedIngredientsResponse({ parsedProd = {}, rawInci = '', productName = 'Produkt' } = {}) {
    const items = Array.isArray(parsedProd?.items) ? parsedProd.items : [];

    const warnings = [
        ...(Array.isArray(parsedProd?.warnings) ? parsedProd.warnings : []),
        ...items.flatMap(item => (Array.isArray(item?.warnings) ? item.warnings : []))
    ];
    const errors = [
        ...(Array.isArray(parsedProd?.errors) ? parsedProd.errors : []),
        ...items.flatMap(item => (Array.isArray(item?.errors) ? item.errors : []))
    ];

    const detergentHeaderPattern = /(?:%|\bcontains\b|\bzawiera\b|bleaching\s+agents|surfactants|środki\s+powierzchniowo|związki\s+wybielające|rozjaśniacze\s+optyczne)/i;
    const rawLooksLikeDetergent = /(?:(?:<|>|≤|≥|>=|<=)\s*\d+\s*%|\b\d+\s*[-–]\s*\d+\s*%|bleaching\s+agents|surfactants|środki\s+powierzchniowo\s+czynne|związki\s+wybielające)/i.test(String(rawInci || ''));

    const corruptedItemNames = items
        .map(item => String(item?.name || '').trim())
        .filter(name => name && detergentHeaderPattern.test(name));

    const components = items
        .map((item, idx) => ({
            name: item.name || (items.length === 1 ? (productName || 'Skład produktu').slice(0, 100) : `Składnik ${idx + 1}`),
            ingredients: (Array.isArray(item.ingredients) ? item.ingredients : [])
                .map(ing => ({ name: String(ing.name || '').trim() }))
                .filter(ing => ing.name !== '')
        }))
        .filter(c => c.ingredients.length > 0);

    const totalIngredients = components.reduce((sum, c) => sum + c.ingredients.length, 0);
    const unknownContexts = Array.from(new Set(
        warnings
            .filter(w => w && w.code === 'UNKNOWN_INGREDIENT')
            .map(w => String(w.context || w.message || '').trim())
            .filter(Boolean)
    ));
    const unknownWarningsCount = warnings.filter(w => w && w.code === 'UNKNOWN_INGREDIENT').length;
    const effectiveUnknownCount = unknownContexts.length > 0 ? unknownContexts.length : unknownWarningsCount;
    const recognizedIngredients = Math.max(0, totalIngredients - effectiveUnknownCount);

    let unsupportedReason = null;
    if (components.length === 0 || totalIngredients === 0) {
        unsupportedReason = 'Parser Allegro nie wyodrębnił żadnych składników INCI.';
    } else if (errors.length > 0) {
        const firstErr = errors[0]?.message || errors[0]?.code || 'Błąd składni składu INCI';
        unsupportedReason = `Parser Allegro odrzucił skład (${firstErr}).`;
    } else if (corruptedItemNames.length > 0) {
        unsupportedReason = `Wykryto deklarację detergentu/WE 648/2004 zamiast kosmetycznego INCI (parser potraktował "${corruptedItemNames[0]}" jako nazwę pod-produktu) — pominięto pole composition, aby uniknąć błędu języka 422.`;
    } else if (recognizedIngredients === 0 || (effectiveUnknownCount > 0 && (recognizedIngredients / totalIngredients) < 0.5)) {
        const preview = unknownContexts.slice(0, 4).join(', ');
        unsupportedReason = rawLooksLikeDetergent
            ? `Skład w formacie detergentu WE 648/2004 nie jest rozpoznawany przez słownik kosmetyczny INCI Allegro (nierozpoznane: ${preview || effectiveUnknownCount}/${totalIngredients}) — pole composition zostało pominięte.`
            : `Parser Allegro nie rozpoznał większości składników w standardzie INCI (${recognizedIngredients}/${totalIngredients} rozpoznanych${preview ? `; nieznane: ${preview}` : ''}) — pole composition zostało pominięte.`;
    } else if (rawLooksLikeDetergent && effectiveUnknownCount > 0) {
        const preview = unknownContexts.slice(0, 4).join(', ');
        unsupportedReason = `Skład detergentu WE 648/2004 zawiera nierozpoznane elementy dla słownika INCI Allegro (${preview}) — pole composition zostało pominięte.`;
    }

    return {
        supported: unsupportedReason === null,
        unsupportedReason,
        components: components.length > 0 ? components : null,
        warnings,
        errors,
        totalIngredients,
        recognizedIngredients,
        unknownIngredients: unknownContexts,
        rawResult: parsedProd
    };
}

/**
 * Waliduje i parsuje listę składników INCI przez oficjalny endpoint Allegro `POST /ingredients/parse`.
 */
async function parseIngredientsWithAllegro({ categoryId, productId = '1', productName = 'Produkt', rawInci = '', accountId = null, workspaceId = null } = {}) {
    if (!categoryId || !rawInci || String(rawInci).trim() === '') {
        return {
            supported: false,
            unsupportedReason: 'Brak kategorii lub składu INCI.',
            components: null,
            warnings: [],
            errors: ['Brak kategorii lub składu INCI.'],
            totalIngredients: 0,
            recognizedIngredients: 0,
            unknownIngredients: []
        };
    }
    const { token, accountId: resolvedAccountId } = await ensureSellerWriteToken(accountId, prisma, workspaceId);
    const headers = buildAllegroHeaders(token, {
        'Content-Type': 'application/vnd.allegro.public.v1+json',
        'Accept-Language': 'pl-PL'
    });

    const res = await apiClient.post('https://api.allegro.pl/ingredients/parse', {
        categoryId: String(categoryId),
        products: [
            {
                id: String(productId),
                name: String(productName || 'Produkt').slice(0, 120),
                ingredients: String(rawInci)
            }
        ]
    }, { headers, _allegroAccountId: resolvedAccountId, _allegroWorkspaceId: workspaceId || null, timeout: 15000 });

    const parsedProd = res.data?.products?.[0] || {};
    return evaluateParsedIngredientsResponse({ parsedProd, rawInci, productName });
}

/**
 * Formatuje tablicę błędów Allegro REST API (`422` / `400` / `403`) do czytelnego opisu z metadanymi.
 */
function formatAllegroApiErrors(data) {
    if (!data || !Array.isArray(data.errors) || data.errors.length === 0) {
        return typeof data === 'string' ? data : JSON.stringify(data || 'Nieznany błąd API Allegro');
    }
    return data.errors.map(e => {
        const msg = e.userMessage || e.message || e.code || 'Błąd walidacji';
        const pathInfo = e.path ? ` [${e.path}]` : '';
        const meta = e.metadata && Object.keys(e.metadata).length > 0 ? ` (${JSON.stringify(e.metadata)})` : '';
        return `${msg}${pathInfo}${meta}`;
    }).join(' | ');
}

/**
 * Normalizuje bufor obrazu do dozwolonego typu MIME Allegro (`image/jpeg`, `image/png`, `image/webp`).
 */
async function normalizeBinaryForAllegroUpload(buffer, rawMime = 'image/jpeg') {
    let mime = String(rawMime || 'image/jpeg').split(';')[0].trim().toLowerCase();
    if (mime === 'image/jpg') mime = 'image/jpeg';
    if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') {
        return { buffer, mimeType: mime };
    }
    const converted = await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
    return { buffer: converted, mimeType: 'image/jpeg' };
}

/**
 * Wgrywa pojedyncze zdjęcie (DataURI base64 lub zewnętrzny URL HTTP/HTTPS) na serwer Allegro `POST https://upload.allegro.pl/sale/images`.
 * Zwraca docelowy adres URL w domenie `a.allegroimg.com`.
 */
async function uploadImageToAllegro({ source, isAiCoCreated = false, accountId = null, workspaceId = null, httpClient = apiClient, injectedPrisma = prisma } = {}) {
    if (!source || typeof source !== 'string') {
        throw new Error('Brak źródła obrazu do wysłania na Allegro.');
    }
    const cleanSource = source.trim();
    if (isAllegroHostedImageUrl(cleanSource)) {
        return {
            url: cleanSource,
            isAiCoCreated: Boolean(isAiCoCreated),
            skippedUpload: true,
            expiresAt: null
        };
    }

    const { token, accountId: resolvedAccountId } = await ensureSellerWriteToken(accountId, injectedPrisma, workspaceId);
    const aiFlag = Boolean(isAiCoCreated);
    const cacheKey = crypto.createHash('sha256').update(`${workspaceId || 'legacy'}:${resolvedAccountId || 'default'}:${aiFlag}:${cleanSource}`).digest('hex');
    const cached = uploadedImageCache.get(cacheKey);
    if (cached && cached.url && (!cached.expiresAt || (new Date(cached.expiresAt).getTime() - Date.now() > 5 * 60 * 1000))) {
        return {
            url: cached.url,
            isAiCoCreated: aiFlag,
            skippedUpload: false,
            cached: true,
            expiresAt: cached.expiresAt
        };
    }

    const uploadBinaryBuffer = async (buf, rawMime) => {
        const { buffer: readyBuf, mimeType } = await normalizeBinaryForAllegroUpload(buf, rawMime);
        const res = await httpClient.post(
            `https://upload.allegro.pl/sale/images?isAiCoCreated=${aiFlag}`,
            readyBuf,
            {
                headers: buildAllegroHeaders(token, {
                    'Content-Type': mimeType,
                    'Accept-Language': 'pl-PL'
                }),
                _allegroAccountId: resolvedAccountId,
                _allegroWorkspaceId: workspaceId || null,
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
                timeout: 30000
            }
        );
        const location = res.data?.location;
        if (!location) {
            throw new Error('Allegro /sale/images nie zwróciło pola location po uploadzie binarnym.');
        }
        return {
            url: location,
            expiresAt: res.data?.expiresAt || null
        };
    };

    try {
        let uploadRes = null;

        if (cleanSource.startsWith('data:image/')) {
            const match = cleanSource.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,([\s\S]+)$/);
            if (!match) {
                throw new Error('Nieprawidłowy format obrazu DataURI (oczekiwano data:image/...;base64,...).');
            }
            const rawMime = match[1];
            const buf = Buffer.from(match[2], 'base64');
            uploadRes = await uploadBinaryBuffer(buf, rawMime);
        } else if (cleanSource.startsWith('http://') || cleanSource.startsWith('https://')) {
            try {
                const jsonRes = await httpClient.post(
                    'https://upload.allegro.pl/sale/images',
                    { url: cleanSource, isAiCoCreated: aiFlag },
                    {
                        headers: buildAllegroHeaders(token, {
                            'Content-Type': 'application/vnd.allegro.public.v1+json',
                            'Accept-Language': 'pl-PL'
                        }),
                        _allegroAccountId: resolvedAccountId,
                        _allegroWorkspaceId: workspaceId || null,
                        timeout: 25000
                    }
                );
                if (!jsonRes.data?.location) {
                    throw new Error('Brak pola location w odpowiedzi JSON uploadu Allegro.');
                }
                uploadRes = {
                    url: jsonRes.data.location,
                    expiresAt: jsonRes.data?.expiresAt || null
                };
            } catch (urlErr) {
                const status = urlErr.response?.status;
                if (status === 401 || status === 403) {
                    throw urlErr;
                }
                // Fallback: pobranie bufora przez nasz serwer i upload binarny (omija blokady CDN/WAF zewnętrznych serwerów)
                const dlRes = await axios.get(cleanSource, {
                    responseType: 'arraybuffer',
                    timeout: 15000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'image/*,*/*;q=0.8'
                    }
                });
                const dlMime = dlRes.headers?.['content-type'] || 'image/jpeg';
                uploadRes = await uploadBinaryBuffer(Buffer.from(dlRes.data), dlMime);
            }
        } else {
            throw new Error(`Nieobsługiwany protokół obrazu: ${cleanSource.slice(0, 40)}`);
        }

        uploadedImageCache.set(cacheKey, uploadRes);
        return {
            url: uploadRes.url,
            expiresAt: uploadRes.expiresAt,
            isAiCoCreated: aiFlag,
            skippedUpload: false
        };
    } catch (error) {
        const status = error.response?.status;
        const details = formatAllegroApiErrors(error.response?.data || error.message);
        const err = new Error(`Allegro Image Upload error (${status || 'NETWORK'}): ${details}`);
        err.statusCode = status || 500;
        err.allegroErrors = error.response?.data?.errors || null;
        throw err;
    }
}

/**
 * Wysyła `PATCH /sale/product-offers/{offerId}` wraz z automatycznym pollingiem operacji asynchronicznej `202 -> 303`.
 */
async function patchProductOffer(offerId, patchBody, { pollMaxAttempts = 12, pollIntervalMs = 1000, accountId = null, workspaceId = null } = {}) {
    if (!offerId) throw new Error('Brak numeru oferty Allegro (offerId).');
    const cleanOfferId = String(offerId).trim();
    const { token, accountId: resolvedAccountId } = await ensureSellerWriteToken(accountId, prisma, workspaceId);

    const headers = buildAllegroHeaders(token, {
        'Content-Type': 'application/vnd.allegro.public.v1+json',
        'Accept-Language': 'pl-PL'
    });

    try {
        const patchRes = await apiClient.patch(
            `https://api.allegro.pl/sale/product-offers/${encodeURIComponent(cleanOfferId)}`,
            patchBody,
            {
                headers,
                _allegroAccountId: resolvedAccountId,
                _allegroWorkspaceId: workspaceId || null,
                timeout: 20000,
                validateStatus: (status) => status >= 200 && status < 400
            }
        );

        if (patchRes.status === 200) {
            return {
                status: 'COMPLETED',
                httpStatus: 200,
                offer: patchRes.data
            };
        }

        if (patchRes.status === 202) {
            const locationPath = patchRes.headers?.location || patchRes.headers?.Location;
            if (!locationPath) {
                return { status: 'ACCEPTED_NO_LOCATION', httpStatus: 202 };
            }
            const pollUrl = locationPath.startsWith('http')
                ? locationPath
                : `https://api.allegro.pl${locationPath.startsWith('/') ? '' : '/'}${locationPath}`;

            for (let attempt = 1; attempt <= pollMaxAttempts; attempt++) {
                await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
                const pollRes = await apiClient.get(pollUrl, {
                    headers: buildAllegroHeaders(token, { 'Accept-Language': 'pl-PL' }),
                    _allegroAccountId: resolvedAccountId,
                    _allegroWorkspaceId: workspaceId || null,
                    maxRedirects: 0,
                    validateStatus: (s) => (s >= 200 && s < 400),
                    timeout: 15000
                });

                if (pollRes.status === 303 || pollRes.status === 200) {
                    return {
                        status: 'COMPLETED',
                        httpStatus: pollRes.status,
                        attempts: attempt
                    };
                }
            }

            return {
                status: 'PENDING_TIMEOUT',
                httpStatus: 202,
                location: pollUrl
            };
        }

        return { status: 'COMPLETED', httpStatus: patchRes.status };
    } catch (error) {
        const status = error.response?.status;
        const details = formatAllegroApiErrors(error.response?.data || error.message);
        const err = new Error(`Allegro API PATCH error (${status || 'NETWORK'}): ${details}`);
        err.statusCode = status || 500;
        err.allegroErrors = error.response?.data?.errors || null;
        throw err;
    }
}

module.exports = {
    ALLEGRO_VAULT_KEY,
    ALLEGRO_COMPOSITION_UNSUPPORTED_KEY,
    ALLEGRO_COMPOSITION_UNSUPPORTED_TTL_MS,
    readAllegroAccountsVault,
    writeAllegroAccountsVault,
    resolveAccountIdOrDefault,
    listConnectedAllegroAccounts,
    saveAccountFromTokenData,
    setDefaultAllegroAccount,
    updateAllegroAccountLabel,
    removeAllegroAccount,
    getAllegroToken,
    inspectTokenClaims,
    ensureSellerWriteToken,
    getOfferImages,
    getFullOfferData,
    fetchCategoryParameters,
    getCategoryParametersFull,
    findCategoryByEan,
    findMatchingCategoryByName,
    getMatchingCategoriesForTitle,
    getCatalogProductInfoByEan,
    getProductParametersByEan,
    findSellerOffersForProduct,
    getOfferAndCatalogForParams,
    parseIngredientsWithAllegro,
    evaluateParsedIngredientsResponse,
    isAllegroCompositionCategoryError,
    isAllegroCompositionValidationError,
    isAllegroTitleEditError,
    getCategoryCompositionSupport,
    markCategoryCompositionUnsupported,
    clearCategoryCompositionUnsupported,
    uploadImageToAllegro,
    patchProductOffer,
    formatAllegroApiErrors,
    startDeviceFlow,
    pollForToken,
    searchProducts,
    getListingCompetitors,
    apiClient
};


