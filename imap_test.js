const imaps = require('imap-simple');
const cryptoService = require('./src/core/crypto.service');
const prisma = require('./src/core/prisma');

async function test() {
    const user = await prisma.user.findFirst({ where: { smtpHost: { not: null } } });
    if (!user) return console.log('Brak usera');
    
    let host = user.smtpHost;
    if (host.startsWith('smtp.')) host = host.replace('smtp.', 'imap.');
    console.log('HOST:', host, 'USER:', user.smtpUser);
    
    const config = {
        imap: {
            user: user.smtpUser,
            password: cryptoService.decrypt(user.smtpPassword),
            host: host,
            port: 993,
            tls: true,
            connTimeout: 15000,
            authTimeout: 15000,
            tlsOptions: { rejectUnauthorized: false }
        }
    };
    try {
        const connection = await imaps.connect(config);
        console.log('Zalogowano poprawnie do IMAP!');
        await connection.openBox('INBOX');
        const messages = await connection.search(['ALL'], { fetch: true, bodies: ['HEADER.FIELDS (FROM TO SUBJECT DATE)'] });
        console.log('Znaleziono wiadomosci:', messages.length);
        if (messages.length > 0) {
            console.log('Najwyzszy UID:', messages[messages.length-1].attributes.uid);
        }
        connection.end();
    } catch(err) {
        console.error('Blad IMAP:', err.message);
    }
}
test();
