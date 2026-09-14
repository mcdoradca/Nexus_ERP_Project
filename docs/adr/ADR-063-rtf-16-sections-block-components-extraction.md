# ADR-063: Eliminacja degradacji jakości kart SDS w formacie RTF (Bezstratna rekonstrukcja geometrii wierszy, segmentacja 16 sekcji i parser blokowy LIMS)

## Status
**PRZYJĘTY / WDROŻONY** (2026-09-14)

## Kontekst biznesowy i techniczny
Po wdrożeniu obsługi kart charakterystyki w formacie RTF użytkownik zgłosił krytyczną degradację jakości wygenerowanego dokumentu DOCX dla pliku `8034055535448_SDS_ORCHIDEA_E_VANIGLIA (1).rtf` w porównaniu do wzorcowego pliku referencyjnego `docs/SDS/Karta_Charakterystyki_8051944811049_SDS_LULWA.pdf`. Wygenerowany plik DOCX był w ~80% pusty:
1. **Pusta Sekcja 3:** Tabela składników nie zawierała ani jednego ze składników mieszaniny (brak etanolu 74-78%, aldehydu anyżowego, kumaryny, BHT, toluenu).
2. **Pusta Sekcja 9:** Wszystkie 18 urzędowych parametrów fizykochemicznych miało wpisane „Nie dotyczy” pomimo bogatej treści w pliku źródłowym.
3. **Sklejenie i braki sekcji:** Sekcje 10 i 11 były połączone, a sekcje 3–8 oraz 12–16 zawierały generyczne komunikaty o braku danych.

### Przyczyna źródłowa (Root Cause Analysis):
1. **Spłaszczenie struktury komórek w parserze RTF:** W `SDSRTFParser.parseRtfString` sterowniki `\par`, `\line` i `\page` wewnątrz komórek tabeli były zamieniane na pojedynczą spację `' '`. W rezultacie nagłówki sekcji (np. `SECTION 4. First aid measures`) traciły zakotwiczenie początku linii (`^`) i sklejały się z poprzedzającą treścią w jeden ciąg tekstowy.
2. **Założenie jednoliniowych rekordów CAS:** Parser `parseSection3Components` w `sds.service.js` zakładał model tabeli jednowierszowej, w której wiersz zaczyna się od numeru CAS, a po nim następuje stężenie i klasyfikacja. W kartach z przemysłowych systemów LIMS (np. Epy / Kemika) struktura tabeli jest pionowo-blokowa: pierwszy wiersz zawiera nazwę substancji (`ETHANOL`), kolejny wiersz numer indeksowy, stężenie i klasyfikację CLP rozdzielone tabulatorami, trzeci numer WE i uwagi SCL/ATE, a dopiero czwarty numer CAS. Podział tekstu po pozycjach CAS powodował odcięcie nazwy i stężenia substancji od jej identyfikatorów.
3. **Konflikt czyszczenia tabulatorów w Sekcji 9:** Metoda `cleanPdfArtifacts` w `sds.service.js` domyślnie zamieniała wszystkie tabulatory `\t` na spację `' '`. Ponieważ w tabelach RTF separatorem kolumn jest tabulator, linia `Appearance\tliquid\tTemperature: 20 °C` po usunięciu tabulatora stawała się `Appearance liquid Temperature: 20 °C`, co uniemożliwiało pobranie właściwej wartości przez wyrażenia regularne i powodowało wpisanie fallbacku „Nie dotyczy”.
4. **Niejednoznaczność numerów CAS vs INDEX:** Numer indeksowy etanolu `603-002-00-5` zawierał sekwencję cyfr `002-00-5`, która bez negatywnych asercji lookbehind/lookahead była błędnie traktowana przez prosty regex jako numer CAS.

---

## Podjęte decyzje architektoniczne

### 1. Bezstratna rekonstrukcja geometrii wierszy w parserze RTF (`SDSRTFParser`)
- W pliku `src/modules/sds/sds.rtf.parser.js`:
  - `\par`, `\line`, `\page` bezwzględnie emitują znak nowej linii `\n` w strumieniu wynikowym komórek tabeli.
  - Naprawiono dekodowanie znaków specjalnych w hex (np. `\'3d` -> `=`).
  - Wdrożono mechanizm pomijania bajtów zastępczych po encjach `\uN` (ignorowanie sekwencji `\'xx` występujących bezpośrednio po kodach Unicode).

### 2. Odporna segmentacja 16 sekcji (`segmentInto16Sections`)
- Wzbogacono wyrażenia regularne w `segmentInto16Sections` o dopasowanie nagłówków poprzedzonych dowolnym separatorem blokowym `(?:^|[\n\r\t]|\.\s+)`.
- Wprowadzono precyzyjną kalkulację indeksów początkowych bez uwzględniania separatora prefixu (`m.index + m[0].indexOf(secWord)`), co wyeliminowało obcinanie nagłówków i zagwarantowało bezbłędne wyodrębnienie wszystkich 16 sekcji z dokumentów RTF i PDF.

### 3. Dedykowany parser blokowy składników LIMS (`parseBlockComponents`)
- W klasie `SDSProcessorEngine` zaimplementowano metodę `parseBlockComponents(content)`:
  - Identyfikuje bloki wieloliniowe na podstawie nagłówków nazw chemicznych (duże litery, linie poprzedzające wiersze z `INDEX:`, `EC:`, `CAS:`) oraz separatorów kolumn `\t`.
  - Wzbogacono metodę `extractCas` o negatywne lookbehind/lookahead: `/(?<![0-9\-])\b\d{2,7}-\d{2}-\d\b(?![0-9\-])/g`, co całkowicie wyeliminowało fałszywe numery CAS z ciągów indeksowych.
  - Zintegrowano `parseBlockComponents` z `parseSection3Components` jako automatyczny fallback w przypadku, gdy tradycyjne parsowanie oparte na CAS nie odnajdzie składników.

### 4. Wzbogacenie i polonizacja parametrów Sekcji 9
- Do `cleanPdfArtifacts` dodano opcjonalny parametr `preserveTabs = false`. W `processSection9` wywoływane jest `cleanPdfArtifacts(contentIt, true)`, co zachowuje tabulatory komórek tabeli.
- Zaktualizowano definicje parametrów w `paramsConfig`:
  - Dodano dopasowanie alternatywnych nazw (`Appearance`, `Aspetto`, `Initial boiling point`, `Melting point / freezing point`).
  - Rozszerzono regexy o separację tabulatorem: `[:\.\t]?\s*([^\n\t]+)`.
  - Wdrożono agregację rozbitych granic wybuchowości (`Lower explosive limit` + `Upper explosive limit` -> `3,3 % (v/v) - 19 % (v/v)`).
  - Wzbogacono słownik `normalizePhysChemValue` o mapowania terminów wielojęzycznych na urzędowe polskie odpowiedniki (`liquid` -> `ciecz`, `pink` -> `różowy`, `flammable liquid` -> `ciecz łatwopalna`, `soluble in water` -> `rozpuszczalny w wodzie`).

---

## Konsekwencje i weryfikacja

1. **Jakość dokumentu docelowego DOCX:**
   - Wygenerowany plik DOCX dla karty `Orchidea e Vaniglia RTF` zawiera pełne 16 sekcji o strukturze i kompletności identycznej z wzorcową kartą referencyjną `LULWA.pdf`.
   - Sekcja 3 zawiera pełen komplet 5 składników:
     - Etanol (CAS 64-17-5, WE 200-578-6, Index 603-002-00-5, stężenie `74 ≤ x < 78 %`, CLP, Eye Irrit. 2 ≥ 50%)
     - Aldehyd anyżowy (CAS 123-11-5, WE 204-602-6, stężenie `0,7 ≤ x < 0,8 %`, CLP)
     - Kumaryna (CAS 91-64-5, WE 202-086-7, stężenie `0,4 ≤ x < 0,45 %`, CLP, ATE Oral: 500 mg/kg)
     - BHT / 2,6-ditert-butyl-4-methylphenol (CAS 128-37-0, WE 204-881-4, stężenie `0,1 ≤ x < 0,15 %`, CLP, M=1)
     - Toluen (CAS 108-88-3, WE 203-625-9, Index 601-021-00-3, stężenie `0 < x < 0,05 %`, CLP)
   - Sekcja 8 zawiera właściwe normatywy NDS dla Etanolu (1900 mg/m³), BHT (10 mg/m³) oraz Toluen (100 mg/m³, NDSCh 200 mg/m³ z notacją „skóra”).
   - Sekcja 9 zawiera 18 urzędowych parametrów fizykochemicznych w języku polskim z rzeczywistymi danymi badawczymi.
   - Sekcja 16 zawiera kompletne urzędowe brzmienia zwrotów H i EUH, wykaz klas zagrożenia, objaśnienia akronimów i deklarację zgodności z Rozporządzeniem (UE) 2020/878.

2. **Bramka testowa i weryfikacja automatyczna:**
   - `node tests/sds.rtf.test.js`: **6/6 testów zakończonych sukcesem** (w tym nowy TEST 6 na rzeczywistym pliku `Orchidea e Vaniglia RTF`).
   - `node tests/sds.compliance.test.js`: **7/7 testów regulacyjnych zakończonych sukcesem**.
   - `npm test`: **122/122 testów systemowych zakończonych sukcesem**.
   - `npm run build` w `frontend/`: kod wyjścia 0 (kompilacja produkcyjna bez błędów).
