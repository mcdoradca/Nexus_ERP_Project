const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    for (const mod of ['SOT_06', 'SOT_10', 'INCI_DICT']) {
        console.log(`\n=== 20 Przykładowych nazw z modułu ${mod} ===`);
        const rows = await prisma.$queryRaw`
            SELECT "entryName" FROM "KnowledgeDocument" 
            WHERE "sotModule" = ${mod} AND "entryName" IS NOT NULL
            LIMIT 20
        `;
        const names = rows.map(r => r.entryName).filter(Boolean);
        console.log(names.join('\n'));
    }
    prisma.$disconnect();
}

run();
