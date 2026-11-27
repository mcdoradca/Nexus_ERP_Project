const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../../core/prisma');
const EventBus = require('../../core/EventBus');

const DEFAULT_JWT_EXPIRES_IN = '24h';

function getJwtSecret() {
    return process.env.JWT_SECRET;
}

function getJwtExpiresIn() {
    const raw = process.env.JWT_EXPIRES_IN;
    return (typeof raw === 'string' && raw.trim()) ? raw.trim() : DEFAULT_JWT_EXPIRES_IN;
}

function serializeAuthUser(user) {
    return {
        id: user.id,
        name: user.name,
        role: user.role,
        group: user.group,
        department: user.department,
        color: user.color
    };
}

function issueUserToken(user, options = {}) {
    const secret = options.secret || getJwtSecret();
    const expiresIn = options.expiresIn || getJwtExpiresIn();
    return jwt.sign(
        {
            id: user.id,
            role: user.role,
            name: user.name,
            department: user.department,
            group: user.group
        },
        secret,
        { expiresIn }
    );
}

function refreshUserSession(user, options = {}) {
    const token = issueUserToken(user, options);
    return {
        token,
        user: serializeAuthUser(user),
        expiresIn: options.expiresIn || getJwtExpiresIn()
    };
}

async function loginUser(email, password) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new Error('Nieprawidłowe dane logowania');
    }

    // Dołączamy department i group, aby łatwo sterować uprawnieniami na frontendzie i w middleware
    const token = issueUserToken(user);

    // Rzucamy zdarzenie na szynę
    EventBus.publish('UserLoggedIn', { userId: user.id, email: user.email, timestamp: new Date() });

    return { token, user: serializeAuthUser(user) };
}

module.exports = {
    loginUser,
    issueUserToken,
    refreshUserSession,
    serializeAuthUser,
    getJwtExpiresIn
};