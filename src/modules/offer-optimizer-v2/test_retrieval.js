require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const ragService = require('./knowledge.rag.service');

async function runTests() {
    console.log("--- T1, T2, T4: Test Składników ---");
    const res1 = await ragService.getKnowledgeForIngredients(['Aqua', 'BHT', 'Limonene']);
    console.log("Zwrócone chunki:");
    res1.ragBlock.forEach(b => console.log(`Składnik: ${b.ingredient} | Moduł: ${b.module} | Sim: ${b.similarity} | Dł: ${b.content.length}`));
    console.log(`\nZużyty budżet znakowy (T2): ${res1.charsUsed}`);
    console.log(`Nieznane składniki (T4): ${JSON.stringify(res1.unknownIngredients)}`);

    console.log("\n--- T3: Test Neuromarketing ---");
    const res2 = await ragService.searchKnowledge('Neuromarketing', { limit: 1, sotModules: ['SOT_09'] });
    if (res2.length > 0) {
        console.log(`Wynik: ${res2[0].title} (Moduł: ${res2[0].sotModule}) | Sim: ${res2[0].similarity}`);
    } else {
        console.log("Brak wyników.");
    }
    process.exit(0);
}

runTests();
