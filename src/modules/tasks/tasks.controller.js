const tasksService = require('./tasks.service');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

async function getAll(req, res) {
    try { res.status(200).json(await tasksService.getTasksForUser(req.user)); } 
    catch (error) { res.status(500).json({ error: 'Błąd pobierania zadań' }); }
}

async function create(req, res) {
    if (req.user.group === 'AGENCJE') return res.status(403).json({ error: 'Agencje nie mogą tworzyć nowych zadań' });
    try { res.status(201).json(await tasksService.createTask(req.body, req.user.id)); } 
    catch (error) { 
        console.error('BŁĄD PRISMA:', error);
        res.status(500).json({ error: 'Błąd tworzenia zadania' }); 
    }
}

async function updateStatus(req, res) {
    try {
        const { status } = req.body;
        // Zwykła aktualizacja statusu (Przesuwanie kolumny Kanban)
        res.status(200).json(await tasksService.updateTaskStatus(req.params.id, status, req.user.id));
    } catch (error) { res.status(500).json({ error: 'Błąd aktualizacji statusu' }); }
}

async function updateDetails(req, res) {
    try {
        res.status(200).json(await tasksService.updateTaskDetails(req.params.id, req.body, req.user.id));
    } catch (error) { res.status(500).json({ error: 'Błąd aktualizacji detali' }); }
}

async function blockTask(req, res) {
    try {
        const { isBlocked, blockReason, blockerId } = req.body;
        
        if (isBlocked) {
            if (!blockReason && !blockerId) return res.status(400).json({ error: 'Wymagany powód blokady lub wkazanie odpowiedzialnego.' });
            res.status(200).json(await tasksService.blockTask(req.params.id, blockReason, blockerId, req.user.id));
        } else {
            res.status(200).json(await tasksService.unblockTask(req.params.id));
        }
    } catch (error) { res.status(500).json({ error: 'Błąd serwera przy blokowaniu' }); }
}

async function toggleWork(req, res) {
    try {
        const { isWorking } = req.body;
        res.status(200).json(await tasksService.toggleActiveWorker(req.params.id, isWorking, req.user.id));
    } catch (error) { res.status(500).json({ error: 'Błąd aktualizacji czasu pracy' }); }
}

async function addComment(req, res) {
    try {
        const { content } = req.body;
        if (!content || content.trim() === '') return res.status(400).json({ error: 'Brak tresci' });
        res.status(201).json(await tasksService.addComment(req.params.taskId, req.user.id, content));
    } catch (error) { res.status(500).json({ error: 'Błąd' }); }
}

async function uploadFile(req, res) {
    try {
        const file = req.file; if (!file) return res.status(400).json({ error: 'Brak pliku' });
        const fileExt = file.originalname.split('.').pop();
        const fileName = `task-${req.params.taskId}/${Date.now()}-${Math.round(Math.random() * 1E9)}.${fileExt}`;
        const { error } = await supabase.storage.from('nexus-files').upload(fileName, file.buffer, { contentType: file.mimetype });
        if (error) return res.status(500).json({ error: `Supabase: ${error.message}` });
        const { data: { publicUrl } } = supabase.storage.from('nexus-files').getPublicUrl(fileName);
        
        res.status(201).json(await tasksService.addComment(req.params.taskId, req.user.id, `Przesłano plik: ${file.originalname}`, { publicUrl, fileName: file.originalname }));
    } catch (error) { res.status(500).json({ error: 'Błąd pliku' }); }
}

async function getArchived(req, res) {
    try { res.status(200).json(await tasksService.getArchivedTasks()); } 
    catch (error) { res.status(500).json({ error: 'Błąd pobierania archiwum' }); }
}

async function archiveTask(req, res) {
    try { res.status(200).json(await tasksService.archiveTask(req.params.taskId)); }
    catch (error) { res.status(500).json({ error: 'Błąd archiwizacji' }); }
}

async function restoreTask(req, res) {
    try { res.status(200).json(await tasksService.restoreArchivedTask(req.params.taskId)); }
    catch (error) { res.status(500).json({ error: 'Błąd przywracania' }); }
}

async function deleteHard(req, res) {
    try { res.status(200).json(await tasksService.deleteHardTask(req.params.taskId)); }
    catch (error) { res.status(500).json({ error: 'Błąd usunięcia trwałego' }); }
}

module.exports = { getAll, create, updateStatus, updateDetails, toggleWork, blockTask, addComment, uploadFile, getArchived, archiveTask, restoreTask, deleteHard };