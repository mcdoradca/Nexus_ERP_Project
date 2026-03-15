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
const io = new Server(server, { cors: { origin: '*', methods: ["GET", "POST", "PATCH", "PUT"] } });
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super-tajny-klucz-aps-ie-2026';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.sendStatus(401);
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user; next();
    });
};

const onlineUsers = new Map();

io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error("Brak autoryzacji socketu"));
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return next(new Error("Nieprawidlowy token socketu"));
        socket.user = decoded; next();
    });
});

io.on('connection', (socket) => {
    const userId = socket.user.id;
    onlineUsers.set(socket.id, userId);
    io.emit('online_users', Array.from(new Set(onlineUsers.values())));

    socket.on('send_global_message', async (data) => {
        if (socket.user.group === 'AGENCJE') return;
        try {
            const newMsg = await prisma.globalMessage.create({
                data: { content: data.content, authorId: userId },
                include: { author: { select: { id: true, name: true, color: true } } }
            });
            io.emit('receive_global_message', newMsg);
        } catch (error) { console.error(error); }
    });

    socket.on('send_direct_message', async (data) => {
        try {
            const { content, receiverId } = data;
            const newMsg = await prisma.directMessage.create({
                data: { content, senderId: userId, receiverId },
                include: { sender: { select: { id: true, name: true, color: true } }, receiver: { select: { id: true, name: true } } }
            });
            socket.emit('receive_direct_message', newMsg);
            for (let [sockId, uid] of onlineUsers.entries()) {
                if (uid === receiverId) io.to(sockId).emit('receive_direct_message', newMsg);
            }
            await sendNotificationToUser(receiverId, { userId: receiverId, title: 'Nowa prywatna wiadomosc \uD83D\uDCAC', message: `${newMsg.sender.name} napisal(a) do Ciebie.`, type: 'info' });
        } catch (error) { console.error(error); }
    });

    socket.on('disconnect', () => {
        onlineUsers.delete(socket.id);
        io.emit('online_users', Array.from(new Set(onlineUsers.values())));
    });
});

const sendNotificationToUser = async (userId, notificationData) => {
    const notif = await prisma.notification.create({ data: notificationData });
    for (let [sockId, uid] of onlineUsers.entries()) {
        if (uid === userId) io.to(sockId).emit('new_notification', notif);
    }
};

// Automatyzacje Cron
cron.schedule('0 8 * * *', async () => {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tasks = await prisma.task.findMany({ where: { status: { not: 'DONE' }, dueDate: { lte: tomorrow, not: null } }, include: { assignees: true } });
    for (let t of tasks) { for (let a of t.assignees) { await sendNotificationToUser(a.id, { userId: a.id, title: 'Zblizajacy sie termin ⚠️', message: `Zadanie "${t.title}" ma termin ukonczenia wkrotce!`, type: 'deadline' }); } }
});

cron.schedule('0 * * * *', async () => {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const idleTasks = await prisma.task.findMany({
        where: { status: { not: 'DONE' }, updatedAt: { lt: yesterday } },
        include: { assignees: true }
    });
    for (let t of idleTasks) {
        for (let a of t.assignees) {
            await sendNotificationToUser(a.id, { userId: a.id, title: 'Zadanie zamrozone ❄️', message: `Zadanie "${t.title}" nie bylo edytowane od wczoraj.`, type: 'idle' });
        }
        await prisma.task.update({ where: { id: t.id }, data: { updatedAt: new Date() } });
    }
});

// AUTH
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (email === 'admin@aps.local' && password === 'admin123') {
            await prisma.user.upsert({
                where: { id: 'admin-id' },
                create: { id: 'admin-id', email: 'admin@aps.local', name: 'Glowny Administrator', passwordHash: await bcrypt.hash('admin123', 10), role: 'ADMIN', group: 'PRACOWNICY', department: 'PREZES', color: 'bg-indigo-100 text-indigo-700' },
                update: {}
            });
            const token = jwt.sign({ id: 'admin-id', role: 'ADMIN', name: 'Glowny Administrator' }, JWT_SECRET, { expiresIn: '24h' });
            return res.json({ token, user: { id: 'admin-id', name: 'Glowny Administrator', role: 'ADMIN', department: 'PREZES' } });
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Nieprawidlowe dane' });
        const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, name: user.name, role: user.role, group: user.group, department: user.department, color: user.color } });
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

// UZYTKOWNICY
app.post('/api/admin/users', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const { email, name, password, group, department, color, role } = req.body;
        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await prisma.user.create({ data: { email, name, passwordHash, group, department, color, role } });
        res.status(201).json(newUser);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.patch('/api/admin/users/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const { email, name, password, group, department, color, role, isActive } = req.body;
        const updateData = { email, name, group, department, color, role, isActive };
        if (password && password.trim() !== '') {
            updateData.passwordHash = await bcrypt.hash(password, 10);
        }
        const updatedUser = await prisma.user.update({
            where: { id: req.params.id },
            data: updateData
        });
        res.status(200).json(updatedUser);
    } catch (error) { res.status(500).json({ error: 'Blad', details: error.message }); }
});

app.get('/api/users', authenticateToken, async (req, res) => {
    const users = await prisma.user.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, group: true, department: true, color: true, activeTaskId: true, email: true, role: true } });
    res.status(200).json(users);
});

// ZADANIA
app.get('/api/tasks', authenticateToken, async (req, res) => {
    try {
        let whereClause = {};
        if (req.user.role !== 'ADMIN') whereClause = { OR: [{ assignees: { some: { id: req.user.id } } }, { creatorId: req.user.id }] };
        const tasks = await prisma.task.findMany({
            where: whereClause,
            include: { assignees: true, project: true, campaign: true, activeWorkers: true, _count: { select: { comments: true } } },
            orderBy: { createdAt: 'desc' }
        });
        res.status(200).json(tasks);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.post('/api/tasks', authenticateToken, async (req, res) => {
    if (req.user.group === 'AGENCJE') return res.status(403).json({ error: 'Agencje nie mogą tworzyć nowych zadań' });
    try {
        const { title, description, priority, projectId, campaignId, assigneeIds, dueDate } = req.body;
        const newTask = await prisma.task.create({
            data: {
                title, description, priority, projectId, campaignId: campaignId || null,
                dueDate: dueDate ? new Date(dueDate) : null, creatorId: req.user.id, status: 'TODO',
                assignees: { connect: (assigneeIds || []).map(id => ({ id })) }
            },
            include: { assignees: true, project: true, campaign: true, activeWorkers: true, _count: { select: { comments: true } } }
        });
        if (assigneeIds && assigneeIds.length > 0) {
            for (let uid of assigneeIds) {
                if (uid !== req.user.id) {
                    await sendNotificationToUser(uid, { userId: uid, title: 'Nowe zadanie \uD83D\uDCDD', message: `Dodano Cie do zadania: ${title}`, type: 'task_new', relatedTaskId: newTask.id });
                }
            }
        }
        io.emit('task_updated');
        res.status(201).json(newTask);
    } catch (error) { 
        console.error("TASK CREATION ERROR:", error.message, error.stack);
        res.status(500).json({ error: 'Blad', details: error.message }); 
    }
});

app.patch('/api/tasks/:id', authenticateToken, async (req, res) => {
    try {
        const { title, description, priority, projectId, campaignId, assigneeIds, dueDate } = req.body;
        let updateData = { title, description, priority, projectId, campaignId: campaignId || null, dueDate: dueDate ? new Date(dueDate) : null };
        if (assigneeIds) updateData.assignees = { set: assigneeIds.map(id => ({ id })) };
        const updatedTask = await prisma.task.update({
            where: { id: req.params.id },
            data: updateData,
            include: { assignees: true, project: true, campaign: true, activeWorkers: true, _count: { select: { comments: true } } }
        });
        io.emit('task_updated');
        res.status(200).json(updatedTask);
    } catch (error) { res.status(500).json({ error: 'Blad serwera' }); }
});

app.patch('/api/tasks/:id/status', authenticateToken, async (req, res) => {
    try {
        const updatedTask = await prisma.task.update({ where: { id: req.params.id }, data: { status: req.body.status } });
        io.emit('task_updated');
        res.status(200).json(updatedTask);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

// NOWOŚĆ: Zarządzanie blokadami
app.patch('/api/tasks/:id/block', authenticateToken, async (req, res) => {
    try {
        const { isBlocked, blockReason } = req.body;
        const updatedTask = await prisma.task.update({
            where: { id: req.params.id },
            data: { isBlocked, blockReason: isBlocked ? blockReason : null },
            include: { creator: true }
        });
        if (isBlocked && updatedTask.creatorId !== req.user.id) {
            await sendNotificationToUser(updatedTask.creatorId, { userId: updatedTask.creatorId, title: 'Zadanie zablokowane! ⛔', message: `Zadanie "${updatedTask.title}" zostalo zablokowane. Powod: ${blockReason}`, type: 'alert', relatedTaskId: updatedTask.id });
        }
        io.emit('task_updated');
        res.status(200).json(updatedTask);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

// NOWOŚĆ: Focus Mode
app.patch('/api/tasks/:id/focus', authenticateToken, async (req, res) => {
    try {
        const { isWorking } = req.body;
        await prisma.user.update({ where: { id: req.user.id }, data: { activeTaskId: isWorking ? req.params.id : null } });
        io.emit('task_updated');
        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

// PROJEKTY
app.get('/api/projects', authenticateToken, async (req, res) => {
    try {
        let whereClause = {};
        if (req.user.role !== 'ADMIN') whereClause = { tasks: { some: { OR: [{ assignees: { some: { id: req.user.id } } }, { creatorId: req.user.id }] } } };
        const projects = await prisma.project.findMany({ where: whereClause, orderBy: { createdAt: 'asc' } });
        res.status(200).json(projects);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.post('/api/projects', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const { name, description, color, startDate, endDate } = req.body;
        const newProject = await prisma.project.create({ data: { name, description, color: color || 'bg-gray-500', startDate: startDate ? new Date(startDate) : null, endDate: endDate ? new Date(endDate) : null } });
        res.status(201).json(newProject);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.get('/api/projects/:id', authenticateToken, async (req, res) => {
    try {
        const project = await prisma.project.findUnique({
            where: { id: req.params.id },
            include: {
                tasks: {
                    include: {
                        assignees: { select: { id: true, name: true, color: true } },
                        creator: { select: { id: true, name: true, color: true } },
                        _count: { select: { comments: true } }
                    },
                    orderBy: { createdAt: 'desc' }
                }
            }
        });
        if (!project) return res.status(404).json({ error: 'Projekt nie istnieje' });
        res.status(200).json(project);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.patch('/api/projects/:id', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const { name, description, color, startDate, endDate, progress, isArchived } = req.body;
        const updatedProject = await prisma.project.update({
            where: { id: req.params.id },
            data: {
                name, description, color,
                startDate: startDate ? new Date(startDate) : null,
                endDate: endDate ? new Date(endDate) : null,
                progress: progress !== undefined ? parseInt(progress) : undefined,
                isArchived: isArchived !== undefined ? isArchived : undefined
            }
        });
        res.status(200).json(updatedProject);
    } catch (error) { res.status(500).json({ error: 'Blad', details: error.message }); }
});// PROJEKTY - KONIEC

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

// KAMPANIE
app.get('/api/campaigns', authenticateToken, async (req, res) => {
    if (req.user.group === 'AGENCJE') return res.status(403).json({ error: 'Brak dostępu do budżetów kampanii' });
    try { const campaigns = await prisma.campaign.findMany({ orderBy: { startDate: 'asc' } }); res.status(200).json(campaigns); } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.post('/api/campaigns', authenticateToken, async (req, res) => {
    if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Brak uprawnien' });
    try {
        const { name, budget, targetSKUs, networks, startDate, endDate, color } = req.body;
        const newCamp = await prisma.campaign.create({ data: { name, budget: parseFloat(budget) || 0, targetSKUs, networks, startDate: new Date(startDate), endDate: new Date(endDate), color: color || 'bg-pink-500' } });
        res.status(201).json(newCamp);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

// KOMENTARZE
app.get('/api/tasks/:taskId/comments', authenticateToken, async (req, res) => {
    try { const comments = await prisma.comment.findMany({ where: { taskId: req.params.taskId }, include: { author: { select: { name: true, color: true } } }, orderBy: { createdAt: 'asc' } }); res.status(200).json(comments); } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.post('/api/tasks/:taskId/comments', authenticateToken, async (req, res) => {
    try {
        const { content } = req.body;
        if (!content || content.trim() === '') return res.status(400).json({ error: 'Brak tresci' });
        const newComment = await prisma.comment.create({ data: { content, taskId: req.params.taskId, authorId: req.user.id, actionType: 'message' }, include: { author: { select: { name: true, color: true } } } });
        const task = await prisma.task.findUnique({ where: { id: req.params.taskId }, include: { assignees: true } });
        const usersToNotify = new Set(task.assignees.map(a => a.id));
        if (task.creatorId) usersToNotify.add(task.creatorId);
        usersToNotify.delete(req.user.id);
        for (let uid of usersToNotify) {
            await sendNotificationToUser(uid, { userId: uid, title: 'Wiadomosc z Zadania \uD83D\uDCAC', message: `${req.user.name} napisal(a) na czacie: "${task.title}"`, type: 'info', relatedTaskId: task.id });
        }
        io.emit('task_updated');
        io.emit('comment_added', newComment);
        res.status(201).json(newComment);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.post('/api/tasks/:taskId/files', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const file = req.file; if (!file) return res.status(400).json({ error: 'Brak pliku' });
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExt}`;
        const filePath = `task-${req.params.taskId}/${fileName}`;
        const { data, error } = await supabase.storage.from('nexus-files').upload(filePath, file.buffer, { contentType: file.mimetype });
        if (error) return res.status(500).json({ error: `Supabase: ${error.message}` });
        const { data: { publicUrl } } = supabase.storage.from('nexus-files').getPublicUrl(filePath);
        const newComment = await prisma.comment.create({ data: { content: `Przeslano plik: ${file.originalname}`, actionType: 'file', fileUrl: publicUrl, fileName: file.originalname, taskId: req.params.taskId, authorId: req.user.id }, include: { author: { select: { name: true, color: true } } } });
        const task = await prisma.task.findUnique({ where: { id: req.params.taskId }, include: { assignees: true } });
        const usersToNotify = new Set(task.assignees.map(a => a.id));
        if (task.creatorId) usersToNotify.add(task.creatorId);
        usersToNotify.delete(req.user.id);
        for (let uid of usersToNotify) {
            await sendNotificationToUser(uid, { userId: uid, title: 'Nowy Zalacznik \uD83D\uDCCE', message: `${req.user.name} przeslal(a) plik do zadania: "${task.title}"`, type: 'info', relatedTaskId: task.id });
        }
        io.emit('task_updated');
        io.emit('comment_added', newComment);
        res.status(201).json(newComment);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

// CZAT GLOBALNY
app.get('/api/chat', authenticateToken, async (req, res) => {
    if (req.user.group === 'AGENCJE') return res.status(403).json({ error: 'Brak dostępu do czatu wewnętrznego' });
    try { const msgs = await prisma.globalMessage.findMany({ include: { author: { select: { id: true, name: true, color: true } } }, orderBy: { createdAt: 'asc' }, take: 100 }); res.status(200).json(msgs); } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

// CZAT PRYWATNY (DM)
app.get('/api/chat/unread', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const unreadMsgs = await prisma.directMessage.findMany({ where: { receiverId: userId, isRead: false }, select: { senderId: true } });
        const unreadPerUser = {};
        let totalUnread = 0;
        for (const msg of unreadMsgs) { unreadPerUser[msg.senderId] = (unreadPerUser[msg.senderId] || 0) + 1; totalUnread++; }
        res.status(200).json({ totalUnread, unreadPerUser });
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.get('/api/chat/direct/:targetUserId', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const targetId = req.params.targetUserId;
        const msgs = await prisma.directMessage.findMany({
            where: { OR: [{ senderId: userId, receiverId: targetId }, { senderId: targetId, receiverId: userId }] },
            include: { sender: { select: { id: true, name: true, color: true } } },
            orderBy: { createdAt: 'asc' }, take: 200
        });
        await prisma.directMessage.updateMany({ where: { senderId: targetId, receiverId: userId, isRead: false }, data: { isRead: true } });
        res.status(200).json(msgs);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.post('/api/chat/direct/:targetUserId/files', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const file = req.file; if (!file) return res.status(400).json({ error: 'Brak pliku' });
        const receiverId = req.params.targetUserId;
        const senderId = req.user.id;
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExt}`;
        const filePath = `chat-${senderId}-${receiverId}/${fileName}`;
        const { data, error } = await supabase.storage.from('nexus-files').upload(filePath, file.buffer, { contentType: file.mimetype });
        if (error) return res.status(500).json({ error: `Supabase: ${error.message}` });
        const { data: { publicUrl } } = supabase.storage.from('nexus-files').getPublicUrl(filePath);
        const newMsg = await prisma.directMessage.create({
            data: { content: `Przeslano plik: ${file.originalname}`, actionType: 'file', fileUrl: publicUrl, fileName: file.originalname, senderId, receiverId },
            include: { sender: { select: { id: true, name: true, color: true } }, receiver: { select: { id: true, name: true } } }
        });
        io.emit('receive_direct_message', newMsg);
        await sendNotificationToUser(receiverId, { userId: receiverId, title: 'Nowy Plik w Wiadomosci \uD83D\uDCCE', message: `${req.user.name} wyslal(a) plik.`, type: 'info' });
        res.status(201).json(newMsg);
    } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

// POWIADOMIENIA
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try { const notifs = await prisma.notification.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 30 }); res.status(200).json(notifs); } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.patch('/api/notifications/read', authenticateToken, async (req, res) => {
    try { await prisma.notification.updateMany({ where: { userId: req.user.id, isRead: false }, data: { isRead: true } }); res.status(200).json({ success: true }); } catch (error) { res.status(500).json({ error: 'Blad' }); }
});

app.get('/api/health', async (req, res) => { res.status(200).json({ status: '🟢 ONLINE - Marketing Engine' }); });
server.listen(PORT, () => console.log(`🚀 APS IE SERVER (Marketing Engine) uruchomiony na porcie ${PORT}`));
