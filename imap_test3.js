require('dotenv').config();
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const cryptoService = require('./src/core/crypto.service');
const prisma = require('./src/core/prisma');

async function test() {
    const user = await prisma.user.findFirst({ where: { smtpHost: { not: null } } });
    if (!user) return console.log('Brak usera');
    
    let host = user.smtpHost;
    if (host.startsWith('smtp.')) host = host.replace('smtp.', 'imap.');

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
        },
        onmail: function (numNewMail) {
            console.log('Nowy mail przyszedł! Ilość nowych maili:', numNewMail);
        }
    };
    try {
        const connection = await imaps.connect(config);
        console.log('Zalogowano poprawnie do IMAP! Czekam na nowe maile...');
        await connection.openBox('INBOX');
        
        // Zostawiamy działające w tle, to zablokuje wyjście ze skryptu
    } catch(err) {
        console.error('Blad IMAP:', err.message);
    }
}
test();
