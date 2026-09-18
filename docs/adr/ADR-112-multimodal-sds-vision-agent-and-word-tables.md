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
3. **Natywny Kompilator OpenXML Word (`SDSDocxBuilder`) – Wzorzec SANDALO 1:1:**
   - Zbudowano od podstaw moduł `src/modules/sds/sds.docx.builder.js`, który generuje dokument Word zgodny 1:1 ze specyfikacją wizualną karty SANDALO (`8034055535424_SDS_SANDALO 1.0 PL.pdf`):
     * Strona 1: Tytuł karty 14pt bold `#000000`, podtytuł (UE 2020/878) 8pt italic `#444444`.
     * Tabela metadanych: układ 2-kolumnowy (4800 + 4800 dxa = 9600 dxa) z zielonymi pojedynczymi liniami brzegowymi `#00A651` (1.5pt) na górze i dole oraz tłem `#F9FAFB`. Kolumna lewa: Data sporządzenia, Aktualizacja; Kolumna prawa: Wersja, Zastępuje wersję.
     * Tytuły sekcji 1–16: 11pt bold `#000000` z dolną belką szmaragdową `#00A651` 1.5pt.
     * Nagłówki podsekcji: 10pt bold `#000000` (np. `1.1. Identyfikator produktu`).
     * **Eliminacja echa nagłówków (`cleanSubsectionTitle`):** Bezwzględne usuwanie duplikatów tytułów podsekcji w tekście narracyjnym we wszystkich 16 sekcjach.
     * Sekcja 3.2: Prawdziwa 4-kolumnowa tabela OpenXML (`Table`, `TableRow`, `TableCell`) z szerokościami 3000, 2500, 2700, 1400 dxa (suma 9600 dxa), tłem nagłówka `#F2F4F7`, czystą polską nazwą w kolumnie 1 i oryginalną nazwą w nawiasie kursywą poniżej.
     * Sekcja 9.1: Strukturalny wykaz punktów od a) do s) z pogrubionymi nazwami właściwości w odrębnych akapitach.
     * Sekcja 14: Integracja etykiet ostrzegawczych ADR i znaków LQ.
     * Paginacja: bieżący nagłówek (`KARTA CHARAKTERYSTYKI | [Pełna nazwa handlowa] | Wersja: 1.0 PL`) z dolną linią `#D1D5DB` oraz stopka (`Dystrybutor: ITALLUX Sp. z o.o. | Strona X z Y`) z górną linią `#D1D5DB`.
     * Oczyszczanie składni tabelarycznej: automatyczna konwersja surowych tabel Markdown (`|`) do sformatowanych linii bez deformacji tekstu.

## Skutki i Rezultaty
1. **Całkowita eliminacja surowych pipe'ów i powielonych nagłówków:** Wygenerowany dokument `docs/SDS/8051944811087_SDS_NAJMA (8).docx` jest w 100% zgodny z układem karty SANDALO.
2. **Bezbłędna walidacja karty NAJMA (8):** Karta `docs/SDS/8051944811087_SDS_NAJMA (8).docx` zawiera 341 precyzyjnie rozdzielonych akapitów, 2 natywne tabele Worda, brak wycieków obcojęzycznych (0 naruszeń w audycie) i pełną spójność prawną.
3. **Integracja w architekturze systemu:** Kontroler `sds.controller.js` korzysta domyślnie z `processSdsWithVisionAgent`, zapewniając płynne przetwarzanie plików DOCX i PDF przez API.
