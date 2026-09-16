const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { SDSDocxParser } = require('../src/modules/sds/engine/sds.docx.parser');
const { SDSDocumentParser, SDSProcessorEngine } = require('../src/modules/sds/sds.service');

const SANDALO_DOCX = path.resolve('docs/SDS/Karta_Charakterystyki_8034055535424_SDS_SANDALO.docx');
const TALCO_DOCX = path.resolve('docs/SDS/Karta_Charakterystyki_8034055535431_SDS_TALCO.docx');

test('DOCX Input Parser - Walidacja detekcji formatu isDocxFile', () => {
  assert.strictEqual(SDSDocxParser.isDocxFile(SANDALO_DOCX), true, 'SANDALO.docx powinien być rozpoznany jako DOCX');
  assert.strictEqual(SDSDocxParser.isDocxFile(TALCO_DOCX), true, 'TALCO.docx powinien być rozpoznany jako DOCX');
  assert.strictEqual(SDSDocxParser.isDocxFile('src/modules/sds/test.pdf'), false, 'Plik test.pdf nie jest DOCX');
  assert.strictEqual(SDSDocxParser.isDocxFile('non_existent.docx'), false, 'Nieistniejący plik zwraca false');
  assert.strictEqual(SDSDocxParser.isDocxFile(null), false, 'Null zwraca false');
});

test('DOCX Input Parser - Ekstrakcja 16 sekcji z SANDALO.docx bez wycieku nagłówków stron', () => {
  assert.strictEqual(fs.existsSync(SANDALO_DOCX), true, 'Plik SANDALO.docx musi istnieć');

  const parsed = SDSDocxParser.extractTextAndSections(SANDALO_DOCX);
  assert.ok(parsed.fullText && parsed.fullText.length > 5000, 'Pełny tekst musi mieć ponad 5000 znaków');
  
  // Weryfikacja kompletności 16 sekcji
  for (let i = 1; i <= 16; i++) {
    const secKey = `section_${i}`;
    assert.ok(parsed.sections[secKey], `Sekcja ${i} musi istnieć w parsed.sections`);
    assert.ok(!parsed.sections[secKey].includes(`Brak danych dla Sekcji ${i}`), `Sekcja ${i} nie może być pusta`);
  }

  // Weryfikacja braku artefaktów nagłówkowych PDF (np. "6/35", "Suarez Company First compilation")
  const headerArtifactRegex = /Suarez\s+Company\s+First\s+compilation|\b\d{1,2}\/35\b/i;
  assert.strictEqual(
    headerArtifactRegex.test(parsed.fullText),
    false,
    'Plik DOCX nie może zawierać wstrzykniętych nagłówków ani numeracji stron PDF (6/35)'
  );
});

test('DOCX Input Parser - Bezpośrednia ekstrakcja tabeli składników sekcji 3 z SANDALO.docx', () => {
  const parsed = SDSDocxParser.extractTextAndSections(SANDALO_DOCX);
  assert.ok(parsed.tablesBySection['section_3'].length > 0, 'Sekcja 3 musi zawierać co najmniej jedną tabelę OpenXML');

  const s3Table = parsed.tablesBySection['section_3'][0];
  const components = SDSDocxParser.parseSection3Table(s3Table);

  assert.ok(components.length >= 5, `Tabela powinna zawierać co najmniej 5 składników, znaleziono: ${components.length}`);

  // Weryfikacja pierwszego składnika (etanol)
  const ethanol = components.find(c => c.cas === '64-17-5');
  assert.ok(ethanol, 'Etanol (CAS 64-17-5) musi być obecny w składnikach');
  assert.strictEqual(ethanol.ec, '200-578-6', 'Numer WE etanolu to 200-578-6');
  assert.strictEqual(ethanol.index, '603-002-00-5', 'Numer indeksowy etanolu to 603-002-00-5');
  assert.ok(ethanol.concentration.includes('74') && ethanol.concentration.includes('78'), 'Stężenie etanolu to 74-78%');
  assert.ok(ethanol.classification.includes('Flam. Liq. 2') && ethanol.classification.includes('H225'), 'Klasyfikacja etanolu musi zawierać H225');

  // Weryfikacja składnika z SCL (np. octan linalilu)
  const linalylAcetate = components.find(c => c.cas === '115-95-7');
  if (linalylAcetate) {
    assert.strictEqual(linalylAcetate.ec, '204-116-4', 'WE dla octanu linalilu');
    assert.ok(linalylAcetate.classification.includes('H315') || linalylAcetate.classification.includes('H317'));
  }
});

test('DOCX Input Parser - Ekstrakcja z TALCO.docx', () => {
  assert.strictEqual(fs.existsSync(TALCO_DOCX), true, 'Plik TALCO.docx musi istnieć');

  const parsed = SDSDocxParser.extractTextAndSections(TALCO_DOCX);
  assert.ok(parsed.fullText.length > 3000, 'Pełny tekst TALCO.docx');

  const s3Table = parsed.tablesBySection['section_3'][0];
  assert.ok(s3Table, 'Musi istnieć tabela sekcji 3 w TALCO');

  const components = SDSDocxParser.parseSection3Table(s3Table);
  assert.ok(components.length >= 3, `Liczba komponentów w TALCO: ${components.length}`);

  const ethanol = components.find(c => c.cas === '64-17-5');
  assert.ok(ethanol, 'Etanol w TALCO');
  assert.strictEqual(ethanol.ec, '200-578-6');
});

test('SDSDocumentParser - Integracja extractText z plikiem DOCX', async () => {
  const text = await SDSDocumentParser.extractText(SANDALO_DOCX);
  assert.ok(text && text.length > 5000, 'extractText na DOCX musi zwrócić pełny tekst');
  assert.ok(text.includes('SEKCJA 1'), 'Musi zawierać SEKCJA 1');
  assert.ok(text.includes('SEKCJA 3'), 'Musi zawierać SEKCJA 3');
  assert.ok(text.includes('SEKCJA 16'), 'Musi zawierać SEKCJA 16');
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

  const payload = await engine.prepareAgentPayload(SANDALO_DOCX, 'SWEET HOME - PROFUMATORE AMBIENTE SANDALO');
  assert.ok(payload, 'Payload musi zostać wygenerowany');
  assert.ok(payload.deterministicSections, 'Musi zawierać deterministicSections');
  assert.ok(payload.metadata.components.length > 0, 'Komponenty sekcji 3 muszą być wyekstrahowane');

  // Weryfikacja czy sekcja 3 w deterministicSections zawiera poprawne dane
  const s3 = payload.deterministicSections.section_3;
  assert.ok(s3.content.includes('etanol'), 'Sekcja 3 musi zawierać etanol');
  assert.ok(s3.content.includes('64-17-5'), 'Sekcja 3 musi zawierać CAS 64-17-5');

  // Weryfikacja sekcji 4 - kliniczne dedukcje
  const s4 = payload.deterministicSections.section_4;
  assert.ok(s4.content.includes('SEKCJA 4'), 'Sekcja 4 musi być wygenerowana deterministycznie');
  assert.ok(!s4.content.includes('6/35'), 'Sekcja 4 nie może zawierać artefaktu nagłówkowego 6/35');

  // Weryfikacja sekcji 1.2 w toTranslate - tarcza ochronna
  assert.ok(payload.descriptiveSectionsToTranslate.section_1_2, 'section_1_2 musi być zawsze obecna w toTranslate');
  assert.ok(payload.descriptiveSectionsToTranslate.section_1_2.trim().length > 20, 'section_1_2 nie może być pusta');
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
