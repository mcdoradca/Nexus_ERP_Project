const fs = require('fs');
const { execSync } = require('child_process');

try {
    const files = execSync('git grep -l "API_URL" frontend/src', { encoding: 'utf8' }).split('\n').filter(Boolean);
    files.forEach(f => {
        let c = fs.readFileSync(f, 'utf8');
        c = c.replace(/import\.meta\.env\.PROD \? '' : 'http:\/\/localhost:3001'/g, "import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001')");
        fs.writeFileSync(f, c);
        console.log('Fixed API_URL in', f);
    });

    // Also fix auth.middleware.js
    let authPath = 'src/middlewares/auth.middleware.js';
    let authContent = fs.readFileSync(authPath, 'utf8');
    authContent = authContent.replace(
        /console\.error\('\[Auth Middleware\] Błąd:', err\);\n\s*return res\.status\(500\)\.json\({ error: 'Błąd weryfikacji tożsamości' }\);/g,
        "console.error('[Auth Middleware] Krytyczny błąd Prisma lub Sesji:', err.message || err);\n        return res.status(500).json({ error: 'Błąd weryfikacji tożsamości lub utrata połączenia z bazą danych' });"
    );
    fs.writeFileSync(authPath, authContent);
    console.log('Fixed auth.middleware.js');

} catch (e) {
    console.error(e);
}
