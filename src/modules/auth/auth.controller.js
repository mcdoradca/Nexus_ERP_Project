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

module.exports = { login };