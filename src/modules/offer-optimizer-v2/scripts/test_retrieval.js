require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const ragService = require('./knowledge.rag.service');

async function runTests() {
    console.log("=== T1 & T4: Test Składników (Tabela Zmian Similarity) ===");
    const queries = [
        'Niacinamide',
        'Aqua',
        'Limonene',
        'Sodium Lauryl Sulfate', // składnik chemii domowej SOT 10
        'Jakie są synergie z kwasem hialuronowym?', // SOT 05
        'Xyzabc Extract' // bezsensowne
    ];

    console.log("Zapytanie | Najlepsze trafienie (Moduł) | Sim PRZED (z raportu) | Sim PO");
    console.log("---|---|---|---");
    for (const q of queries) {
        const hits = await ragService.searchKnowledge(q, { limit: 1, minSimilarity: 0.0 });
        if (hits.length > 0) {
            const h = hits[0];
            let simBefore = "N/A";
            if (q === 'Aqua') simBefore = '0.515';
            else if (q === 'Limonene') simBefore = '0.529';
            console.log(`${q} | ${h.sotModule} (${h.chunkType}) | ${simBefore} | ${h.similarity.toFixed(4)}`);
        } else {
            console.log(`${q} | BRAK WYNIKÓW | N/A | N/A`);
        }
    }

    console.log("\n=== T3: Test Odrzucenia GATE/RULE z Retrieval ===");
    // Zapytanie o coś co jest w GATE (np. Ketoconazole)
    const hitsT3 = await ragService.searchKnowledge('Ketoconazole', { limit: 5, minSimilarity: 0.0 });
    const gateHits = hitsT3.filter(h => h.chunkType === 'GATE' || h.chunkType === 'RULE');
    if (gateHits.length > 0) {
        console.log(`[UWAGA] Test T3 OBLANY: zwrócono chunki GATE/RULE (znaleziono ${gateHits.length}).`);
        gateHits.forEach(h => console.log(` - ${h.title} (${h.chunkType})`));
    } else {
        console.log("[SUKCES] Test T3 ZALICZONY: zapytanie słownikowe nie zwróciło chunków GATE/RULE.");
    }

    console.log("\n=== T5: Test Budżetu Znakowego (charBudget) ===");
    const resT5 = await ragService.getKnowledgeForIngredients(['Niacinamide', 'Limonene', 'Aqua']);
    console.log(`Zużyto ${resT5.charsUsed} znaków na limit 10000. Zwrócono ${resT5.ragBlock.length} chunków.`);

    process.exit(0);
}

runTests();
