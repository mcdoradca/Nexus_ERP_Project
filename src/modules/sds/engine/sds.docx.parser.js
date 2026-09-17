/**
 * SDSDocxParser - Wysoko wydajny, deterministyczny parser kart charakterystyki DOCX (Office OpenXML)
 * 
 * Zasady architektoniczne (ADR-085):
 * 1. Zero New Dependencies - operuje wyłącznie na wbudowanych adm-zip oraz cheerio (xmlMode: true).
 * 2. Zero Running-Header Leakage - całkowita izolacja nagłówków/stopek stron.
 * 3. Linear Flow Preservation - sekwencyjna dekompozycja blokowa (w:p oraz w:tbl).
 * 4. Structural Table Extraction - rozróżnianie tabel layoutowych od tabel danych chemicznych.
 * 5. REACH Monotonicity Gatekeeper - sekwencyjna progresja sekcji 1 do 16.
 */

const AdmZip = require('adm-zip');
const cheerio = require('cheerio');
const fs = require('fs');

class SDSDocxParser {
  /**
   * Sprawdza czy dany plik jest poprawnym archiwum Office OpenXML DOCX
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
      .replace(/(?:^|\n)\s*(?:[A-Za-z0-9_\-\.\s]{2,40})?\s*(?:Revision|Revisione|Wersja)\s*(?:nr\.?|no\.?|n\.|:)?\s*\d+[^\n]{0,120}?(?:Dated|Data|Printed|Stampato)[^\n]{0,120}?\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/gi, '')
      .replace(/(?:^|\n)\s*(?:[A-Za-z0-9_\-\.\s]{2,40})?\s*(?:Revision|Revisione|Wersja)\s*(?:nr\.?|no\.?|n\.|:)?\s*\d+[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Suarez\s+Company|Company|Distributor|Dystrybutor)\s*\|[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Suarez\s+Company|Company|Distributor|Dystrybutor)[^\n]{0,120}?\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/gi, '')
      .replace(/(?:^|\n)\s*(?!(?:LC|EC|IC|LD|NOEC|NOAEL|LOAEL)\d*)(?:BLK\d+(?:-\d+)?|[A-Z]{2,6}\d{3,8}(?:-\d+)?)\s*-\s*[^\n]+/gi, '')
      .replace(/(?:^|\n)\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/g, '')
      .replace(/Dated\s+[0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4}[^\n]*/gi, '')
      .replace(/Printed\s+on\s+[^\n]*/gi, '')
      .replace(/Stampato\s+il\s+[^\n]*/gi, '')
      .replace(/Page\s+(?:n\.?)?\s*\d+\s*(?:of|\/)\s*\d+[^\n]*/gi, '')
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
   * @param {object} pElem Węzeł akapitu cheerio
   * @param {object} $ Instancja cheerio
   * @returns {string}
   */
  static extractParagraphText(pElem, $) {
    if (!pElem) return "";
    let paraText = "";

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
   * Sprawdza czy dany węzeł tabeli zawiera nagłówek sekcji (jest tabelą układu strony)
   * @param {object} tblElem 
   * @param {object} $ 
   * @param {string|null} currentKey 
   * @returns {string|null}
   */
  static tableContainsSectionHeader(tblElem, $, currentKey = null) {
    let found = null;
    $(tblElem).find('w\\:p, p').each((_, p) => {
      const txt = $(p).find('w\\:t, t').map((_, t) => $(t).text()).get().join('').trim();
      if (txt) {
        const match = SDSDocxParser.matchSectionHeader(txt, currentKey);
        if (match) {
          found = match;
          return false; // break loop
        }
      }
    });
    return found;
  }

  /**
   * Identyfikator sekcji na podstawie tekstu nagłówka.
   * Wymusza bezwzględną monotoniczność sekwencji REACH (1 do 16) oraz kotwiczenie do początku bloku.
   * 
   * @param {string} text 
   * @param {string|null} currentKey
   * @returns {string|null} np. "section_1", "section_2", ..., "section_16"
   */
  static matchSectionHeader(text, currentKey = null) {
    if (!text || typeof text !== 'string') return null;
    const clean = text.trim();
    if (clean.length > 250) return null; // Nagłówki sekcji REACH to krótkie tytuły

    let detectedNum = null;

    // Wzorzec 1: SEZIONE / SECTION / SEKCJA / SECCIÓN / ABSCHNITT / RUBRIQUE X
    const p1 = /^[\s\*\#\-_]*(?:SEZIONE|SECTION|SEKCJA|SECCI[OÓ]N|ABSCHNITT|RUBRIQUE)\s*(?:N\.?|NR\.?|NO\.?|NUMBER)?\s*[:\.\-]?\s*([1-9]|1[0-6])\b/i.exec(clean);
    if (p1) {
      detectedNum = parseInt(p1[1], 10);
    }

    // Wzorzec 2: "1. IDENTYFIKACJA...", "1: IDENTYFIKACJA", "1 - IDENTYFIKACJA"
    if (!detectedNum) {
      const p2 = /^[\s\*\#\-_]*([1-9]|1[0-6])\s*[:\.\-]\s*(?:IDENT|ZAGRO|SKŁAD|COMPOS|HAZARD|FIRST|ŚRODKI|POSTĘPOWANIE|FIRE|UWOLN|RELEASE|MANIPOL|POSTĘP|MAGAZYN|KONTROLA|EXPOS|WŁAŚCIWOŚCI|PROPR|STABIL|TOKSYK|TOXIC|EKOLOG|ECOLOG|ODPAD|DISPOSAL|TRANSP|PRZEPIS|REGULAT|INNE|OTHER|ABSCHNITT|RUBRIQUE)/i.exec(clean);
      if (p2) {
        detectedNum = parseInt(p2[1], 10);
      }
    }

    // Wzorzec 3: Preamble recovery (jeśli jesteśmy w preambule i pojawia się podsekcja 1.1 lub 1.2)
    if (!detectedNum && (!currentKey || currentKey === 'preamble')) {
      const p3 = /^[\s\*\#\-_]*(?:1\.1\b|1\.2\b)\s*[:\.\-]?\s*(?:Identyfikator|Product|Identificatore|Relevant|Usi|Istotne|Zastosowanie)/i.exec(clean);
      if (p3) {
        detectedNum = 1;
      }
    }

    if (!detectedNum) return null;

    // REGUŁA MONOTONICZNOŚCI REACH (UE 2020/878):
    // Sekcje w karcie SDS następują ściśle sekwencyjnie (1 do 16).
    // Odrzucamy fałszywe dopasowania wstecz (np. wzmiankę o sekcji 2 w sekcji 16).
    const currentNum = currentKey && currentKey.startsWith('section_')
      ? parseInt(currentKey.replace('section_', ''), 10)
      : 0;

    if (detectedNum < currentNum) {
      return null;
    }

    return `section_${detectedNum}`;
  }

  /**
   * Główna metoda przetwarzająca DOCX:
   * 1. Dekomponuje sekwencyjnie strukturę document.xml (w:p oraz w:tbl)
   * 2. Transparentnie rozwija tabele layoutowe komórka po komórce do strumienia akapitów
   * 3. Zachowuje tabele danych (składniki, DNEL, właściwości) jako wyodrębnione macierze
   * 4. Gwarantuje porządek 16 sekcji REACH
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

    const bodyChildren = $('w\\:body, body').children();

    const processNode = (node) => {
      const tagName = (node.tagName || node.name || "").toLowerCase();

      if (tagName === 'w:tbl' || tagName === 'tbl') {
        const isLayoutTable = !!SDSDocxParser.tableContainsSectionHeader(node, $, currentSectionKey);

        if (isLayoutTable) {
          // Tabela układu strony: rozwijamy akapity komórka po komórce z bieżącą detekcją granic sekcji
          $(node).find('w\\:tr, tr').each((_, tr) => {
            $(tr).find('w\\:tc, tc').each((_, tc) => {
              $(tc).children().each((_, child) => processNode(child));
            });
          });
        } else {
          // Właściwa tabela danych: zachowujemy strukturę wierszy i komórek
          const tableRows = SDSDocxParser.parseTableNode(node, $);
          if (tableRows && tableRows.length > 0) {
            if (!tablesBySection[currentSectionKey]) tablesBySection[currentSectionKey] = [];
            tablesBySection[currentSectionKey].push(tableRows);
            allTables.push({ section: currentSectionKey, rows: tableRows });

            const tableText = SDSDocxParser.formatTableAsText(tableRows);
            if (sections[currentSectionKey]) sections[currentSectionKey].push(tableText);
          }
        }
      } else if (tagName === 'w:p' || tagName === 'p') {
        // Obsługa pól tekstowych w:txbxContent osadzonych wewnątrz akapitów
        const txbx = $(node).find('w\\:txbxContent, txbxContent');
        if (txbx.length > 0) {
          txbx.each((_, tb) => {
            $(tb).children().each((_, child) => processNode(child));
          });
        }

        // Klon akapitu bez txbx, aby wyekstrahować czysty tekst akapitu bez podwójnego zliczania
        const clone = $(node).clone();
        clone.find('w\\:txbxContent, txbxContent, w\\:drawing, drawing').remove();
        const text = SDSDocxParser.extractParagraphText(clone, $);
        if (!text) return;
        const cleaned = SDSDocxParser.cleanArtifacts(text);
        if (!cleaned) return;

        const detectedSec = SDSDocxParser.matchSectionHeader(cleaned, currentSectionKey);
        if (detectedSec && detectedSec !== currentSectionKey) {
          currentSectionKey = detectedSec;
        }

        if (sections[currentSectionKey]) sections[currentSectionKey].push(cleaned);
      }
    };

    bodyChildren.each((_, el) => processNode(el));

    // Składanie końcowego wyniku sekcji w postaci tekstu
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
   * Precyzyjny, uniwersalny parser tabel sekcji 3.2 z DOCX.
   * Obsługuje formaty 1-wierszowe (grid) oraz wielowierszowe (blokowe) występujące w systemach chemicznych.
   * Łączy podzielone tabele między stronami w spójną listę komponentów.
   * 
   * @param {Array<Array<string>>|Array<Array<Array<string>>>} tableOrTables Wiersze lub tablica tabel z <w:tbl>
   * @param {object} resolvedSubstances Słownik przetłumaczonych nazw CAS -> nazwa_pl
   * @returns {Array<object>} Tablica komponentów gotowa do pipeline'u sds.service.js
   */
  static parseSection3Table(tableOrTables, resolvedSubstances = {}) {
    if (!tableOrTables) return [];

    let rawRows = [];
    if (Array.isArray(tableOrTables) && tableOrTables.length > 0) {
      // Jeśli przekazano tablicę tabel (3D), spłaszczamy do pojedynczego ciągu wierszy
      if (Array.isArray(tableOrTables[0]) && tableOrTables[0].length > 0 && Array.isArray(tableOrTables[0][0])) {
        for (const tbl of tableOrTables) {
          if (Array.isArray(tbl)) rawRows.push(...tbl);
        }
      } else {
        rawRows = tableOrTables;
      }
    }

    if (rawRows.length === 0) return [];

    // 1. Sprawdzamy czy tabela posiada zdefiniowany nagłówek kolumnowy (format horyzontalny)
    let nameColIdx = -1;
    let qtyColIdx = -1;
    let identColIdx = -1;
    let classColIdx = -1;
    let reachColIdx = -1;
    let headerRowIdx = -1;

    for (let i = 0; i < Math.min(3, rawRows.length); i++) {
      const row = rawRows[i];
      let nIdx = -1, qIdx = -1, iIdx = -1, cIdx = -1, rIdx = -1;
      row.forEach((cell, idx) => {
        const c = cell.toLowerCase().trim();
        if (/^(?:name|nazwa|substancja|substance|component)/i.test(c)) nIdx = idx;
        else if (/^(?:qty|quantity|conc|stężenie|w\/w|ilość)/i.test(c)) qIdx = idx;
        else if (/^(?:ident|identyfikator|cas|we|ec)/i.test(c)) iIdx = idx;
        else if (/^(?:classification|class|klasyfikacja|pericol)/i.test(c)) cIdx = idx;
        else if (/^(?:registration|rejestracj|reach)/i.test(c)) rIdx = idx;
      });
      if (nIdx !== -1 && (qIdx !== -1 || iIdx !== -1)) {
        nameColIdx = nIdx;
        qtyColIdx = qIdx;
        identColIdx = iIdx;
        classColIdx = cIdx;
        reachColIdx = rIdx;
        headerRowIdx = i;
        break;
      }
    }

    const components = [];

    if (nameColIdx !== -1) {
      // PRZYPADEK A: Tabela horyzontalna z nagłówkiem kolumnowym (np. Qty | Name | Ident | Classification)
      for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.length === 0) continue;
        const nameVal = (row[nameColIdx] || '').trim();
        if (!nameVal || /^(?:name|nazwa|substancja|substance|qty|quantity|conc|stężenie)/i.test(nameVal)) continue;

        const fullRow = row.join('\n').trim();
        const rawComp = {
          name: nameVal.replace(/\n/g, ' '),
          cas: '',
          ec: '—',
          index: '—',
          reach: '—',
          concentration: '',
          classification: '',
          sclAte: []
        };

        if (qtyColIdx !== -1 && row[qtyColIdx]) {
          rawComp.concentration = row[qtyColIdx].trim();
        }

        // Ekstrakcja CAS z komórki identyfikatorów lub całego wiersza
        const identText = identColIdx !== -1 ? (row[identColIdx] || '') : fullRow;
        const casExplicit = identText.match(/\b(?:CAS|Numer\s*CAS)\s*[:\.]?\s*([1-9]\d{1,6}-\d{2}-\d)\b/i);
        if (casExplicit) {
          rawComp.cas = casExplicit[1];
        } else {
          const casGeneric = identText.match(/(?<![\d-])([1-9]\d{1,6}-\d{2}-\d)(?![\d-])/);
          if (casGeneric) rawComp.cas = casGeneric[1];
        }

        // Ekstrakcja WE / EC
        const ecMatch = identText.match(/\b(?:EC|WE|EINECS|Numer\s*WE)\s*[:\.]?\s*(\d{3}-\d{3}-\d)\b/i);
        if (ecMatch) rawComp.ec = ecMatch[1];

        // Ekstrakcja Index
        const indexMatch = identText.match(/\b(?:INDEX|Indeks|Numer\s*indeksowy)\s*[:\.]?\s*([0-9Xx]{3}-[0-9Xx]{3}-[0-9Xx]{2}-[\dXx])\b/i);
        if (indexMatch) rawComp.index = indexMatch[1];

        // Ekstrakcja REACH
        if (reachColIdx !== -1 && row[reachColIdx]) {
          const rCell = row[reachColIdx].trim();
          const rMatch = rCell.match(/(01-\d{8,10}-\d{2}(?:-[A-Za-z0-9]{2,4})?)/);
          if (rMatch) rawComp.reach = rMatch[1];
          else if (rCell && rCell !== '—') rawComp.reach = rCell;
        } else {
          const reachMatch = fullRow.match(/\b(?:REACH\s*Reg\.?|REACH|Numer\s*rejestracji\s*REACH)\s*[:\.]?\s*(01-\d{8,10}-\d{2}(?:-[A-Za-z0-9]{2,4})?)\b/i);
          if (reachMatch) rawComp.reach = reachMatch[1];
        }

        // Ekstrakcja klasyfikacji
        if (classColIdx !== -1 && row[classColIdx]) {
          rawComp.classification = row[classColIdx].replace(/\n/g, ' ').trim();
        } else {
          for (let cIdx = 0; cIdx < row.length; cIdx++) {
            if (cIdx === nameColIdx || cIdx === qtyColIdx || cIdx === identColIdx) continue;
            const cell = row[cIdx].trim();
            if (/Flam|Eye|Skin|Acute|Aquatic|Sens|STOT|Asp|Muta|Repr|Skin Corr|H\d{3}|EUH\d{3}/i.test(cell)) {
              rawComp.classification = cell.replace(/\n/g, ' ');
              break;
            }
          }
        }

        components.push(rawComp);
      }
    } else {
      // PRZYPADEK B: Układ tradycyjny (blokowy)
      // Odrzucamy powtarzające się nagłówki tabeli (np. na kolejnych stronach)
      const cleanRows = rawRows.filter(r => {
        if (!r || r.length === 0) return false;
        const txt = r.join(' ').toLowerCase();
        if ((txt.includes('identification') || txt.includes('identificazione') || txt.includes('identyfikacja')) &&
            (txt.includes('conc') || txt.includes('stężenie') || txt.includes('classification') || txt.includes('klasyfikacja'))) {
          return false;
        }
        return true;
      });

      let currentComp = null;

      for (const row of cleanRows) {
        const col0 = (row[0] || '').trim();
        const fullRow = row.join('\n').trim();

        const isIdentifierRow = /^(?:INDEX|EC|CAS|REACH|Numer\s*(?:WE|CAS|indeksowy|rejestracji))\b/i.test(col0);

        // Nowy komponent w formacie blokowym rozpoczyna się, gdy col0 to nazwa substancji
        if (col0 && !isIdentifierRow) {
          if (currentComp && (currentComp.name || currentComp.cas)) {
            components.push(currentComp);
          }
          currentComp = {
            name: col0.replace(/\n/g, ' '),
            cas: '',
            ec: '—',
            index: '—',
            reach: '—',
            concentration: '',
            classification: '',
            sclAte: []
          };
        } else if (!currentComp) {
          currentComp = {
            name: '',
            cas: '',
            ec: '—',
            index: '—',
            reach: '—',
            concentration: '',
            classification: '',
            sclAte: []
          };
        }

        // Ekstrakcja CAS - priorytet dla frazy CAS: X-X-X, aby uniknąć kolizji z końcówką INDEX
        const casExplicit = fullRow.match(/\b(?:CAS|Numer\s*CAS)\s*[:\.]?\s*([1-9]\d{1,6}-\d{2}-\d)\b/i);
        if (casExplicit && !currentComp.cas) {
          currentComp.cas = casExplicit[1];
        } else if (!currentComp.cas && !fullRow.includes('INDEX') && !fullRow.includes('Indeks')) {
          const casGeneric = fullRow.match(/(?<![\d-])([1-9]\d{1,6}-\d{2}-\d)(?![\d-])/);
          if (casGeneric) currentComp.cas = casGeneric[1];
        }

        // Ekstrakcja WE / EC
        const ecMatch = fullRow.match(/\b(?:EC|WE|EINECS|Numer\s*WE)\s*[:\.]?\s*(\d{3}-\d{3}-\d)\b/i);
        if (ecMatch && currentComp.ec === '—') {
          currentComp.ec = ecMatch[1];
        }

        // Ekstrakcja Index (wykluczamy "INDEX -")
        const indexMatch = fullRow.match(/\b(?:INDEX|Indeks|Numer\s*indeksowy)\s*[:\.]?\s*([0-9Xx]{3}-[0-9Xx]{3}-[0-9Xx]{2}-[\dXx])\b/i);
        if (indexMatch && currentComp.index === '—') {
          currentComp.index = indexMatch[1];
        }

        // Ekstrakcja REACH
        const reachMatch = fullRow.match(/\b(?:REACH\s*Reg\.?|REACH|Numer\s*rejestracji\s*REACH)\s*[:\.]?\s*(01-\d{8,10}-\d{2}(?:-[A-Za-z0-9]{2,4})?)\b/i);
        if (reachMatch && currentComp.reach === '—') {
          currentComp.reach = reachMatch[1];
        }

        // Ekstrakcja stężenia
        for (const cell of row) {
          const concM = cell.match(/(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%\s*(?:-\s*(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%)?|\b\d+(?:[.,]\d+)?\s*≤\s*x\s*<\s*\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s*<\s*x\s*<\s*\d+(?:[.,]\d+)?/i);
          if (concM && !currentComp.concentration) {
            currentComp.concentration = concM[0].trim();
          }
        }

        // Ekstrakcja klasyfikacji CLP i uwag SCL / ATE
        for (let cIdx = 1; cIdx < row.length; cIdx++) {
          const cell = row[cIdx].trim();
          if (!cell) continue;
          if (cell === currentComp.concentration) continue;

          if (/Flam|Eye|Skin|Acute|Aquatic|Sens|STOT|Asp|Muta|Repr|Skin Corr|H\d{3}|EUH\d{3}|Substance with a community|Classification note/i.test(cell)) {
            if (!currentComp.classification) {
              currentComp.classification = cell.replace(/\n/g, ' ');
            } else {
              currentComp.classification += `, ${cell.replace(/\n/g, ' ')}`;
            }
          } else if (/ATE|LD50|LC50|SCL|M=|M\s*=\s*\d+/i.test(cell)) {
            currentComp.sclAte.push(cell.replace(/\n/g, ' '));
          }
        }
      }

      if (currentComp && (currentComp.name || currentComp.cas)) {
        components.push(currentComp);
      }
    }

    // Formatowanie końcowe każdego komponentu
    return components.map(c => {
      const rawName = (c.name || '').trim();
      let plName = rawName;

      if (typeof resolvedSubstances === 'function') {
        plName = resolvedSubstances(c.cas, rawName, c.ec) || rawName;
      } else if (c.cas && resolvedSubstances[c.cas]) {
        plName = resolvedSubstances[c.cas];
      }

      // Formatowanie i uzupełnianie symbolu % przy stężeniu jeśli brakuje
      let formattedConc = c.concentration ? c.concentration.trim() : '—';
      if (formattedConc && formattedConc !== '—' && !formattedConc.includes('%') && /\d/.test(formattedConc)) {
        formattedConc += ' %';
      }

      const idParts = [
        `Numer CAS: ${c.cas || '—'}`,
        `Numer WE: ${c.ec || '—'}`
      ];
      if (c.index && c.index !== '—') idParts.push(`Numer indeksowy: ${c.index}`);
      if (c.reach && c.reach !== '—') idParts.push(`Numer rejestracji REACH:\n${c.reach}`);

      let fullClass = c.classification || '';
      if (c.sclAte && c.sclAte.length > 0) {
        fullClass += (fullClass ? ', ' : '') + c.sclAte.join(', ');
      }

      // Translacja urzędowych uwag i fraz CLP (art. 17 ustawy o substancjach chemicznych)
      fullClass = fullClass
        .replace(/Substance with a community workplace exposure limit\.?/gi, 'Substancja z określonymi na poziomie Wspólnoty najwyższymi dopuszczalnymi stężeniami w środowisku pracy.')
        .replace(/Classification note according to Annex VI to the CLP Regulation:\s*([A-Za-z0-9]+)/gi, 'Uwaga $1 (zgodnie z załącznikiem VI do rozporządzenia CLP)')
        .replace(/Classification note:\s*([A-Za-z0-9]+)/gi, 'Uwaga $1')
        .replace(/ATE Inhalation vapours[:\.]?\s*/gi, 'ATE (inhalacyjnie, pary): ')
        .replace(/ATE Inhalation mists\/powders[:\.]?\s*/gi, 'ATE (inhalacyjnie, pyły/mgły): ')
        .replace(/ATE Oral[:\.]?\s*/gi, 'ATE (droga pokarmowa): ')
        .replace(/ATE Dermal[:\.]?\s*/gi, 'ATE (na skórę): ');

      return {
        cas: c.cas || '',
        name: plName || rawName,
        originalName: rawName,
        ec: c.ec || '—',
        index: c.index || '—',
        reach: c.reach || '—',
        identifiers: idParts.join('\n'),
        classification: fullClass.trim(),
        concentration: formattedConc
      };
    });
  }
}

module.exports = {
  SDSDocxParser
};
