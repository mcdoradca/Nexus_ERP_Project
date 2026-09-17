const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const { SDSDocxParser } = require('../src/modules/sds/engine/sds.docx.parser');
const { SDSDocumentParser, SDSProcessorEngine, SDSChemicalExtractor } = require('../src/modules/sds/sds.service');

const NAJMA_DOCX = path.resolve('docs/SDS/8051944811087_SDS_NAJMA_1to1_Konwertowany.docx');
const hasDocx = fs.existsSync(NAJMA_DOCX);

test('DOCX Input Parser - Walidacja detekcji formatu isDocxFile', (t) => {
  if (!hasDocx) {
    t.skip('Brak pliku testowego NAJMA_DOCX');
    return;
  }
  assert.strictEqual(fs.existsSync(NAJMA_DOCX), true, 'Plik NAJMA DOCX musi istnieć');
  assert.strictEqual(SDSDocxParser.isDocxFile(NAJMA_DOCX), true, 'NAJMA DOCX powinien być rozpoznany jako DOCX');
  assert.strictEqual(SDSDocxParser.isDocxFile('src/modules/sds/test.pdf'), false, 'Plik test.pdf nie jest DOCX');
  assert.strictEqual(SDSDocxParser.isDocxFile('non_existent.docx'), false, 'Nieistniejący plik zwraca false');
  assert.strictEqual(SDSDocxParser.isDocxFile(null), false, 'Null zwraca false');
});

test('DOCX Input Parser - Ekstrakcja 16 sekcji z NAJMA DOCX bez wycieku nagłówków stron', (t) => {
  if (!hasDocx) {
    t.skip('Brak pliku testowego NAJMA_DOCX');
    return;
  }
  const parsed = SDSDocxParser.extractTextAndSections(NAJMA_DOCX);
  assert.ok(parsed.fullText && parsed.fullText.length > 5000, 'Pełny tekst musi mieć ponad 5000 znaków');
  
  // Weryfikacja kompletności wszystkich 16 sekcji REACH
  for (let i = 1; i <= 16; i++) {
    const secKey = `section_${i}`;
    assert.ok(parsed.sections[secKey], `Sekcja ${i} musi istnieć w parsed.sections`);
    assert.ok(!parsed.sections[secKey].includes(`Brak danych dla Sekcji ${i}`), `Sekcja ${i} nie może być pusta, treść: ${parsed.sections[secKey].slice(0, 40)}`);
  }
});

test('DOCX Input Parser - Bezpośrednia ekstrakcja 3 składników z tabel sekcji 3 (NAJMA)', (t) => {
  if (!hasDocx) {
    t.skip('Brak pliku testowego NAJMA_DOCX');
    return;
  }
  const parsed = SDSDocxParser.extractTextAndSections(NAJMA_DOCX);
  assert.ok(parsed.tablesBySection['section_3'].length > 0, 'Sekcja 3 musi zawierać tabele OpenXML');

  const components = SDSDocxParser.parseSection3Table(parsed.tablesBySection['section_3'], (cas, name) => SDSChemicalExtractor.resolvePlName(cas, name));
  assert.strictEqual(components.length, 3, `Oczekiwano 3 składników, znaleziono: ${components.length}`);

  // Składnik 1: octan 4-tert-butylocykloheksylu (CAS: 32210-23-4)
  const comp1 = components.find(c => c.cas === '32210-23-4');
  assert.ok(comp1, 'Octan 4-tert-butylocykloheksylu (CAS 32210-23-4) musi być obecny');
  assert.strictEqual(comp1.ec, '250-954-9', 'Numer WE to 250-954-9');
  assert.ok(comp1.concentration.includes('0.1') && comp1.concentration.includes('0.25'), 'Stężenie: ≥0.1 - <0.25 %');
  assert.ok(comp1.classification.includes('Skin Sens. 1B') && comp1.classification.includes('H317'), 'Klasyfikacja musi zawierać H317');

  // Składnik 2: aldehyd cynamonowy (CAS: 104-55-2)
  const comp2 = components.find(c => c.cas === '104-55-2');
  assert.ok(comp2, 'Aldehyd cynamonowy (CAS 104-55-2) musi być obecny');
  assert.strictEqual(comp2.ec, '203-213-9', 'Numer WE to 203-213-9');
  assert.strictEqual(comp2.index, '606-155-00-6', 'Numer indeksowy to 606-155-00-6');
  assert.ok(comp2.classification.includes('Skin Sens. 1A') && comp2.classification.includes('H317'), 'Klasyfikacja musi zawierać Skin Sens. 1A');

  // Składnik 3: masa poreakcyjna CMI/MIT (CAS: 55965-84-9)
  const comp3 = components.find(c => c.cas === '55965-84-9');
  assert.ok(comp3, 'Masa poreakcyjna CMI/MIT (CAS 55965-84-9) musi być obecna');
  assert.strictEqual(comp3.ec, '911-418-6', 'Numer WE to 911-418-6');
  assert.strictEqual(comp3.index, '613-167-00-5', 'Numer indeksowy to 613-167-00-5');
  assert.ok(comp3.concentration.includes('0.00093'), 'Stężenie < 0.00093%');
  assert.ok(comp3.classification.includes('Skin Corr. 1C') || comp3.classification.includes('H314'), 'Klasyfikacja musi zawierać H314');
});

test('SDSDocumentParser - Integracja extractText z plikiem DOCX', async (t) => {
  if (!hasDocx) {
    t.skip('Brak pliku testowego NAJMA_DOCX');
    return;
  }
  const text = await SDSDocumentParser.extractText(NAJMA_DOCX);
  assert.ok(text && text.length > 5000, 'extractText na DOCX musi zwrócić pełny tekst');
  assert.ok(text.includes('SECTION 1') || text.includes('SEKCJA 1'), 'Musi zawierać SEKCJA 1');
  assert.ok(text.includes('SECTION 3') || text.includes('SEKCJA 3'), 'Musi zawierać SEKCJA 3');
  assert.ok(text.includes('SECTION 16') || text.includes('SEKCJA 16'), 'Musi zawierać SEKCJA 16');
});

test('SDSProcessorEngine - Pełne przygotowanie payloadu z wejściowego pliku DOCX (NAJMA)', async (t) => {
  if (!hasDocx) {
    t.skip('Brak pliku testowego NAJMA_DOCX');
    return;
  }
  const engine = new SDSProcessorEngine({
    companyName: 'ITALLUX Sp. z o.o.',
    address: 'ul. Wesoła 16',
    city: '63-600 Kępno',
    website: 'www.prostozwloch.com.pl',
    email: 'kontakt@prostozwloch.com.pl',
    phone: '+48 663116607',
    emergencyPhone: '+48 663116607'
  });

  const payload = await engine.prepareAgentPayload(NAJMA_DOCX, 'SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE NAJMA');
  assert.ok(payload, 'Payload musi zostać wygenerowany');
  assert.ok(payload.deterministicSections, 'Musi zawierać deterministicSections');
  
  // Weryfikacja Sekcji 1: UFI
  const s1 = payload.deterministicSections.section_1.content;
  assert.ok(s1.includes('AJAD-RP52-PA98-ME4H'), 'Kod UFI musi być pobrany z karty DOCX');

  // Weryfikacja Sekcji 2: Mieszanina niezaklasyfikowana z EUH208
  const s2 = payload.deterministicSections.section_2.content;
  assert.ok(s2.includes('Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie'), 'Klasyfikacja 2.1 niezaklasyfikowana');
  assert.ok(s2.includes('Brak hasła ostrzegawczego.'), 'Brak hasła ostrzegawczego');
  assert.ok(s2.includes('EUH208'), 'Zwrot EUH208 obecny');

  // Weryfikacja Sekcji 3: Wszystkie 3 składniki
  assert.strictEqual(payload.metadata.components.length, 3, 'Metadata musi zawierać 3 komponenty');
  const s3 = payload.deterministicSections.section_3.content;
  assert.ok(s3.includes('32210-23-4'), 'Sekcja 3 musi zawierać octan 4-tert-butylocykloheksylu');
  assert.ok(s3.includes('104-55-2'), 'Sekcja 3 musi zawierać aldehyd cynamonowy');
  assert.ok(s3.includes('55965-84-9'), 'Sekcja 3 musi zawierać CMI/MIT');
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
