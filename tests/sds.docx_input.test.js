const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { SDSDocxParser } = require('../src/modules/sds/engine/sds.docx.parser');
const { SDSDocumentParser, SDSProcessorEngine } = require('../src/modules/sds/sds.service');

const SANDALO_DOCX = path.resolve('docs/SDS/8034055535424_SDS_SANDALO org.docx');

test('DOCX Input Parser - Walidacja detekcji formatu isDocxFile', () => {
  assert.strictEqual(fs.existsSync(SANDALO_DOCX), true, 'Plik SANDALO org.docx musi istnieć');
  assert.strictEqual(SDSDocxParser.isDocxFile(SANDALO_DOCX), true, 'SANDALO org.docx powinien być rozpoznany jako DOCX');
  assert.strictEqual(SDSDocxParser.isDocxFile('src/modules/sds/test.pdf'), false, 'Plik test.pdf nie jest DOCX');
  assert.strictEqual(SDSDocxParser.isDocxFile('non_existent.docx'), false, 'Nieistniejący plik zwraca false');
  assert.strictEqual(SDSDocxParser.isDocxFile(null), false, 'Null zwraca false');
});

test('DOCX Input Parser - Ekstrakcja 16 sekcji z SANDALO org.docx bez wycieku nagłówków stron', () => {
  const parsed = SDSDocxParser.extractTextAndSections(SANDALO_DOCX);
  assert.ok(parsed.fullText && parsed.fullText.length > 5000, 'Pełny tekst musi mieć ponad 5000 znaków');
  
  // Weryfikacja kompletności wszystkich 16 sekcji REACH
  for (let i = 1; i <= 16; i++) {
    const secKey = `section_${i}`;
    assert.ok(parsed.sections[secKey], `Sekcja ${i} musi istnieć w parsed.sections`);
    assert.ok(!parsed.sections[secKey].includes(`Brak danych dla Sekcji ${i}`), `Sekcja ${i} nie może być pusta, treść: ${parsed.sections[secKey].slice(0, 40)}`);
  }

  // Weryfikacja braku wycieku running headers do treści sekcji narracyjnych (np. paginacja 6/35)
  const headerArtifactRegex = /Suarez\s+Company\s+(?:First\s+compilation\s+)?[^\n]*?\b\d{1,2}\/35\b/i;
  assert.strictEqual(
    headerArtifactRegex.test(parsed.sections['section_4']),
    false,
    'Sekcja 4 nie może zawierać running headerów z numerem strony'
  );
  assert.strictEqual(
    headerArtifactRegex.test(parsed.sections['section_5']),
    false,
    'Sekcja 5 nie może zawierać running headerów z numerem strony'
  );
});

test('DOCX Input Parser - Bezpośrednia ekstrakcja 19 składników z tabel sekcji 3', () => {
  const parsed = SDSDocxParser.extractTextAndSections(SANDALO_DOCX);
  assert.ok(parsed.tablesBySection['section_3'].length > 0, 'Sekcja 3 musi zawierać tabele OpenXML');

  const components = SDSDocxParser.parseSection3Table(parsed.tablesBySection['section_3']);
  assert.strictEqual(components.length, 19, `Oczekiwano 19 składników, znaleziono: ${components.length}`);

  // Weryfikacja pierwszego składnika (etanol)
  const ethanol = components.find(c => c.cas === '64-17-5');
  assert.ok(ethanol, 'Etanol (CAS 64-17-5) musi być obecny w składnikach');
  assert.strictEqual(ethanol.ec, '200-578-6', 'Numer WE etanolu to 200-578-6');
  assert.strictEqual(ethanol.index, '603-002-00-5', 'Numer indeksowy etanolu to 603-002-00-5');
  assert.ok(ethanol.concentration.includes('74') && ethanol.concentration.includes('78'), 'Stężenie etanolu to 74-78%');
  assert.ok(ethanol.classification.includes('Flam. Liq. 2') && ethanol.classification.includes('H225'), 'Klasyfikacja etanolu musi zawierać H225');

  // Weryfikacja aldehydu cynamonowego ze stężeniem granicznym SCL
  const cinnamal = components.find(c => c.cas === '104-55-2');
  assert.ok(cinnamal, 'Aldehyd cynamonowy (CAS 104-55-2) musi być obecny');
  assert.strictEqual(cinnamal.index, '606-155-00-6', 'Index dla cinnamaldehyde');
  assert.ok(cinnamal.classification.includes('Skin Sens. 1A') && cinnamal.classification.includes('H317'), 'Klasyfikacja Skin Sens. 1A');

  // Weryfikacja fenolu z ATE
  const phenol = components.find(c => c.cas === '108-95-2');
  assert.ok(phenol, 'Fenol (CAS 108-95-2) musi być obecny');
  assert.strictEqual(phenol.ec, '203-632-7', 'WE dla fenolu to 203-632-7');
  assert.ok(phenol.classification.includes('Muta. 2') || phenol.classification.includes('H341'), 'Klasyfikacja Muta. 2');
});

test('SDSDocumentParser - Integracja extractText z plikiem DOCX', async () => {
  const text = await SDSDocumentParser.extractText(SANDALO_DOCX);
  assert.ok(text && text.length > 5000, 'extractText na DOCX musi zwrócić pełny tekst');
  assert.ok(text.includes('SECTION 1') || text.includes('SEKCJA 1'), 'Musi zawierać SEKCJA 1');
  assert.ok(text.includes('SECTION 3') || text.includes('SEKCJA 3'), 'Musi zawierać SEKCJA 3');
  assert.ok(text.includes('SECTION 16') || text.includes('SEKCJA 16'), 'Musi zawierać SEKCJA 16');
});

test('SDSProcessorEngine - Pełne przygotowanie payloadu z wejściowego pliku DOCX (SANDALO)', async () => {
  const engine = new SDSProcessorEngine({
    companyName: 'ITALLUX Sp. z o.o.',
    address: 'ul. Wesoła 16',
    city: '63-600 Kępno',
    website: 'www.prostozwloch.com.pl',
    email: 'kontakt@prostozwloch.com.pl',
    phone: '+48 663116607',
    emergencyPhone: '+48 663116607'
  });

  const payload = await engine.prepareAgentPayload(SANDALO_DOCX);
  assert.ok(payload, 'Payload musi zostać wygenerowany');
  assert.ok(payload.deterministicSections, 'Musi zawierać deterministicSections');
  
  // Weryfikacja Sekcji 1: Nazwa handlowa i UFI
  const s1 = payload.deterministicSections.section_1.content;
  assert.ok(s1.includes('SWEET HOME - PROFUMATORE AMBIENTE SANDALO'), 'Nazwa handlowa musi być pobrana z karty DOCX');
  assert.ok(s1.includes('U6KJ-F3SM-UX0Q-6532'), 'Kod UFI musi być pobrany z karty DOCX');

  // Weryfikacja Sekcji 2: Brak fałszywych piktogramów czaszki (GHS06) i żrącego (GHS05)
  const s2 = payload.deterministicSections.section_2.content;
  assert.ok(s2.includes('Flam. Liq. 2'), 'Klasyfikacja musi zawierać Flam. Liq. 2');
  assert.ok(s2.includes('H412'), 'Klasyfikacja musi zawierać H412');
  assert.ok(!s2.includes('GHS06'), 'Brak piktogramu czaszki GHS06');
  assert.ok(!s2.includes('GHS05'), 'Brak piktogramu żrącego GHS05');

  // Weryfikacja Sekcji 3: Wszystkie 19 składników
  assert.strictEqual(payload.metadata.components.length, 19, 'Metadata musi zawierać 19 komponentów');
  const s3 = payload.deterministicSections.section_3.content;
  assert.ok(s3.includes('etanol'), 'Sekcja 3 musi zawierać etanol');
  assert.ok(s3.includes('74 ≤ x < 78'), 'Sekcja 3 musi zawierać stężenie etanolu');

  // Weryfikacja Sekcji 4: Brak halucynacji oparzeń chemicznych i martwicy
  const s4 = payload.deterministicSections.section_4.content;
  assert.ok(!s4.includes('oparzenia skóry i martwicę tkanek'), 'Brak zmyślonych objawów martwicy tkanek');
  assert.ok(!s4.includes('grozić śmiercią'), 'Brak zmyślonej śmierci przez aspirację');

  // Weryfikacja Sekcji 5, 6, 7: Brak "Brak dostępnych danych"
  const s5 = payload.deterministicSections.section_5.content;
  assert.ok(!s5.includes('Brak dostępnych danych'), 'Sekcja 5 musi zawierać procedury gaśnicze');
  const s6 = payload.deterministicSections.section_6.content;
  assert.ok(!s6.includes('Brak dostępnych danych'), 'Sekcja 6 musi zawierać procedury uwolnienia');
  const s7 = payload.deterministicSections.section_7.content;
  assert.ok(!s7.includes('Brak dostępnych danych'), 'Sekcja 7 musi zawierać procedury magazynowania');

  // Weryfikacja Sekcji 8: DNEL / PNEC obecne
  const s8 = payload.deterministicSections.section_8.content;
  assert.ok(s8.includes('DNEL') || s8.includes('Pochodne poziomy'), 'Sekcja 8 musi zawierać wartości DNEL');

  // Weryfikacja Sekcji 12.1: Spójność z klasyfikacją H412
  const s12 = payload.deterministicSections.section_12.content;
  assert.ok(s12.includes('H412'), 'Sekcja 12.1 musi wskazywać klasyfikację H412');
});

test('SDSSchemaValidator - Auto-remediacja i normalizacja kluczy dla section_1_2', () => {
  const { SDSSchemaValidator } = require('../src/modules/sds/sds.schema.validator');

  // Przypadek 1: LLM zwrócił notację kropkową "section_1.2" zamiast "section_1_2"
  const responseWithDot = {
    'section_1.2': '1.2. Istotne zidentyfikowane zastosowania: Odświeżacz powietrza.',
    'section_5': 'SEKCJA 5: Postępowanie w przypadku pożaru...',
    'section_6': 'SEKCJA 6: Postępowanie w przypadku niezamierzonego uwolnienia...',
    'section_7': 'SEKCJA 7: Postępowanie z substancjami i magazynowanie...',
    'section_10': 'SEKCJA 10: Stabilność i reaktywność...',
    'section_11': 'SEKCJA 11: Informacje toksykologiczne\n11.1. Informacje na temat klas zagrożenia\n11.2. Informacje o innych zagrożeniach'
  };

  assert.doesNotThrow(() => {
    SDSSchemaValidator.validateTranslatedSections(responseWithDot);
  }, 'Powinno znormalizować section_1.2 do section_1_2 bez błędu');
  assert.ok(responseWithDot.section_1_2, 'Klucz section_1_2 powinien zostać zmapowany');

  // Przypadek 2: LLM w ogóle pominął section_1_2 (brak klucza)
  const responseMissing12 = {
    'section_5': 'SEKCJA 5: Postępowanie w przypadku pożaru...',
    'section_6': 'SEKCJA 6: Postępowanie w przypadku niezamierzonego uwolnienia...',
    'section_7': 'SEKCJA 7: Postępowanie z substancjami i magazynowanie...',
    'section_10': 'SEKCJA 10: Stabilność i reaktywność...',
    'section_11': 'SEKCJA 11: Informacje toksykologiczne\n11.1. Informacje na temat klas zagrożenia\n11.2. Informacje o innych zagrożeniach'
  };

  assert.doesNotThrow(() => {
    SDSSchemaValidator.validateTranslatedSections(responseMissing12);
  }, 'Auto-remediacja powinna uzupełnić brakującą sekcję 1.2 bez wyrzucenia błędu');
  assert.ok(responseMissing12.section_1_2.includes('1.2.'), 'Auto-remediacja powinna wstawić poprawny nagłówek 1.2');
});
