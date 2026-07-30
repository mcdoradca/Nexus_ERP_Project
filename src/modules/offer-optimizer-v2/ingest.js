require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const fs = require('fs');
const path = require('path');
const ragService = require('./knowledge.rag.service');

const docsDir = path.join(__dirname, 'docs');

const sotMap = {
    'RAG_SOT_01_Allegro_Marketplace_2026.md': 'SOT_01',
    'RAG_SOT_02_Prawo_Kosmetyczne_i_Chemiczne_UE.md': 'SOT_02',
    'RAG_SOT_03_Oswiadczenia_i_Claims_655_2013.md': 'SOT_03',
    'RAG_SOT_04_Bezpieczenstwo_i_Chemia_Formulacji.md': 'SOT_04',
    'RAG_SOT_05_Synergie_Antagonizmy_i_Innowacje_Biotech.md': 'SOT_05',
    'RAG_SOT_06_Slownik_INCI_i_Mapowanie_AEO.md': 'SOT_06',
    'RAG_SOT_07_Chemia_Domowa_i_Detergenty.md': 'SOT_07',
    'RAG_SOT_08_AI_Act_w_Ecommerce.md': 'SOT_08',
    'RAG_SOT_09_Psychologia_i_Retencja.md': 'SOT_09',
    'INCI_i_ich_dzialanie.md': 'SOT_06_LEGACY'
};

async function ingestAll() {
    console.log("Rozpoczynam INGEST do wektorowej bazy...");
    for (const [filename, sotModule] of Object.entries(sotMap)) {
        const filePath = path.join(docsDir, filename);
        if (!fs.existsSync(filePath)) {
            console.error(`BRAK PLIKU: ${filename}`);
            continue;
        }
        
        const title = filename.replace('.md', '');
        const content = fs.readFileSync(filePath, 'utf8');
        
        try {
            const res = await ragService.ingestDocument(content, title, { sotModule, chunkType: 'DICTIONARY_ENTRY' });
            console.log(`[SUKCES] ${title} -> ${res.chunksInserted} chunków (Moduł: ${sotModule})`);
        } catch (e) {
            console.error(`[BŁĄD] ${title}:`, e.message);
        }
    }
    
    // Test of retrieval (part of next step but let's just close Prisma here)
    // We can't use prisma.$disconnect easily as the service holds it, but script will exit.
    const docs = await ragService.getGroupedDocuments();
    console.table(docs);
    process.exit(0);
}

ingestAll();
