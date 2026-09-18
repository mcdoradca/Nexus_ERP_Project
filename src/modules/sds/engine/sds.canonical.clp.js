/**
 * ARCHITEKTURA SDS NEXUS ERP - DETERMINISTYCZNY SŁOWNIK URZĘDOWY ECHA / CLP
 * Moduł źródła prawdy (Single Source of Truth) terminologii chemiczno-prawnej
 * Dane pobierane są dynamicznie z bazy w rag_knowledge (wspieranej przez Apify ECHA).
 */
const fs = require('fs');
const path = require('path');

let ssotData = {
  hPhrases: {},
  pPhrases: {},
  hazardClasses: {},
  testOrganisms: {},
  section9: []
};

const loadSsotData = () => {
  const ssotPath = path.join(__dirname, '..', 'rag_knowledge', 'euphrac_ssot.json');
  if (fs.existsSync(ssotPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(ssotPath, 'utf8'));
      ssotData.hPhrases = data.hPhrases || {};
      ssotData.pPhrases = data.pPhrases || {};
      ssotData.hazardClasses = data.hazardClasses || {};
      ssotData.testOrganisms = data.testOrganisms || {};
      ssotData.section9 = data.section9 || [];
      console.log(`[CanonicalCLP] Załadowano dynamiczne dane SSOT z pliku: ${ssotPath}`);
    } catch (err) {
      console.error(`[CanonicalCLP] Błąd odczytu pliku SSOT:`, err.message);
    }
  } else {
    console.warn(`[CanonicalCLP] Ostrzeżenie: Plik bazy SSOT (${ssotPath}) nie istnieje.`);
  }
};

// Inicjalizacja ładowania bazy przy uruchomieniu modułu
loadSsotData();

// Eksport załadowanych, dynamicznych struktur (zastępujących dotychczasowe hardkody)
module.exports = {
  get CANONICAL_H_PHRASES() { return ssotData.hPhrases; },
  get CANONICAL_P_PHRASES() { return ssotData.pPhrases; },
  get CANONICAL_CLP_CLASSES() { return ssotData.hazardClasses; },
  get CANONICAL_TEST_ORGANISMS() { return ssotData.testOrganisms; },
  get CANONICAL_SECTION_9_PARAMETERS() { return ssotData.section9; },
  reloadSsotData: loadSsotData
};
