const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { SDSChemicalExtractor, SDSProcessorEngine } = require('../src/modules/sds/sds.service');
const { SDSVerifierAgent } = require('../src/modules/sds/sds.verifier.agent');
const { SDSLinter } = require('../src/modules/sds/engine/sds.linter');

test('ADR-106: SDSChemicalExtractor - Rozróżnianie izoeugenolu i eugenolu oraz mapowanie synonimów IUPAC', async (t) => {
  const components = [
    { name: 'izoeugenol', originalName: 'isoeugenol', cas: '97-54-1' },
    { name: 'cytronellol', originalName: 'citronellol', cas: '106-22-9' },
    { name: '(6E)-3,7-dimethylnona-1,6-dien-3-ol', originalName: '(6E)-3,7-dimethylnona-1,6-dien-3-ol', cas: '10339-55-6' },
    { name: 'kumaryna (2H-chromen-2-on)', originalName: 'coumarin', cas: '91-64-5' },
    { name: 'etanol', originalName: 'ethanol', cas: '64-17-5' }
  ];

  // 1. Odróżnienie isoeugenol od eugenol
  const compIso = SDSChemicalExtractor.findMatchingComponent('isoeugenol', components);
  assert.strictEqual(compIso?.cas, '97-54-1', 'isoeugenol musi mapować do CAS 97-54-1');

  const compEugenol = SDSChemicalExtractor.findMatchingComponent('eugenol', components);
  assert.strictEqual(compEugenol, null, 'eugenol nie może fałszywie zmatchować izoeugenolu');

  // 2. Mapowanie IUPAC na komponenty ze składu
  const compCit = SDSChemicalExtractor.findMatchingComponent('3,7-DIMETHYLOCT-6-EN-1-OL', components);
  assert.strictEqual(compCit?.cas, '106-22-9', '3,7-DIMETHYLOCT-6-EN-1-OL musi mapować do cytronellol');

  const compEthyl = SDSChemicalExtractor.findMatchingComponent('3,7-DIMETHYLNONA-1,6-DIEN-3-OL', components);
  assert.strictEqual(compEthyl?.cas, '10339-55-6', '3,7-DIMETHYLNONA-1,6-DIEN-3-OL musi mapować do ethyllinalool');

  // 3. resolvePlName nie może podmieniać izoeugenol -> eugenol
  const plIso = SDSChemicalExtractor.resolvePlName(null, 'isoeugenol');
  assert.strictEqual(plIso, 'izoeugenol', 'isoeugenol musi być przetłumaczony jako izoeugenol, nie eugenol');
});

test('ADR-106: SDSVerifierAgent REGUŁA 21 - Auto-remediacja fałszywego eugenolu i eliminacja klonów', async (t) => {
  const mockComponents = [
    { name: 'izoeugenol', originalName: 'isoeugenol', cas: '97-54-1' },
    { name: 'cytronellol', originalName: 'citronellol', cas: '106-22-9' },
    { name: '(6E)-3,7-dimethylnona-1,6-dien-3-ol', originalName: '(6E)-3,7-dimethylnona-1,6-dien-3-ol', cas: '10339-55-6' },
    { name: 'etanol', originalName: 'ethanol', cas: '64-17-5' }
  ];

  const inputSections = {
    section_2: {
      content: "2.2. Elementy oznakowania\n\n" +
               "Piktogramy określające rodzaj zagrożenia:\nGH02, GHS07\n\n" +
               "Hasło ostrzegawcze:\nNiebezpieczeństwo\n\n" +
               "Nazwy niebezpiecznych substancji wymienione na etykiecie\n" +
               "3,7-DIMETHYLOCT-6-EN-1-OL, cytronellol, 3,7-DIMETHYLNONA-1,6-DIEN-3-OL, (6E)-3,7-dimethylnona-1,6-dien-3-ol, eugenol, etanol\n\n" +
               "Zwroty wskazujące rodzaj zagrożenia\nH225 Wysoce łatwopalna ciecz i pary."
    },
    section_3: {
      content: "3.2. Mieszaniny\n\n" +
               "Substancje stwarzające zagrożenie:\n" +
               "izoeugenol | CAS: 97-54-1 | 0,1 - 1 %\n" +
               "cytronellol | CAS: 106-22-9 | 1 - 5 %\n" +
               "(6E)-3,7-dimethylnona-1,6-dien-3-ol | CAS: 10339-55-6 | 1 - 5 %\n" +
               "etanol | CAS: 64-17-5 | 70 - 80 %"
    }
  };

  const result = await SDSVerifierAgent.verifyAndAudit(inputSections, { components: mockComponents, skipAiAudit: true });
  const fixedS2 = result.validatedSections.section_2.content;

    // Weryfikacja: eugenol został zastąpiony izoeugenol
    assert.ok(fixedS2.includes('izoeugenol'), 'Sekcja 2.2 powinna zawierać izoeugenol');
    assert.ok(!/\beugenol\b/i.test(fixedS2.replace(/izoeugenol/gi, '')), 'Sekcja 2.2 nie może zawierać eugenol');

    // Weryfikacja: usunięto klony 3,7-DIMETHYLOCT-6-EN-1-OL i 3,7-DIMETHYLNONA-1,6-DIEN-3-OL
    assert.ok(!/3,7-DIMETHYLOCT-6-EN-1-OL/i.test(fixedS2), 'Sekcja 2.2 nie może zawierać klonu 3,7-DIMETHYLOCT-6-EN-1-OL obok cytronellolu');
    assert.ok(!/\b3,7-dimethylnona-1,6-dien-3-ol\b/i.test(fixedS2.replace(/\(6E\)-3,7-dimethylnona-1,6-dien-3-ol/gi, '')), 'Sekcja 2.2 nie może zawierać surowej postaci obok formy (6E)');

    // Weryfikacja audytu
    const autoRemediations = result.auditLog.filter(l => l.status === 'AUTO_REMEDIATED');
    assert.ok(autoRemediations.some(l => l.rule === 'SECTION_2_ALLERGEN_IDENTITY_REMEDIATION'), 'Zalogowano naprawę tożsamości alergenu');
    assert.ok(autoRemediations.some(l => l.rule === 'SECTION_2_SYNONYM_DEDUPLICATION'), 'Zalogowano usunięcie zduplikowanych synonimów');
});

test('ADR-106: SDSLinter REGUŁA 19 - Wykrywanie i blokowanie eugenolu i klonów w bramce jakości', async (t) => {
  const s8 = "Etanol (CAS 64-17-5): NDS 1900 mg/m3";
  const s3 = "izoeugenol | CAS: 97-54-1 | 0,5%\netanol | CAS: 64-17-5 | 75%";

  // 1. Przypadek błędny: etykieta z 'eugenol' gdy w składzie jest 'izoeugenol'
  const badS2_1 = "Nazwy niebezpiecznych substancji wymienione na etykiecie\neugenol, etanol\n\nZwroty wskazujące rodzaj zagrożenia\nH225";
  const res1 = SDSLinter.auditAndLint({ sections: { section_2: badS2_1, section_3: s3, section_8: s8 } });
  assert.strictEqual(res1.isValid, false, 'Linter musi zablokować fałszywy eugenol');
  assert.ok(res1.errors.some(e => e.includes('KRYTYCZNY BŁĄD IDENTYFIKACJI CHEMICZNEJ')), 'Komunikat o błędzie identyfikacji chemicznej');

  // 2. Przypadek błędny: klony na etykiecie
  const badS2_2 = "Nazwy niebezpiecznych substancji wymienione na etykiecie\n3,7-DIMETHYLOCT-6-EN-1-OL, cytronellol, etanol\n\nZwroty wskazujące rodzaj zagrożenia\nH225";
  const res2 = SDSLinter.auditAndLint({ sections: { section_2: badS2_2, section_3: s3, section_8: s8 } });
  assert.strictEqual(res2.isValid, false, 'Linter musi zablokować zduplikowane synonimy');
  assert.ok(res2.errors.some(e => e.includes('BŁĄD KLONOWANIA SUBSTANCJI')), 'Komunikat o klonowaniu substancji');

  // 3. Przypadek poprawny: zharmonizowane nazwy
  const goodS2 = "Nazwy niebezpiecznych substancji wymienione na etykiecie\nizoeugenol, cytronellol, etanol\n\nZwroty wskazujące rodzaj zagrożenia\nH225";
  const res3 = SDSLinter.auditAndLint({ sections: { section_2: goodS2, section_3: s3, section_8: s8 } });
  assert.strictEqual(res3.isValid, true, 'Linter musi zaakceptować poprawne, zharmonizowane nazwy');
  assert.strictEqual(res3.errors.length, 0, 'Brak błędów lintera');
});
