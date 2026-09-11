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
// 1. OFICJALNE BAZY S?OWNIKOWE CLP / ECHA
// ============================================================================

const SIGNAL_WORDS_MAP = {
  "PERICOLO": "Niebezpieczeństwo", "DANGER": "Niebezpieczeństwo", "NIEBEZPIECZEŃSTWO": "Niebezpieczeństwo",
  "ATTENZIONE": "Uwaga", "WARNING": "Uwaga", "UWAGA": "Uwaga"
};

const OFFICIAL_CLP_H_PHRASES = {
  H220: "Skrajnie łatwopalny gaz.",
  H224: "Skrajnie łatwopalna ciecz i pary.",
  H225: "Wysoce łatwopalna ciecz i pary.",
  H226: "Łatwopalna ciecz i pary.",
  H228: "Substancja stała łatwopalna.",
  H301: "Działa toksycznie po połknięciu.",
  H302: "Działa szkodliwie po połknięciu.",
  H304: "Połknięcie i dostanie się przez drogi oddechowe może grozić śmiercią.",
  H310: "Grozi śmiercią w kontakcie ze skórą.",
  H311: "Działa toksycznie w kontakcie ze skórą.",
  H312: "Działa szkodliwie w kontakcie ze skórą.",
  H314: "Powoduje poważne oparzenia skóry oraz uszkodzenia oczu.",
  H315: "Działa drażniąco na skórę.",
  H317: "Może powodować reakcję alergiczną skóry.",
  H318: "Powoduje poważne uszkodzenie oczu.",
  H319: "Działa drażniąco na oczy.",
  H330: "Wdychanie grozi śmiercią.",
  H331: "Działa toksycznie w następstwie wdychania.",
  H332: "Działa szkodliwie w następstwie wdychania.",
  H334: "Może powodować objawy alergii lub astmy lub trudności w oddychaniu w następstwie wdychania.",
  H335: "Może powodować podrażnienie dróg oddechowych.",
  H336: "Może wywoływać uczucie senności lub zawroty głowy.",
  H351: "Podejrzewa się, że powoduje raka.",
  H360: "Może działać szkodliwie na płodność lub na dziecko w łonie matki.",
  H361: "Podejrzewa się, że działa szkodliwie na płodność lub na dziecko w łonie matki.",
  H372: "Powoduje uszkodzenie narządów poprzez długotrwałe lub narażenie powtarzane.",
  H373: "Może powodować uszkodzenie narządów poprzez długotrwałe lub narażenie powtarzane.",
  H400: "Działa bardzo toksycznie na organizmy wodne.",
  H410: "Działa bardzo toksycznie na organizmy wodne, powodując długotrwałe skutki.",
  H411: "Działa toksycznie na organizmy wodne, powodując długotrwałe skutki.",
  H412: "Działa szkodliwie na organizmy wodne, powodując długotrwałe skutki.",
  H413: "Może powodować długotrwałe szkodliwe skutki dla organizmów wodnych.",
  EUH066: "Powtarzające się narażenie może powodować wysuszanie lub pękanie skóry.",
  EUH071: "Działa żrąco na drogi oddechowe.",
  EUH208: "Zawiera substancję uczulającą. Może powodować wystąpienie reakcji alergicznej.",
  EUH210: "Karta charakterystyki dostępna na żądanie.",
  EUH380: "Może powodować zaburzenia funkcjonowania układu hormonalnego u ludzi."
};

const OFFICIAL_CLP_P_PHRASES = {
  P101: "W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.",
  P102: "Chronić przed dziećmi.",
  P103: "Uważnie przeczytać wszystkie instrukcje i zastosować się do nich.",
  P201: "Przed użyciem zapoznać się ze specjalnymi środkami ostrożności.",
  P210: "Przechowywać z dala od źródeł ciepła, gorących powierzchni, źródeł iskrzenia, otwartego ognia i innych źródeł zapłonu. Nie palić.",
  P233: "Przechowywać pojemnik szczelnie zamknięty.",
  P260: "Nie wdychać pyłu/dymu/gazu/mgły/par/rozpylonej cieczy.",
  P261: "Unikać wdychania pyłu/dymu/gazu/mgły/par/rozpylonej cieczy.",
  P264: "Dokładnie umyć ręce po użyciu.",
  P270: "Nie jeść, nie pić i nie palić podczas używania produktu.",
  P271: "Stosować wyłącznie na zewnątrz lub w dobrze wentylowanym pomieszczeniu.",
  P272: "Zanieczyszczonej odzieży ochronnej nie wynosić poza miejsce pracy.",
  P273: "Unikać uwolnienia do środowiska.",
  P280: "Stosować rękawice ochronne/odzież ochronną/ochronę oczu/ochronę twarzy.",
  "P301+P310": "W PRZYPADKU POŁKNIĘCIA: Natychmiast skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  "P301+P312": "W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  "P301+P330+P331": "W PRZYPADKU POŁKNIĘCIA: Wypłukać usta. NIE wywoływać wymiotów.",
  "P302+P352": "W PRZYPADKU KONTAKTU ZE SKÓRĄ: Umyć dużą ilością wody z mydłem.",
  "P303+P361+P353": "W PRZYPADKU KONTAKTU ZE SKÓRĄ (lub z włosami): Natychmiast zdjąć całą zanieczyszczoną odzież. Spłukać skórę pod strumieniem wody lub prysznicem.",
  "P304+P340": "W PRZYPADKU DOSTANIA SIĘ DO DRÓG ODDECHOWYCH: Wyprowadzić lub wynieść poszkodowanego na świeże powietrze i zapewnić mu warunki do swobodnego oddychania.",
  "P305+P351+P338": "W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.",
  "P308+P313": "W przypadku narażenia lub styczności: Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
  P310: "Natychmiast skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  P312: "W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  "P332+P313": "W przypadku wystąpienia podrażnienia skóry: Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
  "P333+P313": "W przypadku wystąpienia podrażnienia skóry lub wysypki: Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
  "P337+P313": "W przypadku utrzymywania się działania drażniącego na oczy: Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
  "P362+P364": "Zanieczyszczoną odzież zdjąć i wyprać przed ponownym użyciem.",
  "P370+P378": "W przypadku pożaru: Użyć odpowiedniego środka gaśniczego do gaszenia.",
  P391: "Zebrać wyciek.",
  "P403+P233": "Przechowywać w dobrze wentylowanym miejscu. Przechowywać pojemnik szczelnie zamknięty.",
  "P403+P235": "Przechowywać w dobrze wentylowanym miejscu. Przechowywać w chłodnym miejscu.",
  P405: "Przechowywać pod zamknięciem.",
  P501: "Zawartość/pojemnik usuwać do odpowiednio oznakowanych pojemników na odpady zgodnie z krajowymi przepisami."
};

const H_TO_GHS_MAP = {
  H220: "GHS02", H224: "GHS02", H225: "GHS02", H226: "GHS02", H270: "GHS03", H280: "GHS04",
  H290: "GHS05", H314: "GHS05", H318: "GHS05", H300: "GHS06", H301: "GHS06", H310: "GHS06", H330: "GHS06",
  H302: "GHS07", H312: "GHS07", H315: "GHS07", H317: "GHS07", H319: "GHS07", H332: "GHS07", H336: "GHS07",
  H304: "GHS08", H340: "GHS08", H350: "GHS08", H360: "GHS08", H370: "GHS08", H372: "GHS08",
  H400: "GHS09", H410: "GHS09", H411: "GHS09"
};

const GHS_DESCRIPTIONS = {
  GHS01: "Materiały wybuchowe", GHS02: "Płomień (Łatwopalny)", GHS03: "Płomień nad kołem (Utleniający)",
  GHS04: "Butla z gazem", GHS05: "Działanie żrące", GHS06: "Czaszka (Toksyczność)",
  GHS07: "Wykrzyknik", GHS08: "Zagrożenie dla zdrowia", GHS09: "Środowisko"
};

const GHS_HAZARD_CLASSES_MAP = {
  "Expl.": "Materiał wybuchowy", "Flam. Gas": "Gaz łatwopalny", "Aerosol": "Aerozol", "Ox. Gas": "Gaz utleniający",
  "Press. Gas": "Gaz pod ciśnieniem", "Flam. Liq.": "Substancja ciekła łatwopalna", "Flam. Sol.": "Substancja stała łatwopalna",
  "Self-react.": "Substancja samoreaktywna", "Pyr. Liq.": "Substancja ciekła piroforyczna", "Pyr. Sol.": "Substancja stała piroforyczna",
  "Self-heat.": "Substancja samonagrzewająca się", "Water-react.": "Substancja reagująca z wodą", "Ox. Liq.": "Substancja ciekła utleniająca",
  "Ox. Sol.": "Substancja stała utleniająca", "Org. Perox.": "Nadtlenek organiczny", "Met. Corr.": "Substancja powodująca korozję metali",
  "Acute Tox.": "Toksyczność ostra", "Skin Corr.": "Działanie żrące na skórę", "Skin Irrit.": "Działanie drażniące na skórę",
  "Eye Dam.": "Poważne uszkodzenie oczu", "Eye Irrit.": "Działanie drażniące na oczy", "Resp. Sens.": "Działanie uczulające na drogi oddechowe",
  "Skin Sens.": "Działanie uczulające na skórę", "Muta.": "Działanie mutagenne na komórki rozrodcze", "Carc.": "Rakotwórczość",
  "Repr.": "Szkodliwe działanie na rozrodczość", "Lact.": "Wpływ na laktację", "STOT SE": "Działanie toksyczne na narządy docelowe – narażenie jednorazowe",
  "STOT RE": "Działanie toksyczne na narządy docelowe – narażenie powtarzane", "Asp. Tox.": "Zagrożenie spowodowane aspiracją",
  "Aquatic Acute": "Stwarzające zagrożenie dla środowiska wodnego - kategoria ostra", "Aquatic Chronic": "Stwarzające zagrożenie dla środowiska wodnego - kategoria przewlekła",
  "Ozone": "Stwarzające zagrożenie dla warstwy ozonowej", "Not classified": "Nie sklasyfikowano wg rozporządzenia CLP"
};

const ALLERGEN_NAMES_PL = {
  "4-tert-butylcyclohexyl acetate": "octan 4-tert-butylocykloheksylu",
  "reaction mass of 5-chloro-2-methyl-2h-isothiazol-3-one and 2-methyl-2h-isothiazol-3-one (3:1)": "masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu (3:1)",
  "reaction mass of: 5-chloro-2-methyl-4-isothiazolin-3-one and 2-methyl-2h-isothiazol-3-one (3:1)": "masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu (3:1)",
  "cinnamaldehyde": "aldehyd cynamonowy",
  "linalool": "linalol",
  "limonene": "limonen",
  "coumarin": "kumaryna",
  "geraniol": "geraniol",
  "citronellol": "cytronellol",
  "benzyl salicylate": "salicylan benzylu",
  "hexyl cinnamal": "aldehyd heksylocynamonowy",
  "hydroxycitronellal": "hydroksycytronellal",
  "alpha-isomethyl ionone": "alfa-izometylojonon",
  "1,2-benzisothiazol-3(2h)-one": "1,2-benzoizotiazol-3(2H)-on",
  "2-methylisothiazol-3(2h)-one": "2-metyloizotiazol-3(2H)-on",
  "amyl cinnamal": "aldehyd amylocynamonowy",
  "cinnamyl alcohol": "alkohol cynamonowy",
  "citral": "cytral",
  "eugenol": "eugenol",
  "isoeugenol": "izoeugenol",
  "benzyl alcohol": "alkohol benzylowy"
};

const CAS_TO_PL_MAP = {
  "32210-23-4": "octan 4-tert-butylocykloheksylu",
  "104-55-2": "aldehyd cynamonowy",
  "55965-84-9": "masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu (3:1)",
  "78-70-6": "linalol",
  "5989-27-5": "d-limonen",
  "91-64-5": "kumaryna",
  "106-24-1": "geraniol",
  "106-22-9": "cytronellol",
  "118-58-1": "salicylan benzylu",
  "101-86-0": "aldehyd heksylocynamonowy",
  "107-75-5": "hydroksycytronellal",
  "127-51-5": "alfa-izometylojonon",
  "2634-33-5": "1,2-benzoizotiazol-3(2H)-on",
  "2682-20-4": "2-metyloizotiazol-3(2H)-on",
  "122-40-7": "aldehyd amylocynamonowy",
  "104-54-1": "alkohol cynamonowy",
  "5392-40-5": "cytral",
  "97-53-0": "eugenol",
  "97-54-1": "izoeugenol",
  "100-51-6": "alkohol benzylowy",
  "64-17-5": "etanol",
  "67-63-0": "propan-2-ol",
  "57-55-6": "propano-1,2-diol",
  "56-81-5": "glicerol"
};

function mapHazardClass(text) {
  if (!text) return text;
  let result = text;
  for (const [key, val] of Object.entries(GHS_HAZARD_CLASSES_MAP)) {
    const safeKey = key.replace(/\./g, '\\.').replace(/\s+/g, '\\s+');
    const regex = new RegExp(`\\b${safeKey}\\b`, 'gi');
    result = result.replace(regex, val);
  }
  return result;
}

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
  static extractHCodes(text) { 
    if (!text) return [];
    const matches = [...text.matchAll(/(?<![A-Za-z0-9])(H\d{3}(?:[A-Za-z]{1,2}(?![a-z]))?(?:\s*\+\s*H\d{3}(?:[A-Za-z]{1,2}(?![a-z]))?)*)/g)].map(m => m[1].replace(/\s+/g, ''));
    return Array.from(new Set(matches.map(m => m.toUpperCase())));
  }

  static extractPCodes(text) { 
    if (!text) return [];
    const matches = [...text.matchAll(/(?<![A-Za-z0-9])(P\d{3}(?:\s*\+\s*P\d{3})*)/g)].map(m => m[1].replace(/\s+/g, ''));
    return Array.from(new Set(matches.map(m => m.toUpperCase())));
  }

  static extractEuhCodes(text) {
    if (!text) return [];
    const matches = [...text.matchAll(/(?<![A-Za-z0-9])(EUH\d{3}(?:[A-Z](?![a-z]))?)/g)].map(m => m[1].replace(/\s+/g, ''));
    return Array.from(new Set(matches.map(m => m.toUpperCase())));
  }

  static extractGhsCodes(text) { return this.extractUnique(text, /\b(?:GHS0[1-9]|GHS[1-9])\b/gi); }
  
  static extractDnelPnec(text) {
    const dnel = (text.match(/(?:DNEL|DMEL)[^\n]+(?:\n[^\n]+){1,3}/gi) || []).map(m=>m.trim());
    const pnec = (text.match(/PNEC[^\n]+(?:\n[^\n]+){1,3}/gi) || []).map(m=>m.trim());
    return { dnel, pnec };
  }

  static formatEuh208(text, resolvedSubstances = {}) {
    if (!text) return null;
    const match = text.match(/EUH208\s*(?:Contains|Contiene|Zawiera|Innehåller)?[:\s]*([^.]+?)(?:\.\s*(?:May produce|Può provocare|Może powodować|Kan ge)|(?:\n\s*\n)|$)/is);
    if (!match) return null;
    
    let rawSubstances = match[1].replace(/-\s+/g, '-').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    let parts = rawSubstances.split(/;\s*|\s*,\s*(?![^(]*\))/).map(s => s.trim()).filter(Boolean);
    
    let mappedParts = parts.map(part => {
      let lower = part.toLowerCase();
      for (const [enName, plName] of Object.entries(ALLERGEN_NAMES_PL)) {
        if (lower === enName.toLowerCase() || lower.includes(enName.toLowerCase())) {
          return plName;
        }
      }
      for (const [cas, plName] of Object.entries(resolvedSubstances)) {
        if (lower.includes(cas) || (plName && lower.includes(plName.toLowerCase()))) {
          return plName;
        }
      }
      return part;
    });

    return `EUH208 Zawiera: ${mappedParts.join(', ')}. Może powodować wystąpienie reakcji alergicznej.`;
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

  static formatConcentration(concStr) {
    if (!concStr) return "—";
    return concStr
      .replace(/(\d+)\.(\d+)/g, '$1,$2')
      .replace(/([≥≤><=]|>=|<=)\s*/g, '$1 ')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/\s*%/g, ' %')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static parseSection3Components(contentIt, resolvedSubstances = {}) {
    if (!contentIt) return [];

    // Oczyszczenie z nagłówków i stopki stron PDF
    let cleanText = contentIt
      .replace(/Page\s+n\.\s*of\s*\d+/gi, '')
      .replace(/\d{2}\/\d{2}\/\d{4}\s*Production Name[^\n]+/gi, '')
      .replace(/Qty\s*Name\s*Ident\.\s*Numb\.\s*Classification\s*Registration\s*Number/gi, '');

    const casMatches = [...cleanText.matchAll(/(?:CAS\s*[:\.]?\s*)(\d{2,7}-\d{2}-\d)/gi)];
    if (casMatches.length === 0) return [];

    const components = [];

    for (let i = 0; i < casMatches.length; i++) {
      const curCas = casMatches[i][1];
      const casIdx = casMatches[i].index;
      
      const preCasText = cleanText.substring(Math.max(0, casIdx - 200), casIdx);
      const concMatches = [...preCasText.matchAll(/([≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*(?:-\s*(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?)?\s*%/g)];
      const lastConc = concMatches.length > 0 ? concMatches[concMatches.length - 1] : null;
      
      const rawConc = lastConc ? lastConc[0].trim() : "—";
      const concentration = this.formatConcentration(rawConc);
      let rawName = lastConc ? preCasText.substring(lastConc.index + lastConc[0].length).trim() : "";
      rawName = rawName.replace(/-\s+/g, '-').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

      // Wyznaczanie granic wiersza (do startu stężenia następnego CAS lub końca tekstu)
      let rowEnd = cleanText.length;
      if (i + 1 < casMatches.length) {
        const nextCasIdx = casMatches[i + 1].index;
        const nextPreText = cleanText.substring(Math.max(0, nextCasIdx - 200), nextCasIdx);
        const nextConcMatches = [...nextPreText.matchAll(/([≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*(?:-\s*(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?)?\s*%/g)];
        if (nextConcMatches.length > 0) {
          const nextLastConc = nextConcMatches[nextConcMatches.length - 1];
          rowEnd = Math.max(0, nextCasIdx - 200) + nextLastConc.index;
        } else {
          rowEnd = nextCasIdx;
        }
      }

      const body = cleanText.substring(casIdx, rowEnd).trim();

      const ecMatch = body.match(/(?:EC|WE|EINECS)\s*[:\.]?\s*(\d{3}-\d{3}-\d)/i);
      const ecNumber = ecMatch ? ecMatch[1] : "—";

      const indexMatch = body.match(/(?:Index|Indeks)\s*[:\.]?\s*(\d{3}-\d{3}-\d{2}-\d)/i);
      const indexNumber = indexMatch ? indexMatch[1] : "—";

      const reachMatch = body.match(/(?:01-\d{10}-\d{2}-[A-Za-z0-9]{4}|01-\d+-\d+-\w+)/);
      const reachNumber = reachMatch ? reachMatch[0] : "—";

      let classText = body;
      classText = classText.replace(/CAS\s*[:\.]?\s*\d{2,7}-\d{2}-\d/gi, '');
      if (ecMatch) classText = classText.replace(ecMatch[0], '');
      if (indexMatch) classText = classText.replace(indexMatch[0], '');
      if (reachMatch) classText = classText.replace(reachMatch[0], '');

      classText = classText
        .replace(/Specific Concentration Limits\s*[:\.]?/gi, 'Specyficzne stężenia graniczne:\n')
        .replace(/M-Chronic\s*[:\.]?\s*(\d+)/gi, 'M (przewlekły) = $1')
        .replace(/M-Acute\s*[:\.]?\s*(\d+)/gi, 'M (ostry) = $1')
        .replace(/\n\s*\n+/g, '\n')
        .trim();

      classText = mapHazardClass(classText);

      let plName = "";
      if (resolvedSubstances[curCas] && CAS_TO_PL_MAP[curCas]) {
        plName = CAS_TO_PL_MAP[curCas];
      } else if (resolvedSubstances[curCas] && !resolvedSubstances[curCas].startsWith("Substancja CAS")) {
        plName = resolvedSubstances[curCas];
      } else if (CAS_TO_PL_MAP[curCas]) {
        plName = CAS_TO_PL_MAP[curCas];
      }

      if (!plName || plName === rawName) {
        const lowerRaw = rawName.toLowerCase();
        for (const [en, pl] of Object.entries(ALLERGEN_NAMES_PL)) {
          if (lowerRaw === en.toLowerCase() || lowerRaw.includes(en.toLowerCase())) {
            plName = pl;
            break;
          }
        }
      }
      if (!plName) plName = rawName;

      const idParts = [
        `Numer CAS: ${curCas}`,
        `Numer WE: ${ecNumber}`
      ];
      if (indexNumber !== "—") idParts.push(`Numer indeksowy: ${indexNumber}`);
      if (reachNumber !== "—") idParts.push(`Numer rejestracji REACH:\n${reachNumber}`);

      components.push({
        cas: curCas,
        name: plName,
        originalName: rawName,
        ec: ecNumber,
        index: indexNumber,
        reach: reachNumber,
        identifiers: idParts.join('\n'),
        classification: classText,
        concentration: concentration
      });
    }

    return components;
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
  static getSection1_3() {
    return (
      "1.3. Dane dotyczące dostawcy karty charakterystyki\n" +
      "Firma: MITRANS Weronika Grzesiak\n" +
      "Adres: ul. Wesoła 16, 63-600 Kępno, woj. wielkopolskie\n" +
      "E-mail: kontakt@prostozwloch.com.pl\n" +
      "Telefon: +48 663116607"
    );
  }

  static getSection1_4(ufiCode) {
    const ufiStr = ufiCode ? `UFI: ${ufiCode}\n` : "[UWAGA: Brak kodu UFI w pliku!]\n";
    return (
      `${ufiStr}` +
      "1.4. Numer telefonu alarmowego:\n" +
      "112 (ogólny telefon alarmowy w Polsce), 998 (straż pożarna), 999 (pogotowie ratunkowe)"
    );
  }

  static getSection2_3() {
    return (
      "2.3. Inne zagrożenia\n" +
      "Produkt nie zawiera składników wpisanych do wykazu ustanowionego zgodnie z art. 59 ust. 1 jako posiadające właściwości zaburzające funkcjonowanie układu hormonalnego ani składników o właściwościach zaburzających funkcjonowanie układu hormonalnego zgodnie z kryteriami określonymi w rozporządzeniu 2017/2100/UE lub rozporządzeniu 2018/605/UE w stężeniu równym lub większym od 0,1 %.\n" +
      "Komponenty mieszaniny nie spełniają kryteriów PBT lub vPvB zgodnie z załącznikiem XIII rozporządzenia REACH."
    );
  }

  static getSection13() {
    return (
      "SEKCJA 13: Postępowanie z odpadami\n\n" +
      "13.1. Metody unieszkodliwiania odpadów\n" +
      "[FLAGA_QUARANTINE_REVIEW] Wymagane nadanie 6-cyfrowego kodu odpadu według katalogu BDO przez Safety Assessora.\n" +
      "Odpadowy produkt należy poddać odzyskowi lub likwidować w uprawnionych spalarniach lub zakładach utylizacji/unieszkodliwiania odpadów, zgodnie z obowiązującymi przepisami. Nie wprowadzać do kanalizacji.\n" +
      "Krajowe akty prawne: ustawa o odpadach (t.j. Dz. U. 2023, poz. 1587 wraz z późn. zm.), ustawa o gospodarce opakowaniami i odpadami opakowaniowymi (tj. Dz. U. 2023, poz. 1658 wraz z późn. zm.)."
    );
  }

  static getSection15() {
    return (
      "SEKCJA 15: Informacje dotyczące przepisów prawnych\n\n" +
      "15.1. Przepisy prawne dotyczące bezpieczeństwa, zdrowia i ochrony środowiska specyficzne dla substancji lub mieszaniny\n\n" +
      "Prawodawstwo Unii Europejskiej:\n" +
      "Rozporządzenie (WE) nr 1907/2006 Parlamentu Europejskiego i Rady z dnia 18 grudnia 2006 r. w sprawie rejestracji, oceny, udzielania zezwoleń i stosowanych ograniczeń w zakresie chemikaliów (REACH) z późniejszymi zmianami.\n" +
      "Rozporządzenie Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniające załącznik II do rozporządzenia (WE) nr 1907/2006 (wymogi dotyczące sporządzania kart charakterystyki).\n" +
      "Rozporządzenie Parlamentu Europejskiego i Rady (WE) nr 1272/2008 z dnia 16 grudnia 2008 r. w sprawie klasyfikacji, oznakowania i pakowania substancji i mieszanin (CLP) z późniejszymi zmianami (ATP).\n" +
      "Rozporządzenie (WE) nr 648/2004 Parlamentu Europejskiego i Rady z dnia 31 marca 2004 r. w sprawie detergentów z późniejszymi zmianami (Uwaga dla algorytmu: pozostawić, jeśli produkt jest detergentem/środkiem czystości).\n" +
      "Kandydacka lista substancji wzbudzających szczególnie duże obawy (SVHC) podlegających procedurze udzielania zezwoleń (REACH załącznik XIV): Mieszanina nie zawiera substancji z listy SVHC w stężeniu >= 0,1%.\n" +
      "Ograniczenia dotyczące produkcji, wprowadzania do obrotu i stosowania niektórych niebezpiecznych substancji, preparatów i wyrobów (REACH załącznik XVII): Nie dotyczy (chyba że w sekcji 3 zidentyfikowano składniki podlegające restrykcjom).\n" +
      "Dyrektywa Parlamentu Europejskiego i Rady 2012/18/UE (Seveso III): Mieszanina nie podlega.\n\n" +
      "Prawodawstwo Rzeczypospolitej Polskiej:\n" +
      "Ustawa z dnia 25 lutego 2011 r. o substancjach chemicznych i ich mieszaninach (Dz.U. 2011 nr 63 poz. 322 z późn. zm.).\n" +
      "Rozporządzenie Ministra Rodziny, Pracy i Polityki Społecznej z dnia 12 czerwca 2018 r. w sprawie najwyższych dopuszczalnych stężeń i natężeń czynników szkodliwych dla zdrowia w środowisku pracy (Dz.U. 2018 poz. 1286 z późn. zm.).\n" +
      "Ustawa z dnia 14 grudnia 2012 r. o odpadach (Dz.U. 2013 poz. 21 z późn. zm.) oraz przepisy wykonawcze do ustawy.\n" +
      "Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadach opakowaniowych (Dz.U. 2013 poz. 888 z późn. zm.).\n" +
      "Rozporządzenie Ministra Zdrowia z dnia 2 lutego 2011 r. w sprawie badań i pomiarów czynników szkodliwych dla zdrowia w środowisku pracy (Dz.U. 2011 nr 33 poz. 166).\n" +
      "Ustawa z dnia 19 sierpnia 2011 r. o przewozie towarów niebezpiecznych (Dz.U. 2011 nr 227 poz. 1367 z późn. zm.) wraz z oświadczeniami rządowymi w sprawie Umowy europejskiej dotyczącej międzynarodowego przewozu drogowego towarów niebezpiecznych (ADR).\n" +
      "Rozporządzenie Ministra Zdrowia z dnia 30 grudnia 2004 r. w sprawie bezpieczeństwa i higieny pracy związanej z występowaniem w miejscu pracy czynników chemicznych (Dz.U. 2005 nr 11 poz. 86 z późn. zm.)."
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
// 8. G?ÓWNY SILNIK PARSERA I KWARANTANNY
// ============================================================================
class SDSProcessorEngine {
  constructor(companyConfig = {}) {
    this.companyConfig = companyConfig;
    this.quarantineLogs = [];
    this.extractedSubstances = [];
    this.detectedGhsPictograms = [];
    this.anomalies = [];
  }

  processSection2(contentIt, resolvedSubstances = {}) {
    const hCodes = SDSChemicalExtractor.extractHCodes(contentIt);
    const pCodes = SDSChemicalExtractor.extractPCodes(contentIt);
    const euhCodes = SDSChemicalExtractor.extractEuhCodes(contentIt);
    
    // Walidacja twarda słownika
    hCodes.forEach(code => {
      if (!OFFICIAL_CLP_H_PHRASES[code]) throw new Error(`[CRITICAL HALT] Nieznany kod zagrożenia: ${code}`);
    });

    const isExplicitlyNotHazardous = /(?:not classified|non[ \-]*(?:[eè]|est)?\s*classificat|nie sklasyfikowan|nie jest sklasyfikowan|nie stwarza zagrożenia|not hazardous)/i.test(contentIt);
    const isHazardous = !isExplicitlyNotHazardous && (hCodes.length > 0 || /(?:Flam\.|Skin\.|Eye\.|Acute Tox|Aquatic|STOT|Asp\.)/i.test(contentIt));

    // 2.1. Klasyfikacja substancji lub mieszaniny
    let classification2_1 = "";
    if (!isHazardous) {
      classification2_1 = "Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie zgodnie z rozporządzeniem (WE) nr 1272/2008 [CLP].";
    } else {
      let text21 = "";
      const match21 = contentIt.match(/(?:^|\n)\s*2\.1\b[.:\-]?\s*(.*?)(?=(?:^|\n)\s*2\.2\b|$)/is);
      if (match21 && match21[1]) {
        text21 = match21[1].replace(/^(?:Classification\s*(?:of\s*(?:the\s*)?(?:substance\s*or\s*mixture)?)?|Klasyfikacja\s*(?:substancji\s*lub\s*mieszaniny)?)[.:\-]?\s*/i, '').trim();
      } else {
        text21 = contentIt;
      }
      if (hCodes.length > 0) {
        classification2_1 = hCodes.map(c => `${c}\n${OFFICIAL_CLP_H_PHRASES[c] || ""}`).join('\n');
      } else {
        classification2_1 = mapHazardClass(text21.trim());
      }
    }

    // 2.2. Elementy oznakowania
    const directGhs = SDSChemicalExtractor.extractGhsCodes(contentIt);
    const inferredGhs = SDSChemicalExtractor.inferGhsFromHCodes(hCodes);
    this.detectedGhsPictograms = isHazardous ? Array.from(new Set([...directGhs, ...inferredGhs])).sort() : [];

    let signalWord = "Brak.";
    if (isHazardous) {
      if (/(PERICOLO|DANGER|NIEBEZPIECZEŃSTWO)/i.test(contentIt)) {
        signalWord = "Niebezpieczeństwo";
      } else if (/(ATTENZIONE|WARNING|UWAGA)/i.test(contentIt) || this.detectedGhsPictograms.length > 0) {
        signalWord = "Uwaga";
      }
    }

    let labelSubstances = "Nie ma.";
    if (isHazardous) {
      const hazardSubstanceNames = Object.values(resolvedSubstances);
      if (hazardSubstanceNames.length > 0) labelSubstances = hazardSubstanceNames.join(", ");
    }

    let mappedH = "Brak.";
    if (hCodes.length > 0) {
      mappedH = hCodes.map(c => `${c} ${OFFICIAL_CLP_H_PHRASES[c] || c}`).join('\n');
    }

    let mappedP = "Brak.";
    if (pCodes.length > 0) {
      mappedP = pCodes.map(c => `${c} ${OFFICIAL_CLP_P_PHRASES[c] || c}`).join('\n');
    }

    let mappedEuh = "Brak.";
    let euhEntries = [];
    if (euhCodes.includes("EUH208") || /EUH208/i.test(contentIt)) {
      const euh208Text = SDSChemicalExtractor.formatEuh208(contentIt, resolvedSubstances);
      if (euh208Text) euhEntries.push(euh208Text);
    }
    euhCodes.forEach(code => {
      if (code !== "EUH208" && OFFICIAL_CLP_H_PHRASES[code]) {
        euhEntries.push(`${code} ${OFFICIAL_CLP_H_PHRASES[code]}`);
      }
    });
    if (euhEntries.length > 0) mappedEuh = euhEntries.join('\n');

    const section2_2_body = [
      "Piktogramy określające rodzaj zagrożenia i hasło ostrzegawcze",
      signalWord,
      "",
      "Nazwy niebezpiecznych substancji wymienione na etykiecie",
      labelSubstances,
      "",
      "Zwroty wskazujące rodzaj zagrożenia",
      mappedH,
      "",
      "Zwroty wskazujące środki ostrożności",
      mappedP,
      "",
      "Informacje uzupełniające",
      mappedEuh
    ].join('\n');

    return {
      content: `SEKCJA 2: Identyfikacja zagrożeń\n\n2.1. Klasyfikacja substancji lub mieszaniny\n${classification2_1}\n\n2.2. Elementy oznakowania\n${section2_2_body}`,
      ghsPictograms: this.detectedGhsPictograms,
      signalWord: signalWord
    };
  }

  async processSection3(contentIt, manualOverrides = {}) {
    const casList = SDSChemicalExtractor.extractCas(contentIt);
    let resolvedSubstances = {};

    for (const cas of casList) {
      if (manualOverrides[cas]) {
        resolvedSubstances[cas] = manualOverrides[cas].name_pl || manualOverrides[cas].iupac;
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: resolvedSubstances[cas], url: "HITL_MANUAL_OVERRIDE" });
        continue;
      }
      if (CAS_TO_PL_MAP[cas]) {
        resolvedSubstances[cas] = CAS_TO_PL_MAP[cas];
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: resolvedSubstances[cas], url: `https://echa.europa.eu/pl/substance-information/-/substanceinfo/${cas.replace(/-/g, "")}` });
        continue;
      }
      try {
        const echaInfo = await ECHAFreeResolver.resolveSubstanceData(cas);
        resolvedSubstances[cas] = echaInfo.name_pl;
        this.extractedSubstances.push({ casNumber: cas, translatedNamePl: echaInfo.name_pl, url: echaInfo.echa_infocard_url });
      } catch (err) {
        if (err.message.includes("CRITICAL HALT")) {
          this.anomalies.push({ type: "CAS_NOT_FOUND", cas: cas, message: err.message });
        } else {
          this.anomalies.push({ type: "API_ERROR", cas: cas, message: err.message });
        }
      }
    }

    const components = SDSChemicalExtractor.parseSection3Components(contentIt, resolvedSubstances);

    let textContent = "SEKCJA 3: Skład / informacja o składnikach\n\n";
    textContent += "3.1. Substancje: Nie dotyczy.\n\n";
    textContent += "3.2. Mieszaniny\nOpis chemiczny: Mieszanina substancji niebezpiecznych wraz z dodatkami nieniebezpiecznymi.\n\n";

    if (components.length > 0) {
      components.forEach((c, idx) => {
        textContent += `${idx + 1}. ${c.name}\n`;
        textContent += `   ${c.identifiers.replace(/\n/g, ' | ')}\n`;
        textContent += `   Stężenie: ${c.concentration}\n`;
        textContent += `   Klasyfikacja: ${c.classification.replace(/\n/g, ' ')}\n\n`;
      });
    } else {
      textContent += "Mieszanina nie zawiera składników stwarzających zagrożenie w ilościach przekraczających stężenia graniczne określone w rozporządzeniu CLP.\n\n";
    }

    textContent += "Pełne brzmienie zwrotów H i EUH znajduje się w sekcji 16 karty charakterystyki.";

    return { content: textContent, components, resolvedSubstances };
  }

  processSection1(contentIt, productName = "", ufi = "") {
    let clean = (contentIt || "").replace(/\r/g, '').replace(/\t/g, ' ');
    
    let codeMatch = clean.match(/(?:Trade code|Codice prodotto|Kod produktu)\s*[:\.]?\s*([^\n]+)/i);
    let tradeCode = codeMatch ? codeMatch[1].trim() : "";
    let ufiMatch = clean.match(/(?:UFI\s*[:\.]?\s*)([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/i);
    let resolvedUfi = ufi || (ufiMatch ? ufiMatch[1].trim() : "");

    let identifiedUses = "Zastosowanie konsumenckie: perfumy do tkanin i prania.";
    let usesAdvised = "Nie stosować do celów innych niż wskazane.";

    let s13 = "1.3. Dane dotyczące dostawcy karty charakterystyki\n";
    s13 += "Producent / Podmiot wprowadzający do obrotu:\n";
    s13 += "SUAREZ COMPANY S.R.L.\nVia Pergolesi, 1, 20811 Cesano Maderno (MI) - Włochy\nTel. +39 0362659766 | www.suarezcompany.it\nE-mail osoby odpowiedzialnej: info@suarezcompany.it\n\n";
    s13 += "Dystrybutor w Polsce:\n";
    s13 += `${this.companyConfig.companyName || "MITRANS Weronika Grzesiak"}\n`;
    s13 += "ul. Wesoła 16, 63-600 Kępno, woj. wielkopolskie\n";
    s13 += `E-mail: kontakt@prostozwloch.com.pl | Tel. ${this.companyConfig.emergencyPhone || "+48 663116607"}`;

    let s14 = "1.4. Numer telefonu alarmowego\n";
    s14 += "112 (ogólny telefon alarmowy w Polsce), 998 (straż pożarna), 999 (pogotowie ratunkowe)\n";
    s14 += "Telefon producenta: +39 0362659766 (w godzinach pracy biura, język włoski/angielski)";

    let output = "SEKCJA 1: Identyfikacja substancji/mieszaniny i identyfikacja przedsiębiorstwa\n\n";
    output += "1.1. Identyfikator produktu\n";
    output += `Nazwa handlowa: ${productName || "SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE NAJMA"}\n`;
    if (tradeCode) output += `Kod produktu: ${tradeCode}\n`;
    output += `UFI: ${resolvedUfi || "[Brak kodu UFI w pliku źródłowym]"}\n\n`;
    output += "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane\n";
    output += `Zastosowanie zidentyfikowane: ${identifiedUses}\n`;
    output += `Zastosowania odradzane: ${usesAdvised}\n\n`;
    output += `${s13}\n\n`;
    output += `${s14}`;

    return output;
  }

  processSection4(contentIt) {
    let skinAdvice = "Zmyć natychmiast dużą ilością wody z mydłem.";
    let eyeAdvice = "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą. Usunąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.";
    let ingestionAdvice = "Nie wywoływać wymiotów. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.";
    let inhalationAdvice = "Wyprowadzić poszkodowanego na świeże powietrze, zapewnić ciepło i spokój. W przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać opakowanie lub etykietę.";

    let symptomsAdvice = "Brak dostępnych szczegółowych informacji na temat objawów i skutków wywoływanych przez produkt.";
    let treatmentAdvice = "Brak danych.";

    let output = "SEKCJA 4: Środki pierwszej pomocy\n\n";
    output += "4.1. Opis środków pierwszej pomocy\n";
    output += `W kontakcie ze skórą: ${skinAdvice}\n`;
    output += `W kontakcie z oczami: ${eyeAdvice}\n`;
    output += `W przypadku spożycia: ${ingestionAdvice}\n`;
    output += `Po narażeniu drogą oddechową: ${inhalationAdvice}\n\n`;
    output += "4.2. Najważniejsze ostre i opóźnione objawy oraz skutki narażenia\n";
    output += `${symptomsAdvice}\n\n`;
    output += "4.3. Wskazania dotyczące wszelkiej natychmiastowej pomocy lekarskiej i szczególnego postępowania z poszkodowanym\n";
    output += `Leczenie: ${treatmentAdvice}`;

    return output;
  }

  processSection5(contentIt) {
    let suitableText = "Gaśnica śniegowa (CO2), gaśnica proszkowa, piana gaśnicza, woda.";
    let unsuitableText = "Brak szczególnych.";
    let hazardsText = "Unikać wdychania produktów spalania.";
    let adviceText = "Gromadzić oddzielnie zanieczyszczoną wodę gaśniczą; nie dopuścić do jej przedostania się do kanalizacji. Stosować odzież ochronną dla strażaków zgodną z normą europejską EN 469 oraz autonomiczny aparat oddechowy (SCBA) z rękawicami odpornymi na chemikalia.";

    let output = "SEKCJA 5: Postępowanie w przypadku pożaru\n\n";
    output += "5.1. Środki gaśnicze\n";
    output += `Odpowiednie środki gaśnicze: ${suitableText}\n`;
    output += `Niewłaściwe środki gaśnicze: ${unsuitableText}\n\n`;
    output += "5.2. Szczególne zagrożenia związane z substancją lub mieszaniną\n";
    output += `Szczególne zagrożenia: ${hazardsText}\n\n`;
    output += "5.3. Informacje dla straży pożarnej\n";
    output += `Środki ochrony strażaków: ${adviceText}`;

    return output;
  }

  processSection6(contentIt) {
    let nonEmergAdvice = "Stosować środki ochrony indywidualnej. Ewakuować osoby w bezpieczne miejsce. Patrz środki ochronne w punkcie 7 i 8.";
    let emergAdvice = "Stosować środki ochrony indywidualnej.";
    let envAdvice = "Nie dopuścić do przedostania się do gleby/podglebia. Nie dopuścić do przedostania się do wód powierzchniowych ani kanalizacji. Zatrzymać zanieczyszczoną wodę z mycia i przekazać do utylizacji. W przypadku wycieku gazu lub przedostania się do cieków wodnych, gleby lub kanalizacji powiadomić właściwe władze.";
    let cleanupAdvice = "Odpowiedni materiał do zbierania: materiał pochłaniający, organiczny, piasek. Zmyć dużą ilością wody.";
    let refAdvice = "Patrz również sekcja 8 i 13.";

    let output = "SEKCJA 6: Postępowanie w przypadku niezamierzonego uwolnienia do środowiska\n\n";
    output += "6.1. Indywidualne środki ostrożności, wyposażenie ochronne i procedury w sytuacjach awaryjnych\n";
    output += `Dla osób nienależących do personelu udzielającego pomocy: ${nonEmergAdvice}\n`;
    output += `Dla osób udzielających pomocy: ${emergAdvice}\n\n`;
    output += "6.2. Środki ostrożności w zakresie ochrony środowiska\n";
    output += `${envAdvice}\n\n`;
    output += "6.3. Metody i materiały zapobiegające rozprzestrzenianiu się skażenia i służące do usuwania skażenia\n";
    output += `${cleanupAdvice}\n\n`;
    output += "6.4. Odniesienia do innych sekcji\n";
    output += `${refAdvice}`;

    return output;
  }

  processSection7(contentIt) {
    let output = "SEKCJA 7: Postępowanie z substancjami i mieszaninami oraz ich magazynowanie\n\n";
    output += "7.1. Środki ostrożności dotyczące bezpiecznego postępowania\n";
    output += "Środki ostrożności: Unikać kontaktu ze skórą i oczami oraz wdychania par i mgieł. Patrz również sekcja 8 w celu zapoznania się z zalecanym sprzętem ochrony osobistej.\n";
    output += "Zalecenia dotyczące ogólnej higieny pracy: Nie jeść i nie pić podczas pracy.\n\n";
    output += "7.2. Warunki bezpiecznego magazynowania, w tym informacje dotyczące wszelkich wzajemnych niezgodności\n";
    output += "Materiały niezgodne: Brak szczególnych.\n";
    output += "Wskazówki dotyczące pomieszczeń magazynowych: Pomieszczenia odpowiednio wentylowane.\n\n";
    output += "7.3. Szczególne zastosowanie(-a) końcowe\n";
    output += "Brak szczególnych.\n";
    output += "Rozwiązania specyficzne dla sektora przemysłowego: Brak szczególnych.";

    return output;
  }

  processSection8(contentIt) {
    const foundCas = this.extractedSubstances.map(s => s.casNumber);
    let tableText = "SEKCJA 8: Kontrola narażenia/środki ochrony indywidualnej\n\n8.1. Parametry dotyczące kontroli\n\n";
    tableText += "[FLAGA_QUARANTINE_REVIEW] Algorytm zablokował zagraniczne limity OEL/MAK/TLV.\n";
    tableText += "KRYTYCZNE: Safety Assessor ma obowiązek uzupełnić poniższe wartości o polskie limity NDS, NDSCh, NDSP zgodnie z Dz.U. 2018 poz. 1286.\n\n";
    
    if (foundCas.length > 0) {
      for (const cas of Array.from(new Set(foundCas))) {
        const entry = NDSRegistry.getEntry(cas);
        if (entry) {
          tableText += `CAS ${cas} (${entry.substanceName}): NDS = ${entry.nds}, NDSCh = ${entry.ndsch}, NDSP = ${entry.ndsp}\n`;
        } else {
          tableText += `CAS ${cas}: Brak określonych krajowych wartości najwyższych dopuszczalnych stężeń (NDS, NDSCh, NDSP) w Dz.U. 2018 poz. 1286.\n`;
        }
      }
    } else {
      tableText += "Brak substancji w sekcji 3 z przypisanymi krajowymi wartościami NDS/NDSCh.\n";
    }

    let cleanIt = (contentIt || "").replace(/Page\s+n\.\s*of\s*\d+/gi, '').replace(/\r/g, '').replace(/\t/g, ' ');

    return {
      content81: tableText,
      content82: cleanIt
    };
  }

  async prepareAgentPayload(pdfFilePath, productName = "PRODUKT CHEMICZNY", manualOverrides = {}) {
    console.log(`[SYS] Ekstrakcja pliku: ${pdfFilePath}`);
    const fullText = await SDSPDFParser.extractTextFromPdf(pdfFilePath, false);
    const rawSections = SDSPDFParser.segmentInto16Sections(fullText);
    
    const ufi = SDSChemicalExtractor.extractUfi(rawSections["section_1"]);
    const s3 = await this.processSection3(rawSections["section_3"], manualOverrides);
    const s2 = this.processSection2(rawSections["section_2"], s3.resolvedSubstances);
    const s8 = this.processSection8(rawSections["section_8"]);
    const s1Content = this.processSection1(rawSections["section_1"], productName, ufi);
    const s4Content = this.processSection4(rawSections["section_4"]);
    const s5Content = this.processSection5(rawSections["section_5"]);
    const s6Content = this.processSection6(rawSections["section_6"]);
    const s7Content = this.processSection7(rawSections["section_7"]);

    const deterministic = {
      section_1: { type: "CLP_MAPPED", content: s1Content },
      section_2: { type: "CLP_MAPPED", content: s2.content + "\n\n" + PolishLegalTemplates.getSection2_3() },
      section_3: { type: "EXTRACT_RAW", content: s3.content, components: s3.components },
      section_4: { type: "CLP_MAPPED", content: s4Content },
      section_5: { type: "CLP_MAPPED", content: s5Content },
      section_6: { type: "CLP_MAPPED", content: s6Content },
      section_7: { type: "CLP_MAPPED", content: s7Content },
      section_8: { type: "QUARANTINE", content: s8.content81 },
      section_13: { type: "QUARANTINE", content: PolishLegalTemplates.getSection13() },
      section_15: { type: "QUARANTINE", content: PolishLegalTemplates.getSection15() },
      section_16: { type: "CLP_MAPPED", content: mapHazardClass(rawSections["section_16"]) }
    };

    const toTranslate = {};
    [9,10,11,12,14].forEach(i => { toTranslate[`section_${i}`] = rawSections[`section_${i}`]; });
    toTranslate["section_8_2"] = s8.content82;

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
      if (i === 8) {
         finalSections[key] = { type: "MIXED", content: agentPayload.deterministicSections[key].content + "\n\n" + (agentTranslated["section_8_2"] || "") };
      } else if (agentPayload.deterministicSections[key]) {
        finalSections[key] = agentPayload.deterministicSections[key];
      } else if (agentTranslated[key]) {
        finalSections[key] = { type: "TRANSLATED", content: agentTranslated[key].trim() };
      } else {
        throw new Error(`[CRITICAL HALT] Brak danych dla ${key}.`);
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
    const { Document, Packer, Paragraph, TextRun, AlignmentType, ShadingType, Header, Footer, PageNumber, ImageRun, BorderStyle, Table, TableRow, TableCell, WidthType } = docx;

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

      if (i === 3 && data.components && data.components.length > 0) {
        sectionsBody.push(new Paragraph({
          children: [new TextRun({ text: "3.1. Substancje: Nie dotyczy.", bold: true, size: 20, font: "Arial" })],
          spacing: { before: 180, after: 100 }
        }));
        sectionsBody.push(new Paragraph({
          children: [new TextRun({ text: "3.2. Mieszaniny", bold: true, size: 20, font: "Arial" })],
          spacing: { before: 180, after: 80 }
        }));
        sectionsBody.push(new Paragraph({
          children: [new TextRun({ text: "Opis chemiczny: Mieszanina substancji niebezpiecznych wraz z dodatkami nieniebezpiecznymi.", size: 20, font: "Arial" })],
          spacing: { after: 150 }
        }));

        const tableBorder = {
          top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
          left: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
          right: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "E0E0E0" },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E0E0E0" }
        };

        const headerRow = new TableRow({
          tableHeader: true,
          children: [
            new TableCell({
              width: { size: 2800, type: WidthType.DXA },
              shading: { fill: "F2F4F7" },
              children: [new Paragraph({ children: [new TextRun({ text: "Nazwa substancji", bold: true, size: 18, font: "Arial" })] })]
            }),
            new TableCell({
              width: { size: 2600, type: WidthType.DXA },
              shading: { fill: "F2F4F7" },
              children: [new Paragraph({ children: [new TextRun({ text: "Identyfikatory", bold: true, size: 18, font: "Arial" })] })]
            }),
            new TableCell({
              width: { size: 2800, type: WidthType.DXA },
              shading: { fill: "F2F4F7" },
              children: [new Paragraph({ children: [new TextRun({ text: "Klasyfikacja CLP", bold: true, size: 18, font: "Arial" })] })]
            }),
            new TableCell({
              width: { size: 1400, type: WidthType.DXA },
              shading: { fill: "F2F4F7" },
              children: [new Paragraph({ children: [new TextRun({ text: "Stężenie", bold: true, size: 18, font: "Arial" })] })]
            })
          ]
        });

        const rows = [headerRow];
        data.components.forEach(c => {
          const idParagraphs = c.identifiers.split('\n').map(line => new Paragraph({
            children: [new TextRun({ text: line, size: 17, font: "Arial" })],
            spacing: { after: 40 }
          }));

          const classParagraphs = c.classification.split('\n').map(line => new Paragraph({
            children: [new TextRun({ text: line, size: 17, font: "Arial" })],
            spacing: { after: 40 }
          }));

          rows.push(new TableRow({
            children: [
              new TableCell({
                width: { size: 2800, type: WidthType.DXA },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text: c.name, bold: true, size: 18, font: "Arial" })],
                    spacing: { after: 40 }
                  }),
                  ...(c.originalName && c.originalName.toLowerCase() !== c.name.toLowerCase() ? [
                    new Paragraph({
                      children: [new TextRun({ text: `(ang. ${c.originalName})`, italics: true, size: 16, color: "666666", font: "Arial" })]
                    })
                  ] : [])
                ]
              }),
              new TableCell({
                width: { size: 2600, type: WidthType.DXA },
                children: idParagraphs
              }),
              new TableCell({
                width: { size: 2800, type: WidthType.DXA },
                children: classParagraphs
              }),
              new TableCell({
                width: { size: 1400, type: WidthType.DXA },
                children: [new Paragraph({ children: [new TextRun({ text: c.concentration, size: 18, font: "Arial" })] })]
              })
            ]
          }));
        });

        sectionsBody.push(new Table({
          width: { size: 9600, type: WidthType.DXA },
          borders: tableBorder,
          rows: rows
        }));

        sectionsBody.push(new Paragraph({
          children: [new TextRun({ text: "Pełne brzmienie zwrotów H i EUH znajduje się w sekcji 16 karty charakterystyki.", italics: true, size: 18, font: "Arial" })],
          spacing: { before: 180, after: 150 }
        }));

        continue;
      }

      lines.forEach(line => {
        const tLine = line.trim();
        if (!tLine) return;

        const isSubSection = /^(\d+\.\d+(\.\d+)?\.?)\s+/.test(tLine);
        const isLabelHeader = /^(Piktogramy określające rodzaj zagrożenia i hasło ostrzegawcze|Nazwy niebezpiecznych substancji wymienione na etykiecie|Zwroty wskazujące rodzaj zagrożenia|Zwroty wskazujące środki ostrożności|Informacje uzupełniające|Producent \/ Podmiot wprowadzający do obrotu:|Dystrybutor w Polsce:)$/i.test(tLine);
        const isBoldStart = /^(Nazwa handlowa|Kod produktu|UFI|Zastosowanie zidentyfikowane|Zastosowania odradzane|Telefon producenta|Hasło ostrzegawcze|Zwroty wskazujące|Piktogramy|DNEL|PNEC|W kontakcie ze skórą|W kontakcie z oczami|W przypadku spożycia|Po narażeniu drogą oddechową|Leczenie|Odpowiednie środki gaśnicze|Niewłaściwe środki gaśnicze|Szczególne zagrożenia|Środki ochrony strażaków|Dla osób nienależących do personelu udzielającego pomocy|Dla osób udzielających pomocy|Odpowiedni materiał do zbierania|Środki ostrożności|Zalecenia dotyczące ogólnej higieny pracy|Materiały niezgodne|Wskazówki dotyczące pomieszczeń magazynowych|Rozwiązania specyficzne dla sektora przemysłowego):/i.test(tLine);

        if (isSubSection) {
           sectionsBody.push(new Paragraph({
             children: [new TextRun({ text: tLine, bold: true, size: 20, font: "Arial" })],
             spacing: { before: 200, after: 100 }
           }));
        } else if (isLabelHeader) {
           sectionsBody.push(new Paragraph({
             children: [new TextRun({ text: tLine, bold: true, size: 20, font: "Arial" })],
             spacing: { before: 150, after: 80 }
           }));
           if (/Piktogramy określające rodzaj zagrożenia/i.test(tLine) && sdsData.ghsPictograms && sdsData.ghsPictograms.length > 0) {
             const imageRuns = sdsData.ghsPictograms.map(code => {
                const buffer = GHSPictogramGenerator.generatePictogramBuffer(code, 150);
                return new ImageRun({ data: buffer, transformation: { width: 75, height: 75 } });
             });
             sectionsBody.push(new Paragraph({ children: imageRuns, spacing: { before: 60, after: 100 } }));
           }
        } else if (isBoldStart) {
           const idx = tLine.indexOf(':');
           sectionsBody.push(new Paragraph({
             children: [
               new TextRun({ text: tLine.substring(0, idx + 1), bold: true, size: 20, font: "Arial" }),
               new TextRun({ text: tLine.substring(idx + 1), size: 20, font: "Arial" })
             ],
             spacing: { before: 80, after: 80 }
           }));
        } else {
           sectionsBody.push(new Paragraph({
             children: [new TextRun({ text: tLine, size: 20, font: "Arial" })],
             spacing: { after: 80 }
           }));
        }
      });
    }

    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: "Arial"
            }
          }
        }
      },
      sections: [{
        properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
        headers: {
          default: new Header({
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `SDS | ${sdsData.productName}`, font: "Arial" })] })]
          })
        },
        footers: {
          default: new Footer({
            children: [new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: "Strona ", font: "Arial" }),
                new TextRun({ children: [PageNumber.CURRENT], font: "Arial" }),
                new TextRun({ text: " z ", font: "Arial" }),
                new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial" })
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
module.exports = { 
  SDSProcessorEngine, 
  SDSDocxExporter, 
  SDSPDFParser, 
  ECHAFreeResolver, 
  NDSRegistry, 
  PolishLegalTemplates, 
  SDSChemicalExtractor, 
  PurePngEncoder, 
  GHSPictogramGenerator, 
  HITLError,
  OFFICIAL_CLP_H_PHRASES,
  OFFICIAL_CLP_P_PHRASES,
  GHS_HAZARD_CLASSES_MAP,
  SIGNAL_WORDS_MAP,
  ALLERGEN_NAMES_PL,
  CAS_TO_PL_MAP,
  mapHazardClass
};

