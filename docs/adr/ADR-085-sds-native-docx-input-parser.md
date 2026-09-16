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

## Skutki i Weryfikacja
- Całkowite wyeliminowanie błędów odczytu sekcji 3.2 i 4.1 wynikających ze spłaszczania wektorowego PDF.
- Pomyślne przejście dedykowanego zestawu testów w `tests/sds.docx_input.test.js` (6/6 PASS):
  1. Detekcja formatu `isDocxFile`.
  2. Ekstrakcja 16 sekcji z `SANDALO.docx` bez wycieku nagłówków.
  3. Bezpośrednia ekstrakcja tabeli składników z `SANDALO.docx` (17 komponentów z kompletnymi danymi).
  4. Ekstrakcja z `TALCO.docx`.
  5. Integracja z `SDSDocumentParser.extractText`.
  6. Pełne przygotowanie deterministycznego payloadu w `SDSProcessorEngine`.
- Zero regresji na istniejących zestawach testowych PDF i RTF.
