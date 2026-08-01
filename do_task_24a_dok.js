const { execSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');

console.log("=== KROK 1: KOMPILACJA I SHASUM ===");
execSync('node src/modules/offer-optimizer-v2/prompt-compiler.js', {stdio: 'inherit'});

const agents = [1, 2, 4, 5, 6, 7, 8, 9, 10];
console.log("| Agent | SHA-256 z HEAD | SHA-256 Nowe |");
console.log("|---|---|---|");

for(let id of agents) {
    const p = `src/modules/offer-optimizer-v2/prompts/Agent_${id}_compiled.md`;
    let oldSha = 'BRAK W HEAD';
    try {
        const oldContent = execSync(`git show HEAD:${p}`, {encoding: 'utf8'});
        oldSha = crypto.createHash('sha256').update(oldContent).digest('hex');
    } catch(e) {}
    
    let newSha = 'BRAK Z TERAZ';
    try {
        const newContent = fs.readFileSync(p, 'utf8');
        newSha = crypto.createHash('sha256').update(newContent).digest('hex');
    } catch(e){}
    
    console.log(`| A${id} | ${oldSha} | ${newSha} |`);
}

console.log("\n=== KROK 2a: GREP ===");
try {
    const r = execSync('git grep -rnE "compliance_gpsr_clp|verified_certificates|clp_signal_word|clp_h_phrases|clp_p_phrases|ufi_code|biocidal_or_medical_permit|ph_value|net_capacity_or_weight|gross_weight_kg|dimensions_cm" src/modules/offer-optimizer-v2/ -- *.js', {encoding: 'utf8'});
    console.log(r);
} catch(e) {
    if(e.stdout) console.log(e.stdout.toString());
}

console.log("\n=== KROK 2b: GIT DIFF ===");
try {
    const r2 = execSync('git diff -- src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md', {encoding: 'utf8'});
    console.log(r2);
} catch(e) {
    if(e.stdout) console.log(e.stdout.toString());
}

console.log("\n=== KROK 2c: A1 SCHEMA ===");
const orchContent = fs.readFileSync('src/modules/offer-optimizer-v2/orchestrator.js', 'utf8');
const lines = orchContent.split('\n');
const start = lines.findIndex(l => l.includes('const a1Schema ='));
let end = start;
while(end < lines.length && !lines[end].includes('};')) end++;
console.log(`orchestrator.js:${start+1}-${end+1}`);
console.log(lines.slice(start, end+1).join('\n'));

console.log("\n=== KROK 4: BIALA LISTA ===");
const startBL = lines.findIndex(l => l.includes('const allowedKeys = ['));
let endBL = startBL;
while(endBL < lines.length && !lines[endBL].includes('];')) endBL++;
console.log(`orchestrator.js:${startBL+1}-${endBL+1}`);
console.log(lines.slice(startBL, endBL+1).join('\n'));
