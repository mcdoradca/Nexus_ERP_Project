const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { normalizeIngredientName, extractIngredientsFromChunk } = require('../normalization.js');

const prisma = new PrismaClient();

async function run() {
    const docs = [
        { file: 'RAG_SOT_06_Slownik_INCI_i_Mapowanie_AEO.md', mod: 'SOT_06' },
        { file: 'RAG_SOT_10_Składniki Chemii Domowej i Przemysłowej.md', mod: 'SOT_10' },
        { file: 'INCI_i_ich_dzialanie.md', mod: 'INCI_DICT' }
    ];

    const sourceData = {};
    const allSourceIngredients = new Set();
    
    // Parse files
    for (const d of docs) {
        const filePath = path.join(__dirname, '../docs', d.file);
        let content = '';
        if (fs.existsSync(filePath)) {
            content = fs.readFileSync(filePath, 'utf8');
        } else {
            console.error(`File not found: ${filePath}`);
            continue;
        }
        
        const extracted = extractIngredientsFromChunk(content, d.mod);
        sourceData[d.file] = new Set(extracted);
        extracted.forEach(e => allSourceIngredients.add(e));
    }

    // Fetch from DB
    const dbRows = await prisma.knowledgeDocument.findMany({
        where: { entryName: { not: null } },
        select: { entryName: true }
    });

    const dbEntryNames = new Set();
    for (const row of dbRows) {
        if (!row.entryName) continue;
        const parts = row.entryName.split('|');
        for (const p of parts) {
            const norm = normalizeIngredientName(p);
            if (norm) {
                dbEntryNames.add(norm);
            }
        }
    }

    // Measure coverage
    console.log('--- Pokrycie indeksu ---');
    console.log('Źródło | Wpisów składnikowych w pliku | Znaleziono w entryName | %');
    
    const notFoundSource = new Set();
    
    for (const d of docs) {
        const set = sourceData[d.file];
        if (!set) continue;
        
        let found = 0;
        for (const item of set) {
            if (dbEntryNames.has(item)) {
                found++;
            } else {
                notFoundSource.add(item);
            }
        }
        
        const total = set.size;
        const pct = total === 0 ? 0 : ((found / total) * 100).toFixed(2);
        console.log(`${d.file} | ${total} | ${found} | ${pct}%`);
    }

    console.log('\n--- Top 20 NIEZNALEZIONYCH wpisów (z plików) ---');
    const notFoundArr = Array.from(notFoundSource);
    for (let i = 0; i < Math.min(20, notFoundArr.length); i++) {
        console.log(notFoundArr[i]);
    }

    console.log('\n--- Top 20 P5 (entryName bez pokrycia w źródle) ---');
    const dbOnly = [];
    for (const item of dbEntryNames) {
        if (!allSourceIngredients.has(item)) {
            dbOnly.push(item);
        }
    }
    for (let i = 0; i < Math.min(20, dbOnly.length); i++) {
        console.log(dbOnly[i]);
    }
    
    await prisma.$disconnect();
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
