const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const prisma = require('../../core/prisma');
const cryptoService = require('../../core/crypto.service');
const socketService = require('../../core/socket');

// Przechowywanie stanów połączeń na żywo (IDLE) dla każdego użytkownika oraz ich lastUid
const activeConnections = new Map();
const lastSeenUidMap = new Map();

async function setupImapConnectionForUser(user) {
    if (!user.smtpHost || !user.smtpUser || !user.smtpPassword) return;
    if (activeConnections.has(user.id)) return; // Już nasłuchuje

    let host = user.smtpHost;
    if (host.startsWith('smtp.')) host = host.replace('smtp.', 'imap.');
    
    let plainPassword;
    try {
        plainPassword = cryptoService.decrypt(user.smtpPassword);
    } catch(err) {
        console.error(`[IMAP] Błąd deszyfracji dla uzytkownika ${user.email}`);
        return;
    }

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
        onmail: async function (numNewMail) {
            if (!connection) return;
            try {
                const searchCriteria = ['UNSEEN'];
                const fetchOptions = { bodies: ['HEADER'], struct: true, markSeen: false };
                const messages = await connection.search(searchCriteria, fetchOptions);
                
                const lastUid = lastSeenUidMap.get(user.id) || 0;
                let newMaxUid = lastUid;
                let notificationsCount = 0;

                for (const item of messages) {
                    if (item.attributes.uid > lastUid) {
                        const headerPart = item.parts.find(part => part.which === 'HEADER');
                        if (headerPart && headerPart.body && notificationsCount < 10) {
                             const parsedHeader = await simpleParser(headerPart.body);
                             const from = parsedHeader.from?.text || 'Nieznany nadawca';
                             const subject = parsedHeader.subject || 'Brak tematu';
                             
                             const notif = await prisma.notification.create({
                                 data: {
                                     userId: user.id,
                                     title: 'Nowa Wiadomość E-mail',
                                     message: `Od: ${from} | Temat: ${subject}`,
                                     type: 'email'
                                 }
                             });
                             socketService.sendToUser(user.id, 'new_notification', notif);
                             notificationsCount++;
                        }
                        if (item.attributes.uid > newMaxUid) {
                            newMaxUid = item.attributes.uid;
                        }
                    }
                }
                lastSeenUidMap.set(user.id, newMaxUid);
            } catch(e) {
                console.error(`[IMAP] Błąd podczas onmail dla ${user.email}:`, e.message);
            }
        }
    };

    try {
        connection = await imaps.connect(config);
        await connection.openBox('INBOX');
        activeConnections.set(user.id, connection);
        
        // Wykonajmy jedno ciche pobranie stanu, by zsynchronizować lastUid na start bez wysyłania 10 powiadomień
        const messages = await connection.search(['UNSEEN'], { bodies: ['HEADER'], struct: true, markSeen: false });
        let maxUid = 0;
        for (const item of messages) {
            if (item.attributes.uid > maxUid) maxUid = item.attributes.uid;
        }
        lastSeenUidMap.set(user.id, maxUid);

        // Zaprogramowanie auto-wznowienia w przypadku zerwania połączenia
        connection.on('error', (err) => {
            console.log(`[IMAP] Połączenie IDLE zerwane dla ${user.email}`);
            activeConnections.delete(user.id);
            // Próba wznowienia za 30 sekund
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

// Subskrypcja na szynę zdarzeń (EventBus) aby natychmiast załadować nowego pracownika jak wpisze hasło w Profilu
const EventBus = require('../../core/eventBus');
EventBus.subscribe('UserSmtpConfigured', async (data) => {
    const user = await prisma.user.findUnique({ where: { id: data.userId } });
    if (user) {
        console.log(`[IMAP Listener] Wykryto nową konfigurację SMTP dla ${user.email}, podpinam IDLE...`);
        // Oczyść stare połączenie jeśli istnieje
        if (activeConnections.has(user.id)) {
            activeConnections.get(user.id).end();
            activeConnections.delete(user.id);
        }
        setupImapConnectionForUser(user);
    }
});

module.exports = { startEmailListener };
