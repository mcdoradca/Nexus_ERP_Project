/**
 * ARCHITEKTURA SDS NEXUS ERP - DETERMINISTYCZNY SŁOWNIK URZĘDOWY ECHA / CLP
 * Moduł źródła prawdy (Single Source of Truth) terminologii chemiczno-prawnej
 * Rozporządzenie CLP (WE 1272/2008), REACH (UE 2020/878 Załącznik II), Dz.U. 2018 poz. 1286 / Dz.U. 2024 poz. 1017
 */

// ============================================================================
// 1. KANONICZNE ZWROTY WSKAZUJĄCE RODZAJ ZAGROŻENIA (ZWROTY H & EUH)
// ============================================================================
const CANONICAL_H_PHRASES = {
  // Zagrożenia fizyczne (H200 - H290)
  H200: "Materiały wybuchowe niestabilne.",
  H201: "Materiał wybuchowy; zagrożenie wybuchem masowym.",
  H202: "Materiał wybuchowy, poważne zagrożenie rozrzutem.",
  H203: "Materiał wybuchowy; zagrożenie pożarem, wybuchem lub rozrzutem.",
  H204: "Zagrożenie pożarem lub rozrzutem.",
  H205: "Może wybuchnąć masowo w przypadku pożaru.",
  H220: "Skrajnie łatwopalny gaz.",
  H221: "Gaz łatwopalny.",
  H222: "Skrajnie łatwopalny aerozol.",
  H223: "Łatwopalny aerozol.",
  H224: "Skrajnie łatwopalna ciecz i pary.",
  H225: "Wysoce łatwopalna ciecz i pary.",
  H226: "Łatwopalna ciecz i pary.",
  H228: "Substancja stała łatwopalna.",
  H229: "Pojemnik pod ciśnieniem: Ogrzanie grozi wybuchem.",
  H230: "Może reagować wybuchowo nawet bez dostępu powietrza.",
  H231: "Może reagować wybuchowo nawet bez dostępu powietrza pod zwiększonym ciśnieniem lub przy podwyższonej temperaturze.",
  H240: "Ogrzanie grozi wybuchem.",
  H241: "Ogrzanie może spowodować pożar lub wybuch.",
  H242: "Ogrzanie może spowodować pożar.",
  H250: "Zapala się samorzutnie w przypadku wystawienia na działanie powietrza.",
  H251: "Substancja samonagrzewająca się: może się zapalić.",
  H252: "Substancja samonagrzewająca się w wielkich ilościach; może się zapalić.",
  H260: "W kontakcie z wodą uwalnia łatwopalne gazy, które mogą ulegać samozapłonowi.",
  H261: "W kontakcie z wodą uwalnia łatwopalne gazy.",
  H270: "Może spowodować lub intensyfikować pożar; utleniacz.",
  H271: "Może spowodować pożar lub wybuch; silny utleniacz.",
  H272: "Może intensyfikować pożar; utleniacz.",
  H280: "Zawiera gaz pod ciśnieniem; ogrzanie grozi wybuchem.",
  H281: "Zawiera schłodzony gaz; może spowodować oparzenia kriogeniczne lub obrażenia.",
  H290: "Może powodować korozję metali.",

  // Zagrożenia dla zdrowia (H300 - H373)
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
  H350i: "Wdychanie może spowodować raka.",
  H350I: "Wdychanie może spowodować raka.",
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
  H361f: "Podejrzewa się, że działa szkodliwie na płodność.",
  H361F: "Podejrzewa się, że działa szkodliwie na płodność.",
  H361d: "Podejrzewa się, że działa szkodliwie na dziecko w łonie matki.",
  H361D: "Podejrzewa się, że działa szkodliwie na dziecko w łonie matki.",
  H361fd: "Podejrzewa się, że działa szkodliwie na płodność. Podejrzewa się, że działa szkodliwie na dziecko w łonie matki.",
  H361FD: "Podejrzewa się, że działa szkodliwie na płodność. Podejrzewa się, że działa szkodliwie na dziecko w łonie matki.",
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

  // Zagrożenia dla środowiska (H400 - H420)
  H400: "Działa bardzo toksycznie na organizmy wodne.",
  H410: "Działa bardzo toksycznie na organizmy wodne, powodując długotrwałe skutki.",
  H411: "Działa toksycznie na organizmy wodne, powodując długotrwałe skutki.",
  H412: "Działa szkodliwie na organizmy wodne, powodując długotrwałe skutki.",
  H413: "Może powodować długotrwałe szkodliwe skutki dla organizmów wodnych.",
  H420: "Szkodzi zdrowiu publicznemu i środowisku niszcząc ozon w wyższych warstwach atmosfery.",

  // Dodatkowe unijne zwroty EUH
  EUH014: "Reaguje gwałtownie z wodą.",
  EUH018: "Podczas stosowania mogą powstawać łatwopalne lub wybuchowe mieszaniny par z powietrzem.",
  EUH019: "Może tworzyć wybuchowe nadtlenki.",
  EUH044: "Zagrożenie wybuchem po ogrzaniu w zamkniętym pojemniku.",
  EUH066: "Powtarzające się narażenie może powodować wysuszanie lub pękanie skóry.",
  EUH070: "Działa toksycznie w kontakcie z oczami.",
  EUH071: "Działa żrąco na drogi oddechowe.",
  EUH201: "Zawiera ołów. Nie należy stosować na powierzchniach, które mogą być gryzione lub ssane przez dzieci.",
  EUH202: "Cyjanoakrylan. Niebezpieczeństwo. Skleja skórę i powieki w ciągu kilku sekund. Chronić przed dziećmi.",
  EUH204: "Zawiera izocyjaniany. Może powodować wystąpienie reakcji alergicznej.",
  EUH205: "Zawiera składniki epoksydowe. Może powodować wystąpienie reakcji alergicznej.",
  EUH208: "Zawiera [nazwa substancji uczulającej]. Może powodować wystąpienie reakcji alergicznej.",
  EUH210: "Karta charakterystyki dostępna na żądanie.",
  EUH380: "Może powodować zaburzenia funkcjonowania układu hormonalnego u ludzi.",
  EUH381: "Podejrzewa się, że powoduje zaburzenia funkcjonowania układu hormonalnego u ludzi."
};

// ============================================================================
// 2. KANONICZNE ZWROTY WSKAZUJĄCE ŚRODKI OSTROŻNOŚCI (ZWROTY P)
// ============================================================================
const CANONICAL_P_PHRASES = {
  P101: "W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.",
  P102: "Chronić przed dziećmi.",
  P103: "Uważnie przeczytać wszystkie instrukcje i zastosować się do nich.",
  P201: "Przed użyciem zapoznać się ze specjalnymi środkami ostrożności.",
  P202: "Nie używać przed zapoznaniem się i zrozumieniem wszystkich środków bezpieczeństwa.",
  P210: "Przechowywać z dala od źródeł ciepła, gorących powierzchni, źródeł iskrzenia, otwartego ognia i innych źródeł zapłonu. Nie palić.",
  P211: "Nie rozpylać nad otwartym ogniem lub innym źródłem zapłonu.",
  P220: "Trzymać z dala od odzieży i innych materiałów zapalnych.",
  P233: "Przechowywać pojemnik szczelnie zamknięty.",
  P234: "Przechowywać wyłącznie w oryginalnym opakowaniu.",
  P235: "Przechowywać w chłodnym miejscu.",
  P240: "Uziemić i połączyć pojemnik i sprzęt odbiorczy.",
  P241: "Używać przeciwwybuchowego sprzętu elektrycznego/wentylującego/oświetleniowego.",
  P242: "Używać nieiskrzących narzędzi.",
  P243: "Przedsięwziąć środki ostrożności zapobiegające statycznemu rozładowaniu.",
  P260: "Nie wdychać pyłu/dymu/gazu/mgły/par/rozpylonej cieczy.",
  P261: "Unikać wdychania pyłu/dymu/gazu/mgły/par/rozpylonej cieczy.",
  P262: "Nie wprowadzać do oczu, na skórę lub na odzież.",
  P263: "Unikać kontaktu w czasie ciąży i podczas karmienia piersią.",
  P264: "Dokładnie umyć ręce po użyciu.",
  P270: "Nie jeść, nie pić i nie palić podczas używania produktu.",
  P271: "Stosować wyłącznie na zewnątrz lub w dobrze wentylowanym pomieszczeniu.",
  P272: "Zanieczyszczonej odzieży ochronnej nie wynosić poza miejsce pracy.",
  P273: "Unikać uwolnienia do środowiska.",
  P280: "Stosować rękawice ochronne/odzież ochronną/ochronę oczu/ochronę twarzy.",
  P284: "[W przypadku niedostatecznej wentylacji] stosować indywidualne środki ochrony dróg oddechowych.",

  // Reagowanie (P300 - P391)
  P301: "W PRZYPADKU POŁKNIĘCIA:",
  P302: "W PRZYPADKU KONTAKTU ZE SKÓRĄ:",
  P303: "W PRZYPADKU KONTAKTU ZE SKÓRĄ (lub z włosami):",
  P304: "W PRZYPADKU DOSTANIA SIĘ DO DRÓG ODDECHOWYCH:",
  P305: "W PRZYPADKU DOSTANIA SIĘ DO OCZÓW:",
  P308: "W przypadku narażenia lub styczności:",
  P310: "Natychmiast skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  P311: "Skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  P312: "W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  P314: "W przypadku złego samopoczucia zasięgnąć porady/zgłosić się pod opiekę lekarza.",
  P321: "Zastosować określone leczenie (patrz na etykiecie).",
  P330: "Wypłukać usta.",
  P331: "NIE wywoływać wymiotów.",
  P332: "W przypadku wystąpienia podrażnienia skóry:",
  P333: "W przypadku wystąpienia podrażnienia skóry lub wysypki:",
  P337: "W przypadku utrzymywania się działania drażniącego na oczy:",
  P338: "Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.",
  P340: "Wyprowadzić lub wynieść poszkodowanego na świeże powietrze i zapewnić mu warunki do swobodnego oddychania.",
  P342: "W przypadku wystąpienia objawów ze strony układu oddechowego:",
  P351: "Ostrożnie płukać wodą przez kilka minut.",
  P352: "Umyć dużą ilością wody z mydłem.",
  P353: "Natychmiast zdjąć całą zanieczyszczoną odzież. Spłukać skórę pod strumieniem wody [lub prysznicem].",
  P361: "Natychmiast zdjąć całą zanieczyszczoną odzież.",
  P362: "Zdjąć zanieczyszczoną odzież.",
  P363: "Wyprać zanieczyszczoną odzież przed ponownym użyciem.",
  P370: "W przypadku pożaru:",
  P378: "Użyć odpowiednich środków gaśniczych do gaszenia.",
  P391: "Zebrać wyciek.",

  // Zwroty łączone P
  "P301+P310": "W PRZYPADKU POŁKNIĘCIA: Natychmiast skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  "P301+P312": "W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.",
  "P301+P330+P331": "W PRZYPADKU POŁKNIĘCIA: Wypłukać usta. NIE wywoływać wymiotów.",
  "P302+P352": "W PRZYPADKU KONTAKTU ZE SKÓRĄ: Umyć dużą ilością wody z mydłem.",
  "P303+P361+P353": "W PRZYPADKU KONTAKTU ZE SKÓRĄ (lub z włosami): Natychmiast zdjąć całą zanieczyszczoną odzież. Spłukać skórę pod strumieniem wody [lub prysznicem].",
  "P304+P340": "W PRZYPADKU DOSTANIA SIĘ DO DRÓG ODDECHOWYCH: Wyprowadzić lub wynieść poszkodowanego na świeże powietrze i zapewnić mu warunki do swobodnego oddychania.",
  "P305+P351+P338": "W PRZYPADKU DOSTANIA SIĘ DO OCZÓW: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.",
  "P308+P313": "W przypadku narażenia lub styczności: Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
  "P332+P313": "W przypadku wystąpienia podrażnienia skóry: Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
  "P333+P313": "W przypadku wystąpienia podrażnienia skóry lub wysypki: Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
  "P337+P313": "W przypadku utrzymywania się działania drażniącego na oczy: Zasięgnąć porady/zgłosić się pod opiekę lekarza.",
  "P370+P378": "W przypadku pożaru: Użyć piany alkoholoodpornej, dwutlenku węgla (CO2), proszku gaśniczego lub mgły wodnej do gaszenia.",

  // Przechowywanie (P401 - P420)
  P401: "Przechowywać zgodnie z lokalnymi/regionalnymi/krajowymi/międzynarodowymi przepisami.",
  P402: "Przechowywać w suchym miejscu.",
  P403: "Przechowywać w dobrze wentylowanym miejscu.",
  P404: "Przechowywać w zamkniętym pojemniku.",
  P405: "Przechowywać pod zamknięciem.",
  P410: "Chronić przed światłem słonecznym.",
  P411: "Przechowywać w temperaturze nieprzekraczającej określonej wartości.",
  P412: "Nie wystawiać na działanie temperatury przekraczającej 50 °C/122 °F.",
  "P403+P233": "Przechowywać w dobrze wentylowanym miejscu. Przechowywać pojemnik szczelnie zamknięty.",
  "P403+P235": "Przechowywać w dobrze wentylowanym miejscu. Przechowywać w chłodnym miejscu.",
  "P410+P403": "Chronić przed światłem słonecznym. Przechowywać w dobrze wentylowanym miejscu.",
  "P410+P412": "Chronić przed światłem słonecznym. Nie wystawiać na działanie temperatury przekraczającej 50 °C/122 °F.",

  // Usuwanie (P501)
  P501: "Zawartość/pojemnik usuwać do uprawnionego zakładu unieszkodliwiania odpadów zgodnie z przepisami krajowymi."
};

// ============================================================================
// 3. KANONICZNE MAPOWANIE KLAS ZAGROŻEŃ CLP (TABELA 3.1 ZAŁĄCZNIK VI)
// ============================================================================
const CANONICAL_CLP_CLASSES = {
  // Ciecze łatwopalne
  "Flam. Liq. 1": { pl: "Substancja ciekła łatwopalna, kategoria 1", ghs: "GHS02", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H224" },
  "Flam. Liq. 2": { pl: "Substancja ciekła łatwopalna, kategoria 2", ghs: "GHS02", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H225" },
  "Flam. Liq. 3": { pl: "Substancja ciekła łatwopalna, kategoria 3", ghs: "GHS02", signal: "UWAGA", hDefault: "H226" },
  // Ciała stałe łatwopalne
  "Flam. Sol. 1": { pl: "Substancja stała łatwopalna, kategoria 1", ghs: "GHS02", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H228" },
  "Flam. Sol. 2": { pl: "Substancja stała łatwopalna, kategoria 2", ghs: "GHS02", signal: "UWAGA", hDefault: "H228" },
  // Toksyczność ostra - droga pokarmowa
  "Acute Tox. 1 (Oral)": { pl: "Toksyczność ostra (droga pokarmowa), kategoria 1", ghs: "GHS06", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H300" },
  "Acute Tox. 2 (Oral)": { pl: "Toksyczność ostra (droga pokarmowa), kategoria 2", ghs: "GHS06", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H300" },
  "Acute Tox. 3 (Oral)": { pl: "Toksyczność ostra (droga pokarmowa), kategoria 3", ghs: "GHS06", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H301" },
  "Acute Tox. 4 (Oral)": { pl: "Toksyczność ostra (droga pokarmowa), kategoria 4", ghs: "GHS07", signal: "UWAGA", hDefault: "H302" },
  // Toksyczność ostra - skóra
  "Acute Tox. 1 (Dermal)": { pl: "Toksyczność ostra (w kontakcie ze skórą), kategoria 1", ghs: "GHS06", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H310" },
  "Acute Tox. 2 (Dermal)": { pl: "Toksyczność ostra (w kontakcie ze skórą), kategoria 2", ghs: "GHS06", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H310" },
  "Acute Tox. 3 (Dermal)": { pl: "Toksyczność ostra (w kontakcie ze skórą), kategoria 3", ghs: "GHS06", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H311" },
  "Acute Tox. 4 (Dermal)": { pl: "Toksyczność ostra (w kontakcie ze skórą), kategoria 4", ghs: "GHS07", signal: "UWAGA", hDefault: "H312" },
  // Toksyczność ostra - inhalacja
  "Acute Tox. 1 (Inhalation)": { pl: "Toksyczność ostra (w następstwie wdychania), kategoria 1", ghs: "GHS06", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H330" },
  "Acute Tox. 2 (Inhalation)": { pl: "Toksyczność ostra (w następstwie wdychania), kategoria 2", ghs: "GHS06", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H330" },
  "Acute Tox. 3 (Inhalation)": { pl: "Toksyczność ostra (w następstwie wdychania), kategoria 3", ghs: "GHS06", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H331" },
  "Acute Tox. 4 (Inhalation)": { pl: "Toksyczność ostra (w następstwie wdychania), kategoria 4", ghs: "GHS07", signal: "UWAGA", hDefault: "H332" },
  // Żrące / drażniące na skórę
  "Skin Corr. 1A": { pl: "Działanie żrące na skórę, kategoria 1A", ghs: "GHS05", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H314" },
  "Skin Corr. 1B": { pl: "Działanie żrące na skórę, kategoria 1B", ghs: "GHS05", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H314" },
  "Skin Corr. 1C": { pl: "Działanie żrące na skórę, kategoria 1C", ghs: "GHS05", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H314" },
  "Skin Corr. 1":  { pl: "Działanie żrące na skórę, kategoria 1", ghs: "GHS05", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H314" },
  "Skin Irrit. 2": { pl: "Działanie drażniące na skórę, kategoria 2", ghs: "GHS07", signal: "UWAGA", hDefault: "H315" },
  // Uszkodzenie / podrażnienie oczu
  "Eye Dam. 1": { pl: "Poważne uszkodzenie oczu, kategoria 1", ghs: "GHS05", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H318" },
  "Eye Irrit. 2": { pl: "Działanie drażniące na oczy, kategoria 2", ghs: "GHS07", signal: "UWAGA", hDefault: "H319" },
  // Uczulenia
  "Resp. Sens. 1": { pl: "Działanie uczulające na drogi oddechowe, kategoria 1", ghs: "GHS08", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H334" },
  "Skin Sens. 1": { pl: "Działanie uczulające na skórę, kategoria 1", ghs: "GHS07", signal: "UWAGA", hDefault: "H317" },
  "Skin Sens. 1A": { pl: "Działanie uczulające na skórę, kategoria 1A", ghs: "GHS07", signal: "UWAGA", hDefault: "H317" },
  "Skin Sens. 1B": { pl: "Działanie uczulające na skórę, kategoria 1B", ghs: "GHS07", signal: "UWAGA", hDefault: "H317" },
  // STOT
  "STOT SE 1": { pl: "Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 1", ghs: "GHS08", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H370" },
  "STOT SE 2": { pl: "Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 2", ghs: "GHS08", signal: "UWAGA", hDefault: "H371" },
  "STOT SE 3": { pl: "Działanie toksyczne na narządy docelowe – narażenie jednorazowe, kategoria 3", ghs: "GHS07", signal: "UWAGA", hDefault: "H335" },
  "STOT RE 1": { pl: "Działanie toksyczne na narządy docelowe – narażenie powtarzane, kategoria 1", ghs: "GHS08", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H372" },
  "STOT RE 2": { pl: "Działanie toksyczne na narządy docelowe – narażenie powtarzane, kategoria 2", ghs: "GHS08", signal: "UWAGA", hDefault: "H373" },
  // Aspiracja
  "Asp. Tox. 1": { pl: "Zagrożenie spowodowane aspiracją, kategoria 1", ghs: "GHS08", signal: "NIEBEZPIECZEŃSTWO", hDefault: "H304" },
  // Zagrożenie dla środowiska wodnego
  "Aquatic Acute 1": { pl: "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie ostre, kategoria 1", ghs: "GHS09", signal: "UWAGA", hDefault: "H400" },
  "Aquatic Chronic 1": { pl: "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 1", ghs: "GHS09", signal: "UWAGA", hDefault: "H410" },
  "Aquatic Chronic 2": { pl: "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 2", ghs: "GHS09", signal: null, hDefault: "H411" },
  "Aquatic Chronic 3": { pl: "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 3", ghs: null, signal: null, hDefault: "H412" },
  "Aquatic Chronic 4": { pl: "Stwarzające zagrożenie dla środowiska wodnego – zagrożenie przewlekłe, kategoria 4", ghs: null, signal: null, hDefault: "H413" }
};

// ============================================================================
// 4. OFICJALNY SŁOWNIK ORGANIZMÓW TESTOWYCH (TOKSYKOLOGIA I EKOTOKSYKOLOGIA)
// BEZWZGLĘDNY ZAKAZ PODMIENIANIA GATUNKÓW!
// ============================================================================
const CANONICAL_TEST_ORGANISMS = {
  // Ryby słodkowodne
  "pimephales promelas": { latin: "Pimephales promelas", pl: "Strzebla potokowa (Dzierżak)", group: "ryby" },
  "oncorhynchus mykiss": { latin: "Oncorhynchus mykiss", pl: "Pstrąg tęczowy", group: "ryby" },
  "danio rerio": { latin: "Danio rerio", pl: "Danio pręgowany", group: "ryby" },
  "cyprinus carpio": { latin: "Cyprinus carpio", pl: "Karp", group: "ryby" },
  "oryzias latipes": { latin: "Oryzias latipes", pl: "Kaczorek japoński (Medaka)", group: "ryby" },
  "leuciscus idus": { latin: "Leuciscus idus", pl: "Jaź", group: "ryby" },
  "poecilia reticulata": { latin: "Poecilia reticulata", pl: "Gupik", group: "ryby" },
  "fish": { latin: "Pisces", pl: "Ryby", group: "ryby" },
  "pesci": { latin: "Pisces", pl: "Ryby", group: "ryby" },

  // Bezkręgowce wodne / Skorupiaki
  "daphnia magna": { latin: "Daphnia magna", pl: "Rozwielitka wielka (Daphnia)", group: "skorupiaki" },
  "ceriodaphnia dubia": { latin: "Ceriodaphnia dubia", pl: "Rozwielitka (Ceriodaphnia dubia)", group: "skorupiaki" },
  "daphnia pulex": { latin: "Daphnia pulex", pl: "Rozwielitka pospolita", group: "skorupiaki" },
  "crustaceans": { latin: "Crustacea", pl: "Skorupiaki", group: "skorupiaki" },
  "crostacei": { latin: "Crustacea", pl: "Skorupiaki", group: "skorupiaki" },

  // Glony i rośliny wodne
  "pseudokirchneriella subcapitata": { latin: "Pseudokirchneriella subcapitata", pl: "Glony (Pseudokirchneriella subcapitata)", group: "glony" },
  "selenastrum capricornutum": { latin: "Selenastrum capricornutum", pl: "Glony (Selenastrum capricornutum)", group: "glony" },
  "desmodesmus subspicatus": { latin: "Desmodesmus subspicatus", pl: "Glony (Desmodesmus subspicatus)", group: "glony" },
  "scenedesmus subspicatus": { latin: "Scenedesmus subspicatus", pl: "Glony (Scenedesmus subspicatus)", group: "glony" },
  "algae": { latin: "Algae", pl: "Glony", group: "glony" },
  "alghe": { latin: "Algae", pl: "Glony", group: "glony" },
  "lemna gibba": { latin: "Lemna gibba", pl: "Rzęsa garbata", group: "rośliny" },

  // Zwierzęta laboratoryjne (Toksykologia)
  "rat": { latin: "Rattus norvegicus", pl: "szczur", group: "ssaki" },
  "rats": { latin: "Rattus norvegicus", pl: "szczury", group: "ssaki" },
  "ratto": { latin: "Rattus norvegicus", pl: "szczur", group: "ssaki" },
  "ratti": { latin: "Rattus norvegicus", pl: "szczury", group: "ssaki" },
  "rabbit": { latin: "Oryctolagus cuniculus", pl: "królik", group: "ssaki" },
  "rabbits": { latin: "Oryctolagus cuniculus", pl: "króliki", group: "ssaki" },
  "coniglio": { latin: "Oryctolagus cuniculus", pl: "królik", group: "ssaki" },
  "conigli": { latin: "Oryctolagus cuniculus", pl: "króliki", group: "ssaki" },
  "mouse": { latin: "Mus musculus", pl: "mysz", group: "ssaki" },
  "mice": { latin: "Mus musculus", pl: "myszy", group: "ssaki" },
  "topo": { latin: "Mus musculus", pl: "mysz", group: "ssaki" },
  "topi": { latin: "Mus musculus", pl: "myszy", group: "ssaki" },
  "guinea pig": { latin: "Cavia porcellus", pl: "świnka morska", group: "ssaki" },
  "porcellino d'india": { latin: "Cavia porcellus", pl: "świnka morska", group: "ssaki" },
  "human": { latin: "Homo sapiens", pl: "człowiek", group: "ludzie" },
  "uomo": { latin: "Homo sapiens", pl: "człowiek", group: "ludzie" }
};

// ============================================================================
// 5. TERMINOLOGIA FIZYKOCHEMICZNA WG ZAŁĄCZNIKA II REACH (UE 2020/878)
// 21 parametrów podsekcji 9.1
// ============================================================================
const CANONICAL_SECTION_9_PARAMETERS = [
  { key: "physical_state", pl: "Stan skupienia", required: true },
  { key: "color", pl: "Kolor", required: true },
  { key: "odor", pl: "Zapach", required: true },
  { key: "melting_point", pl: "Temperatura topnienia/krzepnięcia", required: true },
  { key: "boiling_point", pl: "Początkowa temperatura wrzenia i zakres temperatur wrzenia", required: true },
  { key: "flammability", pl: "Palność materiałów", required: true },
  { key: "lower_upper_explosion_limit", pl: "Dolna i górna granica wybuchowości", required: true },
  { key: "flash_point", pl: "Temperatura zapłonu", required: true },
  { key: "auto_ignition", pl: "Temperatura samozapłonu", required: true },
  { key: "decomposition", pl: "Temperatura rozkładu", required: true },
  { key: "ph", pl: "pH", required: true },
  { key: "kinematic_viscosity", pl: "Lepkość kinematyczna", required: true },
  { key: "solubility", pl: "Rozpuszczalność", required: true },
  { key: "partition_coefficient", pl: "Współczynnik podziału n-oktanol/woda (wartość współczynnika log)", required: true },
  { key: "vapor_pressure", pl: "Prężność par", required: true },
  { key: "density_relative_density", pl: "Gęstość lub gęstość względna", required: true },
  { key: "relative_vapor_density", pl: "Względna gęstość pary", required: true },
  { key: "particle_characteristics", pl: "Charakterystyka cząstek", required: true }
];

module.exports = {
  CANONICAL_H_PHRASES,
  CANONICAL_P_PHRASES,
  CANONICAL_CLP_CLASSES,
  CANONICAL_TEST_ORGANISMS,
  CANONICAL_SECTION_9_PARAMETERS
};
