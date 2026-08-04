const jwt = require('jsonwebtoken');
const prisma = require('../core/prisma');
const JWT_SECRET = process.env.JWT_SECRET;

async function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    // Obejście dla tagów <img> omijających nagłówki (przesyłane z proxy-image)
    if (!token && req.query && req.query.token) {
        token = req.query.token;
    }

    if (!token) {
        return res.sendStatus(401); // Brak tokenu
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });

        if (!user) {
            return res.status(401).json({ error: 'Użytkownik nie znaleziony' });
        }

        req.user = user;
        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Nieprawidłowy token' });
        }
        const { logger } = require('../utils/logger');
        logger.error(`[Auth Middleware] Krytyczny błąd Prisma lub Sesji: ${err.message || err}`, { stack: err.stack });
        return res.status(503).json({ error: 'Utrata połączenia z bazą danych lub błąd weryfikacji' });
    }
}

function requireRole(requiredRole) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Brak autoryzacji' });
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
        return res.status(401).json({ error: 'Brak autoryzacji' });
    }
    const isSuperUser = req.user.role === 'ADMIN' || req.user.role === 'PREZES';
    if (!isSuperUser) {
        return res.status(403).json({ error: 'Brak wystarczających uprawnień (wymagany Admin/Prezes)' });
    }
    next();
}


module.exports = { authenticateToken, requireRole, requireSuperUser };
