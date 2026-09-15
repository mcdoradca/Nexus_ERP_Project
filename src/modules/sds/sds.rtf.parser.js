/**
 * SDS RTF Parser (Rich Text Format Extractor)
 * W 100% natywna implementacja maszyny stanów RTF dla środowiska Node.js (Zero Dependencies).
 * 
 * Odpowiada za:
 * 1. Bezstratną ekstrakcję geometrii tabel (\cell -> separator kolumn \t, \row -> \n).
 * 2. Dekodowanie encji Unicode (\uN z obsługą signed 16-bit i parametru \ucN).
 * 3. Dekodowanie stron kodowych ANSI/Windows (\'xx dla CP1250 [PL] i CP1252 [EN/IT/FR/DE]).
 * 4. Eliminację bloków metadanych ({\fonttbl...}, {\colortbl...}, {\stylesheet...}, {\*...}).
 * 5. Zachowanie integralności symboli chemicznych i relacji (≤, ≥, %, mg/m³, °C, BCF, CAS).
 */

const fs = require('fs');

class SDSRTFParser {
  // Tablica mapowania bajtów 0x80 - 0xFF dla Windows-1250 (Central European / Polish)
  static CP1250_MAP = {
    0x80: '\u20AC', 0x82: '\u201A', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021',
    0x89: '\u2030', 0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u015A', 0x8D: '\u0164', 0x8E: '\u017D', 0x8F: '\u0179',
    0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
    0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A', 0x9C: '\u015B', 0x9D: '\u0165', 0x9E: '\u017E', 0x9F: '\u017A',
    0xA0: '\u00A0', 0xA1: '\u02C7', 0xA2: '\u02D8', 0xA3: '\u0141', 0xA4: '\u00A4', 0xA5: '\u0104', 0xA6: '\u00A6', 0xA7: '\u00A7',
    0xA8: '\u00A8', 0xA9: '\u00A9', 0xAA: '\u015E', 0xAB: '\u00AB', 0xAC: '\u00AC', 0xAD: '\u00AD', 0xAE: '\u00AE', 0xAF: '\u017B',
    0xB0: '\u00B0', 0xB1: '\u00B1', 0xB2: '\u02DB', 0xB3: '\u0142', 0xB4: '\u00B4', 0xB5: '\u00B5', 0xB6: '\u00B6', 0xB7: '\u00B7',
    0xB8: '\u00B8', 0xB9: '\u0105', 0xBA: '\u015F', 0xBB: '\u00BB', 0xBC: '\u013D', 0xBD: '\u02DD', 0xBE: '\u013E', 0xBF: '\u017C',
    0xC0: '\u0154', 0xC1: '\u00C1', 0xC2: '\u00C2', 0xC3: '\u0102', 0xC4: '\u00C4', 0xC5: '\u0139', 0xC6: '\u0106', 0xC7: '\u00C7',
    0xC8: '\u010C', 0xC9: '\u00C9', 0xCA: '\u0118', 0xCB: '\u00CB', 0xCC: '\u011A', 0xCD: '\u00CD', 0xCE: '\u00CE', 0xCF: '\u010E',
    0xD0: '\u0110', 0xD1: '\u0143', 0xD2: '\u0147', 0xD3: '\u00D3', 0xD4: '\u00D4', 0xD5: '\u0150', 0xD6: '\u00D6', 0xD7: '\u00D7',
    0xD8: '\u0158', 0xD9: '\u016E', 0xDA: '\u00DA', 0xDB: '\u0170', 0xDC: '\u00DC', 0xDD: '\u00DD', 0xDE: '\u0162', 0xDF: '\u00DF',
    0xE0: '\u0155', 0xE1: '\u00E1', 0xE2: '\u00E2', 0xE3: '\u0103', 0xE4: '\u00E4', 0xE5: '\u013A', 0xE6: '\u0107', 0xE7: '\u00E7',
    0xE8: '\u010D', 0xE9: '\u00E9', 0xEA: '\u0119', 0xEB: '\u00EB', 0xEC: '\u011B', 0xED: '\u00ED', 0xEE: '\u00EE', 0xEF: '\u010F',
    0xF0: '\u0111', 0xF1: '\u0144', 0xF2: '\u0148', 0xF3: '\u00F3', 0xF4: '\u00F4', 0xF5: '\u0151', 0xF6: '\u00F6', 0xF7: '\u00F7',
    0xF8: '\u0159', 0xF9: '\u016F', 0xFA: '\u00FA', 0xFB: '\u0171', 0xFC: '\u00FC', 0xFD: '\u00FD', 0xFE: '\u0163', 0xFF: '\u02D9'
  };

  // Tablica mapowania bajtów 0x80 - 0xFF dla Windows-1252 (Western European / Italian / German / French)
  static CP1252_MAP = {
    0x80: '\u20AC', 0x82: '\u201A', 0x83: '\u0192', 0x84: '\u201E', 0x85: '\u2026', 0x86: '\u2020', 0x87: '\u2021',
    0x88: '\u02C6', 0x89: '\u2030', 0x8A: '\u0160', 0x8B: '\u2039', 0x8C: '\u0152', 0x8E: '\u017D',
    0x91: '\u2018', 0x92: '\u2019', 0x93: '\u201C', 0x94: '\u201D', 0x95: '\u2022', 0x96: '\u2013', 0x97: '\u2014',
    0x98: '\u02DC', 0x99: '\u2122', 0x9A: '\u0161', 0x9B: '\u203A', 0x9C: '\u0153', 0x9E: '\u017E', 0x9F: '\u0178',
    0xA0: '\u00A0', 0xA1: '\u00A1', 0xA2: '\u00A2', 0xA3: '\u00A3', 0xA4: '\u00A4', 0xA5: '\u00A5', 0xA6: '\u00A6', 0xA7: '\u00A7',
    0xA8: '\u00A8', 0xA9: '\u00A9', 0xAA: '\u00AA', 0xAB: '\u00AB', 0xAC: '\u00AC', 0xAD: '\u00AD', 0xAE: '\u00AE', 0xAF: '\u00AF',
    0xB0: '\u00B0', 0xB1: '\u00B1', 0xB2: '\u00B2', 0xB3: '\u00B3', 0xB4: '\u00B4', 0xB5: '\u00B5', 0xB6: '\u00B6', 0xB7: '\u00B7',
    0xB8: '\u00B8', 0xB9: '\u00B9', 0xBA: '\u00BA', 0xBB: '\u00BB', 0xBC: '\u00BC', 0xBD: '\u00BD', 0xBE: '\u00BE', 0xBF: '\u00BF',
    0xC0: '\u00C0', 0xC1: '\u00C1', 0xC2: '\u00C2', 0xC3: '\u00C3', 0xC4: '\u00C4', 0xC5: '\u00C5', 0xC6: '\u00C6', 0xC7: '\u00C7',
    0xC8: '\u00C8', 0xC9: '\u00C9', 0xCA: '\u00CA', 0xCB: '\u00CB', 0xCC: '\u00CC', 0xCD: '\u00CD', 0xCE: '\u00CE', 0xCF: '\u00CF',
    0xD0: '\u00D0', 0xD1: '\u00D1', 0xD2: '\u00D2', 0xD3: '\u00D3', 0xD4: '\u00D4', 0xD5: '\u00D5', 0xD6: '\u00D6', 0xD7: '\u00D7',
    0xD8: '\u00D8', 0xD9: '\u00D9', 0xDA: '\u00DA', 0xDB: '\u00DB', 0xDC: '\u00DC', 0xDD: '\u00DD', 0xDE: '\u00DE', 0xDF: '\u00DF',
    0xE0: '\u00E0', 0xE1: '\u00E1', 0xE2: '\u00E2', 0xE3: '\u00E3', 0xE4: '\u00E4', 0xE5: '\u00E5', 0xE6: '\u00E6', 0xE7: '\u00E7',
    0xE8: '\u00E8', 0xE9: '\u00E9', 0xEA: '\u00EA', 0xEB: '\u00EB', 0xEC: '\u00EC', 0xED: '\u00ED', 0xEE: '\u00EE', 0xEF: '\u00EF',
    0xF0: '\u00F0', 0xF1: '\u00F1', 0xF2: '\u00F2', 0xF3: '\u00F3', 0xF4: '\u00F4', 0xF5: '\u00F5', 0xF6: '\u00F6', 0xF7: '\u00F7',
    0xF8: '\u00F8', 0xF9: '\u00F9', 0xFA: '\u00FA', 0xFB: '\u00FB', 0xFC: '\u00FC', 0xFD: '\u00FD', 0xFE: '\u00FE', 0xFF: '\u00FF'
  };

  /**
   * Zestaw grup RTF, których zawartość tekstowa to wyłącznie metadane lub struktury techniczne.
   */
  static IGNORABLE_GROUPS = new Set([
    'fonttbl', 'colortbl', 'stylesheet', 'info', 'docprops', 'themedata',
    'datastore', 'generator', 'footer', 'footerl', 'footerr', 'footerf',
    'pict', 'object', 'keywords', 'author', 'buptim', 'creatim', 'version',
    'edmins', 'nofpages', 'nofwords', 'nofchars', 'nofcharsws', 'vern', 'xmlnstbl'
  ]);

  /**
   * Główna funkcja ekstrakcji tekstu z pliku .rtf
   * @param {string} filePath Ścieżka do pliku RTF
   * @returns {Promise<string>} Zlinearyzowany, zdekodowany tekst dokumentu
   */
  static async extractTextFromRtf(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Plik nie istnieje: ${filePath}`);
      }
      const rawBuffer = fs.readFileSync(filePath);
      const rtfString = rawBuffer.toString('binary');
      return this.parseRtfString(rtfString);
    } catch (err) {
      console.error(`[SDSRTFParser] Błąd odczytu pliku RTF (${filePath}):`, err.message);
      throw err;
    }
  }

  /**
   * Dekoder ciągów znaków RTF do czystego tekstu w oparciu o maszynę stanów.
   * @param {string} rtfString Surowa zawartość RTF
   * @returns {string} Zdekodowany tekst
   */
  static parseRtfString(rtfString) {
    if (!rtfString || typeof rtfString !== 'string') return '';

    // Detekcja domyślnej strony kodowej dokumentu z nagłówka
    let docCodePage = 1252; // domyślnie Europa Zachodnia (włoskie/angielskie SDS)
    const cpgMatch = rtfString.slice(0, 1000).match(/\\ansicpg(\d+)/i);
    if (cpgMatch) {
      docCodePage = parseInt(cpgMatch[1], 10);
    } else if (/\\deflang1045/i.test(rtfString.slice(0, 1000))) {
      docCodePage = 1250;
    }

    const groupStack = [];
    let currentGroup = {
      ignorable: false,
      uc: 1, // Domyślna liczba znaków zastępczych po \uN
      inTable: false
    };

    let result = '';
    const len = rtfString.length;
    let i = 0;
    let skipCharsCount = 0;

    while (i < len) {
      const char = rtfString[i];

      // Obsługa pomijania znaków zastępczych po sekwencji \uN (np. znak '?' lub \'xx po Unicode)
      if (skipCharsCount > 0) {
        if (char === '\\' && rtfString[i + 1] === "'") {
          i += 4; // Pomija sekwencję \'xx (4 znaki: \, ', x, x)
          skipCharsCount--;
          continue;
        }
        skipCharsCount--;
        i++;
        continue;
      }

      if (char === '{') {
        groupStack.push({ ...currentGroup });
        i++;
        continue;
      }

      if (char === '}') {
        if (groupStack.length > 0) {
          currentGroup = groupStack.pop();
        }
        i++;
        continue;
      }

      if (char === '\\') {
        i++;
        if (i >= len) break;

        const nextChar = rtfString[i];

        // 1. Obsługa znaków ucieczki: \{, \}, \\
        if (nextChar === '{' || nextChar === '}' || nextChar === '\\') {
          if (!currentGroup.ignorable) {
            result += nextChar;
          }
          i++;
          continue;
        }

        // 2. Obsługa znaku gwiazdki: {\*...} (grupa opcjonalna/ignorowalna)
        if (nextChar === '*') {
          currentGroup.ignorable = true;
          i++;
          continue;
        }

        // 3. Obsługa bajtów heksadecymalnych: \'xx
        if (nextChar === "'") {
          i++;
          if (i + 2 <= len) {
            const hex = rtfString.slice(i, i + 2);
            i += 2;
            if (!currentGroup.ignorable) {
              const byteVal = parseInt(hex, 16);
              if (!isNaN(byteVal)) {
                if (byteVal === 0x3d) {
                  result += '=';
                } else if (byteVal < 128) {
                  result += String.fromCharCode(byteVal);
                } else {
                  // Wybór strony kodowej (CP1250 vs CP1252)
                  const map = (docCodePage === 1250) ? this.CP1250_MAP : this.CP1252_MAP;
                  result += map[byteVal] || String.fromCharCode(byteVal);
                }
              }
            }
          }
          continue;
        }

        // 4. Obsługa spacji nierozdzielającej: \~
        if (nextChar === '~') {
          if (!currentGroup.ignorable) result += ' ';
          i++;
          continue;
        }

        // 5. Obsługa łącznika nierozdzielającego: \_
        if (nextChar === '_') {
          if (!currentGroup.ignorable) result += '-';
          i++;
          continue;
        }

        // 6. Obsługa łącznika opcjonalnego: \-
        if (nextChar === '-') {
          i++;
          continue;
        }

        // 7. Odczyt słowa kluczowego (control word): \[a-zA-Z]+(-?\d+)?
        let word = '';
        while (i < len && /[a-zA-Z]/.test(rtfString[i])) {
          word += rtfString[i];
          i++;
        }

        let param = '';
        let hasParam = false;
        if (i < len && (rtfString[i] === '-' || /[0-9]/.test(rtfString[i]))) {
          hasParam = true;
          if (rtfString[i] === '-') {
            param += '-';
            i++;
          }
          while (i < len && /[0-9]/.test(rtfString[i])) {
            param += rtfString[i];
            i++;
          }
        }

        // Zgodnie ze specyfikacją RTF: pojedyncza spacja po słowie kluczowym jest separatorem i jest połykana
        if (i < len && rtfString[i] === ' ') {
          i++;
        }

        const lowerWord = word.toLowerCase();

        // Sprawdzenie grup metadanych
        if (this.IGNORABLE_GROUPS.has(lowerWord)) {
          currentGroup.ignorable = true;
          continue;
        }

        // Zmiana parametru pomijania bajtów zastępczych po Unicode: \ucN
        if (lowerWord === 'uc' && hasParam) {
          currentGroup.uc = parseInt(param, 10);
          continue;
        }

        // Zmiana bieżącej strony kodowej w locie: \cpgN lub \ansicpgN
        if ((lowerWord === 'cpg' || lowerWord === 'ansicpg') && hasParam) {
          docCodePage = parseInt(param, 10);
          continue;
        }

        // Obsługa Unicode: \uN
        if (lowerWord === 'u' && hasParam) {
          if (!currentGroup.ignorable) {
            let code = parseInt(param, 10);
            if (code < 0) {
              code += 65536; // Konwersja z 16-bitowego signed integer
            }
            result += String.fromCharCode(code);
            skipCharsCount = currentGroup.uc;
          }
          continue;
        }

        // Tabele RTF: \trowd, \cell, \row
        if (lowerWord === 'trowd') {
          currentGroup.inTable = true;
          continue;
        }

        if (lowerWord === 'cell') {
          if (!currentGroup.ignorable) {
            result += '\t'; // Separator komórek tabeli
          }
          continue;
        }

        if (lowerWord === 'row') {
          if (!currentGroup.ignorable) {
            result += '\n'; // Koniec wiersza tabeli
          }
          currentGroup.inTable = false;
          continue;
        }

        // Akapity i łamanie wierszy: \par, \line, \page
        if (lowerWord === 'par' || lowerWord === 'line' || lowerWord === 'page') {
          if (!currentGroup.ignorable) {
            result += '\n';
          }
          continue;
        }

        // Tabulator: \tab
        if (lowerWord === 'tab') {
          if (!currentGroup.ignorable) result += '\t';
          continue;
        }

        // Symbole matematyczne/specjalne RTF
        if (lowerWord === 'bullet') {
          if (!currentGroup.ignorable) result += '•';
          continue;
        }
        if (lowerWord === 'endash') {
          if (!currentGroup.ignorable) result += '–';
          continue;
        }
        if (lowerWord === 'emdash') {
          if (!currentGroup.ignorable) result += '—';
          continue;
        }
        if (lowerWord === 'lquote') {
          if (!currentGroup.ignorable) result += '‘';
          continue;
        }
        if (lowerWord === 'rquote') {
          if (!currentGroup.ignorable) result += '’';
          continue;
        }
        if (lowerWord === 'ldblquote') {
          if (!currentGroup.ignorable) result += '“';
          continue;
        }
        if (lowerWord === 'rdblquote') {
          if (!currentGroup.ignorable) result += '”';
          continue;
        }

        continue;
      }

      // Zwykłe znaki tekstowe
      if (!currentGroup.ignorable) {
        // Ignorujemy surowe znaki \r i \n w strumieniu RTF (podziały wierszy w pliku RTF to tylko podziały kodu, nie tekstu)
        if (char !== '\r' && char !== '\n') {
          result += char;
        }
      }

      i++;
    }

    return this.cleanExtractedText(result);
  }

  /**
   * Normalizacja i czyszczenie wyekstrahowanego tekstu
   * @param {string} text Tekst surowy
   * @returns {string} Wyczyszczony tekst
   */
  static cleanExtractedText(text) {
    if (!text) return '';

    return text
      // Normalizacja wielokrotnych spacji i tabulatorów w wierszach
      .replace(/[ \t]{2,}/g, (match) => match.includes('\t') ? '\t' : ' ')
      // Usuwanie spacji wokół końców linii
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      // Normalizacja potrójnych i większych przerw między akapitami do podwójnego \n
      .replace(/\n{3,}/g, '\n\n')
      // Zapewnienie spacji przy operatorach relacyjnych chemii
      .replace(/([≤≥<=>])\s*(\d)/g, '$1 $2')
      .trim();
  }
}

module.exports = { SDSRTFParser };
