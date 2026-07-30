const { PrismaClient } = require('@prisma/client');
const fs = require('fs');

async function checkLeaks() {
    const prisma = new PrismaClient();
    
    // Hardcoded from validators/index.js (V8)
    const gate1 = [
        'perboric acid, sodium salt', 'trimethylbenzoyl diphenylphosphine oxide', 'tpo', 'n,n-dimethyl-p-toluidine', 'tetrabromobisphenol-a', 'dibutyltin oxide', '4-methylbenzylidene camphor', '4-mbc', 'benzophenone-2', 'bp-2', 'benzophenone-5', 'bp-5', 'titanium dioxide (nano)', 'hydrated silica (nano)', 'silica silylate (nano)', 'silver (nano)'
    ];
    const gate2 = [
        'ketoconazole', 'climbazole', 'clotrimazole', 'miconazole', 'hydroquinone', 'tretinoin', 'adapalene', 'isotretinoin', 'egf', 'fgf', 'erythromycin', 'clindamycin', 'neomycin', 'corticosteroids', 'hydrocortisone'
    ];
    
    const allGates = [...gate1, ...gate2];
    
    const whereConditions = allGates.map(g => ` "entryName" LIKE '%|${g}|%' `).join(' OR ');
    
    const query = `
        SELECT id, title, "sotModule", "chunkType", "entryName"
        FROM "KnowledgeDocument"
        WHERE "entryName" IS NOT NULL
        AND (${whereConditions})
    `;
    
    try {
        const rows = await prisma.$queryRawUnsafe(query);
        console.log('--- WYNIKI DIAGNOZY WYCIEKU BRAMKOWEGO ---');
        console.log(JSON.stringify(rows, null, 2));
    } catch(e) {
        console.error(e);
    }
    
    await prisma.$disconnect();
}

checkLeaks();
