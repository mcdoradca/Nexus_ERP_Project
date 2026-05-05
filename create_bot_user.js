const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function ensureBotUser() {
    try {
        const botEmail = 'nexus.ai@system.local';
        let botUser = await prisma.user.findUnique({ where: { email: botEmail } });
        
        if (!botUser) {
            console.log("Tworzenie dedykowanego konta Nexus AI...");
            const dummyPassword = await bcrypt.hash('AIVerySecretPassword!123', 10);
            botUser = await prisma.user.create({
                data: {
                    email: botEmail,
                    name: 'Nexus AI',
                    passwordHash: dummyPassword,
                    color: 'bg-indigo-600',
                    role: 'ADMIN', // Bot ma dostęp do wszystkich danych
                    department: 'BRAK',
                    group: 'PRACOWNICY'
                }
            });
            console.log("Konto utworzone. Bot ID:", botUser.id);
        } else {
            console.log("Konto Nexus AI już istnieje. Bot ID:", botUser.id);
        }
    } catch (err) {
        console.error("Błąd podczas tworzenia bota:", err);
    } finally {
        await prisma.$disconnect();
    }
}

ensureBotUser();
