const { PrismaClient } = require('@prisma/client');

async function fixGateTypes() {
    const prisma = new PrismaClient();
    try {
        const update1 = await prisma.$queryRawUnsafe(`
            UPDATE "KnowledgeDocument"
            SET "chunkType" = 'GATE'
            WHERE "content" LIKE '%2. BRAMKA: SKŁADNIKI NIE-KOSMETYCZNE%'
            OR "content" LIKE '%1. SUBSTANCJE ZAKAZANE I KRYTYCZNE RYZYKA FORMULACYJNE%'
        `);
        console.log('Update chunkType to GATE: ', update1);
        
        const update2 = await prisma.$queryRawUnsafe(`
            UPDATE "KnowledgeDocument"
            SET "entryName" = NULL
            WHERE "chunkType" != 'DICTIONARY_ENTRY'
        `);
        console.log('Update entryName to NULL: ', update2);
    } catch(e) {
        console.error(e);
    }
    await prisma.$disconnect();
}

fixGateTypes();
