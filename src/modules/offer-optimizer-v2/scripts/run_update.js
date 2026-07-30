const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
    console.log("=== 3a: UPDATE CHUNKTYPE PER SEKCJA ===");

    const gateHeaders = [
        '1. SUBSTANCJE ZAKAZANE I KRYTYCZNE RYZYKA FORMULACYJNE (HARD BANS)',
        '2. BRAMKA: SKŁADNIKI NIE-KOSMETYCZNE (HARD STOP DLA AGENTA 4)',
        '3. PRODUKTY BIOBÓJCZE W CHEMII DOMOWEJ (REŻIM BPR 528/2012)'
    ];

    const ruleHeaders = [
        '3. DOZWOLONE ZNACZNIKI HTML W OPISIE (TWARDA REGUŁA API)',
        '4. ARCHITEKTURA OPISU: 6 SEKCJI AEO Z OBOWIĄZKOWYMI EMOTIKONAMI',
        'C. Obowiązkowe Elementy i Słownictwo:',
        '1. 6 ZŁOTYCH KRYTERIÓW OŚWIADCZEŃ (THE 6 PILLARS OF CLAIMS)',
        '2. TWARDE ZAKAZY W OŚWIADCZENIACH (WHAT IS BANNED)',
        '0. KALENDARZ STOSOWANIA (KRYTYCZNE – STAN NA LIPIEC 2026)',
        '3. OBRAZY I GRAFIKA – GENEROWANIE I MODYFIKACJA (SYNTHETIC MEDIA)',
        '1. PSYCHOLOGIA DECYZJI „TU I TERAZ"',
        '2. LIKWIDACJA MIKROTARĆ (THE SILENT CART KILLERS)'
    ];

    let totalUpdatedGate = 0;
    for (const h of gateHeaders) {
        const likeStr = `[${h}]%`;
        const res = await prisma.$executeRawUnsafe(`
            UPDATE "KnowledgeDocument"
            SET "chunkType" = 'GATE'
            WHERE content LIKE $1;
        `, likeStr);
        totalUpdatedGate += res;
    }
    console.log(`Zaktualizowano na GATE: ${totalUpdatedGate}`);

    let totalUpdatedRule = 0;
    for (const h of ruleHeaders) {
        const likeStr = `[${h}]%`;
        const res = await prisma.$executeRawUnsafe(`
            UPDATE "KnowledgeDocument"
            SET "chunkType" = 'RULE'
            WHERE content LIKE $1;
        `, likeStr);
        totalUpdatedRule += res;
    }
    console.log(`Zaktualizowano na RULE: ${totalUpdatedRule}`);

    console.log("=== 3c: ZESTAWIENIE PO UPDATE ===");
    const resA = await prisma.$queryRawUnsafe(`
        SELECT "sotModule", "chunkType", COUNT(*) as count
        FROM "KnowledgeDocument" 
        WHERE "sotModule" IS NOT NULL
        GROUP BY 1,2 ORDER BY 1,2;
    `);
    console.table(resA);

    process.exit(0);
}
run();
