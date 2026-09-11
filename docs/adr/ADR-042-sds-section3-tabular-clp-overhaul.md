# ADR-042: Tabularyzacja i Pełna Polonizacja Sekcji 3 Kart SDS (Rozporządzenie UE 2020/878 & Wzorzec SWEET HOME)

## Status
Zaakceptowany (Accepted)

## Kontekst
W pierwotnej implementacji modułu SDS (`sds.service.js`) Sekcja 3 (Skład / informacja o składnikach):
1. Nie posiadała wymaganej prawem budowy tabelarycznej – treść była zrzucana jako nieformatowany blok tekstowy.
2. Zawierała deweloperskie banery systemowe (`[ORYGINALNE STĘŻENIA I KLASYFIKACJE ZACHOWANE ZGODNIE Z REGULĄ EXTRACT_RAW]`), które trafiały do dokumentu docelowego klienta.
3. Nazwy substancji chemicznych i alergenów nie były polonizowane (pochodziły wprost z angielskiego PubChem IUPAC lub surowego PDF, np. `(4-tert-butylcyclohexyl) acetate`).
4. Klasyfikacje i specyficzne stężenia graniczne (SCL / M-factor) zawierały angielskie frazy (`Specific Concentration Limits:`, `M-Chronic: 100`, `M-Acute: 100`), a stężenia procentowe używały zapisu kropkowego (`0.1%`) zamiast polskiego standardu przecinkowego (`0,1 %`).
5. Brakowało jawnego wyodrębnienia podsekcji `3.1. Substancje: Nie dotyczy.` oraz `3.2. Mieszaniny` wraz z opisem chemicznym i odnośnikiem do Sekcji 16.

## Decyzje Architektoniczne
1. **Parser Ekstrakcji Komponentów Sekcji 3 (`SDSChemicalExtractor.parseSection3Components`):**
   - Opracowano algorytm wyodrębniania wierszy z PDF omijający specyficzne stężenia graniczne (SCL) ze znakami `%` – podział wierszy opiera się na relacji między numerami CAS a poprzedzającymi je zakresami stężeń.
   - Identyfikatory chemiczne (CAS, WE, Index, numer rejestracji REACH) są parsowane dedykowanymi wyrażeniami regularnymi.
2. **Certyfikowane Słowniki Polskie (`CAS_TO_PL_MAP` & `ALLERGEN_NAMES_PL`):**
   - Zaimplementowano bazę stałych polskich nazw chemicznych (`CAS_TO_PL_MAP`) odpytywaną przed zapytaniem sieciowym do PubChem/ECHA.
   - Wdrożono fallback na bazę alergenów (`ALLERGEN_NAMES_PL`) oraz obsługę manualnych nadpisań HITL (`manualOverrides`).
3. **Standaryzacja Formatowania i Polonizacja Notacji CLP:**
   - Wdrożono metodę `SDSChemicalExtractor.formatConcentration` zamieniającą kropki dziesiętne na polskie przecinki i standaryzującą odstępy operatorów (`≥ 0,1 - < 0,25 %`).
   - Przetłumaczono parametry toksykologiczne na język polski: `Specyficzne stężenia graniczne:`, `M (przewlekły) =`, `M (ostry) =`.
   - Zaktualizowano `mapHazardClass` z elastycznym dopasowaniem białych znaków (`\s+`), co poprawnie mapuje wieloliniowe nazwy klas zagrożeń z PDF (np. `Aquatic\nChronic`).
4. **Natywna Tabela DOCX (`docx.Table`):**
   - W `SDSDocxExporter.export` wprowadzono dedykowaną obsługę `data.components` tworzącą 4-kolumnową tabelę DOCX o szerokości 9600 dxa:
     - *Nazwa substancji* (pogrubiona nazwa polska + opcjonalna nazwa oryginalna),
     - *Identyfikatory* (CAS, WE, Indeks, REACH),
     - *Klasyfikacja CLP* (zwroty H, EUH, SCL, M-factor),
     - *Stężenie* (% wag.).
   - Dodano podsekcję `3.1. Substancje: Nie dotyczy.` oraz `3.2. Mieszaniny` z opisem: *"Opis chemiczny: Mieszanina substancji niebezpiecznych wraz z dodatkami nieniebezpiecznymi."* i końcową notą wskazującą na Sekcję 16.
5. **Czystość Dokumentu:**
   - Trwale usunięto wszystkie techniczne i deweloperskie adnotacje o regułach routingu (`EXTRACT_RAW`).

## Konsekwencje
- Dokument DOCX w Sekcji 3 w 100% spełnia wymogi Załącznika II do Rozporządzenia (WE) 1907/2006 (zmienionego Rozporządzeniem 2020/878) oraz jest w pełni spójny ze wzorcem referencyjnym SWEET HOME.
- Wyeliminowano ryzyko błędu translacyjnego przy kluczowych surowcach i alergenach.
- Zapewniono pełną automatyzację generowania profesjonalnych tabel DOCX.
