const crypto = require('crypto');
const axios = require('axios');

const BASELINKER_API_URL = 'https://api.baselinker.com/connector.php';
const ENC_PREFIX = 'enc:v1:';
const ENC_V2_PREFIX = 'enc:v2:k1:';
const MIN_BASELINKER_TOKEN_LENGTH = 25;

let _fallbackPrisma = null;

function getPrismaClient(injectedPrisma) {
    if (injectedPrisma) return injectedPrisma;
    if (!_fallbackPrisma) {
        const { PrismaClient } = require('@prisma/client');
        _fallbackPrisma = new PrismaClient();
    }
    return _fallbackPrisma;
}

/**
 * Wyprowadza 256-bitowy klucz AES z VAULT_MASTER_KEY, BASELINKER_VAULT_KEY lub JWT_SECRET.
 */
function deriveVaultKey() {
    const rawSecret = (process.env.VAULT_MASTER_KEY || process.env.BASELINKER_VAULT_KEY || process.env.JWT_SECRET || '').trim();
    if (!rawSecret || rawSecret.length < 16) {
        throw new Error('VAULT_KEY_MISSING: Brak klucza szyfrującego (VAULT_MASTER_KEY, BASELINKER_VAULT_KEY lub JWT_SECRET >= 16 znaków).');
    }
    return crypto.createHash('sha256').update(rawSecret, 'utf8').digest();
}

/**
 * Buduje stabilny kontekst AAD wiążący szyfrogram z konkretnym klientem (workspace), kanałem i kontem integracji.
 */
function buildIntegrationAad(workspaceId, provider, accountId) {
    return `${String(workspaceId || '').trim()}:${String(provider || '').trim().toUpperCase()}:${String(accountId || '').trim()}`;
}

/**
 * Szyfruje sekret algorytmem AES-256-GCM z losowym 96-bitowym wektorem IV (format legacy enc:v1).
 */
function encryptSecret(plaintext) {
    if (typeof plaintext !== 'string' || !plaintext.trim()) {
        throw new Error('VAULT_EMPTY_SECRET: Nie można zaszyfrować pustego sekretu.');
    }
    const clean = plaintext.trim();
    const key = deriveVaultKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${ENC_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Szyfruje sekret algorytmem AES-256-GCM z AAD (Additional Authenticated Data) w formacie enc:v2:k1.
 * Próba przeniesienia szyfrogramu do innego klienta (workspace) lub konta unieważnia tag GCM.
 */
function encryptSecretWithAad(plaintext, aad) {
    if (typeof plaintext !== 'string' || !plaintext.trim()) {
        throw new Error('VAULT_EMPTY_SECRET: Nie można zaszyfrować pustego sekretu.');
    }
    const aadStr = String(aad || '').trim();
    if (!aadStr) {
        throw new Error('VAULT_AAD_MISSING: Wymagany kontekst AAD do szyfrowania wieloklienckiego.');
    }
    const clean = plaintext.trim();
    const key = deriveVaultKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aadStr, 'utf8'));
    const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${ENC_V2_PREFIX}${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * Odszyfrowuje sekret zapisany w formacie enc:v1 (zachowuje kompatybilność wsteczną dla starszych wpisów bez prefiksu).
 */
function decryptSecret(storedValue) {
    if (typeof storedValue !== 'string' || !storedValue.trim()) {
        return null;
    }
    const clean = storedValue.trim();
    if (clean.startsWith(ENC_V2_PREFIX)) {
        throw new Error('VAULT_AAD_REQUIRED: Sekret w formacie enc:v2 wymaga podania kontekstu AAD.');
    }
    if (!clean.startsWith(ENC_PREFIX)) {
        return clean;
    }
    const payload = clean.slice(ENC_PREFIX.length);
    const parts = payload.split(':');
    if (parts.length !== 3) {
        throw new Error('VAULT_CORRUPT_PAYLOAD: Uszkodzony format zaszyfrowanego tokena.');
    }
    const [ivB64, tagB64, dataB64] = parts;
    try {
        const key = deriveVaultKey();
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(tagB64, 'base64');
        const encrypted = Buffer.from(dataB64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8').trim();
    } catch (err) {
        throw new Error(`VAULT_DECRYPT_FAILED: Nie udało się odszyfrować tokena (${err.message}). Sprawdź spójność VAULT_MASTER_KEY / BASELINKER_VAULT_KEY / JWT_SECRET.`);
    }
}

/**
 * Odszyfrowuje sekret enc:v2:k1 z weryfikacją AAD (z fallbackiem do enc:v1 dla starszych rekordów).
 */
function decryptSecretWithAad(storedValue, aad) {
    if (typeof storedValue !== 'string' || !storedValue.trim()) {
        return null;
    }
    const clean = storedValue.trim();
    if (!clean.startsWith(ENC_V2_PREFIX)) {
        return decryptSecret(clean);
    }
    const aadStr = String(aad || '').trim();
    if (!aadStr) {
        throw new Error('VAULT_AAD_MISSING: Brak kontekstu AAD przy odszyfrowaniu sekretu.');
    }
    const payload = clean.slice(ENC_V2_PREFIX.length);
    const parts = payload.split(':');
    if (parts.length !== 3) {
        throw new Error('VAULT_CORRUPT_PAYLOAD: Uszkodzony format zaszyfrowanego tokena v2.');
    }
    const [ivB64, tagB64, dataB64] = parts;
    try {
        const key = deriveVaultKey();
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(tagB64, 'base64');
        const encrypted = Buffer.from(dataB64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAAD(Buffer.from(aadStr, 'utf8'));
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
        return decrypted.toString('utf8').trim();
    } catch (err) {
        throw new Error(`VAULT_AAD_DECRYPT_FAILED: Odmowa odszyfrowania sekretu dla wskazanego klienta/konta (${err.message}).`);
    }
}

/**
 * Weryfikuje token Base.com żądaniem getInventories przed jakimkolwiek zapisem do bazy.
 * Nie zwraca ani nie loguje treści samego tokena.
 */
async function testBaseLinkerToken(candidateToken, httpPostFn = null) {
    const clean = typeof candidateToken === 'string' ? candidateToken.trim() : '';
    if (!clean || clean.length < MIN_BASELINKER_TOKEN_LENGTH) {
        return {
            ok: false,
            errorCode: 'INVALID_TOKEN_FORMAT',
            errorMessage: `Token jest za krótki (otrzymano ${clean.length} zn., wymagane co najmniej ${MIN_BASELINKER_TOKEN_LENGTH} zn. — prawdopodobnie wklejono hasło lub ucięty klucz).`
        };
    }
    if (/\s/.test(clean)) {
        return {
            ok: false,
            errorCode: 'INVALID_TOKEN_WHITESPACE',
            errorMessage: 'Token zawiera niedozwolone białe znaki lub znaki nowej linii w środku ciągu.'
        };
    }

    try {
        const params = new URLSearchParams();
        params.append('method', 'getInventories');
        params.append('parameters', '{}');

        const postCall = httpPostFn || axios.post;
        const response = await postCall(BASELINKER_API_URL, params.toString(), {
            headers: {
                'X-BLToken': clean,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            timeout: 12000
        });

        const data = response?.data;
        if (data && data.status === 'SUCCESS') {
            const inventories = Array.isArray(data.inventories)
                ? data.inventories.map(inv => ({
                    inventory_id: inv.inventory_id,
                    name: inv.name,
                    is_default: Boolean(inv.is_default)
                }))
                : [];
            return { ok: true, inventories };
        }

        return {
            ok: false,
            errorCode: data?.error_code || 'BASELINKER_ERROR',
            errorMessage: data?.error_message || 'BaseLinker API odrzuciło token.'
        };
    } catch (err) {
        return {
            ok: false,
            errorCode: 'BASELINKER_NETWORK_ERROR',
            errorMessage: `Błąd połączenia z API BaseLinker: ${err.message}`
        };
    }
}

/**
 * Pobiera aktywny token BaseLinkera dla wskazanego klienta (workspaceId) oraz opcjonalnie konta (accountId).
 * Zasada Fail-Closed: dla klientów niedomyślnych brak IntegrationAccount zwraca token=null bez fallbacku do .env czy domyślnego klienta.
 */
async function resolveBaseLinkerToken(injectedPrisma = null, options = {}) {
    const prisma = getPrismaClient(injectedPrisma);
    const workspaceId = options?.workspaceId ? String(options.workspaceId).trim() : null;
    const requestedAccountId = options?.accountId ? String(options.accountId).trim() : null;

    if (workspaceId && prisma?.integrationAccount && typeof prisma.integrationAccount.findMany === 'function') {
        const accounts = await prisma.integrationAccount.findMany({
            where: {
                workspaceId,
                provider: 'BASELINKER',
                isActive: true
            },
            orderBy: [
                { isDefault: 'desc' },
                { createdAt: 'asc' }
            ]
        });

        let selected = null;
        if (requestedAccountId) {
            selected = accounts.find(a => a.id === requestedAccountId) || null;
            if (!selected) {
                return {
                    token: null,
                    source: 'none',
                    encrypted: false,
                    updatedAt: null,
                    accountId: null,
                    accountLabel: null,
                    workspaceId
                };
            }
        } else {
            selected = accounts[0] || null;
        }

        if (selected && selected.credentialsEnc) {
            const aad = buildIntegrationAad(selected.workspaceId, 'BASELINKER', selected.id);
            const rawPlain = decryptSecretWithAad(selected.credentialsEnc, aad);
            let tokenValue = rawPlain;
            try {
                const parsed = JSON.parse(rawPlain);
                if (parsed && typeof parsed === 'object' && parsed.token) {
                    tokenValue = String(parsed.token).trim();
                }
            } catch (_) {
                tokenValue = String(rawPlain || '').trim();
            }

            if (tokenValue && tokenValue.length >= 5) {
                return {
                    token: tokenValue,
                    source: 'workspace_vault',
                    encrypted: true,
                    updatedAt: selected.updatedAt || null,
                    accountId: selected.id,
                    accountLabel: selected.label,
                    workspaceId: selected.workspaceId
                };
            }
        }

        // Dla klientów niedomyślnych TWARDA BLOKADA (Fail-Closed): brak tokena tego klienta nie może sięgnąć do .env ani SystemSetting
        let isDefaultWorkspace = false;
        if (prisma?.workspace && typeof prisma.workspace.findUnique === 'function') {
            const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { isDefault: true } });
            isDefaultWorkspace = Boolean(ws?.isDefault);
        }

        if (!isDefaultWorkspace || requestedAccountId) {
            return {
                token: null,
                source: 'none',
                encrypted: false,
                updatedAt: null,
                accountId: null,
                accountLabel: null,
                workspaceId
            };
        }
    }

    const envToken = (process.env.BASELINKER_TOKEN || '').trim();
    if (envToken.length >= 5) {
        return {
            token: envToken,
            source: 'env',
            encrypted: true,
            updatedAt: null,
            accountId: null,
            accountLabel: 'ENV Fallback',
            workspaceId
        };
    }

    if (!prisma?.systemSetting || typeof prisma.systemSetting.findUnique !== 'function') {
        return {
            token: null,
            source: 'none',
            encrypted: false,
            updatedAt: null,
            accountId: null,
            accountLabel: null,
            workspaceId
        };
    }

    const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
    if (!tokenRecord || !tokenRecord.value || tokenRecord.value.trim().length < 5) {
        return {
            token: null,
            source: 'none',
            encrypted: false,
            updatedAt: tokenRecord?.updatedAt || null,
            accountId: null,
            accountLabel: null,
            workspaceId
        };
    }

    const isEncrypted = tokenRecord.value.trim().startsWith(ENC_PREFIX) || tokenRecord.value.trim().startsWith(ENC_V2_PREFIX);
    const decrypted = decryptSecret(tokenRecord.value);
    return {
        token: decrypted,
        source: 'db',
        encrypted: isEncrypted,
        updatedAt: tokenRecord.updatedAt || null,
        accountId: null,
        accountLabel: 'Domyślne (Legacy)',
        workspaceId
    };
}

/**
 * Zwraca gotowy token BaseLinkera dla wskazanego klienta/konta lub rzuca błąd konfiguracyjny.
 */
async function getBaseLinkerToken(injectedPrisma = null, options = {}) {
    const resolved = await resolveBaseLinkerToken(injectedPrisma, options);
    if (!resolved.token || resolved.token.length < 5) {
        if (options?.workspaceId) {
            throw new Error(`Brak skonfigurowanego aktywnego tokena BaseLinker dla klienta (workspaceId: ${options.workspaceId}). Dodaj klucz w Panelu Admina -> Klienci i Integracje.`);
        }
        throw new Error('Brak ważnego klucza BASELINKER_TOKEN w .env ani w tabeli SystemSetting.');
    }
    return resolved.token;
}

module.exports = {
    ENC_PREFIX,
    ENC_V2_PREFIX,
    MIN_BASELINKER_TOKEN_LENGTH,
    buildIntegrationAad,
    encryptSecret,
    encryptSecretWithAad,
    decryptSecret,
    decryptSecretWithAad,
    testBaseLinkerToken,
    resolveBaseLinkerToken,
    getBaseLinkerToken
};
