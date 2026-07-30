const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log("=== 2b: DUPLIKATY SOT_06_LEGACY ===");
    const resA = await prisma.$queryRawUnsafe(`
        SELECT id, title, "sotModule", "createdAt" 
        FROM "KnowledgeDocument" 
        WHERE "sotModule" = 'SOT_06_LEGACY';
    `);
    console.table(resA);

    console.log("Usuwam...");
    const resDel = await prisma.$executeRawUnsafe(`
        DELETE FROM "KnowledgeDocument" WHERE "sotModule" = 'SOT_06_LEGACY';
    `);
    console.log("Usunieto rekordow:", resDel);

    process.exit(0);
}
run();
