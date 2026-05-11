require('dotenv').config();
const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const cryptoService = require('./src/core/crypto.service');
const prisma = require('./src/core/prisma');

async function test() {
    const user = await prisma.user.findFirst({ where: { smtpHost: { not: null } } });
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
        }
    };
    try {
        const connection = await imaps.connect(config);
        await connection.openBox('INBOX');
        const messages = await connection.search(['UNSEEN'], { bodies: ['HEADER'], struct: true, markSeen: false });
        for (const item of messages) {
            const headerPart = item.parts.find(part => part.which === 'HEADER');
            console.log('TYPE OF HEADER BODY:', typeof headerPart.body);
            const parsed = await simpleParser(headerPart.body);
            console.log('PARSED:', parsed.subject);
        }
        connection.end();
    } catch(err) {
        console.error(err);
    }
}
test();
