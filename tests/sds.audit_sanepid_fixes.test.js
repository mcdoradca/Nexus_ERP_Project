const assert = require('assert');
const path = require('path');
const { 
  SDSProcessorEngine, 
  SDSChemicalExtractor, 
  NDSRegistry, 
  ADRRegistry, 
  WasteRegistry, 
  EcotoxRegistry 
} = require('../src/modules/sds/sds.service');

console.log("=== ROZPOCZYNAM AUDYT TESTOWY POPRAWEK SANEPID / PIP (METHANOL, S9.1, LQ) ===");

// Inicjalizacja baz referencyjnych
const ndsPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'nds_database_2018.json');
NDSRegistry.loadRegistry(ndsPath);
const adrPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'adr_transport_pl.json');
ADRRegistry.loadRegistry(adrPath);
const wastePath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'waste_codes_pl.json');
WasteRegistry.loadRegistry(wastePath);
const ecotoxPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'ecotox_cache.json');
EcotoxRegistry.loadRegistry(ecotoxPath);

const engine = new SDSProcessorEngine();

// TEST 1: Parsowanie LIMS w Sekcji 3.2 z metanolem (INDEX 603-001-00-X) oraz brak wycieków
console.log("\n[TEST 1] Sekcja 3.2: Prawidłowe parsowanie metanolu (INDEX z literą X) i brak zanieczyszczeń...");
const rawLimsText = `
Identificationx = Conc. %Classification (EC) 1272/2008 (CLP)
ETHANOL
INDEX   603-002-00-550 ≤ x <  70 Flam. Liq. 2 H225, Eye Irrit. 2 H319
EC   200-578-6
CAS   64-17-5
Specific Concentration Limits:
>= 50%: Eye Irrit. 2 H319
BENZYL SALICYLATE
INDEX   607-754-00-50,1 ≤ x <  0,25 Skin Sens. 1B H317
EC   204-262-9
CAS   118-58-1
ACETONE
INDEX   606-001-00-80,1 ≤ x <  0,5 Flam. Liq. 2 H225, Eye Irrit. 2 H319, STOT SE 3 H336
EC   200-662-2
CAS   67-64-1
EUH066
Dated 05/12/2024 Suarez Company Replaced revision: 1
METHANOL
INDEX   603-001-00-X0 < x <  0,05 Flam. Liq. 2 H225
EC   200-659-6
CAS   67-56-1
Acute Tox. 3 H301, Acute Tox. 3 H311, Acute Tox. 3 H331, STOT SE 1 H370
STOT SE 2 H371: >= 3% - < 10%
ATE Oral: 100 mg/kg
ATE Dermal: 300 mg/kg
ATE Inhalation vapours: 3 mg/l
`;

const components = SDSChemicalExtractor.parseSection3Components(rawLimsText, {});
assert(components && components.length >= 4, `Oczekiwano co najmniej 4 składników, otrzymano: ${components.length}`);

const methanol = components.find(c => c.cas === '67-56-1');
assert(methanol, "BŁĄD KRYTYCZNY: Metanol (CAS 67-56-1) nie został wyekstrahowany z tabeli składników!");
assert.strictEqual(methanol.name, "metanol", `Błędna nazwa metanolu: ${methanol.name}`);
assert.strictEqual(methanol.index, "603-001-00-X", `Błędny numer indeksowy metanolu: ${methanol.index}`);
assert(methanol.classification.includes("H301"), "Brak H301 w klasyfikacji metanolu!");
assert(methanol.classification.includes("H370"), "Brak H370 w klasyfikacji metanolu!");
assert(methanol.classification.includes("ATE (droga pokarmowa) = 100 mg/kg"), "Brak ATE doustnego w metanolu!");
assert(methanol.classification.includes("ATE (inhalacyjnie, pary) = 3 mg/l"), `Brak sformatowanego ATE inhalacyjnego w metanolu: ${methanol.classification}`);
console.log("-> Metanol wyekstrahowany prawidłowo ze wszystkimi parametrami toksyczności i ATE.");

const acetone = components.find(c => c.cas === '67-64-1');
assert(acetone, "Nie znaleziono acetonu!");
assert(!acetone.classification.includes("Dated"), `BŁĄD: Do wiersza acetonu wyciekł nagłówek daty: ${acetone.classification}`);
assert(!acetone.classification.includes("H301"), `BŁĄD: Do wiersza acetonu wyciekła klasyfikacja metanolu H301: ${acetone.classification}`);
assert(!acetone.classification.includes("H370"), `BŁĄD: Do wiersza acetonu wyciekło H370: ${acetone.classification}`);
assert(!acetone.classification.includes("Suarez"), `BŁĄD: Do wiersza acetonu wyciekł nagłówek producenta: ${acetone.classification}`);
console.log("-> Wiersz acetonu wolny od zanieczyszczeń nagłówkami i danymi metanolu.");

const ethanol = components.find(c => c.cas === '64-17-5');
assert(ethanol, "Nie znaleziono etanolu!");
assert(!ethanol.classification.toLowerCase().includes("benzyl salicylate"), `BŁĄD: Do klasyfikacji etanolu wyciekła nazwa kolejnego składnika: ${ethanol.classification}`);
console.log("-> Wiersz etanolu wolny od wycieku nazwy benzyl salicylate.");

// TEST 2: Sekcja 8.1 - Limity NDS dla metanolu
console.log("\n[TEST 2] Sekcja 8.1: Weryfikacja polskich limitów NDS dla metanolu (CAS 67-56-1)...");
const s8Result = engine.processSection8("", components, "");
assert(s8Result.includes("67-56-1"), "BŁĄD: W sekcji 8.1 brak metanolu CAS 67-56-1!");
assert(s8Result.includes("NDS: 100 mg/m³"), "BŁĄD: W sekcji 8.1 brak NDS: 100 mg/m³ dla metanolu!");
assert(s8Result.includes("NDSCh: 300 mg/m³"), "BŁĄD: W sekcji 8.1 brak NDSCh: 300 mg/m³ dla metanolu!");
assert(s8Result.includes("skóra"), "BŁĄD: W sekcji 8.1 brak adnotacji 'skóra' dla metanolu!");
console.log("-> TEST 2 ZDANY: Polskie limity NDS, NDSCh i notacja 'skóra' dla metanolu obecne.");

// TEST 3: Sekcja 9.1 - Zgodność z Załącznikiem II REACH (UE 2020/878)
console.log("\n[TEST 3] Sekcja 9.1: Prawidłowa kwalifikacja brak danych / nie oznaczono / nie dotyczy...");
assert.strictEqual(SDSProcessorEngine.normalizePhysChemValue("not available", "density"), "Brak danych");
assert.strictEqual(SDSProcessorEngine.normalizePhysChemValue("non disponibile", "viscosity"), "Brak danych");
assert.strictEqual(SDSProcessorEngine.normalizePhysChemValue("not applicable", "density"), "Brak danych");
assert.strictEqual(SDSProcessorEngine.normalizePhysChemValue("not applicable", "viscosity"), "Brak danych");
assert.strictEqual(SDSProcessorEngine.normalizePhysChemValue("not determined", "viscosity"), "Nie oznaczono");
assert.strictEqual(SDSProcessorEngine.normalizePhysChemValue("non determinato", "melting"), "Nie oznaczono");
assert.strictEqual(SDSProcessorEngine.normalizePhysChemValue("not applicable", "particle_characteristics"), "Nie dotyczy (produkt płynny)");

const s9Out = engine.processSection9(`
Physical state: liquid
Colour: colourless
Odour: characteristic
Density and/or relative density: not available
Kinematic viscosity: not determined
Particle size: not applicable
`, components);

assert(s9Out.includes("Gęstość lub gęstość względna: Brak danych"), `BŁĄD: Błędna wartość gęstości w sekcji 9.1:\n${s9Out}`);
assert(s9Out.includes("Lepkość kinematyczna: Nie oznaczono"), `BŁĄD: Błędna wartość lepkości w sekcji 9.1:\n${s9Out}`);
assert(s9Out.includes("Charakterystyka cząsteczek: Nie dotyczy (produkt płynny)"), `BŁĄD: Błędna wartość cząsteczek w sekcji 9.1:\n${s9Out}`);
console.log("-> TEST 3 ZDANY: Parametry fizykochemiczne w 100% zgodne z Załącznikiem II REACH (UE 2020/878).");

// TEST 4: Sekcja 14.6 - Scalanie jednostki LQ i brak oderwanego akapitu 'L'
console.log("\n[TEST 4] Sekcja 14.6: Scalanie jednostki '1 L' dla ilości ograniczonych (LQ)...");
const rawSec14WithBrokenLq = `
14.1. UN number: UN 1266
14.2. Proper shipping name: PERFUMERY PRODUCTS
14.3. Class: 3
14.4. Packing group: II
14.6. Special precautions for user:
Limited Quantities: 1
L
Tunnel restriction code: (D/E)
`;
const s14Out = engine.processSection14(rawSec14WithBrokenLq);
assert(s14Out.includes("Ilości ograniczone (LQ): 1 L"), `BŁĄD: Jednostka LQ nie została scalona: ${s14Out}`);
assert(!s14Out.includes("Ilości ograniczone (LQ): 1\n"), `BŁĄD: Została sama cyfra 1 w linii LQ: ${s14Out}`);
console.log("-> TEST 4 ZDANY: Ilości ograniczone (LQ) poprawnie sformatowane jako '1 L'.");

// TEST 5: Sekcja 10 - Korekta literówki 'srebreem' -> 'srebrem'
console.log("\n[TEST 5] Sekcja 10: Usunięcie literówki 'srebreem'...");
const cleanedArtifact = SDSProcessorEngine.cleanPdfArtifacts("Nie mieszać z kwasami, zasadami oraz srebreem.");
assert.strictEqual(cleanedArtifact, "Nie mieszać z kwasami, zasadami oraz srebrem.");
console.log("-> TEST 5 ZDANY: Literówka 'srebreem' skorygowana do 'srebrem'.");

console.log("\n=== WSZYSTKIE TESTY AUDYTU SANEPID / PIP ZAKOŃCZONE SUKCESEM ===");
