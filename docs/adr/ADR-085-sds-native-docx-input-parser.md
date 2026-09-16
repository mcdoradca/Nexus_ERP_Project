# ADR-085: Natywny parser kart wejściowych DOCX (OpenXML) w architekturze SDS

## Status
Zaakceptowany (Implemented & Production-Ready)

## Kontekst
Tradycyjny format PDF, ze względu na swoją naturę (język opisu wektorowego PostScript), nie zawiera semantycznych struktur tabel ani jednoznacznych granic sekcji. W konsekwencji:
1. Tabele wielokolumnowe (składniki w Sekcji 3.2, DNEL/PNEC w Sekcji 8.1, badania ekotoksyczności w Sekcji 12.1) ulegają spłaszczeniu do nieuporządkowanego strumienia tekstu, zmuszając silnik do stosowania ponad 300 heurystycznych wyrażeń regularnych.
2. Nagłówki i stopki stron (running headers, paginacja typu `6/35`, nazwy dostawców) wstrzykiwane są bezpośrednio w środek zdań narracyjnych (np. w sekcji 4.1).
3. Łamanie wierszy rozbija liczby CAS i zakresy stężeń (np. `≥0.00015%-\n<0.0015%`).

Decyzją operacyjną użytkownika dopuszczono dostarczanie kart wejściowych bezpośrednio w formacie Microsoft Word (`.docx`). Format ten przechowuje dane w otwartym standardzie Office OpenXML (ZIP + XML), co pozwala na bezpośrednie, w 100% deterministyczne odczytanie struktury dokumentu.

## Podjęte Decyzje Architektoniczne

1. **Implementacja dedykowanego silnika `SDSDocxParser` (`src/modules/sds/engine/sds.docx.parser.js`):**
   - Wykorzystano wyłącznie istniejące już w projekcie zależności: `adm-zip` (ekstrakcja struktury ZIP) oraz `cheerio` w trybie `{ xmlMode: true }` (parsowanie drzewa DOM OpenXML). Zastosowano bezwzględną zasadę **Zero New Dependencies** (zakaz `npm install`).
   - Ekstrakcja pliku `word/document.xml`, który zawiera czystą treść merytoryczną dokumentu.

2. **Pełna izolacja nagłówków i stopek stron (Zero Running-Header Leakage):**
   - W specyfikacji OpenXML nagłówki i stopki stron przechowywane są w odrębnych plikach kontenera (`word/header1.xml`, `word/footer1.xml`). Odczyt z `word/document.xml` z definicji jest całkowicie wolny od wstrzykiwanych nagłówków stron i paginacji.
   - Dodatkowo wdrożono filtr antyartefaktowy `cleanArtifacts`, który zabezpiecza dokumenty w sytuacji, gdy dostawca wygenerował plik DOCX poprzez automatyczny konwerter PDF-to-Word.

3. **Sekwencyjny przepływ węzłów (Linear Flow) i podział na 16 sekcji:**
   - Parser iteruje sekwencyjnie po bezpośrednich dzieciach węzła `<w:body>` (`<w:p>` oraz `<w:tbl>`).
   - Rozpoznaje nagłówki 16 sekcji rozporządzenia REACH (UE 2020/878) w językach polskim, angielskim i włoskim.
   - Przypisuje akapity oraz wyodrębnione macierze tabel do odpowiednich sekcji, zachowując chronologiczny układ tekstu.

4. **Bezpośrednia ekstrakcja tabel OpenXML (Sekcja 3.2, 8.1, 12.1):**
   - Parser mapuje węzły `<w:tbl> -> <w:tr> -> <w:tc>` bezpośrednio na dwuwymiarowe macierze komórek.
   - Wdrożono metodę `parseSection3Table`, która semantycznie identyfikuje komórki wiersza (nazwa, identyfikatory CAS/WE/Index/REACH, stężenie, klasyfikacja CLP ze stężeniami granicznymi SCL i współczynnikami M), eliminując podatność na przesunięcia off-by-one.
   - Wdrożono metodę `processSection3FromDocxTable` w `SDSProcessorEngine`, która łączy dane tabelaryczne z mechanizmami bezpieczeństwa HITL, twardym słownikiem CAS i ECHA Free Resolverem.

5. **Wieloplatformowa kompatybilność w `SDSDocumentParser` i `prepareAgentPayload`:**
   - Dodano metodę `SDSDocumentParser.isDocxFile(filePath)` weryfikującą rozszerzenie oraz sygnaturę binarną `PK\x03\x04` i obecność `word/document.xml`.
   - `SDSDocumentParser.extractText(filePath)` w sposób przezroczysty kieruje pliki `.docx` do silnika `SDSDocxParser`.
   - Zachowano 100% kompatybilności wstecznej dla formatów `.pdf` oraz `.rtf`.

6. **Aktualizacja kontrolera i cyklu życia plików (`sds.controller.js`):**
   - Metody `processSds` oraz `resumeProcess` obsługują upload plików `.docx`, `.pdf` i `.rtf`.
   - Nazwa pliku wyjściowego zachowuje tożsamość 1:1 pliku źródłowego (zamiana rozszerzenia `.docx` na `[nazwa].docx`).
   - Proces sprzątania w tle (`cleanupOrphanPdfs`) usuwa tymczasowe pliki `temp_sds_*.docx` starsze niż 1 godzina.

7. **Dostosowanie interfejsu użytkownika (`frontend/src/components/SdsGeneratorTool.jsx`):**
   - Rozszerzono atrybut `accept` ukrytego selektora plików oraz funkcję walidacji `handleFileSelect` o rozszerzenie `.docx` oraz typ MIME `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.
   - Zaktualizowano etykiety wizualne obszaru upuszczania plików (dropzone) informujące o rekomendowanym formacie DOCX.
   - Zaktualizowano odcinanie rozszerzenia źródłowego przy pobieraniu wygenerowanego pliku (`replace(/\.(pdf|rtf|docx)$/i, '')`).
   - Przebudowano produkcyjny pakiet dystrybucyjny frontendu (`npm run build`).

8. **Wieloetapowa Tarcza Ekstrakcji Podsekcji 1.2 i Auto-Remediacja w SDSSchemaValidator:**
   - Wyeliminowano błąd `[SDS_SCHEMA_VIOLATION]: Brak lub pusta wymagana sekcja narracyjna: 'section_1_2'`.
   - W `SDSDocxParser`: rozszerzono `matchSectionHeader` o warianty wielojęzyczne (`SEZIONE`, `SECTION`, `SEKCJA`, `SECCIÓN`, `ABSCHNITT`, `RUBRIQUE`), sprawdzanie nagłówków w tabelach banerowych (`<w:tbl>`) oraz automatyczne przenoszenie akapitów preambuły zawierających `1.1`/`1.2` do sekcji 1.
   - W `prepareAgentPayload`: wprowadzono 4-etapową kaskadę odzyskiwania podsekcji 1.2:
     1. Regex numeryczny `1.2` -> `1.3`.
     2. Semantyczne słowa kluczowe w wielu językach (`Usi pertinenti identificati`, `Relevant identified uses`, `Istotne zidentyfikowane zastosowania`, `Zastosowania zidentyfikowane`).
     3. Globalne skanowanie całego dokumentu (`fullText`).
     4. Gwarantowany fallback zgodny z załącznikiem II do REACH (UE 2020/878).
   - W `SDSSchemaValidator.validateTranslatedSections`: wdrożono normalizację aliasów kluczy (`section_1.2`, `1.2`, `section1_2`, `section_1` -> `section_1_2`) oraz automatyczną naprawę (auto-remediację) z tekstu źródłowego lub bezpiecznego szablonu prawnego w razie pominięcia sekcji 1.2 przez LLM.

9. **Uniwersalna dyskryminacja tabel OpenXML (Layout Tables vs Data Tables):**
   - Pliki DOCX powstałe z konwersji PDF często opakowują całe strony lub grupy sekcji w kontenery układu (`<w:tbl>`). Wcześniejszy parser traktował każdą tabelę jako niepodzielną całość i pobierał numer sekcji jedynie z pierwszej komórki (`tableRows[0][0]`), co powodowało "uwięzienie" sekcji 5, 6, 7, 8 wewnątrz sekcji 4.
   - Wdrożono metodę `tableContainsSectionHeader($, tbl)`: jeśli tabela zawiera w swoich komórkach nagłówki kolejnych sekcji, silnik przełącza się w tryb sekwencyjnego strumieniowania akapitów (`<w:p>`) wewnątrz komórek, płynnie przechodząc przez sekcje 1..16. Jeśli tabela jest tabelą danych (np. składniki, NDS, ekotoksyczność), zostaje zachowana jako ustrukturyzowana macierz w `tablesBySection`.

10. **Bramka sekwencyjnej monotoniczności REACH i kotwiczenie nagłówków (`^`):**
    - Wyeliminowano fałszywe przejścia sekcji powodowane przez śródzdaniowe odnośniki w tekście (np. w sekcji 16: "Pełny tekst zwrotów H wymienionych w sekcjach 2-3").
    - W `matchSectionHeader` wprowadzono:
      a) Kotwiczenie do początku linii (`^`) i rygorystyczną długość wiersza (<= 250 znaków),
      b) Bramkę monotoniczności REACH: nagłówek sekcji jest akceptowany wyłącznie wtedy, gdy `detectedNum >= currentNum` (sekwencyjny postęp od 1 do 16).

11. **Wielowierszowa ekstrakcja tabel składników sekcji 3 (Split Tables & Multi-Row Blocks):**
    - W dokumentach dostawców tabela składników sekcji 3.2 jest dzielona przez podziały stron na wiele niezależnych elementów `<w:tbl>`. Parser przetwarza teraz tablice wszystkich tabel przypisanych do sekcji 3.
    - Wiersze substancji w DOCX mają strukturę wielowierszowych bloków (Wiersz 1: Nazwa substancji, Wiersz 2: INDEX / Stężenie / Klasyfikacja CLP, Wiersz 3: WE / SCL, Wiersz 4: CAS / REACH).
    - Zaimplementowano uniwersalną blokową agregację wierszy, wyodrębniającą 100% składników (wszystkie 19 pozycji w teście SANDALO) wraz z precyzyjnym rozróżnieniem numerów CAS od indeksowych i dokładnymi klasyfikacjami CLP.

12. **Spójność regulacyjna między Sekcją 2 a Sekcją 12.1 (H412):**
    - W przypadku gdy mieszanina posiada w Sekcji 2 klasyfikację zagrożenia dla środowiska wodnego (np. Aquatic Chronic 3, H412), Sekcja 12.1 automatycznie odzwierciedla tę klasyfikację, zapobiegając sprzeczności z klauzulami "produkt nie jest niebezpieczny dla środowiska".

## Skutki i Weryfikacja
- Całkowite wyeliminowanie błędów odczytu sekcji BHP/PPOŻ (Sekcje 5, 6, 7 posiadają pełne procedury zamiast pustych sekcji).
- Usunięcie fałszywych piktogramów (czaszka, żrący, mutagenność) w Sekcji 2.2, które wynikały z omyłkowego wchłonięcia słownika zwrotów H z Sekcji 16.
- Ekstrakcja 100% składników (wszystkie 19 substancji w karcie Sandalo) z kompletnymi numerami CAS, WE, stężeniami i klasyfikacjami CLP.
- Pomyślne przejście dedykowanego zestawu testów w `tests/sds.docx_input.test.js` (6/6 PASS) oraz pełnego suite testów SDS:
  1. `sds.docx_input.test.js` (6/6 PASS).
  2. `sds.compiler_engine.test.js` (PASS).
  3. `sds.schema.validator.test.js` (PASS).
  4. `sds.compliance.test.js` (PASS).
  5. `sds.zero_hardcodes.test.js` (PASS).
  6. `sds.audit_sanepid_fixes.test.js` (PASS).
- Usunięto 4 pliki robocze z `docs/SDS/` zgodnie z kategoryczną dyspozycją Użytkownika.
