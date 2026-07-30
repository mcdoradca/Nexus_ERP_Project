const fs = require('fs');
const path = require('path');

const filesDir = path.join(__dirname, '../offer-optimizer/files');
const outDir = path.join(__dirname, 'prompts');

if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
}

// Usuwanie kompilatu dla Agenta 0
const agent0Path = path.join(outDir, 'Agent_0_compiled.md');
if (fs.existsSync(agent0Path)) {
    fs.unlinkSync(agent0Path);
    console.log("Usunięto Agent_0_compiled.md");
}

function countPolishDiacritics(text) {
    const diacritics = /[ąęćłńóśźżĄĘĆŁŃÓŚŹŻ]/g;
    const matches = text.match(diacritics);
    return matches ? matches.length : 0;
}

const sharedRulesContent = fs.readFileSync(path.join(filesDir, 'SHARED_RULES_v4.1.md'), 'utf8');
const patchContent = fs.readFileSync(path.join(filesDir, 'PATCH_v4.1_prompty.md'), 'utf8');

// Parse SHARED_RULES sections
const sections = {};
const sectionRegex = /## (§[A-J])[^\n]*(?:\n(?!## §)[^\n]*)*(?:\n|$)/g;
let match;
while ((match = sectionRegex.exec(sharedRulesContent)) !== null) {
    sections[match[1]] = match[0].trim();
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
let totalDiacritics = 0;

console.log("Rozpoczynam kompilację promptów v4 + v4.1 patch (tylko wskazane sekcje)...");

for (const agentId of agentsToCompile) {
    let promptFilename = `Agent_${agentId}_prompt_v4.md`;
    let promptPath = path.join(filesDir, promptFilename);
    
    // Agent 8 might be v4.1 already
    if (agentId === 8 && !fs.existsSync(promptPath)) {
        promptFilename = `Agent_8_prompt_v4.1.md`; // Fallback name check if needed
        let altPath = path.join(filesDir, promptFilename);
        if (fs.existsSync(altPath)) promptPath = altPath;
    }
    
    if (!fs.existsSync(promptPath)) {
        console.warn(`Brak pliku ${promptFilename}, pomijam...`);
        continue;
    }
    
    let basePrompt = fs.readFileSync(promptPath, 'utf8');
    
    // Extract patch for this agent if available
    let agentPatch = "";
    if (agentId !== 2 && agentId !== 8) {
        const patchRegex = new RegExp(`(## (?:Node 0 \\()?Agent_${agentId}_prompt_v4\\.md(?:\\) — obowiązki kodowe)?)`);
        const pMatch = patchContent.match(patchRegex);
        if (pMatch) {
            const patchStartIndex = pMatch.index + pMatch[0].length;
            const nextHeaderIndex = patchContent.substring(patchStartIndex).search(/## /);
            agentPatch = nextHeaderIndex !== -1 
                ? patchContent.substring(patchStartIndex, patchStartIndex + nextHeaderIndex).trim()
                : patchContent.substring(patchStartIndex).trim();
        }
    }
    
    let compiledPrompt = basePrompt;

    if (agentPatch) {
        compiledPrompt += `\n\n--- PATCH v4.1 ---\n${agentPatch}`;
    }

    const assignedSections = nodeMap[agentId];
    if (assignedSections && assignedSections.length > 0) {
        let rulesText = assignedSections.map(s => sections[s] || '').join('\n\n');
        compiledPrompt += `\n\n--- WSPÓLNE REGUŁY ---\n${rulesText}`;
    }
    
    compiledPrompt += `\n\n--- DANE SKU ---\n{{SKU_DATA}}`;
    
    // Remove all lines containing "cache" (case-insensitive)
    compiledPrompt = compiledPrompt.split('\n').filter(line => !line.toLowerCase().includes('cache')).join('\n');

    const compiledPath = path.join(outDir, `Agent_${agentId}_compiled.md`);
    fs.writeFileSync(compiledPath, compiledPrompt, 'utf8');
    
    // Byte length / verification
    const byteLength = Buffer.byteLength(compiledPrompt, 'utf8');
    const diacriticsCount = countPolishDiacritics(compiledPrompt);
    totalDiacritics += diacriticsCount;
    
    console.log(`- Skompilowano Agenta ${agentId} -> ${compiledPath}`);
    console.log(`  Bajtów: ${byteLength} | Diakrytyki: ${diacriticsCount}`);
}

console.log(`\nKOMPILACJA ZAKOŃCZONA. Łączna liczba polskich diakrytyków: ${totalDiacritics}`);
