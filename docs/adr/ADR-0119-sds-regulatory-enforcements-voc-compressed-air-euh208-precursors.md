# ADR-0119: Deterministyczne Egzekwowanie Zgodności SDS: Bilans LZO, Zakaz Sprężonego Powietrza, Prekursory 2019/1148 i Sanacja EUH208

## Status
Przyjęty i wdrożony (100% Produkcja) - 2026-09-18

## Kontekst i Zgłoszone Defekty
Podczas inspekcji generowanych kart charakterystyki (SDS) w formacie DOCX wykryto 4 istotne uchybienia regulacyjne:
1. **Sekcja 16 (Błąd redakcyjny znacznika):** W treści dokumentu pozostawał niewypełniony znacznik tekstowy szablonu: `EUH208: Zawiera [nazwa substancji uczulającej]. Może powodować wystąpienie reakcji alergicznej.`.
2. **Sekcja 9.2.2 (LZO / VOC):** Występował nielegalny zapis *"brak danych"* zamiast wymaganego wyliczenia i podania zawartości Lotnych Związków Organicznych (LZO) w % oraz g/l.
3. **Sekcja 15.1 (Prekursory materiałów wybuchowych):** Brak obligatoryjnego przywołania Rozporządzenia Parlamentu Europejskiego i Rady (UE) 2019/1148 z dnia 20 czerwca 2019 r. w sprawie wprowadzania do obrotu i stosowania prekursorów materiałów wybuchowych.
4. **Sekcja 7.1 (BHP i manipulowanie mieszaniną):** Brak bezwzględnego zakazu stosowania sprężonego powietrza do napełniania, opróżniania lub manipulowania mieszaniną (wymóg Załącznika II do REACH, pkt 7.1).

## Analiza Przyczyn Źródłowych (Root Cause Analysis)
1. **Szablony EUH208:** Bazy SSOT (`euphrac_ssot.json` i `OFFICIAL_CLP_H_PHRASES`) oraz prompt `AdministrativeAuditorAgent` zawierały frazę `[nazwa substancji uczulającej]` lub `[substancje]`. Gdy model LLM kopiował bazową definicję dosłownie, nawiasy kwadratowe pozostawały w tekście bez dynamicznego podstawienia składników uczulających (Skin Sens. / H317).
2. **Brak bilansu masowego LZO w RAG:** Silnik RAG i budowniczy DOCX nie posiadały kalkulatora zawartości lotnych związków na podstawie stężeń składników i gęstości, zadowalając się domyślnym fallbackiem *"brak danych"*.
3. **Pominięcie Rozporządzenia 2019/1148:** W `SDSDocxBuilder` występował stary szablon `cleanLegal151`, który omijał dynamiczny silnik RAG `LocalKnowledgeConnector.lookupLegalActs`, a sama metoda RAG nie uwzględniała deklaracji o prekursorach.
4. **Luki w Sekcji 7:** Ani baza procedur bezpieczeństwa SOP w `LocalKnowledgeConnector`, ani reguły `WorkplaceSafetyAuditorAgent`, ani `sds.docx.builder.js` nie posiadały dedykowanego renderera wymuszającego zakaz stosowania sprężonego powietrza.

## Podjęte Decyzje Architektoniczne
1. **Dynamiczny Kalkulator Bilansu LZO (`calculateVocContent` w `LocalKnowledgeConnector`):**
   - Zaimplementowano algorytm identyfikujący lotne związki organiczne (alkohole, estry, terpeny, składniki o temperaturze wrzenia $\le$ 250°C lub prężności par $\ge$ 0,01 kPa).
   - Dynamicznie sumuje stężenia w ujęciu wagowym (% w/w) i w połączeniu z gęstością wylicza zawartość w g/l.
   - W przypadku braku składników LZO generuje jednoznaczne urzędowe oświadczenie: *"0,0% wag. (0,0 g/l) - mieszanina nie zawiera lotnych związków organicznych"*. Zakaz stosowania wpisu *"brak danych"*.
2. **Deterministyczna Sanacja EUH208 w Sekcji 16:**
   - Usunięto szablony z nawiasami kwadratowymi z promptu audytora administracyjnego.
   - W `SDSSwarmOrchestrator._applyDeterministicEnforcements` oraz `SDSDocxBuilder.renderSection16` wdrożono bezwzględną sanitację regexem zastępującą wszelkie znaczniki w nawiasach kwadratowych (`/(EUH208:?\s*Zawiera\s*)\[[^\]]+\]/gi`) rzeczywistymi nazwami alergenów wyekstrahowanymi ze składników (Skin Sens. / H317) lub etykiety w Sekcji 2.2.
3. **Obligatoryjna Klauzula Rozporządzenia (UE) 2019/1148 w Sekcji 15.1:**
   - W `LocalKnowledgeConnector.lookupLegalActs` włączono deklarację zgodności z Rozporządzeniem 2019/1148: *"Produkt nie zawiera substancji podlegających zgłoszeniu ani podlegających ograniczeniom (...)"*.
   - Usunięto statyczny szablon `cleanLegal151` z `SDSDocxBuilder.renderSection15` na rzecz dynamicznego wywołania RAG.
4. **Wymóg Zakazu Sprężonego Powietrza w Sekcji 7.1:**
   - Wzbogacono bazę SOP w `LocalKnowledgeConnector.querySafetySOP` o punkt Załącznika II REACH 7.1.
   - Utworzono dedykowaną metodę `SDSDocxBuilder.renderSection7` oraz weryfikator w `SDSSwarmOrchestrator`, które gwarantują obecność klauzuli: *"Zabrania się stosowania sprężonego powietrza do napełniania, opróżniania, przetłaczania lub manipulowania produktem (...)"* przy jednoczesnym oczyszczeniu z obcych klas magazynowania TRGS 510 i WGK.

## Weryfikacja
- Rozszerzono zestaw testów [tests/sds.swarm_rag_compliance.test.js](file:///z:/Nexus_ERP_Project/tests/sds.swarm_rag_compliance.test.js) o 4 nowe testy jednostkowe (testy 8, 9, 10 i 11).
- Wszystkie 11 testów zgodności oraz pełna regresja modułu SDS przeszły w 100% z wynikiem pozytywnym (zero błędów, brak hardkodowania per produkt).
