const { execSync } = require('child_process');
const fs = require('fs');

console.log("=== KROK 1: git diff prompt-compiler.js ===");
try {
    const diff1 = execSync('git diff -- src/modules/offer-optimizer-v2/prompt-compiler.js', {encoding: 'utf8'});
    console.log(diff1 || "(pusto)");
} catch(e) {
    if(e.stdout) console.log(e.stdout.toString());
}

console.log("\n=== KROK 2: git diff PATCH_v4.1_prompty.md ===");
try {
    const diff2 = execSync('git diff -- src/modules/offer-optimizer-v2/docs/PATCH_v4.1_prompty.md', {encoding: 'utf8'});
    console.log(diff2);
} catch(e) {
    if(e.stdout) console.log(e.stdout.toString());
}

console.log("\n=== KROK 3: Pelna tresc Agent_1_compiled.md ===");
const a1Content = fs.readFileSync('src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md', 'utf8');
console.log(a1Content);

console.log("\n=== KROK 4: allowedKeys (plik:linia + wydruk) ===");
const orchContent = fs.readFileSync('src/modules/offer-optimizer-v2/orchestrator.js', 'utf8');
const lines = orchContent.split('\n');
const startBL = lines.findIndex(l => l.includes('const allowedKeys = ['));
let endBL = startBL;
while(endBL < lines.length && !lines[endBL].includes('];')) endBL++;
console.log(`orchestrator.js:${startBL+1}-${endBL+1}`);
console.log(lines.slice(startBL, endBL+1).join('\n'));

console.log("\n=== KROK 5: npm test ===");
try {
    execSync('npm test', {stdio: 'inherit'});
} catch(e) {}
