const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$queryRawUnsafe("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='KnowledgeDocument';")
    .then(console.log)
    .finally(() => prisma.$disconnect());
