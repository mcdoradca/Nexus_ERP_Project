const imaps = require('imap-simple');
const prisma = require('../../core/prisma');
const cryptoService = require('../../core/crypto.service');
const socketService = require('../../core/socket');
const EventBus = require('../../core/EventBus');

const activeConnections = new Map();
const lastSeenUidMap = new Map();
const notifiedUidsMap = new Map(); // Zamek pamięci zapobiegający Race Condition (wielokrotne powiadomienia o 1 mailu)

async function setupImapConnectionForUser(user) {
    if (!user.smtpHost || !user.smtpUser || !user.smtpPassword) return;
    if (activeConnections.has(user.id)) return;

    let host = user.smtpHost;
    if (host.startsWith('smtp.')) host = host.replace('smtp.', 'imap.');
    
    let plainPassword;
    try {
        plainPassword = cryptoService.decrypt(user.smtpPassword);
    } catch(err) {
        console.error(`[IMAP] Błąd deszyfracji dla uzytkownika ${user.email}`);
        return;
    }

    if (!notifiedUidsMap.has(user.id)) notifiedUidsMap.set(user.id, new Set());
    const notifiedUids = notifiedUidsMap.get(user.id);

    let connection;

    const config = {
        imap: {
            user: user.smtpUser,
            password: plainPassword,
            host: host,
            port: 993,
            tls: true,
            connTimeout: 15000,
            authTimeout: 15000,
            tlsOptions: { rejectUnauthorized: false }
        },
        onmail: async function () {
            if (!connection) return;
            try {
                const searchCriteria = ['UNSEEN'];
                const fetchOptions = { bodies: ['HEADER'], struct: true, markSeen: false };
                const messages = await connection.search(searchCriteria, fetchOptions);
                
                if (messages.length === 0) return;

                // 1. Zabezpieczenie na poziomie Bazy Danych (odporne na restarty Node.js)
                const unseenUids = messages.map(m => `email-${m.attributes.uid}`);
                const existingNotifs = await prisma.notification.findMany({
                    where: { userId: user.id, type: 'email', relatedTaskId: { in: unseenUids } },
                    select: { relatedTaskId: true }
                });
                const existingSet = new Set(existingNotifs.map(n => n.relatedTaskId));

                let notificationsCount = 0;

                for (const item of messages) {
                    const emailId = `email-${item.attributes.uid}`;

                    // Jeśli mail nie ma jeszcze powiadomienia w bazie i nie został oflagowany w RAM
                    if (!existingSet.has(emailId) && !notifiedUids.has(item.attributes.uid)) {
                        notifiedUids.add(item.attributes.uid); // Zamek RAM przed równoległymi pętlami
                        
                        const headerPart = item.parts.find(part => part.which === 'HEADER');
                        if (headerPart && headerPart.body && notificationsCount < 10) {
                             const fromRaw = headerPart.body.from ? headerPart.body.from[0] : 'Nieznany nadawca';
                             const subjectRaw = headerPart.body.subject ? headerPart.body.subject[0] : 'Brak tematu';
                             
                             let fromStr = fromRaw;
                             if (fromStr.includes('<')) {
                                 fromStr = fromStr.split('<')[0].trim();
                                 if (!fromStr) fromStr = fromRaw; 
                             }

                             // Zapisujemy w bazie Z UNIKALNYM ID MAILA (relatedTaskId)
                             const notif = await prisma.notification.create({
                                 data: {
                                     userId: user.id,
                                     title: 'Nowa Wiadomość E-mail',
                                     message: `Od: ${fromStr} | Temat: ${subjectRaw}`,
                                     type: 'email',
                                     relatedTaskId: emailId
                                 }
                             });
                             socketService.sendToUser(user.id, 'new_notification', notif);
                             notificationsCount++;
                        }
                    } else {
                        // Jeśli istnieje w bazie, aktualizujemy zamek RAM by odciążyć kolejne sprawdzania
                        notifiedUids.add(item.attributes.uid);
                    }
                }
            } catch(e) {
                console.error(`[IMAP] Błąd podczas onmail dla ${user.email}:`, e.message);
            }
        }
    };

    try {
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');
        activeConnections.set(user.id, connection);
        
        // Zsynchronizuj startowy UID żeby nie floodować starymi mailami po resecie usługi
        const messages = await connection.search(['UNSEEN'], { bodies: ['HEADER'], struct: true, markSeen: false });
        let maxUid = 0;
        for (const item of messages) {
            if (item.attributes.uid > maxUid) maxUid = item.attributes.uid;
        }
        lastSeenUidMap.set(user.id, maxUid);

        connection.on('error', (err) => {
            console.log(`[IMAP] Połączenie IDLE zerwane dla ${user.email}`);
            activeConnections.delete(user.id);
            setTimeout(() => setupImapConnectionForUser(user), 30000);
        });

        connection.on('close', () => {
            activeConnections.delete(user.id);
        });

    } catch (err) {
        console.error(`[IMAP] Błąd logowania IDLE dla ${user.email}:`, err.message);
    } finally {
        plainPassword = null; 
    }
}

async function startEmailListener() {
    console.log('[IMAP Listener] Uruchamianie w czasie rzeczywistym (Real-Time IDLE Push)...');
    try {
        const users = await prisma.user.findMany({
            where: { smtpHost: { not: null }, smtpUser: { not: null } }
        });
        
        for (const u of users) {
            await setupImapConnectionForUser(u);
        }
    } catch (error) {
        console.error('[IMAP Listener] Błąd globalny:', error);
    }
}

EventBus.subscribe('UserSmtpConfigured', async (data) => {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (user) {
        if (activeConnections.has(user.id)) {
            activeConnections.get(user.id).end();
            activeConnections.delete(user.id);
        }
        setupImapConnectionForUser(user);
    }
});

module.exports = { startEmailListener };
