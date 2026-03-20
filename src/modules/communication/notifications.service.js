const prisma = require('../../core/prisma');
const socketService = require('../../core/socket');

async function getUserNotifications(userId) {
    return prisma.notification.findMany({ 
        where: { userId }, 
        orderBy: { createdAt: 'desc' }, 
        take: 30 
    });
}

async function markAsRead(userId) {
    await prisma.notification.updateMany({ 
        where: { userId, isRead: false }, 
        data: { isRead: true } 
    });
}

async function createAndSendNotification(userId, title, message, type = 'info', relatedTaskId = null) {
    const notif = await prisma.notification.create({ data: { userId, title, message, type, relatedTaskId } });
    socketService.sendToUser(userId, 'new_notification', notif);
}

module.exports = { getUserNotifications, markAsRead, createAndSendNotification };