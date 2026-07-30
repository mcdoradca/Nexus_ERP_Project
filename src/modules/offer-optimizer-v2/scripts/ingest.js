require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const fs = require('fs');
const path = require('path');
const ragService = require('../knowledge.rag.service');

const docsDir = path.join(__dirname, '..', 'docs');

const sotMap = {
    'RAG_SOT_01_Allegro_Marketplace_2026.md': { module: 'SOT_01', agents: [], chunkType: 'GATE' },
    'RAG_SOT_02_Prawo_Kosmetyczne_i_Chemiczne_UE.md': { module: 'SOT_02', agents: ['Agent_4_INCIParser', 'Agent_6_Copywriter'], chunkType: 'CONTEXT' },
    'RAG_SOT_03_Oswiadczenia_i_Claims_655_2013.md': { module: 'SOT_03', agents: [], chunkType: 'RULE' },
    'RAG_SOT_04_Bezpieczenstwo_i_Chemia_Formulacji.md': { module: 'SOT_04', agents: ['Agent_4_INCIParser'], chunkType: 'DICTIONARY_ENTRY' },
    'RAG_SOT_05_Synergie_Antagonizmy_i_Innowacje_Biotech.md': { module: 'SOT_05', agents: ['Agent_4_INCIParser'], chunkType: 'DICTIONARY_ENTRY' },
    'RAG_SOT_06_Slownik_INCI_i_Mapowanie_AEO.md': { module: 'SOT_06', agents: ['Agent_4_INCIParser'], chunkType: 'DICTIONARY_ENTRY' },
    'RAG_SOT_07_Chemia_Domowa_i_Detergenty.md': { module: 'SOT_07', agents: ['Agent_4_INCIParser'], chunkType: 'DICTIONARY_ENTRY' },
    'RAG_SOT_08_AI_Act_w_Ecommerce.md': { module: 'SOT_08', agents: [], chunkType: 'GATE' },
    'RAG_SOT_09_Psychologia_i_Retencja.md': { module: 'SOT_09', agents: [], chunkType: 'RULE' },
    'RAG_SOT_10_Składniki Chemii Domowej i Przemysłowej.md': { module: 'SOT_10', agents: ['Agent_4_INCIParser'], chunkType: 'DICTIONARY_ENTRY' },
    'INCI_i_ich_dzialanie.md': { module: 'INCI_DICT', agents: ['Agent_4_INCIParser'], chunkType: 'DICTIONARY_ENTRY' }
};

async function ingestAll() {
    console.log("Rozpoczynam INGEST do wektorowej bazy...");
    const stats = [];
    let totalSourceChars = 0;
    let totalIngestedChars = 0;

    for (const [filename, config] of Object.entries(sotMap)) {
        const filePath = path.join(docsDir, filename);
        if (!fs.existsSync(filePath)) {
            console.error(`BRAK PLIKU: ${filename}`);
            continue;
        }
        
        const title = filename.replace('.md', '');
        const content = fs.readFileSync(filePath, 'utf8');
        const sourceChars = content.length;
        
        try {
            const res = await ragService.ingestDocument(content, title, { 
                sotModule: config.module, 
                targetAgents: config.agents,
                chunkType: config.chunkType 
            });
            console.log(`[SUKCES] ${title} -> ${res.chunksInserted} chunków (Moduł: ${config.module})`);
            
            // To get ingested chars, we can re-chunk it here just for stats
            const chunks = ragService._chunkMarkdown(content, config.module);
            const ingestedChars = chunks.reduce((sum, c) => sum + c.length, 0);
            
            stats.push({
                file: filename,
                module: config.module,
                sourceChars,
                ingestedChars,
                coverage: (ingestedChars / sourceChars * 100).toFixed(2) + '%'
            });
            
            totalSourceChars += sourceChars;
            totalIngestedChars += ingestedChars;
        } catch (e) {
            console.error(`[BŁĄD] ${title}:`, e.message);
        }
    }
    
    console.log("\n=== Tabela Kompletności Treści ===");
    console.table(stats);
    console.log(`\nŁącznie: ${totalSourceChars} -> ${totalIngestedChars} (${(totalIngestedChars / totalSourceChars * 100).toFixed(2)}%)`);
    
    const docs = await ragService.getGroupedDocuments();
    console.table(docs);
    process.exit(0);
}

ingestAll();
