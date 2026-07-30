const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
    const rows = await prisma.$queryRaw`SELECT title, content, "chunkType", "entryName" FROM "KnowledgeDocument" WHERE "sotModule" = 'INCI_DICT' LIMIT 5`;
    console.log(rows);
    prisma.$disconnect();
}
run();
