const EventBus = require('../../core/EventBus');
const notificationsService = require('./notifications.service');

function registerCommunicationListeners() {
    // --- Zdarzenia z Komunikatora ---
    EventBus.subscribe('DirectMessageSent', async ({ senderName, receiverId }) => {
        await notificationsService.createAndSendNotification(receiverId, 'Nowa prywatna wiadomość 💬', `${senderName} napisał(a) do Ciebie.`, 'info');
    });

    EventBus.subscribe('DirectMessageFileSent', async ({ senderName, receiverId }) => {
        await notificationsService.createAndSendNotification(receiverId, 'Nowy Plik w Wiadomości 📎', `${senderName} wysłał(a) plik.`, 'info');
    });

    // --- Zdarzenia z Modułu Zadań (CRM) ---
    EventBus.subscribe('TaskAssigned', async ({ task, assigneeIds, assignerId }) => {
        for (let uid of assigneeIds) {
            if (uid !== assignerId) {
                await notificationsService.createAndSendNotification(uid, 'Nowe zadanie 📝', `Dodano Cię do zadania: ${task.title}`, 'task_new', task.id);
            }
        }
    });

    EventBus.subscribe('TaskBlocked', async ({ task, blockReason, blockerId }) => {
        if (task.creatorId !== blockerId) {
            await notificationsService.createAndSendNotification(task.creatorId, 'Zadanie zablokowane! ⛔', `Zadanie "${task.title}" zostało zablokowane. Powód: ${blockReason}`, 'alert', task.id);
        }
    });

    EventBus.subscribe('TaskCommentAdded', async ({ task, authorName, usersToNotify }) => {
        for (let uid of usersToNotify) {
            await notificationsService.createAndSendNotification(uid, 'Wiadomość z Zadania 💬', `${authorName} napisał(a) na czacie: "${task.title}"`, 'info', task.id);
        }
    });

    EventBus.subscribe('TaskFileAdded', async ({ task, authorName, usersToNotify }) => {
        for (let uid of usersToNotify) {
            await notificationsService.createAndSendNotification(uid, 'Nowy Załącznik 📎', `${authorName} przesłał(a) plik do zadania: "${task.title}"`, 'info', task.id);
        }
    });
}
module.exports = { registerCommunicationListeners };