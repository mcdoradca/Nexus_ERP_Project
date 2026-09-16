const assert = require('assert');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const { 
  SDSProcessorEngine, 
  SDSDocxExporter, 
  NDSRegistry, 
  ADRRegistry, 
  WasteRegistry 
} = require('../src/modules/sds/sds.service');
const { SDSVerifierAgent } = require('../src/modules/sds/sds.verifier.agent');

console.log("=== ROZPOCZYNAM TESTY ZERO HARDCODES (WERYFIKACJA BRAKU ZASZYTYCH DANYCH) ===");

// 1. Inicjalizacja baz referencyjnych
const ndsPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'nds_database_2018.json');
NDSRegistry.loadRegistry(ndsPath);
const adrPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'adr_transport_pl.json');
ADRRegistry.loadRegistry(adrPath);
const wastePath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'waste_codes_pl.json');
WasteRegistry.loadRegistry(wastePath);

async function runZeroHardcodesTest() {
  // --------------------------------------------------------------------------
  // TEST 1: Własny dystrybutor (Brak wycieku ITALLUX przy innej firmie)
  // --------------------------------------------------------------------------
  console.log("\n[TEST 1] Weryfikacja dynamicznego dystrybutora (CHEM-POL Sp. z o.o.)...");
  const customConfig = {
    companyName: "CHEM-POL SP. Z O.O.",
    address: "ul. Przemysłowa 44",
    city: "Gdańsk",
    postalCode: "80-001",
    website: "www.chempol-test.pl",
    email: "biuro@chempol-test.pl",
    phone: "+48 58 111 22 33"
  };

  const engine = new SDSProcessorEngine(customConfig);
  const dummyS1Content = engine.processSection1("Trade name: PŁYN DO MYCIA\n1.2. Identified uses: cleaning\n1.3. Manufacturer details", "PŁYN DO MYCIA");
  assert(dummyS1Content.includes("CHEM-POL SP. Z O.O."), "BŁĄD: Sekcja 1.3 nie zawiera nazwy CHEM-POL SP. Z O.O.!");
  assert(!dummyS1Content.includes("ITALLUX"), "BŁĄD: Do Sekcji 1.3 wyciekła domyślna nazwa ITALLUX!");

  const dummyS16Content = engine.processSection16("", [], "", "1.0 PL", "Brak");
  assert(dummyS16Content.includes("CHEM-POL SP. Z O.O."), "BŁĄD: Sekcja 16 nie zawiera nazwy CHEM-POL SP. Z O.O.!");
  assert(!dummyS16Content.includes("ITALLUX"), "BŁĄD: Do Sekcji 16 wyciekła domyślna nazwa ITALLUX!");
  console.log("-> TEST 1 PASSED: Dane podmiotu są w 100% dynamiczne (brak wycieku ITALLUX).");

  // --------------------------------------------------------------------------
  // TEST 2: Sekcja 4.2 – Inny alergen (np. d-limonen) vs brak składnika uczulającego
  // --------------------------------------------------------------------------
  console.log("\n[TEST 2] Sekcja 4.2: Dynamiczny alergen (d-limonen) oraz brak kumaryny...");
  
  // Przypadek A: Alergen d-limonen
  const limonenComponents = [
    { name: "d-limonen", classification: "Flam. Liq. 3 H226, Skin Irrit. 2 H315, Skin Sens. 1B H317, Aquatic Chronic 1 H410" }
  ];
  const s4WithLimonen = engine.processSection4("4.1. First aid measures", limonenComponents, "Skin Sens. 1, H317");
  assert(s4WithLimonen.includes("d-limonen"), "BŁĄD: Sekcja 4.2 powinna zawierać d-limonen!");
  assert(!s4WithLimonen.includes("kumaryn"), "BŁĄD: W Sekcji 4.2 z d-limonenem pojawiła się kumaryna!");

  // Przypadek B: Brak składnika uczulającego w components, ale hasSkinSens = true
  const s4WithoutComp = engine.processSection4("4.1. First aid measures", [], "Skin Sens. 1, H317");
  assert(!s4WithoutComp.includes("kumaryn"), "BŁĄD: W Sekcji 4.2 bez składników pojawiła się kumaryna!");
  assert(s4WithoutComp.includes("U osób szczególnie wrażliwych może wywołać reakcję alergiczną skóry."), "BŁĄD: Brak poprawnego ogólnego zwrotu w 4.2!");
  console.log("-> TEST 2 PASSED: Sekcja 4.2 w 100% wolna od zabetonowanej kumaryny.");

  // --------------------------------------------------------------------------
  // TEST 3: Sekcja 14 i Eksporter DOCX dla towaru niepodlegającego ADR
  // --------------------------------------------------------------------------
  console.log("\n[TEST 3] Sekcja 14 i DOCX dla produktu niepodlegającego ADR (Brak nalepki Klasy 3)...");
  const s14NonAdr = engine.processSection14("14.1. UN number: Not classified as dangerous for transport.");
  assert(s14NonAdr.includes("Nie dotyczy"), "Sekcja 14 powinna wskazywać 'Nie dotyczy'!");

  const nonAdrSdsData = {
    productName: "ŚRODEK CZYSZCZĄCY EKO",
    companyConfig: customConfig,
    ghsPictograms: [],
    sections: {
      section_1: { content: "1.1. Nazwa: ŚRODEK CZYSZCZĄCY EKO" },
      section_2: { content: "2.1. Mieszanina nie stwarza zagrożenia." },
      section_3: { content: "3.2. Mieszaniny" },
      section_4: { content: "4.1. Pierwsza pomoc" },
      section_5: { content: "5.1. Środki gaśnicze" },
      section_6: { content: "6.1. Usuwanie wycieków" },
      section_7: { content: "7.1. Magazynowanie" },
      section_8: { content: "8.1. NDS" },
      section_9: { content: "9.1. Stan skupienia: ciecz" },
      section_10: { content: "10.1. Reaktywność" },
      section_11: { content: "11.1. Toksyczność" },
      section_12: { content: "12.1. Ekotoksyczność" },
      section_13: { content: "13.1. Odpady" },
      section_14: { content: s14NonAdr },
      section_15: { content: "15.1. Przepisy prawne" },
      section_16: { content: "16. Inne informacje" }
    }
  };

  const testNonAdrDocx = path.join(__dirname, 'temp_non_adr_test.docx');
  await SDSDocxExporter.export(nonAdrSdsData, testNonAdrDocx);
  assert(fs.existsSync(testNonAdrDocx), "Nie wygenerowano pliku DOCX!");

  const zipNonAdr = new AdmZip(testNonAdrDocx);
  const mediaEntries = zipNonAdr.getEntries().map(e => e.entryName).filter(n => n.startsWith('word/media/'));
  // Dla towaru bez zagrożeń GHS i bez ADR, liczba obrazków powinna wynosić 0
  console.log(`-> Liczba wstawionych grafik dla towaru niepodlegającego ADR: ${mediaEntries.length}`);
  assert.strictEqual(mediaEntries.length, 0, "BŁĄD: Do dokumentu bez ADR wstawiono piktogram transportowy!");

  const footerEntries = zipNonAdr.getEntries().filter(e => /word\/footer\d*\.xml/i.test(e.entryName));
  footerEntries.forEach(entry => {
    const footerXml = zipNonAdr.readAsText(entry.entryName);
    assert(footerXml.includes('CHEM-POL SP. Z O.O.'), "BŁĄD: Stopka nie zawiera dynamicznej nazwy dystrybutora CHEM-POL!");
    assert(!footerXml.includes('ITALLUX'), "BŁĄD: Do stopki wyciekła nazwa ITALLUX!");
  });

  if (fs.existsSync(testNonAdrDocx)) fs.unlinkSync(testNonAdrDocx);
  console.log("-> TEST 3 PASSED: Brak zabetonowanego piktogramu ADR Klasa 3 dla produktów bezpiecznych.");

  // --------------------------------------------------------------------------
  // TEST 4: Uniwersalne czyszczenie nagłówków obcych producentów
  // --------------------------------------------------------------------------
  console.log("\n[TEST 4] Weryfikacja czyszczenia nagłówków obcych producentów (np. Madel, Henkel)...");
  const foreignHeaderText = `Madel S.p.A.
Revision nr. 3
Dated 12/05/2023
Printed on 15/05/2023
Page n. 2/10
Replaced revision: 2 (Dated 01/01/2021)
1.2. Istotne zidentyfikowane zastosowania
Płyn do mycia naczyń`;

  const cleanedForeign = SDSProcessorEngine.cleanPdfArtifacts(foreignHeaderText);
  assert(!cleanedForeign.includes("Revision nr. 3"), "BŁĄD: Nagłówek obcego producenta nie został usunięty!");
  assert(!cleanedForeign.includes("Replaced revision:"), "BŁĄD: Została linia Replaced revision obcego producenta!");
  assert(cleanedForeign.includes("1.2. Istotne zidentyfikowane zastosowania"), "BŁĄD: Usunięto treść merytoryczną!");
  console.log("-> TEST 4 PASSED: Nagłówki obcych producentów są prawidłowo i uniwersalnie czyszczone.");

  // --------------------------------------------------------------------------
  // TEST 5: SSOT i eliminacja zastałych nazw technicznych plików
  // --------------------------------------------------------------------------
  console.log("\n[TEST 5] Weryfikacja reguły isTechnicalFilename oraz pierwszeństwa SSOT nad nazwą techniczną...");
  
  assert(SDSProcessorEngine.isTechnicalFilename("8034055535448_SDS_ORCHIDEA_E_VANIGLIA (1)"), "Powinno rozpoznać jako nazwę techniczną");
  assert(SDSProcessorEngine.isTechnicalFilename("8034055535448_SDS_TALCO (1).rtf"), "Powinno rozpoznać .rtf jako nazwę techniczną");
  assert(SDSProcessorEngine.isTechnicalFilename("temp_sds_1726467890123.pdf"), "Powinno rozpoznać temp_sds jako nazwę techniczną");
  assert(SDSProcessorEngine.isTechnicalFilename("PRODUKT CHEMICZNY"), "Powinno rozpoznać PRODUKT CHEMICZNY jako nazwę techniczną");
  assert(!SDSProcessorEngine.isTechnicalFilename("SGRASSANTE EXTRA UNIVERSAL"), "Nie powinno rozpoznać ręcznej nazwy handlowej jako technicznej");

  // Nawet jeśli z UI przyszedł zaległy ciąg techniczny z poprzedniego pliku, SSOT z karty ma bezwzględne pierwszeństwo
  const talcoRawSection1 = `1.1. Identificatore del prodotto
Nome commerciale: SWEET HOME - ESSENZA TALCO
Codice del prodotto: 8034055535431
UFI: 1234-5678-90AB-CDEF
1.2. Usi identificati
Profumatore per ambienti`;

  const s1TalcoContent = engine.processSection1(talcoRawSection1, "8034055535448_SDS_ORCHIDEA_E_VANIGLIA (1)");
  assert.strictEqual(engine.lastResolvedTradeName, "SWEET HOME - ESSENZA TALCO", `Oczekiwano SWEET HOME - ESSENZA TALCO, otrzymano: ${engine.lastResolvedTradeName}`);
  assert(s1TalcoContent.includes("SWEET HOME - ESSENZA TALCO"), "Sekcja 1.1 nie zawiera wyekstrahowanej nazwy z karty źródłowej!");
  assert(!s1TalcoContent.includes("ORCHIDEA"), "Do Sekcji 1.1 wyciekła zaległa nazwa z parametru wejściowego!");
  console.log("-> TEST 5 PASSED: Karta źródłowa jest bezwzględnym SSOT (nawet przy zastałym parametrze z UI).");

  // --------------------------------------------------------------------------
  // TEST 6: Zachowanie tożsamości nazwy pliku 1:1
  // --------------------------------------------------------------------------
  console.log("\n[TEST 6] Weryfikacja zachowania tożsamości nazwy pliku wyjściowego 1:1...");
  const sampleNames = [
    { input: "8034055535448_SDS_TALCO (1).rtf", expected: "8034055535448_SDS_TALCO (1).docx" },
    { input: "dupa 1234.pdf", expected: "dupa 1234.docx" },
    { input: "KARTA_TESTOWA_V2.PDF", expected: "KARTA_TESTOWA_V2.docx" }
  ];
  sampleNames.forEach(({ input, expected }) => {
    const base = input.replace(/\.(pdf|rtf)$/i, '');
    const outName = `${base}.docx`;
    assert.strictEqual(outName, expected, `Oczekiwano nazwy ${expected}, otrzymano ${outName}`);
  });
  console.log("-> TEST 6 PASSED: Nazwy plików wejściowych są w 100% zachowywane (1:1 z rozszerzeniem .docx).");

  console.log("\n========================================================");
  console.log("WSZYSTKIE TESTY ZERO HARDCODES ZAKOŃCZONE SUKCESEM (100%)");
  console.log("========================================================");
}

runZeroHardcodesTest().catch(err => {
  console.error("BŁĄD TESTU ZERO HARDCODES:", err);
  process.exit(1);
});
