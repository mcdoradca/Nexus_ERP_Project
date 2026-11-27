export const PROACTIVE_REFRESH_WINDOW_MS = 4 * 60 * 60 * 1000;

export function getActiveAuthToken(storage = null) {
    const store = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    if (!store || typeof store.getItem !== 'function') {
        return null;
    }
    const primary = store.getItem('aps_token');
    if (typeof primary === 'string' && primary.trim()) {
        return primary.trim();
    }
    const fallback = store.getItem('token');
    if (typeof fallback === 'string' && fallback.trim()) {
        return fallback.trim();
    }
    return null;
}

function decodeBase64UrlToUtf8(segment = '') {
    const padded = String(segment || '').replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const base64 = padded + '='.repeat(padLen);
    if (typeof globalThis.atob === 'function') {
        const bin = globalThis.atob(base64);
        const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }
    if (typeof globalThis.Buffer === 'function') {
        return globalThis.Buffer.from(base64, 'base64').toString('utf8');
    }
    return '';
}

export function parseJwtExpiryMs(jwtToken = '') {
    if (typeof jwtToken !== 'string') return null;
    const parts = jwtToken.trim().split('.');
    if (parts.length !== 3 || !parts[1]) return null;
    try {
        const jsonStr = decodeBase64UrlToUtf8(parts[1]);
        if (!jsonStr) return null;
        const payload = JSON.parse(jsonStr);
        const expSec = Number(payload?.exp);
        if (!Number.isFinite(expSec) || expSec <= 0) return null;
        return expSec * 1000;
    } catch {
        return null;
    }
}

export function isTokenAlreadyExpired(jwtToken = '', nowMs = Date.now()) {
    const expMs = parseJwtExpiryMs(jwtToken);
    if (expMs === null) return false;
    return expMs <= nowMs;
}

export function shouldProactivelyRefreshToken(
    jwtToken = '',
    nowMs = Date.now(),
    windowMs = PROACTIVE_REFRESH_WINDOW_MS
) {
    const expMs = parseJwtExpiryMs(jwtToken);
    if (expMs === null || expMs <= nowMs) return false;
    return (expMs - nowMs) <= windowMs;
}

export function isNexusSessionAuthError(error = null) {
    if (!error || error.response?.status !== 401) {
        return false;
    }
    const url = String(error.config?.url || '');
    if (url.includes('/api/auth/login')) {
        return false;
    }

    const data = error.response?.data;
    const headers = error.response?.headers || {};
    const authErrHeader = headers['x-nexus-auth-error']
        || headers['X-Nexus-Auth-Error']
        || (typeof headers.get === 'function' ? headers.get('x-nexus-auth-error') : null);

    if (data?.authScope === 'NEXUS_SESSION' || Boolean(authErrHeader)) {
        return true;
    }
    if (data?.authScope === 'EXTERNAL_INTEGRATION') {
        return false;
    }
    if (typeof data?.code === 'string' && /^(?:ALLEGRO_|BASELINKER_|VONHALSKY_)/i.test(data.code)) {
        return false;
    }
    if (/\/api\/(?:allegro\/auth|vonhalsky|offer-optimizer\/(?:allegro-offers|validate-allegro-|export-allegro-|vonhalsky|validate-vonhalsky-|export-vonhalsky))/i.test(url)) {
        return false;
    }

    if (typeof data?.code === 'string' && /^AUTH_/i.test(data.code)) {
        return true;
    }
    const errText = typeof data === 'string' ? data : String(data?.error || '');
    return /^(?:Nieprawidłowy token|Użytkownik nie znaleziony|Brak autoryzacji|Brak tokenu autoryzacji|Sesja wygasła|Unauthorized)/i.test(errText.trim());
}
