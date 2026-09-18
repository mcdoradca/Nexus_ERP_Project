const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const { SDSVisionAgent } = require('../src/modules/sds/sds.vision.agent');
const { SDSDocxBuilder, SECTION_TITLES_PL, OFFICIAL_SUBSECTIONS_PL } = require('../src/modules/sds/sds.docx.builder');
const { processSdsWithVisionAgent } = require('../src/modules/sds/sds.agent');

describe('SDSVisionAgent & SDSDocxBuilder - Testy Integracyjne (ADR-112)', () => {
  it('1. SDSVisionAgent i SDSDocxBuilder są poprawnie zdefiniowane', () => {
    assert.strictEqual(typeof SDSVisionAgent, 'function');
    assert.strictEqual(typeof SDSDocxBuilder, 'function');
    assert.strictEqual(typeof SDSDocxBuilder.buildDocx, 'function');
    assert.strictEqual(typeof processSdsWithVisionAgent, 'function');
  });

  it('2. Kanoniczne nagłówki 16 sekcji i podsekcji REACH UE 2020/878', () => {
    for (let i = 1; i <= 16; i++) {
      assert.ok(SECTION_TITLES_PL[i], `Brak tytułu dla Sekcji ${i}`);
      assert.ok(SECTION_TITLES_PL[i].startsWith(`SEKCJA ${i}:`), `Niepoprawny format tytułu Sekcji ${i}`);
    }
    assert.ok(OFFICIAL_SUBSECTIONS_PL["3.1"]);
    assert.ok(OFFICIAL_SUBSECTIONS_PL["3.2"]);
    assert.ok(OFFICIAL_SUBSECTIONS_PL["9.1"]);
    assert.ok(OFFICIAL_SUBSECTIONS_PL["14.1"]);
  });

  it('3. SDSDocxBuilder generuje poprawny dokument DOCX z natywnymi tabelami i 16 sekcjami', async () => {
    const mockSdsData = {
      metadata: { productName: 'PRODUKT TESTOWY', version: '1.0 PL' },
      classification: { hPhrases: [], pPhrases: [], pictograms: [] },
      components: [
        { namePl: 'Substancja A', cas: '100-00-0', ec: '200-000-0', clp: 'Skin Sens. 1 H317', concentration: '1 %' }
      ],
      sections: {
        '1': { '1.1': 'Nazwa handlowa: PRODUKT TESTOWY' },
        '2': { '2.1': 'Nie stwarza zagrożenia', '2.2': 'EUH208 Zawiera Substancja A. Może powodować wystąpienie reakcji alergicznej.' }
      }
    };
    const tmpDocx = path.join(__dirname, 'tmp_test_out.docx');
    await SDSDocxBuilder.buildDocx(mockSdsData, tmpDocx);
    assert.ok(fs.existsSync(tmpDocx), 'Plik DOCX powinien zostać utworzony');

    const zip = new AdmZip(tmpDocx);
    const docXml = zip.readAsText('word/document.xml');
    assert.ok(docXml.includes('SEKCJA 1:'), 'Brak SEKCJI 1 w pliku DOCX');
    assert.ok(docXml.includes('SEKCJA 16:'), 'Brak SEKCJI 16 w pliku DOCX');
    fs.unlinkSync(tmpDocx);
  });
});
