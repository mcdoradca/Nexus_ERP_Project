const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    await prisma.$executeRawUnsafe(`
        ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "entryName" text;
    `);
    await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_kd_entryname ON "KnowledgeDocument"("entryName");
    `);
    console.log("Dodano kolumne entryName i indeks.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
