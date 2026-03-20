const notificationsService = require('./notifications.service');

async function getNotifications(req, res) {
    try {
        const notifs = await notificationsService.getUserNotifications(req.user.id);
        res.status(200).json(notifs);
    } catch (error) { res.status(500).json({ error: 'Błąd pobierania powiadomień' }); }
}

async function markAsRead(req, res) {
    try {
        await notificationsService.markAsRead(req.user.id);
        res.status(200).json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Błąd aktualizacji' }); }
}

module.exports = { getNotifications, markAsRead };