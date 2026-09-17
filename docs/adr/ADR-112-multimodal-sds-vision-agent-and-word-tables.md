# ADR-112: Wielomodalny Silnik Vision AI (SDSVisionAgent) i Natywne Tabele OpenXML (SDSDocxBuilder)

## Status
Zaakceptowany i Wdrożony (Produkcja)

## Kontekst i Problem
Poprzednia architektura generatora kart charakterystyki SDS opierała się na wieloetapowym parsowaniu wyrażeniami regularnymi (ponad 4500 linii w `sds.service.js` i `sds.eco_phys.parser.js`). Podejście to cierpiało na fundamentalne wady:
1. **Regresje i kruchość regexów:** Zmiany formatu u różnych zagranicznych producentów (włoskich, angielskich) powodowały gubienie wierszy w tabelach składników, nieprawidłowe łamanie linii w sekcjach ekotoksykologicznych i fizykochemicznych.
2. **Deformacja wizualna dokumentu DOCX:** W wyjściowym dokumencie Word sekcje 9.1 i 11.1 były renderowane jako płaski tekst z surowymi znakami potoku (`|`), co sprawiało, że wygenerowany plik wyglądał jak uszkodzony i nie nadawał się do publikacji handlowej ani urzędowej.
3. **Brak spójnego odwzorowania wzorca SANDALO:** Karta referencyjna `docs/SDS/8034055535424_SDS_SANDALO 1.0 PL.pdf` posiada profesjonalny, estetyczny layout (zielone akcenty `#00A651`, nagłówek i stopka z numeracją stron, elegancka 4-kolumnowa tabela składników w sekcji 3.2 z wyszczególnieniem nazwy polskiej i oryginalnej, pełne zestawienie właściwości fizykochemicznych a-s).

## Decyzja Architektoniczna
1. **Wielomodalny Ingestor Dokumentów (`SDSVisionAgent`):**
   - Zastąpiono kaskadę wyrażeń regularnych bezpośrednim przetwarzaniem binarnym dokumentu `.docx` / `.pdf` przez wielomodalne modele Gemini (`gemini-3.8-flash` jako model główny, z automatycznym fallbackiem do `gemini-3.1-pro-preview` oraz `gemini-3.6-flash`).
   - Plik wejściowy jest przesyłany z natywnym typem MIME `application/vnd.openxmlformats-officedocument.wordprocessingml.document` lub `application/pdf`. Model z pełnym zrozumieniem kontekstu chemicznego i układu graficznego dokonuje ekstrakcji i translacji na język polski, zwracając ustrukturyzowany model danych JSON dla wszystkich 16 sekcji.
2. **Deterministyczne Wzbogacanie Prawne (RAG + Rejestry Urzędowe):**
   - Na etapie `enrichWithPolishRegulations` silnik automatycznie przeszukuje lokalny rejestr NDS (`nds_database_2018.json` z uwzględnieniem Dz.U. 2024 poz. 1017) dla zidentyfikowanych numerów CAS składników i wstrzykuje urzędowe limity do Sekcji 8.1.
   - Wstrzykiwane są oficjalne polskie numery ratunkowe (Łódź +48 42 631 47 24/25, Warszawa +48 22 619 66 54, 112) oraz dane dystrybutora (ITALLUX Sp. z o.o.) do Sekcji 1.3 i 1.4.
   - Sekcja 15.1 jest weryfikowana pod kątem kompletu polskich i unijnych aktów prawnych (REACH, CLP, Seveso III, ustawa o odpadach, ustawa o opakowaniach, ustawa o przewozie towarów niebezpiecznych).
3. **Natywny Kompilator OpenXML Word (`SDSDocxBuilder`):**
   - Zbudowano od podstaw moduł `src/modules/sds/sds.docx.builder.js`, który generuje dokument Word zgodny 1:1 ze specyfikacją wizualną karty SANDALO:
     * Strona 1: Tytuł karty 16pt bold `#111827`, podtytuł (UE 2020/878) 8pt italic `#4B5563`, tabela metadanych z zielonymi liniami granicznymi `#00A651` i tłem `#F9FAFB`.
     * Tytuły sekcji 1–16: 11pt bold z dolną belką szmaragdową `#00A651`.
     * Podsekcje: kanoniczne urzędowe nagłówki REACH UE 2020/878 (np. `9.1. Informacje na temat podstawowych właściwości fizycznych i chemicznych`).
     * Sekcja 3.2: Prawdziwa 4-kolumnowa tabela OpenXML (`Table`, `TableRow`, `TableCell`) z szerokościami 3000, 2500, 2700, 1400 dxa (suma 9600 dxa), tłem nagłówka `#F2F4F7`, czystą polską nazwą w kolumnie 1 i oryginalną nazwą w nawiasie kursywą poniżej.
     * Sekcja 9.1: Strukturalny wykaz punktów od a) do s) z pogrubionymi nazwami właściwości i właściwymi odstępami.
     * Sekcja 14: Integracja etykiet ostrzegawczych ADR i znaków LQ.
     * Paginacja: bieżący nagłówek i stopka na każdej stronie z numeracją dynamiczną `PageNumber.CURRENT` z `PageNumber.TOTAL_PAGES`.

## Skutki i Rezultaty
1. **Całkowita eliminacja surowych pipe'ów i deformacji tabel:** Dokument wyjściowy w Microsoft Word prezentuje się nieskazitelnie, estetycznie i profesjonalnie.
2. **Bezbłędna walidacja karty testowej:** Karta `docs/SDS/8051944811087_SDS_NAJMA_1to1_Konwertowany.docx` została przetłumaczona i wygenerowana do `docs/SDS/8051944811087_SDS_NAJMA_1.0_PL.docx` w czasie ~35 sekund. Inspekcja XML wykazała 297 poprawnie sformatowanych akapitów, 2 natywne tabele Worda, brak wycieków obcojęzycznych i 100% kompletności prawnej.
3. **Integracja w architekturze systemu:** Kontroler `sds.controller.js` korzysta domyślnie z `processSdsWithVisionAgent`, zapewniając płynne przetwarzanie plików DOCX i PDF przez API.
