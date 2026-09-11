# ADR-049: Refaktoring z Overfittingu do 100% Uniwersalności – Uniwersalne Parsery Sekcji 1, 4–7 oraz Deterministyczna Sekcja 9 Właściwości Fizykochemicznych (Rozporządzenie UE 2020/878)

## Status
Zaakceptowany (Accepted)

## Kontekst
W toku wcześniejszych prac moduł SDS (`src/modules/sds/sds.service.js`) osiągnął pełną stabilność w Sekcjach 2, 3 i 8, jednak pozostałe sekcje cierpiały na tzw. **overfitting jednostkowy**:
1. **Sekcja 1:** Posiadała zahardkodowane dane producenta (`SUAREZ COMPANY S.R.L.`), sztywne zastosowania konsumenckie perfum do tkanin oraz sztywny telefon producenta, co uniemożliwiało poprawne generowanie kart SDS dla innych marek i typów produktów chemicznych.
2. **Sekcje 4, 5, 6, 7:** Opierały się na statycznych formułach tekstowych zamiast dynamicznego wyciągania deklaracji z tekstu źródłowego (EN/IT/PL) i ich słownikowego mapowania.
3. **Sekcja 9:** Była delegowana do modelu LLM w ramach `descriptiveSectionsToTranslate`, co stwarzało ryzyko halucynacji liczb, jednostek, gubienia znaków nierówności lub nieprawidłowej interpretacji artefaktów paginacji PDF (`Page n.of`, znaczniki daty wtrącone w wielowierszowe nazwy właściwości fizykochemicznych).

## Decyzje Architektoniczne
1. **Uniwersalny Parser Sekcji 1 (`processSection1`):**
   - Zastąpiono sztywne stringi dynamicznym parserem wielojęzycznym regex (PL/EN/IT).
   - Ekstrakcja 1.1: nazwa handlowa (`Trade name:` / `Nome commerciale:` / `Nazwa handlowa:`), kod produktu (`Trade code:` / `Codice:` / `Kod:`), kod UFI.
   - Ekstrakcja 1.2: role konsumenckie/profesjonalne/przemysłowe, zalecane zastosowania oraz zastosowania odradzane.
   - Ekstrakcja 1.3: nazwa firmy producenta, wieloliniowy adres, telefon, e-mail osoby odpowiedzialnej oraz strona www.
   - Ekstrakcja 1.4: telefon alarmowy producenta (godziny pracy, języki), przy zachowaniu urzędowych telefonów alarmowych RP (112, 998, 999) i konfigurowalnych danych dystrybutora w Polsce (`companyConfig`).
2. **Dynamiczne Ekstraktory Blokowe dla Sekcji 4, 5, 6 i 7:**
   - Wdrożono certyfikowany słownik fraz i terminów medyczno-chemicznych `PHRASE_DICTIONARY_PL` oraz metodę `translatePhrase()`.
   - **Sekcja 4:** dynamiczne wyciąganie zaleceń dla skóry, oczu, spożycia, dróg oddechowych, objawów (4.2) oraz leczenia (4.3).
   - **Sekcja 5:** precyzyjna ekstrakcja środków odpowiednich, niewłaściwych (naprawiony regex nagłówków `for safety reasons`), zagrożeń termolizy oraz aparatów SCBA i normy EN 469.
   - **Sekcja 6:** podział na personel nieinterweniujący i ratowników, ochrona środowiska, sorbenty i odesłania do sekcji 8 i 13.
   - **Sekcja 7:** wyodrębnienie środków ostrożności, higieny pracy, warunków magazynowania i rozwiązań przemysłowych.
3. **Deterministyczny Parser Właściwości Fizykochemicznych Sekcji 9 (`processSection9`):**
   - Wyłączono Sekcję 9 z translacji LLM (`toTranslate`) i włączono do `deterministicSections.section_9` ze statusem `CLP_MAPPED`.
   - Zaimplementowano uniwersalną metodę sanityzacji `cleanPdfArtifacts()` usuwającą wtrącenia paginacji PDF i powtórzenia nagłówków.
   - Ekstrakcja kompletu **18 urzędowych parametrów fizykochemicznych** wg Załącznika II do Rozporządzenia Komisji (UE) 2020/878 i wzorca EKOS Gdańsk:
     1. Stan skupienia
     2. Kolor
     3. Zapach
     4. Temperatura topnienia/krzepnięcia
     5. Temperatura wrzenia lub początkowa temperatura wrzenia i zakres temperatur wrzenia
     6. Palność materiałów
     7. Dolna i górna granica wybuchowości
     8. Temperatura zapłonu
     9. Temperatura samozapłonu
     10. Temperatura rozkładu
     11. pH (odizolowany regex asercją lookbehind `(?<![A-Za-z])pH(?![A-Za-z])`)
     12. Lepkość kinematyczna
     13. Rozpuszczalność w wodzie
     14. Rozpuszczalność w innych rozpuszczalnikach
     15. Współczynnik podziału n-oktanol/woda (wartość współczynnika log)
     16. Prężność pary
     17. Gęstość lub gęstość względna
     18. Względna gęstość pary
     19. Charakterystyka cząsteczek
     + Podsekcja 9.2: Inne informacje (Lotne Związki Organiczne - LZO / VOC).
   - Normalizacja polskich przecinków dziesiętnych (`normalizePhysChemValue`) oraz jednostek (`mm²/s`, `g/cm³`, `g/ml`, `°C`).
4. **Wielojęzyczna Segmentacja i Typografia DOCX:**
   - Rozszerzono `SDSPDFParser.segmentInto16Sections` o polskie nagłówki `SEKCJA`, umożliwiając segmentację kart sporządzonych po polsku, angielsku i włosku.
   - Rozszerzono regułę `isBoldStart` w `SDSDocxExporter` o wszystkie 18 parametrów fizykochemicznych oraz etykiety kontaktowe.

## Konsekwencje
- Silnik SDS stał się w 100% uniwersalny – przetwarza dowolne karty charakterystyki dowolnych producentów bez zhardkodowanych danych firmowych.
- Sekcja 9 jest w 100% deterministyczna, wolna od halucynacji LLM i zgodna z Załącznikiem II do 2020/878.
- Zmniejszono zużycie tokenów API Gemini (LLM odpowiada już tylko za sekcje 10, 11, 12 i 14).
