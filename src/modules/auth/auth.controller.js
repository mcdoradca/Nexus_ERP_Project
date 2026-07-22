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
        require('fs').appendFileSync('logs/login_errors.log', error.stack + '\n');
        res.status(500).json({ error: 'Błąd serwera podczas logowania: ' + (error.message || 'Wewnętrzny błąd') });
    }
}

module.exports = { login };