const prisma = require('../../core/prisma');
const socketService = require('../../core/socket');
const EventBus = require('../../core/EventBus');

async function getGlobalMessages() {
    return prisma.globalMessage.findMany({ 
        include: { author: { select: { id: true, name: true, color: true } } }, 
        orderBy: { createdAt: 'asc' }, 
        take: 100 
    });
}

async function saveGlobalMessage(authorId, content, fileData = null) {
    const data = { content, authorId };
    if (fileData) {
        data.actionType = 'file'; data.fileUrl = fileData.publicUrl; data.fileName = fileData.fileName;
    }
    const newMsg = await prisma.globalMessage.create({
        data, include: { author: { select: { id: true, name: true, color: true } } }
    });
    socketService.broadcast('receive_global_message', newMsg);
    return newMsg;
}

// NOWOŚĆ: Komentarze do encji
async function getEntityComments(entityType, entityId) {
    const where = {};
    where[`${entityType}Id`] = entityId; 
    return prisma.comment.findMany({
        where, 
        include: { author: { select: { id: true, name: true, color: true } } },
        orderBy: { createdAt: 'asc' }
    });
}

async function saveEntityComment(entityType, entityId, authorId, content, fileData = null) {
    const data = { authorId, content };
    data[`${entityType}Id`] = entityId;
    if (fileData) {
        data.actionType = 'file'; data.fileUrl = fileData.publicUrl; data.fileName = fileData.fileName;
    }
    const newMsg = await prisma.comment.create({
        data, include: { author: { select: { id: true, name: true, color: true } } }
    });
    socketService.broadcast(`receive_entity_message_${entityType}_${entityId}`, newMsg);
    return newMsg;
}

async function getUnreadDirectMessages(userId) {
    const unreadMsgs = await prisma.directMessage.findMany({ 
        where: { receiverId: userId, isRead: false }, 
        select: { senderId: true } 
    });
    const unreadPerUser = {};
    let totalUnread = 0;
    for (const msg of unreadMsgs) { 
        unreadPerUser[msg.senderId] = (unreadPerUser[msg.senderId] || 0) + 1; 
        totalUnread++; 
    }
    return { totalUnread, unreadPerUser };
}

async function getDirectMessagesAndMarkAsRead(userId, targetId) {
    const msgs = await prisma.directMessage.findMany({
        where: { OR: [{ senderId: userId, receiverId: targetId }, { senderId: targetId, receiverId: userId }] },
        include: { sender: { select: { id: true, name: true, color: true } } },
        orderBy: { createdAt: 'asc' }, take: 200
    });
    await prisma.directMessage.updateMany({ where: { senderId: targetId, receiverId: userId, isRead: false }, data: { isRead: true } });
    return msgs;
}

async function saveDirectMessage(senderId, senderName, receiverId, content, fileData = null) {
    const data = { senderId, receiverId, content };
    if (fileData) {
        data.actionType = 'file'; data.fileUrl = fileData.publicUrl; data.fileName = fileData.fileName;
    }
    const newMsg = await prisma.directMessage.create({
        data, include: { sender: { select: { id: true, name: true, color: true } }, receiver: { select: { id: true, name: true } } }
    });
    socketService.sendToUser(senderId, 'receive_direct_message', newMsg);
    socketService.sendToUser(receiverId, 'receive_direct_message', newMsg);
    
    EventBus.publish(fileData ? 'DirectMessageFileSent' : 'DirectMessageSent', { senderId, senderName, receiverId, fileName: fileData?.fileName, content });
    return newMsg;
}

module.exports = { getGlobalMessages, saveGlobalMessage, getUnreadDirectMessages, getDirectMessagesAndMarkAsRead, saveDirectMessage, getEntityComments, saveEntityComment };