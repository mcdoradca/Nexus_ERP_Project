# ADR-0165: Integralność procedur łączonych CLP (zakaz rozszczepiania), prewencja P264, standard hasła ostrzegawczego z myślnikiem oraz spójność etykiety Allegro Ostrzeżenie CLP/GPSR

## Status
ZAAKCEPTOWANY / WDROŻONY

## Kontekst
Podczas audytu potoku optymalizacji ofert (`offer-optimizer-v2`) dla produktów chemicznych i detergentowych podlegających Rozporządzeniu CLP (WE 1272/2008) oraz standardom Allegro GPSR zidentyfikowano cztery krytyczne uchybienia:
1. **Patologiczne rozszczepienie kodów P:** Złożone procedury medyczne pierwszej pomocy były rozbijane na pojedyncze kody w osobnych liniach (`P301`, `P312`, `P305`, `P351`, `P338`, `P337`, `P313`), co tworzyło bezsensowne, urwane zdania bez dyspozycji medycznej (np. `P301 – W PRZYPADKU POŁKNIĘCIA:` oraz `P305 – W PRZYPADKU DOSTANIA SIĘ DO OCZU:`). Zgodnie z Rozporządzeniem CLP (Załącznik IV) oraz oficjalnymi normami kart SDS i bazy fraz EUPHRAC, procedury łączone stanowią nierozerwalne formuły kombinowane: `P301+P312`, `P305+P351+P338`, `P337+P313`.
2. **Przyczyna źródłowa w walidatorze:** Śledztwo wykazało, że w `validators/index.js` znajdował się błędny regex `gluedPRegex = /P\d{3}(?:\+P\d{3})*\s*\+\s*P\d{3}/i`. Z powodu `\s*` kwalifikował on legalne kody kombinowane z plusem jako błąd, zmuszając Agenta 10 (Sentinel) w pętli samonaprawy do ich rozbijania na pojedyncze kody bez dopełnienia dyspozytywnego.
3. **Błędy interpunkcyjne i etykiet:** W haśle ostrzegawczym stosowano dwukropek (`Hasło ostrzegawcze: UWAGA`) zamiast formatu z myślnikiem (`Hasło ostrzegawcze – UWAGA`). W tagu sekcji 6 pojawiało się obcięte `<b>Ostrzeżenie CLP:</b>` zamiast ustandaryzowanego na Allegro tagu `<b>Ostrzeżenie CLP/GPSR:</b>`. Spowodowane to było regułą w `validators/index.js` zakazującą hybrydy `CLP/GPSR`.
4. **Brakujący zwrot prewencji ogólnej P264:** Zgodnie ze standardem CLP przy klasyfikacji substancji lub mieszanin drażniących oczy (H319 / H318) obok P280 (*"Stosować ochronę oczu"*) obligatoryjnie musi znaleźć się zwrot prewencyjny `P264 – Dokładnie umyć ręce po użyciu.`.

Zgodnie z zasadą prymatu inteligencji modeli i eliminacji fałszywych ograniczeń kodu usunięto sabotażowe reguły walidatora, zaktualizowano wiedzę dziedzinową Agentów A5, A6 i A10 oraz zaimplementowano mechanizmy obronne w serwisie bezpieczeństwa.

## Podjęte Decyzje i Zmiany Architektoniczne

### 1. Eliminacja sabotażowych reguł w `validators/index.js`
- Usunięto wadliwy regex `gluedPRegex`, który blokował legalne kody procedur łączonych CLP z plusem (`P305+P351+P338`, `P301+P312`, itp.).
- Usunięto regułę zabraniającą członu `CLP/GPSR`.
- Dodano regułę `V13 validate_section6_compliance`:
  * Weryfikuje zakaz rozszczepionych nagłówków okolicznościowych bez dopełnienia (np. `P301 – W PRZYPADKU POŁKNIĘCIA:$`).
  * Wymaga ustandaryzowanego tagu Allegro `<b>Ostrzeżenie CLP/GPSR:</b>` zamiast uciętego `<b>Ostrzeżenie CLP:</b>`.
  * Wymaga formatu hasła ostrzegawczego z myślnikiem: `Hasło ostrzegawcze – UWAGA` / `NIEBEZPIECZEŃSTWO`.
  * Wymaga obecności kodu `P264` obok `P280` przy wystąpieniu zagrożenia H319 lub H318.

### 2. Integracja formuł kombinowanych i prewencji w `gpsr.safety.service.js`
- W funkcji `splitCombinedPPhrases`:
  * Zaimplementowano automatyczne scalanie pojedynczych wpisów z bazy fraz EUPHRAC w nierozerwalne formuły kombinowane:
    - `P301` + `P312` -> `P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ lub z lekarzem.`
    - `P305` + `P351` + `P338` -> `P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.`
    - `P337` + `P313` -> `P337+P313 – W przypadku utrzymywania się działania drażniącego na oczy: Zasięgnąć porady/zgłosić się pod opiekę lekarza.`
    - `P302` + `P352` -> `P302+P352 – W PRZYPADKU KONTAKTU ZE SKÓRĄ: Umyć dużą ilością wody z mydłem.`
  * Wprowadzono eliminację osieroconych kodów nagłówkowych bez dyspozycji medycznej.
- Zaktualizowano generowanie hasła ostrzegawczego: `Hasło ostrzegawcze – ${signalWord}`.
- Wprowadzono obligatoryjny kod `P264 – Dokładnie umyć ręce po użyciu.` w fallbacku oraz w bloku procedur bezpieczeństwa dla H319/H318.
- Wykluczono kody składowe procedur kombinowanych z pętli dopisywania pozostałych zwrotów prewencyjnych.

### 3. Tarcza sanityzująca w `orchestrator.js`
- W `sanitizeSection6Html`:
  * Normalizacja tagu: `<b>Ostrzeżenie CLP:</b>` -> `<b>Ostrzeżenie CLP/GPSR:</b>`.
  * Normalizacja hasła ostrzegawczego: `Hasło ostrzegawcze:\s*(UWAGA|NIEBEZPIECZEŃSTWO)` -> `Hasło ostrzegawcze – $1`.
  * Eliminacja osieroconych, rozszczepionych linii `P301`, `P305`, `P337`, gdy w tekście obecna jest już pełna formuła kombinowana.

### 4. Aktualizacja Promptów (A5, A6, A10) i Rekompilacja
- **Agent 5 (Legal Compliance Shield):**
  * Wprowadzono jednoznaczny zakaz rozbijania formuł łączonych CLP na osobne kody.
  * Zdefiniowano format hasła ostrzegawczego z myślnikiem.
  * Nałożono wymóg kodu P264 obok P280 dla mieszanin drażniących oczy (H319/H318).
  * Wymuszono format tagu `<b>Ostrzeżenie CLP/GPSR:</b>`.
- **Agent 6 (Master Copywriter):**
  * Zaimplementowano zakaz rozszczepiania formuł procedur medycznych.
  * Wymuszono standard tagu Allegro `Ostrzeżenie CLP/GPSR:`, hasło z myślnikiem oraz P264.
- **Agent 10 (Master Compliance Sentinel):**
  * Reguła F5: rozszerzono audyt o weryfikację formuł kombinowanych CLP, scalanie rozszczepionych kodów, naprawę tagu `Ostrzeżenie CLP/GPSR:`, zamianę dwukropka na myślnik w haśle oraz uzupełnianie brakującego kodu P264.
- Przeprowadzono kompilację promptów przez `prompt-compiler.js` (2784 znaków diakrytycznych, 0 błędów).

### 5. Weryfikacja Testowa
- Dodano testy jednostkowe w `gpsr.safety.test.js` oraz `validators.test.js`.
- Wszystkie 235 testów jednostkowych potoku `offer-optimizer-v2` przeszło pomyślnie (`pass 235, fail 0`).

## Konsekwencje
- Procedury medyczne w sekcji 6 są zawsze kompletne, czytelne i zgodne z oficjalnym Rozporządzeniem CLP oraz standardem kart SDS.
- Wyeliminowano sztuczne błędy walidatora, które powodowały degradację jakości tekstu przez modele w pętli samonaprawy.
- Etykietowanie Allegro zachowuje pełną spójność formatu `<b>Ostrzeżenie CLP/GPSR:</b>` oraz poprawne hasło ostrzegawcze z myślnikiem.
- Produkty drażniące oczy (H319/H318) zawierają pełną prewencję (P264 + P280).
