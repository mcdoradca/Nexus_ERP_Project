# ADR-051: Prawna i Strukturalna Przebudowa Sekcji 12 (Informacje Ekologiczne) wg Rozporządzenia Komisji (UE) 2020/878

## Status
Zaakceptowany i wdrożony.

## Kontekst i Problem
Dotychczas Sekcja 12 (*Informacje ekologiczne*) była przekazywana w całości do modelu LLM w ramach słownika `toTranslate`. Powodowało to krytyczne błędy niezgodności z prawem unijnym oraz ryzyko zniekształcenia danych chemicznych:
1. **Złamanie struktury prawnej:** Zgodnie z Załącznikiem II do Rozporządzenia (WE) nr 1907/2006 (REACH), zmienionym przez Rozporządzenie Komisji (UE) 2020/878, Sekcja 12 musi zawierać ściśle 7 ponumerowanych podsekcji:
   - 12.1. Toksyczność
   - 12.2. Trwałość i zdolność do rozkładu
   - 12.3. Zdolność do bioakumulacji
   - 12.4. Mobilność w glebie
   - 12.5. Wyniki oceny właściwości PBT i vPvB
   - 12.6. Właściwości zaburzające funkcjonowanie układu hormonalnego *(Nowość wprowadzona przez 2020/878! Dawniej w 2015/830 podsekcja 12.6 to były "Inne szkodliwe skutki", które przesunięto do 12.7)*
   - 12.7. Inne szkodliwe skutki działania
2. **Chaos w strukturze wejściowej PDF:** W kartach źródłowych (np. włoskich/angielskich) nagłówki 12.1–12.6 były zbite na początku sekcji, a dane ekotoksykologiczne zrzucone luzem poniżej. W efekcie model LLM gubił powiązania, pozostawiał podsekcje puste lub przestawiał numerację.
3. **Złamanie reguły EXTRACT_RAW:** Tłumaczenie LLM niosło ryzyko halucynacji i zniekształcania wartości testów OECD (LC50, EC50, NOEC), jednostek (`mg/l`), symboli (`≤`, `>=`) oraz łacińskich nazw organizmów wodnych (*Daphnia magna*, *Oncorhynchus mykiss*).

## Podjęte Decyzje Architektoniczne

1. **Deterministyczny Silnik Sekcji 12 (`processSection12`):**
   - Wyłączono Sekcję 12 z modułu `toTranslate` i przeniesiono do `deterministicSections.section_12` ze statusem `CLP_MAPPED`.
   - Zaimplementowano odporny parser blokowy obsługujący zarówno układ zbitkowy (clumped headers), jak i standardowy sekwencyjny.
   - Bezwzględne narzucenie obecności wszystkich 7 podsekcji (12.1–12.7). Żadna podsekcja nie pozostaje pusta; w przypadku braku badań dla mieszaniny stosowane są urzędowe formuły prawne zgodne ze standardem ECHA i EKOS Gdańsk.
2. **Pancerna Ekstrakcja i Normalizacja Danych Chemicznych:**
   - Normalizacja sklejeń znaków powstałych w `pdf-parse` (np. sklejenia cyfr CAS z tekstem, łączenie połamanych linii `OECD 201`).
   - Wartości liczbowe sformatowane z polskim przecinkiem dziesiętnym (`5.3 mg/L` -> `5,3 mg/l`).
   - Zachowanie 100% integralności łacińskich nazw gatunków biologicznych (*Daphnia magna*, *Desmodesmus subspicatus*, *Cyprinus carpio*, *Oncorhynchus mykiss*, *Skeletonema costatum*, *Pseudokirchneriella subcapitata*).
   - Nazwy składników mapowane po CAS na urzędowe nazwy polskie (`CAS_TO_PL_MAP` oraz komponenty z Sekcji 3).
3. **Obsługa Podsekcji 12.6 (Zaburzanie gospodarki hormonalnej):**
   - Zintegrowano identyfikację substancji z Wykazu II ECHA (Endocrine Disruptor Assessment List). W karcie testowej galaksolid (`CAS: 1222-05-5`) został precyzyjnie przypisany do podsekcji 12.6 z urzędową formułą:
     *Galaksolid (CAS: 1222-05-5): Wykaz II ECHA – substancja podlegająca ocenie pod kątem właściwości zaburzających funkcjonowanie układu hormonalnego zgodnie z przepisami UE.*
4. **Lokalna Baza Wiedzy i Cache Ekotoksykologiczny (`EcotoxRegistry`):**
   - Utworzono rejestr `src/modules/sds/rag_knowledge/ecotox_cache.json` do buforowania sprawdzonych profili ekotoksykologicznych substancji.
5. **Typografia DOCX (`SDSDocxExporter`):**
   - Zaktualizowano reguły `isLabelHeader` i `isBoldStart` o wszystkie etykiety podsekcji 12.1–12.7, nagłówki testów (`a) Ostra toksyczność dla środowiska wodnego:`, `b) Przewlekła toksyczność dla środowiska wodnego:`) oraz dynamiczne nagłówki substancji z CAS.

## Konsekwencje i Rezultaty
- Karty SDS generują Sekcję 12 w 100% zgodną z Rozporządzeniem Komisji (UE) 2020/878.
- Całkowicie wyeliminowano ryzyko halucynacji parametrów ekotoksykologicznych przez LLM.
- Kompilacja dokumentu DOCX przebiega deterministycznie z profesjonalną typografią.
