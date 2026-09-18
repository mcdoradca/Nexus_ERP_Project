// Auto-extracted module: HITLError
const fs = require('fs');
const path = require('path');

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
  EUH208: "Zawiera [nazwa substancji uczulającej]. Może powodować wystąpienie reakcji alergicznej.",
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
  "3,7-dimethyloct-6-en-1-ol": "cytronellol",
  "3,7-dimethylnona-1,6-dien-3-ol": "(6E)-3,7-dimethylnona-1,6-dien-3-ol",
  "isoeugenol": "izoeugenol",
  "eugenol": "eugenol",
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
  "10339-55-6": "(6E)-3,7-dimethylnona-1,6-dien-3-ol",
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

module.exports = { HITLError };
