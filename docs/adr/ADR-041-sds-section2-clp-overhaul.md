# ADR-041: Rewizja i Pełna Zgodność Sekcji 2 Kart SDS (CLP & Wzorzec SWEET HOME)

## Status
Zaakceptowany (Accepted)

## Kontekst
W pierwotnej implementacji modułu SDS (`sds.service.js`) sekcje 2.1 i 2.2 wykazywały błędy merytoryczne i architektoniczne:
1. Sklejanie tekstu w PDF (`P101If...`, `P102Keep...`) powodowało niepowodzenie dopasowania regex z flagą `\b`, w wyniku czego zwroty P były gubione.
2. Zwroty uzupełniające EUH (w tym krytyczny zwrot `EUH208` dotyczący substancji uczulających) nie były parsowane ani włączane do sekcji 2.2.
3. System narzucał fałszywe hasło ostrzegawcze `UWAGA` oraz puste linie w sekcji 2.2 nawet dla produktów niestwarzających zagrożenia.
4. Eksporter DOCX renderował piktogramy na samej górze Sekcji 2 zamiast wewnątrz podsekcji 2.2.

## Decyzje Architektoniczne
1. **Ekstrakcja Asercjami Lookbehind:** W klasie `SDSChemicalExtractor` zastąpiono `\b` asercjami `(?<![A-Za-z0-9])`, co gwarantuje 100% skuteczności ekstrakcji kodów H, P i EUH bez względu na formatowanie odstępów w PDF.
2. **Słownik i Mapowanie Alergenów (EUH208):** Wprowadzono bazę polskich nazw alergenów (`ALLERGEN_NAMES_PL`) oraz mechanizm łączenia nazw substancji z Sekcji 3 (po CAS). W rezultacie zwrot EUH208 generuje pełne, certyfikowane brzmienie CLP w języku polskim.
3. **Deterministyczna Podsekcja 2.1:** Wdrożono urzędową formułę CLP dla produktów niestwarzających zagrożenia (*"Mieszanina nie została zaklasyfikowana jako stwarzająca zagrożenie zgodnie z rozporządzeniem (WE) nr 1272/2008 [CLP]"*).
4. **Struktura 2.2 Zgodna ze Wzorcem SWEET HOME:** Sekcja 2.2 została podzielona na precyzyjne podsekcje:
   - `Piktogramy określające rodzaj zagrożenia i hasło ostrzegawcze` (z piktogramami GHS pod nagłówkiem),
   - `Nazwy niebezpiecznych substancji wymienione na etykiecie`,
   - `Zwroty wskazujące rodzaj zagrożenia`,
   - `Zwroty wskazujące środki ostrożności`,
   - `Informacje uzupełniające`.
5. **Typografia DOCX:** Wprowadzono wymuszenie czcionki Arial w stylach całego dokumentu DOCX, eliminując problem nieczytelnych znaków diakrytycznych (krzaczków).

## Konsekwencje
- Wyeliminowano ryzyko prawne i medyczne związane z brakiem informacji o alergenach i zwrotach ostrożności.
- Układ wygenerowanego dokumentu DOCX w 100% odpowiada strukturze dokumentu wzorcowego SWEET HOME.
