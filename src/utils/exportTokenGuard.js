const crypto = require('crypto');

const DEFAULT_EXPORT_TTL_MS = 5 * 60 * 1000;
const PROCESS_FALLBACK_SECRET = crypto.randomBytes(32).toString('hex');
const consumedNonces = new Map(); // nonce -> expiresAtMs

function getExportHmacSecret() {
    return (process.env.JWT_SECRET || PROCESS_FALLBACK_SECRET).trim();
}

function computeCanonicalHash(obj) {
    return crypto.createHash('sha256').update(JSON.stringify(obj || {})).digest('hex');
}

function pruneExpiredNonces(nowMs = Date.now()) {
    for (const [nonce, exp] of consumedNonces.entries()) {
        if (!exp || exp <= nowMs) {
            consumedNonces.delete(nonce);
        }
    }
}

/**
 * Podpisuje jednorazowy kryptograficzny token potwierdzenia eksportu wiążący:
 * klienta (workspaceId), operatora (userId), kanał (provider), konto integracji (integrationAccountId),
 * zasób docelowy (targetId), EAN produktu oraz SHA-256 ładunku.
 */
function signScopedExportToken({
    workspaceId = '',
    userId = '',
    provider = '',
    integrationAccountId = '',
    targetId = '',
    ean = '',
    payloadObj = {}
} = {}) {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(12).toString('hex');
    const payloadHash = computeCanonicalHash(payloadObj);

    const claims = {
        ws: String(workspaceId || ''),
        uid: String(userId || ''),
        prov: String(provider || ''),
        acc: String(integrationAccountId || ''),
        tgt: String(targetId || ''),
        ean: String(ean || ''),
        h: payloadHash,
        ts: timestamp,
        nonce
    };
    const sigInput = `${claims.ws}:${claims.uid}:${claims.prov}:${claims.acc}:${claims.tgt}:${claims.ean}:${claims.h}:${claims.ts}:${claims.nonce}`;
    const sig = crypto.createHmac('sha256', getExportHmacSecret()).update(sigInput).digest('hex');

    return Buffer.from(JSON.stringify({ ...claims, sig })).toString('base64');
}

/**
 * Weryfikuje podpis, TTL, zgodność kontekstu (klient, użytkownik, konto docelowe, payload) i jednorazowość tokena.
 */
function verifyAndConsumeScopedExportToken(token, {
    workspaceId = '',
    userId = '',
    provider = '',
    integrationAccountId = '',
    targetId = '',
    ean = '',
    payloadObj = null,
    ttlMs = DEFAULT_EXPORT_TTL_MS,
    consumeNonce = true
} = {}) {
    if (!token || typeof token !== 'string') {
        const err = new Error('Brak kryptograficznego tokenu weryfikacji (exportToken). Wykonaj najpierw walidację Pre-flight.');
        err.statusCode = 400;
        err.code = 'EXPORT_TOKEN_MISSING';
        throw err;
    }

    let decoded;
    try {
        decoded = JSON.parse(Buffer.from(String(token), 'base64').toString('utf8'));
    } catch (_) {
        const err = new Error('Uszkodzony format tokenu eksportu.');
        err.statusCode = 403;
        err.code = 'EXPORT_TOKEN_CORRUPT';
        throw err;
    }

    const expectedSigInput = `${decoded.ws || ''}:${decoded.uid || ''}:${decoded.prov || ''}:${decoded.acc || ''}:${decoded.tgt || ''}:${decoded.ean || ''}:${decoded.h || ''}:${decoded.ts || ''}:${decoded.nonce || ''}`;
    const expectedSig = crypto.createHmac('sha256', getExportHmacSecret()).update(expectedSigInput).digest('hex');

    const sigBufA = Buffer.from(String(decoded.sig || ''), 'utf8');
    const sigBufB = Buffer.from(expectedSig, 'utf8');
    if (sigBufA.length !== sigBufB.length || !crypto.timingSafeEqual(sigBufA, sigBufB)) {
        const err = new Error('Nieważny podpis kryptograficzny tokenu eksportu.');
        err.statusCode = 403;
        err.code = 'EXPORT_TOKEN_INVALID_SIGNATURE';
        throw err;
    }

    const nowMs = Date.now();
    if (!Number.isFinite(Number(decoded.ts)) || nowMs - Number(decoded.ts) > ttlMs) {
        const err = new Error('Token eksportu wygasł (limit 5 minut). Odśwież weryfikację Pre-flight.');
        err.statusCode = 403;
        err.code = 'EXPORT_TOKEN_EXPIRED';
        throw err;
    }

    if (String(decoded.ws || '') !== String(workspaceId || '')) {
        const err = new Error('Token eksportu wygenerowano dla innego klienta (Workspace). Eksport zablokowany.');
        err.statusCode = 403;
        err.code = 'EXPORT_TOKEN_WORKSPACE_MISMATCH';
        throw err;
    }
    if (userId && decoded.uid && String(decoded.uid) !== String(userId)) {
        const err = new Error('Token eksportu należy do innego operatora.');
        err.statusCode = 403;
        err.code = 'EXPORT_TOKEN_USER_MISMATCH';
        throw err;
    }
    if (provider && String(decoded.prov || '') !== String(provider)) {
        const err = new Error('Token eksportu dotyczy innego kanału sprzedaży.');
        err.statusCode = 403;
        err.code = 'EXPORT_TOKEN_PROVIDER_MISMATCH';
        throw err;
    }
    if (String(decoded.acc || '') !== String(integrationAccountId || '')) {
        const err = new Error('Zmieniono docelowe konto integracji po weryfikacji Pre-flight. Odśwież weryfikację.');
        err.statusCode = 403;
        err.code = 'EXPORT_TOKEN_ACCOUNT_MISMATCH';
        throw err;
    }
    if (String(decoded.tgt || '') !== String(targetId || '') || String(decoded.ean || '') !== String(ean || '')) {
        const err = new Error('Niezgodność produktu lub oferty docelowej w tokenie eksportu.');
        err.statusCode = 403;
        err.code = 'EXPORT_TOKEN_TARGET_MISMATCH';
        throw err;
    }
    if (payloadObj !== null && payloadObj !== undefined) {
        const expectedHash = computeCanonicalHash(payloadObj);
        if (decoded.h !== expectedHash) {
            const err = new Error('Dane oferty uległy zmianie od momentu weryfikacji Pre-flight. Wykonaj ponowną weryfikację.');
            err.statusCode = 409;
            err.code = 'EXPORT_TOKEN_PAYLOAD_MODIFIED';
            throw err;
        }
    }

    if (consumeNonce) {
        pruneExpiredNonces(nowMs);
        if (!decoded.nonce || consumedNonces.has(decoded.nonce)) {
            const err = new Error('Ten token eksportu został już wykorzystany (ochrona przed powtórzeniem żądania). Odśwież weryfikację Pre-flight.');
            err.statusCode = 409;
            err.code = 'EXPORT_TOKEN_REPLAY';
            throw err;
        }
        consumedNonces.set(decoded.nonce, Number(decoded.ts) + ttlMs);
    }

    return decoded;
}

module.exports = {
    DEFAULT_EXPORT_TTL_MS,
    computeCanonicalHash,
    signScopedExportToken,
    verifyAndConsumeScopedExportToken
};
