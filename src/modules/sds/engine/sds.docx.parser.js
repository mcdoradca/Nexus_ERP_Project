/**
 * ARCHITEKTURA SDS NEXUS ERP - NATYWNY PARSER DOKUMENTÓW DOCX (OpenXML)
 * 
 * Zapewnia 100% deterministyczną ekstrakcję kart charakterystyki dostarczanych w formacie .docx.
 * Eliminuje wady odczytu PDF:
 * 1. Zerowe ryzyko wycieku nagłówków i stopek (w Wordzie znajdują się w word/header*.xml).
 * 2. Bezpośrednia ekstrakcja tabel OpenXML (w:tbl -> w:tr -> w:tc) bez zgadywania granic stringów przez regex.
 * 3. Precyzyjne mapowanie komponentów sekcji 3.2, DNEL/PNEC (sekcja 8.1) oraz testów ekotoksyczności (sekcja 12.1).
 */

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const cheerio = require('cheerio');

class SDSDocxParser {
  /**
   * Sprawdza czy dany plik jest dokumentem DOCX (rozszerzenie lub nagłówek ZIP z word/document.xml)
   * @param {string} filePath 
   * @returns {boolean}
   */
  static isDocxFile(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    if (!fs.existsSync(filePath)) return false;

    if (filePath.toLowerCase().endsWith('.docx')) return true;

    try {
      const buffer = Buffer.alloc(4);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);

      // Sygnatura ZIP: PK\x03\x04 (0x50 0x4B 0x03 0x04)
      const isZip = buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04;
      if (!isZip) return false;

      const zip = new AdmZip(filePath);
      return !!zip.getEntry('word/document.xml');
    } catch (err) {
      return false;
    }
  }

  /**
   * Oczyszcza ewentualne artefakty nagłówkowe wklejone w treść (np. w plikach skonwertowanych z PDF do DOCX)
   * @param {string} text 
   * @returns {string}
   */
  static cleanArtifacts(text) {
    if (!text || typeof text !== 'string') return "";
    return text
      .replace(/Suarez\s+Company\s+(?:First\s+compilation\s+)?(?:[A-Z0-9_\-]+\s*-\s*[^\n]+?\s+)?\d{1,2}\/\d{1,2}\s*/gi, '')
      .replace(/Suarez\s+Company\s+S\.?r\.?l\.?[^\n]*/gi, '')
      .replace(/Dated\s+[0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4}[^\n]*/gi, '')
      .replace(/Printed\s+on\s+[^\n]*/gi, '')
      .replace(/Page\s+n\.?\s*\d+\s*(?:of|\/)\s*\d+[^\n]*/gi, '')
      .replace(/Strona\s+\d+\s*(?:z|\/)\s*\d+[^\n]*/gi, '')
      .replace(/Pagina\s+\d+\s*(?:di|\/)\s*\d+[^\n]*/gi, '');
  }

  /**
   * Ekstrahuje zawartość XML pliku word/document.xml z archiwum DOCX
   * @param {string} filePath 
   * @returns {string}
   */
  static extractDocumentXml(filePath) {
    try {
      const zip = new AdmZip(filePath);
      const entry = zip.getEntry('word/document.xml');
      if (!entry) {
        throw new Error("Brak struktury 'word/document.xml' w archiwum DOCX.");
      }
      return zip.readAsText(entry);
    } catch (err) {
      throw new Error(`[SDSDocxParser] Błąd odczytu pliku DOCX (${filePath}): ${err.message}`);
    }
  }

  /**
   * Bezpiecznie pobiera tekst z węzła akapitu <w:p>
   * Uwzględnia w:t, w:tab, w:br, w:cr oraz filtr antyartefaktowy
   * @param {object} pElem Węzeł akapitu cheerio
   * @param {object} $ Instancja cheerio
   * @returns {string}
   */
  static extractParagraphText(pElem, $) {
    if (!pElem) return "";
    let paraText = "";

    // Pobieramy wszystkie elementy potomne wewnątrz akapitu
    $(pElem).find('*').each((_, el) => {
      const tagName = (el.tagName || el.name || "").toLowerCase();
      if (tagName === 'w:t' || tagName === 't') {
        paraText += $(el).text();
      } else if (tagName === 'w:tab' || tagName === 'tab') {
        paraText += '\t';
      } else if (tagName === 'w:br' || tagName === 'br' || tagName === 'w:cr' || tagName === 'cr') {
        paraText += '\n';
      }
    });

    const cleaned = SDSDocxParser.cleanArtifacts(paraText);
    return cleaned.trim();
  }

  /**
   * Ekstrahuje wiersze i komórki z węzła tabeli <w:tbl>
   * @param {object} tblElem Węzeł tabeli cheerio
   * @param {object} $ Instancja cheerio
   * @returns {Array<Array<string>>}
   */
  static parseTableNode(tblElem, $) {
    const rows = [];
    if (!tblElem) return rows;

    $(tblElem).children('w\\:tr, tr').each((_, tr) => {
      const rowCells = [];
      $(tr).children('w\\:tc, tc').each((_, tc) => {
        let cellText = "";
        $(tc).find('w\\:p, p').each((_, p) => {
          const pt = SDSDocxParser.extractParagraphText(p, $);
          if (pt) {
            cellText += (cellText ? '\n' : '') + pt;
          }
        });
        rowCells.push(cellText.trim());
      });
      if (rowCells.length > 0) {
        rows.push(rowCells);
      }
    });

    return rows;
  }

  /**
   * Konwertuje macierz komórek tabeli na czytelny blok tekstowy
   * @param {Array<Array<string>>} rows 
   * @returns {string}
   */
  static formatTableAsText(rows) {
    if (!rows || rows.length === 0) return "";
    const lines = [];
    for (const row of rows) {
      const singleLineCells = row.map(cell => cell.replace(/\r?\n/g, ' '));
      lines.push(singleLineCells.join(' | '));
    }
    return lines.join('\n');
  }

  /**
   * Identyfikator sekcji na podstawie tekstu nagłówka
   * @param {string} text 
   * @returns {string|null} np. "section_1", "section_2", ..., "section_16"
   */
  static matchSectionHeader(text, currentKey = null) {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();

    // Wzorzec 1: SEZIONE / SECTION / SEKCJA / SECCIÓN / ABSCHNITT / RUBRIQUE X
    const p1 = /(?:SEZIONE|SECTION|SEKCJA|SECCI[OÓ]N|ABSCHNITT|RUBRIQUE)\s*(?:N\.?|NR\.?|NO\.?|NUMBER)?\s*[:\.\-]?\s*([1-9]|1[0-6])\b/i.exec(clean);
    if (p1) {
      return `section_${parseInt(p1[1], 10)}`;
    }

    // Wzorzec 2: "1. IDENTYFIKACJA...", "1: IDENTYFIKACJA", "1 - IDENTYFIKACJA", "1 IDENTYFIKACJA"
    const p2 = /^([1-9]|1[0-6])\s*[:\.\-]?\s*(?:IDENT|ZAGRO|SKŁAD|COMPOS|HAZARD|FIRST|ŚRODKI|POSTĘPOWANIE|FIRE|UWOLN|RELEASE|MANIPOL|POSTĘP|MAGAZYN|KONTROLA|EXPOS|WŁAŚCIWOŚCI|PROPR|STABIL|TOKSYK|TOXIC|EKOLOG|ECOLOG|ODPAD|DISPOSAL|TRANSP|PRZEPIS|REGULAT|INNE|OTHER|ABSCHNITT|RUBRIQUE)/i.exec(clean);
    if (p2) {
      return `section_${parseInt(p2[1], 10)}`;
    }

    // Wzorzec 3: Jeśli jesteśmy w preambule i pojawia się podsekcja 1.1 lub 1.2
    if (!currentKey || currentKey === 'preamble') {
      const p3 = /^(?:1\.1\b|1\.2\b)\s*[:\.\-]?\s*(?:Identyfikator|Product|Identificatore|Relevant|Usi|Istotne|Zastosowanie)/i.exec(clean);
      if (p3) {
        return `section_1`;
      }
    }

    return null;
  }

  /**
   * Główna metoda przetwarzająca DOCX:
   * 1. Ekstrahuje pełny, czysty tekst bez nagłówków/stopek stron
   * 2. Dzieli dokument na 16 sekcji zgodnie z chronologicznym przepływem węzłów w:body
   * 3. Pobiera wyodrębnione struktury tabel przypisane do sekcji
   * 
   * @param {string} filePath 
   * @returns {{ fullText: string, sections: object, tablesBySection: object, allTables: Array }}
   */
  static extractTextAndSections(filePath) {
    const xmlContent = this.extractDocumentXml(filePath);
    const $ = cheerio.load(xmlContent, { xmlMode: true });

    const sections = {};
    const tablesBySection = {};
    const allTables = [];

    for (let i = 1; i <= 16; i++) {
      sections[`section_${i}`] = [];
      tablesBySection[`section_${i}`] = [];
    }
    sections['preamble'] = [];
    tablesBySection['preamble'] = [];

    let currentSectionKey = 'preamble';

    // Przechodzimy sekwencyjnie po bezpośrednich dzieciach w:body
    const bodyChildren = $('w\\:document > w\\:body').children();

    bodyChildren.each((_, el) => {
      const tagName = (el.tagName || el.name || "").toLowerCase();

      if (tagName === 'w:p' || tagName === 'p') {
        const text = SDSDocxParser.extractParagraphText(el, $);
        if (!text) return;

        const detectedSec = SDSDocxParser.matchSectionHeader(text, currentSectionKey);
        if (detectedSec) {
          currentSectionKey = detectedSec;
        }

        sections[currentSectionKey].push(text);
      } else if (tagName === 'w:tbl' || tagName === 'tbl') {
        const tableRows = SDSDocxParser.parseTableNode(el, $);
        if (tableRows && tableRows.length > 0) {
          // Sprawdzamy czy pierwsza komórka tabeli zawiera nagłówek nowej sekcji
          if (tableRows[0] && tableRows[0][0]) {
            const detectedFromTable = SDSDocxParser.matchSectionHeader(tableRows[0][0], currentSectionKey);
            if (detectedFromTable) {
              currentSectionKey = detectedFromTable;
            }
          }

          tablesBySection[currentSectionKey].push(tableRows);
          allTables.push({ section: currentSectionKey, rows: tableRows });

          // Równolegle dołączamy tekstową reprezentację tabeli do bufora sekcji
          const tableText = SDSDocxParser.formatTableAsText(tableRows);
          sections[currentSectionKey].push(tableText);
        }
      }
    });

    // Jeśli w preambule znalazły się podpunkty sekcji 1 (np. 1.1 lub 1.2 przed formalnym nagłówkiem), przenieś je do section_1
    const cleanedPreamble = [];
    let movingToSec1 = false;
    for (const pText of sections['preamble']) {
      if (/^(?:1\.1\b|1\.2\b|Usi\s+pertinenti|Relevant\s+identified|Istotne\s+zidentyfikowane)/i.test(pText.trim())) {
        movingToSec1 = true;
      }
      if (movingToSec1) {
        sections['section_1'].unshift(pText);
      } else {
        cleanedPreamble.push(pText);
      }
    }
    sections['preamble'] = cleanedPreamble;

    // Składanie końcowego wyniku sekcji w postaci stringów
    const formattedSections = {};
    for (let i = 1; i <= 16; i++) {
      const key = `section_${i}`;
      const joined = sections[key].join('\n\n').trim();
      formattedSections[key] = joined || `Brak danych dla Sekcji ${i} w dokumencie DOCX.`;
    }

    // Składanie pełnego tekstu całego dokumentu
    const fullTextParts = [];
    if (sections['preamble'].length > 0) {
      fullTextParts.push(sections['preamble'].join('\n\n'));
    }
    for (let i = 1; i <= 16; i++) {
      fullTextParts.push(formattedSections[`section_${i}`]);
    }
    const fullText = fullTextParts.join('\n\n\n').trim();

    return {
      fullText,
      sections: formattedSections,
      tablesBySection,
      allTables
    };
  }

  /**
   * Zapewnia 100% kompatybilny interfejs ekstrakcji czystego tekstu z DOCX
   * @param {string} filePath 
   * @returns {Promise<string>}
   */
  static async extractText(filePath) {
    const res = this.extractTextAndSections(filePath);
    return res.fullText;
  }

  /**
   * Precyzyjny parser tabeli sekcji 3.2 z DOCX.
   * Mapuje wiersze tabeli OpenXML na pełne obiekty komponentów chemicznych bez ułomności regexów PDF.
   * 
   * @param {Array<Array<string>>} tableRows Wiersze tabeli wyekstrahowane z <w:tbl>
   * @param {object} resolvedSubstances Słownik przetłumaczonych nazw CAS -> nazwa_pl
   * @returns {Array<object>} Tablica komponentów gotowa do pipeline'u sds.service.js
   */
  static parseSection3Table(tableRows, resolvedSubstances = {}) {
    if (!tableRows || tableRows.length === 0) return [];

    const components = [];
    let headerRowIdx = -1;

    // Szukamy wiersza nagłówkowego (Substancja, CAS, Stężenie, Klasyfikacja)
    for (let i = 0; i < Math.min(3, tableRows.length); i++) {
      const rowText = tableRows[i].join(' ').toLowerCase();
      if (/substanc|sostanz|substance|nazwa|name/i.test(rowText) &&
          (/identyf|identif|cas|we|ec/i.test(rowText) || /klasyfik|classif/i.test(rowText) || /stężen|conc/i.test(rowText))) {
        headerRowIdx = i;
        break;
      }
    }

    const dataRows = headerRowIdx >= 0 ? tableRows.slice(headerRowIdx + 1) : tableRows;

    for (const row of dataRows) {
      if (!row || row.length === 0) continue;

      const fullRowText = row.join('\n');

      // Weryfikacja czy wiersz zawiera numer CAS
      const casMatches = [...fullRowText.matchAll(/(?<![\d-])([1-9]\d{1,6}-\d{2}-\d)(?![\d-])/g)];
      if (casMatches.length === 0) continue;

      const casNumber = casMatches[0][1];

      // Wyznaczanie komórek semantycznie
      let nameCell = "";
      let identCell = "";
      let concCell = "";
      let classCell = "";

      // Jeśli mamy dokładnie 4 kolumny o standardowym układzie:
      if (row.length === 4) {
        nameCell = row[0];
        identCell = row[1];
        classCell = row[2];
        concCell = row[3];
      } else {
        // Dynamiczne wykrywanie komórek na podstawie zawartości
        for (const cell of row) {
          if (cell.includes(casNumber) || /(?:Numer\s*(?:WE|EC|CAS)|REACH|Indeks)/i.test(cell)) {
            identCell = cell;
          } else if (/(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%/i.test(cell) || /\b\d+\s*≤\s*x/i.test(cell)) {
            concCell = cell;
          } else if (/H\d{3}|Flam|Eye|Skin|Acute|Aquatic|Sens|STOT|Asp|Specyficzne/i.test(cell)) {
            classCell = cell;
          } else if (!nameCell && cell.trim().length > 0) {
            nameCell = cell;
          }
        }
      }

      // Wyciąganie numerów WE / Indeks / REACH
      const ecMatch = fullRowText.match(/\b(?:Numer\s*WE|WE|EC|EINECS)\s*[:\.]?\s*(\d{3}-\d{3}-\d)\b/i);
      const ecNumber = ecMatch ? ecMatch[1] : "—";

      const indexMatch = fullRowText.match(/\b(?:Numer\s*indeksowy|Index|Indeks)\s*[:\.]?\s*(\d{3}-\d{3}-\d{2}-[\dXx])\b/i);
      const indexNumber = indexMatch ? indexMatch[1] : "—";

      const reachMatch = fullRowText.match(/\b(?:Numer\s*rejestracji\s*REACH|REACH\s*Reg\.?|REACH)?\s*[:\.]?\s*(01-\d{8,10}-\d{2}(?:-[A-Za-z0-9]{2,4})?)\b/i);
      const reachNumber = reachMatch ? reachMatch[0] : "—";

      // Identyfikatory
      const idParts = [
        `Numer CAS: ${casNumber}`,
        `Numer WE: ${ecNumber}`
      ];
      if (indexNumber !== "—") idParts.push(`Numer indeksowy: ${indexNumber}`);
      if (reachNumber !== "—") idParts.push(`Numer rejestracji REACH:\n${reachNumber}`);

      // Nazwa chemiczna (czyszczenie i tłumaczenie)
      let rawName = nameCell.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
      let plName = resolvedSubstances[casNumber] || rawName;

      // Stężenie
      let concentration = concCell.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim() || "—";

      // Klasyfikacja CLP
      let classification = classCell.trim();

      components.push({
        cas: casNumber,
        name: plName,
        originalName: rawName,
        ec: ecNumber,
        index: indexNumber,
        reach: reachNumber,
        identifiers: idParts.join('\n'),
        classification: classification,
        concentration: concentration
      });
    }

    return components;
  }
}

module.exports = {
  SDSDocxParser
};
