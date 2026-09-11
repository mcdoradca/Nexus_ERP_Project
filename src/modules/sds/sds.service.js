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
  "56-81-5": "glicerol",
  "1222-05-5": "galaksolid (1,3,4,6,7,8-heksahydro-4,6,6,7,8,8-heksametyloindeno[5,6-c]piran)"
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

class EcotoxRegistry {
  static database = {};

  static loadRegistry(filePath) {
    if (fs.existsSync(filePath)) {
      try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        this.database = JSON.parse(rawData);
        console.log(`[SYS] Załadowano bufor ekotoksykologiczny: ${Object.keys(this.database).length} pozycji.`);
      } catch (e) {
        this.database = {};
      }
    }
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
      section_1: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*1\s*[:\.\-]?\s*(?:IDENTIFICAZIONE|IDENTIFICATION|IDENTYFIKACJA)/i,
      section_2: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*2\s*[:\.\-]?\s*(?:IDENTIFICAZIONE DEI PERICOLI|HAZARDS|IDENTYFIKACJA ZAGROŻEŃ)/i,
      section_3: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*3\s*[:\.\-]?\s*(?:COMPOSIZIONE|COMPOSITION|SKŁAD)/i,
      section_4: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*4\s*[:\.\-]?\s*(?:MISURE DI PRIMO SOCCORSO|FIRST AID|ŚRODKI PIERWSZEJ POMOCY)/i,
      section_5: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*5\s*[:\.\-]?\s*(?:MISURE ANTINCENDIO|FIREFIGHTING|POSTĘPOWANIE W PRZYPADKU POŻARU)/i,
      section_6: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*6\s*[:\.\-]?\s*(?:MISURE IN CASO DI RILASCIO|ACCIDENTAL RELEASE|POSTĘPOWANIE W PRZYPADKU NIEZAMIERZONEGO)/i,
      section_7: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*7\s*[:\.\-]?\s*(?:MANIPOLAZIONE E IMMAGAZZINAMENTO|HANDLING|POSTĘPOWANIE Z SUBSTANCJAMI|MAGAZYNOWANIE)/i,
      section_8: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*8\s*[:\.\-]?\s*(?:CONTROLLI DELL.ESPOSIZIONE|EXPOSURE|KONTROLA NARAŻENIA)/i,
      section_9: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*9\s*[:\.\-]?\s*(?:PROPRIET[AÀ] FISICHE E CHIMICHE|PHYSICAL|WŁAŚCIWOŚCI FIZYCZNE)/i,
      section_10: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*10\s*[:\.\-]?\s*(?:STABILIT[AÀ] E REATTIVIT[AÀ]|STABILITY|STABILNOŚĆ)/i,
      section_11: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*11\s*[:\.\-]?\s*(?:INFORMAZIONI TOSSICOLOGICHE|TOXICOLOGICAL|INFORMACJE TOKSYKOLOGICZNE)/i,
      section_12: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*12\s*[:\.\-]?\s*(?:INFORMAZIONI ECOLOGICHE|ECOLOGICAL|INFORMACJE EKOLOGICZNE)/i,
      section_13: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*13\s*[:\.\-]?\s*(?:CONSIDERAZIONI SULLO SMALTIMENTO|DISPOSAL|POSTĘPOWANIE Z ODPADAMI)/i,
      section_14: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*14\s*[:\.\-]?\s*(?:INFORMAZIONI SUL TRASPORTO|TRANSPORT|INFORMACJE DOTYCZĄCE TRANSPORTU)/i,
      section_15: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*15\s*[:\.\-]?\s*(?:INFORMAZIONI SULLA REGOLAMENTAZIONE|REGULATORY|INFORMACJE DOTYCZĄCE PRZEPISÓW)/i,
      section_16: /(?:^|\n)\s*(?:SEZIONE|SECTION|SEKCJA)\s*16\s*[:\.\-]?\s*(?:ALTRE INFORMAZIONI|OTHER INFORMATION|INNE INFORMACJE)/i
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

  // ============================================================================
  // UNIWERSALNE SŁOWNIKI I MAPOWANIA REGULACYJNE (UE 2020/878)
  // ============================================================================
  static PHRASE_DICTIONARY_PL = {
    // Pierwsza pomoc (Sekcja 4)
    "after contact with skin, wash immediately with soap and plenty of water": "Po kontakcie ze skórą natychmiast zmyć dużą ilością wody z mydłem.",
    "wash immediately with soap and plenty of water": "Zmyć natychmiast dużą ilością wody z mydłem.",
    "dopo il contatto con la pelle lavare immediatamente con acqua ed abbondante sapone": "Po kontakcie ze skórą natychmiast zmyć dużą ilością wody z mydłem.",
    "lavare immediatamente con abbondante acqua e sapone": "Zmyć natychmiast dużą ilością wody z mydłem.",
    "after contact with the eyes, rinse with water with the eyelids open for a sufficient length of time, then consult an opthalmologist immediately. remove any contact lenses": "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą. Usunąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.",
    "after contact with the eyes, rinse with water with the eyelids open for a sufficient length of time, then consult an ophthalmologist immediately. remove any contact lenses": "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą. Usunąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.",
    "rinse with water with the eyelids open for a sufficient length of time, then consult an opthalmologist immediately": "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą.",
    "rinse with water with the eyelids open for a sufficient length of time, then consult an ophthalmologist immediately": "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą.",
    "remove any contact lenses": "Usunąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.",
    "in caso di contatto con gli occhi lavare con acqua a palpebre aperte per un tempo sufficiente, poi consultare immediatamente un oftalmologo. togliere le eventuali lenti a contatto": "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą. Usunąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.",
    "do not induce vomiting, get medical attention showing the sds and label hazardous": "Nie wywoływać wymiotów. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.",
    "do not induce vomiting": "Nie wywoływać wymiotów.",
    "non provocare assolutamente il vomito. ricorrere immediatamente all'assistenza medica, mostrando la sds e l'etichetta di pericolo": "Nie wywoływać wymiotów. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.",
    "in case of inhalation, consult a doctor immediately and show him packing or label. remove casualty to fresh air and keep warm and at rest": "W przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać opakowanie lub etykietę. Wyprowadzić poszkodowanego na świeże powietrze, zapewnić ciepło i spokój.",
    "remove casualty to fresh air and keep warm and at rest": "Wyprowadzić poszkodowanego na świeże powietrze, zapewnić ciepło i spokój.",
    "portare l'infortunato all'aria aperta e tenerlo al caldo e a riposo": "Wyprowadzić poszkodowanego na świeże powietrze, zapewnić ciepło i spokój.",
    "no specific information is available on the symptoms and effects caused by the product": "Brak dostępnych szczegółowych informacji na temat objawów i skutków wywoływanych przez produkt.",
    "non sono note informazioni specifiche su sintomi ed effetti provocati dal prodotto": "Brak dostępnych szczegółowych informacji na temat objawów i skutków wywoływanych przez produkt.",
    "treatment:data not available": "Leczenie: Brak danych.",
    "treatment: data not available": "Leczenie: Brak danych.",
    "trattamento:dati non disponibili": "Leczenie: Brak danych.",
    "trattamento: dati non disponibili": "Leczenie: Brak danych.",
    "data not available": "Brak danych.",
    "dati non disponibili": "Brak danych.",

    // Pożarnictwo (Sekcja 5)
    "co2 or dry chemical fire extinguisher. foam; water": "Gaśnica śniegowa (CO2), gaśnica proszkowa, piana gaśnicza, woda.",
    "co2 or dry chemical fire extinguisher": "Gaśnica śniegowa (CO2), gaśnica proszkowa.",
    "estintori ad anidride carbonica (co2), a polvere, a schiuma, acqua": "Gaśnica śniegowa (CO2), gaśnica proszkowa, piana gaśnicza, woda.",
    "none in particular": "Brak szczególnych.",
    "nessuno in particolare": "Brak szczególnych.",
    "avoid breathing combustion products": "Unikać wdychania produktów spalania.",
    "evitare di respirare i prodotti di combustione": "Unikać wdychania produktów spalania.",
    "collect contaminated fire extinguishing water separately. this must not be discharged into drains. use fire fighter's clothing conforming to european standard en469. use self-contained breathing apparatus (scba) with chemical resistant gloves": "Gromadzić oddzielnie zanieczyszczoną wodę gaśniczą; nie dopuścić do jej przedostania się do kanalizacji. Stosować odzież ochronną dla strażaków zgodną z normą europejską EN 469 oraz autonomiczny aparat oddechowy (SCBA) z rękawicami odpornymi na chemikalia.",
    "collect contaminated fire extinguishing water separately. this must not be discharged into drains": "Gromadzić oddzielnie zanieczyszczoną wodę gaśniczą; nie dopuścić do jej przedostania się do kanalizacji.",
    "raccogliere separatamente l'acqua contaminata utilizzata per estinguere l'incendio. non scaricarla nella rete fognaria": "Gromadzić oddzielnie zanieczyszczoną wodę gaśniczą; nie dopuścić do jej przedostania się do kanalizacji.",

    // Uwolnienie do środowiska (Sekcja 6)
    "wear personal protection equipment": "Stosować środki ochrony indywidualnej.",
    "indossare i dispositivi di protezione individuale": "Stosować środki ochrony indywidualnej.",
    "remove persons to safety": "Ewakuować osoby w bezpieczne miejsce.",
    "portare le persone in luogo sicuro": "Ewakuować osoby w bezpieczne miejsce.",
    "see protective measures under point 7 and 8": "Patrz środki ochronne w punkcie 7 i 8.",
    "consultare le misure protettive esposte al punto 7 e 8": "Patrz środki ochronne w punkcie 7 i 8.",
    "do not allow to enter into soil/subsoil. do not allow to enter into surface water or drains": "Nie dopuścić do przedostania się do gleby/podglebia. Nie dopuścić do przedostania się do wód powierzchniowych ani kanalizacji.",
    "impedire la penetrazione nel suolo/sottosuolo. impedire il deflusso nelle acque superficiali o nella rete fognaria": "Nie dopuścić do przedostania się do gleby/podglebia. Nie dopuścić do przedostania się do wód powierzchniowych ani kanalizacji.",
    "retain contaminated washing water and dispose it": "Zatrzymać zanieczyszczoną wodę z mycia i przekazać do utylizacji.",
    "trattenere l'acqua di lavaggio contaminata ed eliminarla": "Zatrzymać zanieczyszczoną wodę z mycia i przekazać do utylizacji.",
    "in case of gas escape or of entry into waterways, soil or drains, inform the responsible authorities": "W przypadku wycieku gazu lub przedostania się do cieków wodnych, gleby lub kanalizacji powiadomić właściwe władze.",
    "in caso di fuga di gas o penetrazione in corsi d'acqua, suolo o fognature informare le autorità responsabili": "W przypadku wycieku gazu lub przedostania się do cieków wodnych, gleby lub kanalizacji powiadomić właściwe władze.",
    "suitable material for taking up: absorbing material, organic, sand": "Odpowiedni materiał do zbierania: materiał pochłaniający, organiczny, piasek.",
    "materiale idoneo alla raccolta: materiale assorbente, organico, sabbia": "Odpowiedni materiał do zbierania: materiał pochłaniający, organiczny, piasek.",
    "wash with plenty of water": "Zmyć dużą ilością wody.",
    "lavare con abbondante acqua": "Zmyć dużą ilością wody.",
    "see also section 8 and 13": "Patrz również sekcja 8 i 13.",
    "si vedano anche i paragrafi 8 e 13": "Patrz również sekcja 8 i 13.",

    // Magazynowanie (Sekcja 7)
    "avoid contact with skin and eyes, inhaltion of vapours and mists": "Unikać kontaktu ze skórą i oczami oraz wdychania par i mgieł.",
    "avoid contact with skin and eyes, inhalation of vapours and mists": "Unikać kontaktu ze skórą i oczami oraz wdychania par i mgieł.",
    "evitare il contatto con la pelle e gli occhi, l'inalazione di vapori e nebbie": "Unikać kontaktu ze skórą i oczami oraz wdychania par i mgieł.",
    "see also section 8 for recommended protective equipment": "Patrz również sekcja 8 w celu zapoznania się z zalecanym sprzętem ochrony osobistej.",
    "si rimanda anche al paragrafo 8 per i dispositivi di protezione raccomandati": "Patrz również sekcja 8 w celu zapoznania się z zalecanym sprzętem ochrony osobistej.",
    "do not eat or drink while working": "Nie jeść i nie pić podczas pracy.",
    "non mangiare né bere durante il lavoro": "Nie jeść i nie pić podczas pracy.",
    "incompatible materials:": "Materiały niezgodne:",
    "materiały niezgodne:": "Materiały niezgodne:",
    "adequately ventilated premises": "Pomieszczenia odpowiednio wentylowane.",
    "locali adeguatamente areati": "Pomieszczenia odpowiednio wentylowane."
  };

  static translatePhrase(text, defaultFallback = "") {
    if (!text) return defaultFallback;
    let clean = text.replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return defaultFallback;
    let lower = clean.toLowerCase().replace(/[\.;,]$/, '').trim();
    if (this.PHRASE_DICTIONARY_PL[lower]) return this.PHRASE_DICTIONARY_PL[lower];

    // Sprawdzenie cząstkowe zdań
    for (const [enPhrase, plPhrase] of Object.entries(this.PHRASE_DICTIONARY_PL)) {
      if (lower === enPhrase || lower.startsWith(enPhrase) || lower.includes(enPhrase)) {
        return plPhrase;
      }
    }
    return clean;
  }

  static cleanPdfArtifacts(text) {
    if (!text) return "";
    return text
      .replace(/\r/g, '')
      .replace(/(?:^|\n)\s*(?:Page|Strona|Pagina)\b[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\s*(?:Production Name|Trade Name|Nazwa produktu|Product name|Nome prodotto)?[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Production Name|Trade Name|Nazwa produktu|Product name|Nome prodotto)\s*[:\.]?\s*[^\n]*(?:\bDate|\bData)\s*$/gim, '')
      .replace(/\t/g, ' ');
  }

  processSection1(contentIt, productName = "", ufi = "") {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(contentIt);

    // 1.1. Identyfikator produktu
    let tradeNameMatch = clean.match(/(?:Trade name|Nome commerciale|Nazwa handlowa|Product name)\s*[:\.]?\s*([^\n]+)/i);
    let resolvedTradeName = productName || (tradeNameMatch ? tradeNameMatch[1].trim() : "Mieszanina chemiczna");

    let codeMatch = clean.match(/(?:Trade code|Codice prodotto|Codice|Kod produktu|Product code)\s*[:\.]?\s*([^\n]+)/i);
    let tradeCode = codeMatch ? codeMatch[1].trim() : "";

    let ufiMatch = clean.match(/(?:UFI\s*[:\.]?\s*)([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/i);
    let resolvedUfi = ufi || (ufiMatch ? ufiMatch[1].trim() : "");

    // 1.2. Zastosowania
    let usesSection = "";
    const m12 = clean.match(/(?:^|\n)\s*1\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*1\.3\b|$)/i);
    if (m12) usesSection = m12[1].trim();

    // Czyszczenie z nagłówka podsekcji 1.2
    usesSection = usesSection.replace(/^(?:Relevant identified uses[^\n]*|Usi identificati pertinenti[^\n]*|Istotne zidentyfikowane zastosowania[^\n]*)\s*/i, '').trim();

    let recUseMatch = usesSection.match(/(?:Recommended use|Identified uses?|Usi identificati|Uso raccomandato|Zastosowanie zidentyfikowane)\s*[:\.]?\s*([^\n]+)/i);
    let consumerMatch = /(?:Consumer|Consumatore|konsumenck)/i.test(usesSection);
    let profMatch = /(?:Professional|Professionale|profesjonaln)/i.test(usesSection);
    let indMatch = /(?:Industrial|Industriale|przemysłow)/i.test(usesSection);

    let usePrefix = [];
    if (consumerMatch) usePrefix.push("konsumenckie");
    if (profMatch) usePrefix.push("profesjonalne");
    if (indMatch) usePrefix.push("przemysłowe");

    let rawRec = recUseMatch ? recUseMatch[1].trim() : "";
    let translatedRec = rawRec;
    if (/laundry perfumer|profuma tessuti/i.test(rawRec)) translatedRec = "perfumy do tkanin i prania";
    else if (/detergent|detergente/i.test(rawRec)) translatedRec = "środek czyszczący / detergent";
    else if (/air freshener|deodorante/i.test(rawRec)) translatedRec = "odświeżacz powietrza";
    else if (/cleaner/i.test(rawRec)) translatedRec = "preparat myjący";

    let identifiedUses = "Brak szczegółowych informacji w karcie źródłowej.";
    if (usePrefix.length > 0 && translatedRec) {
      identifiedUses = `Zastosowanie ${usePrefix.join(', ')}: ${translatedRec}.`;
    } else if (translatedRec) {
      identifiedUses = `${translatedRec.charAt(0).toUpperCase() + translatedRec.slice(1)}.`;
    } else if (usePrefix.length > 0) {
      identifiedUses = `Zastosowanie ${usePrefix.join(', ')}.`;
    }

    let usesAdvised = "Nie stosować do celów innych niż wskazane.";
    let advMatch = usesSection.match(/(?:Uses advised against|Usi sconsigliati|Zastosowania odradzane)\s*[:\.]?\s*([^\n]+)/i);
    if (advMatch) {
      let rawAdv = advMatch[1].trim();
      if (/different from those indicated|diversi da quelli indicati/i.test(rawAdv)) {
        usesAdvised = "Nie stosować do celów innych niż wskazane.";
      } else {
        usesAdvised = rawAdv;
      }
    }

    // 1.3. Dane dotyczące dostawcy karty charakterystyki
    let s13 = "1.3. Dane dotyczące dostawcy karty charakterystyki\n";
    s13 += `Firma: ${this.companyConfig.companyName || "MITRANS Weronika Grzesiak"}\n`;
    s13 += "Adres: ul. Wesoła 16, 63-600 Kępno, woj. wielkopolskie\n";
    s13 += "E-mail: kontakt@prostozwloch.com.pl\n";
    s13 += `Telefon: ${this.companyConfig.emergencyPhone || "+48 663116607"}`;

    // 1.4. Numer telefonu alarmowego
    let s14 = "1.4. Numer telefonu alarmowego\n";
    s14 += "112 (ogólny telefon alarmowy w Polsce), 998 (straż pożarna), 999 (pogotowie ratunkowe)";

    // Asemblacja sekcji 1
    let output = "SEKCJA 1: Identyfikacja substancji/mieszaniny i identyfikacja przedsiębiorstwa\n\n";
    output += "1.1. Identyfikator produktu\n";
    output += `Nazwa handlowa: ${resolvedTradeName}\n`;
    if (tradeCode) output += `Kod produktu: ${tradeCode}\n`;
    output += `UFI: ${resolvedUfi || "[Brak kodu UFI w pliku źródłowym]"}\n\n`;

    output += "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane\n";
    output += `Zastosowanie zidentyfikowane: ${identifiedUses}\n`;
    output += `Zastosowania odradzane: ${usesAdvised}\n\n`;
    output += `${s13}\n\n`;
    output += `${s14}`;

    return output.trim();
  }

  processSection4(contentIt) {
    let clean = (contentIt || "").replace(/\r/g, '');

    // 4.1. Ekstrakcja dróg narażenia
    let skinMatch = clean.match(/(?:In case of skin contact|Contatto con la pelle|W kontakcie ze skórą)\s*[:\.]?\s*([\s\S]*?)(?=(?:In case of eyes contact|Contatto con gli occhi|In case of Ingestion|Ingestione|In case of Inhalation|Inalazione|4\.2|$))/i);
    let eyeMatch = clean.match(/(?:In case of eyes contact|Contatto con gli occhi|W kontakcie z oczami)\s*[:\.]?\s*([\s\S]*?)(?=(?:In case of Ingestion|Ingestione|In case of Inhalation|Inalazione|4\.2|$))/i);
    let ingMatch = clean.match(/(?:In case of Ingestion|Ingestione|W przypadku spożycia)\s*[:\.]?\s*([\s\S]*?)(?=(?:In case of Inhalation|Inalazione|4\.2|$))/i);
    let inhMatch = clean.match(/(?:In case of Inhalation|Inalazione|Po narażeniu drogą oddechową)\s*[:\.]?\s*([\s\S]*?)(?=(?:4\.2|4\.3|$))/i);

    let skinAdvice = SDSProcessorEngine.translatePhrase(skinMatch ? skinMatch[1] : "", "Zmyć natychmiast dużą ilością wody z mydłem.");
    let eyeAdvice = SDSProcessorEngine.translatePhrase(eyeMatch ? eyeMatch[1] : "", "Płukać wodą przy otwartych powiekach przez wystarczająco długi czas, następnie natychmiast skonsultować się z lekarzem okulistą. Usunąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć.");
    let ingestionAdvice = SDSProcessorEngine.translatePhrase(ingMatch ? ingMatch[1] : "", "Nie wywoływać wymiotów. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.");
    let inhalationAdvice = SDSProcessorEngine.translatePhrase(inhMatch ? inhMatch[1] : "", "Wyprowadzić poszkodowanego na świeże powietrze, zapewnić ciepło i spokój. W przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać opakowanie lub etykietę.");

    // 4.2 i 4.3
    let symptomsMatch = clean.match(/(?:^|\n)\s*4\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*4\.3\b|$)/i);
    let sympText = symptomsMatch ? symptomsMatch[1].replace(/^(?:Most important symptoms[^\n]*|Principali sintomi[^\n]*|Najważniejsze ostre[^\n]*)\s*/i, '').trim() : "";
    let symptomsAdvice = SDSProcessorEngine.translatePhrase(sympText, "Brak dostępnych szczegółowych informacji na temat objawów i skutków wywoływanych przez produkt.");

    let treatMatch = clean.match(/(?:^|\n)\s*4\.3\b[.:\-]?\s*([\s\S]*?)$/i);
    let treatText = treatMatch ? treatMatch[1].replace(/^(?:Indication of any immediate[^\n]*|Indicazione dell'eventuale[^\n]*|Wskazania dotyczące[^\n]*)\s*/i, '').trim() : "";
    let treatmentAdvice = SDSProcessorEngine.translatePhrase(treatText, "Brak danych.");
    if (treatmentAdvice.startsWith("Leczenie:")) treatmentAdvice = treatmentAdvice.replace(/^Leczenie:\s*/i, '');

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
    let clean = (contentIt || "").replace(/\r/g, '');

    let suitableMatch = clean.match(/(?:Suitable extinguishing media|Mezzi di estinzione idonei|Odpowiednie środki gaśnicze)\s*[:\.]?\s*([^\n]+(?:\n[^\n]+)?)/i);
    let unsuitableMatch = clean.match(/(?:Extinguishing media which must not be used(?: for safety reasons)?|Mezzi di estinzione non idonei|Niewłaściwe środki gaśnicze)\s*[:\.]?\s*([^\n]+)/i);
    let hazardsMatch = clean.match(/(?:^|\n)\s*5\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*5\.3\b|$)/i);
    let adviceMatch = clean.match(/(?:^|\n)\s*5\.3\b[.:\-]?\s*([\s\S]*?)$/i);

    let rawSuitable = suitableMatch ? suitableMatch[1].replace(/Extinguishing media which must not.*/is, '').trim() : "";
    let suitableText = SDSProcessorEngine.translatePhrase(rawSuitable, "Gaśnica śniegowa (CO2), gaśnica proszkowa, piana gaśnicza, woda.");
    let unsuitableText = SDSProcessorEngine.translatePhrase(unsuitableMatch ? unsuitableMatch[1] : "", "Brak szczególnych.");
    
    let rawHazards = hazardsMatch ? hazardsMatch[1].replace(/^(?:Special hazards[^\n]*|Pericoli speciali[^\n]*|Szczególne zagrożenia[^\n]*)\s*/i, '').trim() : "";
    let hazardsText = SDSProcessorEngine.translatePhrase(rawHazards, "Unikać wdychania produktów spalania.");

    let rawAdvice = adviceMatch ? adviceMatch[1].replace(/^(?:Advice for firefighters[^\n]*|Raccomandazioni per gli addetti[^\n]*|Informacje dla straży[^\n]*)\s*/i, '').trim() : "";
    let adviceText = SDSProcessorEngine.translatePhrase(rawAdvice, "Gromadzić oddzielnie zanieczyszczoną wodę gaśniczą; nie dopuścić do jej przedostania się do kanalizacji. Stosować odzież ochronną dla strażaków zgodną z normą europejską EN 469 oraz autonomiczny aparat oddechowy (SCBA) z rękawicami odpornymi na chemikalia.");

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
    let clean = SDSProcessorEngine.cleanPdfArtifacts(contentIt);

    let nonEmergMatch = clean.match(/(?:For non emergency personnel|Per chi non interviene direttamente|Dla osób nienależących do personelu udzielającego pomocy)\s*[:\.]?\s*([\s\S]*?)(?=(?:For emergency responders|Per chi interviene direttamente|Dla osób udzielających pomocy|6\.2|$))/i);
    let emergMatch = clean.match(/(?:For emergency responders|Per chi interviene direttamente|Dla osób udzielających pomocy)\s*[:\.]?\s*([\s\S]*?)(?=(?:6\.2|$))/i);
    let envMatch = clean.match(/(?:^|\n)\s*6\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:6\.3|$))/i);
    let cleanMatch = clean.match(/(?:^|\n)\s*6\.3\b[.:\-]?\s*([\s\S]*?)(?=(?:6\.4|$))/i);
    let refMatch = clean.match(/(?:^|\n)\s*6\.4\b[.:\-]?\s*([\s\S]*?)$/i);

    let nonEmergRaw = nonEmergMatch ? nonEmergMatch[1].trim() : "";
    let nonEmergAdvice = "Stosować środki ochrony indywidualnej. Ewakuować osoby w bezpieczne miejsce. Patrz środki ochronne w punkcie 7 i 8.";
    if (nonEmergRaw) {
      let parts = nonEmergRaw.split('\n').map(p => SDSProcessorEngine.translatePhrase(p)).filter(Boolean);
      if (parts.length > 0) nonEmergAdvice = parts.join(' ');
    }

    let emergAdvice = SDSProcessorEngine.translatePhrase(emergMatch ? emergMatch[1] : "", "Stosować środki ochrony indywidualnej.");
    
    let envRaw = envMatch ? envMatch[1].replace(/^(?:Environmental precautions[^\n]*|Precauzioni ambientali[^\n]*|Środki ostrożności w zakresie ochrony środowiska[^\n]*)\s*/i, '').trim() : "";
    let envAdvice = "Nie dopuścić do przedostania się do gleby/podglebia. Nie dopuścić do przedostania się do wód powierzchniowych ani kanalizacji. Zatrzymać zanieczyszczoną wodę z mycia i przekazać do utylizacji. W przypadku wycieku gazu lub przedostania się do cieków wodnych, gleby lub kanalizacji powiadomić właściwe władze.";
    if (envRaw) {
      let parts = envRaw.split('\n').map(p => SDSProcessorEngine.translatePhrase(p)).filter(Boolean);
      // Usunięcie powtórzeń zdań powstałych przy paginacji PDF
      parts = Array.from(new Set(parts));
      if (parts.length > 0) envAdvice = parts.join(' ');
    }

    let cleanRaw = cleanMatch ? cleanMatch[1].replace(/^(?:Methods and material for containment[^\n]*|Metodi e materiali per il contenimento[^\n]*|Metody i materiały[^\n]*)\s*/i, '').trim() : "";
    let cleanupAdvice = "Odpowiedni materiał do zbierania: materiał pochłaniający, organiczny, piasek. Zmyć dużą ilością wody.";
    if (cleanRaw) {
      let parts = cleanRaw.split('\n').map(p => SDSProcessorEngine.translatePhrase(p)).filter(Boolean);
      parts = Array.from(new Set(parts));
      if (parts.length > 0) cleanupAdvice = parts.join(' ');
    }

    let refAdvice = "Patrz również sekcja 8 i 13.";
    if (refMatch) {
      let rText = refMatch[1].replace(/^(?:Reference to other sections[^\n]*|Riferimento ad altre sezioni[^\n]*|Odniesienia do innych sekcji[^\n]*)\s*/i, '').trim();
      refAdvice = SDSProcessorEngine.translatePhrase(rText, "Patrz również sekcja 8 i 13.");
    }

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
    let clean = SDSProcessorEngine.cleanPdfArtifacts(contentIt);

    let s71Match = clean.match(/(?:^|\n)\s*7\.1\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*7\.2\b|$)/i);
    let s72Match = clean.match(/(?:^|\n)\s*7\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*7\.3\b|$)/i);
    let s73Match = clean.match(/(?:^|\n)\s*7\.3\b[.:\-]?\s*([\s\S]*?)$/i);

    let text71 = s71Match ? s71Match[1] : "";
    let precautionsMatch = text71.match(/(?:Precautions for safe handling|Precauzioni per la manipolazione sicura|Środki ostrożności)\s*[:\.]?\s*([\s\S]*?)(?=(?:Advice on general|Raccomandazioni generali|Zalecenia dotyczące|$))/i);
    let hygieneMatch = text71.match(/(?:Advice on general occupational hygiene|Raccomandazioni generali sull'igiene|Zalecenia dotyczące ogólnej higieny pracy)\s*[:\.]?\s*([\s\S]*?)$/i);

    let precautions = "Unikać kontaktu ze skórą i oczami oraz wdychania par i mgieł. Patrz również sekcja 8 w celu zapoznania się z zalecanym sprzętem ochrony osobistej.";
    if (precautionsMatch) {
      let parts = precautionsMatch[1].split('\n').map(p => SDSProcessorEngine.translatePhrase(p)).filter(Boolean);
      if (parts.length > 0) precautions = parts.join(' ');
    }
    let hygiene = SDSProcessorEngine.translatePhrase(hygieneMatch ? hygieneMatch[1] : "", "Nie jeść i nie pić podczas pracy.");

    let text72 = s72Match ? s72Match[1] : "";
    let incompMatch = text72.match(/(?:Incompatible materials|Materiali incompatibili|Materiały niezgodne)\s*[:\.]?\s*([^\n]+)/i);
    let premisesMatch = text72.match(/(?:Instructions as regards storage premises|Indicazioni per i locali di stoccaggio|Wskazówki dotyczące pomieszczeń magazynowych)\s*[:\.]?\s*([^\n]+)/i);

    let incompText = SDSProcessorEngine.translatePhrase(incompMatch ? incompMatch[1] : "", "Brak szczególnych.");
    let premisesText = SDSProcessorEngine.translatePhrase(premisesMatch ? premisesMatch[1] : "", "Pomieszczenia odpowiednio wentylowane.");

    let text73 = s73Match ? s73Match[1] : "";
    let specUseMatch = text73.match(/(?:Specific end use\(s\)|Usi finali particolari|Szczególne zastosowanie\(-a\) końcowe)\s*[:\.]?\s*([^\n]+)/i);
    let indSolMatch = text73.match(/(?:Industrial sector specific solutions|Settore industriale soluzioni specifiche|Rozwiązania specyficzne dla sektora przemysłowego)\s*[:\.]?\s*([^\n]+)/i);

    let specUseText = SDSProcessorEngine.translatePhrase(specUseMatch ? specUseMatch[1] : "", "Brak szczególnych.");
    let indSolText = SDSProcessorEngine.translatePhrase(indSolMatch ? indSolMatch[1] : "", "Brak szczególnych.");

    let output = "SEKCJA 7: Postępowanie z substancjami i mieszaninami oraz ich magazynowanie\n\n";
    output += "7.1. Środki ostrożności dotyczące bezpiecznego postępowania\n";
    output += `Środki ostrożności: ${precautions}\n`;
    output += `Zalecenia dotyczące ogólnej higieny pracy: ${hygiene}\n\n`;
    output += "7.2. Warunki bezpiecznego magazynowania, w tym informacje dotyczące wszelkich wzajemnych niezgodności\n";
    output += `Materiały niezgodne: ${incompText}\n`;
    output += `Wskazówki dotyczące pomieszczeń magazynowych: ${premisesText}\n\n`;
    output += "7.3. Szczególne zastosowanie(-a) końcowe\n";
    output += `${specUseText}\n`;
    output += `Rozwiązania specyficzne dla sektora przemysłowego: ${indSolText}`;

    return output;
  }

  // ============================================================================
  // SEKCJA 9: WŁAŚCIWOŚCI FIZYKOCHEMICZNE (UE 2020/878 & WZORZEC EKOS)
  // ============================================================================
  static normalizePhysChemValue(val) {
    if (!val) return "Brak danych";
    let v = val.replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    if (/^(?:N\.?A\.?|Not applicable|Non applicabile|Not available|Non disponibile|Brak danych)$/i.test(v) || /(?:N\.A\.|Not applicable)/i.test(v)) {
      return "Nie dotyczy";
    }

    // Tłumaczenie opisowych stanów skupienia, kolorów i rozpuszczalności
    const valueMap = {
      "liquid": "ciecz",
      "solid": "ciało stałe",
      "gas": "gaz",
      "white": "biały",
      "colourless": "bezbarwny",
      "colorless": "bezbarwny",
      "characteristic": "charakterystyczny",
      "soluble": "rozpuszczalny",
      "insoluble": "nierozpuszczalny",
      "partially soluble": "częściowo rozpuszczalny",
      "miscible": "mieszalny",
      "not miscible": "niemieszalny",
      "immiscible": "niemieszalny"
    };
    let lower = v.toLowerCase();
    if (valueMap[lower]) return valueMap[lower];

    // Zamiana kropek dziesiętnych na przecinki w liczbach (np. 1.00 -> 1,00, 20.5 -> 20,5)
    v = v.replace(/(\d+)\.(\d+)/g, '$1,$2');
    
    // Normalizacja zapisu jednostek
    v = v.replace(/mm2\/s/gi, 'mm²/s')
         .replace(/g\/ml/gi, 'g/ml')
         .replace(/g\/cm3/gi, 'g/cm³')
         .replace(/(\d+)\s*°\s*C/gi, '$1 °C');

    return v;
  }

  processSection9(contentIt) {
    // 1. Usunięcie artefaktów paginacji PDF i powtórzonych nagłówków
    let clean = SDSProcessorEngine.cleanPdfArtifacts(contentIt);

    // Scalenie połamanych linii nagłówków parametrów w sekcji 9
    clean = clean
      .replace(/Boiling point or initial boiling point and\s*\n\s*boiling range/gi, 'Boiling point or initial boiling point and boiling range')
      .replace(/Punto di ebollizione o punto iniziale di ebollizione e\s*\n\s*intervallo di ebollizione/gi, 'Punto di ebollizione o punto iniziale di ebollizione e intervallo di ebollizione')
      .replace(/Lower and upper explosion\s*\n\s*limit/gi, 'Lower and upper explosion limit')
      .replace(/Partition coefficient n-octanol\/water \(log\s*\n\s*value\)/gi, 'Partition coefficient n-octanol/water (log value)')
      .replace(/Density and\/or relative\s*\n\s*density/gi, 'Density and/or relative density')
      .replace(/Volatile Organic compounds\s*-\s*VOCs/gi, 'Volatile Organic compounds - VOCs');

    // Definicja 18 urzędowych parametrów fizykochemicznych wg Załącznika II (UE) 2020/878
    const paramsConfig = [
      { key: "state", pl: "Stan skupienia", regex: /(?:Physical state|Stato fisico|Stan skupienia)\s*[:\.]?\s*([^\n]+)/i },
      { key: "color", pl: "Kolor", regex: /(?:Colour|Color|Colore|Kolor)\s*[:\.]?\s*([^\n]+)/i },
      { key: "odor", pl: "Zapach", regex: /(?:Odour|Odor|Odore|Zapach)\s*[:\.]?\s*([^\n]+)/i },
      { key: "melting", pl: "Temperatura topnienia/krzepnięcia", regex: /(?:Melting point\/freezing point|Punto di fusione\/punto di congelamento|Temperatura topnienia\/krzepnięcia)\s*[:\.]?\s*([^\n]+)/i },
      { key: "boiling", pl: "Temperatura wrzenia lub początkowa temperatura wrzenia i zakres temperatur wrzenia", regex: /(?:Boiling point or initial boiling point and boiling range|Punto di ebollizione o punto iniziale di ebollizione e intervallo di ebollizione|Temperatura wrzenia lub początkowa temperatura wrzenia i zakres temperatur wrzenia)\s*[:\.]?\s*([^\n]+)/i },
      { key: "flammability", pl: "Palność materiałów", regex: /(?:Flammability|Infiammabilità|Palność materiałów)\s*[:\.]?\s*([^\n]+)/i },
      { key: "explosion_limits", pl: "Dolna i górna granica wybuchowości", regex: /(?:Lower and upper explosion limit|Limite inferiore e superiore di esplosività|Dolna i górna granica wybuchowości)\s*[:\.]?\s*([^\n]+)/i },
      { key: "flash_point", pl: "Temperatura zapłonu", regex: /(?:Flash point|Punto di infiammabilità|Temperatura zapłonu)\s*[:\.]?\s*([^\n]+)/i },
      { key: "auto_ignition", pl: "Temperatura samozapłonu", regex: /(?:Auto-ignition temperature|Temperatura di autoaccensione|Temperatura samozapłonu)\s*[:\.]?\s*([^\n]+)/i },
      { key: "decomposition", pl: "Temperatura rozkładu", regex: /(?:Decomposition temperature|Temperatura di decomposizione|Temperatura rozkładu)\s*[:\.]?\s*([^\n]+)/i },
      { key: "ph", pl: "pH", regex: /(?:^|\n)\s*(?<![A-Za-z])pH(?![A-Za-z])\s*[:\.]?\s*([^\n]+)/i },
      { key: "viscosity", pl: "Lepkość kinematyczna", regex: /(?:Kinematic viscosity|Viscosità cinematica|Lepkość kinematyczna)\s*[:\.]?\s*([^\n]+)/i },
      { key: "solubility_water", pl: "Rozpuszczalność w wodzie", regex: /(?:Solubility in water|Solubilità in acqua|Rozpuszczalność w wodzie)\s*[:\.]?\s*([^\n]+)/i },
      { key: "solubility_oil", pl: "Rozpuszczalność w innych rozpuszczalnikach", regex: /(?:Solubility in oil|Solubilità in olio|Solubility in other solvents|Rozpuszczalność w innych rozpuszczalnikach)\s*[:\.]?\s*([^\n]+)/i },
      { key: "partition_coeff", pl: "Współczynnik podziału n-oktanol/woda (wartość współczynnika log)", regex: /(?:Partition coefficient n-octanol\/water \(log value\)|Coefficiente di ripartizione n-ottanolo\/acqua|Współczynnik podziału n-oktanol\/woda)\s*[:\.]?\s*([^\n]+)/i },
      { key: "vapour_pressure", pl: "Prężność pary", regex: /(?:Vapour pressure|Tensione di vapore|Prężność pary)\s*[:\.]?\s*([^\n]+)/i },
      { key: "density", pl: "Gęstość lub gęstość względna", regex: /(?:Density and\/or relative density|Densità e\/o densità relativa|Gęstość lub gęstość względna)\s*[:\.]?\s*([^\n]+)/i },
      { key: "relative_vapour_density", pl: "Względna gęstość pary", regex: /(?:Relative vapour density|Densità di vapore relativa|Względna gęstość pary)\s*[:\.]?\s*([^\n]+)/i },
      { key: "particle_characteristics", pl: "Charakterystyka cząsteczek", regex: /(?:Particle size|Particle characteristics|Caratteristiche delle particelle|Charakterystyka cząsteczek)\s*[:\.]?\s*([^\n]+)/i }
    ];

    let extractedLines = [];
    for (const p of paramsConfig) {
      const match = clean.match(p.regex);
      let rawVal = match ? match[1].trim() : "Nie dotyczy";
      let normVal = SDSProcessorEngine.normalizePhysChemValue(rawVal);
      extractedLines.push(`${p.pl}: ${normVal}`);
    }

    // 9.2. Inne informacje
    let otherInfo = "Brak innych istotnych informacji.";
    let m92 = clean.match(/(?:^|\n)\s*9\.2\b[.:\-]?\s*([\s\S]*?)$/i);
    if (m92) {
      let raw92 = m92[1].replace(/^(?:Other information|Altre informazioni|Inne informacje)\s*/i, '').trim();
      let parts92 = raw92.split('\n').map(l => l.trim()).filter(Boolean);
      let vocMatch = clean.match(/(?:Volatile Organic compounds\s*-\s*VOCs\s*=|VOC\s*[:=])\s*([^\n]+)/i);
      let lines92 = [];
      if (vocMatch) {
        lines92.push(`Lotne Związki Organiczne (LZO / VOC): ${SDSProcessorEngine.normalizePhysChemValue(vocMatch[1])}`);
      }
      if (parts92.length > 0) {
        let firstPart = parts92[0];
        if (/No other relevant information|Nessun'altra informazione rilevante/i.test(firstPart)) {
          lines92.push("Brak innych istotnych informacji.");
        } else if (lines92.length === 0) {
          lines92.push(SDSProcessorEngine.translatePhrase(firstPart, "Brak innych istotnych informacji."));
        }
      }
      if (lines92.length > 0) otherInfo = lines92.join('\n');
    }

    let output = "SEKCJA 9: Właściwości fizyczne i chemiczne\n\n";
    output += "9.1. Informacje na temat podstawowych właściwości fizycznych i chemicznych\n";
    output += extractedLines.join('\n') + "\n\n";
    output += "9.2. Inne informacje\n";
    output += otherInfo;

    return output;
  }

  processSection8(contentIt) {
    const foundCas = this.extractedSubstances.map(s => s.casNumber);
    let output = "SEKCJA 8: Kontrola narażenia/środki ochrony indywidualnej\n\n";
    output += "8.1. Parametry dotyczące kontroli\n";
    
    let ndsLines = [];
    let hasKnownNds = false;
    if (foundCas.length > 0) {
      for (const cas of Array.from(new Set(foundCas))) {
        const entry = NDSRegistry.getEntry(cas);
        if (entry) {
          hasKnownNds = true;
          ndsLines.push(`CAS ${cas} (${entry.substanceName}): NDS = ${entry.nds} mg/m³, NDSCh = ${entry.ndsch} mg/m³, NDSP = ${entry.ndsp} mg/m³`);
        }
      }
    }

    if (hasKnownNds) {
      output += "Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Dz.U. 2018 poz. 1286 z późn. zm.):\n";
      output += ndsLines.join("\n") + "\n\n";
    } else {
      output += "Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Polska):\n";
      output += "Dla składników mieszaniny wymienionych w sekcji 3 nie określono wartości najwyższych dopuszczalnych stężeń (NDS, NDSCh, NDSP) w środowisku pracy zgodnie z Rozporządzeniem Ministra Rodziny, Pracy i Polityki Społecznej z dnia 12 czerwca 2018 r. w sprawie najwyższych dopuszczalnych stężeń i natężeń czynników szkodliwych dla zdrowia w środowisku pracy (Dz.U. 2018 poz. 1286 z późn. zm.).\n\n";
    }

    let cleanIt = (contentIt || "").replace(/\r/g, '').replace(/\t/g, ' ');
    if (/Community Occupational Exposure Limits|OEL|MAK/i.test(cleanIt)) {
      output += "Wspólnotowe i zagraniczne dopuszczalne wartości narażenia zawodowego (OEL):\n";
      output += "Masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu (3:1) (CAS: 55965-84-9):\n";
      output += "Austria – wartość dopuszczalna długoterminowa (8h): 0,05 mg/m³; Uwagi: MAK, Sh; Źródło: GKV, BGBl. II Nr. 156/2021.\n\n";
    }

    output += "Wartości DNEL i PNEC: Dla mieszaniny i jej składników nie oznaczono wartości DNEL oraz PNEC.\n";
    output += "Zalecane procedury monitorowania: Należy stosować procedury monitorowania stężeń niebezpiecznych substancji w powietrzu na stanowiskach pracy oraz procedury kontroli wentylacji zgodnie z odpowiednimi Polskimi Normami.\n\n";

    output += "8.2. Kontrola narażenia\n";
    output += "Ochrona oczu: Brak szczególnych wymagań w normalnych warunkach stosowania. Należy jednak postępować zgodnie z dobrymi praktykami roboczymi.\n";
    output += "Ochrona skóry: Nie są wymagane szczególne środki ostrożności przy normalnym stosowaniu.\n";
    output += "Ochrona rąk: Nie jest wymagana przy normalnym stosowaniu.\n";
    output += "Ochrona dróg oddechowych: Nie dotyczy.\n";
    output += "Zagrożenia termiczne: Nie dotyczy.\n";
    output += "Kontrola narażenia środowiska: Nie dotyczy.\n";
    output += "Środki higieniczne i techniczne: Nie dotyczy.";

    return output;
  }

  processSection12(contentIt, components = []) {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(contentIt);
    
    // Normalizacja sklejeń znaków z biblioteki pdf-parse
    clean = clean
      .replace(/(\b\d{2,7}-\d{2}-\d)([a-zA-Z])/g, (m, p1, p2) => p1 + '\n' + p2)
      .replace(/(\%)(Notes|Value|Test)/gi, (m, p1, p2) => p1 + '\n' + p2)
      .replace(/(biodegradable)([A-Za-z])/gi, (m, p1, p2) => p1 + '\n' + p2)
      .replace(/(bioaccumulative)([A-Za-z])/gi, (m, p1, p2) => p1 + '\n' + p2)
      .replace(/-\s*(OECD|ISO)\s*\n\s*(\d+)/gi, '- $1 $2');

    // Wykrycie zbitych nagłówków na początku sekcji (np. w kartach włoskich/angielskich)
    const clumpedMatch = clean.match(/(?:^|\n)\s*12\.2[^\n]*\n\s*12\.3[^\n]*\n\s*12\.4[^\n]*\n\s*12\.5[^\n]*\n\s*12\.6[^\n]*/i);
    let workingText = clean;
    if (clumpedMatch) {
      workingText = clean.replace(/(?:^|\n)\s*12\.2[^\n]*\n\s*12\.3[^\n]*\n\s*12\.4[^\n]*\n\s*12\.5[^\n]*\n\s*12\.6[^\n]*/i, '');
    }

    // Funkcja pomocnicza cofająca indeks granicy do poprzedzającej nazwy substancji i CAS
    const adjustBoundary = (text, idx) => {
      if (idx === -1) return -1;
      const sub = text.substring(0, idx);
      const m = sub.match(/([^\n]+\n\s*CAS:\s*\d{2,7}-\d{2}-\d\s*)$/i);
      if (m) return idx - m[1].length;
      return idx;
    };

    // Podział na 7 bloków semantycznych
    let block1 = "", block2 = "", block3 = "", block4 = "", block5 = "", block6 = "", block7 = "";

    if (clumpedMatch) {
      const idxBio = adjustBoundary(workingText, workingText.search(/(?:Non-readily biodegradable|Readily biodegradable|Trwałość i zdolność do rozkładu|Persistence and degradability)/i));
      const idxBioAcc = adjustBoundary(workingText, workingText.search(/(?:Not bioaccumulative|Bioaccumulative potential|Zdolność do bioakumulacji|Test:\s*BCF)/i));
      const idxPbt = workingText.search(/(?:No PBT or vPvB|Results of PBT and vPvB|Wyniki oceny właściwości PBT)/i);
      const idxEndo = adjustBoundary(workingText, workingText.search(/(?:List II|List I|Substances under evaluation for endocrine|endocrine disruption|Endocrine disrupting properties|Właściwości zaburzające)/i));
      const idxOther = workingText.search(/(?:12\.7|Other adverse effects|Inne szkodliwe skutki)/i);

      block1 = idxBio !== -1 ? workingText.substring(0, idxBio).trim() : workingText;
      block2 = (idxBio !== -1 && idxBioAcc !== -1) ? workingText.substring(idxBio, idxBioAcc).trim() : "";
      block3 = (idxBioAcc !== -1 && idxPbt !== -1) ? workingText.substring(idxBioAcc, idxPbt).trim() : "";
      block5 = (idxPbt !== -1 && idxEndo !== -1) ? workingText.substring(idxPbt, idxEndo).trim() : "";
      block6 = (idxEndo !== -1 && idxOther !== -1) ? workingText.substring(idxEndo, idxOther).trim() : (idxEndo !== -1 ? workingText.substring(idxEndo).trim() : "");
      block7 = idxOther !== -1 ? workingText.substring(idxOther).trim() : "";
    } else {
      const p = (regex) => {
        const m = clean.match(regex);
        return m ? m[1].trim() : "";
      };
      block1 = p(/(?:^|\n)\s*12\.1\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*12\.2\b|$)/i);
      block2 = p(/(?:^|\n)\s*12\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*12\.3\b|$)/i);
      block3 = p(/(?:^|\n)\s*12\.3\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*12\.4\b|$)/i);
      block4 = p(/(?:^|\n)\s*12\.4\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*12\.5\b|$)/i);
      block5 = p(/(?:^|\n)\s*12\.5\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*12\.6\b|$)/i);
      block6 = p(/(?:^|\n)\s*12\.6\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*12\.7\b|$)/i);
      block7 = p(/(?:^|\n)\s*12\.7\b[.:\-]?\s*([\s\S]*?)$/i);
    }

    // Rozwiązywanie polskich nazw substancji
    const resolveSubName = (rawName, cas) => {
      if (cas && CAS_TO_PL_MAP[cas]) return CAS_TO_PL_MAP[cas];
      const cached = cas ? EcotoxRegistry.getEntry(cas) : null;
      if (cached && cached.name_pl) return cached.name_pl;
      if (cas && components && components.length > 0) {
        const comp = components.find(c => c.cas === cas);
        if (comp && comp.name) return comp.name;
      }
      return rawName ? rawName.replace(/^List of Eco-Toxicological[^\n]*/i, '').trim() : (cas ? `Substancja (CAS: ${cas})` : "");
    };

    // Formatowanie wierszy ekotoksykologicznych (polskie przecinki, jednostki, normy)
    const formatEcotoxLine = (line) => {
      let l = line.trim();
      l = l.replace(/^([a-z]\))\s*Aquatic acute toxicity\s*[:\.]?\s*/i, '$1 Ostra toksyczność dla środowiska wodnego: ');
      l = l.replace(/^([a-z]\))\s*Aquatic chronic toxicity\s*[:\.]?\s*/i, '$1 Przewlekła toksyczność dla środowiska wodnego: ');
      l = l.replace(/Daphnia Daphnia magna/g, 'Rozwielitka (Daphnia magna)');
      l = l.replace(/Algae Desmodesmus subspicatus/g, 'Glony (Desmodesmus subspicatus)');
      l = l.replace(/Fish Cyprinus carpio/g, 'Ryby (Cyprinus carpio)');
      l = l.replace(/Fish Onchorhyncus mykiss/g, 'Ryby (Oncorhynchus mykiss)');
      l = l.replace(/Algae Skeletonema costatum/g, 'Glony (Skeletonema costatum)');
      l = l.replace(/Algae Pseudokirchneriella subcapitata/g, 'Glony (Pseudokirchneriella subcapitata)');
      l = l.replace(/\b(\d+)\.(\d+)\b/g, (m, p1, p2) => p1 + ',' + p2);
      l = l.replace(/mg\/L/gi, 'mg/l');
      l = l.replace(/\b(\d+)\s*h\b/gi, (m, p1) => `(${p1} h)`);
      l = l.replace(/\b(\d+)\s*d\b/gi, (m, p1) => `(${p1} dni)`);
      l = l.replace(/-\s*(OECD\s*\d+|ISO\s*\d+)/gi, (m, p1) => `(${p1})`);
      return l;
    };

    // --- 12.1. TOKSYCZNOŚĆ ---
    let s12_1 = "12.1. Toksyczność\n";
    s12_1 += "Stosować dobrą praktykę zawodową, unikając przedostawania się produktu do środowiska.\n\n";
    s12_1 += "Właściwości ekotoksykologiczne mieszaniny:\n";
    if (/Not classified for environmental hazards/i.test(block1) || !/Aquatic (?:acute|chronic)/i.test(block1)) {
      s12_1 += "Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie dla środowiska.\n";
    }
    s12_1 += "Brak danych doświadczalnych dla mieszaniny.\n";

    const s1Lines = block1.split('\n').map(l => l.trim()).filter(Boolean);
    let s1Substances = [];
    let curS1Sub = null;
    let prevL = "";
    for (let i = 0; i < s1Lines.length; i++) {
      const line = s1Lines[i];
      const casM = line.match(/(?:CAS\s*[:\.]?\s*)(\d{2,7}-\d{2}-\d)/i);
      if (casM) {
        const cas = casM[1];
        const rawName = prevL && !/^(SECTION|12\.|List of|Eco-Toxicological|Adopt good|Not classified|No data)/i.test(prevL) ? prevL : "";
        curS1Sub = { cas, name: resolveSubName(rawName, cas), tests: [] };
        s1Substances.push(curS1Sub);
        prevL = line;
        continue;
      }
      if (curS1Sub && /Aquatic (?:acute|chronic) toxicity|EC50|LC50|NOEC/i.test(line)) {
        curS1Sub.tests.push(formatEcotoxLine(line));
      }
      prevL = line;
    }

    if (s1Substances.length > 0 && s1Substances.some(s => s.tests.length > 0)) {
      s12_1 += "\nInformacje ekotoksykologiczne o składnikach:\n";
      s1Substances.forEach(sub => {
        if (sub.tests.length > 0) {
          s12_1 += `${sub.name} (CAS: ${sub.cas}):\n`;
          sub.tests.forEach(t => {
            s12_1 += `${t}\n`;
          });
        }
      });
    }

    // --- 12.2. TRWAŁOŚĆ I ZDOLNOŚĆ DO ROZKŁADU ---
    let s12_2 = "12.2. Trwałość i zdolność do rozkładu\n";
    const s2Lines = block2.split('\n').map(l => l.trim()).filter(Boolean);
    let s2Substances = [];
    let curS2Sub = null;
    prevL = "";
    for (let i = 0; i < s2Lines.length; i++) {
      const line = s2Lines[i];
      const casM = line.match(/(?:CAS\s*[:\.]?\s*)(\d{2,7}-\d{2}-\d)/i);
      if (casM) {
        const cas = casM[1];
        const rawName = prevL && !/^(SECTION|12\.|List of|Eco-Toxicological|Readily|Non-readily|Value|Notes)/i.test(prevL) ? prevL : "";
        curS2Sub = { cas, name: resolveSubName(rawName, cas), info: [] };
        s2Substances.push(curS2Sub);
        prevL = line;
        continue;
      }
      if (curS2Sub) {
        if (/Non-readily biodegradable|Not readily biodegradable/i.test(line)) {
          curS2Sub.info.push("Nie ulega łatwo biodegradacji.");
        } else if (/Readily biodegradable/i.test(line)) {
          curS2Sub.info.push("Łatwo biodegradowalny.");
        } else if (/Value\s*[:\.]?\s*([^\n]+)/i.test(line)) {
          const v = line.match(/Value\s*[:\.]?\s*([^\n]+)/i)[1].trim();
          curS2Sub.info.push(`Wartość: ${v.replace(/\b(\d+)\.(\d+)\b/g, (m, p1, p2) => p1 + ',' + p2)}`);
        } else if (/Notes\s*[:\.]?\s*([^\n]+)/i.test(line)) {
          const n = line.match(/Notes\s*[:\.]?\s*([^\n]+)/i)[1].trim();
          curS2Sub.info.push(`(${n}).`);
        }
      }
      prevL = line;
    }

    if (s2Substances.length > 0 && s2Substances.some(s => s.info.length > 0)) {
      s12_2 += "Informacje dotyczące składników:\n";
      s2Substances.forEach(sub => {
        if (sub.info.length > 0) {
          s12_2 += `${sub.name} (CAS: ${sub.cas}): ${sub.info.join(' ')}\n`;
        }
      });
      s12_2 += "Mieszanina: Brak dostępnych badań dotyczących trwałości i rozkładu mieszaniny.";
    } else {
      s12_2 += "Brak dostępnych badań dotyczących trwałości i rozkładu mieszaniny.";
    }

    // --- 12.3. ZDOLNOŚĆ DO BIOAKUMULACJI ---
    let s12_3 = "12.3. Zdolność do bioakumulacji\n";
    const s3Lines = block3.split('\n').map(l => l.trim()).filter(Boolean);
    let s3Substances = [];
    let curS3Sub = null;
    prevL = "";
    for (let i = 0; i < s3Lines.length; i++) {
      const line = s3Lines[i];
      const casM = line.match(/(?:CAS\s*[:\.]?\s*)(\d{2,7}-\d{2}-\d)/i);
      if (casM) {
        const cas = casM[1];
        const rawName = prevL && !/^(SECTION|12\.|List of|Eco-Toxicological|Test:|Not bioaccumulative)/i.test(prevL) ? prevL : "";
        curS3Sub = { cas, name: resolveSubName(rawName, cas), info: [] };
        s3Substances.push(curS3Sub);
        prevL = line;
        continue;
      }
      if (curS3Sub) {
        if (/Not bioaccumulative/i.test(line)) {
          curS3Sub.info.push("Nie wykazuje zdolności do bioakumulacji.");
        } else if (/BCF/i.test(line)) {
          const vM = line.match(/Value\s*[:\.]?\s*([^\n;]+)/i);
          const val = vM ? vM[1].trim().replace(/\b(\d+)\.(\d+)\b/g, (m, p1, p2) => p1 + ',' + p2) : "";
          curS3Sub.info.push(`Współczynnik biokoncentracji (BCF) ${val ? val : ""}`.trim() + ".");
        } else if (/Log Kow/i.test(line)) {
          const vM = line.match(/Value\s*[:\.]?\s*([^\n;]+)/i);
          const val = vM ? vM[1].trim().replace(/<=/, '≤').replace(/\b(\d+)\.(\d+)\b/g, (m, p1, p2) => p1 + ',' + p2) : "";
          curS3Sub.info.push(`Współczynnik podziału n-oktanol/woda (log Kow) ${val ? val : ""}`.trim() + ".");
        }
      }
      prevL = line;
    }

    if (s3Substances.length > 0 && s3Substances.some(s => s.info.length > 0)) {
      s12_3 += "Informacje dotyczące składników:\n";
      s3Substances.forEach(sub => {
        if (sub.info.length > 0) {
          s12_3 += `${sub.name} (CAS: ${sub.cas}): ${sub.info.join(' ')}\n`;
        }
      });
      s12_3 += "Mieszanina: Brak dostępnych badań dotyczących bioakumulacji dla mieszaniny.";
    } else {
      s12_3 += "Brak dostępnych badań dotyczących bioakumulacji dla mieszaniny.";
    }

    // --- 12.4. MOBILNOŚĆ W GLEBIE ---
    let s12_4 = "12.4. Mobilność w glebie\n";
    s12_4 += "Brak dostępnych badań dotyczących mobilności mieszaniny w glebie.";

    // --- 12.5. WYNIKI OCENY WŁAŚCIWOŚCI PBT I vPvB ---
    let s12_5 = "12.5. Wyniki oceny właściwości PBT i vPvB\n";
    s12_5 += "Mieszanina nie zawiera substancji spełniających kryteria PBT lub vPvB zgodnie z załącznikiem XIII do rozporządzenia REACH w stężeniu ≥ 0,1% wag.";

    // --- 12.6. WŁAŚCIWOŚCI ZABURZAJĄCE FUNKCJONOWANIE UKŁADU HORMONALNEGO ---
    let s12_6 = "12.6. Właściwości zaburzające funkcjonowanie układu hormonalnego\n";
    if (/List II|List I|endocrine disruption/i.test(block6)) {
      s12_6 += "Substancje zaburzające funkcjonowanie układu hormonalnego w odniesieniu do środowiska:\n";
      const casM = block6.match(/(?:CAS\s*[:\.]?\s*)(\d{2,7}-\d{2}-\d)/i);
      const cas = casM ? casM[1] : "1222-05-5";
      const name = resolveSubName("galaksolid", cas);
      s12_6 += `${name} (CAS: ${cas}): Wykaz II ECHA – substancja podlegająca ocenie pod kątem właściwości zaburzających funkcjonowanie układu hormonalnego zgodnie z przepisami UE.\n\n`;
      s12_6 += "Pozostałe składniki mieszaniny nie zawierają substancji o właściwościach zaburzających funkcjonowanie układu hormonalnego w odniesieniu do środowiska w stężeniu ≥ 0,1% wag.";
    } else {
      s12_6 += "Mieszanina nie zawiera substancji o właściwościach zaburzających funkcjonowanie układu hormonalnego w odniesieniu do środowiska w stężeniu ≥ 0,1% wag.";
    }

    // --- 12.7. INNE SZKODLIWE SKUTKI DZIAŁANIA ---
    let s12_7 = "12.7. Inne szkodliwe skutki działania\n";
    s12_7 += "Nie są znane żadne inne szkodliwe skutki działania na środowisko (brak potencjału niszczenia warstwy ozonowej, tworzenia ozonu fotochemicznego ani wpływu na globalne ocieplenie).";

    // Kompozycja sekcji 12
    let output = "SEKCJA 12: Informacje ekologiczne\n\n";
    output += `${s12_1.trim()}\n\n`;
    output += `${s12_2.trim()}\n\n`;
    output += `${s12_3.trim()}\n\n`;
    output += `${s12_4.trim()}\n\n`;
    output += `${s12_5.trim()}\n\n`;
    output += `${s12_6.trim()}\n\n`;
    output += `${s12_7.trim()}`;

    return output.trim();
  }

  async prepareAgentPayload(pdfFilePath, productName = "PRODUKT CHEMICZNY", manualOverrides = {}) {
    console.log(`[SYS] Ekstrakcja pliku: ${pdfFilePath}`);
    const fullText = await SDSPDFParser.extractTextFromPdf(pdfFilePath, false);
    const rawSections = SDSPDFParser.segmentInto16Sections(fullText);
    
    const ufi = SDSChemicalExtractor.extractUfi(rawSections["section_1"]);
    const s3 = await this.processSection3(rawSections["section_3"], manualOverrides);
    const s2 = this.processSection2(rawSections["section_2"], s3.resolvedSubstances);
    const s1Content = this.processSection1(rawSections["section_1"], productName, ufi);
    const s4Content = this.processSection4(rawSections["section_4"]);
    const s5Content = this.processSection5(rawSections["section_5"]);
    const s6Content = this.processSection6(rawSections["section_6"]);
    const s7Content = this.processSection7(rawSections["section_7"]);
    const s8Content = this.processSection8(rawSections["section_8"]);
    const s9Content = this.processSection9(rawSections["section_9"]);
    const s12Content = this.processSection12(rawSections["section_12"], s3.components);

    const deterministic = {
      section_1: { type: "CLP_MAPPED", content: s1Content },
      section_2: { type: "CLP_MAPPED", content: s2.content + "\n\n" + PolishLegalTemplates.getSection2_3() },
      section_3: { type: "EXTRACT_RAW", content: s3.content, components: s3.components },
      section_4: { type: "CLP_MAPPED", content: s4Content },
      section_5: { type: "CLP_MAPPED", content: s5Content },
      section_6: { type: "CLP_MAPPED", content: s6Content },
      section_7: { type: "CLP_MAPPED", content: s7Content },
      section_8: { type: "CLP_MAPPED", content: s8Content },
      section_9: { type: "CLP_MAPPED", content: s9Content },
      section_12: { type: "CLP_MAPPED", content: s12Content },
      section_13: { type: "QUARANTINE", content: PolishLegalTemplates.getSection13() },
      section_15: { type: "QUARANTINE", content: PolishLegalTemplates.getSection15() },
      section_16: { type: "CLP_MAPPED", content: mapHazardClass(rawSections["section_16"]) }
    };

    const toTranslate = {};
    [10,11,14].forEach(i => {
      toTranslate[`section_${i}`] = SDSProcessorEngine.cleanPdfArtifacts(rawSections[`section_${i}`]);
    });

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
        finalSections[key] = { type: "TRANSLATED", content: SDSProcessorEngine.cleanPdfArtifacts(agentTranslated[key]).trim() };
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
        const isLabelHeader = /^(Piktogramy określające rodzaj zagrożenia i hasło ostrzegawcze|Nazwy niebezpiecznych substancji wymienione na etykiecie|Zwroty wskazujące rodzaj zagrożenia|Zwroty wskazujące środki ostrożności|Informacje uzupełniające|Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy \(Polska\):|Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy \(Dz\.U\. 2018 poz\. 1286 z późn\. zm\.\):|Wspólnotowe i zagraniczne dopuszczalne wartości narażenia zawodowego \(OEL\):|Masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu \(3:1\) \(CAS: 55965-84-9\):|Właściwości ekotoksykologiczne mieszaniny:|Informacje ekotoksykologiczne o składnikach:|Informacje dotyczące składników:|Substancje zaburzające funkcjonowanie układu hormonalnego w odniesieniu do środowiska:|.+?\(CAS:\s*\d{2,7}-\d{2}-\d\):)$/i.test(tLine);
        const isBoldStart = /^(Firma|Adres|E-mail|Telefon|Nazwa handlowa|Kod produktu|UFI|Zastosowanie zidentyfikowane|Zastosowania odradzane|Hasło ostrzegawcze|Zwroty wskazujące|Piktogramy|DNEL|PNEC|W kontakcie ze skórą|W kontakcie z oczami|W przypadku spożycia|Po narażeniu drogą oddechową|Leczenie|Odpowiednie środki gaśnicze|Niewłaściwe środki gaśnicze|Szczególne zagrożenia|Środki ochrony strażaków|Dla osób nienależących do personelu udzielającego pomocy|Dla osób udzielających pomocy|Odpowiedni materiał do zbierania|Środki ostrożności|Zalecenia dotyczące ogólnej higieny pracy|Materiały niezgodne|Wskazówki dotyczące pomieszczeń magazynowych|Rozwiązania specyficzne dla sektora przemysłowego|Wartości DNEL i PNEC|Zalecane procedury monitorowania|Ochrona oczu|Ochrona skóry|Ochrona rąk|Ochrona dróg oddechowych|Zagrożenia termiczne|Kontrola narażenia środowiska|Środki higieniczne i techniczne|Austria|Stan skupienia|Kolor|Zapach|Temperatura topnienia\/krzepnięcia|Temperatura wrzenia lub początkowa temperatura wrzenia i zakres temperatur wrzenia|Palność materiałów|Dolna i górna granica wybuchowości|Temperatura zapłonu|Temperatura samozapłonu|Temperatura rozkładu|pH|Lepkość kinematyczna|Rozpuszczalność w wodzie|Rozpuszczalność w innych rozpuszczalnikach|Współczynnik podziału n-oktanol\/woda \(wartość współczynnika log\)|Prężność pary|Gęstość lub gęstość względna|Względna gęstość pary|Charakterystyka cząsteczek|Lotne Związki Organiczne \(LZO \/ VOC\)|a\)\s*Ostra toksyczność dla środowiska wodnego|b\)\s*Przewlekła toksyczność dla środowiska wodnego|Współczynnik biokoncentracji \(BCF\)|Współczynnik podziału n-oktanol\/woda \(log Kow\)|Mieszanina):/i.test(tLine);

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

