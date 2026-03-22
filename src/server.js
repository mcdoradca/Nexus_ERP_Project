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
const crmRoutes = require('./modules/crm/crm.routes');
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
app.use('/api/crm', crmRoutes);

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
// --- System Settings API ---
app.get('/api/settings/:key', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const setting = await prisma.systemSetting.findUnique({ where: { key: req.params.key } });
        res.json(setting || { value: '' });
    } catch (error) { res.status(500).json({ error: 'Błąd serwera ustawień' }); }
});

app.post('/api/settings', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const { key, value } = req.body;
        const setting = await prisma.systemSetting.upsert({
            where: { key },
            update: { value },
            create: { key, value }
        });
        res.json(setting);
    } catch (error) { res.status(500).json({ error: 'Błąd serwera ustawień' }); }
});

// --- PIM API ---
app.get('/api/products/autofill/:ean', async (req, res) => {
    try {
        const { ean } = req.params;
        
        // 0. BaseLinker Integration (PRIORYTET)
        let blDebug = null;
        try {
            const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
            if (tokenRecord && tokenRecord.value && tokenRecord.value.length > 5) {
                // Najpierw pobierz ID pierwszego domyślnego magazynu z konta
                const invFormData = new URLSearchParams();
                invFormData.append('method', 'getInventories');
                invFormData.append('parameters', JSON.stringify({}));
                
                const invRes = await fetch('https://api.baselinker.com/connector.php', {
                    method: 'POST',
                    headers: { 'X-BLToken': tokenRecord.value },
                    body: invFormData
                });
                const invData = await invRes.json();
                
                let targetInventoryId = null;
                if (invData.status === 'SUCCESS' && invData.inventories && invData.inventories.length > 0) {
                    targetInventoryId = invData.inventories[0].inventory_id;
                }

                blDebug = { inventories: invData };

                if (targetInventoryId !== null) {
                    const formData = new URLSearchParams();
                    formData.append('method', 'getInventoryProductsList');
                    formData.append('parameters', JSON.stringify({ "inventory_id": targetInventoryId, "filter_ean": ean }));
                    
                    const blRes = await fetch('https://api.baselinker.com/connector.php', {
                        method: 'POST',
                        headers: { 'X-BLToken': tokenRecord.value },
                        body: formData
                    });
                    
                    const blData = await blRes.json();
                    blDebug.productsFetch = blData;
                    
                    if (blData.status === 'SUCCESS' && blData.products && Object.keys(blData.products).length > 0) {
                        const firstId = Object.keys(blData.products)[0];
                        const prod = blData.products[firstId];
                        return res.status(200).json({ name: prod.name, brand: '', sku: prod.sku || '' });
                    }
                }
            }
        } catch (blError) {
            console.log('BaseLinker Fallback Error:', blError);
            blDebug = { error: blError.message };
        }

        // Helper dla darmowych baz uodporniający Nexusa na pady serwerów zewnętrznych.
        const safeFetch = async (url) => {
            try {
                const r = await fetch(url, { timeout: 4000 });
                return r.ok ? await r.json() : null;
            } catch (e) {
                return null;
            }
        };

        // 1. Open Beauty Facts (Kosmetyki)
        let data = await safeFetch(`https://world.openbeautyfacts.org/api/v0/product/${ean}.json`);
        if (data && data.status === 1 && data.product) {
            return res.status(200).json({ name: data.product.product_name || data.product.product_name_pl || data.product.generic_name || '', brand: data.product.brands || '' });
        }

        // 2. Open Food Facts (FMCG)
        data = await safeFetch(`https://world.openfoodfacts.org/api/v0/product/${ean}.json`);
        if (data && data.status === 1 && data.product) {
            return res.status(200).json({ name: data.product.product_name || data.product.product_name_pl || data.product.generic_name || '', brand: data.product.brands || '' });
        }
        
        // 3. Open Product Facts (Inne)
        data = await safeFetch(`https://world.openproductfacts.org/api/v0/product/${ean}.json`);
        if (data && data.status === 1 && data.product) {
            return res.status(200).json({ name: data.product.product_name || data.product.product_name_pl || data.product.generic_name || '', brand: data.product.brands || '' });
        }

        // 4. UPC Item DB (Globalny Mix)
        data = await safeFetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${ean}`);
        if (data && data.code === 'OK' && data.items && data.items.length > 0) {
            return res.status(200).json({ name: data.items[0].title || '', brand: data.items[0].brand || '' });
        }

        res.status(404).json({ error: 'Kod niezarejestrowany w żadnej 4 z darmowych baz OpenSource ani w asortymencie BaseLinkerze.', debug: blDebug });
    } catch (error) {
        require('fs').appendFileSync('z:\\Nexus_ERP_Project\\error_500.txt', error.stack + '\n');
        res.status(500).json({ error: 'Błąd serwera agregatora EAN.', details: error.message });
    }
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
