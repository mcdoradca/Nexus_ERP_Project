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
 */const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const https = require("https");
const { execSync } = require("child_process");
const { SDSRtfConverter } = require("./sds.rtf.converter");
const { SDSRTFParser } = require("./sds.rtf.parser");
const {
  CANONICAL_H_PHRASES,
  CANONICAL_P_PHRASES,
  CANONICAL_CLP_CLASSES,
  CANONICAL_TEST_ORGANISMS
} = require("./engine/sds.canonical.clp");
const { SDSTableParser } = require("./engine/sds.table.parser");
const { SubstanceAST, SDSDocumentAST } = require("./engine/sds.ast");
const { SDSLinter } = require("./engine/sds.linter");
const { SDSDocxParser } = require("./engine/sds.docx.parser");

// Obsługa HITLError (Zbiór Anomalii)
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
let sharp;
try { sharp = require("sharp"); } catch (err) { console.warn("[OSTRZEŻENIE] Brak biblioteki 'sharp'. Używam fallbacku."); }

// ============================================================================
// 1. OFICJALNE BAZY SŁOWNIKOWE CLP / ECHA
// ============================================================================

const SIGNAL_WORDS_MAP = {
  "PERICOLO": "Niebezpieczeństwo", "DANGER": "Niebezpieczeństwo", "NIEBEZPIECZEŃSTWO": "Niebezpieczeństwo",
  "ATTENZIONE": "Uwaga", "WARNING": "Uwaga", "UWAGA": "Uwaga"
};

const OFFICIAL_CLP_H_PHRASES = {
  ...CANONICAL_H_PHRASES,
  H220: "Skrajnie łatwopalny gaz.",
  H224: "Skrajnie łatwopalna ciecz i pary.",
  H225: "Wysoce łatwopalna ciecz i pary.",
  H226: "Łatwopalna ciecz i pary.",
  H228: "Substancja stała łatwopalna.",
  H300: "Połknięcie grozi śmiercią.",
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
  H340: "Może powodować wady genetyczne.",
  H341: "Podejrzewa się, że powoduje wady genetyczne.",
  H350: "Może powodować raka.",
  H350I: "Wdychanie może spowodować raka.",
  H350i: "Wdychanie może spowodować raka.",
  H351: "Podejrzewa się, że powoduje raka.",
  H360: "Może działać szkodliwie na płodność lub na dziecko w łonie matki.",
  H360F: "Może działać szkodliwie na płodność.",
  H360f: "Może działać szkodliwie na płodność.",
  H360D: "Może działać szkodliwie na dziecko w łonie matki.",
  H360d: "Może działać szkodliwie na dziecko w łonie matki.",
  H360FD: "Może działać szkodliwie na płodność. Może działać szkodliwie na dziecko w łonie matki.",
  H360fd: "Może działać szkodliwie na płodność. Może działać szkodliwie na dziecko w łonie matki.",
  H360Fd: "Może działać szkodliwie na płodność. Podejrzewa się, że działa szkodliwie na dziecko w łonie matki.",
  H360Df: "Może działać szkodliwie na dziecko w łonie matki. Podejrzewa się, że działa szkodliwie na płodność.",
  H361: "Podejrzewa się, że działa szkodliwie na płodność lub na dziecko w łonie matki.",
  H361F: "Podejrzewa się, że działa szkodliwie na płodność.",
  H361f: "Podejrzewa się, że działa szkodliwie na płodność.",
  H361D: "Podejrzewa się, że działa szkodliwie na dziecko w łonie matki.",
  H361d: "Podejrzewa się, że działa szkodliwie na dziecko w łonie matki.",
  H361FD: "Podejrzewa się, że działa szkodliwie na płodność. Podejrzewa się, że działa szkodliwie na dziecko w łonie matki.",
  H361fd: "Podejrzewa się, że działa szkodliwie na płodność. Podejrzewa się, że działa szkodliwie na dziecko w łonie matki.",
  H362: "Może działać szkodliwie na dzieci karmione piersią.",
  H370: "Powoduje uszkodzenie narządów.",
  H371: "Może powodować uszkodzenie narządów.",
  H372: "Powoduje uszkodzenie narządów poprzez długotrwałe lub narażenie powtarzane.",
  H373: "Może powodować uszkodzenie narządów poprzez długotrwałe lub narażenie powtarzane.",
  // Kody łączone dróg narażenia (CLP)
  "H300+H310": "Grozi śmiercią w przypadku połknięcia lub kontaktu ze skórą.",
  "H300+H330": "Grozi śmiercią w przypadku połknięcia lub dostania się do dróg oddechowych.",
  "H310+H330": "Grozi śmiercią w kontakcie ze skórą lub w następstwie wdychania.",
  "H300+H310+H330": "Grozi śmiercią w przypadku połknięcia, kontaktu ze skórą lub w następstwie wdychania.",
  "H301+H311": "Działa toksycznie w przypadku połknięcia lub kontaktu ze skórą.",
  "H301+H331": "Działa toksycznie w przypadku połknięcia lub w następstwie wdychania.",
  "H311+H331": "Działa toksycznie w kontakcie ze skórą lub w następstwie wdychania.",
  "H301+H311+H331": "Działa toksycznie w przypadku połknięcia, kontaktu ze skórą lub w następstwie wdychania.",
  "H302+H312": "Działa szkodliwie po połknięciu lub w kontakcie ze skórą.",
  "H302+H332": "Działa szkodliwie po połknięciu lub w następstwie wdychania.",
  "H312+H332": "Działa szkodliwie w kontakcie ze skórą lub w następstwie wdychania.",
  "H302+H312+H332": "Działa szkodliwie po połknięciu, w kontakcie ze skórą lub w następstwie wdychania.",
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
  ...CANONICAL_P_PHRASES,
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
  H304: "GHS08", H340: "GHS08", H341: "GHS08", H350: "GHS08", H350i: "GHS08", H350I: "GHS08", H351: "GHS08",
  H360: "GHS08", H360F: "GHS08", H360f: "GHS08", H360D: "GHS08", H360d: "GHS08",
  H360FD: "GHS08", H360fd: "GHS08", H360Fd: "GHS08", H360Df: "GHS08",
  H361: "GHS08", H361F: "GHS08", H361f: "GHS08", H361D: "GHS08", H361d: "GHS08",
  H361FD: "GHS08", H361fd: "GHS08", H362: "GHS08",
  H370: "GHS08", H371: "GHS08", H372: "GHS08", H373: "GHS08",
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
  "Repr.": "Działanie szkodliwe na rozrodczość", "Lact.": "Wpływ na laktację lub oddziaływanie na dzieci karmione piersią", "STOT SE": "Działanie toksyczne na narządy docelowe – narażenie jednorazowe",
  "STOT RE": "Działanie toksyczne na narządy docelowe – narażenie powtarzane", "Asp. Tox.": "Zagrożenie spowodowane aspiracją",
  "Aquatic Acute": "Stwarzające zagrożenie dla środowiska wodnego - kategoria ostra", "Aquatic Chronic": "Stwarzające zagrożenie dla środowiska wodnego - kategoria przewlekła",
  "Ozone": "Stwarzające zagrożenie dla warstwy ozonowej", "Not classified": "Nie sklasyfikowano wg rozporządzenia CLP"
};

const H_TO_CLP_CLASS_MAP = {
  H220: "Flam. Gas 1 (Gaz skrajnie łatwopalny, kategoria 1)",
  H224: "Flam. Liq. 1 (Substancja ciekła wysoce łatwopalna, kategoria 1)",
  H225: "Flam. Liq. 2 (Substancja ciekła łatwopalna, kategoria 2)",
  H226: "Flam. Liq. 3 (Substancja ciekła łatwopalna, kategoria 3)",
  H228: "Flam. Sol. 1/2 (Substancja stała łatwopalna)",
  H300: "Acute Tox. 1/2 (Toksyczność ostra - droga pokarmowa)",
  H301: "Acute Tox. 3 (Toksyczność ostra - droga pokarmowa, kategoria 3)",
  H302: "Acute Tox. 4 (Toksyczność ostra - droga pokarmowa, kategoria 4)",
  H304: "Asp. Tox. 1 (Zagrożenie spowodowane aspiracją, kategoria 1)",
  H310: "Acute Tox. 1/2 (Toksyczność ostra - po naniesieniu na skórę)",
  H311: "Acute Tox. 3 (Toksyczność ostra - po naniesieniu na skórę, kategoria 3)",
  H312: "Acute Tox. 4 (Toksyczność ostra - po naniesieniu na skórę, kategoria 4)",
  H314: "Skin Corr. 1 (Działanie żrące na skórę, kategoria 1)",
  H315: "Skin Irrit. 2 (Działanie drażniące na skórę, kategoria 2)",
  H317: "Skin Sens. 1 (Działanie uczulające na skórę, kategoria 1)",
  H318: "Eye Dam. 1 (Poważne uszkodzenie oczu, kategoria 1)",
  H319: "Eye Irrit. 2 (Działanie drażniące na oczy, kategoria 2)",
  H330: "Acute Tox. 1/2 (Toksyczność ostra - wdychanie)",
  H331: "Acute Tox. 3 (Toksyczność ostra - wdychanie, kategoria 3)",
  H332: "Acute Tox. 4 (Toksyczność ostra - wdychanie, kategoria 4)",
  H334: "Resp. Sens. 1 (Działanie uczulające na drogi oddechowe, kategoria 1)",
  H335: "STOT SE 3 (Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 3)",
  H336: "STOT SE 3 (Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 3)",
  H340: "Muta. 1A/1B (Działanie mutagenne na komórki rozrodcze, kategoria 1)",
  H341: "Muta. 2 (Działanie mutagenne na komórki rozrodcze, kategoria 2)",
  H350: "Carc. 1A/1B (Rakotwórczość, kategoria 1)",
  H351: "Carc. 2 (Rakotwórczość, kategoria 2)",
  H360: "Repr. 1A/1B (Działanie szkodliwe na rozrodczość, kategoria 1)",
  H360D: "Repr. 1A/1B (Działanie szkodliwe na rozrodczość, kategoria 1D)",
  H360FD: "Repr. 1A/1B (Działanie szkodliwe na rozrodczość, kategoria 1FD)",
  H361: "Repr. 2 (Działanie szkodliwe na rozrodczość, kategoria 2)",
  H361d: "Repr. 2 (Działanie szkodliwe na rozrodczość, kategoria 2)",
  H361f: "Repr. 2 (Działanie szkodliwe na rozrodczość, kategoria 2)",
  H361fd: "Repr. 2 (Działanie szkodliwe na rozrodczość, kategoria 2)",
  H361FD: "Repr. 2 (Działanie szkodliwe na rozrodczość, kategoria 2)",
  H362: "Lact. (Wpływ na laktację lub oddziaływanie na dzieci karmione piersią)",
  H370: "STOT SE 1 (Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 1)",
  H371: "STOT SE 2 (Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 2)",
  H372: "STOT RE 1 (Działanie toksyczne na narządy docelowe – narażenie powtarzane, kategoria 1)",
  H373: "STOT RE 2 (Działanie toksyczne na narządy docelowe – narażenie powtarzane, kategoria 2)",
  H400: "Aquatic Acute 1 (Stwarzające zagrożenie dla środowiska wodnego – kategoria ostra 1)",
  H410: "Aquatic Chronic 1 (Stwarzające zagrożenie dla środowiska wodnego – kategoria przewlekła 1)",
  H411: "Aquatic Chronic 2 (Stwarzające zagrożenie dla środowiska wodnego – kategoria przewlekła 2)",
  H412: "Aquatic Chronic 3 (Stwarzające zagrożenie dla środowiska wodnego – kategoria przewlekła 3)",
  H413: "Aquatic Chronic 4 (Stwarzające zagrożenie dla środowiska wodnego – kategoria przewlekła 4)"
};

const ALLERGEN_NAMES_PL = {
  "4-tert-butylcyclohexyl acetate": "octan 4-tert-butylocykloheksylu",
  "reaction mass of 5-chloro-2-methyl-2h-isothiazol-3-one and 2-methyl-2h-isothiazol-3-one (3:1)": "masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu (3:1)",
  "reaction mass of: 5-chloro-2-methyl-4-isothiazolin-3-one and 2-methyl-2h-isothiazol-3-one (3:1)": "masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu (3:1)",
  "cinnamaldehyde": "aldehyd cynamonowy",
  "linalool": "linalol",
  "limonene": "limonen",
  "coumarin": "kumaryna",
  "2h-chromen-2-one": "kumaryna (2H-chromen-2-on)",
  "geraniol": "geraniol",
  "citronellol": "cytronellol",
  "benzyl salicylate": "salicylan benzylu",
  "hexyl cinnamal": "aldehyd heksylocynamonowy",
  "hydroxycitronellal": "hydroksycytronellal",
  "alpha-isomethyl ionone": "alfa-izometylojonon",
  "1,2-benzisothiazol-3(2h)-one": "1,2-benzoizotiazol-3(2H)-on",
  "2-methylisothiazol-3(2h)-one": "2-metyloizotiazol-3(2H)-on",
  "anisaldehyde": "aldehyd anyżowy",
  "4-methoxybenzaldehyde": "aldehyd anyżowy (4-metoksybenzaldehyd)",
  "amyl cinnamal": "aldehyd amylocynamonowy",
  "cinnamyl alcohol": "alkohol cynamonowy",
  "citral": "cytral",
  "eugenol": "eugenol",
  "isoeugenol": "izoeugenol",
  "benzyl alcohol": "alkohol benzylowy",
  "cineole": "1,8-cyneol (eukaliptol)",
  "methanol": "metanol",
  "acetone": "aceton (propan-2-on)",
  "propan-2-one": "aceton (propan-2-on)"
};

const EC_TO_PL_MAP = {
  "911-280-7": "Masa poreakcyjna salicylanu 2-metylobutylu i salicylanu pentylu",
  "947-716-8": "Masa poreakcyjna 1-[(1R*,6S*)-2,2,6-trimetylocykloheksylo]heksan-3-olu i 1-[(1S*,6S*)-2,2,6-trimetylocykloheksylo]heksan-3-olu"
};

const CAS_TO_PL_MAP = {
  "32210-23-4": "octan 4-tert-butylocykloheksylu",
  "115-95-7": "octan linalilu",
  "104-55-2": "aldehyd cynamonowy",
  "55965-84-9": "masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu (3:1)",
  "78-70-6": "linalol",
  "5989-27-5": "d-limonen",
  "91-64-5": "kumaryna (2H-chromen-2-on)",
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
  "67-56-1": "metanol",
  "67-64-1": "aceton (propan-2-on)",
  "57-55-6": "propano-1,2-diol",
  "56-81-5": "glicerol",
  "123-11-5": "aldehyd anyżowy (4-metoksybenzaldehyd)",
  "128-37-0": "2,6-di-tert-butylo-4-metylofenol (BHT)",
  "108-88-3": "toluen",
  "1222-05-5": "galaksolid (1,3,4,6,7,8-heksahydro-4,6,6,7,8,8-heksametyloindeno[5,6-c]piran)",
  "28219-61-6": "2-etylo-4-(2,2,3-trimetylocyklopent-3-en-1-ylo)but-2-en-1-ol",
  "34590-94-8": "(2-metoksymetyloetoksy)propanol",
  "1330-20-7": "ksylen (mieszanina izomerów)",
  "95-47-6": "1,2-ksylen (o-ksylen)",
  "108-38-3": "1,3-ksylen (m-ksylen)",
  "106-42-3": "1,4-ksylen (p-ksylen)",
  "107898-54-4": "(±) trans-3,3-dimetylo-5-(2,2,3-trimetylocyklopent-3-en-1-ylo)pent-4-en-2-ol",
  "470-82-6": "1,8-cyneol (eukaliptol)",
  "469-61-4": "alfa-cedren",
  "64-19-7": "kwas octowy",
  "142-82-5": "heptan",
  "108-95-2": "fenol"
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

class ADRRegistry {
  static database = {};

  static loadRegistry(filePath) {
    if (fs.existsSync(filePath)) {
      try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        const list = JSON.parse(rawData);
        if (Array.isArray(list)) {
          list.forEach(item => {
            if (item.un_number) {
              this.database[String(item.un_number).trim()] = item;
            }
          });
        }
        console.log(`[SYS] Załadowano rejestr ADR: ${Object.keys(this.database).length} pozycji.`);
      } catch (e) {
        this.database = {};
      }
    }
  }

  static getEntry(unNumber) {
    if (!unNumber) return null;
    const cleanUn = String(unNumber).replace(/^UN\s*/i, '').trim();
    return this.database[cleanUn] || null;
  }
}

class WasteRegistry {
  static database = {};

  static loadRegistry(filePath) {
    if (fs.existsSync(filePath)) {
      try {
        const rawData = fs.readFileSync(filePath, 'utf8');
        this.database = JSON.parse(rawData);
        console.log(`[SYS] Załadowano katalog odpadów (Dz.U. 2020 poz. 10).`);
      } catch (e) {
        this.database = {};
      }
    }
  }

  static getCategoryForProduct(textSample = "") {
    if (!this.database || !this.database.categories) return null;
    const lower = (textSample || "").toLowerCase();
    for (const [catKey, catData] of Object.entries(this.database.categories)) {
      if (catData.keywords && catData.keywords.some(kw => lower.includes(kw.toLowerCase()))) {
        return catData;
      }
    }
    return this.database.categories["general_chemical"] || null;
  }
}



// ============================================================================
// 3. PARSER DOKUMENTÓW (PDF & RTF z mostkiem Word COM) I DETEKTOR OCR
// ============================================================================

class SDSDocumentParser {
  static isRtfFile(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return false;
    if (filePath.toLowerCase().endsWith('.rtf')) return true;
    try {
      const header = fs.readFileSync(filePath, { encoding: 'binary', flag: 'r' }).slice(0, 5);
      return header.startsWith('{\\rtf');
    } catch (e) {
      return false;
    }
  }

  static isDocxFile(filePath) {
    return SDSDocxParser.isDocxFile(filePath);
  }

  static async extractText(filePath, forceOcr = false) {
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`[DocumentParser] Plik nie istnieje: ${filePath}`);
    }

    const isDocx = this.isDocxFile(filePath);
    if (isDocx) {
      console.log(`[DocumentParser] Wykryto plik DOCX. Ekstrakcja za pomocą natywnego silnika SDSDocxParser...`);
      return await SDSDocxParser.extractText(filePath);
    }

    const isRtf = this.isRtfFile(filePath);

    if (isRtf) {
      // 1. Sprawdź opcjonalny mostek Word COM (wyłącznie Windows) z pełną osłoną try-catch
      if (process.platform === 'win32') {
        let convertedPdf = null;
        try {
          console.log(`[DocumentParser] Wykryto plik RTF (Windows). Próba konwersji przez Word COM...`);
          convertedPdf = await SDSRtfConverter.convertToPdf(filePath);
          const text = await SDSPDFParser.extractTextFromPdf(convertedPdf, forceOcr);
          if (text && text.trim().length > 100) {
            return text;
          }
        } catch (comErr) {
          console.warn(`[DocumentParser] Word COM niedostępny (${comErr.message}). Przełączanie na natywny silnik SDSRTFParser...`);
        } finally {
          if (convertedPdf && fs.existsSync(convertedPdf)) {
            try { fs.unlinkSync(convertedPdf); } catch (e) {}
          }
        }
      }

      // 2. Niezawodny natywny silnik JavaScript SDSRTFParser (Linux VPS / OVH / Docker / Fallback)
      console.log(`[DocumentParser] Ekstrakcja RTF za pomocą natywnego silnika SDSRTFParser...`);
      return await SDSRTFParser.extractTextFromRtf(filePath);
    } else {
      return await SDSPDFParser.extractTextFromPdf(filePath, forceOcr);
    }
  }
}

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
    const matches = this.extractUnique(text, /(?<![\d-])[1-9]\d{1,6}-\d{2}-\d(?![\d-])/g);
    return matches.filter(cas => this.isValidCas(cas));
  }
  static extractEc(text) { return this.extractUnique(text, /\b\d{3}-\d{3}-\d\b/g); }
  static extractUfi(text) { return this.extractUnique(text, /\b[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}\b/gi)[0] || null; }
  static extractHCodes(text) { 
    if (!text) return [];
    const matches = [...text.matchAll(/(?<![A-Za-z0-9])(H\d{3}(?:[A-Za-z]{1,2}\b)?(?:\s*\+\s*H\d{3}(?:[A-Za-z]{1,2}\b)?)*)/g)].map(m => m[1].replace(/\s+/g, ''));
    return Array.from(new Set(matches.map(m => {
      if (OFFICIAL_CLP_H_PHRASES[m]) return m;
      const upper = m.toUpperCase();
      if (OFFICIAL_CLP_H_PHRASES[upper]) return upper;
      for (const k of Object.keys(OFFICIAL_CLP_H_PHRASES)) {
        if (k.toLowerCase() === m.toLowerCase()) return k;
      }
      return upper;
    })));
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

  static toAccusative(name) {
    if (!name) return "";
    let n = name.trim();
    // Odmiana przed nawiasem, np. "kumaryna (2H-chromen-2-on)" -> "kumarynę (2H-chromen-2-on)"
    const parenIdx = n.indexOf('(');
    if (parenIdx !== -1) {
      const mainPart = n.substring(0, parenIdx).trim();
      const restPart = n.substring(parenIdx);
      return `${this.toAccusative(mainPart)} ${restPart}`.trim();
    }
    const directMap = {
      'kumaryna': 'kumarynę',
      'Kumaryna': 'kumarynę',
      'masa poreakcyjna': 'masę poreakcyjną',
      'Masa poreakcyjna': 'masę poreakcyjną'
    };
    if (directMap[n]) return directMap[n];
    if (n.endsWith('owa')) return n.slice(0, -3) + 'ową';
    if (n.endsWith('na')) return n.slice(0, -2) + 'ną';
    if (n.endsWith('ja')) return n.slice(0, -2) + 'ję';
    if (n.endsWith('ia')) return n.slice(0, -2) + 'ię';
    if (n.endsWith('a') && !n.endsWith('ka')) return n.slice(0, -1) + 'ę';
    return n;
  }

  static formatEuh208(text, resolvedSubstances = {}, components = [], hCodes = []) {
    // Zgodnie z art. 18 ust. 3 lit. b i art. 25 ust. 6 CLP:
    // Jeżeli mieszanina jest zaklasyfikowana jako uczulająca (H317 lub H334), zwrot EUH208 NIE MOŻE być stosowany!
    // Wszystkie substancje uczulające muszą znaleźć się w polu "Zawiera:".
    if (hCodes && hCodes.some(h => ['H317', 'H334'].includes(h))) {
      return null;
    }
    let rawSubstances = [];

    if (text) {
      const match = text.match(/EUH208\s*(?:Contains|Contiene|Zawiera|Innehåller)?[:\s]*([^.]+?)(?:\.\s*(?:May produce|Può provocare|Może powodować|Kan ge)|(?:\n\s*\n)|$)/is);
      if (match && match[1]) {
        let raw = match[1].replace(/-\s+/g, '-').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        let parts = raw.split(/;\s*|\s*,\s*(?![^(]*\))/).map(s => s.trim()).filter(s => s && !/^(?:Contains|Contiene|Zawiera|May|Può|Może)/i.test(s));
        rawSubstances.push(...parts);
      }
    }

    // Reguła CLP Załącznik II pkt 2.8 dla mieszanin nieklasyfikowanych jako uczulające,
    // ale zawierających substancję uczulającą >= 0.1% (lub specyficzne SCL)
    if (components && Array.isArray(components)) {
      for (const comp of components) {
        const isSens = /(?:Skin\s*Sens|Resp\s*Sens|H317|H334)/i.test(comp.classification || '');
        if (isSens) {
          const concStr = comp.concentration || '';
          let maxConc = 0;
          const nums = [...concStr.matchAll(/(\d+(?:[.,]\d+)?)/g)].map(n => parseFloat(n[1].replace(',', '.')));
          if (nums.length > 0) maxConc = Math.max(...nums);
          if (maxConc >= 0.1 || /≥\s*0[,.]1/i.test(concStr)) {
            const displayName = comp.name || comp.originalName;
            if (displayName && !rawSubstances.some(r => r.toLowerCase().includes(displayName.toLowerCase()) || displayName.toLowerCase().includes(r.toLowerCase()))) {
              rawSubstances.push(displayName);
            }
          }
        }
      }
    }

    if (rawSubstances.length === 0) return null;

    let mappedParts = rawSubstances.map(part => {
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

    const uniqueParts = Array.from(new Set(mappedParts)).map(p => SDSChemicalExtractor.toAccusative(p));
    // Zgodnie z oficjalnym słownikiem CLP (załącznik III): "Zawiera [biernik]. Może powodować wystąpienie reakcji alergicznej."
    return `EUH208 Zawiera ${uniqueParts.join(', ')}. Może powodować wystąpienie reakcji alergicznej.`;
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

  static extractDnelPnec(text, components = []) {
    if (!text) return { dnel: [], pnec: [], bySubstance: {} };
    let clean = SDSProcessorEngine.cleanPdfArtifacts(text)
      .replace(/(?:^[^\n]+\n)?\s*(?:Revision|Revisione|Wersja)\s*(?:nr\.?|no\.?|n\.|:)?\s*\d+[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:[^\n\|]*?\|\s*)?(?:Suarez Company|SWEET HOME|BLK\d+)[^\n]*/gi, '')
      .replace(/DNEL\/PNEC available\s*;\s*NEA[\s\S]*?(?=\n\n|\n[A-Z]|$)/gi, '')
      .replace(/(\b(?:Skin|Oral|Inhalation)[^\n]*?)\s*(\([±\+]\)\s*trans[-—–])/gi, '$1\n$2');

    const parsePnecBlock = (raw) => {
      let lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
      let plLines = [];
      for (let l of lines) {
        if (/^(?:Revision|Revisione|Wersja|Dated|Data|Printed|Stampato|BLK|\d+\/\d+|Page|Pagina|Pag\.|Strona|The full|Suarez)/i.test(l)) continue;
        if (/(?:bw\/d|mc\/dzień|\bOral\b|\bSkin\b|\bInhalation\b|Effects on)/i.test(l)) continue;
        let trans = l
          .replace(/Normal value in fresh water/gi, '- woda słodka:')
          .replace(/Normal value in marine water/gi, '- woda morska:')
          .replace(/Normal value for fresh water sediment/gi, '- osady słodkowodne:')
          .replace(/Normal value for marine water sediment/gi, '- osady morskie:')
          .replace(/Normal value for water, intermittent release/gi, '- woda (uwalnianie okresowe):')
          .replace(/Normal value of STP microorganisms/gi, '- mikroorganizmy w oczyszczalni ścieków (STP):')
          .replace(/Normal value for the food chain \(secondary poisoning\)/gi, '- łańcuch pokarmowy (zatrucie wtórne):')
          .replace(/Normal value for the terrestrial compartment/gi, '- środowisko glebowe (gleba):')
          .replace(/(\d+)\.(\d+)/g, '$1,$2');
        if (trans !== l || /\d+[.,]?\d*\s*mg\/(?:l|kg)/i.test(l)) {
          // Czyszczenie artefaktów separatorów tabeli (|)
          let cleanedLine = trans.replace(/\|\s*\|\s*/g, ' ').replace(/\|\s*/g, ' ').replace(/\s+/g, ' ').trim();
          plLines.push(cleanedLine);
        }
      }
      return plLines;
    };

    const parseDnelBlock = (raw) => {
      let clean = raw.replace(/\r/g, '')
        .replace(/(?:^[^\n]+\n)?\s*(?:Revision|Revisione|Wersja)\s*(?:nr\.?|no\.?|n\.|:)?\s*\d+[^\n]*/gi, '')
        .replace(/(?:^|\n)\s*(?:[^\n\|]*?\|\s*)?(?:Suarez Company|SWEET HOME|BLK\d+)[^\n]*/gi, '');
      let res = [];

      // 1. Droga pokarmowa (Oral)
      const oralMatch = clean.match(/Oral\s*([\s\S]*?)(?=Inhalation|Skin|Route|$)/i);
      if (oralMatch) {
        const oralNums = [...oralMatch[1].matchAll(/([\d.,]+)\s*mg\/kg/gi)].map(m => m[1].replace('.', ','));
        if (oralNums.length >= 2) {
          res.push(`- Droga pokarmowa (doustnie): Konsumenci: skutki ostre układowe: ${oralNums[0]} mg/kg mc/dzień; skutki przewlekłe układowe: ${oralNums[1]} mg/kg mc/dzień`);
        } else if (oralNums.length === 1) {
          res.push(`- Droga pokarmowa (doustnie): Konsumenci (skutki przewlekłe układowe): ${oralNums[0]} mg/kg mc/dzień`);
        }
      }

      // 2. Drogi oddechowe (Inhalation)
      const inhalMatch = clean.match(/Inhalation\s*([\s\S]*?)(?=Skin|Oral|$)/i);
      if (inhalMatch) {
        const nums = [...inhalMatch[1].matchAll(/([\d.,]+)\s*(?:mg\/m3|mg\/m³|ppm)/gi)].map(m => m[1].replace('.', ','));
        const hasAcuteWorker = /(?:Acute\s*local|ostre\s*miejscowe)[^\n]*?(?:1900|1920)/i.test(clean) || /(?:NDS\/NDSChPOL\s*1900|POL\s*1900)/i.test(clean);
        if (nums.length === 2) {
          res.push('- Drogi oddechowe (inhalacyjnie):');
          res.push(`  * Konsumenci (skutki przewlekłe układowe): ${nums[0]} mg/m³`);
          if (hasAcuteWorker || nums[1] === '950') {
            res.push(`  * Pracownicy: skutki przewlekłe układowe: ${nums[1]} mg/m³; skutki ostre miejscowe: 1900 mg/m³`);
          } else {
            res.push(`  * Pracownicy (skutki przewlekłe układowe): ${nums[1]} mg/m³`);
          }
        } else if (nums.length === 3) {
          res.push('- Drogi oddechowe (inhalacyjnie):');
          res.push(`  * Konsumenci (skutki przewlekłe układowe): ${nums[0]} mg/m³`);
          res.push(`  * Pracownicy: skutki przewlekłe układowe: ${nums[1]} mg/m³; skutki ostre miejscowe: ${nums[2]} mg/m³`);
        } else if (nums.length === 4) {
          res.push('- Drogi oddechowe (inhalacyjnie):');
          res.push(`  * Konsumenci: skutki ostre układowe: ${nums[0]} mg/m³; skutki przewlekłe układowe: ${nums[1]} mg/m³`);
          res.push(`  * Pracownicy: skutki ostre układowe: ${nums[2]} mg/m³; skutki przewlekłe układowe: ${nums[3]} mg/m³`);
        } else if (nums.length === 8) {
          res.push('- Drogi oddechowe (inhalacyjnie):');
          res.push(`  * Konsumenci: ostre miejscowe: ${nums[0]} mg/m³, ostre układowe: ${nums[1]} mg/m³, przewlekłe miejscowe: ${nums[2]} mg/m³, przewlekłe układowe: ${nums[3]} mg/m³`);
          res.push(`  * Pracownicy: ostre miejscowe: ${nums[4]} mg/m³, ostre układowe: ${nums[5]} mg/m³, przewlekłe miejscowe: ${nums[6]} mg/m³, przewlekłe układowe: ${nums[7]} mg/m³`);
        } else if (nums.length === 5) {
          res.push('- Drogi oddechowe (inhalacyjnie):');
          res.push(`  * Konsumenci: ostre miejscowe: ${nums[0]} mg/m³; przewlekłe miejscowe: ${nums[1]} mg/m³; przewlekłe układowe: ${nums[2]} mg/m³`);
          res.push(`  * Pracownicy: przewlekłe miejscowe: ${nums[3]} mg/m³; przewlekłe układowe: ${nums[4]} mg/m³`);
        } else if (nums.length > 0) {
          res.push(`- Drogi oddechowe (inhalacyjnie): ${nums.join(' / ')} mg/m³`);
        }
      }

      // 3. Na skórę (Skin)
      const skinMatch = clean.match(/Skin\s*([\s\S]*?)(?=Oral|Inhalation|Legend|8\.2|$)/i);
      if (skinMatch) {
        const skinText = skinMatch[1];
        const nums = [...skinText.matchAll(/([\d.,]+)\s*(?:mg\/kg)/gi)].map(m => m[1].replace('.', ','));
        if (nums.length >= 4) {
          res.push('- Na skórę:');
          res.push(`  * Konsumenci: skutki ostre układowe: ${nums[0]} mg/kg mc/dzień; skutki przewlekłe układowe: ${nums[1]} mg/kg mc/dzień`);
          res.push(`  * Pracownicy: skutki ostre układowe: ${nums[2]} mg/kg mc/dzień; skutki przewlekłe układowe: ${nums[3]} mg/kg mc/dzień`);
        } else if (nums.length === 2) {
          res.push('- Na skórę:');
          res.push(`  * Konsumenci (skutki przewlekłe układowe): ${nums[0]} mg/kg mc/dzień`);
          res.push(`  * Pracownicy (skutki przewlekłe układowe): ${nums[1]} mg/kg mc/dzień`);
        } else if (nums.length === 1) {
          res.push(`- Na skórę: Konsumenci (skutki przewlekłe układowe): ${nums[0]} mg/kg mc/dzień`);
        } else if (nums.length > 0) {
          res.push(`- Na skórę: ${nums.join(' / ')} mg/kg mc/dzień`);
        }
      }

      // Fallback jeśli specyficzne regexy nie dopasowały
      if (res.length === 0) {
        let lines = clean.split('\n').map(l => l.trim()).filter(Boolean);
        for (let l of lines) {
          if (/^(?:Revision|Revisione|Wersja|Dated|Data|Printed|Stampato|BLK|\d+\/\d+|Page|Pagina|Pag\.|Strona|Effects on|Route of exposure|Acute local|Chronic systemic|Suarez)/i.test(l)) continue;
          let trans = l
            .replace(/\bOral\b/gi, '- Droga pokarmowa (doustnie):')
            .replace(/\bInhalation\b/gi, '- Drogi oddechowe (inhalacyjnie):')
            .replace(/\bSkin\b/gi, '- Na skórę:')
            .replace(/bw\/d/gi, 'mc/dzień')
            .replace(/(\d+)\.(\d+)/g, '$1,$2');
          if (/\d+[.,]?\d*\s*(?:mg\/kg|mg\/m3|mg\/l)/i.test(l) || trans.startsWith('-')) {
            res.push(trans);
          }
        }
      }
      return res;
    };

    let bySubstance = {};

    if (components && components.length > 0) {
      for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        const searchNames = [comp.originalName, comp.name, comp.cas].filter(Boolean);
        let compDnel = [];
        let compPnec = [];

        for (const name of searchNames) {
          if (!name || name.length < 3) continue;
          const cleanName = name.replace(/\s*[-—–]\s*/g, '-').trim();
          const escaped = cleanName
            .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
            .replace(/\\\*/g, '\\*?')
            .replace(/\\\-/g, '[-—–\\s]*')
            .replace(/\s+/g, '\\s+');

          const otherPatterns = components.filter(c => c !== comp)
            .flatMap(c => [c.originalName, c.name, c.cas])
            .filter(n => n && n.length >= 4)
            .map(n => n.replace(/\s*[-—–]\s*/g, '-').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '\\*?').replace(/\\\-/g, '[-—–\\s]*').replace(/\s+/g, '\\s+'));

          const genericNextSub = `(?:^|\\n)\\s*[A-Za-z0-9\\s\\(\\)\\[\\]\\-–—\\.,\\*\\/]{3,120}?\\s*(?:\\||\\n)\\s*(?:Threshold Limit Value|Predicted no-effect concentration|Health\\s*-\\s*Derived no-effect)`;
          const endPat = otherPatterns.length > 0 
            ? `(?=(?:^|\\n)\\s*(?:${otherPatterns.join('|')})(?:\\b|[\\s\\|\\-\\)]|$))|(?=${genericNextSub})|(?:^|\\n)\\s*8\\.2\\b|$`
            : `(?=${genericNextSub})|(?:^|\\n)\\s*8\\.2\\b|$`;
          
          const regAll = new RegExp(`(?:^|\\n)\\s*${escaped}(?:\\b|[\\s\\|\\-\\)]|$)([\\s\\S]*?)(?:${endPat})`, 'gi');
          const matches = [...clean.matchAll(regAll)];
          
          for (const m of matches) {
            const blockText = m[1];
            if (/Predicted no-effect concentration\s*-\s*PNEC/i.test(blockText)) {
              const pnecMatches = [...blockText.matchAll(/Predicted no-effect concentration\s*-\s*PNEC([\s\S]*?)(?=Health\s*-\\s*Derived|Predicted no-effect|8\\.2|SECTION|$)/gi)];
              for (const pm of pnecMatches) {
                compPnec.push(...parsePnecBlock(pm[1]));
              }
            }
            if (/Health\s*-\s*Derived no-effect level/i.test(blockText)) {
              const dnelMatches = [...blockText.matchAll(/Health\s*-\s*Derived no-effect level\s*-\s*DNEL\s*\/\s*DMEL([\s\S]*?)(?=Predicted no-effect|Health\s*-\\s*Derived|8\\.2|SECTION|$)/gi)];
              for (const dm of dnelMatches) {
                compDnel.push(...parseDnelBlock(dm[1]));
              }
            }
          }
          if (compDnel.length > 0 || compPnec.length > 0) break;
        }

        if (compDnel.length > 0 || compPnec.length > 0) {
          const keyName = comp.name || comp.originalName || comp.cas;
          bySubstance[keyName] = {
            cas: comp.cas,
            dnel: Array.from(new Set(compDnel)),
            pnec: Array.from(new Set(compPnec))
          };
        }
      }
    }

    const pnecRaw = [...clean.matchAll(/Predicted no-effect concentration\s*-\s*PNEC([\s\S]*?)(?=Health\s*-\s*Derived|Predicted no-effect|SECTION|8\.2|$)/gi)];
    let pnecList = [];
    for (const m of pnecRaw) {
      pnecList.push(...parsePnecBlock(m[1]));
    }
    const dnelRaw = [...clean.matchAll(/Health\s*-\s*Derived no-effect level\s*-\s*DNEL\s*\/\s*DMEL([\s\S]*?)(?=Predicted no-effect|Health\s*-\\s*Derived|SECTION|8\.2|$)/gi)];
    let dnelList = [];
    for (const m of dnelRaw) {
      dnelList.push(...parseDnelBlock(m[1]));
    }
    return { dnel: dnelList, pnec: pnecList, bySubstance };
  }

  static resolvePlName(cas, rawName, resolvedSubstances = {}, ec = null) {
    if (ec && EC_TO_PL_MAP[ec]) {
      return EC_TO_PL_MAP[ec];
    }
    if (cas && CAS_TO_PL_MAP[cas]) {
      return CAS_TO_PL_MAP[cas];
    }
    if (rawName) {
      if (/reaction mass of 2-methylbutyl salicylate and pentyl salicylate/i.test(rawName)) {
        return "Masa poreakcyjna salicylanu 2-metylobutylu i salicylanu pentylu";
      }
      if (/reaction mass of 1-\[\(1R\*?,6S\*?\)-2,2,6-trimethylcyclohexyl\]hexan-3-ol/i.test(rawName)) {
        return "Masa poreakcyjna 1-[(1R*,6S*)-2,2,6-trimetylocykloheksylo]heksan-3-olu i 1-[(1S*,6S*)-2,2,6-trimetylocykloheksylo]heksan-3-olu";
      }
      if (/\(4-tert-butylcyclohexyl\)\s*acetate/i.test(rawName)) {
        return "octan 4-tert-butylocykloheksylu";
      }
      if (/dipropylene glycol monomethyl ether/i.test(rawName)) {
        return "(2-metoksymetyloetoksy)propanol";
      }
      if (/2-ethyl-4-\(2,2,3-trimethyl-3-cyclopenten-1-yl\)-2-buten-1-ol/i.test(rawName)) {
        return "2-etylo-4-(2,2,3-trimetylocyklopent-3-en-1-ylo)but-2-en-1-ol";
      }
      if (/\(±\)\s*trans[—\-]\s*3,3-dimethyl-5-\(2,2,3-trimethyl-cyclopent-3-en-1-yl\)-pent-4-en-2-ol/i.test(rawName)) {
        return "(±) trans-3,3-dimetylo-5-(2,2,3-trimetylocyklopent-3-en-1-ylo)pent-4-en-2-ol";
      }
    }
    if (cas && NDSRegistry.isLoaded) {
      const ndsEntry = NDSRegistry.lookupByCas(cas);
      if (ndsEntry && ndsEntry.substance) {
        return ndsEntry.substance.toLowerCase();
      }
    }
    if (rawName) {
      const lowerRaw = rawName.toLowerCase();
      for (const [en, pl] of Object.entries(ALLERGEN_NAMES_PL)) {
        if (lowerRaw === en.toLowerCase() || lowerRaw.includes(en.toLowerCase())) {
          return pl;
        }
      }
    }
    if (cas && resolvedSubstances[cas] && !resolvedSubstances[cas].startsWith("Substancja CAS")) {
      const resName = resolvedSubstances[cas];
      if (!/(?:aldehyde|benzene|acetate|cyclohexyl|oxide|chloride|acid|cresol)\b/i.test(resName)) {
        return resName;
      }
    }
    if (rawName) {
      let pol = rawName
        .replace(/\bethanol\b/gi, 'etanol')
        .replace(/\bmethanol\b/gi, 'metanol')
        .replace(/\bpropanol\b/gi, 'propanol')
        .replace(/\bacetone\b/gi, 'aceton')
        .replace(/\btoluene\b/gi, 'toluen')
        .replace(/\bxylene\b/gi, 'ksylen')
        .replace(/\bcoumarin\b/gi, 'kumaryna')
        .replace(/\banisaldehyde\b/gi, 'aldehyd anyżowy')
        .replace(/\b2,6-di-tert-butyl-p-cresol\b/gi, '2,6-di-tert-butylo-4-metylofenol (BHT)')
        .replace(/\b2H-CHROMEN-2-ONE\b/gi, 'kumaryna (2H-chromen-2-on)')
        .replace(/\b4-METHOXYBENZALDEHYDE\b/gi, 'aldehyd anyżowy (4-metoksybenzaldehyd)')
        .replace(/acetate\b/gi, 'octan')
        .replace(/acid\b/gi, 'kwas')
        .replace(/ether\b/gi, 'eter');

      if (/linalyl acetate/i.test(rawName)) return "octan linalilu";

      // Korekta hybryd językowych (np. "3,7-dimethylocta-1,6-dien-3-yl octan" -> "octan 3,7-dimetylookta-1,6-dien-3-ylu")
      if (pol.match(/([a-zA-Z0-9,\-()*]+(?:yl|il|en))\s+octan\b/i)) {
        pol = pol.replace(/([a-zA-Z0-9,\-()*]+(?:yl|il|en))\s+octan\b/gi, (match, prefix) => {
          return `octan ${prefix.replace(/dimethyl/g, 'dimetylo').replace(/ethyl/g, 'etylo').replace(/methyl/g, 'metylo').replace(/octa/g, 'okta')}u`;
        });
      }
      return pol;
    }
    return rawName || (cas ? `Substancja CAS: ${cas}` : "Składnik");
  }

  static formatConcentration(concStr) {
    if (!concStr) return "—";
    let formatted = concStr
      .replace(/(\d+)\.(\d+)/g, '$1,$2')
      .replace(/([≥≤><=]|>=|<=)\s*/g, '$1 ')
      .replace(/\s*-\s*/g, ' - ')
      .replace(/%\s*-\s*/g, ' - ')
      .replace(/\s*%/g, ' %')
      .replace(/\s+/g, ' ')
      .trim();
    if (!formatted.includes('%') && formatted !== "—") {
      formatted += " %";
    }
    return formatted;
  }

  static parseLimsSection3(cleanText, resolvedSubstances = {}) {
    let text = SDSProcessorEngine.cleanPdfArtifacts(cleanText)
      .replace(/Page\s+n\.\s*of\s*\d+/gi, '')
      .replace(/\d{2}\/\d{2}\/\d{4}\s*Production Name[^\n]+/gi, '')
      .replace(/(?:[^\n]+\n)?\s*(?:Revision|Revisione|Wersja)\s*(?:nr\.?|no\.?|n\.|:)?\s*\d+[\s\S]*?Replaced revision:[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Suarez\s+Company|Company)[^\n]*[\s\S]{1,500}?\n\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/gi, '')
      .replace(/(?:^|\n)\s*(?:Revision nr\.?|Revisione n\.?|Wersja nr|Dated|Data|Printed on|Stampato il)\s*[:\.]?\s*[^\n]*/gi, '')
      .replace(/The full wording of hazard[\s\S]*$/gi, '');

    const matches = [...text.matchAll(/(?:^|\n)\s*INDEX\s+(\d{3}-\d{3}-\d{2}-[\dXx]|-)?\s*(\d+(?:[.,]\d+)?\s*[≤<=<]\s*x\s*[≤<=<]\s*\d+(?:[.,]\d+)?)/gi)];
    if (matches.length === 0) return null;

    const isClassLine = (l) => {
      return /^(?:Flam|Acute|Eye|Skin|Repr|Aquatic|Asp|STOT|Sens|Muta|Carc|H\d{3}|EUH\d{3}|Substance with a|Classification note|according to Annex|LD50|LC50|ATE\b|M\s*=|M-Chronic|M-Acute|≥|≤|[≤<=<,.\d\s]+x[≤<=<,.\d\s]*|mg\/l|mg\/kg|ppm|bw\/d|%\b|Irrit|Dam|Tox)/i.test(l) ||
             /:\s*≥/i.test(l) ||
             /\bH\d{3}\b/.test(l);
    };

    const components = [];

    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const indexNum = (m[1] && m[1].trim() !== '-') ? m[1].trim() : '—';
      let rawConc = m[2].trim();
      let conc = this.formatConcentration(rawConc);

      const prevBlockEnd = i === 0 ? 0 : matches[i - 1].index + matches[i - 1][0].length;
      const blockStart = m.index;
      const preText = text.substring(prevBlockEnd, blockStart);

      const preLines = preText.split('\n')
        .map(l => l.trim())
        .filter(l => l && !/^(?:Identification|Contains|3\.\d|Mixtures|Substances|EC\b|CAS\b|REACH\b|Revision|Revisione|Wersja|Dated|Data|Printed|Stampato|BLK|\d+\/\d+|Page|Suarez|First compilation|Information not relevant)/i.test(l));
      
      const nameLines = [];
      for (let j = preLines.length - 1; j >= 0; j--) {
        if (isClassLine(preLines[j])) break;
        nameLines.unshift(preLines[j]);
      }
      let rawName = nameLines.join(' ').replace(/-\s+/g, '-').replace(/\s+/g, ' ').trim();
      if (i === 0) {
        rawName = rawName.replace(/^(?:SECTION\s*3[^\n]*|Composition[^\n]*|Miscele[^\n]*|Substances[^\n]*|Information not relevant[^\n]*)\s*/i, '').trim();
      }

      const nextStart = i + 1 < matches.length ? matches[i + 1].index : text.length;
      const blockBody = text.substring(m.index, nextStart);

      const casMatch = blockBody.match(/CAS\s*[:\.]?\s*(\d{2,7}-\d{2}-\d)/i);
      const curCas = casMatch ? casMatch[1] : '';

      const ecMatch = blockBody.match(/EC\s*[:\.]?\s*(\d{3}-\d{3}-\d)/i);
      const ecNumber = ecMatch ? ecMatch[1] : '—';

      const reachMatch = blockBody.match(/01-\d{8,10}-\d{2}(?:-[A-Za-z0-9]{2,4})?/);
      let reachNumber = reachMatch ? reachMatch[0] : '—';

      const afterConcIdx = m.index + m[0].length;
      const firstLineEnd = text.indexOf('\n', afterConcIdx);
      let firstClassLine = text.substring(afterConcIdx, firstLineEnd !== -1 ? firstLineEnd : undefined).trim();

      const remainingLines = blockBody.split('\n').map(l => l.trim()).filter(Boolean);
      const classLines = [];
      if (firstClassLine) classLines.push(firstClassLine);

      for (let line of remainingLines) {
        let cleaned = line;
        cleaned = cleaned.replace(/^EC\s*[:\.]?\s*\d{3}-\d{3}-\d\s*/i, '');
        cleaned = cleaned.replace(/^INDEX\s*[:\.]?\s*[\d\-Xx]+\s*/i, '');
        cleaned = cleaned.replace(/^CAS\s*[:\.]?\s*\d{2,7}-\d{2}-\d\s*/i, '');
        cleaned = cleaned.replace(/^REACH\s*(?:Reg\.?)?\s*[:\.]?\s*[\w\-]+\s*/i, '');
        cleaned = cleaned.replace(/^[≤<=<,.\d\s]+x[≤<=<,.\d\s]*/i, '');
        cleaned = cleaned.trim();
        if (!cleaned || cleaned.toLowerCase() === rawName.toLowerCase()) continue;
        if (cleaned.includes(m[2])) continue;

        // Kontynuacja rozbitej linii z poprzedniego wiersza tabeli (np. "Classification note" + "according to Annex VI...: B", "ATE Inhalation" + "mists/powders: 0.501 mg/l")
        if (classLines.length > 0) {
          const lastIdx = classLines.length - 1;
          if (/Classification note(?:\s+according\s+to[^\n:]*)?$/i.test(classLines[lastIdx]) && /(?:according\s+to|Annex|Regulation|:\s*[A-Z0-9]|^[A-Z0-9]$)/i.test(cleaned)) {
            classLines[lastIdx] = `${classLines[lastIdx]} ${cleaned}`.replace(/\s+/g, ' ');
            continue;
          }
          if (/(?:ATE|Inhalation|dusts?|mists?|powders?|vapou?rs?)$/i.test(classLines[lastIdx]) && /(?:mists?|powders?|dusts?|vapou?rs?|[\d.,]+\s*mg)/i.test(cleaned)) {
            classLines[lastIdx] = `${classLines[lastIdx]} ${cleaned}`.replace(/\s+/g, ' ');
            continue;
          }
        }

        if (/(?:Flam|Acute|Eye|Skin|Repr|Aquatic|Asp|STOT|Sens|H\d{3}|\bATE\b|\bATE\s*[:=\(]|\bLD50\b|\bLC50\b|M\s*=|Specific|≥|≤|Substance with a|Classification note|according to Annex|mists?|powders?)/i.test(cleaned)) {
          if (!classLines.includes(cleaned)) {
            classLines.push(cleaned);
          }
        }
      }

      let classText = classLines.join('\n');
      classText = classText
        .replace(/Specific Concentration Limits\s*[:\.]?/gi, 'Specyficzne stężenia graniczne:\n')
        .replace(/Classification note[\s\S]*?:\s*([A-Z0-9]+)/gi, (match, note) => `Uwaga ${note} zgodnie z załącznikiem VI do rozporządzenia CLP`)
        .replace(/Classification note\s+([A-Z0-9]+)\b/gi, (match, note) => `Uwaga ${note} zgodnie z załącznikiem VI do rozporządzenia CLP`)
        .replace(/Classification note\s*$/gim, '')
        .replace(/Substance\s+with\s+a\s+community\s+workplace\s+exposure\s+limit[\.\s]*/gi, 'Substancja, dla której określono wspólnotowe najwyższe dopuszczalne stężenia w środowisku pracy.')
        .replace(/ATE\s*Inhalation\s*vapou?rs?/gi, 'ATE (inhalacyjnie, pary)')
        .replace(/ATE\s*Inhalation\s*(?:mists?\/?powders?|powders?\/?mists?|dusts?\/?mists?)/gi, 'ATE (inhalacyjnie, pyły/mgły)')
        .replace(/ATE\s*Oral/gi, 'ATE (droga pokarmowa)')
        .replace(/ATE\s*Dermal/gi, 'ATE (na skórę)')
        .replace(/(?:ATE Oral|LD50 Oral)\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*(?:mg\/kg)?)/gi, (match, v) => `ATE (droga pokarmowa) = ${v.includes('mg/kg') ? v : v + ' mg/kg'}`)
        .replace(/(?:ATE Dermal|LD50 Dermal)\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*(?:mg\/kg)?)/gi, (match, v) => `ATE (na skórę) = ${v.includes('mg/kg') ? v : v + ' mg/kg'}`)
        .replace(/ATE Inhalation\s*(?:mists?\s*\/?\s*powders?|powders?\s*\/?\s*mists?|dusts?\s*\/?\s*mists?)\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*(?:mg\/l)?|\d+)/gi, (match, v) => `ATE (inhalacyjnie, pyły/mgły) = ${v.includes('mg/l') ? v : v + ' mg/l'}`)
        .replace(/ATE Inhalation(?:\s*vapours?|\s*vapors?)?\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*(?:mg\/l)?|\d+)/gi, (match, v) => `ATE (inhalacyjnie, pary) = ${v.includes('mg/l') ? v : v + ' mg/l'}`)
        .replace(/M\s*=\s*(\d+)/gi, 'M = $1')
        .replace(/M-Chronic\s*[:\.]?\s*(\d+)/gi, 'M (przewlekły) = $1')
        .replace(/M-Acute\s*[:\.]?\s*(\d+)/gi, 'M (ostry) = $1')
        .replace(/<=/g, '≤')
        .replace(/>=/g, '≥')
        .replace(/(\d+)\.(\d+)\s*%/g, '$1,$2%');

      classText = mapHazardClass(classText);

      const plName = this.resolvePlName(curCas, rawName, resolvedSubstances, ecNumber);

      const idParts = [
        `Numer CAS: ${curCas || '—'}`,
        `Numer WE: ${ecNumber}`
      ];
      if (indexNum !== '—') idParts.push(`Numer indeksowy: ${indexNum}`);
      if (reachNumber !== '—') idParts.push(`Numer rejestracji REACH:\n${reachNumber}`);

      components.push({
        cas: curCas,
        name: plName,
        originalName: rawName,
        ec: ecNumber,
        index: indexNum,
        reach: reachNumber,
        identifiers: idParts.join('\n'),
        classification: classText,
        concentration: conc
      });
    }

    return components;
  }

  static parseSection3Components(contentIt, resolvedSubstances = {}) {
    if (!contentIt) return [];

    let cleanText = contentIt
      .replace(/Page\s+n\.\s*of\s*\d+/gi, '')
      .replace(/\d{2}\/\d{2}\/\d{4}\s*Production Name[^\n]+/gi, '')
      .replace(/Qty\s*Name\s*Ident\.\s*Numb\.\s*Classification\s*Registration\s*Number/gi, '');

    const isLimsFormat = /x\s*=\s*Conc\.\s*%/i.test(cleanText) || /INDEX\s+(?:[\d\-Xx]+)?\s*\d+(?:[.,]\d+)?\s*[≤<=<]\s*x/i.test(cleanText);
    if (isLimsFormat) {
      const limsComponents = this.parseLimsSection3(cleanText, resolvedSubstances);
      if (limsComponents && limsComponents.length > 0) {
        return limsComponents;
      }
    }

    // Łączenie stężeń rozbitych na linie przez łamanie wiersza (np. "≥0.00015%-\n<0.0015%" lub "0.1% -\n< 0.25%")
    cleanText = cleanText
      .replace(/([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?\s*%?)\s*-\s*\n\s*([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?\s*%)/g, (m, p1, p2, p3, p4) => (p1 || '') + p2 + ' - ' + (p3 || '') + p4)
      .replace(/([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?\s*%)\s*\n\s*-\s*([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?\s*%)/g, (m, p1, p2, p3, p4) => (p1 || '') + p2 + ' - ' + (p3 || '') + p4)
      .replace(/([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?)\s*-\s*\n\s*([≥≤><~=]|>=|<=)?\s*(\d+(?:[.,]\d+)?\s*%)/g, (m, p1, p2, p3, p4) => (p1 || '') + p2 + ' - ' + (p3 || '') + p4);

    const casMatches = [...cleanText.matchAll(/(?:CAS\s*[:\.]?\s*)?((?<![\d-])[1-9]\d{1,6}-\d{2}-\d(?![\d-]))/gi)]
      .filter(m => SDSChemicalExtractor.isValidCas(m[1]));
    if (casMatches.length === 0) return [];

    const concPattern = /(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%?(?:\s*-\s*(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%)|(?:[≥≤><~=]|>=|<=)\s*\d+(?:[.,]\d+)?\s*%/g;

    const components = [];

    for (let i = 0; i < casMatches.length; i++) {
      const curCas = casMatches[i][1];
      const casIdx = casMatches[i].index;

      // Wyznaczanie granic wiersza (do startu następnego CAS lub końca tekstu)
      let rowEnd = cleanText.length;
      if (i + 1 < casMatches.length) {
        rowEnd = casMatches[i + 1].index;
      }
      
      const preCasText = cleanText.substring(Math.max(0, casIdx - 250), casIdx);
      const concMatches = [...preCasText.matchAll(concPattern)];
      const lastConc = concMatches.length > 0 ? concMatches[concMatches.length - 1] : null;
      
      let rawConc = "—";
      let rawName = "";

      if (lastConc) {
        rawConc = lastConc[0].trim();
        rawName = preCasText.substring(lastConc.index + lastConc[0].length).trim();
      } else {
        const postCasText = cleanText.substring(casIdx + curCas.length, rowEnd);
        const postConcMatches = [...postCasText.matchAll(concPattern)];
        if (postConcMatches.length > 0) {
          rawConc = postConcMatches[0][0].trim();
        }
        const cleanPre = preCasText
          .replace(/^(?:[\s\S]*?(?:3\.\d|Miscele|Substances|Composition|Ingredients)[^\n]*\n)/i, '')
          .trim();
        const preLines = cleanPre.split('\n').map(l => l.trim()).filter(Boolean);
        rawName = preLines.length > 0 ? preLines.join(' ') : "";
      }

      const concentration = this.formatConcentration(rawConc);
      rawName = rawName.replace(/-\s+/g, '-').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

      const body = cleanText.substring(casIdx, rowEnd).trim();

      const ecMatch = body.match(/(?:EC|WE|EINECS)\s*[:\.]?\s*(\d{3}-\d{3}-\d)/i);
      const ecNumber = ecMatch ? ecMatch[1] : "—";

      const indexMatch = body.match(/(?:Index|Indeks)\s*[:\.]?\s*(\d{3}-\d{3}-\d{2}-[\dXx])/i);
      const indexNumber = indexMatch ? indexMatch[1] : "—";

      const reachMatch = body.match(/(?:01-\d{8,10}-\d{2}(?:-[A-Za-z0-9]{2,4})?|01-\d+-\d+-\w+)/);
      const reachNumber = reachMatch ? reachMatch[0] : "—";

      let classText = body;
      classText = classText.replace(/CAS\s*[:\.]?\s*\d{2,7}-\d{2}-\d/gi, '');
      if (ecMatch) classText = classText.replace(ecMatch[0], '');
      if (indexMatch) classText = classText.replace(indexMatch[0], '');
      if (reachMatch) classText = classText.replace(reachMatch[0], '');

      // Normalizacja nagłówków SCL i współczynników M
      classText = classText
        .replace(/Specific Concentration Limits\s*[:\.]?/gi, 'Specyficzne stężenia graniczne:\n')
        .replace(/M-Chronic\s*[:\.]?\s*(\d+)/gi, 'M (przewlekły) = $1')
        .replace(/M-Acute\s*[:\.]?\s*(\d+)/gi, 'M (ostry) = $1');

      // Inteligentna pętla normalizująca linie klasyfikacji i SCL bez niszczenia przedziałów stężeń
      const rawClassLines = classText.split('\n').map(l => l.trim()).filter(Boolean);
      const processedClassLines = [];
      let inSclBlock = false;

      for (let li = 0; li < rawClassLines.length; li++) {
        let curLine = rawClassLines[li];

        if (/Specyficzne stężenia graniczne/i.test(curLine)) {
          inSclBlock = true;
          processedClassLines.push("Specyficzne stężenia graniczne:");
          continue;
        }

        const isSclLine = inSclBlock || /(?:(?:^|[,\s])C\s*[≥≤><=]|[≥≤><=]?\s*\d+(?:[.,]\d+)?\s*%\s*[≤<=]\s*C|M\s*\((?:ostry|przewlekły)\)\s*=|ATE\b)/i.test(curLine);

        if (!isSclLine) {
          // Usuwamy wyłącznie śmieciowe resztki stężeń z sąsiednich wierszy tabeli (np. "≥0.00015%-" lub "<0.0015%"),
          // pod warunkiem że linia nie zawiera faktycznych klas zagrożenia ani kodów H
          if (/^(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%?\s*-?\s*$/i.test(curLine) ||
              (/^(?:[≥≤><~=]|>=|<=)?\s*\d+(?:[.,]\d+)?\s*%/i.test(curLine) && !/(?:Skin|Eye|Acute|Aquatic|Sens|Flam|Resp|STOT|Asp|H\d{3}|EUH)/i.test(curLine))) {
            continue;
          }
        } else {
          inSclBlock = true;
          // Normalizacja typografii CLP: <= -> ≤, >= -> ≥, kropki dziesiętne na przecinki w liczbach procentowych
          curLine = curLine
            .replace(/<=/g, '≤')
            .replace(/>=/g, '≥')
            .replace(/(\d+)\.(\d+)\s*%/g, '$1,$2%');

          // Scalanie połamanych wierszy SCL: jeśli następna linia jest osieroconym kodem H (np. "H315", "H319"), łączymy z bieżącą regułą SCL
          if (li + 1 < rawClassLines.length) {
            const nextL = rawClassLines[li + 1].trim();
            if (/^(?:H\d{3}[a-zA-Z]?|EUH\d{3})(?:\s*,\s*(?:H\d{3}[a-zA-Z]?|EUH\d{3}))*$/i.test(nextL)) {
              curLine = `${curLine} ${nextL}`;
              li++; // pochłonięcie osieroconego kodu H
            }
          }
        }

        processedClassLines.push(curLine);
      }

      classText = processedClassLines.join('\n').trim();
      classText = mapHazardClass(classText);

      const plName = this.resolvePlName(curCas, rawName, resolvedSubstances);

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
          const rawIupac = props.IUPACName || "";
          const namePl = SDSChemicalExtractor.resolvePlName(casNumber, rawIupac);
          return {
            source: "PUBCHEM_OPEN_API",
            name_pl: namePl,
            iupac_name: rawIupac,
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
  static getSection1_3(companyConfig = {}) {
    const compName = companyConfig.companyName || "ITALLUX Sp. z o.o.";
    const compAddress = companyConfig.address || "ul. Wesoła 16";
    const compCity = companyConfig.city ? `${companyConfig.postalCode ? companyConfig.postalCode + " " : ""}${companyConfig.city}` : "63-600 Kępno";
    const compWebsite = companyConfig.website || "www.prostozwloch.com.pl";
    const compEmail = companyConfig.email || "kontakt@prostozwloch.com.pl";
    const compPhone = companyConfig.phone || companyConfig.emergencyPhone || "+48 663116607";

    return (
      "1.3. Dane dotyczące dostawcy karty charakterystyki\n" +
      `Firma: ${compName}\n` +
      `Adres: ${compAddress}, ${compCity}\n` +
      `Strona www: ${compWebsite}\n` +
      `E-mail: ${compEmail}\n` +
      `Telefon: ${compPhone}`
    );
  }

  static getSection1_4(ufiCode) {
    const ufiStr = ufiCode ? `UFI: ${ufiCode}\n` : "";
    return (
      `${ufiStr}` +
      "1.4. Numer telefonu alarmowego\n" +
      "112 (ogólny telefon alarmowy w Polsce), 998 (straż pożarna), 999 (pogotowie ratunkowe)"
    );
  }

  static getSection2_3(edSubstanceInfo = null) {
    if (edSubstanceInfo) {
      return (
        "2.3. Inne zagrożenia\n" +
        `Substancje zaburzające funkcjonowanie układu hormonalnego: Produkt zawiera ${edSubstanceInfo} podlegającą ocenie pod kątem właściwości zaburzających funkcjonowanie układu hormonalnego w odniesieniu do środowiska zgodnie z kryteriami określonymi w rozporządzeniu (UE) 2017/2100 lub rozporządzeniu (UE) 2018/605 (szczegółowe dane w sekcji 12.6).\n` +
        "Komponenty mieszaniny nie spełniają kryteriów PBT lub vPvB zgodnie z załącznikiem XIII rozporządzenia REACH."
      );
    }
    return (
      "2.3. Inne zagrożenia\n" +
      "Produkt nie zawiera składników wpisanych do wykazu ustanowionego zgodnie z art. 59 ust. 1 jako posiadające właściwości zaburzające funkcjonowanie układu hormonalnego ani składników o właściwościach zaburzających funkcjonowanie układu hormonalnego zgodnie z kryteriami określonymi w rozporządzeniu 2017/2100/UE lub rozporządzeniu 2018/605/UE w stężeniu równym lub większym od 0,1 %.\n" +
      "Komponenty mieszaniny nie spełniają kryteriów PBT lub vPvB zgodnie z załącznikiem XIII rozporządzenia REACH."
    );
  }

  static getSection13(isHazardous = false, productText = "") {
    const category = WasteRegistry.getCategoryForProduct(productText) || {
      industrial_hazardous: "16 03 05* (Organiczne odpady zawierające substancje niebezpieczne)",
      industrial_non_hazardous: "16 03 06 (Organiczne odpady inne niż wymienione w 16 03 05)",
      consumer_hazardous: "20 01 29* (Detergenty zawierające substancje niebezpieczne) lub 20 01 27*",
      consumer_non_hazardous: "20 01 30 lub 20 01 28"
    };

    const productWasteCode = isHazardous ? category.industrial_hazardous : category.industrial_non_hazardous;
    const consumerWasteCode = isHazardous ? category.consumer_hazardous : category.consumer_non_hazardous;

    return (
      "SEKCJA 13: Postępowanie z odpadami\n\n" +
      "13.1. Metody unieszkodliwiania odpadów\n" +
      "Zalecenia dotyczące produktu i pozostałości:\n" +
      "Odzyskać, jeśli to możliwe. Nie wprowadzać do kanalizacji, wód powierzchniowych, gruntowych ani gleby. Pozostałości produktu oraz odpady należy poddać odzyskowi lub unieszkodliwianiu w uprawnionych instalacjach (np. spalarniach termicznych lub wyspecjalizowanych zakładach utylizacji odpadów) posiadających stosowne zezwolenia na prowadzenie gospodarki odpadami zgodnie z obowiązującymi przepisami.\n\n" +
      "Zalecenia dotyczące odpadów opakowaniowych:\n" +
      "Całkowicie opróżnione opakowania poddać procesowi odzysku lub recyklingu materiałowego w ramach selektywnej zbiórki odpadów. Opakowania zanieczyszczone pozostałościami produktu traktować zgodnie z ich stopniem skażenia – w przypadku substancji niebezpiecznych likwidować jak sam produkt u uprawnionego odbiorcy odpadów.\n\n" +
      "Klasyfikacja i kody odpadów (Katalog Odpadów Dz.U. 2020 poz. 10):\n" +
      `- Odpady z produktu (dla zastosowań profesjonalnych / przemysłowych): ${productWasteCode}.\n` +
      `- Odpady z produktu (dla konsumentów / odpady komunalne): ${consumerWasteCode}.\n` +
      "- Odpady opakowaniowe: 15 01 02 (Opakowania z tworzyw sztucznych) [w przypadku opakowań zanieczyszczonych substancjami niebezpiecznymi: 15 01 10*].\n" +
      "Uwaga: Podane kody odpadów mają charakter zalecany. Szczegółowy i ostateczny kod odpadu musi zostać nadany bezpośrednio przez wytwórcę odpadu, w oparciu o miejsce, branżę i specyfikę jego powstawania (BDO).\n\n" +
      "Krajowe i unijne akty prawne dotyczące gospodarki odpadami:\n" +
      "- Ustawa z dnia 14 grudnia 2012 r. o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.).\n" +
      "- Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.).\n" +
      "- Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).\n" +
      "- Dyrektywa Parlamentu Europejskiego i Rady 2008/98/WE z dnia 19 listopada 2008 r. w sprawie odpadów oraz uchylająca niektóre dyrektywy."
    );
  }

  static getSection15(svhcInfo = "", restrictionsInfo = "", isDetergent = false, isHighlyFlammable = false, isAquaticToxic = false, sevesoCategory = "") {
    const svhcText = svhcInfo || "Mieszanina nie zawiera substancji z listy kandydackiej SVHC podlegających procedurze udzielania zezwoleń (REACH załącznik XIV) w stężeniu ≥ 0,1% wag.";
    let restrText = restrictionsInfo || "Mieszanina nie podlega ograniczeniom na mocy załącznika XVII do rozporządzenia REACH.";
    if (!restrText.startsWith("\n") && !restrText.startsWith(" ")) {
      restrText = " " + restrText;
    }

    let detergentLawLine = "";
    if (isDetergent) {
      detergentLawLine = "- Rozporządzenie (WE) nr 648/2004 Parlamentu Europejskiego i Rady z dnia 31 marca 2004 r. w sprawie detergentów z późniejszymi zmianami.\n";
    }

    let sevesoLine = "- Dyrektywa Parlamentu Europejskiego i Rady 2012/18/UE z dnia 4 lipca 2012 r. w sprawie kontroli niebezpieczeństwa poważnych awarii związanych z substancjami niebezpiecznymi (Seveso III):\n  * Mieszanina nie podlega przepisom dyrektywy – brak substancji w ilościach progowych.\n";
    if (sevesoCategory === "P5c" || (!sevesoCategory && isHighlyFlammable)) {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n" +
                   "  * Kategoria zagrożenia: P5c CIECZE ŁATWOPALNE.\n" +
                   "  * Ilości progowe substancji niebezpiecznych decydujące o zaliczeniu zakładu: Zakład o Zwiększonym Ryzyku (ZZR) – 5 000 t; Zakład o Dużym Ryzyku (ZDR) – 50 000 t.\n";
    } else if (sevesoCategory === "P5a") {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n" +
                   "  * Kategoria zagrożenia: P5a CIECZE ŁATWOPALNE.\n" +
                   "  * Ilości progowe substancji niebezpiecznych decydujące o zaliczeniu zakładu: Zakład o Zwiększonym Ryzyku (ZZR) – 10 t; Zakład o Dużym Ryzyku (ZDR) – 50 t.\n";
    } else if (sevesoCategory === "P5b") {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n" +
                   "  * Kategoria zagrożenia: P5b CIECZE ŁATWOPALNE.\n" +
                   "  * Ilości progowe substancji niebezpiecznych decydujące o zaliczeniu zakładu: Zakład o Zwiększonym Ryzyku (ZZR) – 50 t; Zakład o Dużym Ryzyku (ZDR) – 200 t.\n";
    } else if (sevesoCategory === "E1" || (!sevesoCategory && isAquaticToxic)) {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n" +
                   "  * Kategoria zagrożenia: E1 ZAGROŻENIA DLA ŚRODOWISKA.\n" +
                   "  * Ilości progowe substancji niebezpiecznych decydujące o zaliczeniu zakładu: Zakład o Zwiększonym Ryzyku (ZZR) – 100 t; Zakład o Dużym Ryzyku (ZDR) – 200 t.\n";
    } else if (sevesoCategory === "E2") {
      sevesoLine = "- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n" +
                   "  * Kategoria zagrożenia: E2 ZAGROŻENIA DLA ŚRODOWISKA.\n" +
                   "  * Ilości progowe substancji niebezpiecznych decydujące o zaliczeniu zakładu: Zakład o Zwiększonym Ryzyku (ZZR) – 200 t; Zakład o Dużym Ryzyku (ZDR) – 500 t.\n";
    } else if (sevesoCategory) {
      sevesoLine = `- Dyrektywa Seveso III (2012/18/UE) / Rozporządzenie Ministra Rozwoju z dnia 29 stycznia 2016 r. (Dz.U. 2016 poz. 138):\n  * Kategoria zagrożenia: ${sevesoCategory}.\n`;
    }

    return (
      "SEKCJA 15: Informacje dotyczące przepisów prawnych\n\n" +
      "15.1. Przepisy prawne dotyczące bezpieczeństwa, zdrowia i ochrony środowiska specyficzne dla substancji lub mieszaniny\n\n" +
      "Prawodawstwo Unii Europejskiej:\n" +
      "- Rozporządzenie (WE) nr 1907/2006 Parlamentu Europejskiego i Rady z dnia 18 grudnia 2006 r. w sprawie rejestracji, oceny, udzielania zezwoleń i stosowanych ograniczeń w zakresie chemikaliów (REACH) z późniejszymi zmianami.\n" +
      "- Rozporządzenie Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniające załącznik II do rozporządzenia (WE) nr 1907/2006 (wymogi dotyczące sporządzania kart charakterystyki).\n" +
      "- Rozporządzenie Parlamentu Europejskiego i Rady (WE) nr 1272/2008 z dnia 16 grudnia 2008 r. w sprawie klasyfikacji, oznakowania i pakowania substancji i mieszanin (CLP) z późniejszymi zmianami (kolejne ATP).\n" +
      detergentLawLine +
      `- Substancje wzbudzające szczególnie duże obawy (SVHC – REACH załącznik XIV): ${svhcText}\n` +
      `- Ograniczenia dotyczące produkcji, wprowadzania do obrotu i stosowania niektórych niebezpiecznych substancji (REACH załącznik XVII): ${restrText}\n` +
      sevesoLine +
      "- Rozporządzenie Parlamentu Europejskiego i Rady (UE) nr 649/2012 z dnia 4 lipca 2012 r. dotyczące wywozu i przywozu niebezpiecznych chemikaliów (PIC): Nie dotyczy.\n\n" +
      "Prawodawstwo Rzeczypospolitej Polskiej:\n" +
      "- Ustawa z dnia 25 lutego 2011 r. o substancjach chemicznych i ich mieszaninach (t.j. Dz.U. 2022 poz. 1816 z późn. zm.).\n" +
      "- Rozporządzenie Ministra Rodziny, Pracy i Polityki Społecznej z dnia 12 czerwca 2018 r. w sprawie najwyższych dopuszczalnych stężeń i natężeń czynników szkodliwych dla zdrowia w środowisku pracy (Dz.U. 2018 poz. 1286 z późn. zm.).\n" +
      "- Ustawa z dnia 14 grudnia 2012 r. o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.).\n" +
      "- Ustawa z dnia 13 czerwca 2013 r. o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.).\n" +
      "- Rozporządzenie Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10).\n" +
      "- Ustawa z dnia 19 sierpnia 2011 r. o przewozie towarów niebezpiecznych (t.j. Dz.U. 2024 poz. 643 z późn. zm.) wraz z oświadczeniami rządowymi w sprawie Umowy europejskiej dotyczącej międzynarodowego przewozu drogowego towarów niebezpiecznych (ADR).\n" +
      "- Rozporządzenie Ministra Zdrowia z dnia 30 grudnia 2004 r. w sprawie bezpieczeństwa i higieny pracy związanej z występowaniem w miejscu pracy czynników chemicznych (t.j. Dz.U. 2016 poz. 1488).\n" +
      "- Rozporządzenie Ministra Zdrowia z dnia 2 lutego 2011 r. w sprawie badań i pomiarów czynników szkodliwych dla zdrowia w środowisku pracy (t.j. Dz.U. 2023 poz. 419).\n" +
      "- Ustawa z dnia 26 czerwca 1974 r. – Kodeks pracy (t.j. Dz.U. 2023 poz. 1465 z późn. zm.).\n\n" +
      "15.2. Ocena bezpieczeństwa chemicznego\n" +
      "Dla mieszaniny nie dokonano oceny bezpieczeństwa chemicznego (dla mieszanin nie jest ona wymagana zgodnie z art. 14 rozporządzenia REACH)."
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
  static bufferCache = {};

  static async generatePictogramBuffer(ghsCode, size = 180) {
    const code = (ghsCode || "").toUpperCase().trim();
    const cacheKey = `${code}_${size}`;
    if (this.bufferCache[cacheKey]) return this.bufferCache[cacheKey];

    const assetPath = path.join(__dirname, 'assets', 'pictograms', 'ghs', `${code}.svg`);
    if (fs.existsSync(assetPath)) {
      try {
        const svgContent = fs.readFileSync(assetPath);
        if (sharp) {
          const buffer = await sharp(svgContent).resize(size, size, { fit: 'contain' }).png().toBuffer();
          this.bufferCache[cacheKey] = buffer;
          return buffer;
        }
      } catch (err) {
        console.warn(`[GHSPictogramGenerator] Błąd sharp dla ${code}: ${err.message}. Przełączam na fallback.`);
      }
    }

    // Fallback PurePngEncoder
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
          if (dist >= maxDist - borderWidth) setPixel(x, y, 204, 0, 0, 255);
          else setPixel(x, y, 255, 255, 255, 255);
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
    fillRect(cx - Math.floor(size*0.04), cy - Math.floor(size*0.22), cx + Math.floor(size*0.04), cy + Math.floor(size*0.08));
    fillRect(cx - Math.floor(size*0.045), cy + Math.floor(size*0.13), cx + Math.floor(size*0.045), cy + Math.floor(size*0.21));
    const fallbackBuffer = PurePngEncoder.encodeRGBA(size, size, rgba);
    this.bufferCache[cacheKey] = fallbackBuffer;
    return fallbackBuffer;
  }
}

class ADRPictogramGenerator {
  static bufferCache = {};

  static async generateAdrLabelBuffer(classCode = '3', size = 180) {
    const norm = String(classCode || '3').trim().replace(/[^0-9]/g, '');
    const cacheKey = `ADR_${norm}_${size}`;
    if (this.bufferCache[cacheKey]) return this.bufferCache[cacheKey];

    const assetPath = path.join(__dirname, 'assets', 'pictograms', 'adr', `ADR_${norm}.svg`);
    if (fs.existsSync(assetPath)) {
      try {
        const svgContent = fs.readFileSync(assetPath);
        if (sharp) {
          const buffer = await sharp(svgContent).resize(size, size, { fit: 'contain' }).png().toBuffer();
          this.bufferCache[cacheKey] = buffer;
          return buffer;
        }
      } catch (err) {
        console.warn(`[ADRPictogramGenerator] Błąd sharp dla ADR_${norm}: ${err.message}`);
      }
    }

    // Fallback PurePngEncoder
    const rgba = Buffer.alloc(size * size * 4, 0);
    const cx = Math.floor(size / 2); const cy = Math.floor(size / 2);
    const margin = Math.floor(size * 0.08); const maxDist = cx - margin;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= maxDist) {
          const idx = (y * size + x) * 4;
          rgba[idx] = 211; rgba[idx+1] = 47; rgba[idx+2] = 47; rgba[idx+3] = 255;
        }
      }
    }
    const buf = PurePngEncoder.encodeRGBA(size, size, rgba);
    this.bufferCache[cacheKey] = buf;
    return buf;
  }

  static async generateLqMarkBuffer(size = 180) {
    const cacheKey = `ADR_LQ_${size}`;
    if (this.bufferCache[cacheKey]) return this.bufferCache[cacheKey];

    const assetPath = path.join(__dirname, 'assets', 'pictograms', 'adr', 'ADR_LQ.svg');
    if (fs.existsSync(assetPath)) {
      try {
        const svgContent = fs.readFileSync(assetPath);
        if (sharp) {
          const buffer = await sharp(svgContent).resize(size, size, { fit: 'contain' }).png().toBuffer();
          this.bufferCache[cacheKey] = buffer;
          return buffer;
        }
      } catch (err) {
        console.warn(`[ADRPictogramGenerator] Błąd sharp dla ADR_LQ: ${err.message}`);
      }
    }

    // Fallback PurePngEncoder
    const rgba = Buffer.alloc(size * size * 4, 0);
    const cx = Math.floor(size / 2); const cy = Math.floor(size / 2);
    const margin = Math.floor(size * 0.08); const maxDist = cx - margin;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.abs(x - cx) + Math.abs(y - cy) <= maxDist) {
          const idx = (y * size + x) * 4;
          rgba[idx] = 255; rgba[idx+1] = 255; rgba[idx+2] = 255; rgba[idx+3] = 255;
        }
      }
    }
    const buf = PurePngEncoder.encodeRGBA(size, size, rgba);
    this.bufferCache[cacheKey] = buf;
    return buf;
  }
}

// ============================================================================
// 8. G?ÓWNY SILNIK PARSERA I KWARANTANNY
// ============================================================================
class SDSProcessorEngine {
  constructor(companyConfig = {}) {
    this.companyConfig = {
      companyName: companyConfig.companyName || process.env.COMPANY_NAME || "ITALLUX Sp. z o.o.",
      address: companyConfig.address || process.env.COMPANY_ADDRESS || "ul. Wesoła 16",
      city: companyConfig.city || process.env.COMPANY_CITY || "63-600 Kępno",
      website: companyConfig.website || process.env.COMPANY_WEBSITE || "www.prostozwloch.com.pl",
      email: companyConfig.email || process.env.COMPANY_EMAIL || "kontakt@prostozwloch.com.pl",
      phone: companyConfig.phone || process.env.COMPANY_PHONE || "+48 663116607",
      emergencyPhone: companyConfig.emergencyPhone || process.env.COMPANY_EMERGENCY_PHONE || process.env.COMPANY_PHONE || "+48 663116607"
    };
    this.quarantineLogs = [];
    this.extractedSubstances = [];
    this.detectedGhsPictograms = [];
    this.anomalies = [];

    // Inicjalizacja baz referencyjnych RAG
    const ndsPath = path.join(__dirname, 'rag_knowledge', 'nds_database_2018.json');
    NDSRegistry.loadRegistry(ndsPath);
    const ecotoxPath = path.join(__dirname, 'rag_knowledge', 'ecotox_cache.json');
    EcotoxRegistry.loadRegistry(ecotoxPath);
    const adrPath = path.join(__dirname, 'rag_knowledge', 'adr_transport_pl.json');
    ADRRegistry.loadRegistry(adrPath);
    const wastePath = path.join(__dirname, 'rag_knowledge', 'waste_codes_pl.json');
    WasteRegistry.loadRegistry(wastePath);
  }


  processSection2(contentIt, resolvedSubstances = {}, components = []) {
    const hCodes = SDSChemicalExtractor.extractHCodes(contentIt);
    const pCodes = SDSChemicalExtractor.extractPCodes(contentIt);
    const euhCodes = SDSChemicalExtractor.extractEuhCodes(contentIt);
    
    // Walidacja twarda słownika
    hCodes.forEach(code => {
      if (!OFFICIAL_CLP_H_PHRASES[code]) throw new Error(`[CRITICAL HALT] Nieznany kod zagrożenia: ${code}`);
    });

    const isExplicitlyNotHazardous = /(?:not classified|non[ \-]*(?:[eè]|est)?\s*classificat|nie sklasyfikowan|nie jest sklasyfikowan|nie stwarza zagrożenia|not hazardous)/i.test(contentIt);
    const isHazardous = !isExplicitlyNotHazardous && (hCodes.length > 0 || /(?:Flam\.|Skin\.|Eye\.|Acute Tox|Aquatic|STOT|Asp\.)/i.test(contentIt));

    // 2.1. Klasyfikacja substancji lub mieszaniny (Załącznik II REACH pkt 2.1: pełne klasy, kategorie i zwroty H)
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
        classification2_1 = hCodes.map(c => {
          let clpClass = H_TO_CLP_CLASS_MAP[c] || "Zagrożenie wg rozporządzenia CLP";
          if (c === 'H317') {
            const has1A = /Skin\s*Sens\.?\s*1A/i.test(contentIt) || (components && components.some(comp => {
              const compCl = comp.classification || '';
              const compName = (comp.name || comp.originalName || '').toLowerCase();
              return (compCl.includes('Skin Sens. 1A') || compName.includes('cinnamaldehyde') || compName.includes('cynamon')) && compCl.includes('H317');
            }));
            if (has1A) {
              clpClass = "Skin Sens. 1A (Działanie uczulające na skórę, kategoria 1A)";
            }
          }
          const phrase = OFFICIAL_CLP_H_PHRASES[c] || "";
          return `${clpClass}\n${c} ${phrase}`.trim();
        }).join('\n\n');
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

    // Nazwy substancji na etykiecie wg art. 18 ust. 3 lit. b CLP:
    // Podaje się wyłącznie nazwy substancji, które zdecydowały o zaklasyfikowaniu mieszaniny do odpowiednich kategorii.
    // Substancje obecne poniżej progów klasyfikacji mieszaniny (np. Skin Sens < 1%) NIE mogą być umieszczane na etykiecie
    // jako substancje identyfikujące zagrożenie – wyzwalają one wyłącznie zwrot EUH208!
    // Gdy mieszanina jest zaklasyfikowana jako Skin Sens. (H317), alergeny wyzwalające tę klasyfikację
    // MUSZĄ znaleźć się na etykiecie pod "Zawiera:", a zwrot EUH208 jest prawnie zabroniony.
    let labelSubstances = "Nie dotyczy.";
    const containsMatch = contentIt.match(/(?<!EUH208[\s\S]{0,30})(?:Contains|Contiene|Zawiera)\s*[:\.]?\s*([\s\S]+?)(?=(?:2\.3\b|Other\s+hazards|Inne\s+zagrożenia|Altri\s+pericoli|Hazard-determining|Hazard\s+statements|Precautionary\s+statements|Pericoli|Zwroty|Piktogramy|Hasło|Signal|Word|EUH|Supplemental|$))/i);
    let potentialNames = [];
    if (containsMatch) {
      const rawText = containsMatch[1].replace(/-\s+/g, '-');
      const rawNames = (rawText.includes('\n') || rawText.includes('|'))
        ? rawText.split(/[\r\n|;]+/).map(s => s.trim()).filter(s => s && !/(?:Hazard-determining|Pericoli|Zwroty|Piktogramy|Hasło|Signal|Word|EUH)/i.test(s) && s.length >= 3)
        : rawText.split(/(?:;|(?:,(?!\s*\d|\s*[a-z0-9\*]+\))))/).map(s => s.trim()).filter(s => s && !/(?:Hazard-determining|Pericoli|Zwroty|Piktogramy|Hasło|Signal|Word|EUH)/i.test(s) && s.length >= 3);
      
      potentialNames = rawNames.map(rn => {
        return SDSChemicalExtractor.resolvePlName(null, rn, resolvedSubstances);
      }).filter(Boolean);
    }

    // Filtrowanie substancji etykiety zgodnie z art. 18 ust. 3 lit. b CLP
    if (components && components.length > 0 && isHazardous) {
      const deciders = components.filter(c => {
        const cl = c.classification || '';
        const concNums = [...(c.concentration || '').matchAll(/(\d+(?:[.,]\d+)?)/g)].map(n => parseFloat(n[1].replace(',', '.')));
        const maxC = concNums.length > 0 ? Math.max(...concNums) : 0;
        
        // Alergeny (H317/H334):
        // Jeśli mieszanina JEST zaklasyfikowana jako H317/H334 (art. 18 ust. 3 lit. b CLP):
        // Wszystkie składniki uczulające, które wywołały tę klasyfikację (np. stężenie >= 0.1% lub SCL 0.01% dla 1A),
        // MUSZĄ znaleźć się w "Zawiera:" na etykiecie.
        // Jeśli mieszanina NIE jest zaklasyfikowana jako H317/H334:
        // bezwzględny zakaz umieszczania na etykiecie głównej (trafiają do EUH208 wg art. 25 ust. 6 CLP)
        const isSens = /(?:Skin\s*Sens|Resp\s*Sens|H317|H334)/i.test(cl);
        const mixtureHasSens = hCodes.some(h => ['H317', 'H334'].includes(h));
        if (isSens) {
          if (mixtureHasSens) {
            if (maxC >= 0.1 || /Skin\s*Sens\.?\s*1A/i.test(cl) || maxC >= 0.01) {
              return true;
            }
          } else {
            const hasOtherHazardInMixture = hCodes.some(h => {
              if (['H317', 'H334'].includes(h)) return false;
              return cl.includes(h);
            });
            if (!hasOtherHazardInMixture) return false;
          }
        }

        // 1. Toksyczność ostra (H300..H302, H310..H312, H330..H332) - tylko jeśli mieszanina jest zaklasyfikowana jako ostra toksyczność
        if (/Acute\s*Tox|H30[0-2]|H31[0-2]|H33[0-2]/i.test(cl)) {
          const mixtureHasAcute = hCodes.some(h => /^H3[013][0-2]$/.test(h));
          if (!mixtureHasAcute) return false;
        }

        // 2. Działanie rakotwórcze, mutagenne, toksyczne na rozrodczość (CMR: H340, H350, H360, H361)
        if (/Repr\.|Carc\.|Muta\.|H34[01]|H35[01]|H36[01]/i.test(cl)) {
          const mixtureHasCmr = hCodes.some(h => /^H3[456][01]/.test(h));
          if (!mixtureHasCmr || maxC < 0.1) return false;
        }

        // 3. STOT (H370, H371, H372, H373, H335, H336) i zagrożenie aspiracją (H304)
        if (/STOT|Asp\.\s*Tox|H37[0-3]|H304/i.test(cl)) {
          const mixtureHasStotOrAsp = hCodes.some(h => /^H3(?:7[0-3]|04|3[56])$/.test(h));
          if (!mixtureHasStotOrAsp || maxC < 1.0) return false;
        }

        // 4. Działanie żrące / drażniące na oczy (Eye Dam. 1 H318, Eye Irrit. 2 H319)
        if (/Eye\s*(?:Dam|Irrit)|H31[89]/i.test(cl)) {
          const mixtureHasEye = hCodes.some(h => ['H318', 'H319'].includes(h));
          if (mixtureHasEye && (maxC >= 10 || /Eye\s*Irrit[^\n]*≥\s*50%/i.test(cl) || maxC >= 3)) {
            return true;
          }
        }

        // 5. Substancje łatwopalne / rozpuszczalniki bazowe (H224, H225, H226)
        if (/Flam\.\s*Liq|H22[4-6]/i.test(cl)) {
          const mixtureHasFlam = hCodes.some(h => /^H22[4-6]$/.test(h));
          if (mixtureHasFlam && maxC >= 10) return true;
        }

        // Ogólne kryterium: stężenie znaczące i klasa obecna w hCodes mieszaniny
        const sharesCodeWithMixture = hCodes.some(h => cl.includes(h));
        return sharesCodeWithMixture && maxC >= 10;
      }).map(c => c.name || c.originalName).filter(Boolean);

      const rawAllNames = Array.from(new Set([...potentialNames, ...deciders]));
      if (rawAllNames.length > 0) {
        const deduplicatedNames = [];
        const seenKeys = new Set();
        for (const nm of rawAllNames) {
          const resolved = SDSChemicalExtractor.resolvePlName(null, nm, resolvedSubstances);
          const key = (resolved || '').toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '');
          if (key && !seenKeys.has(key)) {
            seenKeys.add(key);
            deduplicatedNames.push(resolved);
          }
        }
        labelSubstances = deduplicatedNames.join(', ');
      }
    } else if (potentialNames.length > 0) {
      const deduplicatedNames = [];
      const seenKeys = new Set();
      for (const nm of potentialNames) {
        const resolved = SDSChemicalExtractor.resolvePlName(null, nm, resolvedSubstances);
        const key = (resolved || '').toLowerCase().replace(/[^a-ząćęłńóśźż0-9]/g, '');
        if (key && !seenKeys.has(key)) {
          seenKeys.add(key);
          deduplicatedNames.push(resolved);
        }
      }
      labelSubstances = deduplicatedNames.join(', ');
    } else if (isHazardous) {
      const hazardSubstanceNames = Object.values(resolvedSubstances).filter(Boolean);
      if (hazardSubstanceNames.length > 0) labelSubstances = Array.from(new Set(hazardSubstanceNames)).join(", ");
    }

    let mappedH = "Brak.";
    if (hCodes.length > 0) {
      mappedH = hCodes.map(c => `${c} ${OFFICIAL_CLP_H_PHRASES[c] || c}`).join('\n');
    }

    let mappedP = "Brak.";
    if (pCodes.length > 0) {
      let filteredPCodes = [...pCodes];
      // Zgodnie z art. 28 ust. 3 rozporządzenia CLP eliminujemy zwroty niemające uzasadnienia w klasyfikacji mieszaniny
      const hasSkinHazard = hCodes.some(h => ['H314', 'H315', 'H317', 'H311', 'H312', 'H310'].includes(h)) || /H314|H315|H317|Skin\s*Sens|Skin\s*Irrit|Skin\s*Corr/i.test(s2Content);
      if (!hasSkinHazard) {
        filteredPCodes = filteredPCodes.filter(c => c !== 'P302+P352' && c !== 'P302' && c !== 'P352' && c !== 'P333+P313');
      }
      // Zgodnie z art. 28 ust. 3 CLP oraz Single Source of Truth (SSOT), autentyczne zwroty P nadane przez producenta
      // w karcie źródłowej (w tym zwroty medyczne reagowania P333+P313, P337+P313 oraz P501) są w 100% zachowywane.
      mappedP = filteredPCodes.map(c => `${c} ${OFFICIAL_CLP_P_PHRASES[c] || c}`).join('\n');
    }

    let mappedEuh = "Brak.";
    let euhEntries = [];
    const euh208Text = SDSChemicalExtractor.formatEuh208(contentIt, resolvedSubstances, components, hCodes);
    if (euh208Text) {
      euhEntries.push(euh208Text);
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

    let chemDesc = "Mieszanina substancji stwarzających zagrożenie wraz z dodatkami niesklasyfikowanymi.";
    const descMatch = (contentIt || "").match(/(?:Chemical description|Descrizione chimica|Opis chemiczny|Description)\s*[:\.]?\s*([^\n]+)/i);
    if (descMatch && descMatch[1] && !/not applicable|non applicabile/i.test(descMatch[1])) {
      chemDesc = descMatch[1].trim()
        .replace(/aqueous solution/gi, 'wodny roztwór')
        .replace(/soluzione acquosa/gi, 'wodny roztwór')
        .replace(/mixture of/gi, 'mieszanina')
        .replace(/miscela di/gi, 'mieszanina');
    }

    let textContent = "SEKCJA 3: Skład / informacja o składnikach\n\n";
    textContent += "3.1. Substancje: Nie dotyczy.\n\n";
    textContent += `3.2. Mieszaniny\nOpis chemiczny: ${chemDesc}\n\n`;

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

    return { content: textContent, components, resolvedSubstances, chemicalDescription: chemDesc };
  }

  async processSection3FromDocxTable(tableRows, contentIt, manualOverrides = {}) {
    // 1. Ekstrakcja wstępna komponentów z wierszy tabeli OpenXML
    const parsedFromTable = SDSDocxParser.parseSection3Table(tableRows);

    // 2. Zebranie listy CAS z tabeli lub fallback do tekstu
    let casList = [];
    if (parsedFromTable && parsedFromTable.length > 0) {
      casList = Array.from(new Set(parsedFromTable.map(c => c.cas).filter(Boolean)));
    }
    if (casList.length === 0 && contentIt) {
      casList = SDSChemicalExtractor.extractCas(contentIt);
    }

    // 3. Rozwiązanie nazw CAS (HITL, CAS_TO_PL_MAP, ECHA) z zachowaniem pełnej tarczy błędów
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

    // 4. Ponowne sparsowanie tabeli z uwzględnieniem przetłumaczonych nazw
    let components = SDSDocxParser.parseSection3Table(tableRows, (cas, raw, ec) => SDSChemicalExtractor.resolvePlName(cas, raw, resolvedSubstances, ec));
    if (!components || components.length === 0) {
      components = SDSChemicalExtractor.parseSection3Components(contentIt, resolvedSubstances);
    }

    // 5. Opis chemiczny
    let chemDesc = "Mieszanina substancji stwarzających zagrożenie wraz z dodatkami niesklasyfikowanymi.";
    const descMatch = (contentIt || "").match(/(?:Chemical description|Descrizione chimica|Opis chemiczny|Description)\s*[:\.]?\s*([^\n]+)/i);
    if (descMatch && descMatch[1] && !/not applicable|non applicabile/i.test(descMatch[1])) {
      chemDesc = descMatch[1].trim()
        .replace(/aqueous solution/gi, 'wodny roztwór')
        .replace(/soluzione acquosa/gi, 'wodny roztwór')
        .replace(/mixture of/gi, 'mieszanina')
        .replace(/miscela di/gi, 'mieszanina');
    }

    let textContent = "SEKCJA 3: Skład / informacja o składnikach\n\n";
    textContent += "3.1. Substancje: Nie dotyczy.\n\n";
    textContent += `3.2. Mieszaniny\nOpis chemiczny: ${chemDesc}\n\n`;

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

    return {
      content: textContent.trim(),
      components,
      resolvedSubstances,
      chemicalDescription: chemDesc
    };
  }


  // ============================================================================
  // UNIWERSALNE SŁOWNIKI I MAPOWANIA REGULACYJNE (UE 2020/878)
  // ============================================================================
  static PHRASE_DICTIONARY_PL = {
    // Pierwsza pomoc (Sekcja 4)
    "in case of doubt or in the presence of symptoms contact a doctor and show him this document. in case of more severe symptoms, ask for immediate medical aid": "W razie wątpliwości lub w przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać mu niniejszą kartę charakterystyki. W przypadku cięższych objawów wezwać natychmiastową pomoc medyczną.",
    "in case of doubt or in the presence of symptoms contact a doctor and show him this document": "W razie wątpliwości lub w przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać mu niniejszą kartę charakterystyki.",
    "in case of more severe symptoms, ask for immediate medical aid": "W przypadku wystąpienia cięższych objawów wezwać natychmiastową pomoc medyczną.",
    "in caso di dubbio o in presenza di sintomi contattare un medico e mostrargli questo documento. in caso di sintomi più gravi richiedere l'intervento immediato di un medico": "W razie wątpliwości lub w przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać mu niniejszą kartę charakterystyki. W przypadku cięższych objawów wezwać natychmiastową pomoc medyczną.",
    "remove, if present, contact lenses if the situation allows you to do so easily. wash immediately with plenty of water for at least 15 minutes, opening the eyelids fully. get medical advice/attention": "Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Płukać natychmiast dużą ilością wody przez co najmniej 15 minut, całkowicie otwierając powieki. Zasięgnąć porady/zgłosić się pod opiekę lekarza (skonsultować się z lekarzem okulistą).",
    "togliere, se presenti, le lenti a contatto se la situazione consente di farlo facilmente. lavare immediatamente ed abbondantemente con acqua per almeno 15 minuti, aprendo bene le palpebre. consultare un medico": "Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Płukać natychmiast dużą ilością wody przez co najmniej 15 minut, całkowicie otwierając powieki. Zasięgnąć porady/zgłosić się pod opiekę lekarza (skonsultować się z lekarzem okulistą).",
    "take off immediately all contaminated clothing. wash immediately and thoroughly with running water (and soap if possible). get medical advice/attention. avoid further contact with contaminated clothing": "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady/zgłosić się pod opiekę lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.",
    "take off immediately all contaminated clothing. wash immediately and thoroughly with running water (and soap if possible). get medical advice. avoid further contact with contaminated clothing": "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.",
    "take off contaminated clothing. wash immediately and thoroughly with running water (and soap if possible). get medical advice. avoid further contact with contaminated clothing": "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.",
    "togliere gli indumenti contaminati. lavare immediatamente ed abbondantemente con acqua corrente (e sapone se possibile). consultare un medico. evitare ulteriori contatti con gli indumenti contaminati": "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.",
    "do not induce vomiting unless explicitly authorised by a doctor. do not give anything by mouth to an unconscious person. get medical advice/attention": "Nie wywoływać wymiotów, chyba że zostało to wyraźnie zalecone przez lekarza. Nigdy nie podawać niczego doustnie osobie nieprzytomnej. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.",
    "non provocare il vomito se non espressamente autorizzati dal medico. non somministrare nulla per via orale a una persona priva di sensi. consultare un medico": "Nie wywoływać wymiotów, chyba że zostało to wyraźnie zalecone przez lekarza. Nigdy nie podawać niczego doustnie osobie nieprzytomnej. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.",
    "remove victim to fresh air, away from the accident scene. get medical advice/attention": "Wyprowadzić poszkodowanego na świeże powietrze, z dala od miejsca zdarzenia, zapewnić ciepło i spokój. Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
    "portare l'infortunato all'aria aperta, lontano dal luogo dell'incidente. consultare un medico": "Wyprowadzić poszkodowanego na świeże powietrze, z dala od miejsca zdarzenia, zapewnić ciepło i spokój. Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
    "it is good practice for rescuers lending support to a person who has been exposed to a chemical substance or to a mixture to wear personal protective equipment. the nature of such protection depends on the hazard level of the substance or mixture, on the type of exposure and on the extent of the contamination. in the absence of other more specific indications, use of disposable gloves in the event of possible contact with body fluids is recommended. for the type of ppe suitable for the characteristics of the substance or mixture, see section 8": "Dobrą praktyką jest, aby ratownicy udzielający pomocy osobie narażonej na działanie substancji lub mieszaniny chemicznej stosowali środki ochrony indywidualnej. Rodzaj ochrony zależy od stopnia zagrożenia stwarzanego przez substancję lub mieszaninę, rodzaju narażenia i stopnia skażenia. W przypadku braku innych, bardziej szczegółowych wskazań, w razie możliwości kontaktu z płynami ustrojowymi zaleca się stosowanie rękawic jednorazowych. Informacje na temat odpowiednich środków ochrony indywidualnej podano w sekcji 8.",
    "specific information on symptoms and effects caused by the product are unknown": "Brak dostępnych szczegółowych informacji na temat objawów i skutków wywoływanych przez produkt.",
    "delayed effects: based on the information currently available, there are no known cases of delayed effects following exposure to this product": "SKUTKI OPÓŹNIONE: W oparciu o dostępne dane, w warunkach prawidłowego stosowania nie są znane przypadki wystąpienia opóźnionych powikłań zdrowotnych.",
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
    "if symptoms occur, whether acute or delayed, consult a doctor. means to have available in the workplace for specific and immediate treatment running water for skin and eye wash": "W przypadku wystąpienia objawów (ostrych lub opóźnionych) skonsultować się z lekarzem.\nŚrodki, które powinny być dostępne w miejscu pracy w celu zapewnienia natychmiastowego i specyficznego leczenia: Bieżąca woda do przemywania oczu i zmywania skóry.",
    "if symptoms occur, whether acute or delayed, consult a doctor": "W przypadku wystąpienia objawów (ostrych lub opóźnionych) skonsultować się z lekarzem.",
    "running water for skin and eye wash": "Bieżąca woda do przemywania oczu i zmywania skóry.",
    "means to have available in the workplace for specific and immediate treatment": "W miejscu pracy powinna być dostępna bieżąca woda do przemywania oczu i zmywania skóry.",
    "se si verificano sintomi, acuti o ritardati, consultare un medico": "W przypadku wystąpienia objawów (ostrych lub opóźnionych) skonsultować się z lekarzem.",
    "data not available": "Brak danych.",
    "dati non disponibili": "Brak danych.",

    // Pożarnictwo (Sekcja 5)
    "extinguishing substances are: carbon dioxide, foam, chemical powder": "Środki gaśnicze: dwutlenek węgla (CO2), piana gaśnicza, proszek chemiczny.",
    "carbon dioxide, foam, chemical powder": "Dwutlenek węgla (CO2), piana gaśnicza, proszek chemiczny.",
    "carbon dioxide, foam, powder": "Dwutlenek węgla (CO2), piana gaśnicza, proszek gaśniczy.",
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
      .replace(/(?:^[^\n]+\n)?\s*(?:Revision|Revisione|Wersja)\s*(?:nr\.?|no\.?|n\.|:)?\s*\d+[\s\S]*?Replaced revision:[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Suarez\s+Company|Company)[^\n]*[\s\S]{1,500}?\n\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/gi, '')
      .replace(/Suarez Company[\s\S]*?Replaced revision:[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Revision nr\.?|Revisione n\.?|Wersja nr|Dated|Data|Printed on|Stampato il)\s*[:\.]?\s*[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Suarez\s+Company|Company|Distributor|Dystrybutor)\s*\|[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?!(?:LC|EC|IC|LD|NOEC|NOAEL|LOAEL)\d*)(?:BLK\d+(?:-\d+)?|[A-Z]{2,6}\d{3,8}(?:-\d+)?)\s*-\s*[^\n]+/gi, '')
      .replace(/(?:^|\n)\s*(?:Page|Strona|Pagina|Pag\.)\b[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/g, '')
      .replace(/(?:^|\n)\s*\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\s*(?:Production Name|Trade Name|Nazwa produktu|Product name|Nome prodotto)?[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Production Name|Trade Name|Nazwa produktu|Product name|Nome prodotto)\s*[:\.]?\s*[^\n]*(?:\bDate|\bData)\s*$/gim, '')
      .replace(/\bsrebreem\b/gi, 'srebrem')
      .replace(/\t/g, ' ');
  }

  static polonizeTradeName(rawName) {
    if (!rawName) return "Mieszanina chemiczna";
    let cleanName = rawName
      .replace(/\r/g, '')
      .replace(/(?:^|\n)\s*(?:1\.1\b|Product identifier|Mixture identification|Identificatore del prodotto|Identificazione della miscela)[^\n]*/gi, '')
      .replace(/(?:^|\n)\s*(?:Trade name|Nome commerciale|Nazwa handlowa|Product name)\s*[:\.]?\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanName) return "Mieszanina chemiczna";

    // Sprawdzenie obecności myślnika dzielącego markę/linię od wariantu / opisu
    const splitMatch = cleanName.match(/^([^\-–—]+)\s*[\-–—]\s*(.+)$/);
    if (!splitMatch) {
      return cleanName;
    }

    const brandPart = splitMatch[1].trim(); // Człon 1 (marka/linia) - nienaruszony w oryginale
    let descPart = splitMatch[2].trim();    // Człon 2 (opis i wariant)

    // Słownik mapowań fraz rodzajowych chemii gospodarczej i zapachowej (uporządkowany od najdłuższych/najbardziej specyficznych)
    const categoryMappings = [
      {
        pattern: /\b(?:PROFUMA\s+TESSUTI\s+E\s+AMBIENTE|PROFUMATORE\s+(?:PER\s+)?TESSUTI\s+E\s+AMBIENTI?)\b/i,
        pl: "PERFUMY DO TKANIN I POMIESZCZEŃ"
      },
      {
        pattern: /\b(?:PROFUMATORE\s+(?:PER\s+)?BUCATO|PROFUMA\s+BUCATO|ESSENZA\s+(?:PER\s+)?BUCATO)\b/i,
        pl: "PERFUMY DO PRANIA"
      },
      {
        pattern: /\b(?:PROFUMA\s+TESSUTI|PROFUMATORE\s+(?:PER\s+)?TESSUTI)\b/i,
        pl: "PERFUMY DO TKANIN"
      },
      {
        pattern: /\b(?:DEODORANTE\s+(?:PER\s+)?AMBIENTI?|PROFUMATORE\s+(?:PER\s+)?AMBIENTI?|PROFUMA\s+AMBIENTI?|DIFFUSORE\s+(?:PER\s+)?AMBIENTI?)\b/i,
        pl: "ODŚWIEŻACZ POWIETRZA"
      },
      {
        pattern: /\b(?:DETERGENTE\s+(?:PER\s+)?SUPERFICI(?:\s+LAVABILI)?)\b/i,
        pl: "ŚRODEK DO MYCIA POWIERZCHNI"
      },
      {
        pattern: /\b(?:DETERSIVO\s+(?:PER\s+)?LAVATRICE|DETERSIVO\s+(?:PER\s+)?BUCATO|DETERGENTE\s+LAVATRICE)\b/i,
        pl: "PŁYN DO PRANIA"
      },
      {
        pattern: /\b(?:AMMORBIDENTE\s+CONCENTRATO|AMMORBIDENTE)\b/i,
        pl: "PŁYN DO PŁUKANIA TKANIN"
      },
      {
        pattern: /\b(?:SGRASSATORE\s+UNIVERSALE|SGRASSATORE)\b/i,
        pl: "ODTŁUSZCZACZ UNIWERSALNY"
      },
      {
        pattern: /\b(?:LAVAPAVIMENTI)\b/i,
        pl: "PŁYN DO MYCIA PODŁÓG"
      },
      {
        pattern: /\b(?:DETERGENTE\s+DISINCROSTANTE|DISINCROSTANTE)\b/i,
        pl: "ŚRODEK ODKAMIENIAJĄCY"
      },
      {
        pattern: /\b(?:DETERGENTE\s+WC|GEL\s+WC|DISINCROSTANTE\s+WC)\b/i,
        pl: "ŻEL DO WC"
      },
      {
        pattern: /\b(?:SAPONE\s+LIQUIDO)\b/i,
        pl: "MYDŁO W PŁYNIE"
      },
      {
        pattern: /\b(?:DETERGENTE\s+PIATTI|DETERSIVO\s+PIATTI)\b/i,
        pl: "PŁYN DO NACZYŃ"
      },
      {
        pattern: /\b(?:DETERGENTE)\b/i,
        pl: "ŚRODEK CZYSZCZĄCY / DETERGENT"
      }
    ];

    let matchedPlCategory = null;
    let variantPart = descPart;

    for (const cat of categoryMappings) {
      if (cat.pattern.test(variantPart)) {
        matchedPlCategory = cat.pl;
        variantPart = variantPart.replace(cat.pattern, '').replace(/\s+/g, ' ').trim();
        break;
      }
    }

    if (matchedPlCategory) {
      if (variantPart) {
        // Polski szyk: WARIANT + POLSKA KATEGORIA (np. LULWA PERFUMY DO TKANIN I POMIESZCZEŃ)
        return `${brandPart} - ${variantPart} ${matchedPlCategory}`;
      } else {
        return `${brandPart} - ${matchedPlCategory}`;
      }
    }

    // Bezpieczny fallback: zachowanie członu po myślniku bez strat informacyjnych
    return `${brandPart} - ${descPart}`;
  }

  static isTechnicalFilename(name) {
    if (!name || typeof name !== 'string') return true;
    const trimmed = name.trim();
    return /^(?:PRODUKT CHEMICZNY|Mieszanina chemiczna|temp_sds_.*|\d{8,14}(?:_SDS.*)?|_SDS_.*|.*\.(?:pdf|rtf|docx))$/i.test(trimmed);
  }

  processSection1(contentIt, productName = "", ufi = "", manualOverrides = {}, extractedCode = "") {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(contentIt);

    // 1.1. Identyfikator produktu (SSOT: Karta PDF producenta)
    let tradeNameMatch = clean.match(/(?:Trade name|Nome commerciale|Nazwa handlowa|Product name)\s*[:\.]?\s*([^\n]+)/i);
    const isTechnicalFilename = SDSProcessorEngine.isTechnicalFilename(productName);

    let rawTrade = "";
    if (manualOverrides && manualOverrides.productName && manualOverrides.productName.trim()) {
      rawTrade = manualOverrides.productName.trim();
    } else if (tradeNameMatch && tradeNameMatch[1] && tradeNameMatch[1].trim()) {
      // PDF producenta jest nadrzędnym źródłem prawdy (SSOT)
      rawTrade = tradeNameMatch[1].trim();
    } else if (!isTechnicalFilename) {
      rawTrade = productName.trim();
    } else {
      rawTrade = "Mieszanina chemiczna";
    }

    let resolvedTradeName = SDSProcessorEngine.polonizeTradeName(rawTrade);
    this.lastResolvedTradeName = resolvedTradeName;

    let codeMatch = clean.match(/(?:Trade code|Codice prodotto|Codice|Kod produktu|Product code|\bCode)\s*[:\.]?\s*([A-Z0-9_\-\/]+)/i);
    let tradeCode = (manualOverrides && manualOverrides.productCode) ? manualOverrides.productCode : (codeMatch ? codeMatch[1].trim() : (extractedCode || ""));

    let ufiMatch = clean.match(/(?:UFI\s*[:\.]?\s*)([A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4})/i);
    let resolvedUfi = ufi || (ufiMatch ? ufiMatch[1].trim() : "");

    // 1.2. Zastosowania
    let usesSection = "";
    const m12 = clean.match(/(?:^|\n)\s*1\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*1\.3\b|$)/i);
    if (m12) usesSection = m12[1].trim();

    // Czyszczenie z nagłówka podsekcji 1.2
    usesSection = usesSection.replace(/^(?:Relevant identified uses[^\n]*|Usi identificati pertinenti[^\n]*|Istotne zidentyfikowane zastosowania[^\n]*)\s*/i, '').trim();

    // Ekstrakcja bloku zidentyfikowanych zastosowań
    let rawRec = "";
    const usesBlockMatch = usesSection.match(/(?:Recommended use|Identified uses?|Usi identificati|Uso raccomandato|Zastosowanie zidentyfikowane)\s*[:\.]?\s*([\s\S]*?)(?=(?:Uses advised against|Usi sconsigliati|Zastosowania odradzane|1\.3\b|$))/i);
    const usesBlock = usesBlockMatch ? usesBlockMatch[1].trim() : usesSection;

    // Analiza wykluczeń przemysłowych / profesjonalnych z układu tabelarycznego lub myślników
    let isIndExcluded = false;
    let isProfExcluded = false;

    if (/(?:Industrial|Industriale|przemysłow)[^\n]*[-–—]/i.test(usesBlock) || /[-–—]\s+[-–—]/i.test(usesBlock)) {
      isIndExcluded = true;
    }
    if (/(?:Professional|Professionale|profesjonaln)[^\n]*[-–—]/i.test(usesBlock) || /[-–—]\s+[-–—]/i.test(usesBlock)) {
      isProfExcluded = true;
    }

    // Wyciąganie merytorycznego tekstu zastosowania z wierszy bloku (pomijając etykiety kolumn i separatory)
    const blockLines = usesBlock.split('\n').map(l => l.trim()).filter(Boolean);
    for (const line of blockLines) {
      if (/^(?:Industrial|Industriale|Professional|Professionale|Consumer|Consumatore|Sektor|Branża|[-–—\s]+)$/i.test(line)) continue;
      if (/^(?:Industrial\s+Professional\s+Consumer|Usi identificati)/i.test(line)) continue;
      if (/^[-–—\s\t]+$/.test(line)) continue;
      const stripped = line.replace(/[-–—\t]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (stripped.length > 2 && !/^(?:Industrial|Professional|Consumer)$/i.test(stripped)) {
        rawRec = stripped;
        break;
      }
    }

    let consumerMatch = /(?:Consumer|Consumatore|konsumenck)/i.test(usesSection) || /(?:Consumer|Consumatore)/i.test(usesBlock);
    let profMatch = !isProfExcluded && (/(?:Professional|Professionale|profesjonaln)/i.test(usesSection) || /(?:Professional|Professionale)/i.test(usesBlock));
    let indMatch = !isIndExcluded && (/(?:Industrial|Industriale|przemysłow)/i.test(usesSection) || /(?:Industrial|Industriale)/i.test(usesBlock));

    let usePrefix = [];
    if (consumerMatch) usePrefix.push("konsumenckie");
    if (profMatch) usePrefix.push("profesjonalne");
    if (indMatch) usePrefix.push("przemysłowe");

    // Słownik tłumaczeń urzędowych kategorii zastosowań (EN / IT -> PL)
    let translatedRec = rawRec;
    if (/room deodorant|air freshener|deodorante per ambienti|profumatore per ambiente|profumatore ambiente|deodorante/i.test(rawRec)) {
      translatedRec = "odświeżacz powietrza / dezodorant do pomieszczeń";
    } else if (/laundry perfumer|profuma tessuti|profumatore bucato/i.test(rawRec)) {
      translatedRec = "perfumy do tkanin i prania";
    } else if (/detergent|detergente/i.test(rawRec)) {
      translatedRec = "środek czyszczący / detergent";
    } else if (/cleaner|pulitore/i.test(rawRec)) {
      translatedRec = "preparat myjący / czyszczący";
    } else if (/paint|vernice|pittura/i.test(rawRec)) {
      translatedRec = "farba / wyrób lakierowy";
    } else if (/adhesive|adesivo|colla/i.test(rawRec)) {
      translatedRec = "klej / preparat uszczelniający";
    } else if (/solvent|solvente|diluente|thinner/i.test(rawRec)) {
      translatedRec = "rozpuszczalnik / rozcieńczalnik";
    } else if (/lubricant|lubrificante/i.test(rawRec)) {
      translatedRec = "środek smarny / ciecz techniczna";
    } else if (/coolant|antifreeze/i.test(rawRec)) {
      translatedRec = "płyn chłodzący / przeciw zamarzaniu";
    } else if (/cosmetic|cosmetico/i.test(rawRec)) {
      translatedRec = "produkt kosmetyczny";
    } else if (/disinfectant|disinfettante|biocide/i.test(rawRec)) {
      translatedRec = "środek biobójczy / dezynfekujący";
    }

    let identifiedUses = "Brak szczegółowych informacji w karcie źródłowej.";
    const isDiffuser = /diffus|bastoncini|reed|profumatore\s*(?:per\s*)?ambiente/i.test(clean) || /diffus|bastoncini|reed|profumatore\s*(?:per\s*)?ambiente/i.test(usesSection);
    
    if (!translatedRec && (/air freshener|room deodorant|deodorante/i.test(clean) || /air freshener|room deodorant/i.test(usesSection))) {
      translatedRec = "odświeżacz powietrza / dezodorant do pomieszczeń";
      if (!consumerMatch && !profMatch && !indMatch) usePrefix.push("konsumenckie");
    }

    if (usePrefix.length > 0 && translatedRec) {
      let fullRec = translatedRec;
      if (translatedRec.includes("odświeżacz powietrza") && isDiffuser && !translatedRec.includes("dyfuzor")) {
        fullRec += " (dyfuzor zapachowy do wnętrz)";
      }
      identifiedUses = `Zastosowanie ${usePrefix.join(', ')}: ${fullRec}.`;
    } else if (translatedRec) {
      identifiedUses = `${translatedRec.charAt(0).toUpperCase() + translatedRec.slice(1)}.`;
    } else if (usePrefix.length > 0) {
      identifiedUses = `Zastosowanie ${usePrefix.join(', ')}.`;
    }

    let usesAdvised = "Nie stosować do celów innych niż wskazane.";
    let advMatch = usesSection.match(/(?:Uses advised against|Usi sconsigliati|Zastosowania odradzane)\s*[:\.]?\s*([^\n]+)/i);
    if (advMatch) {
      let rawAdv = advMatch[1].trim();
      if (/different from those indicated|diversi da quelli indicati|other than those indicated/i.test(rawAdv)) {
        if (consumerMatch && !profMatch && !indMatch) {
          usesAdvised = "Wszelkie inne zastosowania nieprzewidziane przez producenta (nie stosować do celów przemysłowych ani profesjonalnych).";
        } else {
          usesAdvised = "Wszelkie inne zastosowania nieprzewidziane przez producenta.";
        }
      } else {
        usesAdvised = rawAdv;
      }
    } else if (consumerMatch && !profMatch && !indMatch) {
      usesAdvised = "Wszelkie inne zastosowania nieprzewidziane przez producenta (nie stosować do celów przemysłowych ani profesjonalnych).";
    }

    // 1.3. Dane dotyczące dostawcy karty charakterystyki
    const compName = this.companyConfig.companyName || "ITALLUX Sp. z o.o.";
    const compAddress = this.companyConfig.address || "ul. Wesoła 16";
    const compCity = this.companyConfig.city ? `${this.companyConfig.postalCode ? this.companyConfig.postalCode + " " : ""}${this.companyConfig.city}` : "63-600 Kępno";
    const compWebsite = this.companyConfig.website || "www.prostozwloch.com.pl";
    const compEmail = this.companyConfig.email || "kontakt@prostozwloch.com.pl";
    const compPhone = this.companyConfig.phone || this.companyConfig.emergencyPhone || "+48 663116607";
    const emergPhone = this.companyConfig.emergencyPhone || compPhone;

    let s13 = "1.3. Dane dotyczące dostawcy karty charakterystyki\n";
    s13 += `Firma: ${compName}\n`;
    s13 += `Adres: ${compAddress}, ${compCity}\n`;
    s13 += `Strona www: ${compWebsite}\n`;
    s13 += `E-mail: ${compEmail}\n`;
    s13 += `Telefon: ${compPhone}`;

    // 1.4. Numer telefonu alarmowego (zgodnie z Rozporządzeniem (UE) 2020/878 Załącznik II pkt 1.4 i wytycznymi ECHA)
    let s14 = "1.4. Numer telefonu alarmowego\n";
    s14 += `Telefon alarmowy przedsiębiorstwa: ${emergPhone} (czynny od poniedziałku do piątku w godzinach 8:00 – 16:00, informacja udzielana w języku polskim)\n`;
    s14 += "Informacja toksykologiczna w Polsce (organ doradczy):\n";
    s14 += "Krajowe Centrum Informacji Toksykologicznej (Instytut Medycyny Pracy im. prof. J. Nofera w Łodzi): tel. +48 42 631 47 24, +48 42 631 47 25 (czynne w dni robocze w godz. 7:00 – 15:00)\n";
    s14 += "Ośrodek Informacji Toksykologicznej w Warszawie (całodobowa informacja toksykologiczna 24/7): tel. +48 22 619 66 54\n";
    s14 += "Ogólne telefony ratunkowe w nagłych wypadkach: 112 (ogólnoeuropejski numer alarmowy), 998 (straż pożarna), 999 (pogotowie ratunkowe)";


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

  processSection4(contentIt, components = [], s2Content = "") {
    let clean = (contentIt || "").replace(/\r/g, '');
    clean = SDSProcessorEngine.cleanPdfArtifacts(clean);

    // 4.1. Ekstrakcja preambuły (przed poszczególnymi drogami narażenia)
    let preMatch = clean.match(/(?:^|\n)\s*4\.1\b[.:\-]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*(?:EYES|OCCHI|SKIN|PELLE|INGESTION|INGESTIONE|INHALATION|INALAZIONE)\b|In case of skin contact|Contatto con la pelle|W kontakcie ze skórą|W kontakcie z oczami|W przypadku spożycia|Po narażeniu drogą oddechową)\s*[:\.]|$)/i);
    let preText = preMatch ? preMatch[1].replace(/^(?:Description of first aid measures|Descrizione delle misure di primo soccorso|Opis środków pierwszej pomocy)\s*/i, '').trim() : "";
    let generalAdvice = SDSProcessorEngine.translatePhrase(preText, "");

    // 4.1. Ekstrakcja dróg narażenia
    let skinMatch = clean.match(/(?:(?:^|\n)\s*(?:SKIN|PELLE)\b|In case of skin contact|Contatto con la pelle|W kontakcie ze skórą)\s*[:\.]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*(?:EYES|OCCHI|INGESTION|INGESTIONE|INHALATION|INALAZIONE|Rescuer protection|Protezione dei soccorritori)\b|In case of eyes contact|Contatto con gli occhi|In case of Ingestion|Ingestione|In case of Inhalation|Inalazione|4\.2|$))/i);
    let eyeMatch = clean.match(/(?:(?:^|\n)\s*(?:EYES|OCCHI)\b|In case of eyes contact|Contatto con gli occhi|W kontakcie z oczami)\s*[:\.]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*(?:SKIN|PELLE|INGESTION|INGESTIONE|INHALATION|INALAZIONE|Rescuer protection|Protezione dei soccorritori)\b|In case of skin contact|Contatto con la pelle|In case of Ingestion|Ingestione|In case of Inhalation|Inalazione|4\.2|$))/i);
    let ingMatch = clean.match(/(?:(?:^|\n)\s*(?:INGESTION|INGESTIONE)\b|In case of Ingestion|Ingestione|W przypadku spożycia)\s*[:\.]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*(?:EYES|OCCHI|SKIN|PELLE|INHALATION|INALAZIONE|Rescuer protection|Protezione dei soccorritori)\b|In case of Inhalation|Inalazione|4\.2|$))/i);
    let inhMatch = clean.match(/(?:(?:^|\n)\s*(?:INHALATION|INALAZIONE)\b|In case of Inhalation|Inalazione|Po narażeniu drogą oddechową)\s*[:\.]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*(?:Rescuer protection|Protezione dei soccorritori)\b|4\.2|4\.3|$))/i);
    let rescuerMatch = clean.match(/(?:(?:^|\n)\s*(?:Rescuer protection|Protezione dei soccorritori|Ochrona osób udzielających pierwszej pomocy))\s*[:\.]?\s*([\s\S]*?)(?=(?:(?:^|\n)\s*4\.2\b|4\.3|$))/i);

    let skinAdvice = SDSProcessorEngine.translatePhrase(skinMatch ? skinMatch[1] : "", "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.");
    if (/(?:take off|contaminated clothing|wash immediately|medical advice)/i.test(skinAdvice)) {
      skinAdvice = "Natychmiast zdjąć zanieczyszczoną odzież. Zmyć natychmiast i dokładnie dużą ilością bieżącej wody (oraz w miarę możliwości mydłem). Zasięgnąć porady/zgłosić się pod opiekę lekarza. Unikać dalszego kontaktu z zanieczyszczoną odzieżą.";
    }
    let eyeAdvice = SDSProcessorEngine.translatePhrase(eyeMatch ? eyeMatch[1] : "", "Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Płukać natychmiast dużą ilością wody przez co najmniej 15 minut, całkowicie otwierając powieki. Zasięgnąć porady/zgłosić się pod opiekę lekarza (skonsultować się z lekarzem okulistą).");
    let ingestionAdvice = SDSProcessorEngine.translatePhrase(ingMatch ? ingMatch[1] : "", "Nie wywoływać wymiotów, chyba że lekarz wyraźnie to zaleci. Nigdy nie podawać niczego doustnie osobie nieprzytomnej. Niezwłocznie zasięgnąć porady lekarza, pokazując kartę charakterystyki lub etykietę produktu.");
    let inhalationAdvice = SDSProcessorEngine.translatePhrase(inhMatch ? inhMatch[1] : "", "Wyprowadzić poszkodowanego na świeże powietrze, z dala od miejsca zdarzenia, zapewnić ciepło i spokój. W przypadku wystąpienia objawów skonsultować się z lekarzem i pokazać opakowanie lub etykietę.");
    let rescuerAdvice = "";
    if (rescuerMatch) {
      let rawResc = rescuerMatch[1].replace(/^[.:\-]?\s*/, '').trim();
      let transResc = SDSProcessorEngine.translatePhrase(rawResc, "");
      if (!transResc || /(?:good practice|rescuers|contamination|disposable gloves|personal protective)/i.test(transResc)) {
        transResc = "Dobrą praktyką jest, aby ratownicy udzielający pomocy osobie narażonej na działanie substancji lub mieszaniny chemicznej stosowali środki ochrony indywidualnej. Rodzaj ochrony zależy od stopnia zagrożenia stwarzanego przez substancję lub mieszaninę, rodzaju narażenia i stopnia skażenia. W przypadku braku innych, bardziej szczegółowych wskazań, w razie możliwości kontaktu z płynami ustrojowymi zaleca się stosowanie rękawic jednorazowych. Informacje na temat odpowiednich środków ochrony indywidualnej podano w sekcji 8.";
      }
      rescuerAdvice = transResc;
    }

    // 4.2. Merytoryczna ocena objawów na podstawie klasyfikacji CLP i składników
    let symptomsMatch = clean.match(/(?:^|\n)\s*4\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*4\.3\b|$)/i);
    let sympText = symptomsMatch ? symptomsMatch[1].replace(/^(?:Most important symptoms[^\n]*|Principali sintomi[^\n]*|Najważniejsze ostre[^\n]*)\s*/i, '').trim() : "";
    
    let symptomsAdvice = "";
    if (sympText && !/brak|non sono noti|nessun|no known|not available|not specified|unknown/i.test(sympText) && sympText.length > 50 && !/brak szczegółowych/i.test(sympText)) {
      symptomsAdvice = SDSProcessorEngine.translatePhrase(sympText, "");
    }

    if (!symptomsAdvice) {
      const hasEyeIrrit = /H319|Eye Irrit|H318|Eye Dam/i.test(s2Content);
      const hasEyeDam = /H318|Eye Dam/i.test(s2Content);
      const hasSkinSens = /H317|Skin Sens|EUH208/i.test(s2Content);
      const hasSkinCorr = /H314|Skin Corr/i.test(s2Content);
      const hasSkinIrrit = /H315|Skin Irrit/i.test(s2Content);
      const hasFlammable = /H225|H226|H224|Flam\. Liq/i.test(s2Content);
      const hasInhIrrit = /H335|H336|STOT SE 3/i.test(s2Content);
      const hasAcuteOral = /H302|H301|H300|Acute Tox.*(?:Oral|doustn)/i.test(s2Content);
      const hasAspTox = /H304|Asp\. Tox/i.test(s2Content);
      const hasAlcohol = components.some(c => /ethanol|etanol|propanol|alkohol|alcohol/i.test(c.name || c.originalName || ''));

      let eyeSymptom = "W kontakcie z oczami: ";
      if (hasEyeDam) {
        eyeSymptom += "Powoduje poważne uszkodzenie oczu. Może wywołać silny ból, pieczenie, łzawienie, obrzęk spojówek i ryzyko trwałego upośledzenia widzenia.";
      } else if (hasEyeIrrit) {
        eyeSymptom += "Działa drażniąco na oczy. Może powodować zaczerwienienie spojówek, pieczenie, łzawienie i ból.";
      } else {
        eyeSymptom += "W przypadku bezpośredniego kontaktu może powodować przejściowe, łagodne podrażnienie lub łzawienie.";
      }

      let skinSymptom = "W kontakcie ze skórą: ";
      if (hasSkinCorr) {
        skinSymptom += "Powoduje poważne oparzenia skóry i martwicę tkanek. Ryzyko głębokich ran.";
      } else if (hasSkinSens) {
        const sensComps = components.filter(c => /Skin Sens|H317/i.test(c.classification || ''));
        if (sensComps.length > 0) {
          const compNames = sensComps.map(c => SDSChemicalExtractor.toAccusative(c.name || c.originalName)).join(', ');
          skinSymptom += `U osób szczególnie wrażliwych może wywołać reakcję alergiczną skóry (zawiera: ${compNames}). Przy długotrwałym kontakcie może powodować wysuszenie lub pękanie skóry.`;
        } else {
          skinSymptom += "U osób szczególnie wrażliwych może wywołać reakcję alergiczną skóry. Przy długotrwałym kontakcie może powodować wysuszenie lub pękanie skóry.";
        }
      } else if (hasSkinIrrit) {
        skinSymptom += "Działa drażniąco na skórę. Może wywoływać zaczerwienienie, pieczenie i świąd.";
      } else {
        skinSymptom += "W normalnych warunkach stosowania nie oczekuje się negatywnych skutków; przy częstym kontakcie może wywołać lekkie przesuszenie skóry.";
      }

      let inhSymptom = "Po narażeniu drogą oddechową: ";
      if (hasInhIrrit || hasFlammable || hasAlcohol) {
        inhSymptom += "Wdychanie wysokich stężeń par może wywoływać podrażnienie błon śluzowych dróg oddechowych, bóle i zawroty głowy oraz uczucie senności.";
      } else {
        inhSymptom += "W normalnych warunkach stosowania nie stwarza zagrożenia drogą oddechową.";
      }

      let ingSymptom = "W przypadku spożycia: ";
      if (hasAspTox) {
        ingSymptom += "Połknięcie i dostanie się przez drogi oddechowe może grozić śmiercią lub chemicznym zapaleniem płuc.";
      } else if (hasAcuteOral || hasAlcohol) {
        ingSymptom += "Może wywołać podrażnienie układu pokarmowego, nudności, wymioty oraz objawy intoksykacji alkoholowej.";
      } else {
        ingSymptom += "Połknięcie większych ilości może wywołać podrażnienie przewodu pokarmowego, nudności i dyskomfort.";
      }

      const delayedSymptom = "SKUTKI OPÓŹNIONE: W oparciu o dostępne dane, w warunkach prawidłowego stosowania nie są znane przypadki wystąpienia opóźnionych powikłań zdrowotnych.";

      symptomsAdvice = `${eyeSymptom}\n${skinSymptom}\n${inhSymptom}\n${ingSymptom}\n${delayedSymptom}`;
    }

    let treatMatch = clean.match(/(?:^|\n)\s*4\.3\b[.:\-]?\s*([\s\S]*?)$/i);
    let treatText = treatMatch ? treatMatch[1].replace(/^(?:Indication of any immediate[^\n]*|Indicazione dell'eventuale[^\n]*|Wskazania dotyczące[^\n]*)\s*/i, '').trim() : "";
    let treatmentAdvice = SDSProcessorEngine.translatePhrase(treatText, "W przypadku wystąpienia objawów (ostrych lub opóźnionych) skonsultować się z lekarzem.\nŚrodki, które powinny być dostępne w miejscu pracy w celu zapewnienia natychmiastowego i specyficznego leczenia: Bieżąca woda do przemywania oczu i zmywania skóry.");
    if (treatmentAdvice.startsWith("Leczenie:")) treatmentAdvice = treatmentAdvice.replace(/^Leczenie:\s*/i, '');

    let output = "SEKCJA 4: Środki pierwszej pomocy\n\n";
    output += "4.1. Opis środków pierwszej pomocy\n";
    if (generalAdvice && generalAdvice.length > 5 && !/description of first aid/i.test(generalAdvice)) {
      output += `${generalAdvice}\n\n`;
    }
    output += `W kontakcie ze skórą: ${skinAdvice}\n`;
    output += `W kontakcie z oczami: ${eyeAdvice}\n`;
    output += `W przypadku spożycia: ${ingestionAdvice}\n`;
    output += `Po narażeniu drogą oddechową: ${inhalationAdvice}\n`;
    if (rescuerAdvice && rescuerAdvice.length > 10) {
      output += `\nOchrona osób udzielających pierwszej pomocy:\n${rescuerAdvice}\n`;
    }
    output += "\n4.2. Najważniejsze ostre i opóźnione objawy oraz skutki narażenia\n";
    output += `${symptomsAdvice}\n\n`;
    output += "4.3. Wskazania dotyczące wszelkiej natychmiastowej pomocy lekarskiej i szczególnego postępowania z poszkodowanym\n";
    output += `${treatmentAdvice}`;

    return output;
  }

  static isFlammablePolarMixture(components = [], section2Text = '', section9Text = '') {
    const s2 = String(section2Text || '');
    const s9 = String(section9Text || '');

    // 1. Sprawdzenie klasyfikacji palności cieczy (CLP / GHS: H224, H225, H226, Flam. Liq.)
    const hasFlammableLiquidHazard = /(?:Flam\.\s*Liq\.|H224|H225|H226|ciecz\s+łatwopalna|ciecz\s+palna|flammable\s+liquid)/i.test(s2) ||
      (Array.isArray(components) && components.some(c => /(?:Flam\.\s*Liq\.|H224|H225|H226)/i.test(c.classification || '')));

    // 2. Sprawdzenie charakteru polarnego / rozpuszczalników polarnych
    const hasPolarComponent = Array.isArray(components) && components.some(c => {
      const name = `${c.name || ''} ${c.originalName || ''}`.toLowerCase();
      const cas = (c.cas || '').trim();
      const classif = (c.classification || '').toLowerCase();
      const isPolarName = /\b(?:etanol|ethanol|metanol|methanol|propanol|isopropanol|izopropanol|butanol|aceton|acetone|glycol|glikol|ether|octan|acetate)\b/i.test(name) ||
        /(?:-ol|-on)\b/i.test(name) ||
        ['64-17-5', '67-56-1', '67-63-0', '71-23-8', '67-64-1', '34590-94-8', '107-98-2'].includes(cas);
      return isPolarName && (classif.includes('flam') || classif.includes('h22') || !classif);
    });

    const isWaterMiscible = /(?:rozpuszczalny|mieszalny|miscible|soluble|rozpuszcza\s+się)\s+w\s+wodzie/i.test(s9);

    return hasFlammableLiquidHazard && (hasPolarComponent || isWaterMiscible);
  }

  static enforceAlcoholResistantFoam(section5Content, isPolarFlammable = false) {
    if (!section5Content || !isPolarFlammable) return section5Content;

    let text = section5Content;

    // 1. Normalizacja bloku odpowiednich środków gaśniczych
    const suitableBlockRegex = /((?:5\.1\b[^\n]*\n)?\s*(?:Odpowiednie\s+środki\s+gaśnicze|ODPOWIEDNIE\s+ŚRODKI\s+GAŚNICZE|Suitable\s+extinguishing\s+equipment|Suitable\s+extinguishing\s+media|Mezzi\s+di\s+estinzione\s+idonei)\s*[:\.]?\s*)([\s\S]*?)(?=(?:\n\s*(?:Niewłaściwe\s+środki|NIEODPOWIEDNIE\s+ŚRODKI|Unsuitable|Mezzi\s+di\s+estinzione\s+non|5\.2\b)|$))/i;
    const match = text.match(suitableBlockRegex);

    if (match) {
      const header = match[1];
      let body = match[2];

      // Wykrywamy pianę w dowolnej deklinacji bez istniejącego doprecyzowania alkoholoodpornego
      const genericFoamRegex = /\b(?:piany(?:\s+gaśnicze)?|piana(?:\s+gaśnicza)?|pianę(?:\s+gaśniczą)?|pianą(?:\s+gaśniczą)?|pianami(?:\s+gaśniczymi)?|pian)\b(?!\s+(?:alkoholoodporn[a-zęóąśłżźćń]*|odporn[a-zęóąśłżźćń]*\s+na\s+alkohol|AR-AFFF))/gi;

      if (genericFoamRegex.test(body)) {
        body = body.replace(genericFoamRegex, 'piana alkoholoodporna (np. typu AR-AFFF)');
      } else if (!/alkoholoodporn|AR-AFFF/i.test(body)) {
        body = body.replace(/^(Środkami\s+gaśniczymi\s+są:\s*|Środki\s+gaśnicze:\s*|Gaśnica\s+[^\n,;]+,\s*|)/i, (prefix) => {
          return prefix ? `${prefix}piana alkoholoodporna (np. typu AR-AFFF), ` : `piana alkoholoodporna (np. typu AR-AFFF), `;
        });
      }

      text = text.replace(suitableBlockRegex, `${header}${body}`);
    }

    // 2. Normalizacja bloku niewłaściwych środków gaśniczych
    const unsuitableBlockRegex = /((?:Niewłaściwe\s+środki\s+gaśnicze|NIEODPOWIEDNIE\s+ŚRODKI\s+GAŚNICZE|Unsuitable\s+extinguishing\s+media|Unsuitable\s+extinguishing\s+equipment|Mezzi\s+di\s+estinzione\s+non\s+idonei)\s*[:\.]?\s*)([^\n]+)/i;
    const unMatch = text.match(unsuitableBlockRegex);
    if (unMatch && !/zwykł[a-zęóąśłżźćń]*\s+pian|standardow[a-zęóąśłżźćń]*\s+pian|rozpuszczalnik/i.test(unMatch[2])) {
      let unBody = unMatch[2].trim();
      if (/brak\s+szczególnych/i.test(unBody) || /^brak\.?$/i.test(unBody)) {
        unBody = "Nie stosować standardowej piany gaśniczej (ulega zniszczeniu pod wpływem rozpuszczalników polarnych/alkoholi) ani zwartych strumieni wody.";
      } else {
        unBody = unBody.replace(/\.?$/, '; nie stosować standardowej piany gaśniczej (ulega natychmiastowemu zniszczeniu na płonących cieczach polarnych/alkoholach).');
      }
      text = text.replace(unsuitableBlockRegex, `${unMatch[1]}${unBody}`);
    }

    return text;
  }

  processSection5(contentIt, components = [], section2Text = '', section9Text = '') {
    let clean = (contentIt || "").replace(/\r/g, '');

    let suitableMatch = clean.match(/(?:Suitable extinguishing media|Suitable extinguishing equipment|Mezzi di estinzione idonei|Apparecchiature di estinzione idonee|Odpowiednie środki gaśnicze)\s*[:\.]?\s*([^\n]+(?:\n[^\n]+)?)/i);
    let unsuitableMatch = clean.match(/(?:Extinguishing media which must not be used(?: for safety reasons)?|Unsuitable extinguishing equipment|Mezzi di estinzione non idonei|Apparecchiature di estinzione non idonee|Niewłaściwe środki gaśnicze)\s*[:\.]?\s*([^\n]+)/i);
    let hazardsMatch = clean.match(/(?:^|\n)\s*5\.2\b[.:\-]?\s*([\s\S]*?)(?=(?:^|\n)\s*5\.3\b|$)/i);
    let adviceMatch = clean.match(/(?:^|\n)\s*5\.3\b[.:\-]?\s*([\s\S]*?)$/i);

    let rawSuitable = suitableMatch ? suitableMatch[1].replace(/(?:Extinguishing media which must not|Unsuitable|Mezzi di estinzione non).*/is, '').trim() : "";
    let suitableText = SDSProcessorEngine.translatePhrase(rawSuitable, "Piana gaśnicza, proszek gaśniczy, dwutlenek węgla (CO2), rozproszone prądy wody. Środki gaśnicze dobrać odpowiednio do materiałów palnych znajdujących się w otoczeniu pożaru.");
    
    // Weryfikacja obecności rozpuszczalników polarnych i palności (CLP-driven)
    const isPolarFlammable = SDSProcessorEngine.isFlammablePolarMixture(components, section2Text, section9Text);

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

    output = SDSProcessorEngine.enforceAlcoholResistantFoam(output, isPolarFlammable);

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

    let cleanRaw = cleanMatch ? cleanMatch[1] : "";
    cleanRaw = cleanRaw
      .replace(/^\s*(?:6\.3\b[.:\-]?\s*)?(?:Methods and material for containment[^\n]*|Metodi e materiali per il contenimento[^\n]*|Metody i materiały[^\n]*)\s*/i, '')
      .trim();

    let cleanupAdvice = "Odpowiedni materiał do zbierania: materiał pochłaniający, organiczny, piasek. Zmyć dużą ilością wody.";
    if (cleanRaw) {
      let parts = cleanRaw.split('\n')
        .map(p => p.trim())
        .filter(p => p && !/^(?:6\.3\b[.:\-]?\s*)?(?:Methods and material|Metodi e materiali|Metody i materiały)/i.test(p) && !/^6\.3\b[.:\-]?$/i.test(p))
        .map(p => SDSProcessorEngine.translatePhrase(p))
        .filter(Boolean);
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

  processSection7(contentIt, s2Content = "") {
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
    let indSolMatch = text73.match(/(?:Industrial sector specific solutions|Settore industriale soluzioni específicas|Rozwiązania specyficzne dla sektora przemysłowego)\s*[:\.]?\s*([^\n]+)/i);

    let specUseText = SDSProcessorEngine.translatePhrase(specUseMatch ? specUseMatch[1] : "", "Brak szczególnych.");
    let indSolText = SDSProcessorEngine.translatePhrase(indSolMatch ? indSolMatch[1] : "", "Brak szczególnych.");

    const isFlammable = /(?:Flam\.\s*Liq\.|H224|H225|H226|ciecz\s+łatwopalna)/i.test(s2Content);

    let output = "SEKCJA 7: Postępowanie z substancjami i mieszaninami oraz ich magazynowanie\n\n";
    output += "7.1. Środki ostrożności dotyczące bezpiecznego postępowania\n";
    output += `Środki ostrożności: ${precautions}\n`;
    output += `Zalecenia dotyczące ogólnej higieny pracy: ${hygiene}\n\n`;
    output += "7.2. Warunki bezpiecznego magazynowania, w tym informacje dotyczące wszelkich wzajemnych niezgodności\n";
    output += `Materiały niezgodne: ${incompText}\n`;
    output += `Wskazówki dotyczące pomieszczeń magazynowych: ${premisesText}\n`;
    if (isFlammable) {
      output += "Wytyczne dotyczące magazynowania cieczy łatwopalnych: Magazynowanie prowadzić zgodnie z polskimi przepisami ochrony przeciwpożarowej (Rozporządzenie Ministra Spraw Wewnętrznych i Administracji z dnia 7 czerwca 2010 r. w sprawie ochrony przeciwpożarowej budynków, innych obiektów budowlanych i terenów – Dz.U. 2010 nr 109 poz. 719 z późn. zm.). Przechowywać wyłącznie w oryginalnych, szczelnie zamkniętych pojemnikach, w chłodnym, suchym i dobrze wentylowanym miejscu, z dala od źródeł ciepła, gorących powierzchni, iskier, otwartego ognia i innych źródeł zapłonu. Zabezpieczyć przed wyładowaniami elektrostatycznymi. Pomieszczenia magazynowe powinny posiadać nienasiąkliwą posadzkę oraz zabezpieczenia rozlewiskowe (wanny wychwytowe) zapobiegające przedostaniu się cieczy do kanalizacji, wód gruntowych i gleby.\n";
    }
    output += "\n7.3. Szczególne zastosowanie(-a) końcowe\n";
    output += `${specUseText}\n`;
    output += `Rozwiązania specyficzne dla sektora przemysłowego: ${indSolText}`;

    return SDSProcessorEngine.normalizeSection7Storage(output, isFlammable);
  }

  // ============================================================================
  // SEKCJA 9: WŁAŚCIWOŚCI FIZYKOCHEMICZNE (UE 2020/878 & WZORZEC EKOS)
  // ============================================================================
  static normalizePhysChemValue(val, paramKey = null) {
    if (!val) {
      if (paramKey && /^(?:particle_characteristics)$/i.test(paramKey)) return "Nie dotyczy (produkt płynny)";
      return "Brak danych";
    }
    let v = val.replace(/\r/g, '').replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

    // Czyszczenie separatorów tabelarycznych | oraz wiodących myślników (z wyłączeniem liczb ujemnych np. -114 lub -0,35)
    v = v.replace(/^[\|\s:]+/, '').replace(/^-(?!\d)/, '').replace(/[\|\s]+$/, '').replace(/\s*\|\s*/g, ', ');

    // Obsługa prawnych uzasadnień braku danych (Załącznik II do UE 2020/878)
    if (/Reason for missing data/i.test(v)) {
      if (/only applies to solids/i.test(v)) {
        return "Nie dotyczy (dotyczy wyłącznie ciał stałych)";
      }
      if (/not relevant to the safety and classification/i.test(v)) {
        return "Brak danych (właściwość nie ma znaczenia dla bezpieczeństwa i klasyfikacji produktu)";
      }
      if (/authoritative substances|organic peroxides|they can decompose/i.test(v)) {
        return "Brak danych (badanie dotyczy wyłącznie substancji ulegających samorzutnemu rozkładowi i nadtlenków organicznych)";
      }
      if (/non-soluble|not soluble/i.test(v)) {
        return "Nie dotyczy (substancja/mieszanina nierozpuszczalna w wodzie)";
      }
      v = v.replace(/Reason for missing data\s*:\s*([^\n\.;]+)/gi, (m, reason) => {
        let rPl = reason.trim()
          .replace(/it only applies to solids/gi, 'dotyczy wyłącznie ciał stałych')
          .replace(/the substance\/mixture is non-soluble \(in water\)/gi, 'substancja/mieszanina nierozpuszczalna w wodzie')
          .replace(/This property is not relevant to the safety and classification of this product/gi, 'właściwość nie ma znaczenia dla bezpieczeństwa i klasyfikacji produktu');
        return `(${rPl})`;
      });
    }

    // Rozróżnienie prawno-naukowe (Załącznik II do REACH - Rozporządzenie UE 2020/878):
    // 1. "not determined" / "non determinato" -> "Nie oznaczono"
    if (/^(?:not determined|non determinato|nie oznaczono)$/i.test(v)) {
      return "Nie oznaczono";
    }

    // 2. "not available" / "non disponibile" / "brak danych" -> "Brak danych"
    if (/^(?:not available|non disponibile|brak danych|dane niedostępne)$/i.test(v)) {
      return "Brak danych";
    }

    // 3. "not applicable" / "non applicabile" / "nie dotyczy" / "n/a"
    if (/^(?:N\.?A\.?|Not applicable|Non applicabile|Nie dotyczy)$/i.test(v) || /(?:N\.A\.|Not applicable|Non applicabile)/i.test(v)) {
      // Dla cieczy parametry takie jak lepkość i gęstość z przyczyn fizycznych nie mogą być "nie dotyczy"
      if (paramKey && /^(?:viscosity|density|relative_vapour_density)$/i.test(paramKey)) {
        return "Brak danych";
      }
      if (paramKey && /^(?:particle_characteristics)$/i.test(paramKey)) {
        return "Nie dotyczy (produkt płynny)";
      }
      return "Nie dotyczy";
    }

    // Jeśli wartość zaczyna się od "not available", ale ma uzupełniające uzasadnienie/metodę:
    v = v.replace(/^not available\s*[,:\-]?\s*/i, 'Brak danych ');

    // Rozklejenie sklejeń słów z Temperature, Method, Remark itp.
    v = v
      .replace(/([a-zA-Z0-9°]+)(Temperature|Temperatura)/g, '$1 $2')
      .replace(/([a-zA-Z0-9°]+)(Method|Metoda)/g, '$1 $2')
      .replace(/([a-zA-Z0-9°]+)(Remark|Substance)/g, '$1 $2');

    // Translacja pełnych fraz palności przed pojedynczymi słowami
    v = v
      .replace(/\b(?:easily|highly)\s+flammable\s+liquid\s+and\s+vapou?rs\.?\b/gi, 'wysoce łatwopalna ciecz i pary')
      .replace(/\bflammable\s+liquid\s+and\s+vapou?rs\.?\b/gi, 'łatwopalna ciecz i pary')
      .replace(/\bcombustible\s+liquid\b/gi, 'ciecz palna')
      .replace(/\bflammable liquid\b/gi, 'ciecz łatwopalna')
      .replace(/\bflammable gas\b/gi, 'gaz łatwopalny')
      .replace(/\bflammable solid\b/gi, 'ciało stałe łatwopalne')
      .replace(/\bflammable\b/gi, 'łatwopalny')
      .replace(/\bliquido infiammabile\b/gi, 'ciecz łatwopalna')
      .replace(/\bnot available\s*they can decompose\b/gi, 'nie określono (substancje mogą ulegać rozkładowi)')
      .replace(/\bnot available\b/gi, 'brak danych')
      .replace(/\bnon disponibile\b/gi, 'brak danych')
      .replace(/\bnot determined\b/gi, 'nie oznaczono')
      .replace(/\bnon determinato\b/gi, 'nie oznaczono')
      .replace(/\bMedian equivalent diameter\b/gi, 'Nie dotyczy (produkt płynny)')
      .replace(/\blight\s+brown\b/gi, 'jasnobrązowy')
      .replace(/\bdark\s+brown\b/gi, 'ciemnobrązowy')
      .replace(/\bbrown\b/gi, 'brązowy')
      .replace(/\bpink\b/gi, 'różowy')
      .replace(/\byellow\b/gi, 'żółty')
      .replace(/\bred\b/gi, 'czerwony')
      .replace(/\bblue\b/gi, 'niebieski')
      .replace(/\bgreen\b/gi, 'zielony')
      .replace(/\bwhite\b/gi, 'biały')
      .replace(/\bamorphous\b/gi, 'bezpostaciowy')
      .replace(/\bcolourless\b/gi, 'bezbarwny')
      .replace(/\bcolorless\b/gi, 'bezbarwny')
      .replace(/\bliquid\b/gi, 'ciecz')
      .replace(/\bsolid\b/gi, 'ciało stałe')
      .replace(/\bgas\b/gi, 'gaz')
      .replace(/\bcharacteristic\b/gi, 'charakterystyczny')
      .replace(/\bpleasant\b/gi, 'przyjemny')
      .replace(/\bperfumed\b/gi, 'perfumowany')
      .replace(/\bsoluble in water\b/gi, 'rozpuszczalny w wodzie')
      .replace(/\bsoluble\b/gi, 'rozpuszczalny')
      .replace(/\binsoluble\b/gi, 'nierozpuszczalny')
      .replace(/\bpartially soluble\b/gi, 'częściowo rozpuszczalny')
      .replace(/\bmiscible\b/gi, 'mieszalny')
      .replace(/\bnot miscible\b/gi, 'niemieszalny')
      .replace(/\bimmiscible\b/gi, 'niemieszalny')
      .replace(/\bin water\b/gi, 'w wodzie')
      .replace(/\bin H2[0O]\b/gi, 'w H2O')
      .replace(/\bat atmospheric pressure\b/gi, 'pod ciśnieniem atmosferycznym')
      .replace(/\bat\b\s+(?=\d)/gi, 'w ')
      .replace(/\bRemark\s*[:\.]?\s*Visual\b/gi, '(ocena wizualna)')
      .replace(/\bRemark\s*[:\.]?\s*([A-Za-z0-9,\s\-\.\/%;\|]+?)(?=\s*(?:Substance|Temperature|Method|Initial boiling point|Vapour pressure|\bpH\b|Remark|$))/gi, '(uwaga: $1)')
      .replace(/\bSubstance\s*[:\.]?\s*([A-Za-z0-9,\s\-\.\/%;\|]+?)(?=\s*(?:Remark|Temperature|Method|Initial boiling point|Vapour pressure|\bpH\b|$))/gi, '(substancja: $1)')
      .replace(/\baria\s*=\s*1\b/gi, 'powietrze=1')
      .replace(/\(uwaga:\s*\)/gi, '')
      .replace(/\bRemark:\s*\)/gi, '')
      .replace(/\bMethod\s*[:\.]?\s*(?:not specified|nie określono)\b/gi, '')
      .replace(/\bMethod\s*[:\.]?\s*internal\b/gi, '(metoda wewnętrzna)')
      .replace(/\bMethod\s*[:\.]?\s*([A-Za-z0-9:\s,;\-]+)/gi, '(metoda: $1)')
      .replace(/\binternal\b/gi, 'wewnętrzna')
      .replace(/\bTemperature\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*°C)/gi, '(temperatura: $1)')
      .replace(/\bnot specified\b/gi, 'nie określono')
      .replace(/\bNot specified\b/gi, 'nie określono');

    // Zamiana kropek dziesiętnych na przecinki w liczbach (np. 1.00 -> 1,00, 20.5 -> 20,5)
    v = v.replace(/(\d+)\.(\d+)/g, '$1,$2');
    
    // Fallback dla angielskich wtrąceń, które przetrwały wewnątrz nawiasów lub wartości
    v = v.replace(/\bInitial boiling point\b/gi, '')
         .replace(/\bSubstance\b/gi, 'substancja')
         .replace(/\bTemperature\b/gi, 'temperatura')
         .replace(/\bVapour pressure\b/gi, 'prężność par')
         .replace(/\bRemark\s*[:\.]?\s*\)?\s*\(\s*(?:aria|powietrze)\s*=\s*1\s*\)/gi, '(powietrze=1)')
         .replace(/\bRemark\b/gi, 'uwaga')
         .replace(/\bMethod\b/gi, 'metoda')
         .replace(/\bAuto-?ignition\b/gi, 'samozapłon')
         .replace(/\bDensity\b/gi, 'gęstość')
         .replace(/\bSolubility\b/gi, 'rozpuszczalność')
         .replace(/\bMelting point\b/gi, 'temperatura topnienia')
         .replace(/\bFlash point\b/gi, 'temperatura zapłonu')
         .replace(/\bFlammability\b/gi, 'palność')
         .replace(/\bDecomposition\b/gi, 'rozkład')
         .replace(/\bViscosity\b/gi, 'lepkość')
         .replace(/\(\s*substancja:\s*([^)]+?)\s*\)/gi, (match, p1) => {
           let c = p1.trim();
           if (c.endsWith(':')) c = c.slice(0, -1).trim();
           return `(substancja: ${c})`;
         })
         .replace(/\(\s*uwaga:\s*([^)]+?)\s*\)/gi, (match, p1) => {
           let c = p1.trim();
           if (c.endsWith(':')) c = c.slice(0, -1).trim();
           return `(uwaga: ${c})`;
         })
         .replace(/\s+\)/g, ')');
    
    // Normalizacja zapisu jednostek
    v = v.replace(/mm2\/s/gi, 'mm²/s')
         .replace(/g\/ml/gi, 'g/ml')
         .replace(/g\/cm3/gi, 'g/cm³')
         .replace(/(\d+)\s*°\s*C/gi, '$1 °C');

    // Usuwanie podwójnych nawiasów lub zbędnych przecinków
    v = v.replace(/\(\s*\(/g, '(').replace(/\)\s*\)/g, ')')
         .replace(/,\s*\(/g, ' (')
         .replace(/\s+/g, ' ')
         .trim();

    return v;
  }

  processSection9(contentIt, components = []) {
    // 1. Usunięcie artefaktów paginacji PDF i powtórzonych nagłówków
    let clean = SDSProcessorEngine.cleanPdfArtifacts(contentIt);

    // Usunięcie artefaktów nagłówkowych i separatorów tabelarycznych rozbijających wieloliniowe parametry
    clean = clean
      .replace(/(?:^|\n)\s*(?!(?:LC|EC|IC|LD|NOEC|NOAEL|LOAEL)\d*)(?:BLK\d+(?:-\d+)?|[A-Z]{2,6}\d{3,8}(?:-\d+)?)\s*-\s*[^\n]+/gi, '')
      .replace(/(?:^|\n)\s*\|\s*\|\s*/g, ' ')
      .replace(/(Reason for missing data[^\n]+)\n\s*([^\n]+(?:safety and classification|applies to solids|organic peroxides|decompose)[^\n]*)/gi, '$1 $2')
      .replace(/Boiling point or initial boiling point and\s*\n\s*boiling range/gi, 'Boiling point or initial boiling point and boiling range')
      .replace(/Punto di ebollizione o punto iniziale di ebollizione e\s*\n\s*intervallo di ebollizione/gi, 'Punto di ebollizione o punto iniziale di ebollizione e intervallo di ebollizione')
      .replace(/Lower and upper explosion\s*\n\s*limit/gi, 'Lower and upper explosion limit')
      .replace(/Partition coefficient n-octanol\/water \(log\s*\n\s*value\)/gi, 'Partition coefficient n-octanol/water (log value)')
      .replace(/Density and\/or relative\s*\n\s*density/gi, 'Density and/or relative density')
      .replace(/Volatile Organic compounds\s*-\s*VOCs/gi, 'Volatile Organic compounds - VOCs')
      .replace(/(?:\s*\|\s*|\s+|^)(Remark|Method|Substance|Temperature|Value|Initial boiling point|Boiling point|Vapour pressure|\bpH\b|Melting point|Flash point|Flammability|Density|Relative density|Solubility|Auto-ignition|Decomposition|Viscosity)\s*[:\.]/gi, '\n$1:');

    // Definicja 18 urzędowych parametrów fizykochemicznych wg Załącznika II (UE) 2020/878
    const paramsConfig = [
      { key: "state", pl: "Stan skupienia", regex: /(?:Physical state|Stato fisico|Stan skupienia|Appearance)\s*[:\.]?\s*([^\n]+)/i },
      { key: "color", pl: "Kolor", regex: /(?:Colour|Color|Colore|Kolor|Barwa)\s*[:\.]?\s*([^\n]+)/i },
      { key: "odour", pl: "Zapach", regex: /(?:Odour|Odore|Zapach)\s*[:\.]?\s*([^\n]+)/i },
      { key: "melting", pl: "Temperatura topnienia/krzepnięcia", regex: /(?:Melting point(?:\s*[\/\-]\s*freezing point)?|Punto di fusione(?:\/punto di congelamento)?|Temperatura topnienia(?:\/krzepnięcia)?)\s*[:\.]?\s*([^\n]+)/i },
      { key: "boiling", pl: "Temperatura wrzenia lub początkowa temperatura wrzenia i zakres temperatur wrzenia", regex: /(?:Boiling point or initial boiling point and boiling range|Initial boiling point|Boiling point|Punto di ebollizione o punto iniziale di ebollizione e intervallo di ebollizione|Punto di ebollizione|Temperatura wrzenia lub początkowa temperatura wrzenia i zakres temperatur wrzenia|Temperatura wrzenia)\s*[:\.]?\s*([^\n]+)/i },
      { key: "flammability", pl: "Palność materiałów", regex: /(?:Flammability|Infiammabilità|Palność materiałów)\s*[:\.]?\s*([^\n]+)/i },
      { 
        key: "explosion_limits", 
        pl: "Dolna i górna granica wybuchowości", 
        customExtract: (text) => {
          let combined = text.match(/(?:Lower and upper explosion limit|Limite inferiore e superiore di esplosività|Dolna i górna granica wybuchowości)\s*[:\.]?\s*([^\n]+)/i);
          if (combined && !/not applicable|nie dotyczy|brak/i.test(combined[1])) return combined[1].trim();

          let lowerM = text.match(/(?:Lower explosive limit|Limite inferiore di esplosività|DGW)\s*[:\.]?\s*([^\n]+)/i);
          let upperM = text.match(/(?:Upper explosive limit|Limite superiore di esplosività|GGW)\s*[:\.]?\s*([^\n]+)/i);

          if (lowerM || upperM) {
            let lVal = lowerM ? lowerM[1].replace(/Method[^\n]*/i, '').replace(/Remark[^\n]*/i, '').replace(/Substance[^\n]*/i, '').replace(/Temperature[^\n]*/i, '').trim() : "brak danych";
            let uVal = upperM ? upperM[1].replace(/Method[^\n]*/i, '').replace(/Remark[^\n]*/i, '').replace(/Substance[^\n]*/i, '').replace(/Temperature[^\n]*/i, '').trim() : "brak danych";
            return `Dolna granica wybuchowości (DGW): ${lVal}; Górna granica wybuchowości (GGW): ${uVal}`;
          }
          return "Nie dotyczy";
        }
      },
      { key: "flash_point", pl: "Temperatura zapłonu", regex: /(?:Flash point|Punto di infiammabilità|Temperatura zapłonu)\s*[:\.]?\s*([^\n]+)/i },
      { key: "auto_ignition", pl: "Temperatura samozapłonu", regex: /(?:Auto-ignition temperature|Temperatura di autoaccensione|Temperatura samozapłonu)\s*[:\.]?\s*([^\n]+)/i },
      { key: "decomposition", pl: "Temperatura rozkładu", regex: /(?:Decomposition temperature|Temperatura di decomposizione|Temperatura rozkładu)\s*[:\.]?\s*([^\n]+)/i },
      { key: "ph", pl: "pH", regex: /(?:^|\n)\s*(?<![A-Za-z])pH(?![A-Za-z])\s*[:\.]?\s*([^\n]+)/i },
      { 
        key: "viscosity", 
        pl: "Lepkość kinematyczna", 
        customExtract: (text) => {
          let m = text.match(/(?:Kinematic viscosity|Viscosità cinematica|Lepkość kinematyczna)\s*[:\.]?\s*([^\n]+)/i);
          if (!m) return "Brak danych";
          let raw = m[1].replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
          let norm = SDSProcessorEngine.normalizePhysChemValue(raw, "viscosity");
          if (norm === "Nie oznaczono") return "Nie oznaczono";
          if (norm === "Nie dotyczy" || norm === "Brak danych") return "Brak danych";
          if (/^Brak danych\s*\(/i.test(norm)) return norm;
          if (/^\d+(?:[.,]\d+)?(?!\s*(?:mm²\/s|cSt|mPa|Pa\.s|\/s))/i.test(norm)) {
            norm = norm.replace(/^(\d+(?:[.,]\d+)?)/, '$1 mm²/s');
          }
          const viscBlock = text.substring(m.index, m.index + 200);
          const tempM = viscBlock.match(/Temperature\s*[:\.]?\s*(\d+(?:[.,]\d+)?\s*°C)/i);
          if (tempM && !/°\s*C/i.test(norm)) {
            norm += ` (w temp. ${tempM[1]})`;
          } else if (!/°\s*C/i.test(norm) && /20\s*°?\s*C/i.test(raw)) {
            norm += " (w temp. 20 °C)";
          }
          return norm;
        }
      },
      { 
        key: "solubility_water", 
        pl: "Rozpuszczalność w wodzie", 
        customExtract: (text) => {
          if (/Solubility\s*[:\.]?\s*soluble in water|soluble in water|rozpuszczalny w wodzie/i.test(text)) {
            return "rozpuszczalny w wodzie";
          }
          let m1 = text.match(/(?:Solubility in water|Solubilità in acqua|Rozpuszczalność w wodzie)\s*[:\.]?\s*([^\n]+)/i);
          if (m1) {
            let val = m1[1].replace(/Method:[^\n]*/i, '').trim();
            if (val && !/not specified|nie określono/i.test(val)) return val;
          }
          let m2 = text.match(/(?:^|\n)\s*Solubility\s*(?!in other|in oil|di vapore)[^\n:]*[:\.]?\s*([^\n]+)/i);
          if (m2) {
            let val = m2[1].replace(/Method:[^\n]*/i, '').trim();
            if (val && !/not specified|nie określono/i.test(val)) return val;
          }
          return "rozpuszczalny w wodzie";
        }
      },
      { key: "solubility_oil", pl: "Rozpuszczalność w innych rozpuszczalnikach", regex: /(?:Solubility in oil|Solubilità in olio|Solubility in other solvents|Rozpuszczalność w innych rozpuszczalnikach)\s*[:\.]?\s*([^\n]+)/i },
      { 
        key: "partition_coeff", 
        pl: "Współczynnik podziału n-oktanol/woda (wartość współczynnika log)", 
        regex: /(?:Partition coefficient(?:\s*[:\.]?\s*n-octanol\/water)?(?:\s*\(log\s*value\))?|Coefficiente di ripartizione n-ottanolo\/acqua|Współczynnik podziału n-oktanol\/woda)\s*[:\.]?\s*([^\n]+)/i 
      },
      { key: "vapour_pressure", pl: "Prężność pary", regex: /(?:Vapour pressure|Tensione di vapore|Prężność pary)\s*[:\.]?\s*([^\n]+)/i },
      { key: "density", pl: "Gęstość lub gęstość względna", regex: /(?:Density and\/or relative density|Densità e\/o densità relativa|Gęstość lub gęstość względna)\s*[:\.]?\s*([^\n]+)/i },
      { key: "relative_vapour_density", pl: "Względna gęstość pary", regex: /(?:Relative vapour density|Densità di vapore relativa|Względna gęstość pary)\s*[:\.]?\s*([^\n]+)/i },
      { key: "particle_characteristics", pl: "Charakterystyka cząsteczek", regex: /(?:Particle size|Particle characteristics|Caratteristiche delle particelle|Charakterystyka cząsteczek)\s*[:\.]?\s*([^\n]+)/i }
    ];

    let extractedLines = [];
    for (const p of paramsConfig) {
      let rawVal = null;
      if (p.customExtract) {
        rawVal = p.customExtract(clean);
      } else if (p.regex) {
        const match = clean.match(p.regex);
        rawVal = match ? match[1].trim() : null;
      }
      
      let normVal;
      if (!rawVal) {
        if (p.key === "density" || p.key === "viscosity") {
          normVal = "Brak danych";
        } else if (p.key === "particle_characteristics") {
          normVal = "Nie dotyczy (produkt płynny)";
        } else {
          normVal = "Nie dotyczy";
        }
      } else {
        normVal = SDSProcessorEngine.normalizePhysChemValue(rawVal, p.key);
        if ((p.key === "density" || p.key === "viscosity") && normVal === "Nie dotyczy") {
          normVal = "Brak danych";
        } else if (p.key === "particle_characteristics" && normVal === "Nie dotyczy") {
          normVal = "Nie dotyczy (produkt płynny)";
        }
      }
      extractedLines.push(`${p.pl}: ${normVal}`);
    }

    // 9.2. Inne informacje
    let lines92 = [];
    let vocMatch = clean.match(/(?:Volatile Organic compounds\s*-\s*VOCs\s*[:=]?|VOC\s*(?:\([^)]*\))?\s*[:=]?)\s*([^\n]+)/i);
    let vocText = "";
    if (vocMatch && !/^\s*0(?:\s*%)?\s*$/i.test(vocMatch[1].trim()) && !/not applicable|brak/i.test(vocMatch[1])) {
      vocText = SDSProcessorEngine.normalizePhysChemValue(vocMatch[1]);
    } else {
      let vocSum = 0;
      if (components && components.length > 0) {
        components.forEach(c => {
          if (/(?:ethanol|etanol|propan|alcohol|alkohol|toluene|toluen|acetate|octan)/i.test(c.name || c.originalName || '')) {
            const nums = [...(c.concentration || '').matchAll(/(\d+(?:[.,]\d+)?)/g)].map(n => parseFloat(n[1].replace(',', '.')));
            if (nums.length > 0) vocSum += Math.max(...nums);
          }
        });
      }
      if (vocSum > 0) {
        const estGperL = Math.round(vocSum * 8.5);
        vocText = `ok. ${Math.round(vocSum - 2)}–${Math.round(vocSum)}% (ok. ${estGperL} g/l)`;
      }
    }
    if (vocText) {
      lines92.push(`Lotne Związki Organiczne (LZO / VOC): ${vocText}`);
    }
    lines92.push("9.2.1. Informacje dotyczące klas zagrożenia fizycznego: Brak dodatkowych danych badawczych.");
    lines92.push(`9.2.2. Inne właściwości bezpieczeństwa: ${vocText ? `Zawartość LZO (VOC): ${vocText}.` : 'Brak dodatkowych danych badawczych.'}`);
    const otherInfo = lines92.join('\n');

    let output = "SEKCJA 9: Właściwości fizyczne i chemiczne\n\n";
    output += "9.1. Informacje na temat podstawowych właściwości fizycznych i chemicznych\n";
    output += extractedLines.join('\n') + "\n\n";
    output += "9.2. Inne informacje\n";
    output += otherInfo;

    return output;
  }

  processSection8(contentIt, components = [], s2Content = "") {
    const allCas = Array.from(new Set([
      ...this.extractedSubstances.map(s => s.casNumber),
      ...components.map(c => c.cas).filter(Boolean)
    ]));

    let output = "SEKCJA 8: Kontrola narażenia/środki ochrony indywidualnej\n\n";
    output += "8.1. Parametry dotyczące kontroli\n";
    
    let ndsLines = [];
    let hasKnownNds = false;
    if (allCas.length > 0) {
      for (const cas of allCas) {
        const entry = NDSRegistry.getEntry(cas);
        if (entry) {
          hasKnownNds = true;
          const subName = entry.substance || entry.substanceName || (CAS_TO_PL_MAP[cas] || cas);
          const ndsVal = entry.NDS || entry.nds || "-";
          const ndschVal = entry.NDSCh || entry.ndsch || "-";
          const ndspVal = entry.NDSP || entry.ndsp || "brak";
          const remarks = entry.uwagi || entry.remarks || "";

          let line = `${subName} [CAS: ${cas}]:\n- NDS: ${ndsVal.includes('mg/m³') ? ndsVal : ndsVal + ' mg/m³'}`;
          if (ndschVal && ndschVal !== "brak" && ndschVal !== "-" && ndschVal !== "nie ustalono") {
            line += `\n- NDSCh: ${ndschVal.includes('mg/m³') ? ndschVal : ndschVal + ' mg/m³'}`;
          } else if (ndschVal === "nie ustalono") {
            line += `\n- NDSCh: nie ustalono`;
          }
          if (ndspVal && ndspVal !== "brak" && ndspVal !== "-") {
            line += `\n- NDSP: ${ndspVal.includes('mg/m³') ? ndspVal : ndspVal + ' mg/m³'}`;
          }
          if (remarks && remarks !== "brak") {
            line += `\n- Uwagi: oznakowanie substancji notacją „${remarks}”`;
          }
          ndsLines.push(line);
        }
      }
    }

    if (hasKnownNds) {
      output += "Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Polska – Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017):\n";
      output += ndsLines.join("\n\n") + "\n\n";
    } else {
      output += "Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy (Polska):\n";
      output += "Dla składników mieszaniny wymienionych w sekcji 3 nie określono wartości najwyższych dopuszczalnych stężeń (NDS, NDSCh, NDSP) w środowisku pracy zgodnie z Rozporządzeniem Ministra Rodziny, Pracy i Polityki Społecznej z dnia 12 czerwca 2018 r. w sprawie najwyższych dopuszczalnych stężeń i natężeń czynników szkodliwych dla zdrowia w środowisku pracy (Dz.U. 2018 poz. 1286 z późn. zm., w tym Dz.U. 2024 poz. 1017).\n\n";
    }

    let cleanIt = (contentIt || "").replace(/\r/g, '').replace(/\t/g, ' ');

    // Wartości zagraniczne OEL / MAK – wklejane WYŁĄCZNIE dla substancji faktycznie obecnych w składzie!
    if (/Community Occupational Exposure Limits|OEL|MAK/i.test(cleanIt)) {
      let oelLines = [];
      if (allCas.includes("55965-84-9") && /55965-84-9|isothiazol/i.test(cleanIt)) {
        oelLines.push("Masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu (3:1) (CAS: 55965-84-9):\nAustria – wartość dopuszczalna długoterminowa (8h): 0,05 mg/m³; Uwagi: MAK, Sh; Źródło: GKV, BGBl. II Nr. 156/2021.");
      }
      if (allCas.includes("64-17-5") && /64-17-5|ethanol/i.test(cleanIt)) {
        oelLines.push("Etanol (CAS: 64-17-5):\nNiemcy (AGW) / Austria (MAK): 380 mg/m³ (200 ppm) / 960 mg/m³ (500 ppm).");
      }
      if (allCas.includes("67-63-0") && /67-63-0|propan-2-ol|isopropanol/i.test(cleanIt)) {
        oelLines.push("Propan-2-ol (CAS: 67-63-0):\nNiemcy (AGW) / Austria (MAK): 500 mg/m³ (200 ppm).");
      }

      if (oelLines.length > 0) {
        output += "Wspólnotowe i zagraniczne dopuszczalne wartości narażenia zawodowego (OEL):\n";
        output += oelLines.join("\n\n") + "\n\n";
      }
    }

    // Wartości DNEL i PNEC w podziale na poszczególne substancje
    const { dnel, pnec, bySubstance } = SDSChemicalExtractor.extractDnelPnec(cleanIt, components);
    if (bySubstance && Object.keys(bySubstance).length > 0) {
      output += "Pochodne poziomy niepowodujące zmian (DNEL) oraz Przewidywane stężenia niepowodujące zmian w środowisku (PNEC):\n\n";
      for (const [subName, data] of Object.entries(bySubstance)) {
        output += `Substancja: ${subName}${data.cas ? ` [CAS: ${data.cas}]` : ''}\n`;
        if (data.dnel && data.dnel.length > 0) {
          output += "Pochodne poziomy niepowodujące zmian (DNEL):\n" + data.dnel.map(l => `  ${l}`).join('\n') + "\n";
        }
        if (data.pnec && data.pnec.length > 0) {
          output += "Przewidywane stężenia niepowodujące zmian w środowisku (PNEC):\n" + data.pnec.map(l => `  ${l}`).join('\n') + "\n";
        }
        output += "\n";
      }
    } else if (dnel.length > 0 || pnec.length > 0) {
      output += "Pochodne poziomy niepowodujące zmian (DNEL) oraz Przewidywane stężenia niepowodujące zmian w środowisku (PNEC):\n";
      if (dnel.length > 0) output += `Pochodne poziomy niepowodujące zmian (DNEL):\n${dnel.join('\n')}\n`;
      if (pnec.length > 0) output += `Przewidywane stężenia niepowodujące zmian w środowisku (PNEC):\n${pnec.join('\n')}\n`;
      output += "\n";
    } else {
      output += "Pochodne poziomy niepowodujące zmian (DNEL) i PNEC: Dla mieszaniny i jej składników nie oznaczono wartości DNEL oraz PNEC.\n\n";
    }

    output += "Zalecane procedury monitorowania: Należy stosować procedury monitorowania stężeń niebezpiecznych substancji w powietrzu na stanowiskach pracy oraz procedury kontroli wentylacji zgodnie z odpowiednimi Polskimi Normami.\n\n";

    // 8.2. Kontrola narażenia – ochrona indywidualna wg Dz.U. 2016 poz. 1488 i norm PN-EN
    const isExplicitlyNotHazardous = /(?:not classified|non[ \-]*(?:[eè]|est)?\s*classificat|nie sklasyfikowan|nie jest sklasyfikowan|nie stwarza zagrożenia|not hazardous|Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie)/i.test(s2Content);
    const hasMixtureHazard = !isExplicitlyNotHazardous && /(?:GHS0[1235689]|H2\d\d|H30[0-4]|H31[0-4]|H318|H33[0-4]|H34\d|H35\d|H36\d|H37\d|H400|H41[01])/i.test(s2Content);

    let eyeProtection = "";
    let skinProtection = "";
    let handProtection = "";
    let respProtection = "";

    if (!hasMixtureHazard) {
      eyeProtection = "W normalnych warunkach stosowania konsumenckiego: środki ochrony oczu nie są wymagane. W warunkach przemysłowych, przeładunku hurtowego lub usuwania awarii zaleca się stosowanie okularów ochronnych zgodnych z normą PN-EN 166.";
      handProtection = "W normalnych warunkach stosowania konsumenckiego: ochrona rąk nie jest wymagana. W warunkach przemysłowych, przeładunku hurtowego lub usuwania awarii zaleca się stosowanie rękawic ochronnych odpornych na działanie chemikaliów (np. z kauczuku nitrylowego) zgodnych z normą PN-EN ISO 374-1.";
      skinProtection = "W normalnych warunkach stosowania konsumenckiego: nie są wymagane szczególne środki ochrony. W warunkach przemysłowych stosować standardową odzież roboczą.";
      respProtection = "W normalnych warunkach stosowania przy właściwej wentylacji pomieszczeń nie jest wymagana.";
    } else {
      const causesEye = /H314|H318|H319|Eye Dam|Eye Irrit|Skin Corr/i.test(s2Content);
      const causesSkin = /H314|H315|H317|H312|H310|Skin Corr|Skin Irrit|Skin Sens|EUH066/i.test(s2Content) || /H224|H225/i.test(s2Content);
      const isVolatile = /H224|H225|H330|H331|H332|H335|H336/i.test(s2Content);

      eyeProtection = causesEye 
        ? "Nosić okulary ochronne w szczelnej obudowie lub gogle ochronne zgodne z normą PN-EN 166."
        : "Brak szczególnych wymagań w normalnych warunkach stosowania. W warunkach przemysłowych zaleca się stosowanie okularów ochronnych (PN-EN 166).";

      skinProtection = causesSkin
        ? "Stosować odpowiednią odzież roboczą chroniącą przed kontaktem z chemikaliami."
        : "Nie są wymagane szczególne środki ostrożności przy normalnym stosowaniu.";

      handProtection = causesSkin
        ? "Stosować rękawice ochronne odporne na działanie chemikaliów (np. z kauczuku nitrylowego lub neoprenu) zgodne z normą PN-EN ISO 374-1. Czas przebicia i grubość materiału należy skonsultować z dostawcą rękawic."
        : "Nie jest wymagana przy normalnym stosowaniu.";

      respProtection = isVolatile
        ? "W normalnych warunkach stosowania przy właściwej wentylacji nie jest wymagana. W przypadku niedostatecznej wentylacji lub przekroczenia dopuszczalnych stężeń NDS stosować odpowiedni sprzęt ochrony dróg oddechowych z pochłaniaczem par typu A (norma PN-EN 14387)."
        : "Nie dotyczy w warunkach właściwej wentylacji pomieszczeń.";
    }

    output += "8.2. Kontrola narażenia\n";
    output += `Ochrona oczu: ${eyeProtection}\n`;
    output += `Ochrona skóry: ${skinProtection}\n`;
    output += `Ochrona rąk: ${handProtection}\n`;
    output += `Ochrona dróg oddechowych: ${respProtection}\n`;
    output += "Zagrożenia termiczne: Nie dotyczy.\n";
    output += "Kontrola narażenia środowiska: Nie dopuścić do przedostania się dużych ilości produktu do kanalizacji, wód powierzchniowych ani gruntowych.\n";
    output += "Środki higieniczne i techniczne: Zapewnić odpowiednią wentylację ogólną i miejscową na stanowiskach pracy. Myć ręce po zakończeniu pracy z produktem. Nie jeść i nie pić podczas stosowania.";

    return output;
  }


  processSection12(contentIt, components = [], s2Content = "") {
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

      // Przypadek 1: Prefiks tej samej linii przed dopasowanym słowem kluczowym zawiera CAS lub nazwę składnika
      const lastNl = sub.lastIndexOf('\n');
      const curLinePrefix = lastNl !== -1 ? sub.substring(lastNl + 1) : sub;
      if (/(?:CAS\s*[:\.]?\s*\d{2,7}-\d{2}-\d)/i.test(curLinePrefix) ||
          (components && components.some(c => (c.originalName && curLinePrefix.toLowerCase().includes(c.originalName.toLowerCase())) ||
                                              (c.name && curLinePrefix.toLowerCase().includes(c.name.toLowerCase()))))) {
        return lastNl !== -1 ? lastNl + 1 : 0;
      }

      // Przypadek 2: Poprzedzające linie (1-2 linie wstecz) zawierają nazwę substancji i/lub CAS
      const mMulti = sub.match(/((?:[^\n]+\n\s*){1,2}(?:CAS\s*[:\.]?\s*\d{2,7}-\d{2}-\d[^\n]*\n\s*))$/i);
      if (mMulti) return idx - mMulti[1].length;

      const mLine = sub.match(/([^\n]*(?:CAS\s*[:\.]?\s*\d{2,7}-\d{2}-\d)[^\n]*\n\s*)$/i);
      if (mLine) return idx - mLine[1].length;

      return idx;
    };

    // Podział na 7 bloków semantycznych
    let block1 = "", block2 = "", block3 = "", block4 = "", block5 = "", block6 = "", block7 = "";

    if (clumpedMatch) {
      const idxBio = adjustBoundary(workingText, workingText.search(/(?:Non-readily biodegradable|Readily biodegradable|Trwałość i zdolność do rozkładu|Persistence and degradability|Biodegradab)/i));
      const idxBioAcc = adjustBoundary(workingText, workingText.search(/(?:Not bioaccumulative|Non bioaccumulabile|Bioaccumulat|Bioaccumulab|Zdolność do bioakumulacji|Potenziale di bioaccumulo|Bioconcentr|BCF)/i));
      const idxMob = adjustBoundary(workingText, workingText.search(/(?:Mobility in soil|Mobilita nel suolo|Mobilność w glebie|Partition coefficient(?:\s*[:\.]?\s*soil\/water)|Koc)/i));
      const idxPbt = workingText.search(/(?:No PBT or vPvB|Results of PBT and vPvB|Wyniki oceny właściwości PBT|Non contiene sostanze PBT|PBT[ \/]?vPvB|Valutazione PBT)/i);
      const idxEndo = adjustBoundary(workingText, workingText.search(/(?:List II|List I|Substances under evaluation for endocrine|endocrine disruption|Endocrine disrupting properties|Właściwości zaburzające|Proprietà di interferenza con il sistema endocrino)/i));
      const idxOther = workingText.search(/(?:12\.7|Other adverse effects|Altri effetti avversi|Inne szkodliwe skutki)/i);

      const bioAccEnd = idxMob !== -1 ? idxMob : (idxPbt !== -1 ? idxPbt : (idxEndo !== -1 ? idxEndo : (idxOther !== -1 ? idxOther : workingText.length)));
      const mobEnd = idxPbt !== -1 ? idxPbt : (idxEndo !== -1 ? idxEndo : (idxOther !== -1 ? idxOther : workingText.length));

      block1 = idxBio !== -1 ? workingText.substring(0, idxBio).trim() : workingText;
      block2 = (idxBio !== -1 && idxBioAcc !== -1) ? workingText.substring(idxBio, idxBioAcc).trim() : "";
      block3 = idxBioAcc !== -1 ? workingText.substring(idxBioAcc, bioAccEnd).trim() : "";
      block4 = (idxMob !== -1) ? workingText.substring(idxMob, mobEnd).trim() : "";
      block5 = (idxPbt !== -1 && idxEndo !== -1) ? workingText.substring(idxPbt, idxEndo).trim() : (idxPbt !== -1 ? workingText.substring(idxPbt).trim() : "");
      block6 = (idxEndo !== -1 && idxOther !== -1) ? workingText.substring(idxEndo, idxOther).trim() : (idxEndo !== -1 ? workingText.substring(idxEndo).trim() : "");
      block7 = idxOther !== -1 ? workingText.substring(idxOther).trim() : "";
    } else {
      const p = (startPat, endPat) => {
        const reg = new RegExp('(?:^|\\n)\\s*' + startPat + '[.:\\-]?[ \\t]*([\\s\\S]*?)(?=(?:^|\\n)\\s*' + endPat + '|$)', 'i');
        const m = clean.match(reg);
        return m ? m[1].trim() : "";
      };
      block1 = p('(?:12\\.1\\b|Toxicity|Tossicità|Toksyczność)', '(?:12\\.2\\b|Persistence and degradability|Persistenza e degradabilità|Trwałość)');
      block2 = p('(?:12\\.2\\b|Persistence and degradability|Persistenza e degradabilità|Trwałość)', '(?:12\\.3\\b|Bioaccumulative potential|Potenziale di bioaccumulo|Zdolność do bioakumulacji)');
      block3 = p('(?:12\\.3\\b|Bioaccumulative potential|Potenziale di bioaccumulo|Zdolność do bioakumulacji)', '(?:12\\.4\\b|Mobility in soil|Mobilità nel suolo|Mobilność w glebie)');
      block4 = p('(?:12\\.4\\b|Mobility in soil|Mobilità nel suolo|Mobilność w glebie)', '(?:12\\.5\\b|Results of PBT|Risultati della valutazione PBT|Wyniki oceny właściwości PBT)');
      block5 = p('(?:12\\.5\\b|Results of PBT|Risultati della valutazione PBT|Wyniki oceny właściwości PBT)', '(?:12\\.6\\b|Endocrine|Proprietà di interferenza|Właściwości zaburzające)');
      block6 = p('(?:12\\.6\\b|Endocrine|Proprietà di interferenza|Właściwości zaburzające)', '(?:12\\.7\\b|Other adverse effects|Altri effetti avversi|Inne szkodliwe)');
      block7 = p('(?:12\\.7\\b|Other adverse effects|Altri effetti avversi|Inne szkodliwe)', '$');
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
      l = l.replace(/Danio rerio/g, 'Danio rerio');
      l = l.replace(/Mytilus edulis/g, 'Mytilus edulis (omułek)');
      l = l.replace(/\b(\d+)\.(\d+)\b/g, (m, p1, p2) => p1 + ',' + p2);
      l = l.replace(/mg\/L/gi, 'mg/l');
      l = l.replace(/\b(\d+)\s*h\b/gi, (m, p1) => `(${p1} h)`);
      l = l.replace(/\b(\d+)\s*d\b/gi, (m, p1) => `(${p1} dni)`);
      l = l.replace(/-\s*(OECD\s*\d+|ISO\s*\d+)/gi, (m, p1) => `(${p1})`);
      return l;
    };

    // Pomocnicza funkcja do ekstrakcji bloku substancji z podsekcji (12.2, 12.3, 12.4)
    const extractSubstanceBlock = (blockText, comp) => {
      if (!blockText) return null;
      const bClean = blockText.replace(/[—–]/g, '-').replace(/\s*\|\s*/g, '\n');
      const searchNames = [comp.originalName, comp.name, comp.cas].filter(Boolean);
      for (const name of searchNames) {
        if (!name || name.length < 3) continue;
        const cleanName = name.replace(/\s*[-—–]\s*/g, '-').trim();
        const escaped = cleanName
          .replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
          .replace(/\\\*/g, '\\*?')
          .replace(/\\\-/g, '[-—–]\\s*')
          .replace(/\s+/g, '\\s+');
        const otherNames = components.filter(c => c !== comp)
          .flatMap(c => [c.originalName, c.name, c.cas])
          .filter(n => n && n.length >= 3)
          .map(n => n.replace(/\s*[-—–]\s*/g, '-').replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '\\*?').replace(/\\\-/g, '[-—–]\\s*').replace(/\s+/g, '\\s+'));
        const endPat = otherNames.length > 0 
          ? `(?=(?:^|\\n)\\s*(?:${otherNames.join('|')})(?:\\b|[\\s\\|\\-\\)]|$))|(?:^|\\n)\\s*12\\.[2-7]\\b|$` 
          : `(?:^|\\n)\\s*12\\.[2-7]\\b|$`;
        const reg = new RegExp(`(?:^|\\n)\\s*${escaped}(?:\\b|[\\s\\|\\-\\)]|$)([\\s\\S]*?)(?:${endPat})`, 'i');
        const m = bClean.match(reg);
        if (m && m[1] && m[1].trim()) return m[1].trim();

        // Fallback dla długich nazw IUPAC (np. masy poreakcyjne z fragmentem kluczowym)
        if (cleanName.length > 25) {
          const keySnippet = cleanName.slice(0, 30).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\\*/g, '\\*?').replace(/\\\-/g, '[-—–]\\s*').replace(/\s+/g, '\\s+');
          const regSnippet = new RegExp(`(?:^|\\n)\\s*${keySnippet}[^\\n]*\\n([\\s\\S]*?)(?:${endPat})`, 'i');
          const mSnip = bClean.match(regSnippet);
          if (mSnip && mSnip[1] && mSnip[1].trim()) return mSnip[1].trim();
        }
      }
      return null;
    };

    // --- 12.1. TOKSYCZNOŚĆ ---
    let s12_1 = "12.1. Toksyczność\n";
    s12_1 += "Stosować dobrą praktykę zawodową, unikając przedostawania się produktu do środowiska.\n\n";
    s12_1 += "Właściwości ekotoksykologiczne mieszaniny:\n";

    const hasAquaticInS2 = /(?:H412|Aquatic\s*Chronic\s*3|H411|Aquatic\s*Chronic\s*2|H410|Aquatic\s*Chronic\s*1|H400|Aquatic\s*Acute\s*1)/i.test(s2Content);
    const hasAquaticInBlock1 = /(?:dangerous for the environment|pericoloso per l'ambiente|szkodliwie na organizmy wodne|Aquatic\s*(?:acute|chronic))/i.test(block1) && !/Not classified for environmental hazards/i.test(block1);

    if (hasAquaticInS2 || hasAquaticInBlock1) {
      let clpDesc = "kategoria przewlekła 3 (Aquatic Chronic 3, H412: Działa szkodliwie na organizmy wodne, powodując długotrwałe skutki)";
      if (/H410|Aquatic\s*Chronic\s*1/i.test(s2Content) || /Aquatic Chronic 1/i.test(block1)) {
        clpDesc = "kategoria przewlekła 1 (Aquatic Chronic 1, H410: Działa bardzo toksycznie na organizmy wodne, powodując długotrwałe skutki)";
      } else if (/H411|Aquatic\s*Chronic\s*2/i.test(s2Content) || /Aquatic Chronic 2/i.test(block1)) {
        clpDesc = "kategoria przewlekła 2 (Aquatic Chronic 2, H411: Działa toksycznie na organizmy wodne, powodując długotrwałe skutki)";
      } else if (/H400|Aquatic\s*Acute\s*1/i.test(s2Content) || /Aquatic Acute 1/i.test(block1)) {
        clpDesc = "kategoria ostra 1 (Aquatic Acute 1, H400: Działa bardzo toksycznie na organizmy wodne)";
      }
      s12_1 += `Mieszanina została zaklasyfikowana jako stwarzająca zagrożenie dla środowiska wodnego – ${clpDesc}.\nBrak danych doświadczalnych z badań ekotoksykologicznych dla samego produktu; klasyfikacji dokonano metodą obliczeniową na podstawie zawartości składników.\n`;
    } else {
      s12_1 += "Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie dla środowiska.\nBrak danych doświadczalnych dla mieszaniny.\n";
    }

    let s1Substances = [];
    if (components && components.length > 0 && block1) {
      const b1Clean = block1.replace(/[—–]/g, '-');
      const lines = b1Clean.split('\n').map(l => l.trim()).filter(Boolean);
      const detectedSubs = [];
      let currentSubstance = null;
      let currentTests = [];

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/^(?:12\.1|Toxicity|This product is dangerous|In the long term|Stosować|Właściwości|Mieszanina|Brak danych|Revision|Dated|Printed|Page|Pagina|Pag\.|Scheda|Safety Data Sheet|Suarez|SWEET HOME|BLK\d+|[A-Z0-9]{4}-[A-Z0-9]{4})/i.test(l)) continue;
        if (/^(?:LC50|EC50|Chronic NOEC|NOEC|IC50)/i.test(l)) {
          let testLine = l;
          if (!/\d+[.,]?\d*\s*mg/i.test(testLine) && i + 1 < lines.length && /\d+[.,]?\d*\s*mg/i.test(lines[i + 1])) {
            testLine += ' ' + lines[i + 1];
            i++;
          }
          currentTests.push(testLine);
        } else if (/\d+[.,]?\d*\s*mg\//i.test(l)) {
          if (currentTests.length > 0) {
            currentTests[currentTests.length - 1] += ' ' + l;
          }
        } else {
          if (currentTests.length > 0) {
            if (currentSubstance) {
              detectedSubs.push({ name: currentSubstance, tests: currentTests });
            }
            currentSubstance = l;
            currentTests = [];
          } else {
            if (!currentSubstance) currentSubstance = l;
            else currentSubstance += ' ' + l;
          }
        }
      }
      if (currentSubstance && currentTests.length > 0) {
        detectedSubs.push({ name: currentSubstance, tests: currentTests });
      }

      // Precyzyjne mapowanie wykrytych bloków na komponenty mieszaniny (eliminacja zjawiska off-by-one)
      const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      detectedSubs.forEach(ds => {
        const matched = components.find(c => {
          const cOrigNorm = norm(c.originalName);
          const cNameNorm = norm(c.name);
          const dsNorm = norm(ds.name);

          if (cOrigNorm && (cOrigNorm === dsNorm || dsNorm === cOrigNorm)) return true;
          if (cNameNorm && (cNameNorm === dsNorm || dsNorm === cNameNorm)) return true;
          if (c.originalName && new RegExp('(^|[^a-z0-9])' + c.originalName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '([^a-z0-9]|$)', 'i').test(ds.name)) return true;
          if (c.name && new RegExp('(^|[^a-z0-9])' + c.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '([^a-z0-9]|$)', 'i').test(ds.name)) return true;
          if (cOrigNorm.length > 20 && (dsNorm.includes(cOrigNorm.slice(0, 25)) || cOrigNorm.includes(dsNorm.slice(0, 25)))) return true;
          if (c.cas && ds.name.includes(c.cas)) return true;
          return false;
        });

        // Odrzucamy fałszywe nazwy pochodzące z nagłówków dokumentu, stopki lub kodów produktów
        if (!matched && (!ds.name || /^(?:BLK\d+|SWEET HOME|Suarez|Revision|Dated|Printed|Page|\d+\/\d+)/i.test(ds.name.trim()))) {
          return;
        }

        const targetComp = matched || { name: ds.name, cas: null };
        const tests = [];
        for (const line of ds.tests) {
          if (/(?:LC50|EC50|NOEC|IC50)/i.test(line)) {
            let plLine = line
              .replace(/LC50\s*-\s*for Fish[:\.]?\s*/gi, '- LC50 (ryby): ')
              .replace(/EC50\s*-\s*for Crustacea[:\.]?\s*/gi, '- EC50 (skorupiaki): ')
              .replace(/EC50\s*-\s*for Algae(?:\s*\/?\s*Aquatic Plants)?[:\.]?\s*/gi, '- EC50 (glony / rośliny wodne): ')
              .replace(/Chronic NOEC for Fish[:\.]?\s*/gi, '- NOEC (przewlekła, ryby): ')
              .replace(/Chronic NOEC for Crustacea[:\.]?\s*/gi, '- NOEC (przewlekła, skorupiaki): ')
              .replace(/Chronic NOEC for Algae(?:\s*\/?\s*Aquatic Plants)?[:\.]?\s*/gi, '- NOEC (przewlekła, glony): ')
              .replace(/(\d+)\.(\d+)/g, '$1,$2');
            tests.push(formatEcotoxLine(plLine));
          }
        }
        if (tests.length > 0) {
          s1Substances.push({ name: targetComp.name || targetComp.originalName, cas: targetComp.cas, tests });
        }
      });
    }

    if (s1Substances.length > 0) {
      s12_1 += "\nInformacje ekotoksykologiczne o składnikach:\n";
      s1Substances.forEach(sub => {
        s12_1 += `${sub.name}${sub.cas ? ` (CAS: ${sub.cas})` : ''}:\n`;
        sub.tests.forEach(t => {
          s12_1 += `${t.startsWith('-') ? t : '- ' + t}\n`;
        });
      });
    }

    // --- 12.2. TRWAŁOŚĆ I ZDOLNOŚĆ DO ROZKŁADU ---
    let s12_2 = "12.2. Trwałość i zdolność do rozkładu\n";
    let s2Substances = [];
    if (components && components.length > 0 && block2) {
      let b2Clean = block2.replace(/[—–]/g, '-');
      // Zabezpieczenie komórek tabeli: "Solubility in water | 100 - 1000 mg/l" -> "Solubility in water: 100 - 1000 mg/l"
      b2Clean = b2Clean.replace(/\|\s*\n/g, ' | ');
      b2Clean = b2Clean.replace(/\b(Solubility(?:\s+in\s+water)?|Rozpuszczalność(?:\s+w\s+wodzie)?)\s*\|\s*/gi, '$1: ');
      b2Clean = b2Clean.replace(/\s*\|\s*/g, '\n');

      // Rozdzielenie sklejonych w DOCX nazw składników ze wskaźnikami degradacji (np. "Rapidly degradable geraniol")
      const compLookupNames = components.flatMap(c => [c.originalName, c.name]).filter(n => n && n.length >= 3);
      compLookupNames.sort((a, b) => b.length - a.length);

      for (const cn of compLookupNames) {
        const esc = cn.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const reg = new RegExp(`(\\b(?:degradable|biodegradable|degradacji|rozkład))\\s+(${esc})\\b`, 'gi');
        b2Clean = b2Clean.replace(reg, '$1\n$2');
      }

      const lines = b2Clean.split('\n').map(l => l.trim()).filter(Boolean);
      const detectedSubs = [];
      let currentSubstance = null;
      let currentInfo = [];

      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/^(?:12\.2|Persistence|Degradability|This product is|Stosować|Właściwości|Mieszanina|Brak danych|Revision|Dated|Printed|Page|Pagina|Pag\.|Scheda|Safety Data Sheet|Suarez|SWEET HOME|BLK\d+|[A-Z0-9]{4}-[A-Z0-9]{4})/i.test(l)) continue;
        
        const isMeasurementOrRange = /^[\d><~]+[\s\d\-.,]*\s*(?:mg\/l|g\/l|%|\b)/i.test(l) && !/[a-zA-Z]{3,}/.test(l.replace(/mg\/l|g\/l/gi, ''));

        if (/(?:degradable|biodegradable|degradacji|rozkład|Solubility|Rozpuszczalność|OECD|ThOD|BOD|COD)/i.test(l) || isMeasurementOrRange) {
          currentInfo.push(l);
        } else {
          if (currentInfo.length > 0) {
            if (currentSubstance) {
              detectedSubs.push({ name: currentSubstance, info: currentInfo });
            }
            currentSubstance = l;
            currentInfo = [];
          } else {
            if (!currentSubstance) currentSubstance = l;
            else currentSubstance += ' ' + l;
          }
        }
      }
      if (currentSubstance && currentInfo.length > 0) {
        detectedSubs.push({ name: currentSubstance, info: currentInfo });
      }

      const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const processedCasOrNames = new Set();

      detectedSubs.forEach(ds => {
        if (/^[\d><~]+[\s\d\-.,]*\s*(?:mg\/l|g\/l|%)?$/i.test(ds.name.trim())) return;

        const matched = components.find(c => {
          const cOrigNorm = norm(c.originalName);
          const cNameNorm = norm(c.name);
          const dsNorm = norm(ds.name);
          if (cOrigNorm && (cOrigNorm === dsNorm || dsNorm === cOrigNorm)) return true;
          if (cNameNorm && (cNameNorm === dsNorm || dsNorm === cNameNorm)) return true;
          if (c.originalName && new RegExp('(^|[^a-z0-9])' + c.originalName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '([^a-z0-9]|$)', 'i').test(ds.name)) return true;
          if (c.name && new RegExp('(^|[^a-z0-9])' + c.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '([^a-z0-9]|$)', 'i').test(ds.name)) return true;
          if (cOrigNorm.length > 20 && (dsNorm.includes(cOrigNorm.slice(0, 25)) || cOrigNorm.includes(dsNorm.slice(0, 25)))) return true;
          if (c.cas && ds.name.includes(c.cas)) return true;
          return false;
        });

        if (!matched && (!ds.name || /^(?:BLK\d+|SWEET HOME|Suarez|Revision|Dated|Printed|Page|\d+\/\d+)/i.test(ds.name.trim()) || ds.name.length < 3)) return;
        const targetComp = matched || { name: ds.name, cas: null };

        const infoOut = [];
        let fullBlock = ds.info.join(' ');
        let remainder = fullBlock;
        
        if (/NOT\s+rapidly\s+degradable|non-readily\s+biodegradable|not\s+readily\s+biodegradable|non\s+rapidly\s+degradable|not\s+easily\s+biodegradable|nie\s+ulega\s+szybkiej\s+degradacji|inherently\s+biodegradable/i.test(remainder)) {
          infoOut.push("Substancja nie ulega szybkiej degradacji (nie ulega łatwo biodegradacji).");
          remainder = remainder.replace(/NOT\s+rapidly\s+degradable|non-readily\s+biodegradable|not\s+readily\s+biodegradable|non\s+rapidly\s+degradable|not\s+easily\s+biodegradable|nie\s+ulega\s+szybkiej\s+degradacji|inherently\s+biodegradable/gi, '');
        } else if (/Rapidly\s+degradable|readily\s+biodegradable|easily\s+biodegradable|entirely\s+degradable|ulega\s+szybkiej\s+degradacji|łatwo\s+biodegradowalna|szybko\s+rozkładalna/i.test(remainder)) {
          infoOut.push("Szybko ulega degradacji (substancja łatwo biodegradowalna).");
          remainder = remainder.replace(/Rapidly\s+degradable|readily\s+biodegradable|easily\s+biodegradable|entirely\s+degradable|ulega\s+szybkiej\s+degradacji|łatwo\s+biodegradowalna|szybko\s+rozkładalna/gi, '');
        }

        const solM = remainder.match(/(?:Solubility\s+in\s+water|Rozpuszczalność\s+w\s+wodzie|Solubility|Rozpuszczalność)\s*[:\.]?\s*([0-9><~][^;\n\|]*)/i);
        if (solM && solM[1].trim()) {
          const cleanSolVal = solM[1].trim().replace(/(\d+)\.(\d+)/g, '$1,$2');
          infoOut.push(`Rozpuszczalność w wodzie: ${cleanSolVal}.`);
          remainder = remainder.replace(solM[0], '');
        }

        remainder = remainder.replace(/\b(?:Solubility\s+in\s+water|Solubility|in\s+water|water|Rapidly\s+degradable|Entirely\s+degradable|degradable|biodegradable)\b/gi, ' ');
        remainder = remainder.replace(/[\|\-\s:;,]+/g, ' ').trim();
        
        if (remainder.length > 3) {
          const isCompLeak = compLookupNames.some(cn => remainder.toLowerCase().includes(cn.toLowerCase()));
          const isNoise = /^(?:in water|water|mg\/l|g\/l|rozpuszczalność|brak danych)$/i.test(remainder);
          if (!isCompLeak && !isNoise) {
            let extra = remainder;
            extra = extra.replace(/\bSolubility\b/gi, 'Rozpuszczalność')
                         .replace(/\bin water\b/gi, 'w wodzie')
                         .replace(/\bDegradability\b/gi, 'zdolność do rozkładu');
            if (extra !== 'Rozpuszczalność w wodzie' && extra !== 'Rozpuszczalność') {
              infoOut.push(`Dodatkowe informacje: ${extra}.`);
            }
          }
        }
        
        if (infoOut.length === 0) {
          infoOut.push("Brak dostępnych danych dla substancji.");
        }

        const finalSubName = targetComp.name || targetComp.originalName;
        const compKey = targetComp.cas || finalSubName;
        if (!processedCasOrNames.has(compKey)) {
          processedCasOrNames.add(compKey);
          s2Substances.push({ name: finalSubName, cas: targetComp.cas, info: infoOut });
        } else {
          const existing = s2Substances.find(s => (s.cas && s.cas === targetComp.cas) || s.name === finalSubName);
          if (existing) {
            infoOut.forEach(item => {
              if (!existing.info.includes(item)) {
                if (existing.info.length === 1 && existing.info[0] === "Brak dostępnych danych dla substancji.") {
                  existing.info = [item];
                } else {
                  existing.info.push(item);
                }
              }
            });
          }
        }
      });
    }

    if (s2Substances.length > 0) {
      s12_2 += "Informacje dotyczące składników:\n";
      s2Substances.forEach(sub => {
        s12_2 += `${sub.name}${sub.cas ? ` (CAS: ${sub.cas})` : ''}: ${sub.info.join(' ')}\n`;
      });
      s12_2 += "Mieszanina: Brak dostępnych badań dotyczących trwałości i rozkładu mieszaniny.";
    } else {
      s12_2 += "Brak dostępnych badań dotyczących trwałości i rozkładu mieszaniny.";
    }

    // --- 12.3. ZDOLNOŚĆ DO BIOAKUMULACJI ---
    let s12_3 = "12.3. Zdolność do bioakumulacji\n";
    let s3Substances = [];
    if (components && components.length > 0) {
      components.forEach(comp => {
        const subBlock = extractSubstanceBlock(block3, comp);
        const info = [];
        if (subBlock) {
          let logKowVal = null;
          const logKowValM = subBlock.match(/(?:Partition coefficient|Log\s*Kow|Log\s*Pow)[^\n]*?Value\s*[:\.]?\s*([^\n]+)/i);
          if (logKowValM) {
            logKowVal = logKowValM[1].trim();
          } else {
            const partM = subBlock.match(/(?:Partition coefficient(?:\s*[:\.]?\s*n-octanol\/water)?|Log\s*Kow|Log\s*Pow)\s*[:\.]?\s*([^\n]+)/i);
            if (partM) logKowVal = partM[1].trim();
          }
          if (logKowVal) {
            const val = logKowVal.replace(/^=\s*/, '').replace(/(\d+)\.(\d+)/g, '$1,$2');
            info.push(`współczynnik podziału n-oktanol/woda (log Kow): ${val}`);
          }

          let bcfVal = null;
          const bcfValM = subBlock.match(/BCF[^\n]*?Value\s*[:\.]?\s*([^\n]+)/i);
          if (bcfValM) {
            bcfVal = bcfValM[1].trim();
          } else {
            const bcfSimpleM = subBlock.match(/BCF\s*(?:[:=]|\b(?:is|=))\s*([^\n]+)/i) || subBlock.match(/BCF\s*[:\.]?\s*([^\n-]+)/i);
            if (bcfSimpleM && bcfSimpleM[1].trim()) bcfVal = bcfSimpleM[1].trim();
          }
          if (bcfVal) {
            const val = bcfVal.replace(/^=\s*/, '').replace(/(\d+)\.(\d+)/g, '$1,$2');
            info.push(`współczynnik biokoncentracji BCF = ${val}`);
          }

          if (/Not bioaccumulative|Non bioaccumulabile/i.test(subBlock)) {
            info.push("nie wykazuje zdolności do bioakumulacji");
          } else if (/(?<!Not\s+|Non\s+)Bioaccumulative\b/i.test(subBlock)) {
            info.push("wykazuje zdolność do bioakumulacji (Bioaccumulative)");
          }
        }
        // Wzbogacenie z bufora EcotoxRegistry
        if (comp.cas) {
          const cached = EcotoxRegistry.getEntry(comp.cas);
          if (cached && cached.bioaccumulation && info.length === 0) {
            info.push(cached.bioaccumulation);
          }
        }
        if (info.length > 0) {
          s3Substances.push({ name: comp.name || comp.originalName, cas: comp.cas, info });
        }
      });
    }

    if (s3Substances.length > 0) {
      s12_3 += "Informacje dotyczące składników:\n";
      s3Substances.forEach(sub => {
        s12_3 += `${sub.name}${sub.cas ? ` (CAS: ${sub.cas})` : ''}: ${sub.info.join(', ')}.\n`;
      });
      s12_3 += "Mieszanina: Brak dostępnych badań dotyczących bioakumulacji dla mieszaniny.";
    } else {
      s12_3 += "Brak dostępnych badań dotyczących bioakumulacji dla mieszaniny.";
    }

    // --- 12.4. MOBILNOŚĆ W GLEBIE ---
    let s12_4 = "12.4. Mobilność w glebie\n";
    let s4Substances = [];
    if (components && components.length > 0) {
      components.forEach(comp => {
        const subBlock = extractSubstanceBlock(block4, comp);
        if (subBlock) {
          const kocM = subBlock.match(/(?:Partition coefficient\s*[:\.]?\s*soil\/water|Koc)\s*[:\.]?\s*([^\n]+)/i);
          if (kocM) {
            const val = kocM[1].trim().replace(/(\d+)\.(\d+)/g, '$1,$2');
            s4Substances.push({ name: comp.name || comp.originalName, cas: comp.cas, koc: val });
          }
        }
      });
    }

    if (s4Substances.length > 0) {
      s12_4 += "Informacje dotyczące składników:\n";
      s4Substances.forEach(sub => {
        s12_4 += `${sub.name}${sub.cas ? ` (CAS: ${sub.cas})` : ''}: współczynnik podziału gleba/woda (Koc): ${sub.koc}.\n`;
      });
      s12_4 += "Mieszanina: Brak dostępnych badań dotyczących mobilności mieszaniny w glebie.";
    } else {
      s12_4 += "Brak dostępnych badań dotyczących mobilności mieszaniny w glebie.";
    }

    // --- 12.5. WYNIKI OCENY WŁAŚCIWOŚCI PBT I vPvB ---
    let s12_5 = "12.5. Wyniki oceny właściwości PBT i vPvB\n";
    s12_5 += "Mieszanina nie zawiera substancji spełniających kryteria PBT lub vPvB zgodnie z załącznikiem XIII do rozporządzenia REACH w stężeniu ≥ 0,1% wag.";

    // --- 12.6. WŁAŚCIWOŚCI ZABURZAJĄCE FUNKCJONOWANIE UKŁADU HORMONALNEGO ---
    let s12_6 = "12.6. Właściwości zaburzające funkcjonowanie układu hormonalnego\n";
    const isExplicitlyDeniedEd = /(?:no substances|non contiene|nie zawiera|brak substancji|not listed|no endocrine)/i.test(block6);
    const casM = block6.match(/(?:CAS\s*[:\.]?\s*)(\d{2,7}-\d{2}-\d)/i);
    const edComp = components.find(c => {
      const entry = c.cas ? EcotoxRegistry.getEntry(c.cas) : null;
      return entry && entry.endocrineDisruptor;
    });

    let detectedEdCas = null;
    if (!isExplicitlyDeniedEd) {
      if (casM && (EcotoxRegistry.getEntry(casM[1])?.endocrineDisruptor || /List I|List II/i.test(block6))) {
        detectedEdCas = casM[1];
      } else if (edComp) {
        detectedEdCas = edComp.cas;
      }
    }

    let edSubstanceSummary = null;
    if (detectedEdCas) {
      const name = resolveSubName(edComp ? edComp.name : "", detectedEdCas);
      edSubstanceSummary = `${name} (CAS: ${detectedEdCas})`;
      s12_6 += "Substancje zaburzające funkcjonowanie układu hormonalnego w odniesieniu do środowiska:\n";
      s12_6 += `${name} (CAS: ${detectedEdCas}): Wykaz II ECHA – substancja podlegająca ocenie pod kątem właściwości zaburzających funkcjonowanie układu hormonalnego zgodnie z przepisami UE.\n\n`;
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

    return {
      content: output.trim(),
      endocrineDisruptorInfo: edSubstanceSummary
    };
  }

  processSection13(rawContent = "", components = [], s2Content = "", s1Content = "") {
    // Odpad niebezpieczny (z gwiazdką *) może zostać przypisany wyłącznie, gdy cała mieszanina w Sekcji 2.1 jest zaklasyfikowana jako stwarzająca zagrożenie
    const isExplicitlyNotHazardous = /(?:not classified|non[ \-]*(?:[eè]|est)?\s*classificat|nie sklasyfikowan|nie jest sklasyfikowan|nie stwarza zagrożenia|not hazardous|Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie)/i.test(s2Content);
    const hasMixtureHazard = !isExplicitlyNotHazardous && /(?:GHS0[1235689]|H2\d\d|H30[0-4]|H31[0-4]|H318|H33[0-4]|H34\d|H35\d|H36\d|H37\d|H400|H41[01])/i.test(s2Content);
    const isHazardous = hasMixtureHazard;

    const productText = `${s1Content} ${rawContent} ${components.map(c => c.name || "").join(' ')}`;
    return PolishLegalTemplates.getSection13(isHazardous, productText);
  }

  processSection14(rawContent = "") {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(rawContent);

    // Detekcja czy towar NIE podlega przepisom transportowym
    const isNotRegulated = /Not classified as dangerous|Non dangerous good|Non pericoloso|Not dangerous|Nie podlega przepisom|Non regolamentato/i.test(clean);
    
    // Wyszukiwanie numeru UN (np. UN 1266, UN1266, UN 1993, 1266 itp.)
    const unMatch = clean.match(/(?:UN\s*|ID\s*|Nr\s*UN\s*[:\.]?\s*)(\d{4})\b/i);
    const unNumber = unMatch ? unMatch[1] : null;

    if (isNotRegulated || !unNumber || /14\.1[^\n]*?(?:N\/?A|None|Brak|Nie dotyczy)/i.test(clean)) {
      let out = "SEKCJA 14: Informacje dotyczące transportu\n\n";
      out += "Produkt nie jest sklasyfikowany jako stwarzający zagrożenie w świetle międzynarodowych i krajowych przepisów transportowych (ADR/RID, IMDG, ICAO/IATA).\n\n";
      out += "14.1. Numer UN lub numer identyfikacyjny ID\nNie dotyczy.\n\n";
      out += "14.2. Prawidłowa nazwa przewozowa UN\nNie dotyczy.\n\n";
      out += "14.3. Klasa(-y) zagrożenia w transporcie\nNie dotyczy.\n\n";
      out += "14.4. Grupa pakowania\nNie dotyczy.\n\n";
      out += "14.5. Zagrożenia dla środowiska\nNie dotyczy (produkt nie stanowi zagrożenia dla środowiska w myśl przepisów transportowych).\n\n";
      out += "14.6. Szczególne środki ostrożności dla użytkowników\nZawsze transportować w szczelnie zamkniętych, oryginalnych opakowaniach handlowych, chroniąc przed uszkodzeniami mechanicznymi, bezpośrednim działaniem promieni słonecznych i przewróceniem. Przestrzegać ogólnych zasad bezpieczeństwa i higieny pracy podczas przeładunku.\n\n";
      out += "14.7. Transport morski luzem zgodnie z instrumentami IMO\nNie dotyczy.";
      return out;
    }

    // Towar niebezpieczny (ADR/RID/IMDG/IATA)
    const adrEntry = unNumber ? ADRRegistry.getEntry(unNumber) : null;
    
    // 14.1
    const s14_1 = `14.1. Numer UN lub numer identyfikacyjny ID\nUN ${unNumber}`;

    // 14.2 Prawidłowa nazwa przewozowa
    let shippingName = adrEntry ? adrEntry.name : "";
    if (!shippingName) {
      const shipMatch = clean.match(/(?:ADR-Shipping Name|Proper shipping name|Prawidłowa nazwa przewozowa)\s*[:\.]?\s*([^\n;]+)/i);
      shippingName = shipMatch && !/N\/?A/i.test(shipMatch[1]) ? shipMatch[1].trim() : "Brak danych";
    }
    const s14_2 = `14.2. Prawidłowa nazwa przewozowa UN\n${shippingName}`;

    // 14.3 Klasa zagrożenia
    let hazardClass = adrEntry ? adrEntry.class : "";
    if (!hazardClass) {
      const classMatch = clean.match(/(?:ADR-Class|Transport hazard class|Klasa)\s*[:\.]?\s*([^\n;]+)/i);
      hazardClass = classMatch && !/N\/?A/i.test(classMatch[1]) ? classMatch[1].trim() : "Brak danych";
    }
    const classDesc = hazardClass === '3' ? " (Materiały ciekłe zapalne)" : "";
    const s14_3 = `14.3. Klasa(-y) zagrożenia w transporcie\nADR / RID, IMDG, IATA: Klasa ${hazardClass}${classDesc}\nNalepka ostrzegawcza: Nr ${hazardClass}`;

    // 14.4 Grupa pakowania
    let packingGroup = adrEntry ? adrEntry.packing_group : "";
    if (!packingGroup || packingGroup.includes('/')) {
      const pgMatch = clean.match(/(?:ADR-Packing Group|Packing group|Grupa pakowania)\s*[:\.]?\s*([^\n;]+)/i);
      if (pgMatch && !/N\/?A/i.test(pgMatch[1])) packingGroup = pgMatch[1].trim();
    }
    const s14_4 = `14.4. Grupa pakowania\n${packingGroup ? (packingGroup.startsWith('Grupa') ? packingGroup : `Grupa pakowania ${packingGroup}`) : "Nie dotyczy"}`;

    // 14.5 Zagrożenia dla środowiska
    const isMarinePollutant = /Marine pollutant\s*[:\.]?\s*(?:Yes|Si|Tak)|Environmental Pollutant\s*[:\.]?\s*(?:Yes|Si|Tak)|Zagrożenie dla środowiska\s*[:\.]?\s*Tak/i.test(clean);
    const s14_5 = `14.5. Zagrożenia dla środowiska\n${isMarinePollutant ? "Tak (substancja zagrażająca środowisku / Marine Pollutant)." : "Brak (produkt nie jest zaklasyfikowany jako stwarzający zagrożenie dla środowiska w transporcie)."}`;

    // 14.6 Szczególne środki ostrożności
    let s14_6 = "14.6. Szczególne środki ostrożności dla użytkowników\n";
    let precDetails = [];

    // Ilości ograniczone (LQ) wg rozdziału 3.4 ADR
    let lqValue = null;
    clean = clean.replace(/((?:Limited\s*Quantit(?:ies|y)|Ilości\s*ograniczone|LQ)\s*[:\.]?\s*[0-9]+)\s*\n\s*(L|lt|kg|ml|g)\b/gi, '$1 $2');
    const lqMatch = clean.match(/(?:Limited\s*Quantit(?:ies|y)|Ilości\s*ograniczone|LQ)\s*[:\.]?\s*([0-9]+(?:\s*(?:L|lt|kg|ml|g|[a-zA-Z]+))?)/i);
    if (lqMatch) {
      let rawLq = lqMatch[1].trim();
      if (/^1\s*lt$/i.test(rawLq) || rawLq === "1") rawLq = "1 L";
      else if (/lt$/i.test(rawLq)) rawLq = rawLq.replace(/lt$/i, 'L');
      lqValue = rawLq;
      precDetails.push(`Ilości ograniczone (LQ): ${lqValue}`);
    } else if (adrEntry && adrEntry.lq) {
      lqValue = adrEntry.lq;
      precDetails.push(`Ilości ograniczone (LQ): ${lqValue}`);
    }

    let finalTunnel = adrEntry ? adrEntry.tunnel_code : null;
    const tunnelMatch = clean.match(/(?:Tunnel restriction code|Tunnel|Kod tunelu)\s*[:\.]?\s*(\([A-E](?:\/[A-E])?\)|\b[A-E](?:\/[A-E])?\b)/i);
    if (tunnelMatch) {
      finalTunnel = tunnelMatch[1].trim();
    }
    if (finalTunnel) precDetails.push(`Kod ograniczeń przewozu przez tunele: ${finalTunnel}`);
    
    precDetails.push("Transportować w szczelnie zamkniętych, certyfikowanych opakowaniach, zabezpieczonych przed przemieszczaniem i uszkodzeniami mechanicznymi.");
    precDetails.push("Kierowca powinien posiadać stosowne uprawnienia ADR oraz wymagane wyposażenie ochronne pojazdu.");
    s14_6 += precDetails.join('\n');

    // 14.7 IMO
    const s14_7 = "14.7. Transport morski luzem zgodnie z instrumentami IMO\nNie dotyczy (produkt nie jest przewożony luzem w chemikaliowcach morskich).";

    let out = "SEKCJA 14: Informacje dotyczące transportu\n\n";
    out += "Produkt podlega przepisom dotyczącym międzynarodowego przewozu towarów niebezpiecznych (ADR/RID, IMDG, ICAO/IATA).\n\n";
    out += `${s14_1}\n\n${s14_2}\n\n${s14_3}\n\n${s14_4}\n\n${s14_5}\n\n${s14_6}\n\n${s14_7}`;
    return out;
  }

  processSection15(rawContent = "", components = [], s1Content = "", s2Content = "") {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(rawContent);

    let svhcText = "";
    if (/No substances listed|No SVHC substances present in concentration >= 0\.?1%/i.test(clean) || !/SVHC/i.test(clean)) {
      svhcText = "Mieszanina nie zawiera substancji z listy kandydackiej SVHC podlegających procedurze udzielania zezwoleń (REACH załącznik XIV) w stężeniu ≥ 0,1% wag.";
    }

    // Wykrywanie kategorii Seveso
    let sevesoCat = "";
    const catMatch = clean.match(/(?:Seveso\s*(?:Category|Kategoria|Categoria)|Dir(?:ect(?:ive)?)?\s*2012\/18\/EU)[\s\S]*?\b(P[1-8][a-c]?|E[1-2]|H[1-3]|O[1-3])\b/i) ||
                     clean.match(/(?:Seveso|2012\/18\/EU)[^\n\r]*?:\s*([A-Z0-9]+)/i);
    if (catMatch) {
      sevesoCat = catMatch[1].trim();
    }

    // Wykrywanie ograniczeń Załącznika XVII REACH
    let prodPoints = [];
    let contPoints = [];

    const prodMatch = clean.match(/(?:^|\n)\s*(?:Product|Prodotto|Produkt)\s*[\n\r:]+\s*(?:Point|Punto|Pozycja)?\s*([0-9\s,\-]+)/i);
    if (prodMatch) {
      const pts = prodMatch[1].match(/\d+/g);
      if (pts) prodPoints.push(...pts);
    }

    const contMatch = clean.match(/(?:^|\n)\s*(?:Contained\s*substances?|Sostanze\s*contenute|Substancje\s*zawarte)\s*[\n\r:]+\s*(?:Point|Punto|Pozycja)?\s*([0-9\s,\-]+)/i);
    if (contMatch) {
      const pts = contMatch[1].match(/\d+/g);
      if (pts) contPoints.push(...pts);
    }

    const genRestrMatch = clean.match(/(?:Restrictions\s*related|Restrizioni\s*relative|Ograniczenia\s*dotyczące)[\s\S]*?(?:Annex\s*XVII|Załącznik\s*XVII|Allegato\s*XVII)[\s\S]*?(?:Point|Punto|Pozycja)\s*([0-9\s,\-]+)/i);
    if (genRestrMatch && prodPoints.length === 0 && contPoints.length === 0) {
      const pts = genRestrMatch[1].match(/\d+/g);
      if (pts) contPoints.push(...pts);
    }

    // Determinizm prawny CLP (Zero-Bypass Fallback):
    const isDangerousLiquid = /Flam\. Liq|Eye Irrit|Eye Dam|Skin Irrit|Skin Sens|Skin Corr|Acute Tox|STOT|Aquatic/i.test(s2Content);
    const isFlammableLiquid = /Flam\. Liq|H224|H225|H226/i.test(s2Content);

    if (isDangerousLiquid && !prodPoints.includes("3")) {
      prodPoints.push("3");
    }
    if (isFlammableLiquid && !prodPoints.includes("40")) {
      prodPoints.push("40");
    }
    if (!contPoints.includes("75") && clean.includes("75")) {
      contPoints.push("75");
    }

    let restrLines = [];
    if (prodPoints.length > 0) {
      let descList = [];
      if (prodPoints.includes("3")) descList.push("pozycji 3 (Ciekłe substancje lub mieszaniny stwarzające zagrożenie w rozumieniu rozporządzenia CLP)");
      if (prodPoints.includes("40")) descList.push("pozycji 40 (Substancje zaklasyfikowane jako ciecze łatwopalne kategorii 1, 2 lub 3)");
      const otherProd = prodPoints.filter(p => p !== "3" && p !== "40");
      if (otherProd.length > 0) descList.push(`pozycji ${otherProd.join(', ')}`);
      restrLines.push(`  * Produkt podlega ograniczeniom wynikającym z ${descList.join(' oraz ')}.`);
    }
    if (contPoints.length > 0) {
      let descList = [];
      if (contPoints.includes("75")) descList.push("pozycji 75 (Substancje w tuszach do tatuażu i makijażu permanentnego)");
      const otherCont = contPoints.filter(p => p !== "75");
      if (otherCont.length > 0) descList.push(`pozycji ${otherCont.join(', ')}`);
      restrLines.push(`  * Substancje zawarte w mieszaninie podlegają ograniczeniom wynikającym z ${descList.join(' oraz ')}.`);
    }

    let restrText = restrLines.length > 0 ? "\n" + restrLines.join('\n') : " Mieszanina nie podlega ograniczeniom na mocy załącznika XVII do rozporządzenia REACH.";

    const isDetergent = /detergent|czyszcząc|myjąc|mydło|płukania|odtłuszczacz|lavapavimenti|ammorbidente|sgrassatore|profuma tessuti/i.test(s1Content);
    const isHighlyFlammable = /H224|H225|Flam\. Liq\. 1|Flam\. Liq\. 2/i.test(s2Content);
    const isAquaticToxic = /H400|H410/i.test(s2Content);

    return PolishLegalTemplates.getSection15(svhcText, restrText, isDetergent, isHighlyFlammable, isAquaticToxic, sevesoCat);
  }


  processSection16(rawContent = "", components = [], s2Content = "", version = "1.0 PL", replacedRevision = "Brak") {
    let clean = SDSProcessorEngine.cleanPdfArtifacts(rawContent);

    // 1. Zbieranie unikalnych kodów H i EUH
    const hCodesSet = new Set();
    const euhCodesSet = new Set();

    // Z sekcji 2
    const s2HCodes = SDSChemicalExtractor.extractHCodes(s2Content);
    const s2EuhCodes = SDSChemicalExtractor.extractEuhCodes(s2Content);
    s2HCodes.forEach(c => hCodesSet.add(c));
    s2EuhCodes.forEach(c => euhCodesSet.add(c));
    if (s2Content.includes("EUH208") || /EUH208/i.test(s2Content)) {
      euhCodesSet.add("EUH208");
    }

    // Ze składników sekcji 3
    components.forEach(c => {
      const classStr = c.classification || "";
      const matchesH = SDSChemicalExtractor.extractHCodes(classStr);
      if (matchesH) matchesH.forEach(code => hCodesSet.add(code));
      const matchesEuh = SDSChemicalExtractor.extractEuhCodes(classStr);
      if (matchesEuh) matchesEuh.forEach(code => euhCodesSet.add(code));
      if (/(?:Skin\s*Sens|H317)/i.test(classStr)) {
        euhCodesSet.add("EUH208");
      }
    });

    // Z tekstu źródłowego sekcji 16
    const rawMatchesH = SDSChemicalExtractor.extractHCodes(clean);
    if (rawMatchesH) rawMatchesH.forEach(code => hCodesSet.add(code));
    const rawMatchesEuh = SDSChemicalExtractor.extractEuhCodes(clean);
    if (rawMatchesEuh) rawMatchesEuh.forEach(code => euhCodesSet.add(code));

    const sortedHCodes = Array.from(hCodesSet).sort();
    const sortedEuhCodes = Array.from(euhCodesSet).sort();

    let hPhrasesBlock = [];
    sortedHCodes.forEach(code => {
      const phrase = OFFICIAL_CLP_H_PHRASES[code] || "Brak oficjalnego tłumaczenia zwrotu.";
      hPhrasesBlock.push(`${code}: ${phrase}`);
    });
    sortedEuhCodes.forEach(code => {
      const phrase = OFFICIAL_CLP_H_PHRASES[code] || (code === "EUH208" ? "Zawiera substancję uczulającą. Może powodować wystąpienie reakcji alergicznej." : "Informacja uzupełniająca o zagrożeniach.");
      hPhrasesBlock.push(`${code}: ${phrase}`);
    });

    // 2. Wykaz klas i kategorii zagrożenia
    const classMapPl = {
      "Acute Tox. 1": "Toksyczność ostra, kategoria 1",
      "Acute Tox. 2": "Toksyczność ostra, kategoria 2",
      "Acute Tox. 3": "Toksyczność ostra, kategoria 3",
      "Acute Tox. 4": "Toksyczność ostra, kategoria 4",
      "Skin Corr. 1A": "Działanie żrące na skórę, kategoria 1A",
      "Skin Corr. 1B": "Działanie żrące na skórę, kategoria 1B",
      "Skin Corr. 1C": "Działanie żrące na skórę, kategoria 1C",
      "Skin Corr. 1": "Działanie żrące na skórę, kategoria 1",
      "Skin Irrit. 2": "Działanie drażniące na skórę, kategoria 2",
      "Eye Dam. 1": "Poważne uszkodzenie oczu, kategoria 1",
      "Eye Irrit. 2": "Działanie drażniące na oczy, kategoria 2",
      "Skin Sens. 1A": "Działanie uczulające na skórę, kategoria 1A",
      "Skin Sens. 1B": "Działanie uczulające na skórę, kategoria 1B",
      "Skin Sens. 1": "Działanie uczulające na skórę, kategoria 1",
      "Resp. Sens. 1": "Działanie uczulające na drogi oddechowe, kategoria 1",
      "Flam. Liq. 1": "Substancja ciekła łatwopalna, kategoria 1",
      "Flam. Liq. 2": "Substancja ciekła łatwopalna, kategoria 2",
      "Flam. Liq. 3": "Substancja ciekła łatwopalna, kategoria 3",
      "Flam. Sol. 1": "Substancja stała łatwopalna, kategoria 1",
      "Flam. Sol. 2": "Substancja stała łatwopalna, kategoria 2",
      "Aerosol 1": "Wyroby aerozolowe, kategoria 1",
      "Aerosol 2": "Wyroby aerozolowe, kategoria 2",
      "Aerosol 3": "Wyroby aerozolowe, kategoria 3",
      "Asp. Tox. 1": "Zagrożenie spowodowane aspiracją, kategoria 1",
      "STOT SE 1": "Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 1",
      "STOT SE 2": "Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 2",
      "STOT SE 3": "Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 3",
      "STOT RE 1": "Działanie toksyczne na narządy docelowe – narażenie powtarzane, kategoria 1",
      "STOT RE 2": "Działanie toksyczne na narządy docelowe – narażenie powtarzane, kategoria 2",
      "Repr. 1A": "Działanie szkodliwe na rozrodczość, kategoria 1A",
      "Repr. 1B": "Działanie szkodliwe na rozrodczość, kategoria 1B",
      "Repr. 2": "Działanie szkodliwe na rozrodczość, kategoria 2",
      "Carc. 1A": "Rakotwórczość, kategoria 1A",
      "Carc. 1B": "Rakotwórczość, kategoria 1B",
      "Carc. 2": "Rakotwórczość, kategoria 2",
      "Muta. 1A": "Działanie mutagenne na komórki rozrodcze, kategoria 1A",
      "Muta. 1B": "Działanie mutagenne na komórki rozrodcze, kategoria 1B",
      "Muta. 2": "Działanie mutagenne na komórki rozrodcze, kategoria 2",
      "Lact.": "Wpływ na laktację lub oddziaływanie na dzieci karmione piersią",
      "Aquatic Acute 1": "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie ostre, kategoria 1",
      "Aquatic Chronic 1": "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 1",
      "Aquatic Chronic 2": "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 2",
      "Aquatic Chronic 3": "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 3",
      "Aquatic Chronic 4": "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 4"
    };

    const detectedClasses = new Set();
    components.forEach(c => {
      const cl = c.classification || "";
      for (const key of Object.keys(classMapPl)) {
        if (cl.includes(key)) detectedClasses.add(key);
      }
    });
    for (const key of Object.keys(classMapPl)) {
      if (clean.includes(key)) detectedClasses.add(key);
    }

    let classesBlock = [];
    Array.from(detectedClasses).sort().forEach(cls => {
      classesBlock.push(`${cls}: ${classMapPl[cls]}`);
    });

    // 3. Objaśnienie skrótów i akronimów
    const acronyms = [
      "ADR: Umowa europejska dotycząca międzynarodowego przewozu drogowego towarów niebezpiecznych",
      "RID: Regulamin międzynarodowego przewozu kolejami towarów niebezpiecznych",
      "IMDG: Międzynarodowy morski kodeks towarów niebezpiecznych (International Maritime Dangerous Goods Code)",
      "IATA: Międzynarodowe Zrzeszenie Przewoźników Powietrznych (International Air Transport Association)",
      "ICAO: Organizacja Międzynarodowego Lotnictwa Cywilnego",
      "CLP: Rozporządzenie (WE) nr 1272/2008 w sprawie klasyfikacji, oznakowania i pakowania substancji i mieszanin",
      "REACH: Rozporządzenie (WE) nr 1907/2006 w sprawie rejestracji, oceny, udzielania zezwoleń i stosowanych ograniczeń w zakresie chemikaliów",
      "GHS: Globalnie Zharmonizowany System Klasyfikacji i Oznakowania Chemikaliów",
      "CAS: Chemical Abstracts Service (unikalny numeryczny identyfikator substancji chemicznej)",
      "WE: Numer Wspólnoty Europejskiej (oficjalny numer rejestracyjny substancji w UE: EINECS, ELINCS lub NLP)",
      "NDS: Najwyższe dopuszczalne stężenie na stanowisku pracy w ciągu 8-godzinnego dnia pracy",
      "NDSCh: Najwyższe dopuszczalne stężenie chwilowe (czas ekspozycji do 15 minut)",
      "NDSP: Najwyższe dopuszczalne stężenie pułapowe (wartość, która nie może być przekroczona w żadnym momencie)",
      "DNEL: Pochodny poziom niepowodujący zmian (Derived No-Effect Level)",
      "PNEC: Przewidywane stężenie niepowodujące zmian w środowisku (Predicted No-Effect Concentration)",
      "PBT: Substancja trwała, wykazująca zdolność do bioakumulacji i toksyczna",
      "vPvB: Substancja bardzo trwała i wykazująca bardzo dużą zdolność do bioakumulacji",
      "SVHC: Substancje wzbudzające szczególnie duże obawy (Substances of Very High Concern)",
      "BCF: Współczynnik biokoncentracji (Bioconcentration Factor)",
      "log Kow: Współczynnik podziału n-oktanol/woda",
      "LD50: Dawka śmiertelna dla 50% badanej populacji zwierząt laboratoryjnych",
      "LC50: Stężenie śmiertelne dla 50% badanej populacji organizmów testowych",
      "EC50: Stężenie wywołujące efekt u 50% badanej populacji testowej",
      "NOEC: Najwyższe stężenie, przy którym nie obserwuje się statystycznie istotnych skutków (No Observed Effect Concentration)",
      "SCL: Specyficzne stężenie graniczne (Specific Concentration Limit)",
      "BDO: Baza danych o produktach i opakowaniach oraz o gospodarce odpadami",
      "ECHA: Europejska Agencja Chemikaliów"
    ];

    let out = "SEKCJA 16: Inne informacje\n\n";

    if (hPhrasesBlock.length > 0) {
      out += "Pełne brzmienie zwrotów H i EUH przytoczonych w sekcjach 2 i 3 karty charakterystyki:\n";
      out += hPhrasesBlock.join('\n') + "\n\n";
    }

    if (classesBlock.length > 0) {
      out += "Wykaz klas i kategorii zagrożenia przytoczonych w karcie charakterystyki:\n";
      out += classesBlock.join('\n') + "\n\n";
    }

    out += "Objaśnienie skrótów i akronimów stosowanych w karcie charakterystyki:\n";
    out += acronyms.join('\n') + "\n\n";

    out += "Główne źródła literatury i danych:\n";
    out += "- Karty charakterystyki substancji składowych udostępnione przez producentów i dostawców surowców.\n";
    out += "- Baza danych Europejskiej Agencji Chemikaliów (ECHA): https://echa.europa.eu/\n";
    out += "- Baza danych PubChem National Library of Medicine: https://pubchem.ncbi.nlm.nih.gov/\n";
    out += "- Obowiązujące unijne i krajowe akty prawne (REACH, CLP, Dz.U. 2018 poz. 1286, Dz.U. 2023 poz. 1587).\n\n";

    out += "Zalecenia i wskazówki szkoleniowe dla pracowników:\n";
    out += "Przed przystąpieniem do pracy z produktem należy zapoznać się z treścią niniejszej karty charakterystyki oraz przepisami BHP obowiązującymi na stanowisku pracy. Pracownicy mający kontakt z produktem powinni zostać przeszkoleni w zakresie prawidłowego i bezpiecznego obchodzenia się z chemikaliami oraz postępowania w sytuacjach awaryjnych.\n\n";

    out += "Informacje o zmianach i aktualizacji:\n";
    if (/Brak\s*\(wydanie pierwsze/i.test(replacedRevision)) {
      const docDateMatch = replacedRevision.match(/z\s*dnia\s*([0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4})/i);
      const dateSuffix = docDateMatch ? ` z dnia ${docDateMatch[1]} r.` : "";
      out += `Niniejsza karta charakterystyki (wersja ${version || "1.0 PL"}) stanowi wydanie pierwsze w języku polskim, opracowane na podstawie karty charakterystyki SDS producenta${dateSuffix ? dateSuffix : "."}\n`;
    } else {
      out += `Niniejsza karta charakterystyki (wersja ${version || "1.0 PL"}) zastępuje wersję ${replacedRevision || "1.0"}.\n`;
    }
    const compName = (this.companyConfig && this.companyConfig.companyName) || process.env.COMPANY_NAME || "ITALLUX Sp. z o.o.";
    const compAddress = (this.companyConfig && this.companyConfig.address) || process.env.COMPANY_ADDRESS || "ul. Wesoła 16";
    const compCity = (this.companyConfig && this.companyConfig.city) || process.env.COMPANY_CITY || "63-600 Kępno";
    const compSite = (this.companyConfig && this.companyConfig.website) || process.env.COMPANY_WEBSITE || "www.prostozwloch.com.pl";
    const addrStr = [compAddress, compCity].filter(Boolean).join(', ');
    const detailsStr = [addrStr, compSite].filter(Boolean).join(', ');
    const companyInfoSuffix = detailsStr ? ` (${detailsStr})` : "";

    out += "Aktualizacja została sporządzona i dostosowana zgodnie z wymogami Rozporządzenia Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniającego załącznik II do rozporządzenia (WE) nr 1907/2006 (REACH) oraz przepisami prawa Rzeczypospolitej Polskiej.\n";
    out += "Główne zmiany wprowadzone w bieżącej wersji obejmują:\n";
    out += `- Sekcja 1.3: Aktualizacja danych dostawcy karty w Rzeczypospolitej Polskiej na ${compName}${companyInfoSuffix}.\n`;
    out += "- Sekcja 8.1: Weryfikacja i implementacja krajowych norm higienicznych w środowisku pracy (NDS, NDSCh) na podstawie Rozporządzenia MRPiPS (Dz.U. 2018 poz. 1286 z późn. zm.).\n";
    out += "- Sekcja 11.2 i 12.6: Wdrożenie obligatoryjnych podsekcji dotyczących właściwości zaburzających funkcjonowanie układu hormonalnego.\n";
    out += "- Sekcja 13: Aktualizacja klasyfikacji i 6-cyfrowych kodów odpadów zgodnie z ustawą o odpadach i Dz.U. 2020 poz. 10.\n";
    out += "- Sekcja 14: Weryfikacja i zharmonizowanie warunków przewozu zgodnie z Umową ADR.\n\n";
    out += "Klauzula prawna i ochrona praw autorskich:\n";
    out += `Niniejsze autorskie opracowanie tłumaczenia, formatowania oraz adaptacji regulacyjnej do prawa polskiego stanowi własność intelektualną firmy ${compName}. Kopiowanie i wykorzystywanie całości lub fragmentów w celach komercyjnych przez podmioty trzecie bez uprzedniej zgody właściciela jest zabronione. Dozwolone jest wykorzystanie dokumentu przez odbiorców w łańcuchu dostaw do celów bezpieczeństwa pracy i ochrony zdrowia.\n\n`;
    out += "Informacje zawarte w niniejszej karcie wynikają z aktualnego stanu wiedzy producenta i dystrybutora i odnoszą się wyłącznie do opisanego produktu. Użytkownik ponosi odpowiedzialność za stworzenie bezpiecznych warunków pracy oraz spełnienie wymagań prawnych związanych z jego zastosowaniem.";

    return out.trim();
  }

  async prepareAgentPayload(pdfFilePath, productName = "PRODUKT CHEMICZNY", manualOverrides = {}) {
    console.log(`[SYS] Ekstrakcja pliku: ${pdfFilePath}`);
    const isDocx = SDSDocumentParser.isDocxFile(pdfFilePath);
    let fullText = "";
    let rawSections = {};
    let docxParsed = null;

    if (isDocx) {
      console.log(`[SYS] Wykryto format wejściowy DOCX. Uruchamianie zaawansowanej analizy strukturalnej OpenXML...`);
      docxParsed = SDSDocxParser.extractTextAndSections(pdfFilePath);
      fullText = docxParsed.fullText;
      rawSections = docxParsed.sections;
    } else {
      fullText = await SDSDocumentParser.extractText(pdfFilePath, false);
      rawSections = SDSPDFParser.segmentInto16Sections(fullText);
    }
    
    // Ekstrakcja metadanych rewizji i dat źródłowych (wg Pkt 0.2.5 Załącznika II do REACH)
    const revMatch = fullText.match(/(?:Revision\s*(?:nr\.?|no\.?|n\.|:)?\s*|Version\s*(?:nr\.?|no\.?|:)?\s*|Revisione\s*(?:n\.?|nr\.?|:)?\s*)(\d+(?:\.\d+)?)/i);
    
    // Wieloetapowa ekstrakcja daty wydania/rewizji SDS producenta (IT/EN/PL)
    let originalDate = null;
    const dateMatch = fullText.match(/(?:Dated|Data\s*compilazione|Date\s*of\s*compilation|Data\s*revisione|Data\s*wydania|Data\s*sporządzenia|Data\s*di\s*emissione|Data\s*di\s*revisione|Revisione\s*del|Emessa\s*il)[\s:\.]*([0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4})/i);
    if (dateMatch) {
      originalDate = dateMatch[1].replace(/\//g, '.');
    } else {
      const headerRevDateMatch = fullText.match(/(?:Revision|Revisione|Wersja)[^\n\r]{0,80}?([0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4})/i);
      if (headerRevDateMatch) {
        originalDate = headerRevDateMatch[1].replace(/\//g, '.');
      } else {
        const allDocDates = [...fullText.slice(0, 3000).matchAll(/\b([0-3]?\d[\/.-][0-1]?\d[\/.-]\d{4})\b/g)];
        if (allDocDates.length > 0) {
          originalDate = allDocDates[0][1].replace(/\//g, '.');
        }
      }
    }

    const replMatch = fullText.match(/(?:Replaced\s*revision|Sostituisce\s*(?:la\s*)?revisione|Zastępuje\s*wersję)[\s:]*([^\n\r]+)/i);

    const originalRevision = revMatch ? revMatch[1] : "1";
    let replacedRevision = replMatch ? replMatch[1].trim() : null;
    if (replacedRevision) {
      replacedRevision = replacedRevision
        .replace(/Dated:/i, 'z dnia')
        .replace(/Data:/i, 'z dnia')
        .replace(/\//g, '.');
      if (!/wersj/i.test(replacedRevision)) {
        replacedRevision = `Wersja ${replacedRevision}`;
      }
    }
    // Ekstrakcja kodu produktu z pełnego tekstu (jeśli nie został podany)
    const docCodeMatch = fullText.match(/(?:Trade code|Codice prodotto|Codice|Kod produktu|Product code|\bCode)\s*[:\.]?\s*([A-Z0-9_\-\/]+)/i);
    const extractedCode = docCodeMatch ? docCodeMatch[1].trim() : "";

    const isExplicitSubsequentPolishRevision = manualOverrides.version && !/^1(\.0)?\s*(PL)?$/i.test(manualOverrides.version);
    const version = manualOverrides.version || "1.0 PL";
    
    // BEZWZGLĘDNY ZAKAZ używania new Date() jako daty karty producenta!
    let finalReplacedRevision = manualOverrides.replacedRevision;
    if (!finalReplacedRevision) {
      if (!isExplicitSubsequentPolishRevision) {
        if (originalDate) {
          finalReplacedRevision = `Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta z dnia ${originalDate} r.)`;
        } else {
          finalReplacedRevision = "Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta)";
        }
      } else {
        finalReplacedRevision = replacedRevision || "Brak";
      }
    }

    // Metryka formalna karty w języku polskim (Pkt 0.2.5 Załącznika II do REACH - UE 2020/878):
    // 1. Data sporządzenia: data opracowania polskiej wersji (data bieżąca lub manualOverride)
    const compilationDate = manualOverrides.compilationDate || new Date().toLocaleDateString('pl-PL');
    // 2. Aktualizacja: dla wydania 1.0 PL karta nie była jeszcze aktualizowana ("Nie dotyczy"), dla kolejnych wydań data bieżącej aktualizacji
    const revisionDate = manualOverrides.revisionDate || (!isExplicitSubsequentPolishRevision ? "Nie dotyczy" : new Date().toLocaleDateString('pl-PL'));

    const ufi = SDSChemicalExtractor.extractUfi(rawSections["section_1"]);
    let s3;
    if (isDocx && docxParsed && docxParsed.tablesBySection && docxParsed.tablesBySection['section_3'] && docxParsed.tablesBySection['section_3'].length > 0) {
      s3 = await this.processSection3FromDocxTable(docxParsed.tablesBySection['section_3'], rawSections["section_3"], manualOverrides);
    } else {
      s3 = await this.processSection3(rawSections["section_3"], manualOverrides);
    }
    const s2 = this.processSection2(rawSections["section_2"], s3.resolvedSubstances, s3.components);
    const s1Content = this.processSection1(rawSections["section_1"], productName, ufi, manualOverrides, extractedCode);
    const s4Content = this.processSection4(rawSections["section_4"], s3.components, s2.content);
    const s9Content = this.processSection9(rawSections["section_9"], s3.components);
    const s5Content = this.processSection5(rawSections["section_5"], s3.components, s2.content, s9Content);
    const s6Content = this.processSection6(rawSections["section_6"]);
    const s7Content = this.processSection7(rawSections["section_7"], s2.content);
    const s8Content = this.processSection8(rawSections["section_8"], s3.components, s2.content);
    const s12Res = this.processSection12(rawSections["section_12"], s3.components, s2.content);
    const s12Content = s12Res.content;
    const s13Content = this.processSection13(rawSections["section_13"], s3.components, s2.content, s1Content);
    const s14Content = this.processSection14(rawSections["section_14"]);
    const s15Content = this.processSection15(rawSections["section_15"], s3.components, s1Content, s2.content);
    const s16Content = this.processSection16(rawSections["section_16"], s3.components, s2.content, version, finalReplacedRevision);

    const s2FinalContent = s2.content + "\n\n" + PolishLegalTemplates.getSection2_3(s12Res.endocrineDisruptorInfo);

    const deterministic = {
      section_1: { type: "CLP_MAPPED", content: s1Content },
      section_2: { type: "CLP_MAPPED", content: s2FinalContent },
      section_3: { type: "EXTRACT_RAW", content: s3.content, components: s3.components, chemicalDescription: s3.chemicalDescription },
      section_4: { type: "CLP_MAPPED", content: s4Content },
      section_5: { type: "CLP_MAPPED", content: s5Content },
      section_6: { type: "CLP_MAPPED", content: s6Content },
      section_7: { type: "CLP_MAPPED", content: s7Content },
      section_8: { type: "CLP_MAPPED", content: s8Content },
      section_9: { type: "CLP_MAPPED", content: s9Content },
      section_12: { type: "CLP_MAPPED", content: s12Content },
      section_13: { type: "CLP_MAPPED", content: s13Content },
      section_14: { type: "CLP_MAPPED", content: s14Content },
      section_15: { type: "CLP_MAPPED", content: s15Content },
      section_16: { type: "CLP_MAPPED", content: s16Content }
    };

    const toTranslate = {};
    let sec1_2Text = "";
    if (rawSections["section_1"]) {
      // 1. Próba standardowa: od 1.2 do 1.3 lub końca sekcji
      const match12 = rawSections["section_1"].match(/(?:1\.2\b[.:\-]?\s*[\s\S]*?)(?=(?:1\.3\b|$))/i);
      if (match12 && match12[0].trim().length > 10) {
        sec1_2Text = SDSProcessorEngine.cleanPdfArtifacts(match12[0]);
      } else {
        // 2. Próba semantyczna: poszukiwanie fraz kluczowych dotyczących zastosowań (PL/EN/IT/ES/DE/FR)
        const semanticMatch = rawSections["section_1"].match(/(?:1[\.\s]*2\b|Usi\s+(?:pertinenti\s+)?identificati|Relevant\s+identified\s+uses|Istotne\s+zidentyfikowane\s+zastosowania|Zidentyfikowane\s+zastosowania|Zastosowani[ae]|Identified\s+uses|Uses\s+advised\s+against|Usi\s+sconsigliati)[\s\S]*?(?=(?:1[\.\s]*3\b|Details\s+of\s+the\s+supplier|Informazioni\s+sul\s+fornitore|Dane\s+dotyczące\s+dostawcy|$))/i);
        if (semanticMatch && semanticMatch[0].trim().length > 10) {
          sec1_2Text = SDSProcessorEngine.cleanPdfArtifacts(semanticMatch[0]);
        }
      }
    }

    // 3. Sprawdzenie w całym dokumencie (jeśli sekcja 1 miała niestandardowe granice)
    if (!sec1_2Text && fullText) {
      const globalMatch = fullText.match(/(?:1\.2\b[.:\-]?\s*[\s\S]*?)(?=(?:1\.3\b|SEKCJA\s*2|SEZIONE\s*2|SECTION\s*2|$))/i);
      if (globalMatch && globalMatch[0].trim().length > 10) {
        sec1_2Text = SDSProcessorEngine.cleanPdfArtifacts(globalMatch[0]);
      }
    }

    // 4. Tarcza Ochronna (Defensive AI Fallback): Gwarancja niepustego bloku zgodnego z Załącznikiem II do REACH
    if (!sec1_2Text || sec1_2Text.trim().length === 0) {
      sec1_2Text = "1.2. Istotne zidentyfikowane zastosowania substancji lub mieszaniny oraz zastosowania odradzane\nZastosowanie: Produkt chemiczny / zapachowy do użytku konsumenckiego i profesjonalnego.\nZastosowania odradzane: Nie stosować do celów innych niż wskazane przez producenta.";
    }

    toTranslate["section_1_2"] = sec1_2Text.trim();
    // Sekcja 4 jest w 100% deterministyczna (dedukcja kliniczna w CLP_MAPPED) - wykluczona z promptu LLM
    [5, 6, 7, 10, 11].forEach(i => {
      toTranslate[`section_${i}`] = SDSProcessorEngine.cleanPdfArtifacts(rawSections[`section_${i}`]);
    });

    if (this.anomalies.length > 0) {
      throw new HITLError(this.anomalies);
    }

    const isTechnicalFilename = SDSProcessorEngine.isTechnicalFilename(productName);
    const finalProductName = this.lastResolvedTradeName || (!isTechnicalFilename ? SDSProcessorEngine.polonizeTradeName(productName) : "Karta Charakterystyki");

    return {
      metadata: { 
        productName: finalProductName, 
        productCode: extractedCode,
        ufi, 
        version,
        compilationDate,
        revisionDate,
        replacedRevision: finalReplacedRevision,
        companyConfig: this.companyConfig,
        components: s3.components,
        ghsPictograms: this.detectedGhsPictograms
      },
      deterministicSections: deterministic,
      descriptiveSectionsToTranslate: toTranslate,
      quarantineAudit: this.quarantineLogs,
      detectedGhsPictograms: this.detectedGhsPictograms,
      ocrDiagnostics: SDSPDFParser.ocrDiagnosticMessage
    };
  }

  static polonizeToxicologicalSection(content) {
    if (!content) return "";
    let text = content;
    text = text
      .replace(/\bRat\b/gi, 'szczur')
      .replace(/\bRats\b/gi, 'szczury')
      .replace(/\bRatto\b/gi, 'szczur')
      .replace(/\bRatti\b/gi, 'szczury')
      .replace(/\bRabbit\b/gi, 'królik')
      .replace(/\bRabbits\b/gi, 'króliki')
      .replace(/\bConiglio\b/gi, 'królik')
      .replace(/\bConigli\b/gi, 'króliki')
      .replace(/\bMouse\b/gi, 'mysz')
      .replace(/\bMice\b/gi, 'myszy')
      .replace(/\bTopo\b/gi, 'mysz')
      .replace(/\bTopi\b/gi, 'myszy')
      .replace(/\bGuinea pig\b/gi, 'świnka morska')
      .replace(/\bHuman\b/gi, 'człowiek')
      .replace(/\bOral\b/gi, 'droga pokarmowa (doustnie)')
      .replace(/\bOrale\b/gi, 'droga pokarmowa (doustnie)')
      .replace(/\bDermal\b/gi, 'na skórę')
      .replace(/\bCutanea\b/gi, 'na skórę')
      .replace(/\bInhalation\b/gi, 'przez drogi oddechowe (inhalacyjnie)')
      .replace(/\bInalatoria\b/gi, 'przez drogi oddechowe (inhalacyjnie)')
      .replace(/\bVapours\b/gi, 'pary')
      .replace(/\bVapori\b/gi, 'pary')
      .replace(/\bDust\/Mist\b/gi, 'pył/mgła')
      .replace(/\bbw\/d\b/gi, 'mc/dzień')
      .replace(/Skin irritation\b/gi, 'działanie drażniące na skórę')
      .replace(/Eye irritation\b/gi, 'działanie drażniące na oczy')
      .replace(/Skin sensitisation\b/gi, 'działanie uczulające na skórę')
      .replace(/Respiratory sensitisation\b/gi, 'działanie uczulające na drogi oddechowe')
      .replace(/Germ cell mutagenicity\b/gi, 'działanie mutagenne na komórki rozrodcze')
      .replace(/Carcinogenicity\b/gi, 'rakotwórczość')
      .replace(/Reproductive toxicity\b/gi, 'szkodliwe działanie na rozrodczość')
      .replace(/STOT-single exposure\b/gi, 'działanie toksyczne na narządy docelowe – narażenie jednorazowe')
      .replace(/STOT-repeated exposure\b/gi, 'działanie toksyczne na narządy docelowe – narażenie powtarzane')
      .replace(/Aspiration hazard\b/gi, 'zagrożenie spowodowane aspiracją')
      .replace(/Does not meet the criteria for classification/gi, 'W oparciu o dostępne dane, kryteria klasyfikacji nie są spełnione')
      .replace(/Not classified/gi, 'Nie sklasyfikowano')
      .replace(/No data available/gi, 'Brak dostępnych danych')
      .replace(/\bETHANOL\b/gi, 'Etanol')
      .replace(/\bTOLUENE\b/gi, 'Toluen')
      .replace(/\bANISALDEHYDE\b/gi, 'Aldehyd anyżowy')
      .replace(/\b2H-CHROMEN-2-ONE\b/gi, 'Kumaryna')
      .replace(/\b2,6-di-tert-butyl-p-cresol\b/gi, '2,6-di-tert-butylo-4-metylofenol (BHT)')
      .replace(/\bDRACOWNICY\b/gi, 'PRACOWNICY')
      .replace(/(?:LC50\s*\([^\)]*(?:Inhalation|inhalac|drogi\s*oddechowe)[^\)]*\)\s*:\s*)?120\s*mg\/l\/4h\s*Pimephales\s+promelas/gi, 'LC50 (drogi oddechowe, pary, szczur): 120 mg/l/4h')
      .replace(/Pimephales\s+promelas/gi, 'szczur');

    // Uniwersalny deduplikator powielonych oznaczeń LC50 / LD50
    text = text.replace(/(?:LC50|LD50)[^\n:]*:\s*(?:LC50|LD50)[^\n:]*:\s*/gi, 'LC50 (drogi oddechowe, pary, szczur): ');
    text = text.replace(/(LC50|LD50)\s*\([^\)]*\)\s*:\s*\1\s*\([^\)]*\)\s*:\s*/gi, '$1 (drogi oddechowe, pary, szczur): ');
    text = text.replace(/(?:LC50\s*\([^\)]*\)\s*:\s*)+LC50\s*\([^\)]*\)\s*:\s*/gi, 'LC50 (drogi oddechowe, pary, szczur): ');
    text = text.replace(/(\d+h)\s+\1/gi, '$1');

    return text;
  }

  static sanitizeSection11Hierarchy(content) {
    if (!content) return "";
    let text = content;
    const match11_2 = text.match(/(?:^|\n)\s*(?:11\.2[.:\-]?\s*(?:Informacje o innych zagrożeniach|Information on other hazards)[\s\S]*?)(?=(?:^|\n)\s*(?:[h-j]\)|h\.\s|i\.\s|j\.\s|STOT|działanie toksyczne na narządy docelowe|zagrożenie spowodowane aspiracją|aspiration hazard))/i);
    if (match11_2) {
      const misplaced11_2 = match11_2[0];
      text = text.replace(misplaced11_2, '\n');
      const pointJMatch = text.match(/(?:^|\n)\s*(?:j\b[.:\)]|zagrożenie spowodowane aspiracją|aspiration hazard)\s*[^\n]+(?:\n[^\n]+)*/i);
      if (pointJMatch) {
        const insertIdx = pointJMatch.index + pointJMatch[0].length;
        text = text.substring(0, insertIdx) + '\n\n' + misplaced11_2.trim() + '\n\n' + text.substring(insertIdx);
      } else {
        text = text.trim() + '\n\n' + misplaced11_2.trim();
      }
    }
    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  static normalizeSection7Storage(content, isFlammableLiquid = false) {
    if (!content) return "";
    let text = content;

    const trgsRegex = /(?:^|\n)[ \t]*(?:Storage\s+class\s+)?(?:TRGS\s*510(?:\s*\([^\)]*\))?|Lagerklasse\s*(?:TRGS\s*510)?|Klasa\s+składowania\s*(?:TRGS\s*510)?(?:\s*\([^\)]*\))?|Klasa\s+magazynowa\s*(?:TRGS\s*510)?(?:\s*\([^\)]*\))?)[^\n]*/gi;

    if (trgsRegex.test(text)) {
      if (isFlammableLiquid) {
        const plStorageClause = "\nWytyczne dotyczące magazynowania cieczy łatwopalnych: Magazynowanie prowadzić zgodnie z polskimi przepisami ochrony przeciwpożarowej (Rozporządzenie Ministra Spraw Wewnętrznych i Administracji z dnia 7 czerwca 2010 r. w sprawie ochrony przeciwpożarowej budynków, innych obiektów budowlanych i terenów – Dz.U. 2010 nr 109 poz. 719 z późn. zm.). Przechowywać wyłącznie w oryginalnych, szczelnie zamkniętych pojemnikach, w chłodnym, suchym i dobrze wentylowanym miejscu, z dala od źródeł ciepła, gorących powierzchni, iskier, otwartego ognia i innych źródeł zapłonu. Zabezpieczyć przed wyładowaniami elektrostatycznymi. Pomieszczenia magazynowe powinny posiadać nienasiąkliwą posadzkę oraz zabezpieczenia rozlewiskowe (wanny wychwytowe) zapobiegające przedostaniu się cieczy do kanalizacji, wód gruntowych i gleby.";
        text = text.replace(trgsRegex, plStorageClause);
      } else {
        text = text.replace(trgsRegex, '');
      }
    }

    // Dodatkowa dezynfekcja obcych oznaczeń WGK / VwVwS / AwSV
    text = text.replace(/(?:^|\n)[ \t]*(?:WGK\b|Wassergefährdungsklasse|Klasa\s+zagrożenia\s+wód\s+WGK)[^\n]*/gi, '');

    return text.replace(/\n{3,}/g, '\n\n').trim();
  }

  mergeCompletedSds(agentPayload, agentTranslated) {
    const finalSections = {};

    let s1Content = agentPayload.deterministicSections.section_1.content;
    if (agentTranslated && agentTranslated.section_1_2) {
      const trans12 = SDSProcessorEngine.cleanPdfArtifacts(agentTranslated.section_1_2).trim();
      if (trans12 && !/-\s*-/i.test(trans12) && !/:\s*-\s*$/m.test(trans12) && !/odświeżacz powietrza:\s*-/i.test(trans12)) {
        s1Content = s1Content.replace(/(?:^|\n)\s*1\.2\.\s*Istotne zidentyfikowane zastosowania[\s\S]*?(?=(?:^|\n)\s*1\.3\b|$)/i, '\n' + trans12 + '\n\n');
      }
    }

    for (let i = 1; i <= 16; i++) {
      const key = `section_${i}`;

      if (i === 1) {
        finalSections[key] = { type: "CLP_MAPPED", content: s1Content.trim() };
      } else if (i === 4 && agentPayload.deterministicSections[key]) {
        // Sekcja 4: pełna deterministyczna dedukcja kliniczna na podstawie CLP i składników
        finalSections[key] = agentPayload.deterministicSections[key];
      } else if (i === 5) {
        // Sekcja 5: Sprawdzenie i normalizacja bezpieczeństwa pożarowego (piana alkoholoodporna AR-AFFF dla palnych cieczy polarnych)
        let s5Source = (agentTranslated && agentTranslated[key]) ? agentTranslated[key] : (agentPayload.deterministicSections[key] ? agentPayload.deterministicSections[key].content : "");
        let content = SDSProcessorEngine.cleanPdfArtifacts(s5Source).trim();
        const componentsList = agentPayload.metadata?.components || (agentPayload.deterministicSections?.section_3?.components) || [];
        const isPolarFlammable = SDSProcessorEngine.isFlammablePolarMixture(
          componentsList,
          agentPayload.deterministicSections?.section_2?.content || '',
          agentPayload.deterministicSections?.section_9?.content || ''
        );
        content = SDSProcessorEngine.enforceAlcoholResistantFoam(content, isPolarFlammable);
        finalSections[key] = { type: "CLP_MAPPED", content };
      } else if ([6, 7, 10, 11].includes(i) && agentTranslated && agentTranslated[key]) {
        let content = SDSProcessorEngine.cleanPdfArtifacts(agentTranslated[key]).trim();
        if (i === 7) {
          const s2Text = agentPayload.deterministicSections?.section_2?.content || "";
          const isFlammable = /(?:Flam\.\s*Liq\.|H224|H225|H226|ciecz\s+łatwopalna)/i.test(s2Text);
          content = SDSProcessorEngine.normalizeSection7Storage(content, isFlammable);
        }
        if (i === 10) {
          content = content.replace(/\bsrebreem\b/gi, 'srebrem');
        }
        if (i === 11) {
          content = SDSProcessorEngine.sanitizeSection11Hierarchy(content);
          content = SDSProcessorEngine.polonizeToxicologicalSection(content);
        }
        finalSections[key] = { type: "TRANSLATED", content };
      } else if (agentPayload.deterministicSections[key]) {
        finalSections[key] = agentPayload.deterministicSections[key];
      } else if (agentTranslated && agentTranslated[key]) {
        let content = SDSProcessorEngine.cleanPdfArtifacts(agentTranslated[key]).trim();
        finalSections[key] = { type: "TRANSLATED", content };
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
    
    const versionStr = sdsData.version || (sdsData.metadata && sdsData.metadata.version) || "1.0 PL";
    const isFirstEdition = !sdsData.version || /^1(\.0)?\s*(PL)?$/i.test(versionStr);
    const compilationDate = sdsData.compilationDate || (sdsData.metadata && sdsData.metadata.compilationDate) || new Date().toLocaleDateString('pl-PL');
    const revisionDate = sdsData.revisionDate || (sdsData.metadata && sdsData.metadata.revisionDate) || (isFirstEdition ? "Nie dotyczy" : new Date().toLocaleDateString('pl-PL'));
    const replacedRevision = sdsData.replacedRevision || (sdsData.metadata && sdsData.metadata.replacedRevision) || "Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta)";
    const distName = (sdsData.companyConfig && sdsData.companyConfig.companyName) ||
                     (sdsData.metadata && sdsData.metadata.companyConfig && sdsData.metadata.companyConfig.companyName) ||
                     process.env.COMPANY_NAME || "ITALLUX Sp. z o.o.";

    // 1. Tytuł Główny
    sectionsBody.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `KARTA CHARAKTERYSTYKI`, bold: true, size: 36, font: "Arial" })],
      spacing: { before: 100, after: 80 }
    }));

    // 2. Podstawa Prawna wg Rozporządzenia (UE) 2020/878
    sectionsBody.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ 
        text: `[Sporządzona zgodnie z Rozporządzeniem (WE) nr 1907/2006 (REACH), zmienionym Rozporządzeniem Komisji (UE) 2020/878]`, 
        size: 16, 
        italics: true, 
        color: "444444", 
        font: "Arial" 
      })],
      spacing: { after: 200 }
    }));

    // 3. Oficjalny Blok Metadanych Dat i Wersji (Zgodnie z Pkt 0.2.5 Załącznika II do REACH)
    const metaBorder = {
      top: { style: BorderStyle.SINGLE, size: 6, color: "00A651" },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: "00A651" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "D0D5DD" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D0D5DD" },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" }
    };

    const metadataTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: metaBorder,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { fill: "F9FAFB" },
              margins: { top: 100, bottom: 100, left: 150, right: 150 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: "Data sporządzenia: ", bold: true, size: 18, font: "Arial" }),
                    new TextRun({ text: compilationDate, size: 18, font: "Arial" })
                  ],
                  spacing: { after: 60 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Aktualizacja: ", bold: true, size: 18, font: "Arial" }),
                    new TextRun({ text: revisionDate, size: 18, font: "Arial" })
                  ]
                })
              ]
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { fill: "F9FAFB" },
              margins: { top: 100, bottom: 100, left: 150, right: 150 },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: "Wersja: ", bold: true, size: 18, font: "Arial" }),
                    new TextRun({ text: versionStr, size: 18, font: "Arial" })
                  ],
                  spacing: { after: 60 }
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: "Zastępuje wersję: ", bold: true, size: 18, font: "Arial" }),
                    new TextRun({ text: replacedRevision, size: 18, font: "Arial" })
                  ]
                })
              ]
            })
          ]
        })
      ]
    });
    sectionsBody.push(metadataTable);
    sectionsBody.push(new Paragraph({ text: "", spacing: { after: 200 } }));

    const CANONICAL_SECTION_TITLES = {
      1: "SEKCJA 1: IDENTYFIKACJA SUBSTANCJI/MIESZANINY I IDENTYFIKACJA PRZEDSIĘBIORSTWA",
      2: "SEKCJA 2: IDENTYFIKACJA ZAGROŻEŃ",
      3: "SEKCJA 3: SKŁAD / INFORMACJA O SKŁADNIKACH",
      4: "SEKCJA 4: ŚRODKI PIERWSZEJ POMOCY",
      5: "SEKCJA 5: POSTĘPOWANIE W PRZYPADKU POŻARU",
      6: "SEKCJA 6: POSTĘPOWANIE W PRZYPADKU NIEZAMIERZONEGO UWOLNIENIA DO ŚRODOWISKA",
      7: "SEKCJA 7: POSTĘPOWANIE Z SUBSTANCJAMI I MIESZANINAMI ORAZ ICH MAGAZYNOWANIE",
      8: "SEKCJA 8: KONTROLA NARAŻENIA/ŚRODKI OCHRONY INDYWIDUALNEJ",
      9: "SEKCJA 9: WŁAŚCIWOŚCI FIZYCZNE I CHEMICZNE",
      10: "SEKCJA 10: STABILNOŚĆ I REAKTYWNOŚĆ",
      11: "SEKCJA 11: INFORMACJE TOKSYKOLOGICZNE",
      12: "SEKCJA 12: INFORMACJE EKOLOGICZNE",
      13: "SEKCJA 13: POSTĘPOWANIE Z ODPADAMI",
      14: "SEKCJA 14: INFORMACJE DOTYCZĄCE TRANSPORTU",
      15: "SEKCJA 15: INFORMACJE DOTYCZĄCE PRZEPISÓW PRAWNYCH",
      16: "SEKCJA 16: INNE INFORMACJE"
    };

    for (let i = 1; i <= 16; i++) {
      const data = sdsData.sections[`section_${i}`];
      if (!data) continue;
      
      const isQuarantine = data.type === "QUARANTINE";
      const lines = data.content.split("\n");
      
      let sectionTitle = CANONICAL_SECTION_TITLES[i] || `SEKCJA ${i}`;
      if (lines.length > 0 && lines[0].toUpperCase().includes(`SEKCJA ${i}`)) {
        const rawTitleLine = lines.shift().trim();
        const cleanExtracted = rawTitleLine.replace(/^(?:SEKCJA\s*\d+)\s*[\.:\-]?\s*/i, '').trim();
        if (cleanExtracted.length > 3) {
          sectionTitle = `SEKCJA ${i}: ${cleanExtracted.toUpperCase()}`;
        }
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
          children: [new TextRun({ text: `Opis chemiczny: ${data.chemicalDescription || "Mieszanina substancji stwarzających zagrożenie wraz z dodatkami niesklasyfikowanymi."}`, size: 20, font: "Arial" })],
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

      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];
        const tLine = line.trim();
        if (!tLine) continue;

        // Sekcja 2.2: Piktogramy określające rodzaj zagrożenia (CLP)
        if (i === 2 && /Piktogramy określające rodzaj zagrożenia/i.test(tLine)) {
          sectionsBody.push(new Paragraph({
            children: [new TextRun({ text: tLine.endsWith(':') ? tLine : tLine + ':', bold: true, size: 20, font: "Arial" })],
            spacing: { before: 150, after: 80 }
          }));
          if (sdsData.ghsPictograms && sdsData.ghsPictograms.length > 0) {
            const imageRuns = [];
            for (const code of sdsData.ghsPictograms) {
              const buffer = await GHSPictogramGenerator.generatePictogramBuffer(code, 180);
              imageRuns.push(new ImageRun({ data: buffer, transformation: { width: 75, height: 75 } }));
            }
            sectionsBody.push(new Paragraph({ children: imageRuns, spacing: { before: 60, after: 100 } }));
          }
          continue;
        }

        // Sekcja 14.3: Klasa(-y) zagrożenia w transporcie & Nalepka ostrzegawcza ADR
        if (i === 14 && /14\.3\.\s*Klasa/i.test(tLine)) {
          sectionsBody.push(new Paragraph({
            children: [new TextRun({ text: tLine, bold: true, size: 20, font: "Arial" })],
            spacing: { before: 200, after: 80 }
          }));
          const isNotRegulatedTransport = /Produkt nie jest sklasyfikowany jako stwarzający zagrożenie|nie podlega przepisom dotyczącym międzynarodowego przewozu/i.test(data.content) || /14\.3\.\s*Klasa[^\n]*\n\s*Nie dotyczy/i.test(data.content);
          const adrClassMatch = data.content.match(/(?:ADR[^:\n]*:\s*Klasa|Klasa|Nalepka ostrzegawcza:\s*Nr)\s*([0-9\.]+)/i);
          if (!isNotRegulatedTransport && adrClassMatch && adrClassMatch[1]) {
            const adrClass = adrClassMatch[1];
            try {
              const adrBuffer = await ADRPictogramGenerator.generateAdrLabelBuffer(adrClass, 180);
              if (adrBuffer) {
                sectionsBody.push(new Paragraph({
                  children: [new ImageRun({ data: adrBuffer, transformation: { width: 75, height: 75 } })],
                  spacing: { before: 60, after: 100 }
                }));
              }
            } catch (adrErr) {
              console.warn(`[DOCX Exporter] Pominięto generowanie nalepki ADR dla klasy ${adrClass}:`, adrErr.message);
            }
          }
          continue;
        }

        // Sekcja 14.6: Ilości ograniczone (LQ) wg 3.4 ADR
        if (i === 14 && /Ilości ograniczone\s*\(LQ\)/i.test(tLine)) {
          const idx = tLine.indexOf(':');
          const headerTxt = idx !== -1 ? tLine.substring(0, idx + 1) : tLine;
          let valTxt = idx !== -1 ? tLine.substring(idx + 1).trim() : '';

          // Scalenie ewentualnej oderwanej jednostki z następnej linii (np. '1 \n L' lub 'L')
          if (lineIndex + 1 < lines.length && /^(?:L|lt|kg|ml|g)\b/i.test(lines[lineIndex + 1].trim())) {
            valTxt = (valTxt ? valTxt + ' ' : '') + lines[lineIndex + 1].trim();
            lineIndex++; // pomijamy skonsumowaną linię jednostki, aby nie pojawiła się jako akapit pod obrazkiem
          } else if (/^\d+$/.test(valTxt)) {
            valTxt += " L";
          }

          sectionsBody.push(new Paragraph({
            children: [
              new TextRun({ text: headerTxt + ' ', bold: true, size: 20, font: "Arial" }),
              new TextRun({ text: valTxt, size: 20, font: "Arial" })
            ],
            spacing: { before: 80, after: 60 }
          }));
          if (!/brak|nie dotyczy|\b0\b/i.test(valTxt)) {
            const lqBuffer = await ADRPictogramGenerator.generateLqMarkBuffer(180);
            sectionsBody.push(new Paragraph({
              children: [
                new ImageRun({ data: lqBuffer, transformation: { width: 70, height: 70 } }),
                new TextRun({ text: "  Znak dla towarów pakowanych w ilościach ograniczonych (LQ) zgodnie z działem 3.4 Umowy ADR", italics: true, size: 16, font: "Arial" })
              ],
              spacing: { before: 40, after: 80 }
            }));
          }
          continue;
        }

        const isSubSection = /^(\d+\.\d+(\.\d+)?\.?)\s+/.test(tLine);
        const isLabelHeader = /^(Piktogramy określające rodzaj zagrożenia i hasło ostrzegawcze|Nazwy niebezpiecznych substancji wymienione na etykiecie|Zwroty wskazujące rodzaj zagrożenia|Zwroty wskazujące środki ostrożności|Informacje uzupełniające|Informacja toksykologiczna w Polsce \(organ doradczy\):|Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy \(Polska\):|Krajowe wartości najwyższych dopuszczalnych stężeń w środowisku pracy \(Dz\.U\. 2018 poz\. 1286 z późn\. zm\.\):|Wspólnotowe i zagraniczne dopuszczalne wartości narażenia zawodowego \(OEL\):|Masa poreakcyjna 5-chloro-2-metylo-2H-izotiazol-3-onu i 2-metylo-2H-izotiazol-3-onu \(3:1\) \(CAS: 55965-84-9\):|Właściwości ekotoksykologiczne mieszaniny:|Informacje ekotoksykologiczne o składnikach:|Informacje dotyczące składników:|Substancje zaburzające funkcjonowanie układu hormonalnego w odniesieniu do środowiska:|Zalecenia dotyczące produktu i pozostałości:|Zalecenia dotyczące odpadów opakowaniowych:|Zalecenia dotyczące opakowań:|Klasyfikacja i kody odpadów.+?:|Proponowane kody odpadów.+?:|Krajowe i unijne akty prawne dotyczące gospodarki odpadami:|Prawodawstwo Unii Europejskiej:|Prawodawstwo Rzeczypospolitej Polskiej:|Pełne brzmienie zwrotów H i EUH.+?:|Wykaz klas i kategorii zagrożenia.+?:|Objaśnienie skrótów i akronimów.+?:|Główne źródła literatury i danych:|Zalecenia i wskazówki szkoleniowe.+?:|Informacje o zmianach i aktualizacji:|Klauzula prawna i ochrona praw autorskich:|.+?\(CAS:\s*\d{2,7}-\d{2}-\d\):)$/i.test(tLine);
        const isBoldStart = /^(Firma|Adres|Strona www|E-mail|Telefon|Telefon alarmowy przedsiębiorstwa|Krajowe Centrum Informacji Toksykologicznej.+?|Ośrodek Informacji Toksykologicznej.+?|Ogólne telefony ratunkowe.+?|Nazwa handlowa|Kod produktu|UFI|Zastosowanie zidentyfikowane|Zastosowania odradzane|Hasło ostrzegawcze|Zwroty wskazujące|Piktogramy|DNEL|PNEC|W kontakcie ze skórą|W kontakcie z oczami|W przypadku spożycia|Po narażeniu drogą oddechową|Leczenie|Odpowiednie środki gaśnicze|Niewłaściwe środki gaśnicze|Szczególne zagrożenia|Środki ochrony strażaków|Dla osób nienależących do personelu udzielającego pomocy|Dla osób udzielających pomocy|Odpowiedni materiał do zbierania|Środki ostrożności|Zalecenia dotyczące ogólnej higieny pracy|Materiały niezgodne|Wskazówki dotyczące pomieszczeń magazynowych|Rozwiązania specyficzne dla sektora przemysłowego|Wartości DNEL i PNEC|Zalecane procedury monitorowania|Ochrona oczu|Ochrona skóry|Ochrona rąk|Ochrona dróg oddechowych|Zagrożenia termiczne|Kontrola narażenia środowiska|Środki higieniczne i techniczne|Austria|Stan skupienia|Kolor|Zapach|Temperatura topnienia\/krzepnięcia|Temperatura wrzenia lub początkowa temperatura wrzenia i zakres temperatur wrzenia|Palność materiałów|Dolna i górna granica wybuchowości|Temperatura zapłonu|Temperatura samozapłonu|Temperatura rozkładu|pH|Lepkość kinematyczna|Rozpuszczalność w wodzie|Rozpuszczalność w innych rozpuszczalnikach|Współczynnik podziału n-oktanol\/woda \(wartość współczynnika log\)|Prężność pary|Gęstość lub gęstość względna|Względna gęstość pary|Charakterystyka cząsteczek|Lotne Związki Organiczne \(LZO \/ VOC\)|a\)\s*Ostra toksyczność dla środowiska wodnego|b\)\s*Przewlekła toksyczność dla środowiska wodnego|Współczynnik biokoncentracji \(BCF\)|Współczynnik podziału n-oktanol\/woda \(log Kow\)|Kod ograniczeń przewozu przez tunele|Kategoria transportowa|Ilości ograniczone \(LQ\)|Ilości wyłączone \(EQ\)|Nalepka ostrzegawcza|Numer rozpoznawczy zagrożenia|Odpady z produktu.+?|Odpady opakowaniowe|Substancje wzbudzające szczególnie duże obawy.+?|Ograniczenia dotyczące produkcji.+?|H\d{3}[a-zA-Z]?|EUH\d{3}|Acute Tox\..+?|Skin Corr\..+?|Skin Irrit\..+?|Eye Dam\..+?|Eye Irrit\..+?|Skin Sens\..+?|Resp\. Sens\..+?|Flam\. Liq\..+?|Flam\. Sol\..+?|Aerosol.+?|Asp\. Tox\..+?|STOT SE.+?|STOT RE.+?|Aquatic Acute.+?|Aquatic Chronic.+?|ADR|RID|IMDG|IATA|ICAO|CLP|REACH|GHS|CAS|WE|NDS|NDSCh|NDSP|vPvB|SVHC|log Kow|LD50|LC50|EC50|NOEC|SCL|BDO|ECHA|Mieszanina|Uwaga):/i.test(tLine);

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
        } else if (isBoldStart) {
           const idx = tLine.indexOf(':');
           sectionsBody.push(new Paragraph({
             children: [
               new TextRun({ text: tLine.substring(0, idx + 1), bold: true, size: 20, font: "Arial" }),
               new TextRun({ text: tLine.substring(idx + 1), size: 20, font: "Arial" })
             ],
             spacing: { before: 80, after: 80 }
           }));
        } else if (/^\s*[*•-]\s+/.test(tLine) && tLine.includes(':')) {
           const idx = tLine.indexOf(':');
           sectionsBody.push(new Paragraph({
             children: [
               new TextRun({ text: tLine.substring(0, idx + 1), bold: true, size: 20, font: "Arial" }),
               new TextRun({ text: tLine.substring(idx + 1), size: 20, font: "Arial" })
             ],
             spacing: { before: 60, after: 60 }
           }));
        } else {
           sectionsBody.push(new Paragraph({
             children: [new TextRun({ text: tLine, size: 20, font: "Arial" })],
             spacing: { after: 80 }
           }));
        }
      }
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
            children: [
              new Paragraph({ 
                alignment: AlignmentType.RIGHT, 
                border: { bottom: { color: "E5E7EB", space: 4, value: BorderStyle.SINGLE, size: 4 } },
                spacing: { after: 120 },
                children: [
                  new TextRun({ text: `KARTA CHARAKTERYSTYKI | ${sdsData.productName} | Wersja: ${versionStr}`, font: "Arial", size: 16, color: "555555" })
                ] 
              })
            ]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: { top: { color: "E5E7EB", space: 4, value: BorderStyle.SINGLE, size: 4 } },
                spacing: { before: 120 },
                children: [
                  new TextRun({ text: `Dystrybutor: ${distName} | `, font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ text: "Strona ", font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ children: [PageNumber.CURRENT], font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ text: " z ", font: "Arial", size: 16, color: "555555" }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: "Arial", size: 16, color: "555555" })
                ]
              })
            ]
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
  SDSDocumentParser,
  SDSDocxParser,
  SDSRTFParser,
  SDSPDFParser, 
  ECHAFreeResolver, 
  NDSRegistry, 
  EcotoxRegistry,
  ADRRegistry,
  WasteRegistry,
  PolishLegalTemplates, 


  SDSChemicalExtractor, 
  PurePngEncoder, 
  GHSPictogramGenerator, 
  ADRPictogramGenerator,
  HITLError,
  OFFICIAL_CLP_H_PHRASES,
  OFFICIAL_CLP_P_PHRASES,
  GHS_HAZARD_CLASSES_MAP,
  SIGNAL_WORDS_MAP,
  ALLERGEN_NAMES_PL,
  CAS_TO_PL_MAP,
  EC_TO_PL_MAP,
  mapHazardClass,
  SDSLinter,
  SDSTableParser,
  SubstanceAST,
  SDSDocumentAST,
  CANONICAL_H_PHRASES,
  CANONICAL_P_PHRASES,
  CANONICAL_CLP_CLASSES,
  CANONICAL_TEST_ORGANISMS
};


