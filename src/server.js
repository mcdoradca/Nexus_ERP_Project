require('dotenv').config();

// Globalna Tarcza Ochronna Procesu Node.js (Zasada Nieśmiertelnego Serwera)
process.on('uncaughtException', (err) => {
    console.error('KRYTYCZNY BŁĄD PROCESU (Uncaught Exception):', err);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('NIEWYŁAPANA OBIETNICA (Unhandled Rejection) at:', promise, 'reason:', reason);
});
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
const path = require('path');

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../frontend/public/uploads')));

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
const influencersRoutes = require('./modules/influencers/influencers.routes');
const offerOptimizerRoutes = require('./modules/offer-optimizer/offer-optimizer.routes');
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
app.use('/api/influencers', influencersRoutes);

// KRYTYCZNE: Silnik AI SEO optymalizacji wpięty pod strażnikiem tokenowym
app.use('/api/offer-optimizer', authenticateToken, offerOptimizerRoutes);


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
        const products = await prisma.product.findMany({ 
            include: { 
               brand: true,
               bomElements: { include: { material: true } }
            }, 
            orderBy: { name: 'asc' } 
        });
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
                        
                        // Krok 2: Pobierz szczegóły produktu (Cena, Marka/Cechy)
                        const dataFormData = new URLSearchParams();
                        dataFormData.append('method', 'getInventoryProductsData');
                        dataFormData.append('parameters', JSON.stringify({ "inventory_id": targetInventoryId, "products": [firstId] }));
                        
                        const blDataRes = await fetch('https://api.baselinker.com/connector.php', {
                            method: 'POST',
                            headers: { 'X-BLToken': tokenRecord.value },
                            body: dataFormData
                        });
                        const dataFull = await blDataRes.json();
                        
                        if (dataFull.status === 'SUCCESS' && dataFull.products && dataFull.products[firstId]) {
                            const fullProd = dataFull.products[firstId];
                            let brandName = fullProd.brand || ''; // Podstawa
                            if (!brandName && fullProd.features) {
                                // Fallback w atrybutach produktowych
                                brandName = fullProd.features['Marka'] || fullProd.features['Producent'] || fullProd.features['Brand'] || '';
                            }
                            
                            let price = 0;
                            if (fullProd.prices && Object.keys(fullProd.prices).length > 0) {
                                price = fullProd.prices[Object.keys(fullProd.prices)[0]]; // Złap sztywno pierwszą grupę cenową
                            }

                            let stockQty = 0;
                            if (fullProd.stock && typeof fullProd.stock === 'object') {
                                stockQty = Object.values(fullProd.stock).reduce((z, b) => z + Number(b), 0);
                            }

                            let imageUrl = '';
                            if (fullProd.images && Object.keys(fullProd.images).length > 0) {
                                imageUrl = fullProd.images[Object.keys(fullProd.images)[0]];
                            }
                            
                            return res.status(200).json({ 
                                name: fullProd.name || fullProd.text_fields?.name || '', 
                                brand: brandName, 
                                sku: fullProd.sku || '',
                                price: parseFloat(price) || 0,
                                stock: stockQty,
                                baselinkerId: firstId,
                                imageUrl: imageUrl
                            });
                        }
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
        const { ean, sku, name, stock, salePrice, basePrice, inboundTransportCost, packagingCost, bdoEprCost, outboundTransportCost, brandId, status, subiektId, baselinkerId, imageUrl } = req.body;
        
        let safeBrandId = (brandId === '' || brandId === undefined) ? null : brandId;
        let safeSubiektId = (subiektId === '' || subiektId === undefined) ? null : subiektId;
        let safeBaselinkerId = (baselinkerId === '' || baselinkerId === undefined) ? null : baselinkerId;

        const newProduct = await prisma.product.create({
            data: {
                ean, sku, name, brandId: safeBrandId, status: status || 'Aktywny',
                stock: parseInt(stock) || 0,
                salePrice: parseFloat(salePrice) || 0.0,
                basePrice: parseFloat(basePrice) || 0.0,
                inboundTransportCost: parseFloat(inboundTransportCost) || 0.0,
                packagingCost: parseFloat(packagingCost) || 0.0,
                bdoEprCost: parseFloat(bdoEprCost) || 0.0,
                outboundTransportCost: parseFloat(outboundTransportCost) || 0.0,
                subiektId: safeSubiektId, baselinkerId: safeBaselinkerId,
                imageUrl: imageUrl || null
            }
        });
        res.status(201).json(newProduct);
    } catch (error) { res.status(500).json({ error: 'Blad', details: error.message }); }
});

app.patch('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const payload = req.body;
        
        // Nie aktualizujemy ID
        delete payload.id;
        delete payload.createdAt;
        delete payload.updatedAt;
        delete payload.bomElements; // BOM jest zagnieżdżony, nie aktualizujemy go tutaj
        delete payload.brand;
        
        const updatedProduct = await prisma.product.update({
            where: { id: req.params.id },
            data: {
                ...payload,
                stock: parseFloat(payload.stock) || 0,
                salePrice: parseFloat(payload.salePrice) || 0.0,
                basePrice: parseFloat(payload.basePrice) || 0.0,
                inboundTransportCost: parseFloat(payload.inboundTransportCost) || 0.0,
                packagingCost: parseFloat(payload.packagingCost) || 0.0,
                bdoEprCost: parseFloat(payload.bdoEprCost) || 0.0,
                outboundTransportCost: parseFloat(payload.outboundTransportCost) || 0.0,
            }
        });
        res.status(200).json(updatedProduct);
    } catch (error) { 
        console.error("PATCH error:", error);
        res.status(500).json({ error: 'Blad edycji produktu' }); 
    }
});

// --- ECO BOM API ---
app.get('/api/eco/materials', authenticateToken, async (req, res) => {
    try {
        const materials = await prisma.ecoMaterial.findMany({ orderBy: { name: 'asc' } });
        res.status(200).json(materials);
    } catch (error) { res.status(500).json({ error: 'Blad pobierania stawek' }); }
});

app.post('/api/eco/materials', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const { name, ratePerKg } = req.body;
        const newMat = await prisma.ecoMaterial.create({ data: { name, ratePerKg: parseFloat(ratePerKg) || 0.0 } });
        res.status(201).json(newMat);
    } catch (error) { res.status(500).json({ error: 'Blad zapisu stawki' }); }
});

app.patch('/api/eco/materials/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const { ratePerKg, name } = req.body;
        const updated = await prisma.ecoMaterial.update({
            where: { id: req.params.id },
            data: { ratePerKg: parseFloat(ratePerKg), name }
        });
        res.status(200).json(updated);
    } catch (error) { res.status(500).json({ error: 'Blad edycji stawki' }); }
});

app.delete('/api/eco/materials/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        await prisma.ecoMaterial.delete({ where: { id: req.params.id } });
        res.status(200).json({ status: 'Deleted' });
    } catch (error) { res.status(500).json({ error: 'Blad usuwania stawki' }); }
});

app.get('/api/products/:productId/bom', authenticateToken, async (req, res) => {
    try {
        const boms = await prisma.productBom.findMany({
            where: { productId: req.params.productId },
            include: { material: true }
        });
        res.status(200).json(boms);
    } catch (error) { res.status(500).json({ error: 'Blad pobierania BOM' }); }
});

app.post('/api/products/:productId/bom', authenticateToken, async (req, res) => {
    try {
        const { materialId, weightGrams } = req.body;
        const newBom = await prisma.productBom.create({
            data: { productId: req.params.productId, materialId, weightGrams: parseFloat(weightGrams) || 0.0 },
            include: { material: true }
        });
        res.status(201).json(newBom);
    } catch (error) { res.status(500).json({ error: 'Blad zapisu elementu BOM' }); }
});

app.delete('/api/products/:productId/bom/:bomId', authenticateToken, async (req, res) => {
    try {
        await prisma.productBom.delete({ where: { id: req.params.bomId } });
        res.status(200).json({ status: 'Deleted' });
    } catch (error) { res.status(500).json({ error: 'Blad usuwania z BOM' }); }
});

app.get('/api/health', async (req, res) => { res.status(200).json({ status: '🟢 ONLINE' }); });

// Globalny Łapacz Błędów (Tarcza Anty-Crashowa)
const errorHandler = require('./middleware/error.middleware');
app.use(errorHandler);

server.listen(PORT, () => console.log(`[BOOT] System podniesiony na porcie ${PORT}...`));

// --- TŁO: CRON JOB BASELINKER SYNC (FAZA 33) ---
cron.schedule('0 * * * *', async () => {
    console.log('[CRON Worker] Uruchamiam cykliczną interpolację i synchronizację z BaseLinkerem...');
    try {
        const tokenRecord = await prisma.systemSetting.findUnique({ where: { key: 'BASELINKER_TOKEN' } });
        if (!tokenRecord || !tokenRecord.value || tokenRecord.value.length < 5) return;
        
        // Namierz Default Inventory
        const invFormData = new URLSearchParams();
        invFormData.append('method', 'getInventories');
        invFormData.append('parameters', JSON.stringify({}));
        const invRes = await fetch('https://api.baselinker.com/connector.php', { method: 'POST', headers: { 'X-BLToken': tokenRecord.value }, body: invFormData });
        const invData = await invRes.json();
        if (invData.status !== 'SUCCESS' || !invData.inventories || invData.inventories.length === 0) return;
        const targetInventoryId = invData.inventories[0].inventory_id;

        // Baza PIM Nexusa - Znajdź połączone artykuły
        const linkedProducts = await prisma.product.findMany({ where: { baselinkerId: { not: null } } });
        if (linkedProducts.length === 0) return console.log('[CRON Worker] Brak rekordów PIM w puli synchronizacji.');
        
        // Zabezpieczenie przed limitami poprzez paczkowanie zapytań (paginacja tablic w pamięci RAM)
        for (let i = 0; i < linkedProducts.length; i += 100) {
            const chunk = linkedProducts.slice(i, i + 100);
            const chunkIds = chunk.map(p => p.baselinkerId);
            
            const reqFormData = new URLSearchParams();
            reqFormData.append('method', 'getInventoryProductsData');
            reqFormData.append('parameters', JSON.stringify({ "inventory_id": targetInventoryId, "products": chunkIds }));
            
            const chunkRes = await fetch('https://api.baselinker.com/connector.php', { method: 'POST', headers: { 'X-BLToken': tokenRecord.value }, body: reqFormData });
            const chunkData = await chunkRes.json();
            
            if (chunkData.status === 'SUCCESS' && chunkData.products) {
                // Odświeżanie w wektorowej bazie
                for (const p of chunk) {
                    const zew = chunkData.products[p.baselinkerId];
                    if (zew) {
                        let zewStock = p.stock;
                        if (zew.stock) zewStock = Object.values(zew.stock).reduce((a, b) => a + Number(b), 0);
                        
                        let zewSalePrice = p.salePrice;
                        if (zew.prices && Object.keys(zew.prices).length > 0) zewSalePrice = parseFloat(zew.prices[Object.keys(zew.prices)[0]]);
                        
                        await prisma.product.update({
                            where: { id: p.id },
                            data: { stock: zewStock, salePrice: zewSalePrice }
                        });
                    }
                }
            }
        }
        console.log('[CRON Worker] Synchronizacja BaseLinkera Zakończona Sukcesem ✅');
    } catch (eee) {
        console.error('[CRON Worker] Skok Napiecia Cron:', eee);
    }
});
// Nodemon Auto-Wakeup trigger
// Nodemon Auto-Wakeup trigger
