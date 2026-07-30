const fs = require('fs');
const path = require('path');

const filesDir = path.join(__dirname, '../offer-optimizer/files');
const outDir = path.join(__dirname, 'prompts');

function countDiacritics(text) {
    if (!text) return 0;
    const diacritics = /[ąęćłńóśźżĄĘĆŁŃÓŚŹŻ]/g;
    const matches = text.match(diacritics);
    return matches ? matches.length : 0;
}

const sharedRulesContent = fs.readFileSync(path.join(filesDir, 'SHARED_RULES_v4.1.md'), 'utf8');
const patchContent = fs.readFileSync(path.join(filesDir, 'PATCH_v4.1_prompty.md'), 'utf8');

const sharedSections = {};
const sectionRegex = /## (§[A-J])[^\n]*(?:\n(?!## §)[^\n]*)*(?:\n|$)/g;
let match;
while ((match = sectionRegex.exec(sharedRulesContent)) !== null) {
    sharedSections[match[1]] = match[0].trim();
}

const patchSections = {};
const patchSplit = patchContent.split(/(?=# Agent )/);
for (const part of patchSplit) {
    const m = part.match(/# Agent (\d+)/);
    if (m) {
        patchSections[m[1]] = part.trim();
    }
}

const nodeMap = {
    1: ['§I'],
    2: [],
    4: ['§B', '§C', '§I', '§J'],
    5: ['§D', '§E', '§F'],
    6: ['§A', '§B', '§C', '§J'],
    7: ['§A', '§B', '§C', '§H', '§J'],
    8: ['§G'],
    9: ['§G'],
    10: ['§D', '§E', '§F', '§J']
};

const agentsToCompile = [1, 2, 4, 5, 6, 7, 8, 9, 10];

console.log("| Plik skompilowany | Diakrytyki ŹRÓDŁA | Diakrytyki KOMPILAT | Różnica | Przyczyna |");
console.log("| :--- | :--- | :--- | :--- | :--- |");

for (const agentId of agentsToCompile) {
    let promptFilename = `Agent_${agentId}_prompt_v4.md`;
    let promptPath = path.join(filesDir, promptFilename);
    if (!fs.existsSync(promptPath)) {
        if (agentId === 8) promptPath = path.join(filesDir, `Agent_8_prompt_v4.1.md`);
        else promptPath = path.join(filesDir, `Agent_10_prompt_v4.1.md`); // just in case
    }
    
    const baseContent = fs.existsSync(promptPath) ? fs.readFileSync(promptPath, 'utf8') : '';
    const baseCount = countDiacritics(baseContent);
    
    const patchCount = countDiacritics(patchSections[agentId] || '');
    
    let sharedCount = 0;
    for (const section of nodeMap[agentId]) {
        sharedCount += countDiacritics(sharedSections[section] || '');
    }
    
    const sourceTotal = baseCount + patchCount + sharedCount;
    
    const compiledContent = fs.readFileSync(path.join(outDir, `Agent_${agentId}_compiled.md`), 'utf8');
    const compiledCount = countDiacritics(compiledContent);
    
    const diff = compiledCount - sourceTotal;
    
    let cause = "-";
    if (diff !== 0) {
        cause = "Usunięcie Cache / Wstrzyknięcie nagłówka z thinkingBudget";
    }
    
    console.log(`| Agent_${agentId}_compiled.md | ${sourceTotal} | ${compiledCount} | ${diff} | ${cause} |`);
}
