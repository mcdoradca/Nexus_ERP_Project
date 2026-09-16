/**
 * TEST DEDYKOWANY: AUDYT KARTY CHARAKTERYSTYKI SANDALO (ELIMINACJA FAŁSZYWEGO CAS 002-00-6)
 * Plik źródłowy: docs/SDS/8034055535424_SDS_SANDALO (1).pdf
 * Weryfikacja:
 * 1. Wykluczenie fałszywego CAS 002-00-6 (pochodzącego z INDEX 607-002-00-6 kwasu octowego)
 * 2. Identyfikacja prawdziwego CAS 28219-61-6 (Bacdanol)
 * 3. Poprawne przypisanie polskich norm NDS dla kwasu octowego, (2-metoksymetyloetoksy)propanolu, etanolu i metanolu
 * 4. Pomyślny audyt SDSLinter (zero błędów)
 * 5. Stabilny eksport DOCX bez błędów strukturalnych
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { 
  SDSProcessorEngine, 
  NDSRegistry, 
  ADRRegistry, 
  WasteRegistry, 
  EcotoxRegistry,
  SDSDocxExporter,
  SDSChemicalExtractor
} = require('../src/modules/sds/sds.service');
const { SDSLinter } = require('../src/modules/sds/engine/sds.linter');

// Inicjalizacja baz referencyjnych
const ndsPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'nds_database_2018.json');
NDSRegistry.loadRegistry(ndsPath);
const adrPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'adr_transport_pl.json');
ADRRegistry.loadRegistry(adrPath);
const wastePath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'waste_codes_pl.json');
WasteRegistry.loadRegistry(wastePath);
const ecotoxPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'ecotox_cache.json');
EcotoxRegistry.loadRegistry(ecotoxPath);

const sandaloPdfPath = path.join(__dirname, '..', 'docs', 'SDS', '8034055535424_SDS_SANDALO (1).pdf');

test('AUDYT KARTY SANDALO (ELIMINACJA FAŁSZYWEGO CAS 002-00-6 I ASERCJA BACDANOLU)', async (t) => {
  assert(fs.existsSync(sandaloPdfPath), `Brak pliku źródłowego SANDALO: ${sandaloPdfPath}`);

  const engine = new SDSProcessorEngine();
  let payload;

  await t.test('KROK 1: Brak zatrzymania ochronnego HITL i poprawny prepareAgentPayload', async () => {
    assert.doesNotThrow(async () => {
      payload = await engine.prepareAgentPayload(sandaloPdfPath, 'SWEET HOME - PROFUMATORE AMBIENTE SANDALO');
    }, 'prepareAgentPayload rzucił błąd zamiast przetworzyć kartę SANDALO!');
    
    // Upewnienie się że payload został poprawnie zainicjalizowany
    payload = await engine.prepareAgentPayload(sandaloPdfPath, 'SWEET HOME - PROFUMATORE AMBIENTE SANDALO');
    assert(payload && payload.deterministicSections, 'Brak deterministycznych sekcji w payloadzie');
    console.log('-> KROK 1 ZDANY: Karta SANDALO przetworzona bez zatrzymania HITL.');
  });

  await t.test('KROK 2: Całkowite wykluczenie fałszywego CAS 002-00-6 z ekstrakcji', () => {
    const s3 = payload.deterministicSections.section_3;
    const comps = s3.components || [];
    
    // Sprawdzenie czy jakikolwiek składnik ma przypisany błędny CAS 002-00-6
    const hasPhantomCas = comps.some(c => c.cas === '002-00-6');
    assert(!hasPhantomCas, 'BŁĄD KRYTYCZNY: Fałszywy CAS 002-00-6 został wyekstrahowany do składników!');

    // Sprawdzenie bezpośrednio w extractCas na surowym tekście sekcji 3
    const extractedCasList = SDSChemicalExtractor.extractCas(s3.content);
    assert(!extractedCasList.includes('002-00-6'), 'BŁĄD: SDSChemicalExtractor.extractCas nadal wyciąga 002-00-6!');

    console.log('-> KROK 2 ZDANY: Fałszywy kod CAS 002-00-6 został w 100% wyeliminowany.');
  });

  await t.test('KROK 3: Prawidłowa identyfikacja CAS 28219-61-6 (Bacdanol) i kwasu octowego (CAS 64-19-7)', () => {
    const s3 = payload.deterministicSections.section_3;
    const comps = s3.components || [];

    // Bacdanol
    const bacdanol = comps.find(c => c.cas === '28219-61-6');
    assert(bacdanol, 'Nie znaleziono składnika z CAS 28219-61-6');
    assert.strictEqual(bacdanol.name, '2-etylo-4-(2,2,3-trimetylocyklopent-3-en-1-ylo)but-2-en-1-ol');
    assert.strictEqual(bacdanol.ec, '248-908-8');

    // Kwas octowy
    const acetic = comps.find(c => c.cas === '64-19-7');
    assert(acetic, 'Nie znaleziono kwasu octowego (CAS 64-19-7)');
    assert.strictEqual(acetic.name, 'kwas octowy');
    assert.strictEqual(acetic.index, '607-002-00-6');

    // (2-metoksymetyloetoksy)propanol
    const dpgme = comps.find(c => c.cas === '34590-94-8');
    assert(dpgme, 'Nie znaleziono DPGME (CAS 34590-94-8)');
    assert.strictEqual(dpgme.name, '(2-metoksymetyloetoksy)propanol');

    console.log('-> KROK 3 ZDANY: Substancje o CAS 28219-61-6, 64-19-7 oraz 34590-94-8 prawidłowo zidentyfikowane.');
  });

  await t.test('KROK 4: Sekcja 8.1 - Normatywy NDS dla kwasu octowego i DPGME', () => {
    const s8 = payload.deterministicSections.section_8.content;
    assert(s8.includes('Kwas octowy [CAS: 64-19-7]'), 'Brak kwasu octowego w Sekcji 8.1');
    assert(s8.includes('NDS: 25 mg/m³'), 'Brak NDS 25 mg/m³ dla kwasu octowego');
    assert(s8.includes('NDSCh: 50 mg/m³'), 'Brak NDSCh 50 mg/m³ dla kwasu octowego');

    assert(s8.includes('(2-Metoksymetyloetoksy)propanol [CAS: 34590-94-8]'), 'Brak DPGME w Sekcji 8.1');
    assert(s8.includes('NDS: 240 mg/m³'), 'Brak NDS 240 mg/m³ dla DPGME');
    assert(s8.includes('NDSCh: 480 mg/m³'), 'Brak NDSCh 480 mg/m³ dla DPGME');

    console.log('-> KROK 4 ZDANY: Sekcja 8.1 zawiera normatywy NDS/NDSCh zgodne z Dz.U. 2018 poz. 1286.');
  });

  await t.test('KROK 5: SDSLinter Gatekeeper dla zmontowanej karty SANDALO', () => {
    const detSecs = payload.deterministicSections;
    const dummyTranslated = {
      section_1_2: detSecs.section_1.content,
      section_4: detSecs.section_4.content,
      section_5: '5.1. Środki gaśnicze: piana, proszek gaśniczy, CO2.',
      section_6: '6.1. Środki ostrożności: usunąć źródła zapłonu.',
      section_7: '7.1. Środki ostrożności: zapewnić wentylację.',
      section_10: '10.1. Reaktywność: brak szczególnych zagrożeń.',
      section_11: '11.1. Toksyczność ostra: Metanol LD50 doustnie: 5628 mg/kg (szczur).'
    };

    const merged = engine.mergeCompletedSds(payload, dummyTranslated);
    const lintResult = SDSLinter.auditAndLint(merged);

    assert(lintResult.isValid, `SDSLinter odrzucił kartę SANDALO z błędami:\n${lintResult.errors.join('\n')}`);
    assert.strictEqual(lintResult.errors.length, 0, 'Oczekiwano 0 błędów w SDSLinter');

    console.log('-> KROK 5 ZDANY: SDSLinter przeszedł bez uwag (100% Quality Gate).');
  });

  await t.test('KROK 6: Eksport DOCX dla karty SANDALO i weryfikacja mediów', async () => {
    const outSandaloDocx = path.resolve('docs/SDS/Karta_Charakterystyki_8034055535424_SDS_SANDALO.docx');
    
    const detSecs = payload.deterministicSections;
    const dummyTranslated = {
      section_1_2: detSecs.section_1.content,
      section_4: detSecs.section_4.content,
      section_5: '5.1. Środki gaśnicze: piana, proszek gaśniczy, CO2.',
      section_6: '6.1. Środki ostrożności: usunąć źródła zapłonu.',
      section_7: '7.1. Środki ostrożności: zapewnić wentylację.',
      section_10: '10.1. Reaktywność: brak szczególnych zagrożeń.',
      section_11: '11.1. Toksyczność ostra: Metanol LD50 doustnie: 5628 mg/kg (szczur).'
    };
    const merged = engine.mergeCompletedSds(payload, dummyTranslated);

    const exportData = {
      productName: payload.metadata.productName || 'SWEET HOME - PROFUMATORE AMBIENTE SANDALO',
      version: payload.metadata.version || '1.0 PL',
      replacedRevision: payload.metadata.replacedRevision,
      compilationDate: payload.metadata.compilationDate,
      revisionDate: payload.metadata.revisionDate,
      sections: merged.sections,
      ghsPictograms: merged.ghsPictograms && merged.ghsPictograms.length > 0 ? merged.ghsPictograms : ['GHS02', 'GHS07'],
      signalWord: merged.sections.section_2 ? merged.sections.section_2.signalWord : 'Niebezpieczeństwo'
    };

    await SDSDocxExporter.export(exportData, outSandaloDocx);
    assert(fs.existsSync(outSandaloDocx), 'Plik DOCX dla SANDALO nie został wygenerowany!');

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(outSandaloDocx);
    const mediaEntries = zip.getEntries().map(e => e.entryName).filter(n => n.startsWith('word/media/'));
    assert(mediaEntries.length >= 2, `Oczekiwano co najmniej 2 piktogramów w pliku DOCX, znaleziono: ${mediaEntries.length}`);

    console.log('-> KROK 6 ZDANY: DOCX dla karty SANDALO wygenerowany poprawnie z piktogramami.');
  });
});
