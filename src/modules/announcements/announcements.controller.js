const announcementsService = require('./announcements.service');

async function getUnreadMandatory(req, res) {
    try {
        const unread = await announcementsService.getUnreadMandatory(req.user.id);
        res.status(200).json(unread);
    } catch (error) { res.status(500).json({ error: 'Błąd sprawdzania tablicy ogłoszeń' }); }
}

async function getAll(req, res) {
    try {
        const announcements = await announcementsService.getAllAnnouncements(req.user.id);
        res.status(200).json(announcements);
    } catch (error) { res.status(500).json({ error: 'Błąd pobierania tablicy ogłoszeń' }); }
}

async function create(req, res) {
    try {
        // Upewniamy się, że tylko osoby decyzyjne mogą rzucać komunikaty na tablicę (chronione z middleware)
        const { title, content, priority, isRequired } = req.body;
        if (!title || !content) return res.status(400).json({ error: 'Brakujące pola' });
        
        const newAnnouncement = await announcementsService.createAnnouncement(req.body, req.user.id);
        res.status(201).json(newAnnouncement);
    } catch (error) { res.status(500).json({ error: 'Błąd dodawania ogłoszenia' }); }
}

async function markAsRead(req, res) {
    try {
        await announcementsService.markAsRead(req.params.id, req.user.id);
        res.status(200).json({ success: true, message: "Zapisano potwierdzenie przeczytania" });
    } catch (error) { 
        // Ignoruj błąd duplikatu (unikalność) jeśli ktoś dwa razy "potwierdził"
        if (error.code === 'P2002') return res.status(200).json({ success: true });
        res.status(500).json({ error: 'Błąd rejestracji odczytu' }); 
    }
}

module.exports = { getUnreadMandatory, getAll, create, markAsRead };