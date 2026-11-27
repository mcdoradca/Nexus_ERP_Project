const authService = require('./auth.service');

async function login(req, res) {
    try {
        const { email, password } = req.body;
        const result = await authService.loginUser(email, password);
        res.json(result);
    } catch (error) {
        if (error.message === 'Nieprawidłowe dane logowania') {
            return res.status(401).json({ error: error.message });
        }
        console.error('[Auth Controller] Login Error:', error);
        try {
            const fs = require('fs');
            const path = require('path');
            const logsDir = path.join(process.cwd(), 'logs');
            if (!fs.existsSync(logsDir)) {
                fs.mkdirSync(logsDir, { recursive: true });
            }
            fs.appendFileSync(path.join(logsDir, 'login_errors.log'), error.stack + '\n');
        } catch (fsError) {
            console.error('[Auth Controller] Could not write to login_errors.log:', fsError);
        }
        res.status(500).json({ error: 'Błąd serwera podczas logowania: ' + (error.message || 'Wewnętrzny błąd') });
    }
}

async function refresh(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({
                error: 'Brak autoryzacji',
                code: 'AUTH_SESSION_REQUIRED',
                authScope: 'NEXUS_SESSION'
            });
        }
        const session = authService.refreshUserSession(req.user);
        return res.status(200).json(session);
    } catch (error) {
        console.error('[Auth Controller] Refresh Error:', error);
        return res.status(500).json({ error: 'Nie udało się odświeżyć sesji użytkownika.' });
    }
}

module.exports = { login, refresh };