require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
const ragService = require('./knowledge.rag.service');

async function run() {
    console.log("=== 4: RZETELNY POMIAR ===");
    
    const existing = [
        'Niacinamide', 'Aqua', 'Sodium Lauryl Sulfate', 'Limonene', 
        'Cocamidopropyl Betaine', 'Sodium Hydroxide', 'Glycerin', 
        'Tocopherol', 'Salicylic Acid', 'Ceramide NP'
    ];
    
    const nonExisting = [
        'Xyzabc Extract', 'Unobtanium Powder', 'Quantum Serum Base', 
        'Ghost Pepper Oil', 'Cybernetic Hyaluronic Acid'
    ];
    
    const all = [...existing, ...nonExisting];
    const sotModules = ['SOT_06','SOT_10','SOT_07','SOT_05','SOT_04','INCI_DICT'];
    
    let minTP = 1.0;
    let maxFP = 0.0;
    
    console.log("Zapytanie | Oczekiwane | Moduł trafienia | Sim | Wynik 0.72 | Wynik 0.60");
    console.log("---|---|---|---|---|---");
    
    for (const ing of all) {
        const isExisting = existing.includes(ing);
        const expected = isExisting ? 'TRAFIENIE' : 'BRAK';
        
        const hits = await ragService.searchKnowledge(ing, { limit: 1, minSimilarity: 0.0, sotModules });
        
        let sim = 0;
        let mod = 'N/A';
        if (hits.length > 0) {
            sim = hits[0].similarity;
            mod = hits[0].sotModule;
        }
        
        if (isExisting && sim < minTP) minTP = sim;
        if (!isExisting && sim > maxFP) maxFP = sim;
        
        const res72 = sim >= 0.72 ? 'TRAFIENIE' : 'ODRZUCONY';
        const res60 = sim >= 0.60 ? 'TRAFIENIE' : 'ODRZUCONY';
        
        console.log(`${ing} | ${expected} | ${mod} | ${sim.toFixed(4)} | ${res72} | ${res60}`);
    }
    
    console.log(`\nMIN(obecne): ${minTP.toFixed(4)}`);
    console.log(`MAX(nieobecne): ${maxFP.toFixed(4)}`);
    
    console.log("\n=== 5: DECYZJA WARUNKOWA ARCHITEKTA ===");
    if (minTP >= 0.62 && maxFP <= 0.56) {
        console.log("WARUNEK SPEŁNIONY: min(TP) >= 0.62 i max(FP) <= 0.56. Ustawiam 0.60.");
    } else {
        console.log("WARUNEK NIE SPEŁNIONY: Nakładanie się marginesów. STOP i CZEKAM.");
    }
    
    console.log("\n=== 5c: TEST GATE-3 (unknownIngredients) ===");
    const testList = [existing[0], existing[1], existing[2], nonExisting[0], nonExisting[1]];
    const res5c = await ragService.getKnowledgeForIngredients(testList, {
        sotModules, minSimilarity: 0.60 // używamy testowo 0.60, chyba że nie jest spełniony to cokolwiek
    });
    console.log("Zapytanie wejściowe:", testList);
    console.log("Zwrócono chunks:", res5c.ragBlock.length);
    console.log("unknownIngredients (GATE-3):", res5c.unknownIngredients);
    
    console.log("\n=== 6: T5 - TEST BUDŻETU ZNAKOWEGO ===");
    const res6 = await ragService.getKnowledgeForIngredients(existing.slice(0,5), {
        sotModules, minSimilarity: 0.60, charBudget: 500
    });
    console.log(`Zużyto ${res6.charsUsed} na limit 500.`);
    console.log(`Zwrócono chunków: ${res6.ragBlock.length} (dostępnych było 5x limit 2 = 10)`);
    if (res6.charsUsed <= 500 && res6.ragBlock.length < 10) {
        console.log("Test zaliczony: Budżet przyciął wyniki.");
    } else {
        console.log("Test niezaliczony: Budżet nie zadziałał poprawnie.");
    }

    process.exit(0);
}
run();
