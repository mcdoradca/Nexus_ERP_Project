# ADR-065: Pełna Zgodność Prawno-Chemiczna Silnika SDS (UE 2020/878), Eliminacja Wycieków Obcojęzycznych i Stabilizacja Mostka Word COM

## Status
Zaakceptowany (Accepted) - Wdrożony na produkcji

## Kontekst
Wdrożenie obsługi kart SDS w formacie RTF (ADR-061–064) obnażyło krytyczne luki w dotychczasowym potoku przetwarzania dokumentów:
1. **Wycieki językowe w sekcjach opisowych i tabelarycznych:**
   - Sekcje 1.2, 4, 5, 6, 7 były przetwarzane deterministycznie z użyciem wąskiego słownika `translatePhrase` (30 fraz), co powodowało wycieki zdań producenta w języku angielskim i włoskim (np. *„For emergency responders”*, *„Manipolazione sicura”*).
   - W Sekcji 9 parametry fizykochemiczne zawierały niespolszczone zwroty techniczne (`flammable liquid`, `Method:not specified`, `Method: internal`, `Appearance`, `Median equivalent diameter`).
   - W Sekcji 8.1 metoda `extractDnelPnec` wklejała surowe nagłówki tabeli PDF/RTF (*Effects on consumers*, *Normal value in fresh water*) bez wartości liczbowych.
   - W Sekcji 14 regex kodu ograniczeń przewozu przez tunele przechwytywał stopkę producenta `Suarez Company` znajdującą się w sąsiedztwie słowa „Tunnel”.
2. **Pionowy układ tabelaryczny LIMS w kartach RTF:**
   - Wielowierszowa struktura komórek tabeli LIMS (np. w karcie Orchidea e Vaniglia) powodowała, że stary parser gubił nazwy substancji, mylił stężenia (`74 ≤ x < 78 %`) z progami SCL (`≥ 50%`) i wyciągał zaledwie 2 z 5 składników.
3. **Pojawianie się angielskich nazw IUPAC z PubChem:**
   - Brak polskich odpowiedników w słowniku `CAS_TO_PL_MAP` powodował, że zapytanie do PubChem API zwracało angielską nazwę IUPAC (np. `4-methoxybenzaldehyde`), która trafiała do Sekcji 2.2 i 3.2.

## Podjęte Decyzje Architektoniczne

1. **Mostek Word COM dla plików RTF (`SDSRtfConverter`):**
   - Zintegrowano bezstratny mostek Word COM (`src/modules/sds/sds.rtf.converter.js`), konwertujący pliki `.rtf` do `.pdf` przy użyciu oficjalnego silnika Microsoft Word (`Word.Application`).
   - Zapewniono 100% zachowania geometrii tabel, właściwości czcionek i podziału stron, z automatycznym fallbackiem w przypadku środowisk bez zainstalowanego pakietu Word.

2. **Dedykowany Ekstraktor LIMS i Uelastycznienie Tabeli Składników (`SDSchemicalExtractor`):**
   - Wdrożono metodę `parseLimsSection3`, dedykowaną dla wielowierszowego układu LIMS: wyodrębnia 100% składników (5/5 w Orchidea e Vaniglia) wraz ze stężeniami, numerami INDEX, EC, CAS, numerami rejestracji REACH, progami SCL i współczynnikami M oraz wartościami ATE.
   - Uelastyczniono standardowy parser `parseSection3Components`, aby bezkolizyjnie przetwarzał zarówno stężenia przed numerem CAS (jak w Najma), jak i za nim.

3. **Scentralizowana Polonizacja Nazw Chemicznych (`resolvePlName`):**
   - Wprowadzono metodę `resolvePlName` uniemożliwiającą wyciek angielskich nazw z PubChem. Pierwszeństwo mają urzędowy rejestr NDS (`NDSRegistry`), rejestr `CAS_TO_PL_MAP` (uzupełniony o m.in. aldehyd anyżowy `123-11-5`, BHT `128-37-0`, kumarynę `91-64-5`, toluen `108-88-3`) oraz słownik alergenów `ALLERGEN_NAMES_PL`.

4. **Włączenie Sekcji Narracyjnych do Potoku LLM z Rygorystycznym Promptem (`sds.agent.js`):**
   - Sekcje 1.2, 4, 5, 6, 7, 10, 11 włączono do `descriptiveSectionsToTranslate` przekazywanego do modelu LLM (`gemini-3.8-flash`) z temperaturą `0.0`.
   - Zdefiniowano rygorystyczny `SYSTEM_PROMPT` nakazujący 100% polszczyzny, używanie oficjalnego słownictwa medyczno-ratowniczego i BHP oraz zachowanie nienaruszalności liczb, jednostek i stężeń.
   - W `mergeCompletedSds` wdrożono twardy filtr `polonizeToxicologicalSection` polonizujący nazwy zwierząt laboratoryjnych (szczur, królik, mysz), dróg podania (droga pokarmowa, na skórę, inhalacyjnie) i korygujący ewentualne literówki OCR.

5. **Sanityzacja Właściwości Fizykochemicznych (Sekcja 9) i Transportu (Sekcja 14):**
   - W `normalizePhysChemValue` wdrożono polonizację terminów stanów skupienia, kolorów, zapachów oraz warunków pomiaru (np. `(metoda wewnętrzna)`, `(metoda: nie określono)`).
   - W Sekcji 9.2 wdrożono urzędowe polskie podsekcje: `9.2.1. Informacje dotyczące klas zagrożenia fizycznego` oraz `9.2.2. Inne właściwości bezpieczeństwa`.
   - W Sekcji 14 kod ograniczeń przewozu przez tunele zabezpieczono ścisłym regexem ADR `(\([A-E](?:\/[A-E])?\)|\b[A-E](?:\/[A-E])?\b)`, eliminując wklejanie stopki producenta.

## Skutki (Consequences)
- **Zero Wycieków Obcojęzycznych:** Weryfikacja obu wygenerowanych kart DOCX (Orchidea e Vaniglia oraz Najma) skryptem audytorskim `scratch/audit_docx.js` potwierdziła 0 błędów obcojęzycznych w całym dokumencie.
- **Zgodność z Prawem:** Wszystkie 16 sekcji wygenerowanych dokumentów spełnia wymogi Załącznika II do Rozporządzenia (WE) 1907/2006 (REACH) w brzmieniu nadanym Rozporządzeniem Komisji (UE) 2020/878, norm NDS (Dz.U. 2024 poz. 1017), ustawy o odpadach (Dz.U. 2020 poz. 10) oraz Umowy ADR.
- **Weryfikacja:** 122/122 testów systemowych (`npm test`), 7/7 testów zgodności regulacyjnej (`tests/sds.compliance.test.js`) oraz 6/6 testów formatu RTF (`tests/sds.rtf.test.js`) zakończone z wynikiem 100% pozytywnym.
