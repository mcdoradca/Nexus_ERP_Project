const assert = require('assert');
const path = require('path');
const { 
  SDSProcessorEngine, 
  PolishLegalTemplates, 
  NDSRegistry, 
  WasteRegistry, 
  ADRRegistry 
} = require('../src/modules/sds/sds.service');
const { SDSVerifierAgent } = require('../src/modules/sds/sds.verifier.agent');

console.log("=== ROZPOCZYNAM AUDYT TESTOWY ZGODNOŚCI PRAWNO-CHEMICZNEJ SDS ===");

// 1. Inicjalizacja baz referencyjnych
const ndsPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'nds_database_2018.json');
NDSRegistry.loadRegistry(ndsPath);
const adrPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'adr_transport_pl.json');
ADRRegistry.loadRegistry(adrPath);
const wastePath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'waste_codes_pl.json');
WasteRegistry.loadRegistry(wastePath);

const customCompany = {
  companyName: "CHEM-POLAND Sp. z o.o.",
  address: "Al. Jerozolimskie 100",
  postalCode: "00-001",
  city: "Warszawa",
  email: "sds@chempoland.pl",
  phone: "+48 22 100 20 30",
  emergencyPhone: "+48 22 100 20 99"
};

const engine = new SDSProcessorEngine(customCompany);

// TEST 1: Sekcja 1.3 - Parametryzacja danych firmy
console.log("\n[TEST 1] Weryfikacja parametryzacji danych dostawcy (Sekcja 1.3)...");
const s1_3 = PolishLegalTemplates.getSection1_3(customCompany);
assert(s1_3.includes("CHEM-POLAND Sp. z o.o."), "Nazwa firmy nie została uwzględniona!");
assert(s1_3.includes("Al. Jerozolimskie 100"), "Adres firmy nie został uwzględniony!");
assert(s1_3.includes("sds@chempoland.pl"), "E-mail firmy nie został uwzględniony!");
assert(s1_3.includes("+48 22 100 20 30"), "Telefon firmy nie został uwzględniony!");
console.log("-> TEST 1 PASSED: Dane dostawcy są w pełni dynamiczne.");

// TEST 2: Sekcja 8.1 - Brak wstrzykiwania Austrii dla CMI/MI (CAS 55965-84-9) gdy brak w składzie
console.log("\n[TEST 2] Weryfikacja braku wstrzykiwania obcego OEL CAS 55965-84-9...");
const rawSection8Text = "SECTION 8: Exposure controls/personal protection\nCommunity Occupational Exposure Limits (OEL):\nMAK values defined.";
const s8ResultWithoutCmi = engine.processSection8(rawSection8Text, [
  { cas: "67-63-0", name: "propan-2-ol", classification: "Flam. Liq. 2 H225; Eye Irrit. 2 H319" }
], "H225 Wysoce łatwopalna ciecz i pary\nH319 Działa drażniąco na oczy");
assert(!s8ResultWithoutCmi.includes("55965-84-9"), "BŁĄD KRYTYCZNY: Wstrzyknięto CAS 55965-84-9 do produktu, który go nie zawiera!");
assert(!s8ResultWithoutCmi.includes("Masa poreakcyjna 5-chloro-2-metylo"), "BŁĄD KRYTYCZNY: Wstrzyknięto opis CMI/MI!");
console.log("-> TEST 2 PASSED: Nie wstrzyknięto fałszywego OEL CMI/MI.");

// TEST 3: Sekcja 8.2 - Dynamiczne ŚOI (PN-EN 166, PN-EN ISO 374-1) dla produktów stwarzających zagrożenie
console.log("\n[TEST 3] Weryfikacja adekwatności Środków Ochrony Indywidualnej (ŚOI)...");
assert(s8ResultWithoutCmi.includes("PN-EN 166"), "Brak obowiązkowej normy ochrony oczu PN-EN 166 dla produktu H319!");
assert(s8ResultWithoutCmi.includes("PN-EN ISO 374-1"), "Brak normy rękawic ochronnych PN-EN ISO 374-1 dla produktu drażniącego!");
assert(!s8ResultWithoutCmi.includes("Ochrona oczu: Brak szczególnych wymagań"), "BŁĄD: Produkt drażniący oczy dostał 'brak wymagań'!");
console.log("-> TEST 3 PASSED: ŚOI zawierają rygorystyczne normy PN-EN odpowiadające zagrożeniom.");

// TEST 4: Sekcja 12.6 - Usunięcie domyślnego Galaksolidu przy 'no endocrine disruption'
console.log("\n[TEST 4] Weryfikacja eliminacji fałszywego Galaksolidu (CAS 1222-05-5)...");
const rawSec12Text = `
12.1. Toxicity
12.2. Persistence
12.3. Bioaccumulative
12.4. Mobility
12.5. PBT
12.6. Endocrine disrupting properties
No substances identified with endocrine disruption properties.
12.7. Other adverse effects
`;
const s12Result = engine.processSection12(rawSec12Text, [
  { cas: "67-63-0", name: "propan-2-ol" }
]);
assert(!s12Result.content.includes("1222-05-5"), "BŁĄD KRYTYCZNY: Wstrzyknięto Galaksolid (CAS 1222-05-5) do produktu czystego!");
assert(!s12Result.content.includes("galaksolid"), "BŁĄD KRYTYCZNY: Wstrzyknięto nazwę galaksolid!");
assert(s12Result.content.includes("Mieszanina nie zawiera substancji o właściwościach zaburzających"), "Brak oświadczenia negatywnego!");
assert.strictEqual(s12Result.endocrineDisruptorInfo, null, "Flaga endocrineDisruptorInfo powinna być null!");
console.log("-> TEST 4 PASSED: Galaksolid nie jest wstrzykiwany przy oświadczeniach negatywnych.");

// TEST 5: Sekcja 13 - Branżowy dobór kodów odpadów (Farby vs Detergenty)
console.log("\n[TEST 5] Weryfikacja branżowych kodów odpadów wg Katalogu Odpadów (Dz.U. 2020 poz. 10)...");
const wastePaint = PolishLegalTemplates.getSection13(true, "Farba akrylowa do ścian i sufitów, rozcieńczalnik");
assert(wastePaint.includes("08 01 11*"), "BŁĄD: Farba nie otrzymała kodu odpadu z grupy 08 01!");
assert(wastePaint.includes("20 01 27*"), "BŁĄD: Odpad konsumencki farby nie otrzymał kodu 20 01 27*!");

const wasteDetergent = PolishLegalTemplates.getSection13(true, "Detergent do mycia podłóg i naczyń");
assert(wasteDetergent.includes("07 06 04*"), "BŁĄD: Detergent nie otrzymał kodu z grupy 07 06!");
assert(wasteDetergent.includes("20 01 29*"), "BŁĄD: Odpad komunalny detergentu nie otrzymał kodu 20 01 29*!");
console.log("-> TEST 5 PASSED: Kody odpadów są precyzyjnie dopasowane do branży produktu.");

// TEST 6: Sekcja 15.1 - Warunkowanie Rozporządzenia o detergentach i Seveso III
console.log("\n[TEST 6] Weryfikacja powoływania Rozporządzenia 648/2004 i progów Seveso III...");
const s15Paint = PolishLegalTemplates.getSection15("", "", false, true, false);
assert(!s15Paint.includes("Rozporządzenie (WE) nr 648/2004"), "BŁĄD: Powołano rozporządzenie o detergentach dla farby!");
assert(s15Paint.includes("Kategoria P5a/P5b/P5c"), "BŁĄD: Pominięto kategorię cieczy łatwopalnych Seveso III!");

const s15Detergent = PolishLegalTemplates.getSection15("", "", true, false, false);
assert(s15Detergent.includes("Rozporządzenie (WE) nr 648/2004"), "BŁĄD: Nie powołano rozporządzenia o detergentach dla detergentu!");
console.log("-> TEST 6 PASSED: Akty prawne w Sekcji 15.1 są ściśle powiązane z charakterem produktu.");

// TEST 7: Agent Audytor Prawno-Chemiczny (SDSVerifierAgent) - Auto-remediacja niespójności
console.log("\n[TEST 7] Weryfikacja działania Agenta Audytora Prawno-Chemicznego (SDSVerifierAgent)...");
(async () => {
  const mockSections = {
    section_1: { content: "Nazwa handlowa: FARBA EPOKSYDOWA\nZastosowanie profesjonalne: powłoka lakiernicza" },
    section_2: { content: "2.1. Klasyfikacja\nEye Dam. 1 H318 Powoduje poważne uszkodzenie oczu.\n\n2.3. Inne zagrożenia\nProdukt nie zawiera składników wpisanych do wykazu ustanowionego zgodnie z art. 59..." },
    section_8: { content: "8.2. Kontrola narażenia\nOchrona oczu: Brak szczególnych wymagań w normalnych warunkach stosowania.\nOchrona rąk: Nie jest wymagana przy normalnym stosowaniu." },
    section_12: { content: "12.6. Właściwości zaburzające funkcjonowanie układu hormonalnego\nSubstancje zaburzające funkcjonowanie układu hormonalnego w odniesieniu do środowiska:\ngalaksolid (CAS: 1222-05-5): Wykaz II ECHA – substancja podlegająca ocenie pod kątem właściwości zaburzających funkcjonowanie układu hormonalnego zgodnie z przepisami UE." },
    section_15: { content: "- Rozporządzenie (WE) nr 648/2004 Parlamentu Europejskiego i Rady z dnia 31 marca 2004 r. w sprawie detergentów z późniejszymi zmianami.\n- Dyrektywa Parlamentu Europejskiego i Rady 2012/18/UE z dnia 4 lipca 2012 r. w sprawie kontroli niebezpieczeństwa poważnych awarii związanych z substancjami niebezpiecznymi (Seveso III): Mieszanina nie podlega przepisom dyrektywy – brak substancji w ilościach progowych." }
  };

  const audit = await SDSVerifierAgent.verifyAndAudit(mockSections, {
    productName: "FARBA EPOKSYDOWA",
    components: [{ cas: "1222-05-5", name: "galaksolid", classification: "Eye Dam. 1 H318" }]
  });

  assert.strictEqual(audit.isCompliant, true);
  assert(audit.auditLog.length >= 3, `Oczekiwano co najmniej 3 auto-remediacji, otrzymano: ${audit.auditLog.length}`);
  
  // Sprawdzenie czy audytor naprawił oczy w sekcji 8
  assert(audit.validatedSections.section_8.content.includes("PN-EN 166"), "Audytor nie wymusił normy PN-EN 166 dla uszkodzenia oczu H318!");
  
  // Sprawdzenie czy audytor usunął sprzeczność ED w sekcji 2.3
  assert(audit.validatedSections.section_2.content.includes("Substancje zaburzające funkcjonowanie układu hormonalnego: Produkt zawiera galaksolid"), "Audytor nie skorygował Sekcji 2.3!");

  // Sprawdzenie czy audytor usunął detergenty z sekcji 15 dla farby
  assert(!audit.validatedSections.section_15.content.includes("Rozporządzenie (WE) nr 648/2004"), "Audytor nie usunął ustawy o detergentach z farby!");

  console.log("-> TEST 7 PASSED: Agent Audytor natychmiast wykrył i naprawił wszystkie niespójności regulacyjne.");
  console.log("\n========================================================");
  console.log("WSZYSTKIE 7 TESTÓW ZGODNOŚCI REGULACYJNEJ ZAKOŃCZONE SUKCESEM!");
  console.log("========================================================");
})();
