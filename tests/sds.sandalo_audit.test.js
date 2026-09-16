const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { SDSPDFParser, SDSProcessorEngine, SDSChemicalExtractor } = require('../src/modules/sds/sds.service');
const { SDSLinter } = require('../src/modules/sds/engine/sds.linter');

test('Audyt Regulacyjny Karty SDS SANDALO (Sanepid / PIP / Sieci handlowe)', async (t) => {
  const pdfPath = path.join(__dirname, '../docs/SDS/8034055535424_SDS_SANDALO (1).pdf');
  if (!fs.existsSync(pdfPath)) {
    t.skip(`Plik testowy PDF nie istnieje (usunięty na polecenie użytkownika): ${pdfPath}`);
    return;
  }

  const buf = fs.readFileSync(pdfPath);
  const pdfData = await pdf(buf);
  const rawSections = SDSPDFParser.segmentInto16Sections(pdfData.text);

  const engine = new SDSProcessorEngine();
  
  // Przetwarzanie sekcji
  const s3Result = await engine.processSection3(rawSections.section_3);
  const components = s3Result.components || [];

  const s2Result = engine.processSection2(rawSections.section_2, s3Result.resolvedSubstances, components);
  const s4Result = engine.processSection4(rawSections.section_4, components, s2Result.content);
  const s8Result = engine.processSection8(rawSections.section_8, components);
  const s12Result = engine.processSection12(rawSections.section_12, components, s2Result.content);

  const docxSections = {
    section_1: "SEKCJA 1...",
    section_2: s2Result.content,
    section_3: s3Result.content,
    section_4: s4Result,
    section_5: "SEKCJA 5...",
    section_6: "SEKCJA 6...",
    section_7: "SEKCJA 7...",
    section_8: s8Result,
    section_9: "SEKCJA 9...",
    section_10: "SEKCJA 10...",
    section_11: "SEKCJA 11...",
    section_12: s12Result.content,
    section_13: "SEKCJA 13...",
    section_14: "SEKCJA 14...",
    section_15: "SEKCJA 15...",
    section_16: "SEKCJA 16..."
  };

  await t.test('Punkt 1: Sekcja 4.1 – brak nagłówków Suarez Company i brak angielskiego w poradach', () => {
    assert(!/Suarez\s+Company/i.test(s4Result));
    assert(!/(?:^|\n)\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/.test(s4Result));
    assert(!/Take off immediately/i.test(s4Result));
    assert(!/contaminated clothing/i.test(s4Result));
    assert(!/extent of the/i.test(s4Result));
    assert(/W kontakcie ze skórą:\s*Natychmiast zdjąć zanieczyszczoną odzież/i.test(s4Result));
    assert(/Ochrona osób udzielających pierwszej pomocy:/i.test(s4Result));
  });

  await t.test('Punkt 2: Sekcja 12.1 – brak przesunięcia testów ekotoksykologicznych (off-by-one)', () => {
    const s12 = s12Result.content;
    assert(!/Suarez\s+Company/i.test(s12));

    // 1. Octan 4-tert-butylocykloheksylu musi mieć LC50 8,6 mg/l (a NIE > 150 mg/l z DPGME)
    const matchOctan = s12.match(/octan 4-tert-butylocykloheksylu[\s\S]*?(?=\n[a-ząćęłńóśźż0-9(]|$)/i);
    assert(matchOctan);
    assert(/8,6\s*mg\/l/.test(matchOctan[0]));
    assert(!/>\s*150\s*mg\/l/.test(matchOctan[0]));

    // 2. DPGME musi mieć LC50 (ryby) > 150 mg/l (a NIE LC50 kwasu octowego > 1000 mg/l)
    const matchDpgme = s12.match(/(?:2-metoksymetyloetoksy\)propanol|DIPROPYLENE)[\s\S]*?(?=\n[a-ząćęłńóśźż0-9(]|$)/i);
    assert(matchDpgme);
    assert(/LC50\s*\(ryby\):\s*>\s*150\s*mg\/l/i.test(matchDpgme[0]));
    assert(!/LC50\s*\(ryby\):\s*>\s*1000\s*mg\/l/i.test(matchDpgme[0]));

    // 3. Kwas octowy musi mieć własne badania LC50 (ryby) > 1000 mg/l (a NIE badania DPGME > 150 mg/l)
    const matchAcetic = s12.match(/kwas octowy[\s\S]*?(?=\n[a-ząćęłńóśźż0-9(]|$)/i);
    assert(matchAcetic);
    assert(/LC50\s*\(ryby\):\s*>\s*1000\s*mg\/l/i.test(matchAcetic[0]));
    assert(!/LC50\s*\(ryby\):\s*>\s*150\s*mg\/l/i.test(matchAcetic[0]));

    // 4. Eliminacja błędu audytu: aceton w sekcji 12.1 NIE może mieć przypisanych badań octanu (8,6 mg/l)
    const s12_1Only = s12.substring(0, s12.indexOf('12.2') !== -1 ? s12.indexOf('12.2') : undefined);
    const matchAceton12_1 = s12_1Only.match(/aceton[\s\S]*?(?=\n[a-ząćęłńóśźż0-9(]|$)/i);
    if (matchAceton12_1) {
      assert(!/8,6\s*mg\/l/.test(matchAceton12_1[0]));
    }
  });

  await t.test('Punkt 3: Sekcje 2.1 & 2.2 – CLP Art. 18(3)(b), brak EUH208, kategoria Skin Sens. 1A, zwrot P501', () => {
    const s2 = s2Result.content;
    // 1. Klasyfikacja 2.1 zawiera Skin Sens. 1A
    assert(/Skin Sens\. 1A/i.test(s2));
    assert(/H317/.test(s2));

    // 2. Zgodność z CLP Art. 18(3)(b) - brak EUH208 dla mieszaniny z H317
    assert(!/EUH208/.test(s2));

    // 3. Wszystkie alergeny w sekcji "Zawiera:"
    assert(/Nazwy niebezpiecznych substancji wymienione na etykiecie\s*\n([^\n]+)/i.test(s2));
    const labelMatch = s2.match(/Nazwy niebezpiecznych substancji wymienione na etykiecie\s*\n([^\n]+)/i);
    assert(/aldehyd cynamonowy|cynamon/i.test(labelMatch[1]));
    assert(/linalol/i.test(labelMatch[1]));

    // 4. Obecność P501
    assert(/P501/.test(s2));
  });

  await t.test('Punkt 4: Sekcja 3.2 – brak obciętych nazw chemicznych, tłumaczenie uwag i ATE', () => {
    const s3 = s3Result.content;
    // Brak uciętych kikutów nazw
    assert(!/^\d+\.\s+ACETATE$/m.test(s3));
    assert(!/^\d+\.\s+MONOMETHYL ETHER$/m.test(s3));
    assert(!/^\d+\.\s+OL$/m.test(s3));
    assert(!/^\d+\.\s+PENTYL SALICYLATE$/m.test(s3));

    // Pełne polskie nazwy
    assert(/octan 4-tert-butylocykloheksylu/i.test(s3));
    assert(/\(2-metoksymetyloetoksy\)propanol/i.test(s3));
    assert(/Masa poreakcyjna salicylanu 2-metylobutylu i salicylanu pentylu/i.test(s3));
    assert(/Masa poreakcyjna 1-\[\(1R\*\,6S\*\)-2,2,6-trimetylocykloheksylo\]heksan-3-olu/i.test(s3));

    // Tłumaczenie uwag
    assert(/Uwaga B|Uwaga C/i.test(s3));
    assert(!/Classification note/i.test(s3));

    // Wartości ATE
    assert(/ATE \(inhalacyjnie, pyły\/mgły\) = 0,501 mg\/l/i.test(s3));
    assert(/ATE \(droga pokarmowa\) = 2000 mg\/kg/i.test(s3));
  });

  await t.test('Punkt 5: Sekcja 8.1 – prawidłowe przypisanie bloków DNEL i PNEC', () => {
    const s8 = s8Result;
    assert(!/Suarez\s+Company/i.test(s8));
    assert(!/(?:^|\n)\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/.test(s8));

    // 1. PNEC dla (±) trans-3,3-dimethyl... musi być obecny
    assert(/trans-3,3-dimetylo/i.test(s8));

    // 2. PNEC dla Reaction mass of 1-[(1R*,6S*)... musi być obecny
    assert(/Masa poreakcyjna 1-\[\(1R\*,6S\*\)/i.test(s8));

    // 3. Salicylan 2-metylobutylu musi mieć własny PNEC/DNEL
    assert(/Masa poreakcyjna salicylanu 2-metylobutylu i salicylanu pentylu/i.test(s8));

    // 4. Metanol w bloku DNEL zawiera drogę skórną
    const methDnelMatch = s8.match(/Substancja:\s*metanol[\s\S]*?(?=(?:Substancja:|Zalecane|$))/i);
    assert(methDnelMatch);
    assert(/Na skórę/i.test(methDnelMatch[0]));
  });

  await t.test('Linter regulacyjny REACH/CLP zwraca isValid = true', () => {
    const lintResult = SDSLinter.lint(docxSections);
    if (!lintResult.isValid) {
      console.error('Linter errors:', lintResult.errors);
    }
    assert.strictEqual(lintResult.isValid, true);
    assert.strictEqual(lintResult.errors.length, 0);
  });
});
