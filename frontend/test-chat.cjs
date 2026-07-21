const { io } = require("socket.io-client");
const jwt = require("jsonwebtoken");
const path = require("path");
const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const JWT_SECRET = process.env.JWT_SECRET;

async function run() {
    const prisma = new PrismaClient();
    const user = await prisma.user.findFirst();
    if (!user) {
        console.log("No users found");
        process.exit(1);
    }
    console.log("Using user:", user.id);

    const token1 = jwt.sign({ id: user.id, name: user.name, group: 'PRACOWNICY' }, JWT_SECRET, { expiresIn: '1h' });
    const token2 = jwt.sign({ id: user.id, name: user.name, group: 'PRACOWNICY' }, JWT_SECRET, { expiresIn: '1h' });

    const socket1 = io("http://localhost:3001", { auth: { token: token1 } });
    const socket2 = io("http://localhost:3001", { auth: { token: token2 } });

    socket2.on('connect', () => {
        console.log('Socket2 connected');
        socket2.on('receive_global_message', (msg) => {
            console.log('Socket2 received global message:', msg);
            process.exit(0);
        });
    });

    socket1.on('connect', () => {
        console.log('Socket1 connected. Emitting...');
        setTimeout(() => {
            socket1.emit('send_global_message', { content: 'Test message from actual user' });
        }, 1000);
    });

    setTimeout(() => {
        console.log('Timeout. Message not received.');
        process.exit(1);
    }, 5000);
}

run();
