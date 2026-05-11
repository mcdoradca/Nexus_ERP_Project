const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const cron = require('node-cron');
const prisma = require('../../core/prisma');
const cryptoService = require('../../core/crypto.service');
const socketService = require('../../core/socket');

// Przechowywanie stanów ostatnich odczytanych UID dla każdego użytkownika (w pamięci)
const lastSeenUidMap = new Map();

async function checkEmailsForUser(user) {
    if (!user.smtpHost || !user.smtpUser || !user.smtpPassword) return;

    // Zakładamy, że IMAP na OVH/Hostinger jest na serwerze pocztowym (zwykle tym samym co SMTP) na porcie 993
    let host = user.smtpHost;
    if (host.startsWith('smtp.')) host = host.replace('smtp.', 'imap.');
    
    let plainPassword;
    try {
        plainPassword = cryptoService.decrypt(user.smtpPassword);
    } catch(err) {
        console.error(`[IMAP] Błąd deszyfracji dla uzytkownika ${user.email}`);
        return;
    }

    const config = {
        imap: {
            user: user.smtpUser,
            password: plainPassword,
            host: host,
            port: 993,
            tls: true,
            authTimeout: 5000,
            tlsOptions: { rejectUnauthorized: false }
        }
    };

    let connection;
    try {
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');

        const lastUid = lastSeenUidMap.get(user.id) || 1;
        const searchCriteria = [['UID', `${lastUid}:*`]];
        const fetchOptions = { bodies: ['HEADER'], struct: true, markSeen: false };

        const messages = await connection.search(searchCriteria, fetchOptions);
        
        let newMaxUid = lastUid;
        
        for (const item of messages) {
            if (item.attributes.uid > lastUid) {
                const headerPart = item.parts.find(part => part.which === 'HEADER');
                if (headerPart && headerPart.body) {
                     const parsedHeader = await simpleParser(headerPart.body);
                     const from = parsedHeader.from?.text || 'Nieznany nadawca';
                     const subject = parsedHeader.subject || 'Brak tematu';
                     
                     // Zapisz powiadomienie do bazy by nie zniknęło
                     const notif = await prisma.notification.create({
                         data: {
                             userId: user.id,
                             title: 'Nowa Wiadomość E-mail',
                             message: `Od: ${from} | Temat: ${subject}`,
                             type: 'email'
                         }
                     });
                     
                     // Wyślij live przez Socket
                     socketService.sendToUser(user.id, 'new_notification', notif);
                }
            }
            if (item.attributes.uid > newMaxUid) {
                newMaxUid = item.attributes.uid;
            }
        }

        lastSeenUidMap.set(user.id, newMaxUid);
    } catch (err) {
        console.error(`[IMAP] Błąd odczytu dla ${user.email}:`, err.message);
    } finally {
        if (connection) connection.end();
        // Czyść pamięć, bezpieczeństwo przed wyciekami hasła
        plainPassword = null; 
    }
}

async function runEmailListenerJob() {
    console.log('[IMAP Listener] Rozpoczęto cykl sprawdzania skrzynek pocztowych...');
    try {
        const users = await prisma.user.findMany({
            where: { smtpHost: { not: null }, smtpUser: { not: null } }
        });
        
        for (const u of users) {
            await checkEmailsForUser(u);
        }
    } catch (error) {
        console.error('[IMAP Listener] Błąd globalny procesu:', error);
    }
}

// Uruchamiamy sprawdzanie co 2 minuty
function startEmailListener() {
    // Inicjalnie zaciągamy najwyższy UID żeby nie zalewać usera starymi mailami po resecie serwera
    // (Opcjonalnie: można to zrobić, na razie po prostu startujemy)
    cron.schedule('*/2 * * * *', runEmailListenerJob);
    console.log('[CRON] Zarejestrowano IMAP Listener (co 2 minuty)');
}

module.exports = { startEmailListener };
