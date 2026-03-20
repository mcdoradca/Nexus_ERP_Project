const chatService = require('./chat.service');

function registerSocketHandlers(socket) {
    socket.on('send_global_message', async (data) => {
        if (socket.user.group === 'AGENCJE') return;
        try { await chatService.saveGlobalMessage(socket.user.id, data.content); } catch (error) { console.error(error); }
    });

    socket.on('send_direct_message', async (data) => {
        try {
            await chatService.saveDirectMessage(socket.user.id, socket.user.name, data.receiverId, data.content);
        } catch (error) { console.error(error); }
    });

    socket.on('send_entity_message', async (data) => {
        try {
            await chatService.saveEntityComment(data.entityType, data.entityId, socket.user.id, data.content);
        } catch (error) { console.error(error); }
    });
}

module.exports = { registerSocketHandlers };