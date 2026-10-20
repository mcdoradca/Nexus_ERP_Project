# ADR-0162: Pełna Taksonomia Prawna CLP, Spójność Wertykalna Formuły (First-Principles) i Jednolity Standard Tagów Allegro

## Status
ZAAKCEPTOWANY / WDROŻONY PRODUKCYJNIE

## Kontekst i Identyfikacja Zagrożeń
W audycie wdrożeniowym potoku EAN Pipeline (`offer-optimizer-v2`) na realnym asortymencie chemicznym (detergenty piorące z surfaktantami anionowymi, kationowymi, rozjaśniaczami optycznymi i konserwantami izotiazolinonowymi) zidentyfikowano następujące krytyczne wady architektoniczne i merytoryczne:
1. **🚨 Wybiórcza klasyfikacja CLP i niekompletne procedury ratownicze:**
   Model generował jedynie wyrywkowe procedury płukania oczu (`P305+P351+P338`), pomijając hasło ostrzegawcze (`Hasło ostrzegawcze: UWAGA`), zwrot zagrożenia (`H319 – Działa drażniąco na oczy.`) oraz procedury ratunkowe domykające: `P101` (okazanie pojemnika/etykiety lekarzowi), `P337+P313` (zasięgnięcie porady przy utrzymującym się podrażnieniu oczu) oraz `P301+P312` (postępowanie w razie połknięcia). Stanowiło to rażące naruszenie Rozporządzenia CLP (WE 1272/2008).
2. **🚨 Błędne formatowanie tagów (rozbicie standardu Allegro):**
   Wcześniejsza modyfikacja promptów wymusiła zapis `⚠️ Ostrzeżenie (CLP):` oraz zakazała stosowania zapisu `Ostrzeżenie CLP/GPSR:`, co rozbiło kompatybilność z szablonami ofertowymi Allegro, parserami BaseLinkera oraz wywołało regresję w sanitizatorze HTML. Standardem ekosystemowym dla ostrzeżeń w ofertach Allegro jest `<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> [Treść]</li>`.
3. **🚨 Znikający konserwant w Sekcji 3 (Brak spójności wertykalnej):**
   Jeśli produkt deklarował w karcie SDS lub zwrocie EUH208 obecność konserwantów (np. Kathon CG / *Methylchloroisothiazolinone / Methylisothiazolinone*, BIT), Agent 6 pomijał ten fakt w Sekcji 3 (⚙️ Mechanizm działania). Każdy składnik aktywny i funkcjonalny formuły musi posiadać uzasadnienie technologiczne (stabilizacja mikrobiologiczna formulacji in-can w opakowaniu).
4. **🚨 Ignorowanie fizykochemii rozjaśniaczy optycznych (FWA):**
   Detergenty z rozjaśniaczami optycznymi (absorpcja UV i fluorescencja w pasmie błękitu) nie zawierały w Sekcji 4 (Sposób użycia) ani w FAQ (Sekcja 2) twardego wykluczenia dla tkanin ciemnych i czarnych. Pranie czerni z FWA powoduje zszarzenie i optyczne wyblaknięcie głębi koloru.
5. **🚨 Problem "betonowania reguł" zamiast edukacji dziedzinowej (First-Principles Thinking):**
   Próby dopisywania kolejnych sztywnych reguł if-else do promptów prowadziły do rozrostu promptów i halucynacji. Konieczne było zaszczepienie Agentom fundamentów chemicznych i prawnych z bazy NES (`RAG_SOT_10`, `RAG_SOT_07`, `RAG_SOT_02`) w oparciu o ich rzeczywiste role eksperckie.

---

## Podjęte Decyzje Architektoniczne

### 1. Deterministyczna i Pełna Taksonomia CLP w Serwisie Bezpieczeństwa
W `src/modules/offer-optimizer-v2/services/gpsr.safety.service.js`:
- Dla sklasyfikowanych mieszanin chemicznych i detergentów piorących (`isClassifiedChemical`) zaimplementowano pełną, zamkniętą taksonomię CLP:
  * Hasło ostrzegawcze: `<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> Hasło ostrzegawcze: UWAGA</li>`
  * Zwrot H: `<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> H319 – Działa drażniąco na oczy.</li>`
  * Zwroty P i procedury ratunkowe:
    - `P101 – W razie konieczności zasięgnięcia porady lekarza należy pokazać pojemnik lub etykietę.`
    - `P102 – Chronić przed dziećmi.`
    - `P280 – Stosować ochronę oczu.`
    - `P301+P312 – W PRZYPADKU POŁKNIĘCIA: W przypadku złego samopoczucia skontaktować się z OŚRODKIEM ZATRUĆ/lekarzem.`
    - `P305+P351+P338 – W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut. Wyjąć soczewki kontaktowe, jeżeli są i można je łatwo usunąć. Nadal płukać.`
    - `P337+P313 – W przypadku utrzymywania się działania drażniącego na oczy: Zasięgnąć porady/zgłosić się pod opiekę lekarza.`
  * Zwrot alergenowy: `EUH208 – Zawiera [składniki]. Może powodować wystąpienie reakcji alergicznej.`
- Zachowano warunki brzegowe dla ogólnej chemii myjącej (płyny do naczyń bez SDS), aby nie wywoływać nadmiarowej klasyfikacji przy braku zwrotów H.

### 2. Standaryzacja Tagów i Tarcza Sanitizera w Orkiestratorze
W `src/modules/offer-optimizer-v2/orchestrator.js`:
- Przywrócono generowanie i oczyszczanie standardowych tagów: `<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> ...</li>`.
- W funkcji `sanitizeSection6Html` zaktualizowano regex deduplikacji instrukcji o oczach (dodano alternatywę `CLP\/GPSR`), co zapewnia idealną deduplikację ogólnych zdań w obecności P305.

### 3. Edukacja First-Principles w Promptach Agentów
- **Agent 4 (INCI & Chemical AEO Parser — `Agent_4_prompt_v4.md`):**
  Wdrożono zasady formulacji z NES SOT 10 i 07:
  * Konserwanty formulacji (in-can preservation: izotiazolinony BIT, MIT, Kathon CG, Bronopol) mają zdefiniowaną rolę technologiczną (ochrona czystości mikrobiologicznej formulacji w opakowaniu przed namnażaniem biofilmu i degradacją enzymów/surfaktantów). Obowiązek generowania punktu ⚙️ w korzyściach technicznych AEO.
  * Rozjaśniacze optyczne (FWA): definicja mechanizmu fluorescencji UV i twarda restrykcja materiałowa wykluczająca tkaniny ciemne i czarne.
  * Enzymy: proteaza generująca restrykcję zakazu prania wełny i jedwabiu.
- **Agent 5 (Legal Compliance Shield — `Agent_5_prompt_v4.md`):**
  Wdrożono pełną taksonomię CLP (Hasło ostrzegawcze -> Zwrot H -> Pełna pętla P101/P102/P280/P301/P305/P337 -> EUH208) w jednolitym standardzie tagu Allegro.
- **Agent 6 (Master Copywriter — `Agent_6_prompt_v4.md`):**
  * Spójność wertykalna sekcji 3 (⚙️): zakaz pomijania konserwantów ujawnionych przez A4.
  * Sekcja 4 (✍️) & Sekcja 2 (FAQ ❓): obowiązkowe wykluczenie tkanin czarnych i ciemnych dla detergentów z FWA oraz wełny/jedwabiu dla enzymów proteolitycznych.
  * Sekcja 6 (⚠️): przywrócono standardowy tag `<li>➡️ <b>Ostrzeżenie CLP/GPSR:</b> ...</li>`.
- **Agent 10 (Master Compliance Sentinel — `Agent_10_prompt_v4.md`):**
  * F5: Weryfikacja pełnej sekwencji CLP i standardu tagu Allegro.
  * F6: Audyt wertykalny formuły — wykrywanie „znikającego konserwantu” w Sekcji 3 oraz brakujących restrykcji tkaninowych (ciemne tkaniny) w Sekcji 4 i Sekcji 2. Generowanie patchy korygujących w `repair_patches`.

### 4. Nienaruszalność Modułów Krytycznych
- Moduł SDS (`src/modules/sds/**`): ZERO zmian.
- Moduł Agent 11 i Photoroom: ZERO zmian.

---

## Weryfikacja i Rezultaty
- Uruchomiono kompilator promptów `node src/modules/offer-optimizer-v2/prompt-compiler.js` — pomyślna kompilacja wszystkich węzłów.
- Uruchomiono pełny pakiet testów jednostkowych i integracyjnych:
  `node --test src/modules/offer-optimizer-v2/tests/*.test.js`
  **Wynik: 226 passed, 0 failed (100% GREEN).**
