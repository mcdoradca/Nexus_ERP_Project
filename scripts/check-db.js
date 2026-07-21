const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.globalMessage.findMany({ orderBy: { createdAt: 'desc' }, take: 5 }).then(msgs => {
    console.log(msgs);
    process.exit(0);
});
