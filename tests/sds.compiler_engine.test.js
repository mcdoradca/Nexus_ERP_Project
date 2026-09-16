/**
 * TEST KOMPLETNY: DETERMINISTYCZNY KOMPILATOR SDS (AST + ECHA CANONICAL + LINTER)
 * Architektura jakości klasy Enterprise - Zero Halucynacji
 */

const test = require('node:test');
const assert = require('node:assert');
const {
  CANONICAL_H_PHRASES,
  CANONICAL_P_PHRASES,
  CANONICAL_CLP_CLASSES,
  CANONICAL_TEST_ORGANISMS,
  CANONICAL_SECTION_9_PARAMETERS
} = require('../src/modules/sds/engine/sds.canonical.clp');
const { SubstanceAST, SDSDocumentAST } = require('../src/modules/sds/engine/sds.ast');
const { SDSTableParser } = require('../src/modules/sds/engine/sds.table.parser');
const { SDSLinter } = require('../src/modules/sds/engine/sds.linter');

test('DETERMINISTYCZNY KOMPILATOR SDS - ARCHITEKTURA I BRAMKI JAKOŚCI', async (t) => {

  await t.test('1. Słowniki Urzędowe ECHA / CLP: Kompletność zwrotów pojedynczych i łączonych', () => {
    // Zwroty H
    assert(CANONICAL_H_PHRASES['H225'], 'Brak H225');
    assert(CANONICAL_H_PHRASES['H301'], 'Brak H301');
    assert(CANONICAL_H_PHRASES['H370'], 'Brak H370');
    assert.strictEqual(CANONICAL_H_PHRASES['H301+H311+H331'], 'Działa toksycznie w przypadku połknięcia, kontaktu ze skórą lub w następstwie wdychania.');
    assert(CANONICAL_H_PHRASES['EUH208'], 'Brak EUH208');

    // Zwroty P
    assert(CANONICAL_P_PHRASES['P102'], 'Brak P102');
    assert(CANONICAL_P_PHRASES['P210'], 'Brak P210');
    assert(CANONICAL_P_PHRASES['P305+P351+P338'], 'Brak P305+P351+P338');

    // Klasy CLP
    assert(CANONICAL_CLP_CLASSES['Flam. Liq. 2'], 'Brak Flam. Liq. 2');
    assert.strictEqual(CANONICAL_CLP_CLASSES['Flam. Liq. 2'].signal, 'NIEBEZPIECZEŃSTWO');
    assert.strictEqual(CANONICAL_CLP_CLASSES['Flam. Liq. 2'].ghs, 'GHS02');

    console.log('-> TEST 1 ZDANY: Kanoniczny słownik ECHA/CLP kompletny i zgodny z prawem.');
  });

  await t.test('2. Słownik Organizmów Testowych: Integralność biologiczna (brak fałszowania gatunków)', () => {
    const minnow = CANONICAL_TEST_ORGANISMS['pimephales promelas'];
    assert(minnow, 'Brak Pimephales promelas w bazie organizmów');
    assert.strictEqual(minnow.group, 'ryby');
    assert.notStrictEqual(minnow.pl.toLowerCase(), 'szczur', 'BŁĄD: Ryba Pimephales promelas nie może być nazwana szczurem!');

    const rat = CANONICAL_TEST_ORGANISMS['rat'];
    assert.strictEqual(rat.group, 'ssaki');
    assert.strictEqual(rat.pl, 'szczur');

    console.log('-> TEST 2 ZDANY: Integralność taksonomiczna organizmów testowych zachowana.');
  });

  await t.test('3. Model Danych AST: Tworzenie i serializacja SubstanceAST oraz SDSDocumentAST', () => {
    const methanol = new SubstanceAST({
      rawName: 'METHANOL',
      namePl: 'Metanol',
      cas: '67-56-1',
      ec: '200-659-6',
      index: '603-001-00-X',
      concentration: { raw: '0 < x < 0,05 %', min: 0, max: 0.05, unit: '%' },
      classifications: ['Flam. Liq. 2 H225', 'Acute Tox. 3 H301', 'STOT SE 1 H370'],
      ate: ['ATE (droga pokarmowa) = 100 mg/kg', 'ATE (na skórę) = 300 mg/kg', 'ATE (inhalacyjnie, pary) = 3 mg/l']
    });

    assert(methanol.isValid(), 'Methanol AST powinien być oznaczony jako poprawny');
    assert.strictEqual(methanol.index, '603-001-00-X');
    assert.strictEqual(methanol.ate.length, 3);

    const docAst = new SDSDocumentAST({
      metadata: { productName: 'TESTOWY PRODUKT' }
    });
    docAst.addSubstance(methanol);
    docAst.setSectionContent(1, 'Sekcja 1 testowa treść');

    assert.strictEqual(docAst.substances.length, 1);
    assert.strictEqual(docAst.getSectionContent(1), 'Sekcja 1 testowa treść');

    console.log('-> TEST 3 ZDANY: Silnie typowany model AST działa prawidłowo.');
  });

  await t.test('4. SDSTableParser: Oczyszczanie artefaktów i obsługa cyfry kontrolnej X w INDEX', () => {
    const rawSection3WithArtifacts = `
Dated 05/12/2024 Suarez Company S.r.l.
Printed on 05/12/2024 Page n. 4 of 25
METHANOL
INDEX 603-001-00-X 0 < x < 0,05 %
EC 200-659-6
CAS 67-56-1
Flam. Liq. 2 H225, Acute Tox. 3 H301, Acute Tox. 3 H311, Acute Tox. 3 H331, STOT SE 1 H370
ATE (Oral): 100 mg/kg, ATE (Dermal): 300 mg/kg, ATE Inhalation vapours: 3
    `;

    const cleaned = SDSTableParser.cleanPdfArtifacts(rawSection3WithArtifacts);
    assert(!cleaned.includes('Dated 05/12/2024'), 'Artefakt Dated nie został usunięty');
    assert(!cleaned.includes('Suarez Company'), 'Artefakt Suarez Company nie został usunięty');

    const ids = SDSTableParser.normalizeIdentifiers(cleaned);
    assert.strictEqual(ids.cas, '67-56-1');
    assert.strictEqual(ids.ec, '200-659-6');
    assert.strictEqual(ids.index, '603-001-00-X');

    const conc = SDSTableParser.extractConcentration(cleaned);
    assert.strictEqual(conc.raw, '0 < x < 0,05 %');

    const ates = SDSTableParser.extractAte(cleaned);
    assert(ates.some(a => a.includes('ATE (inhalacyjnie, pary) = 3 mg/l')));

    console.log('-> TEST 4 ZDANY: Parser tabeli skutecznie usuwa artefakty i parsuje INDEX z literą X.');
  });

  await t.test('5. SDSLinter (Sanepid / PIP Quality Gate): Wykrywanie uchybień prawnych', () => {
    // Przypadek 1: Produkt płynny z "Nie dotyczy" dla lepkości
    const invalidSds = {
      sections: {
        section_1: { content: "Produkt testowy" },
        section_2: { content: "Płyn łatwopalny. Niebezpieczeństwo." },
        section_3: { content: "Metanol CAS: 67-56-1, Etanol CAS: 64-17-5" },
        section_8: { content: "Brak danych o NDS." }, // Brak limitów dla metanolu i etanolu!
        section_9: { content: "Stan skupienia: ciecz\nLepkość: Nie dotyczy\nGęstość: 0,9 g/cm3" },
        section_11: { content: "LC50 Inhalation: 120 mg/l Pimephales promelas" }, // Ryba w inhalacji!
        section_14: { content: "Ilości ograniczone (LQ): 1\nL" } // Osierocona jednostka L!
      }
    };

    const lintFail = SDSLinter.auditAndLint(invalidSds);
    assert(!lintFail.isValid, 'Linter powinien odrzucić niepoprawną kartę');
    assert(lintFail.errors.some(e => e.includes('Sekcja 9.1')), 'Linter powinien wykryć błąd lepkości cieczy');
    assert(lintFail.errors.some(e => e.includes('Sekcja 8.1')), 'Linter powinien wykryć brak limitów NDS dla metanolu/etanolu');
    assert(lintFail.errors.some(e => e.includes('Sekcja 11')), 'Linter powinien wykryć rybę w sekcji 11');
    assert(lintFail.errors.some(e => e.includes('Sekcja 14.6')), 'Linter powinien wykryć osieroconą jednostkę LQ');

    // Przypadek 2: Karta w pełni poprawna
    const validSds = {
      sections: {
        section_1: { content: "Produkt testowy" },
        section_2: { content: "Płyn łatwopalny. Niebezpieczeństwo." },
        section_3: { content: "Metanol CAS: 67-56-1" },
        section_8: { content: "Metanol CAS: 67-56-1: NDS: 100 mg/m3, NDSCh: 300 mg/m3 [skóra]" },
        section_9: { content: "Stan skupienia: ciecz\nLepkość kinematyczna: Brak danych\nGęstość: 0,9 g/cm3\nCharakterystyka cząstek: Nie dotyczy (produkt płynny)" },
        section_11: { content: "Toksyczność ostra:\nMetanol: LD50 (szczur): 5628 mg/kg" },
        section_14: { content: "Ilości ograniczone (LQ): 1 L" }
      }
    };

    const lintPass = SDSLinter.auditAndLint(validSds);
    assert(lintPass.isValid, `Linter powinien zatwierdzić poprawną kartę, a zgłosił: ${lintPass.errors.join('; ')}`);

    console.log('-> TEST 5 ZDANY: SDSLinter bezbłędnie blokuje uchybienia prawne Sanepid / PIP.');
  });
});
