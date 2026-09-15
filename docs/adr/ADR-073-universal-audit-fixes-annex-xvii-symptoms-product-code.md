# ADR-073: Uniwersalne Wdrożenie Poprawek Regulacyjnych i Redakcyjnych SDS (Załącznik XVII REACH, Seveso III, Kod Produktu, Dedukcja Objawów)

## Status
Zaakceptowany i wdrożony produkcyjnie.

## Data
2026-09-15

## Kontekst i Problem
Podczas audytu prawnego wygenerowanych kart charakterystyki SDS zidentyfikowano 6 zagadnień regulacyjnych i redakcyjnych, które wymagały systemowego, uniwersalnego rozwiązania dla wszystkich przetwarzanych kart:
1. **Sekcja 15.1 (Załącznik XVII REACH):** Wcześniejszy szablon zawierał błędną formułę *"Mieszanina nie podlega ograniczeniom na mocy załącznika XVII do rozporządzenia REACH"*, podczas gdy każda ciekła mieszanina niebezpieczna CLP bezwzględnie podlega pozycji 3, a ciecze łatwopalne podlegają pozycji 40. Dodatkowo składniki mogą podlegać pozycji 75 (np. tusze/barwniki).
2. **Sekcja 15.1 (Dyrektywa Seveso III / Dz.U. 2016 poz. 138):** Brakowało precyzyjnego przypisania kategorii zagrożenia (np. P5c dla cieczy łatwopalnych kat. 2 i 3) oraz obowiązkowych polskich progów ilościowych dla Zakładów o Zwiększonym Ryzyku (ZZR – 5 000 t) i Zakładów o Dużym Ryzyku (ZDR – 50 000 t).
3. **Metryka / Wersjonowanie (Pkt 0.2.5 Załącznika II do REACH):** W przypadku gdy polski dystrybutor (ITALLUX Sp. z o.o.) po raz pierwszy wprowadza produkt na rynek polski, dokument w języku polskim stanowi wydanie pierwsze (`Wersja: 1.0 PL`). Pole `Zastępuje wersję` nie może powielać obcych rewizji producenta jako własnych wydań, lecz musi zawierać precyzyjną klauzulę prawną: `Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta – rewizja nr ${originalRevision} z dnia ${originalDate} r.)`.
4. **Sekcja 1.1 (Kod Produktu):** Kod identyfikacyjny produktu (np. `BLK0033-2`) musi być dynamicznie wyekstrahowany ze źródła i widoczny w podsekcji 1.1 obok nazwy handlowej i UFI.
5. **Sekcja 4.2 (Dedukcja Kliniczna Objawów):** Szablonowe stwierdzenie "brak danych" w sekcji 4.2 jest niedopuszczalne przez inspektorów sanitarnych. Wymagany jest deterministyczny silnik dedukcyjny generujący klinicznie poprawne objawy dla 4 dróg narażenia (oczy, skóra z uwzględnieniem konkretnego alergenu z Sekcji 3, drogi oddechowe, przewód pokarmowy) oraz skutków opóźnionych.
6. **Sekcja 11.1 (Deduplikacja LC50):** Eliminacja błędu powielonego prefiksu parametru (`LC50 (drogi oddechowe, pary): LC50 (...)`).

## Podjęte Decyzje Architektoniczne

1. **Determinizm Prawny Załącznika XVII REACH w `processSection15`:**
   - Rozpoznawanie bloków tekstu źródłowego: `Product Point 3 - 40` oraz `Contained substances Point 75` z rygorystycznym ograniczeniem początku linii, zapobiegającym fałszywym dopasowaniom ze wstępnego nagłówka sekcji.
   - *Zero-Bypass Fallback:* Jeżeli mieszanina jest cieczą stwarzającą zagrożenie wg CLP, pozycja 3 jest ZAWSZE dodawana. Jeżeli jest cieczą łatwopalną (`Flam. Liq.`), pozycja 40 jest ZAWSZE dodawana.

2. **Dyrektywa Seveso III i Rozporządzenie Ministra Rozwoju (Dz.U. 2016 poz. 138):**
   - Wykrywanie kategorii Seveso z tekstu źródłowego (`P5c`, `P5a`, `P5b`, `E1`, `E2`) z fallbackiem do `P5c` dla cieczy wysoce łatwopalnych.
   - Generowanie w `PolishLegalTemplates.getSection15` pełnego zapisu z polskimi progami ZZR i ZDR.

3. **Deterministyczna Metryka Wersjonowania:**
   - W `prepareAgentPayload` domyślną wersją jest `1.0 PL`.
   - `replacedRevision` przyjmuje ścisłą formułę: `Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta z dnia ${originalDate} r.)`.
   - W Sekcji 16 wygładzono zwrot wprowadzający dla pierwszego wydania w języku polskim.

4. **Dwupoziomowy Ekstraktor Kodu Produktu:**
   - Ekstrakcja z nagłówków/sekcji 1.1 oraz pełnego tekstu dokumentu (`Trade code`, `Codice prodotto`, `Code:`, itp.).
   - Przekazywanie kodu do `metadata.productCode` oraz renderowanie w treści Sekcji 1.1.

5. **Kliniczny Silnik Dedukcyjny w `processSection4`:**
   - Dynamiczna analiza kodów H (`H318/H319`, `H314/H315/H317/EUH208`, `H335/H336/Flam/Alkohole`, `H302/H304`) oraz składników z Sekcji 3.
   - Przy narażeniu skóry silnik dynamicznie wstrzykuje nazwę wykrytego alergenu (np. `kumaryna (2H-chromen-2-on)`).
   - Ochrona sekcji 4 w `mergeCompletedSds` przed nadpisaniem szablonowym placeholderem.

6. **Uniwersalny Deduplikator w `polonizeToxicologicalSection`:**
   - Usunięcie zduplikowanych etykiet `LC50 / LD50` i normalizacja oznaczeń ssaczych (szczur).

7. **Czystość Wizualna Stopek Dokumentu DOCX:**
   - Usunięcie adresu URL `(www.prostozwloch.pl)` ze stopek stron dokumentu Word, pozostawiając oficjalne oznaczenie: `Dystrybutor: ITALLUX Sp. z o.o. | Strona X z Y`.

## Skutki i Weryfikacja
- Wszystkie 12 punktów audytu w `tests/sds.8_points_audit.test.js` zakończone sukcesem.
- Testy bezstratności formatu RTF (`tests/sds.rtf.test.js`, 6/6 testów) zakończone sukcesem.
- Testy zgodności prawnej (`tests/sds.compliance.test.js`, 7/7 testów) zakończone sukcesem.
- Pełny zestaw testów systemowych (`npm test`, 122/122 testy) zakończony z wynikiem 100% pass.
- Wygenerowany plik `.docx` posiada poprawną strukturę i jest w pełni zgodny z Rozporządzeniem (UE) 2020/878.
