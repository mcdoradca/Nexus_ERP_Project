const crypto = require('crypto');
const axios = require('axios');

const BASELINKER_API_URL = 'https://api.baselinker.com/connector.php';
const ENC_PREFIX = 'enc:v1:';
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
 * Wyprowadza 256-bitowy klucz AES z BASELINKER_VAULT_KEY lub JWT_SECRET.
 */
function deriveVaultKey() {
    const rawSecret = (process.env.BASELINKER_VAULT_KEY || process.env.JWT_SECRET || '').trim();
    if (!rawSecret || rawSecret.length < 16) {
        throw new Error('VAULT_KEY_MISSING: Brak klucza szyfrującego (BASELINKER_VAULT_KEY lub JWT_SECRET >= 16 znaków).');
    }
    return crypto.createHash('sha256').update(rawSecret, 'utf8').digest();
}

/**
 * Szyfruje sekret algorytmem AES-256-GCM z losowym 96-bitowym wektorem IV.
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
 * Odszyfrowuje sekret zapisany w formacie enc:v1 (zachowuje kompatybilność wsteczną dla starszych wpisów bez prefiksu).
 */
function decryptSecret(storedValue) {
    if (typeof storedValue !== 'string' || !storedValue.trim()) {
        return null;
    }
    const clean = storedValue.trim();
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
        throw new Error(`VAULT_DECRYPT_FAILED: Nie udało się odszyfrować tokena (${err.message}). Sprawdź spójność JWT_SECRET / BASELINKER_VAULT_KEY.`);
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
 * Pobiera aktywny token BaseLinkera (priorytet: zmienna środowiskowa BASELINKER_TOKEN -> zaszyfrowany SystemSetting).
 */
async function resolveBaseLinkerToken(injectedPrisma = null) {
    const envToken = (process.env.BASELINKER_TOKEN || '').trim();
    if (envToken.length >= 5) {
        return {
            token: envToken,
            source: 'env',
            encrypted: true,
            updatedAt: null
        };
    }

    const prisma = getPrismaClient(injectedPrisma);
    const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
    if (!tokenRecord || !tokenRecord.value || tokenRecord.value.trim().length < 5) {
        return {
            token: null,
            source: 'none',
            encrypted: false,
            updatedAt: tokenRecord?.updatedAt || null
        };
    }

    const isEncrypted = tokenRecord.value.trim().startsWith(ENC_PREFIX);
    const decrypted = decryptSecret(tokenRecord.value);
    return {
        token: decrypted,
        source: 'db',
        encrypted: isEncrypted,
        updatedAt: tokenRecord.updatedAt || null
    };
}

/**
 * Zwraca gotowy token BaseLinkera lub rzuca błąd konfiguracyjny.
 */
async function getBaseLinkerToken(injectedPrisma = null) {
    const resolved = await resolveBaseLinkerToken(injectedPrisma);
    if (!resolved.token || resolved.token.length < 5) {
        throw new Error('Brak ważnego klucza BASELINKER_TOKEN w .env ani w tabeli SystemSetting.');
    }
    return resolved.token;
}

module.exports = {
    ENC_PREFIX,
    MIN_BASELINKER_TOKEN_LENGTH,
    encryptSecret,
    decryptSecret,
    testBaseLinkerToken,
    resolveBaseLinkerToken,
    getBaseLinkerToken
};

