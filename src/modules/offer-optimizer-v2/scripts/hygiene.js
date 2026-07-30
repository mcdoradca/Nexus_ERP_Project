const fs = require('fs');
const path = require('path');

// Step 1: Update .gitignore
const gitignorePath = path.join(__dirname, '../../.gitignore');
let gitignore = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
const toAdd = ['diff.txt', 'fix_db.js', 'mod_pkg.js', 'logs/', '*-audit.json', '*.sql'];
let appended = false;
for (const item of toAdd) {
    if (!gitignore.includes(item)) {
        gitignore += '\n' + item;
        appended = true;
    }
}
if (appended) {
    fs.writeFileSync(gitignorePath, gitignore.trim() + '\n', 'utf8');
}

// Step 2: Convert BOM to UTF-8
const docsToConvert = [
    'src/modules/offer-optimizer-v2/docs/DECISION_LOG.md',
    'src/modules/offer-optimizer-v2/docs/RAPORT_E3_FIX2.md',
    'src/modules/offer-optimizer-v2/docs/RAPORT_E3_FIX3.md'
];

for (const p of docsToConvert) {
    const fullPath = path.join(__dirname, '../../../..', p);
    if (!fs.existsSync(fullPath)) continue;
    let buf = fs.readFileSync(fullPath);
    let str = '';
    if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
        str = buf.toString('utf16le');
    } else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
        // UTF-16BE just in case
        str = buf.toString('utf16le'); // V8 supports it but let's assume LE for windows
    } else if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
        str = buf.toString('utf8', 3);
    } else {
        str = buf.toString('utf8');
    }
    fs.writeFileSync(fullPath, str, 'utf8');
}

// Read DECISION_LOG.md and print first 15 lines
const dlPath = path.join(__dirname, '../docs/DECISION_LOG.md');
if (fs.existsSync(dlPath)) {
    console.log('--- DECISION_LOG.md (first 15 lines) ---');
    const lines = fs.readFileSync(dlPath, 'utf8').split('\n');
    console.log(lines.slice(0, 15).join('\n'));
}

// Step 3: MASTER_HANDOFF_OFFER_OPTIMIZER_V2.md
const masterHandoff = path.join(__dirname, '../docs/MASTER_HANDOFF_OFFER_OPTIMIZER_V2.md');
if (fs.existsSync(masterHandoff)) {
    let content = fs.readFileSync(masterHandoff, 'utf8');
    
    const missingText = `\\[2026-07-31] E2 zamknięty (commity 2b270da, 1ce0632; walidatory V1–V10

\\+ testy zielone; pakiet wsadowy zalegalizowany w offer-optimizer-v2/docs/

jako lokalizacja kanoniczna). Model Pro = gemini-3.1-pro-preview

(ratyfikacja Architekta, re-weryfikacja ListModels przed E5 i E6).

Etap bieżący: E3 wg INSTRUKCJA\\_E3.md — bramka startowa: komplet plików

RAG\\_SOT\\_01…10 + INCI\\_i\\_ich\\_dzialanie.md w docs/ (dostarcza operator).

`;
    
    const currentEntry = `\\[2026-07-31] E3 w konsolidacji po degradacji sesji: naprawa kodowania DECISION\\_LOG, przywrócenie baterii testów, ścieżka składnikowa deterministyczna (decyzja Architekta). Etap bieżący: E3 wg INSTRUKCJA\\_E3\\_KONSOLIDACJA.md.`;

    if (!content.includes('E2 zamknięty')) {
        content = content.replace(currentEntry, missingText + currentEntry);
        fs.writeFileSync(masterHandoff, content, 'utf8');
    }
}
