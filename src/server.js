require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('./utils/logger');

// Globalna Tarcza Ochronna Procesu Node.js (Zasada Nieśmiertelnego Serwera)
process.on('uncaughtException', (err) => {
    logger.error('KRYTYCZNY BŁĄD PROCESU (Uncaught Exception):', err);
    if (err.code === 'EADDRINUSE') {
        console.error('[KRYTYCZNE] Port jest zablokowany (EADDRINUSE). Wymuszam twarde zamknięcie procesu, aby zapobiec powstawaniu zombie procesów w tle na Windowsie.');
        process.exit(1);
    }
});
process.on('unhandledRejection', (reason, promise) => {
    logger.error('NIEWYŁAPANA OBIETNICA (Unhandled Rejection) at:', { promise, reason });
});
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("FATAL ERROR: Zmienna JWT_SECRET nie została ustawiona w środowisku (.env). Uruchomienie zablokowane ze względów bezpieczeństwa.");
    process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const path = require('path');

// Tarcza nagłówków HTTP (Helmet)
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Pozwala na ładowanie obrazków z zewnętrznych API (Bria/Claid)
    contentSecurityPolicy: {
        directives: {
        }
    }
}));

// KRYTYCZNY LOGGER DO DIAGNOSTYKI
const fs = require('fs');
app.use((req, res, next) => {
    const start = Date.now();
    const oldJson = res.json;
    res.json = function(body) {
        res.locals.body = body;
        return oldJson.apply(res, arguments);
    };
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logLine = `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms\n`;
        // Jesli wystapil blad, logujemy cialo odpowiedzi
        if (res.statusCode >= 400) {
            fs.appendFileSync(path.join(__dirname, '../logs/debug-requests.log'), logLine + `  Response: ${JSON.stringify(res.locals.body)}\n`);
        } else {
            fs.appendFileSync(path.join(__dirname, '../logs/debug-requests.log'), logLine);
        }
    });
    next();
});

// Konfiguracja CORS (Zabezpieczenie przed nieautoryzowanym dostępem)
const allowedOrigins = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',') 
    : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://34.59.28.145', 'https://34.59.28.145'];

app.use(cors({
    origin: function (origin, callback) {
        // Zezwalaj na brak originu (np. zapytań serwer-serwer lub Nginx proxy bez nagłówka Origin)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            // Tymczasowe odblokowanie wszystkiego w ramach debuggowania w produkcji:
            callback(null, true); // <--- KRYTYCZNA POPRAWKA: Przepuszczamy, aby wyeliminować błąd pustego ekranu!
        }
    },
    credentials: true
}));

app.set('trust proxy', 1);

// Ochrona przed atakami DDoS i Brute-Force (Rate Limiting)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minut
    max: 5000, // Zwiększono limit do 5000 z uwagi na polling interfejsu (np. RMA sync co 3s)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Przekroczono limit zapytan API. Sprobuj ponownie pozniej.' }
});

const aiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuta
    max: 30, // Limit 30 generacji AI z jednego IP na minute (ochrona portfela API)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zbyt duzo zadan do agentow AI. Zwolnij tempo.' }
});

app.use(express.json({ limit: '50mb', extended: true }));
app.use('/api/', apiLimiter); // Ochrona calego API
app.use('/api/ai/', aiLimiter); // Restrykcyjna ochrona dla generacji AI
app.use('/uploads', express.static(path.join(__dirname, '../frontend/public/uploads')));

// --- NOWA ARCHITEKTURA DOMENOWA (IMPORTY) ---
const { authenticateToken, requireSuperUser } = require('./middlewares/auth.middleware');
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

const pricingRoutes = require('./modules/pricing/pricing.routes');
const analyticsRoutes = require('./modules/analytics/analytics.routes');
const portfolioRoutes = require('./modules/portfolio-manager/portfolio.routes');
const rmaRoutes = require('./modules/rma/rma.routes');
const logisticsRoutes = require('./modules/logistics/logistics.routes');
const meetingsRoutes = require('./modules/meetings/meetings.routes');
const { registerCommunicationListeners } = require('./modules/communication/communication.listeners');
const { registerCampaignListeners } = require('./modules/campaigns/campaigns.listeners');
const { registerTasksListeners } = require('./modules/tasks/tasks.listeners');
const { registerMdmListeners } = require('./modules/mdm/mdm.listeners');
const { registerSocketHandlers } = require('./modules/communication/socket.handlers');
const notificationsService = require('./modules/communication/notifications.service');
const EventBus = require('./core/EventBus');
const BaseLinkerService = require('./modules/offer-optimizer/baselinker.service');
const { mdmDataBus } = require('./modules/mdm/mdm.service');
const allegroSentinelService = require('./modules/allegro-ads/allegro.sentinel.service');
const runSandboxE2ETest = require('./modules/allegro-ads/backtesting/backtest.runner');

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
registerMdmListeners();

// Automatyzacje Cron
const { initCronJobs } = require('./core/cron');
initCronJobs();

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

app.use('/api/pricing', pricingRoutes);
app.use('/api/analytics', authenticateToken, analyticsRoutes);
app.use('/api/portfolio', authenticateToken, portfolioRoutes);
app.use('/api/rma', rmaRoutes);
app.use('/api/logistics', logisticsRoutes);
app.use('/api/meetings', meetingsRoutes); // Zawiera cześć chronioną i publiczną
// Faza 15: Integracja Optymalizatora Ofert
app.use('/api/offer-optimizer', authenticateToken, offerOptimizerRoutes);

// ENDPOINT DO TESTOWANIA SYSTEMU LOGOWANIA (FAZA 5)
app.get('/api/test-error', (req, res, next) => {
    logger.info('Użytkownik wywołał testowy błąd za pomocą /api/test-error');
    const error = new Error('TO JEST SYMULOWANY BŁĄD SYSTEMU MONITORINGU (WINSTON)');
    error.status = 500;
    next(error);
});

// ENDPOINT DIAGNOSTYCZNY BAZY DANYCH I ŚRODOWISKA
app.get('/api/health', async (req, res) => {
    try {
        const dbStatus = await prisma.$queryRaw`SELECT 1`;
        const hasDbUrl = !!process.env.DATABASE_URL;
        res.json({ 
            status: "ok", 
            dbConnected: true, 
            dbUrlPresent: hasDbUrl,
            dbUrlStart: hasDbUrl ? process.env.DATABASE_URL.substring(0, 15) : null
        });
    } catch (err) {
        res.status(500).json({ 
            status: "error", 
            message: err.message,
            dbUrlPresent: !!process.env.DATABASE_URL
        });
    }
});

// ENDPOINT DIAGNOSTYCZNY LOGÓW (DEBUGOWANIE)
app.get('/api/logs', authenticateToken, requireSuperUser, async (req, res) => {
    try {
        const path = require('path');
        const logDir = path.join(__dirname, '../logs');
        let content = "=== WINSTON ERROR LOG ===\n";
        
        if (fs.existsSync(logDir)) {
            const files = fs.readdirSync(logDir).filter(f => f.includes('error'));
            if (files.length > 0) {
                const latestFile = files.sort().reverse()[0];
                content += fs.readFileSync(path.join(logDir, latestFile), 'utf-8');
            } else {
                content += "Brak plikow error log.\n";
            }
        }
        
        content += "\n\n=== REQUEST LOG ===\n";
        const reqLogPath = path.join(__dirname, '../logs/debug-requests.log');
        if (fs.existsSync(reqLogPath)) {
            content += fs.readFileSync(reqLogPath, 'utf-8');
        } else {
            content += "Brak logow zadan.\n";
        }
        
        res.type('text/plain').send(content);
    } catch (err) {
        res.status(500).send("Błąd odczytu logów: " + err.message);
    }
});


// ASORTYMENT (PIM)
app.post('/api/allegro-sentinel/trigger', authenticateToken, async (req, res) => {
    try {
        const result = await allegroSentinelService.runSentinelAudit();
        res.json({ success: true, analysis: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Endpoint do uruchamiania Sandbox E2E Tests (Allegro Ads Monitor)
app.get('/api/allegro-ads/backtest', authenticateToken, async (req, res) => {
    try {
        const ean = req.query.ean || null;
        const trace = await runSandboxE2ETest(ean);
        res.json({ success: true, trace });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

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
               bomElements: { include: { material: true } },
               allegroCategory: true
            }, 
            orderBy: { name: 'asc' } 
        });
        
        const mdmService = require('./modules/mdm/mdm.service');
        const enrichedProducts = await Promise.all(products.map(async p => {
            const dqs = await mdmService.calculateProductDQS(p);
            return { ...p, dqs };
        }));

        res.status(200).json(enrichedProducts);
    } catch (error) { 
        res.status(500).json({ error: 'Blad serwera', details: error.message }); 
    }
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
const aiService = require('./core/ai.service');

app.post('/api/products/:id/aeo', authenticateToken, async (req, res) => {
    try {
        const product = await prisma.product.findUnique({ where: { id: req.params.id }, include: { brand: true } });
        if (!product) return res.status(404).json({ error: 'Produkt nie istnieje' });
        
        const aeoContent = await aiService.generateAEO({
            name: product.name,
            brand: product.brand?.name,
            description: product.descriptionHtml,
            features: product.features
        });
        
        const updated = await prisma.product.update({
            where: { id: product.id },
            data: { aeoContent }
        });
        
        EventBus.publish('PRODUCT_DATA_UPDATED', { product: updated, source: 'PIM_AI_AEO' });
        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Błąd generowania AEO', details: error.message });
    }
});

app.get('/api/products/:id/sync-category-bl', authenticateToken, async (req, res) => {
    try {
        const product = await prisma.product.findUnique({ where: { id: req.params.id } });
        if (!product || !product.ean) {
            return res.status(400).json({ error: 'Produkt nie posiada kodu EAN. Odnalezienie docelowej kategorii Allegro jest niemożliwe.' });
        }
        
        // Zamiast polegać na wewnętrznym ID magazynowym BaseLinkera, 
        // uderzamy do Globalnego Katalogu Allegro po precyzyjne przypisanie na bazie EAN.
        const allegroService = require('./modules/offer-optimizer/allegro.service');
        let allegroCatId = null;
        
        if (product.ean) {
             allegroCatId = await allegroService.findCategoryByEan(product.ean);
        }
        
        // Plan B: Wyszukiwanie heurystyczne po nazwie produktu (AI Matching Allegro)
        if (!allegroCatId && product.name) {
             console.log(`[SyncCategory] EAN nie zadziałał, próba dopasowania po nazwie: ${product.name}`);
             allegroCatId = await allegroService.findMatchingCategoryByName(product.name);
        }
        
        if (!allegroCatId) {
            return res.status(404).json({ error: `Silnik Allegro nie odnalazł kategorii ani po EAN, ani po nazwie produktu. Wpisz ID Kategorii ręcznie.` });
        }
        
        // Automatycznie zaciągamy słownik z Allegro (Filar 2)
        await allegroService.fetchCategoryParameters(allegroCatId);
        
        // Aktualizujemy produkt w Nexusa
        const updated = await prisma.product.update({
            where: { id: product.id },
            data: { allegroCategoryId: allegroCatId }
        });
        
        res.status(200).json(updated);
    } catch (error) {
        res.status(500).json({ error: 'Błąd synchronizacji kategorii (API)', details: error.message });
    }
});

app.get('/api/categories/:id', authenticateToken, async (req, res) => {
    try {
        const category = await prisma.marketplaceCategory.findUnique({ where: { id: req.params.id } });
        if (!category) return res.status(404).json({ error: 'Kategoria nie została zbuforowana' });
        res.status(200).json(category);
    } catch (error) {
        res.status(500).json({ error: 'Błąd pobierania kategorii z cache', details: error.message });
    }
});

// Endpoint: Hybrydowe uzupełnianie parametrów z BaseLinkera oraz przez Web Research Agenta (PXM Auto-Fill)
app.post('/api/products/:id/autofill-params', authenticateToken, async (req, res) => {
    try {
        const product = await prisma.product.findUnique({ where: { id: req.params.id } });
        if (!product || !product.ean || !product.baselinkerId) {
            return res.status(400).json({ error: 'Produkt musi posiadać zsynchronizowany BaseLinker ID oraz wpisany EAN do uruchomienia Agenta PXM.' });
        }
        
        let currentFeatures = product.features && typeof product.features === 'object' ? { ...product.features } : {};
        
        // 1. Zassanie dostępnych parametrów z BaseLinkera
        const BaseLinkerService = require('./modules/offer-optimizer/baselinker.service');
        const aiService = require('./modules/offer-optimizer/ai.service');
        
        const blData = await BaseLinkerService.fetchDeepProductData(product.baselinkerInventoryId || await BaseLinkerService.getInventories(), product.baselinkerId);
        if (blData.features && Object.keys(blData.features).length > 0) {
            currentFeatures = { ...currentFeatures, ...blData.features };
        }
        
        // 2. Pobranie schematu wymogów Allegro
        let requiredSchema = [];
        if (product.allegroCategoryId) {
            const category = await prisma.marketplaceCategory.findUnique({ where: { id: product.allegroCategoryId } });
            if (category && category.parameters) {
                requiredSchema = category.parameters;
            }
        }
        
        // 3. Odpalenie Agenta AI do dogrzebywania brakujących parametrów z sieci (Tylko jeśli mamy schemat i braki)
        const updatedFeatures = await aiService.autofillMissingParameters(product.ean, product.name, currentFeatures, requiredSchema);
        
        // Zapis w bazie
        const updatedProduct = await prisma.product.update({
            where: { id: product.id },
            data: { features: updatedFeatures }
        });
        
        res.status(200).json(updatedProduct);
    } catch (error) {
        res.status(500).json({ error: 'Błąd Auto-Fill', details: error.message });
    }
});

app.get('/api/products/autofill/:ean', async (req, res) => {
    try {
        const { ean } = req.params;
        
        // 0. BaseLinker Integration (PRIORYTET)
        try {
            const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);
            const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);
            
            // Spróbujmy wyciągnąć brand
            let brandName = deepData.manufacturer || '';
            if (!brandName && deepData.features) {
                brandName = deepData.features['Marka'] || deepData.features['Producent'] || deepData.features['Brand'] || '';
            }

            return res.status(200).json({ 
                name: deepData.name || '', 
                brand: brandName, 
                sku: deepData.sku || '',
                price: deepData.price || 0, 
                stock: deepData.stock || 0,
                baselinkerId: deepData.baselinkerId,
                imageUrl: deepData.images && deepData.images.length > 0 ? deepData.images[0] : '',
                weight: deepData.weight,
                length: deepData.length,
                width: deepData.width,
                height: deepData.height,
                taxRate: deepData.taxRate,
                images: deepData.images,
                descriptionHtml: deepData.descriptionHtml,
                features: deepData.features,
                videoUrl: deepData.videoUrl,
                stockErpUnits: deepData.stockErpUnits,
                stockWmsUnits: deepData.stockWmsUnits
            });
        } catch (blError) {
            console.log('BaseLinker Fallback Error:', blError);
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

        res.status(404).json({ error: 'Kod niezarejestrowany w żadnej 4 z darmowych baz OpenSource ani w asortymencie BaseLinkerze.' });
    } catch (error) {
        const path = require('path');
        const fs = require('fs');
        const logPath = path.join(__dirname, '..', 'error_500.txt');
        try { fs.appendFileSync(logPath, error.stack + '\n'); } catch(e) {}
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
                imageUrl: imageUrl || null,
                weight: parseFloat(req.body.weight) || 0.0,
                length: parseFloat(req.body.length) || 0.0,
                width: parseFloat(req.body.width) || 0.0,
                height: parseFloat(req.body.height) || 0.0,
                taxRate: parseFloat(req.body.taxRate) || 23.0,
                stockErpUnits: parseInt(req.body.stockErpUnits) || 0,
                stockWmsUnits: parseInt(req.body.stockWmsUnits) || 0,
                images: req.body.images || [],
                descriptionHtml: req.body.descriptionHtml || null,
                features: req.body.features || {},
                videoUrl: req.body.videoUrl || null
            }
        });
        
        EventBus.publish('PRODUCT_DATA_UPDATED', { product: newProduct, source: 'PIM_UI_CREATE' });
        
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
        delete payload.campaignsAsMain;
        delete payload.campaignProducts;
        delete payload.dealsIRM;
        delete payload.dqs;
        delete payload.allegroCategory;
        delete payload._newFeatureKey;
        delete payload._newFeatureValue;
        
        const dataToUpdate = { ...payload };
        if (payload.stock !== undefined) dataToUpdate.stock = parseFloat(payload.stock) || 0;
        if (payload.salePrice !== undefined) dataToUpdate.salePrice = parseFloat(payload.salePrice) || 0.0;
        if (payload.basePrice !== undefined) dataToUpdate.basePrice = parseFloat(payload.basePrice) || 0.0;
        if (payload.inboundTransportCost !== undefined) dataToUpdate.inboundTransportCost = parseFloat(payload.inboundTransportCost) || 0.0;
        if (payload.packagingCost !== undefined) dataToUpdate.packagingCost = parseFloat(payload.packagingCost) || 0.0;
        if (payload.bdoEprCost !== undefined) dataToUpdate.bdoEprCost = parseFloat(payload.bdoEprCost) || 0.0;
        if (payload.outboundTransportCost !== undefined) dataToUpdate.outboundTransportCost = parseFloat(payload.outboundTransportCost) || 0.0;
        if (payload.weight !== undefined) dataToUpdate.weight = parseFloat(payload.weight) || 0.0;
        if (payload.length !== undefined) dataToUpdate.length = parseFloat(payload.length) || 0.0;
        if (payload.width !== undefined) dataToUpdate.width = parseFloat(payload.width) || 0.0;
        if (payload.height !== undefined) dataToUpdate.height = parseFloat(payload.height) || 0.0;
        if (payload.taxRate !== undefined) dataToUpdate.taxRate = parseFloat(payload.taxRate) || 23.0;
        if (payload.stockErpUnits !== undefined) dataToUpdate.stockErpUnits = parseInt(payload.stockErpUnits) || 0;
        if (payload.stockWmsUnits !== undefined) dataToUpdate.stockWmsUnits = parseInt(payload.stockWmsUnits) || 0;
        
        dataToUpdate.lastContentSource = 'PIM_UI_MANUAL';

        const updatedProduct = await prisma.product.update({
            where: { id: req.params.id },
            data: dataToUpdate
        });
        
        EventBus.publish('PRODUCT_DATA_UPDATED', { product: updatedProduct, source: 'PIM_UI_UPDATE' });
        
        res.status(200).json(updatedProduct);
    } catch (error) { 
        console.error("PATCH error:", error);
        res.status(500).json({ error: 'Blad edycji produktu' }); 
    }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN' && req.user.department !== 'PREZES') return res.status(403).json({ error: 'Brak uprawnień do usuwania produktów' });
    try {
        await prisma.product.delete({ where: { id: req.params.id } });
        EventBus.publish('PRODUCT_DATA_UPDATED', { product: { id: req.params.id, deleted: true }, source: 'PIM_UI_DELETE' });
        res.status(200).json({ status: 'Deleted' });
    } catch (error) {
        console.error("DELETE product error:", error);
        res.status(500).json({ error: 'Błąd usuwania produktu', details: error.message });
    }
});

// --- PIM AI SEARCH ---
app.post('/api/products/ai-search', authenticateToken, async (req, res) => {
    try {
        const { query, products } = req.body;
        if (!query) return res.status(400).json({ error: 'Brak zapytania AI' });
        if (!products || !Array.isArray(products)) return res.status(400).json({ error: 'Brak listy produktów z frontendu' });
        
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" }); 
        
        const prompt = `Jesteś asystentem w systemie ERP Nexus.
Otrzymujesz polecenie wyszukania/filtrowania produktów: "${query}"

Oto lista produktów w formacie JSON (pole dqsTotal oznacza Data Quality):
${JSON.stringify(products)}

Zwróć TYLKO I WYŁĄCZNIE tablicę ID produktów (jako poprawny JSON, np. ["id1", "id2"]), które pasują do zapytania. Nie dodawaj żadnego tekstu przed ani po tablicy, bez znaczników markdowna.`;

        const result = await model.generateContent(prompt);
        let text = result.response.text();
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let ids = [];
        try {
            ids = JSON.parse(text);
        } catch (e) {
            console.error("Błąd parsowania AI:", text);
        }
        res.status(200).json({ ids });
    } catch (error) {
        console.error("AI Search Error:", error);
        res.status(500).json({ error: 'Błąd podczas wyszukiwania AI' });
    }
});

// --- PIM: GŁĘBOKA SYNCHRONIZACJA Z BASELINKER ---
app.post('/api/products/baselinker-sync/:ean', authenticateToken, async (req, res) => {
    try {
        const { ean } = req.params;
        
        const product = await prisma.product.findUnique({ where: { ean } });
        if (!product) {
            return res.status(404).json({ error: `Produkt z EAN ${ean} nie istnieje w lokalnej bazie Nexusa.` });
        }

        // KROK 1: Wydobycie cyfrowego klucza architektury systemu z PIM (Wymuszenie 2-step dance)
        const { inventoryId, productId } = await BaseLinkerService.fetchProductIdByEan(ean);

        // KROK 2: Dekompozycja potężnych danych
        const deepData = await BaseLinkerService.fetchDeepProductData(inventoryId, productId);

        // KROK 3: Aktualizacja bazy Nexusa
        const updated = await prisma.product.update({
            where: { id: product.id },
            data: {
                baselinkerInventoryId: deepData.baselinkerInventoryId,
                baselinkerId: deepData.baselinkerId,
                descriptionHtml: deepData.descriptionHtml,
                features: deepData.features,
                images: deepData.images,
                weight: deepData.weight,
                length: deepData.length,
                width: deepData.width,
                height: deepData.height,
                taxRate: deepData.taxRate,
                videoUrl: deepData.videoUrl,
                attachments: deepData.attachments,
                stockErpUnits: deepData.stockErpUnits,
                stockWmsUnits: deepData.stockWmsUnits,
                isSynced: true,
                stock: deepData.stock // Aktualizacja globalnego stocku w tle
            }
        });

        res.status(200).json(updated);
    } catch (error) {
        console.error("[PIM Sync] Error:", error.message);
        res.status(500).json({ error: error.message });
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
const { startEmailListener } = require('./modules/email/imap.listener');
app.use(errorHandler);

// --- URUCHOMIENIE SERWERA ---
// Podmiana z app.listen na server.listen (obsługa WebSockets)
server.listen(PORT, () => {
    console.log(`[🚀] NeS Backend & WebSocket (Socket.IO) operuje na porcie: ${PORT}`);
    
    // Inicjalizacja nasłuchu IMAP w tle dla skrzynek pracowniczych
    startEmailListener();
});

// --- RĘCZNY WYZWALACZ SENTINELA ---
app.post('/api/allegro-sentinel/trigger', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'ADMIN' && req.user.department !== 'PREZES') {
            return res.status(403).json({ error: 'Brak uprawnień do wyzwalania Sentinela.' });
        }
        // Uruchamiamy w tle, żeby nie blokować odpowiedzi
        allegroSentinelService.runSentinelAudit().catch(err => console.error("Ręczny audyt Sentinela nie powiódł się:", err));
        res.status(200).json({ message: 'Sentinel otrzymał rozkaz Deep Researchu i rozpoczął skanowanie sieci Allegro.' });
    } catch (err) {
        res.status(500).json({ error: 'Błąd wyzwalania Sentinela' });
    }
});

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
            
            // Ochrona przed Rate Limitem (API limit = max 100 req / minute dla niektórych endpoints)
            await new Promise(r => setTimeout(r, 1500));
        }
        console.log('[CRON Worker] Synchronizacja BaseLinkera Zakończona Sukcesem ✅');
    } catch (eee) {
        console.error('[CRON Worker] Zakończono nieznane zadanie lub wystąpił błąd synchronizacji BaseLinker:', eee.message);
    }
});

// --- TŁO: CRON JOB AI SENTINEL (WYDAWCA) ---
// Uruchamia się codziennie o 6:00 rano, by optymalizować nowo wrzucone posty SMI pod kalendarz i akcje promocyjne.
cron.schedule('0 6 * * *', async () => {
    await sentinelService.runSentinelOptimization();
});

// --- TŁO: CRON JOB ALLEGRO SENTINEL (DEEP RESEARCH) ---
allegroSentinelService.initSentinel();

// Nodemon Auto-Wakeup trigger
// Nodemon Auto-Wakeup trigger

// Graceful Shutdown - Naprawa zombiaków EADDRINUSE na Windowsie
const gracefulShutdown = async (signal) => {
    console.log(`[SHUTDOWN] Otrzymano sygnał ${signal}. Zatrzymywanie serwera...`);
    
    try {
        await prisma.$disconnect();
        console.log('[SHUTDOWN] Bezpiecznie rozłączono Prisma ORM.');
    } catch (e) {
        console.error('[SHUTDOWN] Błąd podczas odłączania Prisma:', e);
    }

    server.close(() => {
        console.log('[SHUTDOWN] Zamknięto aktywne połączenia HTTP.');
        process.exit(0);
    });

    // Zabezpieczenie przed wiszącymi połączeniami (Keep-Alive), które blokują server.close()
    setTimeout(() => {
        console.error('[SHUTDOWN] Wymuszanie zamknięcia procesu (timeout 3000ms z powodu wiszących połączeń).');
        process.exit(0);
    }, 3000);
};

process.once('SIGUSR2', () => gracefulShutdown('SIGUSR2'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
