const fs = require('fs');

function fixDecisionLog() {
    let content = fs.readFileSync('src/modules/offer-optimizer-v2/docs/DECISION_LOG.md', 'utf8');
    const idx = content.indexOf(' 9 .   * * W d r o | e n i e');
    if (idx !== -1) {
        content = content.substring(0, idx) + `9. **Wdrożenie deterministycznego lookupu GATE-3**:
   2026-07-30 | dokumentacja: GATE-3 similarity fallback (stary kod) | repo wymaga: deterministycznego exact-match | decyzja Architekta: model \`KnowledgeDocument\` otrzymał kolumnę \`entryName\`, słowniki są mapowane na wyciągnięte nazwy znormalizowane oddzielane znakiem pipe, i zapytanie SQL bazuje na \`LIKE '%|name|%'\` | ryzyko: obniżona tolerancja na literówki (oczekiwane zachowanie GATE-3). Zmiana wykonana w FIX3.

## ZASADA STAŁA: Ochrona kodowania UTF-8
- Pliki tekstowe modyfikujemy i zapisujemy WYŁĄCZNIE przez Node.js (\`fs.writeFileSync(..., 'utf8')\`) albo PowerShell z jawnym parametrem \`-Encoding utf8\`.
- Kategoryczny zakaz używania operatorów \`>>\`, \`echo\` i komendy \`Add-Content\` w PowerShell bez jawnego kodowania UTF-8, gdyż niszczy to polskie znaki diakrytyczne.
`;
        fs.writeFileSync('src/modules/offer-optimizer-v2/docs/DECISION_LOG.md', content, 'utf8');
    }
}

function fixRaport3() {
    let content = fs.readFileSync('src/modules/offer-optimizer-v2/docs/RAPORT_E3_FIX3.md', 'utf8');
    const idx = content.indexOf('## STATUS WDRO');
    if (idx !== -1) {
        content = content.substring(0, idx);
    }
    const idx2 = content.indexOf('\n \n \n## S T A T U S   W D R O');
    if (idx2 !== -1) {
        content = content.substring(0, idx2);
    }
    
    content += `

## STATUS WDROŻENIA
Zakończono z sukcesem. Wdrożono:
1. Modyfikację \`schema.prisma\` i migrację bazy (\`entryName text\`).
2. Normalizację deduplikującą z jednolitym algorytmem dla wszystkich plików (testy jednostkowe 100% pass).
3. Zabezpieczono \`ingestDocument\` idempotencją (usunięcie chunków na początku operacji).
4. Zmieniono metodę \`getKnowledgeForIngredients\` na lookup deterministyczny GATE-3 za pomocą zapytań \`LIKE '%|normalized|%'\`. Weryfikacja similarity pozostała dla pytań opisowych.
5. Zre-ingestowano 11 plików. Osiągnięto pokrycie 99.32%.
`;
    fs.writeFileSync('src/modules/offer-optimizer-v2/docs/RAPORT_E3_FIX3.md', content, 'utf8');
}

fixDecisionLog();
fixRaport3();

// Check if RAPORT_E3_FIX2 has issues:
let r2 = fs.readFileSync('src/modules/offer-optimizer-v2/docs/RAPORT_E3_FIX2.md', 'utf8');
const i2 = r2.indexOf(' 7 9 1 e 6 d 5   f i x ( o f f e r');
if (i2 !== -1) {
    r2 = r2.substring(0, i2) + `791e6d5 fix(offer-optimizer-v2): higiena puli RAG — filtr metadanych, usuniecie duplikatow v2`;
    fs.writeFileSync('src/modules/offer-optimizer-v2/docs/RAPORT_E3_FIX2.md', r2, 'utf8');
}
