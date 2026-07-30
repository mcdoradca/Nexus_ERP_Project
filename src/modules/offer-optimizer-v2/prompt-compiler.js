const fs = require('fs');
const path = require('path');

const filesDir = path.join(__dirname, '../offer-optimizer/files');
const outDir = path.join(__dirname, 'prompts');

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

function countPolishDiacritics(text) {
    const diacritics = /[ąęćłńóśźżĄĘĆŁŃÓŚŹŻ]/g;
    const matches = text.match(diacritics);
    return matches ? matches.length : 0;
}

const sharedRules = fs.readFileSync(path.join(filesDir, 'SHARED_RULES_v4.1.md'), 'utf8');
const patchContent = fs.readFileSync(path.join(filesDir, 'PATCH_v4.1_prompty.md'), 'utf8');

const agentsToCompile = [0, 1, 4, 5, 6, 7, 9, 10];
let totalDiacritics = 0;

console.log("Rozpoczynam kompilację promptów v4 + v4.1 patch...");

for (const agentId of agentsToCompile) {
    const promptFilename = `Agent_${agentId}_prompt_v4.md`;
    const promptPath = path.join(filesDir, promptFilename);
    
    if (!fs.existsSync(promptPath)) {
        console.warn(`Brak pliku ${promptFilename}, pomijam...`);
        continue;
    }
    
    let basePrompt = fs.readFileSync(promptPath, 'utf8');
    
    // Extract patch for this agent
    const patchHeader = `## ${promptFilename}`;
    const patchParts = patchContent.split(/## Agent_\d+_prompt_v4\.md|## Node 0 \(Agent_0_prompt_v4\.md\)/);
    
    // Find the right patch part using regex to locate header first
    const regex = new RegExp(`(## (?:Node 0 \\()?Agent_${agentId}_prompt_v4\\.md(?:\\) — obowiązki kodowe)?)`);
    const match = patchContent.match(regex);
    let agentPatch = "";
    if (match) {
        const patchStartIndex = match.index + match[0].length;
        const nextHeaderIndex = patchContent.substring(patchStartIndex).search(/## /);
        agentPatch = nextHeaderIndex !== -1 
            ? patchContent.substring(patchStartIndex, patchStartIndex + nextHeaderIndex).trim()
            : patchContent.substring(patchStartIndex).trim();
    }
    
    const compiledPrompt = `${basePrompt}\n\n--- PATCH v4.1 ---\n${agentPatch}\n\n--- WSPÓLNE REGUŁY ---\n${sharedRules}\n\n--- DANE SKU ---\n{{SKU_DATA}}`;
    
    const compiledPath = path.join(outDir, `Agent_${agentId}_compiled.md`);
    fs.writeFileSync(compiledPath, compiledPrompt, 'utf8');
    
    // Byte length / verification
    const byteLength = Buffer.byteLength(compiledPrompt, 'utf8');
    const diacriticsCount = countPolishDiacritics(compiledPrompt);
    totalDiacritics += diacriticsCount;
    
    console.log(`- Skompilowano ${promptFilename} -> ${compiledPath}`);
    console.log(`  Bajtów: ${byteLength} | Diakrytyki: ${diacriticsCount}`);
}

console.log(`\nKOMPILACJA ZAKOŃCZONA. Łączna liczba polskich diakrytyków: ${totalDiacritics}`);
