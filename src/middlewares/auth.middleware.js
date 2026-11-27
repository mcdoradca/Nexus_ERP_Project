const jwt = require('jsonwebtoken');
const prisma = require('../core/prisma');
const { issueUserToken } = require('../modules/auth/auth.service');

const SLIDING_REFRESH_THRESHOLD_SEC = Number(process.env.JWT_SLIDING_REFRESH_THRESHOLD_SEC) || (12 * 3600);

function sendSessionAuthError(res, code, message) {
    if (typeof res.setHeader === 'function') {
        res.setHeader('X-Nexus-Auth-Error', code);
    }
    return res.status(401).json({
        error: message,
        code,
        authScope: 'NEXUS_SESSION'
    });
}

function createAuthenticateToken({
    prismaClient = prisma,
    issueToken = issueUserToken,
    getSecret = () => process.env.JWT_SECRET,
    slidingThresholdSec = SLIDING_REFRESH_THRESHOLD_SEC
} = {}) {
    return async function authenticateToken(req, res, next) {
        const authHeader = req.headers?.['authorization'];
        let token = authHeader && authHeader.split(' ')[1];

        // Obejście dla tagów <img> omijających nagłówki (przesyłane z proxy-image)
        if (!token && req.query && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return sendSessionAuthError(res, 'AUTH_TOKEN_MISSING', 'Brak tokenu autoryzacji');
        }

        try {
            const decoded = jwt.verify(token, getSecret());
            const user = await prismaClient.user.findUnique({ where: { id: decoded.id } });

            if (!user) {
                return sendSessionAuthError(res, 'AUTH_USER_NOT_FOUND', 'Użytkownik nie znaleziony');
            }

            req.user = user;

            if (authHeader && typeof decoded?.exp === 'number' && !res.headersSent) {
                const remainingSec = decoded.exp - Math.floor(Date.now() / 1000);
                if (remainingSec > 0 && remainingSec < slidingThresholdSec) {
                    try {
                        const refreshed = issueToken(user);
                        if (typeof res.setHeader === 'function') {
                            res.setHeader('X-Nexus-Refreshed-Token', refreshed);
                        }
                    } catch (_) {
                        // Cichy fallback: nie przerywamy ważnego żądania przy błędzie rotacji tokena
                    }
                }
            }

            next();
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return sendSessionAuthError(res, 'AUTH_TOKEN_EXPIRED', 'Sesja wygasła. Zaloguj się ponownie.');
            }
            if (err.name === 'JsonWebTokenError' || err.name === 'NotBeforeError') {
                return sendSessionAuthError(res, 'AUTH_TOKEN_INVALID', 'Nieprawidłowy token');
            }
            const { logger } = require('../utils/logger');
            logger.error(`[Auth Middleware] Krytyczny błąd Prisma lub Sesji: ${err.message || err}`, { stack: err.stack });
            return res.status(503).json({ error: 'Utrata połączenia z bazą danych lub błąd weryfikacji' });
        }
    };
}

const authenticateToken = createAuthenticateToken();

function requireRole(requiredRole) {
    return (req, res, next) => {
        if (!req.user) {
            return sendSessionAuthError(res, 'AUTH_SESSION_REQUIRED', 'Brak autoryzacji');
        }

        if (req.user.role !== requiredRole) {
            console.warn(`[Auth] Odrzucono dostęp dla użytkownika ${req.user.id}. Wymagana rola: ${requiredRole}`);
            return res.status(403).json({ error: 'Brak wystarczających uprawnień' });
        }

        next();
    };
}

function requireSuperUser(req, res, next) {
    if (!req.user) {
        return sendSessionAuthError(res, 'AUTH_SESSION_REQUIRED', 'Brak autoryzacji');
    }
    const isSuperUser = req.user.role === 'ADMIN' || req.user.role === 'PREZES';
    if (!isSuperUser) {
        return res.status(403).json({ error: 'Brak wystarczających uprawnień (wymagany Admin/Prezes)' });
    }
    next();
}

module.exports = {
    authenticateToken,
    createAuthenticateToken,
    requireRole,
    requireSuperUser,
    SLIDING_REFRESH_THRESHOLD_SEC
};
