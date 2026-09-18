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

  it('3. Wygenerowany DOCX NAJMA posiada natywne tabele Worda i 16 sekcji', () => {
    const docxPath = path.join('docs', 'SDS', '8051944811087_SDS_NAJMA (8).docx');
    assert.ok(fs.existsSync(docxPath), `Plik DOCX nie istnieje: ${docxPath}`);

    const zip = new AdmZip(docxPath);
    const docXml = zip.readAsText('word/document.xml');

    // Weryfikacja obecności tabel (<w:tbl>)
    const tblMatches = docXml.match(/<w:tbl\b/g);
    assert.ok(tblMatches && tblMatches.length >= 2, `Oczekiwano min. 2 tabel (metryka + składniki), znaleziono: ${tblMatches ? tblMatches.length : 0}`);

    // Weryfikacja obecności wszystkich 16 sekcji
    for (let i = 1; i <= 16; i++) {
      assert.ok(docXml.includes(`SEKCJA ${i}:`), `Brak SEKCJI ${i} w pliku DOCX`);
    }

    // Weryfikacja braku surowych znaków pipe '|' jako zwykłego tekstu tabeli
    assert.ok(!docXml.includes('| Nazwa substancji |'), 'Wykryto surowy format tabeli Markdown zamiast tabeli OpenXML!');
  });
});
