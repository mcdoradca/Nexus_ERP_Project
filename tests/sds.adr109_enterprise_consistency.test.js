/**
 * TEST SUITE ADR-109: ENTERPRISE CROSS-SECTION CONSISTENCY & RECYDYWA ERADICATION
 * Weryfikacja 6 punktów audytu Sanepid/PIP oraz norm UE 2020/878 i WE 1272/2008 na karcie NAJMA DOCX
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const { CLPHarmonizedRegistry } = require('../src/modules/sds/engine/sds.clp.registry');
const { SDSConsistencyEngine } = require('../src/modules/sds/engine/sds.consistency.engine');
const { SDSEcoPhysParser } = require('../src/modules/sds/engine/sds.eco_phys.parser');
const { SDSProcessorEngine } = require('../src/modules/sds/sds.service');
const { SDSVerifierAgent } = require('../src/modules/sds/sds.verifier.agent');
const { SDSLinter } = require('../src/modules/sds/engine/sds.linter');

const NAJMA_DOCX = path.join(__dirname, '../docs/SDS/8051944811087_SDS_NAJMA_1to1_Konwertowany.docx');

function getTestEngine() {
  return new SDSProcessorEngine({
    companyName: 'ITALLUX Sp. z o.o.',
    address: 'ul. Wesoła 16',
    city: '63-600 Kępno',
    website: 'www.prostozwloch.com.pl',
    email: 'kontakt@prostozwloch.com.pl',
    phone: '+48 663116607',
    emergencyPhone: '+48 663116607'
  });
}

test('ADR-109 [PUNKT 1]: Ekstrakcja ekotoksyczności (Sekcja 12.1, 12.2, 12.3) z pliku DOCX', async () => {
  const engine = getTestEngine();
  const payload = await engine.prepareAgentPayload(NAJMA_DOCX, 'SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE NAJMA');
  
  assert.ok(payload.deterministicSections.section_12, 'Payload musi zawierać deterministicSections.section_12');
  const s12 = payload.deterministicSections.section_12.content;

  // 12.1 Badania dla octanu 4-tert-butylocykloheksylu
  assert.ok(s12.includes('5,3 mg/l') || s12.includes('5.3 mg/l'), 'Sekcja 12.1 musi zawierać EC50 Daphnia = 5,3 mg/l');
  assert.ok(s12.includes('22 mg/l'), 'Sekcja 12.1 musi zawierać EC50 Desmodesmus = 22 mg/l');
  assert.ok(s12.includes('8,6 mg/l') || s12.includes('8.6 mg/l'), 'Sekcja 12.1 musi zawierać LC50 Cyprinus carpio = 8,6 mg/l');
  assert.ok(s12.includes('6,8 mg/l') || s12.includes('6.8 mg/l'), 'Sekcja 12.1 musi zawierać NOEC = 6,8 mg/l');

  // 12.1 Metody OECD dla CMI/MIT
  assert.ok(s12.includes('OECD 201') || s12.includes('OECD 203'), 'Sekcja 12.1 musi zawierać metody OECD dla CMI/MIT');

  // 12.2 Biodegradacja
  assert.ok(s12.includes('trudno ulegająca biodegradacji') || s12.includes('trudno biodegradowaln') || s12.includes('nie jest łatwo biodegradowaln'), 'Sekcja 12.2 musi zawierać deklarację o trudnej biodegradacji octanu');
  assert.ok(s12.includes('OECD 301') || s12.includes('łatwo biodegradowaln'), 'Sekcja 12.2 musi zawierać dane o biodegradacji CMI/MIT');
  assert.ok(!s12.includes('Rozpuszczalność w wodzie:'), 'Sekcja 12.2 nie może zawierać parametru Rozpuszczalność w wodzie');

  // 12.3 Bioakumulacja
  assert.ok(s12.includes('Log Kow') || s12.includes('log Pow') || s12.includes('współczynnik podziału'), 'Sekcja 12.3 musi zawierać Log Kow');
  assert.ok(s12.includes('BCF') || s12.includes('współczynnik biokoncentracji'), 'Sekcja 12.3 musi zawierać wskaźnik BCF');
});

test('ADR-109 [PUNKT 2]: CLP Annex VI Harmonized Registry i eliminacja wycieków (ang. ...) w Sekcji 3', async () => {
  // Test rejestru zharmonizowanego
  CLPHarmonizedRegistry.loadRegistry();
  const cmiReg = CLPHarmonizedRegistry.getEntry('55965-84-9');
  assert.ok(cmiReg, 'CMI/MIT musi znajdować się w rejestrze zharmonizowanym CLP');
  assert.equal(cmiReg.m_acute, 100, 'CMI/MIT musi posiadać M-factor ostry = 100');
  assert.equal(cmiReg.m_chronic, 100, 'CMI/MIT musi posiadać M-factor przewlekły = 100');
  assert.ok(cmiReg.ate, 'CMI/MIT musi posiadać wartości ATE');
  assert.ok(cmiReg.scl, 'CMI/MIT musi posiadać specyficzne stężenia graniczne (SCL)');

  // Test wzbogacenia komponentu w payloadzie NAJMA
  const engine = getTestEngine();
  const payload = await engine.prepareAgentPayload(NAJMA_DOCX, 'SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE NAJMA');
  const cmiComp = payload.metadata.components.find(c => c.cas === '55965-84-9');
  assert.ok(cmiComp, 'Komponent CMI/MIT musi zostać wyekstrahowany');
  assert.ok(cmiComp.classification.includes('M (ostry) = 100'), 'CMI/MIT musi mieć uzupełniony M-ostry = 100');
  assert.ok(cmiComp.classification.includes('M (przewlekły) = 100'), 'CMI/MIT musi mieć uzupełniony M-przewlekły = 100');
  assert.ok(cmiComp.classification.includes('ATE'), 'CMI/MIT musi mieć zharmonizowane ATE');
  assert.ok(cmiComp.classification.includes('Specyficzne stężenia graniczne'), 'CMI/MIT musi mieć przetłumaczone SCL');

  // Weryfikacja braku wycieków (ang. ...) w nazwach i w sekcji 3
  payload.metadata.components.forEach(c => {
    assert.ok(!/\(ang\./i.test(c.name), `Nazwa składnika ${c.name} nie może zawierać wtrącenia (ang. ...)`);
  });
  const s3 = payload.deterministicSections.section_3.content;
  assert.ok(!/\(ang\./i.test(s3), 'Sekcja 3 nie może zawierać wycieków (ang. ...)');
});

test('ADR-109 [PUNKT 3]: Niedestrukcyjne parsowanie Sekcji 9.1 i 9.2 (gęstość, wrzenie, LZO)', async () => {
  const engine = getTestEngine();
  const payload = await engine.prepareAgentPayload(NAJMA_DOCX, 'SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE NAJMA');
  const s9 = payload.deterministicSections.section_9.content;

  // Gęstość nienaruszona
  assert.ok(s9.includes('1,00 g/ml ± 0,05') || s9.includes('1,00 g/ml'), 'Gęstość musi zachować precyzję pomiarową i tolerancję ± 0,05');
  assert.ok(s9.includes('20 °C') || s9.includes('20°C'), 'Gęstość musi zachować temperaturę odniesienia 20 °C');

  // Temperatura wrzenia
  assert.ok(s9.includes('100°C') || s9.includes('100 °C'), 'Temperatura wrzenia musi zachować wartość 100°C');

  // Cząstki dla cieczy
  assert.ok(s9.includes('Nie dotyczy (produkt płynny)'), 'Charakterystyka cząstek dla cieczy musi brzmieć "Nie dotyczy (produkt płynny)"');

  // LZO w 9.2
  assert.ok(s9.includes('LZO') || s9.includes('Lotne związki organiczne') || s9.includes('VOC'), 'Sekcja 9.2 musi deklarować LZO');
});

test('ADR-109 [PUNKT 4]: Wnioskowanie międzysekcyjne z pH (Sekcja 4.2/4.3 i Sekcja 10.5)', async () => {
  const engine = getTestEngine();
  const payload = await engine.prepareAgentPayload(NAJMA_DOCX, 'SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE NAJMA');
  
  // Sekcja 4: objawy kwasowe
  const s4 = payload.deterministicSections.section_4.content;
  assert.ok(s4.includes('kwasowy') || s4.includes('pH 2,0–3,0') || s4.includes('pH 2,5'), 'Sekcja 4.2 musi odzwierciedlać kwasowy charakter produktu');
  assert.ok(s4.includes('skórą') && s4.includes('oczami'), 'Sekcja 4.2 musi zawierać objawy dla skóry i oczu');

  // Sekcja 10.5: Materiały niezgodne dla kwasu
  const incomp = SDSConsistencyEngine.getSection10Incompatible('pH: 2,5');
  assert.ok(incomp.includes('Zasady'), 'Materiały niezgodne dla kwasu muszą zawierać zasady (reakcja neutralizacji)');
  assert.ok(incomp.includes('utleniacze'), 'Materiały niezgodne dla kwasu muszą zawierać silne utleniacze');
  assert.ok(incomp.includes('metale'), 'Materiały niezgodne dla kwasu muszą zawierać metale podatne na korozję');
});

test('ADR-109 [PUNKT 5]: Precyzja techniczna ŚOI w Sekcji 8.2 (Załącznik II REACH pkt 8.2.2.2)', async () => {
  const engine = getTestEngine();
  const payload = await engine.prepareAgentPayload(NAJMA_DOCX, 'SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE NAJMA');
  const s8 = payload.deterministicSections.section_8.content;

  // Rękawice
  assert.ok(s8.includes('kauczuk nitrylowy') || s8.includes('nitrylowego'), 'Sekcja 8.2 musi wskazywać kauczuk nitrylowy');
  assert.ok(s8.includes('0,4 mm'), 'Sekcja 8.2 musi podawać grubość minimalną 0,4 mm');
  assert.ok(s8.includes('480 min'), 'Sekcja 8.2 musi podawać czas przebicia > 480 min');
  assert.ok(s8.includes('PN-EN ISO 374-1') || s8.includes('374-1'), 'Sekcja 8.2 musi powoływać normę PN-EN ISO 374-1');

  // Ochrona oczu i dróg oddechowych
  assert.ok(s8.includes('PN-EN 166'), 'Sekcja 8.2 musi powoływać normę ochrony oczu PN-EN 166');
  assert.ok(s8.includes('A-P2') || s8.includes('PN-EN 14387'), 'Sekcja 8.2 musi powoływać filtr A-P2 i normę PN-EN 14387');
});

test('ADR-109 [PUNKT 6]: Przepisy prawa (Sekcja 15.1) i progi odcięcia Art. 31 REACH dla ED', async () => {
  // Test progu 0.1% dla Galaksolidu
  const compsWithoutEd = [{ name: 'Zapach', concentration: '0.05%' }];
  const edStatusUnder = SDSConsistencyEngine.resolveEndocrineStatus(compsWithoutEd);
  assert.equal(edStatusUnder.declaredIn2_3, false, 'Substancja poniżej 0,1% nie może być deklarowana jako składnik stwarzający zagrożenie w 2.3');
  assert.ok(edStatusUnder.s2_3_text.includes('nie zawiera'), 'Sekcja 2.3 musi zawierać prawną formułę negatywną zgodną z REACH');

  // Test Sekcji 15.1
  const s15Text = SDSConsistencyEngine.getSection15LegalActs();
  assert.ok(s15Text.includes('2019/1148'), 'Sekcja 15.1 musi powoływać Rozporządzenie (UE) 2019/1148');
  assert.ok(s15Text.includes('2023/707'), 'Sekcja 15.1 musi powoływać Rozporządzenie Delegowane (UE) 2023/707');
  assert.ok(s15Text.includes('Dz.U. 2016 poz. 138'), 'Sekcja 15.1 musi powoływać polskie rozporządzenie Seveso III Dz.U. 2016 poz. 138');
});

test('ADR-109: Integracyjny audyt SDSLinter i SDSVerifierAgent dla kompletnej karty NAJMA', async () => {
  const engine = getTestEngine();
  const payload = await engine.prepareAgentPayload(NAJMA_DOCX, 'SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE NAJMA');
  
  // Symulacja zmontowanych sekcji karty
  const mockSdsSections = {
    section_1: { content: payload.deterministicSections.section_1.content },
    section_2: { content: payload.deterministicSections.section_2.content },
    section_3: { content: payload.deterministicSections.section_3.content },
    section_4: { content: payload.deterministicSections.section_4.content },
    section_5: { content: payload.deterministicSections.section_5.content },
    section_6: { content: payload.deterministicSections.section_6.content },
    section_7: { content: payload.deterministicSections.section_7.content },
    section_8: { content: payload.deterministicSections.section_8.content },
    section_9: { content: payload.deterministicSections.section_9.content },
    section_10: { content: `10.1. Reaktywność: Stabilny.\n10.2. Stabilność chemiczna: Stabilny.\n10.3. Możliwość występowania niebezpiecznych reakcji: Brak.\n10.4. Warunki, których należy unikać: Mróz, wysokie temperatury.\n10.5. Materiały niezgodne: ${SDSConsistencyEngine.getSection10Incompatible(payload.deterministicSections.section_9.content)}\n10.6. Niebezpieczne produkty rozkładu: Brak.` },
    section_11: { content: payload.descriptiveSectionsToTranslate.section_11 || "11.1. Informacje na temat klas zagrożenia zdefiniowanych w rozporządzeniu (WE) nr 1272/2008\nBrak danych.\n11.2. Informacje o innych zagrożeniach\nBrak." },
    section_12: { content: payload.deterministicSections.section_12.content },
    section_13: { content: payload.deterministicSections.section_13.content },
    section_14: { content: payload.deterministicSections.section_14.content },
    section_15: { content: SDSConsistencyEngine.getSection15LegalActs() },
    section_16: { content: payload.deterministicSections.section_16.content }
  };

  // Weryfikacja przez SDSVerifierAgent
  const auditResult = await SDSVerifierAgent.verifyAndAudit(mockSdsSections, {
    productName: 'SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE NAJMA',
    components: payload.metadata.components,
    skipAiAudit: true
  });
  assert.ok(auditResult.isCompliant, 'Karta musi być zgodna po audycie weryfikatora');

  // Ostateczna bramka jakości SDSLinter
  const lintResult = SDSLinter.auditAndLint({ sections: auditResult.validatedSections });
  if (lintResult.errors.length > 0) {
    console.error('Błędy lintera:', lintResult.errors);
  }
  assert.equal(lintResult.errors.length, 0, 'Bramka jakości SDSLinter musi zgłosić 0 błędów krytycznych');
});
