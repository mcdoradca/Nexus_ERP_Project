const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;
const onlineUsers = new Map();

const socketService = {
    init: (server) => {
        io = new Server(server, { cors: { origin: '*', methods: ["GET", "POST", "PATCH", "PUT", "DELETE"] } });
        
        io.use((socket, next) => {
            const token = socket.handshake.auth.token;
            if (!token) return next(new Error("Brak autoryzacji socketu"));
            jwt.verify(token, process.env.JWT_SECRET || 'super-tajny-klucz-aps-ie-2026', (err, decoded) => {
                if (err) return next(new Error("Nieprawidlowy token socketu"));
                socket.user = decoded; 
                next();
            });
        });

        return io;
    },
    getIO: () => {
        if (!io) throw new Error("Socket.io nie zostało zainicjalizowane!");
        return io;
    },
    setOnlineUser: (socketId, userId) => {
        onlineUsers.set(socketId, userId);
        io.emit('online_users', Array.from(new Set(onlineUsers.values())));
    },
    removeOnlineUser: (socketId) => {
        onlineUsers.delete(socketId);
        io.emit('online_users', Array.from(new Set(onlineUsers.values())));
    },
    sendToUser: (userId, event, data) => {
        if (!io) return;
        for (let [sockId, uid] of onlineUsers.entries()) {
            if (uid === userId) io.to(sockId).emit(event, data);
        }
    },
    broadcast: (event, data) => {
        if (!io) return;
        io.emit(event, data);
    }
};

module.exports = socketService;