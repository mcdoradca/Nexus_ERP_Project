const assert = require('assert');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { SDSSchemaValidator, SDSSchemaValidationError } = require('../src/modules/sds/sds.schema.validator');
const { 
  SDSProcessorEngine, 
  NDSRegistry, 
  WasteRegistry, 
  ADRRegistry 
} = require('../src/modules/sds/sds.service');

console.log("=== ROZPOCZYNAM TESTY JEDNOSTKOWE I REGULACYJNE DLA SDSSchemaValidator ===");

// 1. Inicjalizacja baz referencyjnych
const ndsPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'nds_database_2018.json');
NDSRegistry.loadRegistry(ndsPath);
const adrPath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'adr_transport_pl.json');
ADRRegistry.loadRegistry(adrPath);
const wastePath = path.join(__dirname, '..', 'src', 'modules', 'sds', 'rag_knowledge', 'waste_codes_pl.json');
WasteRegistry.loadRegistry(wastePath);

function testValidateTranslatedSections() {
  console.log("\n[TEST 1] Poprawny payload sekcji przetłumaczonych przechodzi walidację...");
  const validTranslated = {
    section_1_2: "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane\nZastosowanie: Odświeżacz powietrza.\nZastosowania odradzane: Nie określono.",
    section_5: "5.1. Środki gaśnicze\nOdpowiednie środki gaśnicze: piana, proszek gaśniczy, dwutlenek węgla.",
    section_6: "6.1. Indywidualne środki ostrożności: usunąć źródła zapłonu.",
    section_7: "7.1. Środki ostrożności dotyczące bezpiecznego postępowania: stosować w wentylowanych pomieszczeniach.",
    section_10: "10.1. Reaktywność: brak szczególnych zagrożeń.",
    section_11: "11.1. Informacje na temat klas zagrożenia\nToksyczność ostra: Etanol: LD50 (doustnie): 10470 mg/kg (szczur).\n\n11.2. Informacje o innych zagrożeniach\nWłaściwości zaburzające funkcjonowanie układu hormonalnego: Substancje nie zostały zidentyfikowane jako zaburzające gospodarkę hormonalną."
  };

  assert.doesNotThrow(() => {
    SDSSchemaValidator.validateTranslatedSections(validTranslated);
  }, "Poprawny obiekt sekcji powinien przejść walidację bez błędu!");
  console.log("-> TEST 1 ZDANY: Poprawny obiekt zaakceptowany.");

  console.log("\n[TEST 2] Brak wymaganej sekcji narracyjnej (np. section_5) rzuca błąd asercji...");
  const missingSection = { ...validTranslated };
  delete missingSection.section_5;
  assert.throws(() => {
    SDSSchemaValidator.validateTranslatedSections(missingSection);
  }, SDSSchemaValidationError, "Brak section_5 powinien rzucić SDSSchemaValidationError!");
  console.log("-> TEST 2 ZDANY: Wykryto brakujące sekcje narracyjne.");

  console.log("\n[TEST 3] Brak obligatoryjnej podsekcji 11.2 (UE 2020/878) rzuca błąd asercji...");
  const missing11_2 = {
    ...validTranslated,
    section_11: "11.1. Informacje na temat klas zagrożenia\nToksyczność ostra: Etanol: LD50 (doustnie): 10470 mg/kg (szczur)."
  };
  assert.throws(() => {
    SDSSchemaValidator.validateTranslatedSections(missing11_2);
  }, /11\.2/, "Brak podsekcji 11.2 musi wywołać błąd asercji!");
  console.log("-> TEST 3 ZDANY: Wykryto brak podsekcji 11.2.");

  console.log("\n[TEST 4] Surowy błąd laboratoryjny (np. 'Pimephales promelas') przechodzi walidację struktury (KROK 2b)...");
  const rawPayloadWithBioError = {
    ...validTranslated,
    section_11: "11.1. Informacje na temat klas zagrożenia\nLC50 (Inhalation vapours): 120 mg/l/4h Pimephales promelas\n11.2. Informacje o innych zagrożeniach\nBrak."
  };
  assert.doesNotThrow(() => {
    SDSSchemaValidator.validateTranslatedSections(rawPayloadWithBioError);
  }, "Błąd laboratoryjny producenta w surowym tekście nie powinien blokować struktury na etapie KROK 2b!");
  console.log("-> TEST 4 ZDANY: Struktura surowego tekstu zaakceptowana do dalszej auto-remediacji.");
}

async function testValidateFinalSds() {
  console.log("\n[TEST 5] Pełna weryfikacja zintegrowanego modelu SDS na realnym pliku PDF...");
  const pdfFilePath = path.join(__dirname, '..', 'docs', 'SDS', '8034055535431_SDS_TALCO (1).pdf');
  const docxFilePath = path.join(__dirname, '..', 'docs', 'SDS', '8034055535424_SDS_SANDALO org.docx');
  const testFile = fs.existsSync(docxFilePath) ? docxFilePath : pdfFilePath;
  assert(fs.existsSync(testFile), "Brak pliku testowego SDS (DOCX/PDF): " + testFile);

  const engine = new SDSProcessorEngine();
  const agentPayload = await engine.prepareAgentPayload(testFile, "SWEET HOME - PROFUMATORE AMBIENTE SANDALO");

  const agentTranslated = {
    section_1_2: "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane\nZastosowanie: Odświeżacz powietrza.\nZastosowania odradzane: Brak.",
    section_5: "5.1. Środki gaśnicze\nOdpowiednie środki gaśnicze: piana gaśnicza, proszek gaśniczy, dwutlenek węgla.",
    section_6: "6.1. Indywidualne środki ostrożności: usunąć wszelkie źródła zapłonu.",
    section_7: "7.1. Środki ostrożności dotyczące bezpiecznego postępowania: unikać kontaktu z oczami i skórą.",
    section_10: "10.1. Reaktywność: brak szczególnych zagrożeń.",
    section_11: "11.1. Informacje na temat klas zagrożenia\nToksyczność ostra:\nETANOL: LD50 (droga pokarmowa (doustnie)): > 5000 mg/kg (szczur).\n\n11.2. Informacje o innych zagrożeniach\nWłaściwości zaburzające funkcjonowanie układu hormonalnego: Brak danych wskazujących na obecność substancji zaburzających gospodarkę hormonalną."
  };

  const finalData = engine.mergeCompletedSds(agentPayload, agentTranslated);

  assert.doesNotThrow(() => {
    SDSSchemaValidator.validateFinalSds(finalData);
  }, "Model zmontowany z realnego PDF musi przejść pełną walidację prawną!");
  console.log("-> TEST 5 ZDANY: Model SDS z realnego pliku przeszedł pełną asercję jakościową.");

  console.log("\n[TEST 6] Całkowity brak zwrotów P w sklasyfikowanej Sekcji 2.2 rzuca błąd asercji...");
  const invalidPData = JSON.parse(JSON.stringify(finalData));
  invalidPData.sections.section_2.content = invalidPData.sections.section_2.content.replace(/\bP\d{3}(?:\+P\d{3})*[^\n]*/g, '');
  assert.throws(() => {
    SDSSchemaValidator.validateFinalSds(invalidPData);
  }, /nie zawiera zwrotów wskazujących środki ostrożności/, "Brak zwrotów P w karcie z zagrożeniami musi rzucić błąd asercji!");
  console.log("-> TEST 6 ZDANY: Zablokowano brak zwrotów P w sklasyfikowanej Sekcji 2.2.");

  console.log("\n[TEST 7] Obecność 'Pimephales promelas' w karcie końcowej (brak naprawy) rzuca błąd asercji...");
  const unhealedData = JSON.parse(JSON.stringify(finalData));
  unhealedData.sections.section_11.content += "\nLC50: 120 mg/l/4h Pimephales promelas";
  assert.throws(() => {
    SDSSchemaValidator.validateFinalSds(unhealedData);
  }, /Pimephales promelas/, "Nienaprawiony błąd Pimephales promelas w karcie końcowej musi rzucić błąd asercji!");
  console.log("-> TEST 7 ZDANY: Zablokowano błąd laboratoryjny w karcie końcowej.");
}

async function run() {
  testValidateTranslatedSections();
  await testValidateFinalSds();
  console.log("\n========================================================");
  console.log("WSZYSTKIE TESTY SDSSchemaValidator ZAKOŃCZONE SUKCESEM!");
  console.log("========================================================");
}

run().catch(err => {
  console.error("BŁĄD TESTU:", err);
  process.exit(1);
});
