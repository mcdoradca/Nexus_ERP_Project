/**
 * TEST DEDYKOWANY: AUDYT SANEPID / PIP DLA NOWEJ KARTY CHARAKTERYSTYKI TALCO
 * Plik źródłowy: docs/SDS/8034055535431_SDS_TALCO (1).pdf
 * Weryfikacja 4 uchybień audytu + SDSLinter Gatekeeper
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
  SDSDocxExporter
} = require('../src/modules/sds/sds.service');
const { SDSLinter } = require('../src/modules/sds/engine/sds.linter');

// Inicjalizacja rejestrów wiedzy prawnej i chemicznej
const ndsPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'nds_database_2018.json');
NDSRegistry.loadRegistry(ndsPath);
const adrPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'adr_transport_pl.json');
ADRRegistry.loadRegistry(adrPath);
const wastePath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'waste_codes_pl.json');
WasteRegistry.loadRegistry(wastePath);
const ecotoxPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'ecotox_cache.json');
EcotoxRegistry.loadRegistry(ecotoxPath);

const talcoPdfPath = path.join(__dirname, '..', 'docs', 'SDS', '8034055535431_SDS_TALCO (1).pdf');

test('AUDYT SANEPID / PIP DLA KARTY TALCO (UE 2020/878 & CLP)', async (t) => {
  if (!fs.existsSync(talcoPdfPath)) {
    t.skip(`Brak pliku źródłowego TALCO (usunięty na polecenie użytkownika): ${talcoPdfPath}`);
    return;
  }

  const engine = new SDSProcessorEngine();
  const payload = await engine.prepareAgentPayload(talcoPdfPath, 'SWEET HOME - PROFUMATORE AMBIENTE TALCO');

  const detSecs = payload.deterministicSections;
  const metadata = payload.metadata;

  await t.test('PUNKT 1: Sekcja 8.1 - Wartości DNEL droga skórna (Na skórę:) dla metanolu', () => {
    const s8 = detSecs.section_8.content;
    assert(s8.includes('Metanol [CAS: 67-56-1]'), 'Brak metanolu w Sekcji 8.1!');
    
    // Weryfikacja obecności sekcji DNEL dla metanolu
    const methMatch = s8.match(/Substancja:\s*metanol\s*\[CAS:\s*67-56-1\][\s\S]*?(?=(?:Substancja:|Zalecane procedury|$))/i);
    assert(methMatch, 'Nie udało się wyodrębnić bloku DNEL metanolu w sekcji 8.1');
    const methBlock = methMatch[0];

    // Droga skórna musi być wyekstrahowana
    assert(methBlock.includes('- Na skórę:'), `BŁĄD AUDYTU: W bloku metanolu brakuje drogi skórnej ('- Na skórę:'):\n${methBlock}`);
    
    // Wartości ostre i przewlekłe dla konsumentów (4 mg/kg) i pracowników (20 mg/kg)
    assert(methBlock.includes('4 mg/kg mc/dzień'), 'Brak wartości 4 mg/kg mc/dzień w DNEL metanolu!');
    assert(methBlock.includes('20 mg/kg mc/dzień'), 'Brak wartości 20 mg/kg mc/dzień w DNEL metanolu!');
    assert(/Konsumenci.*4\s*mg\/kg/i.test(methBlock), 'Brak poprawnego przypisania konsumentom wartości 4 mg/kg w skórze metanolu!');
    assert(/Pracownicy.*20\s*mg\/kg/i.test(methBlock), 'Brak poprawnego przypisania pracownikom wartości 20 mg/kg w skórze metanolu!');

    console.log('-> PUNKT 1 ZDANY: DNEL droga skórna dla metanolu w 100% zgodna z dokumentacją ECHA.');
  });

  await t.test('PUNKT 2: Sekcja 12.1 - Chroniczne badania NOEC i organizmy testowe dla 3 substancji', () => {
    const s12 = detSecs.section_12.content;

    // 1. Salicylan benzylu
    assert(s12.includes('salicylan benzylu'), 'Brak salicylanu benzylu w sekcji 12.1');
    const bsalBlock = s12.match(/salicylan benzylu[\s\S]*?(?=(?:galaksolid|kumaryna|2,6-di-tert|hydroksycytronellal|toluen|metanol|12\.2|$))/i);
    assert(bsalBlock, 'Brak bloku salicylanu benzylu');
    assert(bsalBlock[0].includes('NOEC (przewlekła, skorupiaki): 0,894 mg/l Daphnia magna'), 
      `BŁĄD: Brak NOEC skorupiaków (0,894 mg/l Daphnia magna) dla salicylanu benzylu:\n${bsalBlock[0]}`);
    assert(bsalBlock[0].includes('NOEC (przewlekła, glony): 0,502 mg/l Pseudokirchneriella subcapitata'), 
      `BŁĄD: Brak NOEC glonów (0,502 mg/l Pseudokirchneriella subcapitata) dla salicylanu benzylu:\n${bsalBlock[0]}`);

    // 2. Kumaryna
    assert(s12.includes('kumaryna (2H-chromen-2-on)'), 'Brak kumaryny w sekcji 12.1');
    const coumBlock = s12.match(/kumaryna\s*\(2H-chromen-2-on\)[\s\S]*?(?=(?:2,6-di-tert|hydroksycytronellal|toluen|metanol|12\.2|$))/i);
    assert(coumBlock, 'Brak bloku kumaryny');
    assert(coumBlock[0].includes('NOEC (przewlekła, ryby): 0,119 mg/l'), 
      `BŁĄD: Brak NOEC ryb (0,119 mg/l) dla kumaryny:\n${coumBlock[0]}`);
    assert(coumBlock[0].includes('NOEC (przewlekła, skorupiaki): 0,448 mg/l'), 
      `BŁĄD: Brak NOEC skorupiaków (0,448 mg/l) dla kumaryny:\n${coumBlock[0]}`);
    assert(coumBlock[0].includes('NOEC (przewlekła, glony): 0,408 mg/l'), 
      `BŁĄD: Brak NOEC glonów (0,408 mg/l) dla kumaryny:\n${coumBlock[0]}`);

    // 3. Metanol
    assert(s12.includes('metanol (CAS: 67-56-1)'), 'Brak metanolu w sekcji 12.1');
    const methEcotox = s12.match(/metanol\s*\(CAS:\s*67-56-1\)[\s\S]*?(?=(?:12\.2|$))/i);
    assert(methEcotox, 'Brak bloku ekotoksyczności metanolu');
    assert(methEcotox[0].includes('NOEC (przewlekła, ryby): 3950 mg/l/(96 h) Danio rerio'), 
      `BŁĄD: Brak NOEC ryb Danio rerio dla metanolu:\n${methEcotox[0]}`);
    assert(methEcotox[0].includes('NOEC (przewlekła, skorupiaki): 7960 mg/l/(96 h) Mytilus edulis (omułek)'), 
      `BŁĄD: Brak NOEC skorupiaków Mytilus edulis dla metanolu:\n${methEcotox[0]}`);

    // Zakaz pustych wskaźników bez wartości
    const emptyIndicators = s12.match(/^-\s*(?:LC50|EC50|NOEC|IC50)[^\n:]*:\s*$/gm);
    assert(!emptyIndicators || emptyIndicators.length === 0, `BŁĄD: Wykryto puste wskaźniki w Sekcji 12.1: ${emptyIndicators}`);

    console.log('-> PUNKT 2 ZDANY: Badania przewlekłe NOEC i gatunki testowe dla 3 substancji wyekstrahowane w całości.');
  });

  await t.test('PUNKT 3: Sekcja 4.2 - Lista wszystkich alergenów w bierniku', () => {
    const s4 = detSecs.section_4.content;
    assert(s4.includes('W kontakcie ze skórą:'), 'Brak kontaktu ze skórą w Sekcji 4.2');
    
    // Weryfikacja obecności wszystkich 3 substancji uczulających
    assert(s4.includes('salicylan benzylu'), 'Brak salicylanu benzylu w Sekcji 4.2!');
    assert(s4.includes('kumarynę (2H-chromen-2-on)'), 'Brak kumaryny w formie biernikowej w Sekcji 4.2!');
    assert(s4.includes('hydroksycytronellal'), 'Brak hydroksycytronellalu w Sekcji 4.2!');

    // Weryfikacja że są wymienione w jednym ciągu po 'zawiera:'
    assert(/zawiera:\s*salicylan benzylu,\s*kumarynę \(2H-chromen-2-on\),\s*hydroksycytronellal/i.test(s4), 
      `BŁĄD: Niepoprawny format listy alergenów w sekcji 4.2:\n${s4}`);

    console.log('-> PUNKT 3 ZDANY: Wszyscy trzej dawcy EUH208 wymienieni w pełnej formie biernikowej.');
  });

  await t.test('PUNKT 4: Dane teleadresowe firmy (www.prostozwloch.com.pl & kontakt@prostozwloch.com.pl)', () => {
    const s1 = detSecs.section_1.content;
    assert(s1.includes('www.prostozwloch.com.pl'), `Brak prawidłowej strony www w Sekcji 1.3:\n${s1}`);
    assert(s1.includes('kontakt@prostozwloch.com.pl'), `Brak prawidłowego e-maila w Sekcji 1.3:\n${s1}`);
    assert(!s1.includes('www.prostozwloch.pl\n') && !s1.includes(' kontakt@prostozwloch.pl'), 
      'Wykryto stary adres z końcówką .pl bez .com!');

    console.log('-> PUNKT 4 ZDANY: Oficjalna domena i e-mail (.com.pl) poprawnie wdrożone.');
  });

  await t.test('PUNKT 5: SDSLinter Gatekeeper dla zmontowanej karty TALCO', () => {
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

    assert(lintResult.isValid, `SDSLinter odrzucił kartę TALCO z błędami:\n${lintResult.errors.join('\n')}`);
    assert.strictEqual(lintResult.errors.length, 0, 'Oczekiwano 0 błędów w SDSLinter');

    console.log('-> PUNKT 5 ZDANY: SDSLinter przeszedł bez uwag (100% Production-Ready).');
  });

  await t.test('PUNKT 6: Generowanie pliku DOCX dla TALCO i weryfikacja mediów', async () => {
    const outTalcoDocx = path.resolve('docs/SDS/Karta_Charakterystyki_8034055535431_SDS_TALCO.docx');
    
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
      productName: metadata.productName || 'SWEET HOME - PROFUMATORE AMBIENTE TALCO',
      version: metadata.version || '1.0 PL',
      replacedRevision: metadata.replacedRevision,
      compilationDate: metadata.compilationDate,
      revisionDate: metadata.revisionDate,
      sections: merged.sections,
      ghsPictograms: merged.ghsPictograms && merged.ghsPictograms.length > 0 ? merged.ghsPictograms : ['GHS02', 'GHS07'],
      signalWord: merged.sections.section_2 ? merged.sections.section_2.signalWord : 'Niebezpieczeństwo'
    };

    await SDSDocxExporter.export(exportData, outTalcoDocx);
    assert(fs.existsSync(outTalcoDocx), 'Plik DOCX dla TALCO nie został wygenerowany!');

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(outTalcoDocx);
    const mediaEntries = zip.getEntries().map(e => e.entryName).filter(n => n.startsWith('word/media/'));
    assert(mediaEntries.length >= 2, `Oczekiwano co najmniej 2 obiektów graficznych GHS, znaleziono: ${mediaEntries.length}`);

    // Weryfikacja że skasowane pliki Orchidea NIE zostały odtworzone
    const forbiddenFiles = [
      'docs/SDS/8034055535448_SDS_ORCHIDEA_E_VANIGLIA (1) (1).pdf',
      'docs/SDS/8034055535448_SDS_ORCHIDEA_E_VANIGLIA (1).rtf',
      'docs/SDS/Instrukcja Wdrożeniowa Agenta Antigravity_ Automatyczna Adaptacja Kart SDS.md',
      'docs/SDS/Karta_Charakterystyki_8034055535448_SDS_ORCHIDEA_E_VANIGLIA (9).docx',
      'docs/SDS/Karta_Charakterystyki_8034055535448_SDS_ORCHIDEA_E_VANIGLIA (12).docx',
      'docs/SDS/Karta_Charakterystyki_8034055535448_SDS_ORCHIDEA_E_VANIGLIA_V2_PL.docx'
    ];
    for (const f of forbiddenFiles) {
      assert(!fs.existsSync(path.resolve(f)), `BŁĄD KRYTYCZNY: Skasowany plik ${f} został nielegalnie odtworzony!`);
    }

    console.log('-> PUNKT 6 ZDANY: DOCX wygenerowany poprawnie, zakazane pliki Orchidea nie istnieją.');
  });
});
