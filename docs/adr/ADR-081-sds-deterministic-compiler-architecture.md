# ADR-081: Deterministyczny Kompilator Kart Charakterystyki SDS (Architektura AST, Kanoniczna Baza ECHA/CLP, SDSLinter)

## Status
Zaakceptowany i wdrożony (Accepted & Implemented)

## Kontekst
Wcześniejszy moduł adaptacji kart SDS (`src/modules/sds`) opierał się na kruchych heurystykach (blisko 300 ad-hoc wywołań `.replace()`), nieregularnym parsowaniu zrzutów tekstu PDF oraz niekontrolowanej synonimii modelu LLM. Skutkowało to brakiem powtarzalności, losowym gubieniem substancji chemicznych (np. metanolu przez literę X w numerze indeksowym modulo 11), kuriozalnymi podmianami taksonomicznymi oraz kwalifikowaniem fizykochemicznym sprzecznym z Załącznikiem II do REACH (UE 2020/878).

Celem niniejszej refaktoryzacji było przekształcenie modułu SDS w **deterministyczny kompilator chemiczny**, w którym:
1. Dane prawne i ustrukturyzowane podlegają 100% determinizmowi algorytmicznemu.
2. Słownictwo chemiczne pochodzi z jednego źródła prawdy (Single Source of Truth) – oficjalnych słowników ECHA i Rozporządzenia CLP.
3. Przed wygenerowaniem dokumentu wyjściowego uruchamiana jest zautomatyzowana bramka jakościowa Sanepid / PIP (`SDSLinter`).

## Decyzje Architektoniczne

1. **Wydzielenie Kanonicznego Słownika Urzędowego ECHA / CLP (`src/modules/sds/engine/sds.canonical.clp.js`):**
   - Wprowadzono pełny urzędowy rejestr zwrotów H (pojedynczych i łączonych), zwrotów P, klas i kategorii zagrożeń CLP (Tabela 3.1 Załącznik VI), organizmów testowych (z zachowaniem ścisłej taksonomii biologicznej) oraz 21 parametrów podsekcji 9.1.
   - Słownik ten zasila `OFFICIAL_CLP_H_PHRASES` i `OFFICIAL_CLP_P_PHRASES`, eliminując ryzyko brakujących zwrotów lub synonimii LLM.

2. **Silnie Typowany Model Dokumentu AST (`src/modules/sds/engine/sds.ast.js`):**
   - Wprowadzono klasy `SubstanceAST` i `SDSDocumentAST`.
   - Każda substancja reprezentowana jest jako obiekt z walidacją triad identyfikacyjnych (CAS / WE / INDEX / REACH), zakresem stężeń, klasyfikacjami CLP, wartościami SCL i ATE.

3. **Odporny na Podziały Stron Parser Tabeli Sekcji 3 (`src/modules/sds/engine/sds.table.parser.js`):**
   - Izolacja artefaktów nagłówkowych i stopkowych PDF (daty, nazwy firm, paginacja) przed parsowaniem.
   - Obsługa litery kontrolnej `X` w numerach INDEX (`\d{3}-\d{3}-\d{2}-[\dXx]`).
   - Ochrona akronimów ATE granicami słów (`\bATE\b`), eliminująca fałszywe dopasowania przy substancjach o nazwach kończących się na *-ate* (np. salicylany).

4. **Automatyczny Linter Prawno-Chemiczny Sanepid / PIP (`src/modules/sds/engine/sds.linter.js`):**
   - Działa jako obligatoryjna bramka jakościowa (KROK 4c w `sds.agent.js`).
   - Weryfikuje:
     - Poprawność fizykochemiczną cieczy (blokada "Nie dotyczy" dla lepkości i gęstości wg UE 2020/878).
     - Pokrycie limitów NDS/NDSCh dla wszystkich substancji z Sekcji 3 obecnych w rejestrze Dz.U. 2018 poz. 1286 / Dz.U. 2024 poz. 1017.
     - Integralność ekotoksykologiczną i biologiczną.
     - Brak osieroconych linii w oznaczeniach ilości ograniczonych (LQ 1 L).
     - Czystość językową (brak obcych zwrotów).

## Konsekwencje i Korzyści
- **100% Determinizm i Powtarzalność:** Ponowne przetworzenie tego samego pliku generuje identyczny, prawnie poprawny rezultat.
- **Bezpieczeństwo Prawne:** Całkowite wyeliminowanie ryzyka sankcji Sanepidu/PIP za brak limitów NDS czy błędne oznaczenia parametrów fizykochemicznych.
- **Hermetyzacja LLM:** Model językowy tłumaczy wyłącznie czystą narrację, a jego wynik podlega sztywnej walidacji słownikowej i linterowi.
- **Zerowa Regresja:** Pełny zestaw testów repozytorium (122 testy) oraz nowa suita kompilatora (`tests/sds.compiler_engine.test.js` - 6/6 testów) przechodzą w 100%.
