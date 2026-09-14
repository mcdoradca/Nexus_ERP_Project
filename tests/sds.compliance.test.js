const assert = require('assert');
const path = require('path');
const { 
  SDSProcessorEngine, 
  SDSChemicalExtractor, 
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

// TEST 1: Sekcja 3.2 - Prawidłowe parsowanie stężeń rozbitych na linie (brak wycieku stężenia do klasyfikacji)
console.log("\n[TEST 1] Weryfikacja podziału stężeń w Sekcji 3.2 (rozbite linie)...");
const rawSec3MultiLine = `
≥0.1-<0.25 %benzyl salicylateCAS:118-58-1
EC:204-262-9
Skin Sens. 1B, H31701-2119969442-31-XXXX
≥0.00015%-
<0.0015%reaction mass of 5-chloro-2-methyl-2H-isothiazol-3-one and 2-methyl-2H-isothiazol-3-one (3:1)
CAS:55965-84-9
EC:911-418-6
Acute Tox. 2, H330
`;
const sec3Components = SDSChemicalExtractor.parseSection3Components(rawSec3MultiLine, {});
assert.strictEqual(sec3Components.length, 2, "Powinno wyekstrahować dokładnie 2 składniki!");
const benzyl = sec3Components.find(c => c.cas === '118-58-1');
const cmi = sec3Components.find(c => c.cas === '55965-84-9');
assert(benzyl, "Nie znaleziono salicylanu benzylu!");
assert(cmi, "Nie znaleziono C(M)IT/MIT!");
assert(!benzyl.classification.includes("0.00015"), `BŁĄD: Do klasyfikacji salicylanu benzylu wyciekło stężenie kolejnego składnika: ${benzyl.classification}`);
assert(cmi.concentration.includes("0,00015"), `BŁĄD: Dolny próg stężenia C(M)IT/MIT został obcięty: ${cmi.concentration}`);
console.log(`-> TEST 1 PASSED: Salicylan klasyfikacja='${benzyl.classification}', C(M)IT/MIT stężenie='${cmi.concentration}'.`);

// TEST 1B: Sekcja 3.2 - Prawidłowe parsowanie SCL ze złamanymi liniami kodów H (brak osieroconych H315/H319)
console.log("\n[TEST 1B] Weryfikacja integralności SCL i scalania osieroconych kodów H...");
const rawSec3Scl = `
≥0.00015%-<0.0015%reaction mass of 5-chloro-2-methyl-2H-isothiazol-3-one and 2-methyl-2H-isothiazol-3-one (3:1)
CAS: 55965-84-9
Index: 613-167-00-5
Acute Tox. 2 H330
Specific Concentration Limits:
C >= 0.6%: Skin Corr. 1C H314
0.06% <= C < 0.6%: Skin Irrit. 2
H315
C >= 0.6%: Eye Dam. 1 H318
0.06% <= C < 0.6%: Eye Irrit. 2
H319
C >= 0.0015%: Skin Sens. 1A H317
M-Chronic: 100
M-Acute: 100
`;
const sec3SclComps = SDSChemicalExtractor.parseSection3Components(rawSec3Scl, {});
const cmiScl = sec3SclComps.find(c => c.cas === '55965-84-9');
assert(cmiScl, "Nie znaleziono C(M)IT/MIT w teście SCL!");
assert(cmiScl.classification.includes("0,06% ≤ C < 0,6%") && cmiScl.classification.includes("H315"), `BŁĄD: Wykasowano przedział SCL dla H315: ${cmiScl.classification}`);
assert(cmiScl.classification.includes("0,06% ≤ C < 0,6%") && cmiScl.classification.includes("H319"), `BŁĄD: Wykasowano przedział SCL dla H319: ${cmiScl.classification}`);
assert(!/\n\s*H315\s*(?:\n|$)/.test(cmiScl.classification), `BŁĄD: Kod H315 pozostał osierocony na osobnej linii: ${cmiScl.classification}`);
assert(!/\n\s*H319\s*(?:\n|$)/.test(cmiScl.classification), `BŁĄD: Kod H319 pozostał osierocony na osobnej linii: ${cmiScl.classification}`);
console.log("-> TEST 1B PASSED: SCL zachowało wszystkie przedziały stężeń i połączyło osierocone kody H.");

// TEST 2: Sekcja 8.1 - Zgodność z nowelizacją Dz.U. 2024 poz. 1017 (CAS 55965-84-9: NDS 0,2 mg/m³, NDSCh 0,4 mg/m³, skóra)
console.log("\n[TEST 2] Weryfikacja normatywów NDS dla CAS 55965-84-9 (Dz.U. 2024 poz. 1017)...");
const s8WithCmi = engine.processSection8("", [
  { cas: "55965-84-9", name: "masa poreakcyjna C(M)IT/MIT" }
], "Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie.");
assert(s8WithCmi.includes("55965-84-9"), "Brak CAS 55965-84-9 w sekcji 8.1!");
assert(s8WithCmi.includes("0,2 mg/m³"), "Brak wartości NDS 0,2 mg/m³ dla CAS 55965-84-9!");
assert(s8WithCmi.includes("0,4 mg/m³"), "Brak wartości NDSCh 0,4 mg/m³ dla CAS 55965-84-9!");
assert(s8WithCmi.includes("skóra"), "Brak adnotacji 'skóra' dla CAS 55965-84-9!");
assert(s8WithCmi.includes("Dz.U. 2024 poz. 1017"), "Brak powołania nowelizacji Dz.U. 2024 poz. 1017!");
console.log("-> TEST 2 PASSED: Baza i Sekcja 8.1 poprawnie serwują normy z Dz.U. 2024 poz. 1017.");

// TEST 3: Sekcja 8.2 - Proporcjonalność ŚOI (konsumenckie vs przemysłowe/awaryjne)
console.log("\n[TEST 3] Weryfikacja proporcjonalności ŚOI w Sekcji 8.2...");
const s8NonHazardous = engine.processSection8("", [
  { cas: "55965-84-9", name: "masa poreakcyjna C(M)IT/MIT", classification: "Skin Corr. 1C H314; Eye Dam. 1 H318" }
], "Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie zgodnie z rozporządzeniem (WE) nr 1272/2008 [CLP].");
assert(s8NonHazardous.includes("W normalnych warunkach stosowania konsumenckiego: środki ochrony oczu nie są wymagane"), "Brak rozróżnienia stosowania konsumenckiego dla produktu niesklasyfikowanego!");
assert(s8NonHazardous.includes("W warunkach przemysłowych, przeładunku hurtowego lub usuwania awarii zaleca się stosowanie okularów ochronnych zgodnych z normą PN-EN 166"), "Brak zaleceń przemysłowych PN-EN 166!");
assert(s8NonHazardous.includes("ochrona rąk nie jest wymagana"), "Brak informacji o braku wymogu rękawic konsumenckich!");
console.log("-> TEST 3 PASSED: ŚOI rozróżniają bezpieczne stosowanie konsumenckie od warunków przemysłowych/awaryjnych.");

// TEST 4: Sekcja 11 - Sanityzacja hierarchii (przeniesienie 11.2 za punkty h, i, j)
console.log("\n[TEST 4] Weryfikacja hierarchii podsekcji 11.1 a-j vs 11.2...");
const rawBroken11 = `
11.1. Informacje na temat klas zagrożenia
a) toksyczność ostra: Nie dotyczy
g) szkodliwe działanie na rozrodczość: Nie dotyczy

11.2. Informacje o innych zagrożeniach
Właściwości zaburzające funkcjonowanie układu hormonalnego: Brak danych

h) STOT - jednorazowe: Nie dotyczy
i) STOT - powtarzane: Nie dotyczy
j) zagrożenie spowodowane aspiracją: Nie dotyczy
`;
const sanitized11 = SDSProcessorEngine.sanitizeSection11Hierarchy(rawBroken11);
const idxH = sanitized11.indexOf("h) STOT");
const idxI = sanitized11.indexOf("i) STOT");
const idxJ = sanitized11.indexOf("j) zagrożenie");
const idx11_2 = sanitized11.indexOf("11.2. Informacje o innych zagrożeniach");
assert(idxH !== -1 && idxI !== -1 && idxJ !== -1 && idx11_2 !== -1, "Nie znaleziono wszystkich nagłówków w 11!");
assert(idx11_2 > idxJ, `BŁĄD: Nagłówek 11.2 (idx=${idx11_2}) znajduje się przed punktem j) (idx=${idxJ})!`);
console.log("-> TEST 4 PASSED: Nagłówek 11.2 został przeniesiony pod obligatoryjny punkt j).");

// TEST 5: Sekcja 12.3 - Ekstrakcja bioakumulacji (salicylan benzylu BCF = 311 i CMI/MI)
console.log("\n[TEST 5] Weryfikacja ekstrakcji bioakumulacji w Sekcji 12.3...");
const rawSec12Bio = `
12.1. Toxicity
12.2. Persistence and degradability
12.3. Bioaccumulative potential
benzyl salicylate: Bioaccumulative, BCF = 311
reaction mass of 5-chloro-2-methyl-2H-isothiazol-3-one and 2-methyl-2H-isothiazol-3-one (3:1)
CAS: 55965-84-9
Test: BCF - Bioconcentrantion factor; Value: = 3.16
Test: Log Kow - partition coefficient; Value: <= 0.71
12.4. Mobility in soil
12.5. Results of PBT
12.6 Endocrine disrupting properties
No substances
12.7 Other adverse effects
`;
const s12BioResult = engine.processSection12(rawSec12Bio, [
  { cas: "118-58-1", name: "salicylan benzylu", originalName: "benzyl salicylate" },
  { cas: "55965-84-9", name: "masa poreakcyjna C(M)IT/MIT", originalName: "reaction mass of 5-chloro-2-methyl-2H-isothiazol-3-one and 2-methyl-2H-isothiazol-3-one (3:1)" }
]);
assert(s12BioResult.content.includes("salicylan benzylu"), "Brak salicylanu benzylu w sekcji 12.3!");
assert(s12BioResult.content.includes("311"), "Brak wartości BCF 311 dla salicylanu benzylu!");
assert(s12BioResult.content.includes("3,16"), "Brak BCF 3,16 dla C(M)IT/MIT!");
console.log("-> TEST 5 PASSED: Dane o bioakumulacji dla wszystkich składników zostały bezbłędnie wyekstrahowane.");

// TEST 5B: Sekcja 12.3 - Ekstrakcja bioakumulacji przy zbitych nagłówkach i inline CAS (realistyczny PDF)
console.log("\n[TEST 5B] Weryfikacja ekstrakcji bioakumulacji przy zbitych nagłówkach i inline CAS...");
const rawSec12Clumped = `
12.1. Toxicity
12.2. Persistence and degradability
12.3. Bioaccumulative potential
12.4. Mobility in soil
12.5. Results of PBT and vPvB assessment
12.6. Endocrine disrupting properties
List of Eco-Toxicological properties of the components
benzyl salicylate (CAS: 118-58-1): Bioaccumulative; Test: BCF Bioconcentration factor, Wartość: = 311
reaction mass of 5-chloro-2-methyl-2H-isothiazol-3-one and 2-methyl-2H-isothiazol-3-one (3:1) (CAS: 55965-84-9)
Test: BCF - Bioconcentrantion factor; Value: = 3.16
Test: Log Kow - partition coefficient; Value: <= 0.71
No PBT or vPvB
`;
const s12ClumpedResult = engine.processSection12(rawSec12Clumped, [
  { cas: "118-58-1", name: "salicylan benzylu", originalName: "benzyl salicylate" },
  { cas: "55965-84-9", name: "masa poreakcyjna C(M)IT/MIT", originalName: "reaction mass of 5-chloro-2-methyl-2H-isothiazol-3-one and 2-methyl-2H-isothiazol-3-one (3:1)" }
]);
assert(s12ClumpedResult.content.includes("salicylan benzylu"), "Brak salicylanu benzylu w sekcji 12.3 przy zbitych nagłówkach!");
assert(s12ClumpedResult.content.includes("311"), "Brak wartości BCF 311 dla salicylanu benzylu przy zbitych nagłówkach!");
assert(s12ClumpedResult.content.includes("wykazuje zdolność do bioakumulacji (Bioaccumulative)"), "Brak deklaracji zdolności do bioakumulacji (Bioaccumulative)!");
assert(s12ClumpedResult.content.includes("3,16"), "Brak BCF 3,16 dla C(M)IT/MIT!");
assert(s12ClumpedResult.content.includes("0,71"), "Brak log Kow 0,71 dla C(M)IT/MIT!");
console.log("-> TEST 5B PASSED: Zbite nagłówki i inline CAS w Sekcji 12.3 zostały bezbłędnie rozdzielone i przetworzone.");

// TEST 6: Sekcja 13 - Kody odpadów (brak gwiazdki * dla produktów niesklasyfikowanych)
console.log("\n[TEST 6] Weryfikacja kodów odpadów dla mieszaniny niesklasyfikowanej...");
const s13NonHaz = engine.processSection13("Detergent do tkanin i prania", [
  { cas: "55965-84-9", name: "masa poreakcyjna C(M)IT/MIT", classification: "Acute Tox. 2 H330; Skin Corr. 1C H314" }
], "Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie.", "SWEET HOME LAYALI");
assert(!s13NonHaz.includes("20 01 29*"), "BŁĄD KRYTYCZNY: Produkt niezaklasyfikowany otrzymał kod odpadu niebezpiecznego 20 01 29*!");
assert(s13NonHaz.includes("20 01 30"), "Produkt niesklasyfikowany powinien otrzymać kod konsumencki 20 01 30!");
assert(!s13NonHaz.includes("07 06 04*"), "BŁĄD: Produkt niesklasyfikowany otrzymał kod odpadu przemysłowego 07 06 04*!");
assert(s13NonHaz.includes("07 06 99") || s13NonHaz.includes("16 03 06"), "Produkt powinien otrzymać kod odpadu innego niż niebezpieczny!");
console.log("-> TEST 6 PASSED: Kody odpadów są czyste od gwiazdek (*) dla produktu niezaklasyfikowanego.");

// TEST 7: Agent Audytor Prawno-Chemiczny (SDSVerifierAgent) - Auto-remediacja
console.log("\n[TEST 7] Weryfikacja działania Agenta Audytora Prawno-Chemicznego (SDSVerifierAgent)...");
(async () => {
  const mockSections = {
    section_1: { content: "Nazwa handlowa: SWEET HOME LAYALI\nZastosowanie konsumenckie: perfumy do tkanin" },
    section_2: { content: "2.1. Klasyfikacja\nMieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie.\n\n2.3. Inne zagrożenia\nProdukt nie zawiera składników wpisanych do wykazu ustanowionego zgodnie z art. 59..." },
    section_8: { content: "8.1. Parametry dotyczące kontroli\nKrajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Polska):\nDla składników mieszaniny wymienionych w sekcji 3 nie określono wartości najwyższych dopuszczalnych stężeń...\n\n8.2. Kontrola narażenia\nOchrona oczu: Nosić okulary ochronne w szczelnej obudowie lub gogle ochronne zgodne z normą PN-EN 166." },
    section_11: { content: "11.1. Klasy\na) ostra: brak\n\n11.2. Informacje o innych zagrożeniach\nBrak danych\n\nh) STOT: brak\ni) STOT powtarzane: brak\nj) zagrożenie spowodowane aspiracją: brak" },
    section_12: { content: "12.3. Zdolność do bioakumulacji\nBrak dostępnych badań dotyczących bioakumulacji dla mieszaniny.\n\n12.6. Właściwości zaburzające funkcjonowanie układu hormonalnego\nSubstancje zaburzające funkcjonowanie układu hormonalnego w odniesieniu do środowiska:\ngalaksolid (CAS: 1222-05-5): Wykaz II ECHA – substancja podlegająca ocenie..." },
    section_13: { content: "- Odpady z produktu (dla konsumentów / odpady komunalne): 20 01 29* (Detergenty zawierające substancje niebezpieczne)." },
    section_15: { content: "- Rozporządzenie (WE) nr 648/2004 w sprawie detergentów.\n- Dyrektywa Parlamentu Europejskiego i Rady 2012/18/UE (Seveso III): Mieszanina nie podlega przepisom dyrektywy – brak substancji w ilościach progowych." }
  };

  const audit = await SDSVerifierAgent.verifyAndAudit(mockSections, {
    productName: "SWEET HOME LAYALI",
    components: [
      { cas: "55965-84-9", name: "C(M)IT/MIT" },
      { cas: "1222-05-5", name: "galaksolid" },
      { cas: "118-58-1", name: "salicylan benzylu" }
    ]
  });

  assert.strictEqual(audit.isCompliant, true);
  assert(audit.auditLog.length >= 5, `Oczekiwano co najmniej 5 wpisów audytu, otrzymano: ${audit.auditLog.length}`);
  
  // 1. Sprawdzenie korekty ŚOI
  assert(audit.validatedSections.section_8.content.includes("W normalnych warunkach stosowania konsumenckiego: środki ochrony oczu nie są wymagane"), "Audytor nie skorygował nadgorliwych ŚOI!");
  
  // 2. Sprawdzenie uzupełnienia NDS dla CAS 55965-84-9
  assert(audit.validatedSections.section_8.content.includes("0,2 mg/m³"), "Audytor nie uzupełnił NDS 2024 dla CAS 55965-84-9!");
  
  // 3. Sprawdzenie korekty odpadów na 20 01 30
  assert(audit.validatedSections.section_13.content.includes("20 01 30"), "Audytor nie zamienił 20 01 29* na 20 01 30!");
  assert(!audit.validatedSections.section_13.content.includes("20 01 29*"), "Audytor pozostawił kod z gwiazdką 20 01 29*!");

  // 4. Sprawdzenie korekty hierarchii 11.2
  const idxS11_j = audit.validatedSections.section_11.content.indexOf("j) zagrożenie");
  const idxS11_112 = audit.validatedSections.section_11.content.indexOf("11.2. Informacje");
  assert(idxS11_112 > idxS11_j, "Audytor nie przeniósł nagłówka 11.2 pod punkt j!");

  // 5. Sprawdzenie auto-remediacji bioakumulacji dla CAS 118-58-1
  assert(audit.validatedSections.section_12.content.includes("118-58-1"), "Audytor nie uzupełnił CAS 118-58-1 w sekcji 12.3!");
  assert(audit.validatedSections.section_12.content.includes("wykazuje zdolność do bioakumulacji (Bioaccumulative)"), "Audytor nie wstawił urzędowej frazy bioakumulacji!");
  assert(audit.validatedSections.section_12.content.includes("BCF = 311"), "Audytor nie wstawił parametru BCF = 311!");

  console.log("-> TEST 7 PASSED: Agent Audytor natychmiast wykrył i naprawił wszystkie niespójności regulacyjne (w tym bioakumulację 12.3).");
  console.log("\n========================================================");
  console.log("WSZYSTKIE 7 TESTÓW ZGODNOŚCI REGULACYJNEJ ZAKOŃCZONE SUKCESEM!");
  console.log("========================================================");
})();
