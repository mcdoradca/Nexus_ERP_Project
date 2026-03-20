const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../../core/prisma');
const EventBus = require('../../core/EventBus');

const JWT_SECRET = process.env.JWT_SECRET || 'super-tajny-klucz-aps-ie-2026';

async function loginUser(email, password) {
    const user = await prisma.user.findUnique({ where: { email } });
    
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
        throw new Error('Nieprawidłowe dane logowania');
    }

    // Dołączamy department i group, aby łatwo sterować uprawnieniami na frontendzie i w middleware
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name, department: user.department, group: user.group }, JWT_SECRET, { expiresIn: '24h' });
    
    // Rzucamy zdarzenie na szynę
    EventBus.publish('UserLoggedIn', { userId: user.id, email: user.email, timestamp: new Date() });

    return { token, user: { id: user.id, name: user.name, role: user.role, group: user.group, department: user.department, color: user.color } };
}

module.exports = { loginUser };