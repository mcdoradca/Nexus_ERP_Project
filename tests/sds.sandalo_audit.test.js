const fs = require('fs');
const path = require('path');
const pdf = require('pdf-parse');
const { SDSPDFParser, SDSProcessorEngine, SDSChemicalExtractor, SDSLinter } = require('../src/modules/sds/sds.service');

describe('Audyt Regulacyjny Karty SDS SANDALO (Sanepid / PIP / Sieci handlowe)', () => {
  let docxSections = {};
  let rawSections = {};
  let components = [];
  let s3Result = null;
  let s2Result = null;
  let s4Result = null;
  let s8Result = null;
  let s12Result = null;

  beforeAll(async () => {
    const pdfPath = path.join(__dirname, '../docs/SDS/8034055535424_SDS_SANDALO (1).pdf');
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`Plik testowy PDF nie istnieje: ${pdfPath}`);
    }
    const buf = fs.readFileSync(pdfPath);
    const pdfData = await pdf(buf);
    rawSections = SDSPDFParser.segmentInto16Sections(pdfData.text);

    const engine = new SDSProcessorEngine();
    
    // Przetwarzanie sekcji
    s3Result = await engine.processSection3(rawSections.section_3);
    components = s3Result.components || [];

    s2Result = engine.processSection2(rawSections.section_2, s3Result.resolvedSubstances, components);
    s4Result = engine.processSection4(rawSections.section_4, components, s2Result.content);
    s8Result = engine.processSection8(rawSections.section_8, components);
    s12Result = engine.processSection12(rawSections.section_12, components);

    docxSections = {
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
  }, 30000);

  test('Punkt 1: Sekcja 4.1 – brak nagłówków Suarez Company i brak angielskiego w poradach', () => {
    expect(s4Result).not.toMatch(/Suarez\s+Company/i);
    expect(s4Result).not.toMatch(/(?:^|\n)\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/);
    expect(s4Result).not.toMatch(/Take off immediately/i);
    expect(s4Result).not.toMatch(/contaminated clothing/i);
    expect(s4Result).not.toMatch(/extent of the/i);
    expect(s4Result).toMatch(/W kontakcie ze skórą:\s*Natychmiast zdjąć zanieczyszczoną odzież/i);
    expect(s4Result).toMatch(/Ochrona osób udzielających pierwszej pomocy:/i);
  });

  test('Punkt 2: Sekcja 12.1 – brak przesunięcia testów ekotoksykologicznych (off-by-one)', () => {
    const s12 = s12Result.content;
    expect(s12).not.toMatch(/Suarez\s+Company/i);

    // 1. Octan 4-tert-butylocykloheksylu musi mieć LC50 8,6 mg/l (a NIE > 150 mg/l z DPGME)
    const matchOctan = s12.match(/octan 4-tert-butylocykloheksylu[\s\S]*?(?=\n[a-ząćęłńóśźż0-9(]|$)/i);
    expect(matchOctan).toBeTruthy();
    expect(matchOctan[0]).toMatch(/8,6\s*mg\/l/);
    expect(matchOctan[0]).not.toMatch(/>\s*150\s*mg\/l/);

    // 2. DPGME musi mieć LC50 (ryby) > 150 mg/l (a NIE LC50 kwasu octowego > 1000 mg/l)
    const matchDpgme = s12.match(/(?:2-metoksymetyloetoksy\)propanol|DIPROPYLENE)[\s\S]*?(?=\n[a-ząćęłńóśźż0-9(]|$)/i);
    expect(matchDpgme).toBeTruthy();
    expect(matchDpgme[0]).toMatch(/LC50\s*\(ryby\):\s*>\s*150\s*mg\/l/i);
    expect(matchDpgme[0]).not.toMatch(/LC50\s*\(ryby\):\s*>\s*1000\s*mg\/l/i);

    // 3. Kwas octowy musi mieć własne badania LC50 (ryby) > 1000 mg/l (a NIE badania DPGME > 150 mg/l)
    const matchAcetic = s12.match(/kwas octowy[\s\S]*?(?=\n[a-ząćęłńóśźż0-9(]|$)/i);
    expect(matchAcetic).toBeTruthy();
    expect(matchAcetic[0]).toMatch(/LC50\s*\(ryby\):\s*>\s*1000\s*mg\/l/i);
    expect(matchAcetic[0]).not.toMatch(/LC50\s*\(ryby\):\s*>\s*150\s*mg\/l/i);

    // 4. Eliminacja błędu audytu: aceton w sekcji 12.1 NIE może mieć przypisanych badań octanu (8,6 mg/l)
    const s12_1Only = s12.substring(0, s12.indexOf('12.2') !== -1 ? s12.indexOf('12.2') : undefined);
    const matchAceton12_1 = s12_1Only.match(/aceton[\s\S]*?(?=\n[a-ząćęłńóśźż0-9(]|$)/i);
    if (matchAceton12_1) {
      expect(matchAceton12_1[0]).not.toMatch(/8,6\s*mg\/l/);
    }
  });

  test('Punkt 3: Sekcje 2.1 & 2.2 – CLP Art. 18(3)(b), brak EUH208, kategoria Skin Sens. 1A, zwrot P501', () => {
    const s2 = s2Result.content;
    // 1. Klasyfikacja 2.1 zawiera Skin Sens. 1A
    expect(s2).toMatch(/Skin Sens\. 1A/i);
    expect(s2).toMatch(/H317/);

    // 2. Zgodność z CLP Art. 18(3)(b) - brak EUH208 dla mieszaniny z H317
    expect(s2).not.toMatch(/EUH208/);

    // 3. Wszystkie alergeny w sekcji "Zawiera:"
    expect(s2).toMatch(/Nazwy niebezpiecznych substancji wymienione na etykiecie\s*\n([^\n]+)/i);
    const labelMatch = s2.match(/Nazwy niebezpiecznych substancji wymienione na etykiecie\s*\n([^\n]+)/i);
    expect(labelMatch[1]).toMatch(/aldehyd cynamonowy|cynamon/i);
    expect(labelMatch[1]).toMatch(/linalol/i);

    // 4. Obecność P501
    expect(s2).toMatch(/P501/);
  });

  test('Punkt 4: Sekcja 3.2 – brak obciętych nazw chemicznych, tłumaczenie uwag i ATE', () => {
    const s3 = s3Result.content;
    // Brak uciętych kikutów nazw
    expect(s3).not.toMatch(/^\d+\.\s+ACETATE$/m);
    expect(s3).not.toMatch(/^\d+\.\s+MONOMETHYL ETHER$/m);
    expect(s3).not.toMatch(/^\d+\.\s+OL$/m);
    expect(s3).not.toMatch(/^\d+\.\s+PENTYL SALICYLATE$/m);

    // Pełne polskie nazwy
    expect(s3).toMatch(/octan 4-tert-butylocykloheksylu/i);
    expect(s3).toMatch(/\(2-metoksymetyloetoksy\)propanol/i);
    expect(s3).toMatch(/Masa poreakcyjna salicylanu 2-metylobutylu i salicylanu pentylu/i);
    expect(s3).toMatch(/Masa poreakcyjna 1-\[\(1R\*\,6S\*\)-2,2,6-trimetylocykloheksylo\]heksan-3-olu/i);

    // Tłumaczenie uwag
    expect(s3).toMatch(/Uwaga B|Uwaga C/i);
    expect(s3).not.toMatch(/Classification note/i);

    // Wartości ATE
    expect(s3).toMatch(/ATE \(inhalacyjnie, pyły\/mgły\) = 0,501 mg\/l/i);
    expect(s3).toMatch(/ATE \(droga pokarmowa\) = 2000 mg\/kg/i);
  });

  test('Punkt 5: Sekcja 8.1 – prawidłowe przypisanie bloków DNEL i PNEC', () => {
    const s8 = s8Result;
    expect(s8).not.toMatch(/Suarez\s+Company/i);
    expect(s8).not.toMatch(/(?:^|\n)\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/);

    // 1. PNEC dla (±) trans-3,3-dimethyl... musi być obecny
    expect(s8).toMatch(/trans-3,3-dimetylo/i);

    // 2. PNEC dla Reaction mass of 1-[(1R*,6S*)... musi być obecny
    expect(s8).toMatch(/Masa poreakcyjna 1-\[\(1R\*,6S\*\)/i);

    // 3. Salicylan 2-metylobutylu musi mieć własny PNEC/DNEL
    expect(s8).toMatch(/Masa poreakcyjna salicylanu 2-metylobutylu i salicylanu pentylu/i);

    // 4. Metanol w bloku DNEL zawiera drogę skórną
    const methDnelMatch = s8.match(/Substancja:\s*metanol[\s\S]*?(?=(?:Substancja:|Zalecane|$))/i);
    expect(methDnelMatch).toBeTruthy();
    expect(methDnelMatch[0]).toMatch(/Na skórę/i);
  });

  test('Linter regulacyjny REACH/CLP zwraca isValid = true', () => {
    const lintResult = SDSLinter.lint(docxSections);
    if (!lintResult.isValid) {
      console.error('Linter errors:', lintResult.errors);
    }
    expect(lintResult.isValid).toBe(true);
    expect(lintResult.errors.length).toBe(0);
  });
});
