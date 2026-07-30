const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    const res = await prisma.$queryRaw`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'KnowledgeDocument' 
        AND column_name IN ('sotModule', 'targetAgents', 'chunkType');
    `;
    console.table(res);
    process.exit(0);
}
check();
