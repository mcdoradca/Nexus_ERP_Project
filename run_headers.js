const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log("=== 3b: ZESTAWIENIE NAGLOWKOW ===");
    const sots = ['SOT_04', 'SOT_06', 'SOT_02', 'SOT_01', 'SOT_03', 'SOT_08', 'SOT_09'];
    for (const sot of sots) {
        const res = await prisma.$queryRawUnsafe(`
            SELECT DISTINCT content
            FROM "KnowledgeDocument"
            WHERE "sotModule" = $1;
        `, sot);
        console.log(`\n--- ${sot} ---`);
        res.forEach(r => {
            const firstLine = r.content.split('\n')[0];
            if (firstLine.startsWith('[')) console.log(firstLine);
        });
    }
    process.exit(0);
}
run();
