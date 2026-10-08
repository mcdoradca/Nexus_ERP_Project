const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');

const GOLDEN_MASTER_PATH = path.join(__dirname, '..', 'docs', 'SDS', 'KARTA CHARAKTERYSTYKI CIF 8720181414800 (5).docx');

describe('SDS Golden Master Benchmark - KARTA CHARAKTERYSTYKI CIF (ADR-0137)', () => {
  it('1. Plik Golden Master istnieje na dysku', () => {
    assert.ok(fs.existsSync(GOLDEN_MASTER_PATH), 'Plik Golden Master DOCX musi istnieć: ' + GOLDEN_MASTER_PATH);
    const stats = fs.statSync(GOLDEN_MASTER_PATH);
    assert.ok(stats.size > 20000, `Rozmiar pliku DOCX (${stats.size} B) powinien przekraczać 20 KB`);
  });

  it('2. Integralność struktury 16 sekcji REACH (UE 2020/878)', () => {
    const zip = new AdmZip(GOLDEN_MASTER_PATH);
    const xml = zip.readAsText('word/document.xml');
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    for (let i = 1; i <= 16; i++) {
      assert.ok(text.includes(`SEKCJA ${i}:`), `Sekcja ${i} musi być obecna w dokumencie Golden Master`);
    }
  });

  it('3. Poprawność identyfikacji produktu i UFI w Sekcji 1.1', () => {
    const zip = new AdmZip(GOLDEN_MASTER_PATH);
    const xml = zip.readAsText('word/document.xml');
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    assert.ok(text.includes('1HE8-G01J-M00S-KTNK'), 'UFI: 1HE8-G01J-M00S-KTNK musi być obecne w Sekcji 1.1');
    assert.ok(/Cif/i.test(text), 'Nazwa Cif musi występować w Sekcji 1.1');
  });

  it('4. Integralność tabel DNEL/DMEL i PNEC w Sekcji 8.1', () => {
    const zip = new AdmZip(GOLDEN_MASTER_PATH);
    const xml = zip.readAsText('word/document.xml');
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    assert.ok(text.includes('DNEL') || text.includes('Pochodny poziom'), 'Sekcja 8.1 musi zawierać wartości DNEL');
    assert.ok(text.includes('PNEC') || text.includes('Przewidywane stężenie'), 'Sekcja 8.1 musi zawierać wartości PNEC');
    assert.ok(text.includes('Dz.U. 2024 poz. 1017') || text.includes('Dz.U. 2018 poz. 1286'), 'Sekcja 8.1 musi powoływać polskie normy NDS');
  });

  it('5. Prawidłowość kodów odpadów w Sekcji 13.1 (Dz.U. 2020 poz. 10)', () => {
    const zip = new AdmZip(GOLDEN_MASTER_PATH);
    const xml = zip.readAsText('word/document.xml');
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    assert.ok(text.includes('20 01 29*') || text.includes('20 01 29'), 'Sekcja 13.1 musi zawierać kod odpadu produktu 20 01 29*');
    assert.ok(text.includes('15 01 10*') || text.includes('15 01 02'), 'Sekcja 13.1 musi zawierać kod opakowania 15 01 10* lub 15 01 02');
    assert.ok(text.includes('Dz.U. 2020 poz. 10'), 'Sekcja 13.1 musi powoływać katalog odpadów Dz.U. 2020 poz. 10');
  });

  it('6. Czystość językowa – brak wycieków języka włoskiego', () => {
    const zip = new AdmZip(GOLDEN_MASTER_PATH);
    const xml = zip.readAsText('word/document.xml');
    const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    const forbiddenItalian = ['miscela', 'orale', 'inalatoria', 'cutanea', 'nessun dato', 'avvertenza', 'pericolo'];
    for (const word of forbiddenItalian) {
      const match = new RegExp('\\b' + word + '\\b', 'i').test(text);
      assert.strictEqual(match, false, `Wykryto włoskie słowo '${word}' w dokumencie Golden Master!`);
    }
  });
});
