# ADR-078: Eliminacja Regresji Graficznej ADR w Sekcji 14.3, Determinizm Właściwości Fizykochemicznych (9.1), Normatywów NDS/DNEL (8.1) i Tabelarycznej Ekstrakcji Zastosowań (1.2)

## Status
**ZAAKCEPTOWANY / PRODUCTION-READY**  
Data: 2026-09-16  
Zgodność prawna: Rozporządzenie Komisji (UE) 2020/878 (Załącznik II do REACH), Rozporządzenie (WE) nr 1272/2008 (CLP), Dz.U. 2018 poz. 1286 z późn. zm. (w tym Dz.U. 2024 poz. 1017), Umowa ADR 2023–2025.

---

## Kontekst i Zidentyfikowane Usterki
W toku audytu jakościowego wygenerowanych kart charakterystyki (weryfikacja wersji `(14).docx`) zidentyfikowano 4 usterki i regresje techniczne, powodujące brak powtarzalności wyników:

1. **Sekcja 14.3 (Regresja graficzna nalepki ostrzegawczej ADR nr 3):**
   Wdrożona w ADR-076 asercja `isNotRegulatedTransport = /nie podlega przepisom|nie jest sklasyfikowan|nie dotyczy/i.test(data.content)` testowała cały blok Sekcji 14. Ponieważ każda wygenerowana Sekcja 14 zawiera w podsekcji 14.7 urzędową formułę *„14.7. Transport morski luzem zgodnie z instrumentami IMO\nNie dotyczy (...)”*, warunek ten zwracał `true` dla wszystkich kart, skutkując wycięciem bufora obrazu nalepki ADR nr 3 w eksporterze DOCX.
2. **Sekcja 9.1 (Lepkość kinematyczna bez jednostki miary):**
   Dla ciekłych mieszanin lepkość była ekstrahowana jako bezwymiarowa liczba (`1,5`), co stanowi naruszenie Załącznika II do REACH (UE 2020/878 pkt 9.1), który bezwzględnie wymaga podania jednostki ($mm^2/s$) oraz temperatury pomiaru.
3. **Sekcja 8.1 (NDS dla BHT i DNEL dla etanolu):**
   - W bazie `nds_database_2018.json` dla substancji BHT (CAS: 128-37-0) brakowało obowiązkowego dopisku `(frakcja wdychalna)` wymaganego przez Dz.U. 2018 poz. 1286 / Dz.U. 2024 poz. 1017, a dla NDSCh brakowało urzędowej klauzuli `nie ustalono`.
   - Parser dróg oddechowych DNEL w `SDSChemicalExtractor.extractDnelPnec` pomijał wartość ostrą miejscową dla pracowników (1900 mg/m³), redukując dane wyłącznie do wartości przewlekłych.
4. **Sekcja 1.2 (Nieuprawnione przypisanie zastosowań przemysłowych i profesjonalnych):**
   Parser badał samą obecność słów `Industrial`/`Professional` w bloku 1.2. W kartach ze strukturą tabelaryczną nagłówek zawierał te słowa, lecz w wierszu danych widniał myślnik `-` (brak zastosowania), co prowadziło do błędnego rozszerzenia kategorii konsumenckiej.

---

## Podjęte Decyzje Architektoniczne

### 1. Precyzyjne kryterium wyłączenia transportowego w Sekcji 14.3 (`sds.service.js`)
Zawężono warunek `isNotRegulatedTransport` w eksporterze DOCX:
```javascript
const isNotRegulatedTransport = /Produkt nie jest sklasyfikowany jako stwarzający zagrożenie|nie podlega przepisom dotyczącym międzynarodowego przewozu/i.test(data.content) || /14\.3\.\s*Klasa[^\n]*\n\s*Nie dotyczy/i.test(data.content);
```
- Wyeliminowano false-positive wynikający z obecności słów „Nie dotyczy” w podsekcji 14.7 (IMO) lub 14.4 (Grupa pakowania).
- Zapewniono 100% stabilności generowania bufora obrazu nalepki ostrzegawczej ADR (np. `ADR_3.png` z wektora SVG) bezpośrednio nad tekstem `ADR / RID, IMDG, IATA: Klasa 3 (Materiały ciekłe zapalne)`.

### 2. Deterministyczny maper lepkości kinematycznej w Sekcji 9.1 (`sds.service.js`)
Wprowadzono `customExtract` dla parametru `viscosity`:
- Automatyczne wykrywanie i uzupełnianie brakującej jednostki miary (`mm²/s`) z zabezpieczeniem idempotencji (`(?!\s*(?:mm²\/s|cSt|mPa|Pa\.s|\/s))`).
- Dynamiczne skanowanie wieloliniowego bloku parametru w poszukiwaniu temperatury pomiaru (`Temperature: 20 °C`) i dołączanie klauzuli `(w temp. 20 °C)`.
- Wartości niemierzalne (`Nie dotyczy` dla ciał stałych i aerozoli) pozostają nienaruszone.

### 3. Zgodność normatywna NDS i precyzyjna ekstrakcja DNEL w Sekcji 8.1
- **Baza NDS (`nds_database_2018.json`):** Zaktualizowano pozycję CAS `128-37-0` do postaci:
  `"substance": "2,6-di-tert-butylo-4-metylofenol (BHT)", "NDS": "10 mg/m³ (frakcja wdychalna)", "NDSCh": "nie ustalono"`.
- **Formater NDS (`processSection8`):** Dodano obsługę wartości `nie ustalono` dla NDSCh.
- **Parser DNEL (`extractDnelPnec`):** 
  - Rozszerzono parser dróg oddechowych o detekcję wartości ostrych miejscowych dla pracowników (1900 mg/m³), generując pełny zestaw:
    - Konsumenci (skutki przewlekłe układowe): 114 mg/m³
    - Pracownicy: skutki przewlekłe układowe: 950 mg/m³; skutki ostre miejscowe: 1900 mg/m³
  - Wyszukiwanie bloków substancji w `bySubstance` zostało uodpornione na występowanie nazwy substancji w Sekcji 3 (wyszukiwanie bloku zawierającego dane DNEL/PNEC).

### 4. Tabelaryczna analiza matrycowa w Sekcji 1.2 (`processSection1`)
- Zaimplementowano rozpoznawanie wierszy tabelarycznych w podsekcji 1.2. Jeżeli pod kolumnami `Industrial` lub `Professional` znajdują się myślniki (`-`), kategorie te są bezwzględnie wykluczane.
- Właściwa nazwa zastosowania (`Air freshener` -> `odświeżacz powietrza (dyfuzor zapachowy do wnętrz)`) jest poprawnie separowana od nagłówka kolumny.
- Klauzula zastosowań odradzanych automatycznie przyjmuje urzędowe brzmienie: *„Wszelkie inne zastosowania nieprzewidziane przez producenta (nie stosować do celów przemysłowych ani profesjonalnych).”*

---

## Weryfikacja i Rezultaty
- **Asercja XML w wygenerowanym dokumencie DOCX:**
  - Sekcja 1.2: Wyłącznie zastosowanie konsumenckie z dyfuzorem zapachowym do wnętrz, brak kategorii przemysłowych/profesjonalnych.
  - Sekcja 8.1: BHT zawiera `10 mg/m³ (frakcja wdychalna)` oraz `NDSCh: nie ustalono`; DNEL dla etanolu zawiera `skutki ostre miejscowe: 1900 mg/m³`.
  - Sekcja 9.1: `Lepkość kinematyczna: 1,5 mm²/s (w temp. 20 °C)`.
  - Sekcja 14.3: W archiwum docx obecnych jest 5 obiektów graficznych (`word/media/`), w tym fizyczna nalepka ostrzegawcza ADR nr 3 i znak LQ.
- **Stan testów po wdrożeniu:**
  - `npm test`: 122/122 testów PASSED (`pass 122, fail 0`).
  - `tests/sds.compliance.test.js`: 7/7 testów PASSED.
  - `tests/sds.8_points_audit.test.js`: 12/12 punktów audytu PASSED.
