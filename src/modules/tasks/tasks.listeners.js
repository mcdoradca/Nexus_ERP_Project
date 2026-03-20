const EventBus = require('../../core/EventBus');
const notificationsService = require('../communication/notifications.service');

function registerTasksListeners() {
    // Protokół Wąskiego Gardła - Powiadomienie natychmiastowe do osoby blokującej
    EventBus.subscribe('TaskBlocked', async ({ task, blockReason, blockerId, requestorId }) => {
        if (blockerId) {
            // Nękanie osoby wyznaczonej jako wąskie gardło
            await notificationsService.createAndSendNotification(blockerId, 'Oznaczenie jako Wąskie Gardło 🚨', `Zablokowałeś zadanie: "${task.title}". Powód: ${blockReason}`, 'alert', task.id);
        }
        if (task.ownerId && task.ownerId !== requestorId) {
            // Informacja dla Właściciela zadania, że jego zadanie stoi
            await notificationsService.createAndSendNotification(task.ownerId, 'Twoje zadanie zablokowane ⛔', `Zadanie "${task.title}" ma przestój!`, 'alert', task.id);
        }
    });
}

module.exports = { registerTasksListeners };