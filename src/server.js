require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Server } = require('socket.io');
const { createClient } = require('@supabase/supabase-js');
const { PrismaClient } = require('@prisma/client');
const cron = require('node-cron');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const socketService = require('./core/socket');
const io = socketService.init(server);
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super-tajny-klucz-aps-ie-2026';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

// --- NOWA ARCHITEKTURA DOMENOWA (IMPORTY) ---
const { authenticateToken } = require('./middlewares/auth.middleware');
const authRoutes = require('./modules/auth/auth.routes');
const usersRoutes = require('./modules/users/users.routes');
const chatRoutes = require('./modules/communication/chat.routes');
const notificationsRoutes = require('./modules/communication/notifications.routes');
const campaignsRoutes = require('./modules/campaigns/campaigns.routes');
const projectsRoutes = require('./modules/projects/projects.routes');
const tasksRoutes = require('./modules/tasks/tasks.routes');
const announcementsRoutes = require('./modules/announcements/announcements.routes');
const { registerCommunicationListeners } = require('./modules/communication/communication.listeners');
const { registerCampaignListeners } = require('./modules/campaigns/campaigns.listeners');
const { registerTasksListeners } = require('./modules/tasks/tasks.listeners');
const { registerSocketHandlers } = require('./modules/communication/socket.handlers');
const notificationsService = require('./modules/communication/notifications.service');
const EventBus = require('./core/EventBus');

io.on('connection', (socket) => {
    socketService.setOnlineUser(socket.id, socket.user.id);
    registerSocketHandlers(socket);

    socket.on('disconnect', () => {
        socketService.removeOnlineUser(socket.id);
    });
});

registerCommunicationListeners();
registerCampaignListeners();
registerTasksListeners();

// Automatyzacje Cron
cron.schedule('0 8 * * *', async () => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tasks = await prisma.task.findMany({ where: { status: { not: 'DONE' }, dueDate: { lte: tomorrow, not: null } }, include: { assignees: true } });
    for (let t of tasks) { for (let a of t.assignees) { await notificationsService.createAndSendNotification(a.id, 'Zbliżający się termin ⚠️', `Zadanie "${t.title}" ma termin ukonczenia wkrótce!`, 'deadline'); } }
});

// Zmieniono na raz dziennie rano (0 9 * * *), by zapobiec zalewaniu użytkowników powiadomieniami
cron.schedule('0 9 * * *', async () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const idleTasks = await prisma.task.findMany({
        where: { status: { not: 'DONE' }, updatedAt: { lt: yesterday } },
        include: { assignees: true }
    });
    for (let t of idleTasks) {
        for (let a of t.assignees) {
            await notificationsService.createAndSendNotification(a.id, 'Zadanie zamrożone ❄️', `Zadanie "${t.title}" nie było edytowane od wczoraj.`, 'idle');
        }
    }
});

// --- REJESTRACJA ZMODULARYZOWANYCH ROUTÓW ---
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
// Alias utrzymujący stary interfejs dla tworzenia użytkowników z frontu na czas migracji
app.use('/api/admin/users', usersRoutes); 
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/announcements', announcementsRoutes);

// ASORTYMENT (PIM)
app.get('/api/brands', authenticateToken, async (req, res) => {
    try {
        const brands = await prisma.brand.findMany({ orderBy: { name: 'asc' } });
        res.status(200).json(brands);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.post('/api/brands', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const { name } = req.body;
        const newBrand = await prisma.brand.create({ data: { name } });
        res.status(201).json(newBrand);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.get('/api/products', authenticateToken, async (req, res) => {
    try {
        const products = await prisma.product.findMany({ include: { brand: true }, orderBy: { name: 'asc' } });
        res.status(200).json(products);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.post('/api/products', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const { ean, sku, name, stock, salePrice, basePrice, inboundTransportCost, packagingCost, bdoEprCost, outboundTransportCost, brandId, status, subiektId, baselinkerId } = req.body;
        const newProduct = await prisma.product.create({
            data: {
                ean, sku, name, brandId, status: status || 'Aktywny',
                stock: parseInt(stock) || 0,
                salePrice: parseFloat(salePrice) || 0.0,
                basePrice: parseFloat(basePrice) || 0.0,
                inboundTransportCost: parseFloat(inboundTransportCost) || 0.0,
                packagingCost: parseFloat(packagingCost) || 0.0,
                bdoEprCost: parseFloat(bdoEprCost) || 0.0,
                outboundTransportCost: parseFloat(outboundTransportCost) || 0.0,
                subiektId, baselinkerId
            }
        });
        res.status(201).json(newProduct);
    } catch (error) { res.status(500).json({ error: 'Blad', details: error.message }); }
});

app.get('/api/health', async (req, res) => { res.status(200).json({ status: '🟢 ONLINE - Marketing Engine' }); });
server.listen(PORT, () => console.log(`🚀 APS IE SERVER (Marketing Engine) uruchomiony na porcie ${PORT}`));
