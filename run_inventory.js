const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log("=== 1a: INWENTARYZACJA PULI ===");
    const resA = await prisma.$queryRawUnsafe(`
        SELECT "sotModule", "chunkType", COUNT(*) as count, MIN("createdAt") as min_created, MAX("createdAt") as max_created
        FROM "KnowledgeDocument" 
        GROUP BY 1,2 ORDER BY 1,2;
    `);
    console.table(resA);

    console.log("=== 1b: NULL sotModule COUNT ===");
    const resB = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*) as count FROM "KnowledgeDocument" WHERE "sotModule" IS NULL;
    `);
    console.table(resB);

    console.log("=== 1c: NULL sotModule DISTINCT TITLES ===");
    const resC = await prisma.$queryRawUnsafe(`
        SELECT DISTINCT title FROM "KnowledgeDocument" WHERE "sotModule" IS NULL LIMIT 20;
    `);
    console.table(resC);

    process.exit(0);
}
run();
