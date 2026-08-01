const fs = require('fs');
const path = require('path');
const { generateInciVariants } = require('./orchestrator'); 
const baselinkerExtract = require('./baselinker.extract.js');
const inciRefService = require('./inci.reference.service.js');

function extractGenerateInciVariants(rawInci) {
    const { normalizeIngredientName } = require('./normalization.js');
    let cleaned = rawInci.replace(/[.,;]+$/, '').trim();
    let variants = [];
    if (cleaned.includes('(') && cleaned.includes(')')) {
        variants.push(normalizeIngredientName(cleaned));
        
        const beforeParen = cleaned.substring(0, cleaned.indexOf('(')).trim();
        if (beforeParen) variants.push(normalizeIngredientName(beforeParen));
        
        const insideParenMatch = cleaned.match(/\(([^)]+)\)/);
        if (insideParenMatch && insideParenMatch[1]) {
            variants.push(normalizeIngredientName(insideParenMatch[1].trim()));
        }

        const withoutParen = cleaned.replace(/\([^)]+\)/g, '').replace(/\s+/g, ' ').trim();
        if (withoutParen && withoutParen !== beforeParen) {
            variants.push(normalizeIngredientName(withoutParen));
        }
    } else {
        variants.push(normalizeIngredientName(cleaned));
    }
    
    const extraVariants = [];
    for (let v of variants) {
        if (!v.endsWith('s')) extraVariants.push(v + 's');
        if (v.endsWith('s')) extraVariants.push(v.slice(0, -1));
    }
    
    return [...variants, ...extraVariants];
}

async function analyzeFixtures() {
    const dir = path.join(__dirname, 'tests', 'fixtures');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.raw.json'));
    
    let allMissingIngredients = new Set();
    
    const checkHit = (phrase) => {
        const variants = extractGenerateInciVariants(phrase);
        for (let v of variants) {
            if (inciRefService.isOfficialIngredient(v)) return true;
        }
        return false;
    };
    
    for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        let product = null;
        if (data && data.products) {
            product = Object.values(data.products)[0];
        } else {
            product = data;
        }

        const extracted = baselinkerExtract.extractFromFeatures(product);
        if (extracted && extracted.inci && extracted.inci.value) {
            let rawInciArray = extracted.inci.value.split(',').map(i => i.trim()).filter(i => i);
            
            let i = 0;
            while (i < rawInciArray.length) {
                let rawI = rawInciArray[i];
                let found = checkHit(rawI);
                
                if (!found) {
                    if (i + 1 < rawInciArray.length) {
                        let gluedNext = rawI + ',' + rawInciArray[i+1];
                        if (rawI === '1') {
                            console.log('DEBUG: testing 1 gluedNext:', gluedNext);
                            console.log('DEBUG: variants:', extractGenerateInciVariants(gluedNext));
                            console.log('DEBUG: hit:', checkHit(gluedNext));
                        }
                        if (checkHit(gluedNext)) {
                            rawInciArray[i] = gluedNext;
                            rawInciArray.splice(i+1, 1);
                            found = true;
                        }
                    }
                    
                    if (!found && i - 1 >= 0) {
                        let gluedPrev = rawInciArray[i-1] + ',' + rawI;
                        if (rawI === '2-Hexanediol' || rawI === '2 Hexanediol') {
                            console.log('DEBUG: testing gluedPrev:', gluedPrev);
                            console.log('DEBUG: hit:', checkHit(gluedPrev));
                        }
                        if (checkHit(gluedPrev)) {
                            rawInciArray[i-1] = gluedPrev;
                            rawInciArray.splice(i, 1);
                            i--;
                            found = true;
                        }
                    }
                }
                
                if (!found) {
                    allMissingIngredients.add(rawI);
                }
                i++;
            }
        }
    }
    
    const sortedMissing = Array.from(allMissingIngredients).sort((a, b) => a.localeCompare(b));
    console.log(`ZLICZONO: ${sortedMissing.length}`);
    sortedMissing.forEach(i => console.log(i));
}

analyzeFixtures().catch(console.error);
