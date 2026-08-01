const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("\n=== KROK 3: Object.keys(pimData) ===");
const extractFromFeatures = require(path.resolve(__dirname, 'src/modules/offer-optimizer-v2/baselinker.extract.js')).extractFromFeatures;
const sampleTrimay = require(path.resolve(__dirname, 'src/modules/offer-optimizer-v2/tests/fixtures/trimay_pim_sample.json'));

(async () => {
    // Trimay
    const pimTrimay = extractFromFeatures(sampleTrimay);
    console.log("TRIMAY keys:");
    console.log(Object.keys(pimTrimay));

    // Equilibra
    try {
        const sampleEquilibra = require(path.resolve(__dirname, 'src/modules/offer-optimizer-v2/tests/fixtures/baselinker_product_8000137015436.json'));
        const pimEquilibra = extractFromFeatures(sampleEquilibra);
        console.log("EQUILIBRA keys:");
        console.log(Object.keys(pimEquilibra));
    } catch(err) {
        console.log("Nie moge wczytac bazy Equilibra", err.message);
    }

    console.log("\n=== KROK 4: grep na sds_required ===");
    try {
        const r2 = execSync('git grep -rn "sds_required" -- "src/modules/offer-optimizer-v2"', {encoding: 'utf8'});
        console.log(r2);
    } catch(e) {
        if(e.stdout) console.log(e.stdout.toString());
    }

    console.log("\n=== KROK 6: git diff --stat ===");
    try {
        const r3 = execSync('git diff --stat src/modules/offer-optimizer-v2/', {encoding: 'utf8'});
        console.log(r3 || "(pusto)");
    } catch(e) {
        if(e.stdout) console.log(e.stdout.toString());
    }

    console.log("\n=== KROK 5: npm test ===");
    try {
        execSync('npm test', {stdio: 'inherit'});
    } catch(e) {}
})();
