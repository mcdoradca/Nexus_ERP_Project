const chatService = require('./chat.service');
const nexusBotService = require('./nexus-bot.service');

function registerSocketHandlers(socket) {
    socket.on('send_global_message', async (data) => {
        if (socket.user.group === 'AGENCJE') return;
        try { 
            await chatService.saveGlobalMessage(socket.user.id, data.content); 
            if (data.content.includes('@Nexus') || data.content.includes('@NeS')) {
                // Asynchroniczne wywołanie bota
                nexusBotService.processBotMention(data.content, socket.user.name, 'global', null, socket).catch(console.error);
            }
        } catch (error) { console.error(error); }
    });

    socket.on('send_direct_message', async (data) => {
        try {
            await chatService.saveDirectMessage(socket.user.id, socket.user.name, data.receiverId, data.content);
            if (data.content.includes('@Nexus') || data.content.includes('@NeS')) {
                nexusBotService.processBotMention(data.content, socket.user.name, 'direct', socket.user.id, socket).catch(console.error);
            }
        } catch (error) { console.error(error); }
    });

    socket.on('send_entity_message', async (data) => {
        try {
            await chatService.saveEntityComment(data.entityType, data.entityId, socket.user.id, data.content);
            if (data.content.includes('@Nexus') || data.content.includes('@NeS')) {
                nexusBotService.processBotMention(data.content, socket.user.name, data.entityType, data.entityId, socket).catch(console.error);
            }
        } catch (error) { console.error(error); }
    });
}

module.exports = { registerSocketHandlers };