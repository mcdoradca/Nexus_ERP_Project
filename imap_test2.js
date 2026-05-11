require('dotenv').config();
const imaps = require('imap-simple');
const cryptoService = require('./src/core/crypto.service');
const prisma = require('./src/core/prisma');

async function test() {
    const user = await prisma.user.findFirst({ where: { smtpHost: { not: null } } });
    if (!user) return console.log('Brak usera');
    
    let host = user.smtpHost;
    if (host.startsWith('smtp.')) host = host.replace('smtp.', 'imap.');
    console.log('HOST:', host, 'USER:', user.smtpUser);
    console.log('PASSWORD DECRYPTED OK?', !!cryptoService.decrypt(user.smtpPassword));

    const config = {
        imap: {
            user: user.smtpUser,
            password: cryptoService.decrypt(user.smtpPassword),
            host: host,
            port: 993,
            tls: true,
            connTimeout: 15000,
            authTimeout: 15000,
            tlsOptions: { rejectUnauthorized: false },
            debug: console.log
        }
    };
    try {
        const connection = await imaps.connect(config);
        console.log('Zalogowano poprawnie do IMAP!');
        await connection.openBox('INBOX');
        const searchCriteria = ['UNSEEN'];
        const fetchOptions = { bodies: ['HEADER'], struct: true, markSeen: false };
        const messages = await connection.search(searchCriteria, fetchOptions);
        console.log('Znalazlem unseen:', messages.length);
        connection.end();
    } catch(err) {
        console.error('Blad IMAP:', err.message);
    }
}
test();
