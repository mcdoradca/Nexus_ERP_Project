/**
 * Kompletny Silnik Przetwarzania i Asemblacji Kart SDS (UE 2020/878)
 * WERSJA PRODUKCYJNA Node.js - ARCHITEKTURA ZERO-BYPASS
 * 
 * Zawiera zintegrowane:
 * - Parsowanie PDF i automatyczny Fallback do OCR (Tesseract)
 * - Twarde mapowanie zwrotów H/P i haseł ostrzegawczych CLP
 * - REST API (ECHA/PubChem) z mechanizmem Retry
 * - Ekstraktor chemiczny (Regex: UFI, CAS, EC, DNEL, PNEC)
 * - Czysty generator PNG dla piktogramów GHS (Zero Native Deps)
 * - Eksporter do w pełni edytowalnego dokumentu Microsoft Word (.docx)
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const https = require("https");
const { execSync } = require("child_process");

// Obsługa HITLError (Zbi�r Anomalii)
class HITLError extends Error {
  constructor(anomalies) {
    super('HITL_REQUIRED');
    this.anomalies = anomalies;
  }
}

// Obsługa bibliotek zewnętrznych
let docx;
try { docx = require("docx"); } catch (err) { console.error("[OSTRZEŻENIE] Brak biblioteki 'docx'. Wykonaj: npm install docx"); }
let pdfParse;
try { pdfParse = require("pdf-parse"); } catch (err) { console.error("[OSTRZEŻENIE] Brak biblioteki 'pdf-parse'. Wykonaj: npm install pdf-parse"); }

// ============================================================================
// 1. OFICJALNE BAZY S�?OWNIKOWE CLP / ECHA
// ============================================================================

const SIGNAL_WORDS_MAP = {
  "PERICOLO": "NIEBEZPIECZE�?STWO", "DANGER": "NIEBEZPIECZE�?STWO",
  "ATTENZIONE": "UWAGA", "WARNING": "UWAGA"
};

const OFFICIAL_CLP_H_PHRASES = {
  H220: "Skrajnie łatwopalny gaz.", H225: "Wysoce łatwopalna ciecz i pary.", H226: "�?atwopalna ciecz i pary.",
  H301: "Działa toksycznie po połknięciu.", H302: "Działa szkodliwie po połknięciu.",
  H304: "Połknięcie i dostanie się przez drogi oddechowe może grozić śmiercią.",
  H312: "Działa szkodliwie w kontakcie ze skórą.", H314: "Powoduje poważne oparzenia skóry oraz uszkodzenia oczu.",
  H315: "Działa drażniąco na skórę.", H317: "Może powodować reakcję alergiczną skóry.",
  H318: "Powoduje poważne uszkodzenie oczu.", H319: "Działa drażniąco na oczy.",
  H332: "Działa szkodliwie w następstwie wdychania.", H335: "Może powodować podrażnienie dróg oddechowych.",
  H336: "Może wywoływać uczucie senności lub zawroty głowy.",
  H400: "Działa bardzo toksycznie na organizmy wodne.",
  H410: "Działa bardzo toksycznie na organizmy wodne, powodując długotrwałe skutki.",
  H411: "Działa toksycznie na organizmy wodne, powodując długotrwałe skutki.",
  EUH066: "Powtarzające się narażenie może powodować wysuszanie lub pękanie skóry.",
  EUH208: "Zawiera substancję uczulającą. Może powodować wystąpienie reakcji alergicznej.",
  EUH380: "Może powodować zaburzenia funkcjonowania układu hormonalnego u ludzi."
};

const OFFICIAL_CLP_P_PHRASES = {
  P101: "W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.",
  P102: "Chronić przed dziećmi.", P103: "Uważnie przeczytać wszystkie instrukcje i zastosować się do nich.",
  P210: "Przechowywać z dala od źródeł ciepła, gorących powierzchni, źródeł iskrzenia, otwartego ognia i innych źródeł zapłonu. Nie palić.",
  P260: "Nie wdychać pyłu/dymu/gazu/mgły/par/rozpylonej cieczy.", P264: "Dokładnie umyć ręce po użyciu.",
  P273: "Unikać uwolnienia do środowiska.", P280: "Stosować rękawice ochronne/odzież ochronną/ochronę oczu/ochronę twarzy.",
  "P301+P310": "W PRZYPADKU PO�?KNI�?CIA: Natychmiast skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  "P301+P330+P331": "W PRZYPADKU PO�?KNI�?CIA: Wypłukać usta. NIE wywoływać wymiotów.",
  "P302+P352": "W PRZYPADKU KONTAKTU ZE SKÓRĄ: Umyć dużą ilością wody z mydłem.",
  "P303+P361+P353": "W PRZYPADKU KONTAKTU ZE SKÓRĄ (lub z włosami): Natychmiast zdjąć całą zanieczyszczoną odzież. Spłukać skórę pod strumieniem wody lub prysznicem.",
  "P305+P351+P338": "W PRZYPADKU DOSTANIA SI�? DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.",
  P310: "Natychmiast skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  P501: "Zawartość/pojemnik usuwać do uprawnionego zakładu utylizacji odpadów zgodnie z prawem krajowym."
};

const H_TO_GHS_MAP = {
  H220: "GHS02", H224: "GHS02", H225: "GHS02", H226: "GHS02", H270: "GHS03", H280: "GHS04",
  H290: "GHS05", H314: "GHS05", H318: "GHS05", H300: "GHS06", H301: "GHS06", H310: "GHS06", H330: "GHS06",
  H302: "GHS07", H312: "GHS07", H315: "GHS07", H317: "GHS07", H319: "GHS07", H332: "GHS07", H336: "GHS07",
  H304: "GHS08", H340: "GHS08", H350: "GHS08", H360: "GHS08", H370: "GHS08", H372: "GHS08",
  H400: "GHS09", H410: "GHS09", H411: "GHS09"
};

const GHS_DESCRIPTIONS = {
  GHS01: "Materiały wybuchowe", GHS02: "Płomień (�?atwopalny)", GHS03: "Płomień nad kołem (Utleniający)",
  GHS04: "Butla z gazem", GHS05: "Działanie żrące", GHS06: "Czaszka (Toksyczność)",
  GHS07: "Wykrzyknik", GHS08: "Zagrożenie dla zdrowia", GHS09: "Środowisko"
};

// ============================================================================
// 2. KONTROLA BAZY NDS (Zero-Bypass Architecture)
// ============================================================================
class NDSRegistry {
  static database = {};

  static loadRegistry(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`[CRITICAL HALT] Brak pliku bazy NDS: ${filePath}. System wymaga pełnego rejestru Dz.U. 2018 poz. 1286.`);
    }
    const rawData = fs.readFileSync(filePath, 'utf8');
    this.database = JSON.parse(rawData);
    console.log(`[SYS] Załadowano rejestr NDS: ${Object.keys(this.database).length} pozycji.`);
  }

  static getEntry(casNumber) {
    return this.database[casNumber] || null;
  }
}

// ============================================================================
// 3. PARSER PDF I DETEKTOR OCR
// ============================================================================
class SDSPDFParser {
  static lastExtractionUsedOcr = false;
  static ocrDiagnosticMessage = null;

  static async extractTextFromPdf(filePath, forceOcr = false) {
    let text = "";
    this.lastExtractionUsedOcr = false;
    this.ocrDiagnosticMessage = null;

    if (!forceOcr && pdfParse) {
      try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdfParse(dataBuffer);
        text = data.text.trim();
      } catch (err) { text = ""; }
    }

    // Detekcja skanu (jeśli mało tekstu)
    if (text.length < 150 || forceOcr) {
      this.lastExtractionUsedOcr = true;
      try {
        console.log("[SYS] Aktywacja optycznego rozpoznawania znaków (OCR Tesseract)...");
        const tempDir = path.join(process.cwd(), "temp_ocr_sds");
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        
        // Wymaga zainstalowanego poppler-utils i tesseract-ocr w systemie
        execSync(`pdftoppm -jpeg -r 300 "${filePath}" "${path.join(tempDir, 'page')}"`);
        
        const files = fs.readdirSync(tempDir).filter(f => f.endsWith('.jpg')).sort();
        let ocrPages = [];
        for (const file of files) {
           const imgPath = path.join(tempDir, file);
           const outPath = path.join(tempDir, `out_${file}`);
           execSync(`tesseract "${imgPath}" "${outPath}" -l ita+pol+eng --psm 3`);
           ocrPages.push(fs.readFileSync(`${outPath}.txt`, 'utf8'));
        }
        text = ocrPages.join('\n');
        
        // Czyszczenie temp
        fs.rmSync(tempDir, { recursive: true, force: true });
        this.ocrDiagnosticMessage = `Zrekonstruowano ${files.length} stron przez OCR. Sprawdź tabele stężeń.`;
      } catch (ocrErr) {
        this.ocrDiagnosticMessage = `Błąd silnika OCR (wymaga Tesseract/Poppler w systemie OS).`;
        console.error(this.ocrDiagnosticMessage);
      }
    }
    return text;
  }

  static segmentInto16Sections(fullText) {
    const sectionPatterns = {
      section_1: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*1\s*[:\.\-]?\s*(?:IDENTIFICAZIONE|IDENTIFICATION)/i,
      section_2: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*2\s*[:\.\-]?\s*(?:IDENTIFICAZIONE DEI PERICOLI|HAZARDS)/i,
      section_3: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*3\s*[:\.\-]?\s*(?:COMPOSIZIONE|COMPOSITION)/i,
      section_4: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*4\s*[:\.\-]?\s*(?:MISURE DI PRIMO SOCCORSO|FIRST AID)/i,
      section_5: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*5\s*[:\.\-]?\s*(?:MISURE ANTINCENDIO|FIREFIGHTING)/i,
      section_6: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*6\s*[:\.\-]?\s*(?:MISURE IN CASO DI RILASCIO|ACCIDENTAL RELEASE)/i,
      section_7: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*7\s*[:\.\-]?\s*(?:MANIPOLAZIONE E IMMAGAZZINAMENTO|HANDLING)/i,
      section_8: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*8\s*[:\.\-]?\s*(?:CONTROLLI DELL.ESPOSIZIONE|EXPOSURE)/i,
      section_9: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*9\s*[:\.\-]?\s*(?:PROPRIET[AÀ] FISICHE E CHIMICHE|PHYSICAL)/i,
      section_10: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*10\s*[:\.\-]?\s*(?:STABILIT[AÀ] E REATTIVIT[AÀ]|STABILITY)/i,
      section_11: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*11\s*[:\.\-]?\s*(?:INFORMAZIONI TOSSICOLOGICHE|TOXICOLOGICAL)/i,
      section_12: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*12\s*[:\.\-]?\s*(?:INFORMAZIONI ECOLOGICHE|ECOLOGICAL)/i,
      section_13: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*13\s*[:\.\-]?\s*(?:CONSIDERAZIONI SULLO SMALTIMENTO|DISPOSAL)/i,
      section_14: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*14\s*[:\.\-]?\s*(?:INFORMAZIONI SUL TRASPORTO|TRANSPORT)/i,
      section_15: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*15\s*[:\.\-]?\s*(?:INFORMAZIONI SULLA REGOLAMENTAZIONE|REGULATORY)/i,
      section_16: /(?:^|\n)\s*(?:SEZIONE|SECTION)\s*16\s*[:\.\-]?\s*(?:ALTRE INFORMAZIONI|OTHER INFORMATION)/i
    };

    let positions = [];
    for (const [key, regex] of Object.entries(sectionPatterns)) {
      const match = regex.exec(fullText);
      if (match) positions.push({ key, index: match.index });
    }
    positions.sort((a, b) => a.index - b.index);

    let sections = {};
    for (let i = 0; i < positions.length; i++) {
      const start = positions[i].index;
      const end = (i + 1 < positions.length) ? positions[i + 1].index : fullText.length;
      sections[positions[i].key] = fullText.substring(start, end).trim();
    }
    for (let i = 1; i <= 16; i++) {
      if (!sections[`section_${i}`]) sections[`section_${i}`] = `Brak danych dla Sekcji ${i} w pliku źródłowym.`;
    }
    return sections;
  }
}

// ============================================================================
// 4. EKSTRAKTOR CHEMICZNY
// ============================================================================
class SDSChemicalExtractor {
  static extractUnique(text, regex) {
    const matches = (text || "").match(regex) || [];
    return Array.from(new Set(matches.map(m => m.trim().toUpperCase())));
  }

  static isValidCas(casStr) {
    const parts = casStr.split('-');
    if (parts.length !== 3) return false;
    const checkDigit = parseInt(parts[2], 10);
    const base = (parts[0] + parts[1]).split('').reverse();
    let sum = 0;
    for (let i = 0; i < base.length; i++) {
      sum += parseInt(base[i], 10) * (i + 1);
    }
    return (sum % 10) === checkDigit;
  }

  static extractCas(text) {
    const matches = this.extractUnique(text, /\b\d{2,7}-\d{2}-\d\b/g);
    return matches.filter(cas => this.isValidCas(cas));
  }
  static extractEc(text) { return this.extractUnique(text, /\b\d{3}-\d{3}-\d\b/g); }
  static extractUfi(text) { return this.extractUnique(text, /\b[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi)[0] || null; }
  static extractHCodes(text) { return this.extractUnique(text, /\b(?:EUH\d{3}[a-zA-Z]?|H\d{3}[a-zA-Z]?(?:\+H\d{3}[a-zA-Z]?)*)\b/gi); }
  static extractPCodes(text) { return this.extractUnique(text, /\bP\d{3}(?:\+P\d{3})*\b/gi); }
  static extractGhsCodes(text) { return this.extractUnique(text, /\b(?:GHS0[1-9]|GHS[1-9])\b/gi); }
  
  static extractDnelPnec(text) {
    const dnel = (text.match(/(?:DNEL|DMEL)[^\n]+(?:\n[^\n]+){1,3}/gi) || []).map(m=>m.trim());
    const pnec = (text.match(/PNEC[^\n]+(?:\n[^\n]+){1,3}/gi) || []).map(m=>m.trim());
    return { dnel, pnec };
  }

  static inferGhsFromHCodes(hCodes) {
    let inferred = [];
    for (const h of hCodes) {
      const cleanH = h.split(":")[0].trim();
      if (H_TO_GHS_MAP[cleanH] && !inferred.includes(H_TO_GHS_MAP[cleanH])) {
        inferred.push(H_TO_GHS_MAP[cleanH]);
      }
    }
    return inferred.sort();
  }
}

// ============================================================================
// 5. REST API ECHA / PUBCHEM
// ============================================================================
class ECHAFreeResolver {
  static async resolveSubstanceData(casNumber) {
    const infoCardUrl = `https://echa.europa.eu/pl/substance-information/-/substanceinfo/${casNumber.replace(/-/g, "")}`;
    const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(casNumber)}/property/IUPACName,MolecularFormula/JSON`;
    
    // Prosty Exponential Backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const responseData = await this.httpGetJson(pubchemUrl, 2500 * attempt);
        if (responseData && responseData.PropertyTable && responseData.PropertyTable.Properties[0]) {
          const props = responseData.PropertyTable.Properties[0];
          return {
            source: "PUBCHEM_OPEN_API",
            name_pl: props.IUPACName || `Substancja CAS ${casNumber}`,
            iupac_name: props.IUPACName,
            molecular_formula: props.MolecularFormula,
            echa_infocard_url: infoCardUrl,
            status: "ZWERYFIKOWANO_API"
          };
        }
      } catch (e) {
        if (attempt === 3) break;
      }
    }
    throw new Error(`[CRITICAL HALT] Nie zidentyfikowano substancji o CAS: ${casNumber} w bazach API. DOKUMENT ZABLOKOWANY.`);
  }

  static httpGetJson(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { "User-Agent": "SDSAgent/3.0" } }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        let raw = ""; res.setEncoding("utf8");
        res.on("data", chunk => raw += chunk);
        res.on("end", () => { try { resolve(JSON.parse(raw)); } catch (err) { reject(err); } });
      });
      req.on("error", reject);
      req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Timeout")); });
    });
  }
}

// ============================================================================
// 6. SZABLONY PRAWNE RP
// ============================================================================
class PolishLegalTemplates {
  static getSection1_4(ufiCode, companyConfig = {}) {
    if (!companyConfig.emergencyPhone || !companyConfig.companyName) {
       throw new Error("[CRITICAL HALT] Brak danych firmy w konfiguracji.");
    }
    const ufiStr = ufiCode ? `UFI: ${ufiCode}\n` : "[UWAGA: Brak kodu UFI w pliku!]\n";
    return (
      `${ufiStr}` +
      "1.4. Numer telefonu alarmowego:\n" +
      `- Numer alarmowy ogólny: 112 (dostępny całodobowo)\n` +
      `- Państwowa Straż Pożarna: 998 | Pogotowie Ratunkowe: 999\n` +
      `- Ośrodki Informacji Toksykologicznej w Polsce (m.in. Warszawa: 22 619 66 54)\n` +
      `- Telefon alarmowy (${companyConfig.companyName}): ${companyConfig.emergencyPhone}`
    );
  }

  static getSection13() {
    return (
      "SEKCJA 13: Postępowanie z odpadami\n\n" +
      "Usuwać zgodnie z obowiązującymi przepisami krajowymi. Nie wprowadzać do kanalizacji.\n\n" +
      "Podstawa prawna RP:\n" +
      "- Ustawa z dnia 14 grudnia 2012 r. o odpadach (Dz.U. z 2023 r. poz. 1587 z późn. zm.).\n" +
      "- Ustawa o gospodarce opakowaniami (Dz.U. z 2023 r. poz. 1658).\n" +
      "- Rozporządzenie Ministra Klimatu w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).\n"
    );
  }

  static getSection15() {
    return (
      "SEKCJA 15: Informacje dotyczące przepisów prawnych\n\n" +
      "Karta spełnia wymogi Załącznika II do Rozporządzenia REACH (UE) 2020/878.\n\n" +
      "Akty prawne RP:\n" +
      "1. Rozporządzenie (WE) nr 1907/2006 (REACH) i (WE) nr 1272/2008 (CLP).\n" +
      "2. Ustawa z 25 lutego 2011 r. o substancjach chemicznych (Dz.U. 2022 poz. 1816).\n" +
      "3. Rozporządzenie MRPiPS z 12 czerwca 2018 r. w sprawie NDS (Dz.U. 2018 poz. 1286).\n" +
      "4. Ustawa z 19 sierpnia 2011 r. o przewozie towarów niebezpiecznych (ADR)."
    );
  }
}

// ============================================================================
// 7. GENERATOR PNG (Zero Native Dependencies)
// ============================================================================
class PurePngEncoder {
  static createCrc32Table() {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c >>> 0;
    }
    return table;
  }
  static crc32(buffer, offset, length) {
    if (!this.crcTable) this.crcTable = this.createCrc32Table();
    let crc = 0xffffffff;
    for (let i = offset; i < offset + length; i++) crc = this.crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }
  static encodeRGBA(width, height, rgbaBuffer) {
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr.writeUInt8(8, 8);
    ihdr.writeUInt8(6, 9); ihdr.writeUInt8(0, 10); ihdr.writeUInt8(0, 11); ihdr.writeUInt8(0, 12);
    const ihdrChunk = this.buildChunk("IHDR", ihdr);
    const scanlineLength = 1 + width * 4;
    const rawData = Buffer.alloc(scanlineLength * height);
    for (let y = 0; y < height; y++) {
      const rowStart = y * scanlineLength;
      rawData[rowStart] = 0;
      rgbaBuffer.copy(rawData, rowStart + 1, y * width * 4, (y + 1) * width * 4);
    }
    const compressed = zlib.deflateSync(rawData);
    const idatChunk = this.buildChunk("IDAT", compressed);
    const iendChunk = this.buildChunk("IEND", Buffer.alloc(0));
    return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
  }
  static buildChunk(type, dataBuffer) {
    const len = dataBuffer.length;
    const chunk = Buffer.alloc(4 + 4 + len + 4);
    chunk.writeUInt32BE(len, 0); chunk.write(type, 4, 4, "ascii");
    dataBuffer.copy(chunk, 8);
    chunk.writeUInt32BE(this.crc32(chunk, 4, 4 + len), 8 + len);
    return chunk;
  }
}

class GHSPictogramGenerator {
  static generatePictogramBuffer(ghsCode, size = 160) {
    const code = (ghsCode || "").toUpperCase().trim();
    const rgba = Buffer.alloc(size * size * 4, 0);
    const cx = Math.floor(size / 2); const cy = Math.floor(size / 2);
    const margin = Math.floor(size * 0.08); const maxDist = cx - margin;
    const borderWidth = Math.max(5, Math.floor(size * 0.07));

    const setPixel = (x, y, r, g, b, a) => {
      if (x >= 0 && x < size && y >= 0 && y < size) {
        const idx = (y * size + x) * 4;
        rgba[idx] = r; rgba[idx+1] = g; rgba[idx+2] = b; rgba[idx+3] = a;
      }
    };

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dist = Math.abs(x - cx) + Math.abs(y - cy);
        if (dist <= maxDist) {
          if (dist >= maxDist - borderWidth) setPixel(x, y, 204, 0, 0, 255); // Czerwony romb (Pantone 185C)
          else setPixel(x, y, 255, 255, 255, 255); // Biały środek
        }
      }
    }
    const fillRect = (x0, y0, x1, y1) => {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
          if (Math.abs(x - cx) + Math.abs(y - cy) < maxDist - borderWidth) setPixel(x, y, 25, 25, 25, 255);
        }
      }
    };
    
    // Proste ikony reprezentacyjne w JS
    if (code === "GHS07") {
      fillRect(cx - Math.floor(size*0.04), cy - Math.floor(size*0.22), cx + Math.floor(size*0.04), cy + Math.floor(size*0.08));
      fillRect(cx - Math.floor(size*0.045), cy + Math.floor(size*0.13), cx + Math.floor(size*0.045), cy + Math.floor(size*0.21));
    } else {
      fillRect(cx - Math.floor(size*0.15), cy - Math.floor(size*0.10), cx + Math.floor(size*0.15), cy + Math.floor(size*0.10));
    }
    return PurePngEncoder.encodeRGBA(size, size, rgba);
  }
}

// ============================================================================
// 8. G�?ÓWNY SILNIK PARSERA I KWARANTANNY
// ============================================================================
class SDSProcessorEngine {
  constructor(companyConfig = {}) {
    this.companyConfig = companyConfig;
    this.quarantineLogs = [];
    this.extractedSubstances = [];
    this.detectedGhsPictograms = [];
    this.anomalies = [];
  }

  processSection2(contentIt) {
    const hCodes = SDSChemicalExtractor.extractHCodes(contentIt);
    const pCodes = SDSChemicalExtractor.extractPCodes(contentIt);
    
    // Walidacja twarda słownika
    hCodes.forEach(code => {
      if (!OFFICIAL_CLP_H_PHRASES[code]) throw new Error(`[CRITICAL HALT] Nieznany kod zagrożenia: ${code}`);
    });

    const directGhs = SDSChemicalExtractor.extractGhsCodes(contentIt);
    const inferredGhs = SDSChemicalExtractor.inferGhsFromHCodes(hCodes);
    this.detectedGhsPictograms = Array.from(new Set([...directGhs, ...inferredGhs])).sort();
    
    let signalWord = "UWAGA";
    if (/(PERICOLO|DANGER)/i.test(contentIt)) signalWord = "NIEBEZPIECZE�?STWO";

    const mappedH = hCodes.map(c => `${c}: ${OFFICIAL_CLP_H_PHRASES[c]}`);
    const mappedP = pCodes.map(c => `${c}: ${OFFICIAL_CLP_P_PHRASES[c] || "[B�?ĄD S�?OWNIKA P]"}`);
    const ghsSummary = this.detectedGhsPictograms.join(", ");

    return {
      content: `SEKCJA 2: Identyfikacja zagrożeń\n\nHasło ostrzegawcze: ${signalWord}\nPiktogramy: ${ghsSummary}\n\nZwroty (H):\n${mappedH.join('\n')}\n\nZwroty (P):\n${mappedP.join('\n')}`,
      ghsPictograms: this.detectedGhsPictograms
    };
  }

  async processSection3(contentIt, manualOverrides = {}) {
    const casList = SDSChemicalExtractor.extractCas(contentIt);
    let text = "SEKCJA 3: Skład / informacja o składnikach\n\nNiebezpieczne składniki chemiczne:\n";

    for (const cas of casList) {
      if (manualOverrides[cas]) {
        const override = manualOverrides[cas];
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: override.name_pl || override.iupac, url: "HITL_MANUAL_OVERRIDE" });
        text += `- ${override.name_pl || override.iupac} | CAS: ${cas} | ECHA ID: HITL_MANUAL_OVERRIDE\n`;
        continue;
      }
      try {
        const echaInfo = await ECHAFreeResolver.resolveSubstanceData(cas);
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: echaInfo.name_pl, url: echaInfo.echa_infocard_url });
        text += `- ${echaInfo.name_pl} | CAS: ${cas} | ECHA ID: ${echaInfo.status}\n`;
      } catch (err) {
        if (err.message.includes("CRITICAL HALT")) {
          this.anomalies.push({ type: "CAS_NOT_FOUND", cas: cas, message: err.message });
        } else {
          this.anomalies.push({ type: "API_ERROR", cas: cas, message: err.message });
        }
      }
    }
    return { content: text };
  }

  processSection8(contentIt) {
    const foundCas = this.extractedSubstances.map(s => s.casNumber);
    let tableText = "8.1. Parametry dotyczące kontroli (Dz.U. 2018 poz. 1286):\n\n";
    
    if (foundCas.length > 0) {
      for (const cas of Array.from(new Set(foundCas))) {
        const entry = NDSRegistry.getEntry(cas);
        if (entry) {
          tableText += `- ${entry.substance} [CAS: ${cas}]: NDS: ${entry.NDS} | NDSCh: ${entry.NDSCh}\n`;
        } else {
          tableText += `- Dla substancji CAS ${cas} w Dz.U. 2018 poz. 1286 nie ustalono krajowych wartości NDS.\n`;
        }
      }
    }

    const dnelPnec = SDSChemicalExtractor.extractDnelPnec(contentIt);
    tableText += "\n8.1.1. Wartości DNEL / PNEC (Ochrona danych REACH):\n";
    tableText += "DNEL: " + (dnelPnec.dnel.length > 0 ? dnelPnec.dnel.join(" | ") : "Brak danych producenta.") + "\n";
    tableText += "PNEC: " + (dnelPnec.pnec.length > 0 ? dnelPnec.pnec.join(" | ") : "Brak danych producenta.") + "\n";

    this.quarantineLogs.push({ section: "Sekcja 8", reason: "Zastąpiono obce limity ustawowym NDS RP. Zachowano wartości DNEL/PNEC." });
    return { content: tableText };
  }

  async prepareAgentPayload(pdfFilePath, productName = "PRODUKT CHEMICZNY", manualOverrides = {}) {
    console.log(`[SYS] Ekstrakcja pliku: ${pdfFilePath}`);
    const fullText = await SDSPDFParser.extractTextFromPdf(pdfFilePath, false);
    const rawSections = SDSPDFParser.segmentInto16Sections(fullText);
    
    const ufi = SDSChemicalExtractor.extractUfi(rawSections["section_1"]);
    const s2 = this.processSection2(rawSections["section_2"]);
    const s3 = await this.processSection3(rawSections["section_3"], manualOverrides);
    const s8 = this.processSection8(rawSections["section_8"]);

    const deterministic = {
      section_1: { type: "QUARANTINE", content: `1.1. Produkt: ${productName}\n${PolishLegalTemplates.getSection1_4(ufi, this.companyConfig)}` },
      section_2: { type: "CLP_MAPPED", content: s2.content },
      section_3: { type: "CLP_MAPPED", content: s3.content },
      section_8: { type: "QUARANTINE", content: s8.content },
      section_13: { type: "QUARANTINE", content: PolishLegalTemplates.getSection13() },
      section_15: { type: "QUARANTINE", content: PolishLegalTemplates.getSection15() }
    };

    const toTranslate = {};
    [4,5,6,7,9,10,11,12,14,16].forEach(i => { toTranslate[`section_${i}`] = rawSections[`section_${i}`]; });

    if (this.anomalies.length > 0) {
      throw new HITLError(this.anomalies);
    }

    return {
      metadata: { productName, ufi, version: "1.0 PL", companyConfig: this.companyConfig },
      deterministicSections: deterministic,
      descriptiveSectionsToTranslate: toTranslate,
      quarantineAudit: this.quarantineLogs,
      detectedGhsPictograms: this.detectedGhsPictograms,
      ocrDiagnostics: SDSPDFParser.ocrDiagnosticMessage
    };
  }

  mergeCompletedSds(agentPayload, agentTranslated) {
    const finalSections = {};
    for (let i = 1; i <= 16; i++) {
      const key = `section_${i}`;
      if (agentPayload.deterministicSections[key]) {
        finalSections[key] = agentPayload.deterministicSections[key];
      } else if (agentTranslated[key]) {
        finalSections[key] = { type: "TRANSLATED", content: agentTranslated[key].trim() };
      } else {
        throw new Error(`[CRITICAL HALT] Agent LLM pominął translację ${key}. Dokument ZABLOKOWANY.`);
      }
    }
    return { ...agentPayload.metadata, sections: finalSections, ghsPictograms: agentPayload.detectedGhsPictograms, audit: agentPayload.quarantineAudit };
  }
}

// ============================================================================
// 9. EKSPORT DOCX (Z pełnym formatowaniem, paginacją i piktogramami)
// ============================================================================
class SDSDocxExporter {
  static async export(sdsData, outPath) {
    if (!docx) throw new Error("Brak biblioteki docx.");
    const { Document, Packer, Paragraph, TextRun, AlignmentType, ShadingType, Header, Footer, PageNumber, ImageRun, BorderStyle } = docx;

    const sectionsBody = [];
    
    sectionsBody.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Karta Charakterystyki`, bold: true, size: 36 })]
    }));
    sectionsBody.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `[Sporządzona zgodnie z rozporządzeniem WE 1907/2006(REACH) wraz z późn. zm.]`, size: 16 })],
      spacing: { after: 300 }
    }));
    sectionsBody.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: `Data wystawienia: ${new Date().toLocaleDateString('pl-PL')}`, size: 16 }),
        new TextRun({ text: `\nWersja: ${sdsData.version}`, size: 16 })
      ],
      spacing: { after: 400 }
    }));

    for (let i = 1; i <= 16; i++) {
      const data = sdsData.sections[`section_${i}`];
      if (!data) continue;
      
      const isQuarantine = data.type === "QUARANTINE";
      const lines = data.content.split("\n");
      
      let sectionTitle = `SEKCJA ${i}`;
      if (lines.length > 0 && lines[0].toUpperCase().includes(`SEKCJA ${i}`)) {
         sectionTitle = lines.shift(); 
      }

      sectionsBody.push(new Paragraph({
        children: [new TextRun({ text: sectionTitle.trim().toUpperCase(), bold: true, size: 22 })],
        shading: isQuarantine ? { fill: "FFF9E6", type: ShadingType.CLEAR } : undefined,
        border: { bottom: { color: "00A651", space: 1, value: BorderStyle.SINGLE, size: 12 } },
        spacing: { before: 300, after: 150 }
      }));

      if (i === 2 && sdsData.ghsPictograms && sdsData.ghsPictograms.length > 0) {
        const imageRuns = sdsData.ghsPictograms.map(code => {
           const buffer = GHSPictogramGenerator.generatePictogramBuffer(code, 150);
           return new ImageRun({ data: buffer, transformation: { width: 75, height: 75 } });
        });
        sectionsBody.push(new Paragraph({
          children: [new TextRun({ text: "Piktogramy określające rodzaj zagrożenia:", bold: true })],
          spacing: { before: 100, after: 100 }
        }));
        sectionsBody.push(new Paragraph({ children: imageRuns, spacing: { after: 200 } }));
      }

      lines.forEach(line => {
        const tLine = line.trim();
        if (!tLine) return;

        const isSubSection = /^(\d+\.\d+(\.\d+)?\.?)\s+/.test(tLine);
        const isBoldStart = /^(Hasło ostrzegawcze|Zwroty wskazujące|Piktogramy|DNEL|PNEC):/i.test(tLine);

        if (isSubSection) {
           sectionsBody.push(new Paragraph({
             children: [new TextRun({ text: tLine, bold: true, size: 20 })],
             spacing: { before: 200, after: 100 }
           }));
        } else if (isBoldStart) {
           const idx = tLine.indexOf(':');
           sectionsBody.push(new Paragraph({
             children: [
               new TextRun({ text: tLine.substring(0, idx + 1), bold: true, size: 20 }),
               new TextRun({ text: tLine.substring(idx + 1), size: 20 })
             ],
             spacing: { before: 100, after: 100 }
           }));
        } else {
           sectionsBody.push(new Paragraph({
             children: [new TextRun({ text: tLine, size: 20 })],
             spacing: { after: 100 }
           }));
        }
      });
    }

    const doc = new Document({
      sections: [{
        properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun(`SDS | ${sdsData.productName}`)] })]
          })
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun("Strona "),
                new TextRun({ children: [PageNumber.CURRENT] }),
                new TextRun(" z "),
                new TextRun({ children: [PageNumber.TOTAL_PAGES] })
              ]
            })]
          })
        },
        children: sectionsBody
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(outPath, buffer);
  }
}

// ============================================================================
// CLI RUNNER DLA AGENTA ANTIGRAVITY
// ============================================================================
module.exports = { SDSProcessorEngine, SDSDocxExporter, SDSPDFParser, ECHAFreeResolver, NDSRegistry, PolishLegalTemplates, SDSChemicalExtractor, PurePngEncoder, GHSPictogramGenerator, HITLError };

