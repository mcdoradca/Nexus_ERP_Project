const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const { SDSProcessorEngine } = require('../src/modules/sds/sds.service');

test('Audyt Regulacyjny: 6 Krytycznych Wad SANDALO DOCX', async (t) => {
  const docxPath = path.join(__dirname, '../docs/SDS/8034055535424_SDS_SANDALO org.docx');
  if (!fs.existsSync(docxPath)) {
    t.skip('Brak pliku testowego SANDALO org.docx');
    return;
  }

  const engine = new SDSProcessorEngine();
  const result = await engine.prepareAgentPayload(docxPath, {
    skipAiAudit: true
  });

  const det = result.deterministicSections || {};
  const desc = result.descriptiveSectionsToTranslate || {};
  const s1 = (det.section_1 && det.section_1.content) || '';
  const s2 = (det.section_2 && det.section_2.content) || '';
  const s3 = (det.section_3 && det.section_3.content) || '';
  const s8 = (det.section_8 && det.section_8.content) || '';
  const s9 = (det.section_9 && det.section_9.content) || '';
  const s11 = SDSProcessorEngine.polonizeToxicologicalSection(desc.section_11 || '');
  const s12 = (det.section_12 && det.section_12.content) || '';

  await t.test('Punkt 1: Sekcja 1.2 - Identyfikacja zastosowania konsumenckiego (odświeżacz powietrza)', () => {
    assert.ok(!s1.includes('Brak szczegółowych informacji w karcie źródłowej'), 'Sekcja 1.2 nie może zawierać komunikatu o braku informacji');
    assert.match(s1, /odświeżacz powietrza/i, 'Sekcja 1.2 musi identyfikować odświeżacz powietrza');
    assert.match(s1, /konsumenck/i, 'Sekcja 1.2 musi określać zastosowanie konsumenckie');
  });

  await t.test('Punkt 2: Sekcja 2.2 - Zachowanie procedur medycznych P333+P313 i P337+P313 oraz brak duplikatów', () => {
    assert.match(s2, /P333\s*\+\s*P313/i, 'Sekcja 2.2 musi zawierać zwrot medyczny P333+P313');
    assert.match(s2, /P337\s*\+\s*P313/i, 'Sekcja 2.2 musi zawierać zwrot medyczny P337+P313');
    // Weryfikacja braku zdublowanych składników w Zawiera:
    const zawieraMatch = s2.match(/Zawiera\s*[:\.]?\s*([^\n]+)/i);
    if (zawieraMatch) {
      const parts = zawieraMatch[1].split(',').map(p => p.trim().toLowerCase());
      const unique = new Set(parts);
      assert.strictEqual(parts.length, unique.size, 'Wykaz "Zawiera:" nie może dublować składników (np. PL i EN)');
    }
  });

  await t.test('Punkt 3: Sekcja 3.2 - Spolszczenie nazw, symbol % i polonizacja uwag CLP', () => {
    // Sprawdzenie obecności % w stężeniach
    const components = result.metadata.components || [];
    assert.ok(components.length >= 10, 'Sekcja 3 musi zawierać wyekstrahowane składniki');
    for (const c of components) {
      if (c.concentration && c.concentration !== '—') {
        assert.match(c.concentration, /%/, `Stężenie dla ${c.name} musi posiadać symbol %`);
      }
    }
    // Polonizacja uwag CLP
    assert.ok(!s3.includes('Substance with a community workplace exposure limit'), 'Uwagi CLP muszą być po polsku');
    assert.ok(!s3.includes('Classification note according to Annex VI'), 'Uwagi CLP muszą być po polsku');
    if (s3.includes('ATE')) {
      assert.ok(!s3.includes('ATE Inhalation vapours'), 'Prefiksy ATE muszą być spolszczone');
    }
  });

  await t.test('Punkt 4: Sekcja 8.1 - Brak przesunięcia macierzy DNEL/PNEC i czytelny format Linalolu', () => {
    // BHT nie może mieć wartości metanolu (260 mg/m³ lub 40 mg/kg)
    const bhtIndex = s8.indexOf('2,6-di-tert-butylo-4-metylofenol') !== -1 ? s8.indexOf('2,6-di-tert-butylo-4-metylofenol') : s8.indexOf('BHT');
    if (bhtIndex !== -1) {
      const bhtBlock = s8.substring(bhtIndex, bhtIndex + 800);
      assert.ok(!bhtBlock.includes('260 mg/m³'), 'BHT nie może otrzymać wartości DNEL metanolu');
      assert.ok(!bhtBlock.includes('40 mg/kg'), 'BHT nie może otrzymać wartości DNEL metanolu');
    }
    // Linalol nie może być sformatowany jako surowy ciąg 4 liczb "4,1 / 0,7 / 16,5 / 2,8 mg/m³"
    assert.ok(!s8.includes('4,1 / 0,7 / 16,5 / 2,8'), 'DNEL Linalolu nie może być nieczytelnym zlepkiem liczb');
  });

  await t.test('Punkt 5: Sekcja 9 - Zachowanie uzasadnień braku danych oraz eliminacja hybryd językowych', () => {
    assert.ok(!s9.includes('brown'), 'Kolor brown musi być przetłumaczony na brązowy');
    assert.ok(!s9.includes('Remark:Visual'), 'Remark:Visual musi być przetłumaczony');
    assert.ok(!s9.includes('Easily ciecz łatwopalna and vapors'), 'Nie dopuszcza się hybryd językowych w palności');
    assert.match(s9, /brązowy/i, 'Sekcja 9 musi zawierać kolor brązowy');
    assert.match(s9, /wysoce łatwopalna ciecz i pary/i, 'Sekcja 9 musi zawierać oficjalną frazę palności');
    // Zachowanie prawnych uzasadnień
    assert.match(s9, /dotyczy wyłącznie ciał stałych|właściwość nie ma znaczenia|nadtlenków organicznych/i, 'Sekcja 9 musi zachować urzędowe uzasadnienia braku danych');
  });

  await t.test('Punkt 6: Sekcja 11.1 i 12 - Prawdziwa wartość 120 mg/l, brak fałszywych organizmów i poprawna biodegradacja', () => {
    // 11.1 Autentyczna wartość 120 mg/l/4h dla etanolu
    assert.match(s11, /120\s*mg\/l\/4h/i, 'Sekcja 11.1 musi zachować autentyczną wartość 120 mg/l/4h dla etanolu');
    assert.ok(!s11.includes('> 50 mg/l/4h'), 'Sekcja 11.1 nie może fałszować wartości na > 50 mg/l/4h');
    // 12.1 Brak kodu BLK0276-2 jako organizmu
    const s12Org = s12.match(/Informacje ekotoksykologiczne o składnikach:\n([\s\S]*)/i);
    if (s12Org) {
      assert.ok(!s12Org[1].includes('BLK0276-2'), 'Kod nagłówkowy BLK0276-2 nie może występować jako organizm w Sekcji 12.1');
    }
    // 12.2 NOT rapidly degradable
    assert.match(s12, /nie ulega szybkiej degradacji|nie ulega łatwo biodegradacji/i, 'Sekcja 12.2 musi zachować przeczenie NOT rapidly degradable');
  });
});
