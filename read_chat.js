const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.globalMessage.findMany({ include: { author: true }, orderBy: { createdAt: 'desc' }, take: 10 }).then(msgs => {
    msgs.reverse().forEach(m => console.log(`[${m.author.name}] ${m.content}`));
    prisma.$disconnect();
});
