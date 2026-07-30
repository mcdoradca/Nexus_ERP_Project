const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.$executeRaw`UPDATE "KnowledgeDocument" SET "entryName" = NULL WHERE "chunkType" != 'DICTIONARY_ENTRY' AND "entryName" IS NOT NULL`.then(r => {
    console.log('Updated rows:', r);
    prisma.$disconnect();
});
