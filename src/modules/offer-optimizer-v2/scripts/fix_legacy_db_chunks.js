const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixLegacyDbChunks() {
    console.log('Cofanie zmian z poprzedniej sesji na starych wpisach RAG (sotModule IS NULL)...');
    try {
        const res = await prisma.$executeRaw`
            UPDATE "KnowledgeDocument"
            SET "chunkType" = NULL, "entryName" = NULL
            WHERE "sotModule" IS NULL AND "chunkType" IS NOT NULL
        `;
        console.log(`Zaktualizowano ${res} rekordów (powinny być 2).`);
    } catch (e) {
        console.error('Błąd:', e);
    } finally {
        await prisma.$disconnect();
    }
}

fixLegacyDbChunks();
