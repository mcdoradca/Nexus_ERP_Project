# ADR-0161: Kompleksowa reforma CLP/GPSR, generator EUH208, ochrona zamkniętego świata składników i odblokowanie Master Sentinela (Sekcje 1–6)

## Status
ZAAKCEPTOWANY / WDROŻONY PRODUKCYJNIE

## Kontekst i Identyfikacja Zagrożeń
W audycie bezpieczeństwa i zgodności prawnej potoku EAN Pipeline (`offer-optimizer-v2`) zidentyfikowano 5 krytycznych punktów ryzyka formalno-prawnego i zdrowotnego:
1. **🚨 Kardynalny błąd w alergenach (EUH208):** W detergentach piorących i czyszczących (np. Italchimica Dual Power, płyny do płukania) oficjalne karty SDS i specyfikacje podają obecność substancji zapachowych o potencjale uczulającym (np. salicylan amylu / *amyl salicylate*, salicylan heksylu / *hexyl salicylate*, *OTNE*, mentol, kamfora) oraz silnych konserwantów izotiazolinonowych (*benzisothiazolinone*, *methylchloroisothiazolinone / methylisothiazolinone*). Zgodnie z art. 25 ust. 6 oraz załącznikiem II do Rozporządzenia CLP (WE) nr 1272/2008, mieszanina zawierająca te substancje w stężeniach progowych MUSI posiadać na etykiecie i karcie produktu urzędowy zwrot: `EUH208 – Zawiera [nazwa substancji]. Może powodować wystąpienie reakcji alergicznej.`. Poprzedni skrypt ucinał alergeny funkcją `.slice(0, 2)` lub gubił je całkowicie.
2. **🚨 Niedopuszczalne zbitki procedur ratowniczych P-phrases:** W sekcji bezpieczeństwa orkiestrator generował zbitki kodów P w pojedynczym punkcie listy, np.: `W PRZYPADKU DOSTANIA SIĘ DO OCZU: Ostrożnie płukać wodą przez kilka minut... + W przypadku utrzymywania się działania drażniącego na oczy: Zasięgnąć porady/zgłosić się pod opiekę lekarza.`. Znak `+` łączył odrębne procedury medyczne, co narusza czytelność instrukcji ratunkowej i wymogi inspekcji sanitarnej.
3. **🚨 Brak obligatoryjnego zwrotu P280 przy klasyfikacji H319/H318:** Dla chemii stwarzającej ryzyko podrażnienia oczu (H319) lub uszkodzenia oczu (H318) prawo bezwzględnie wymaga zwrotu P280 (`Stosować ochronę oczu/ochronę twarzy`). Został on pominięty na rzecz ogólnikowych zaleceń.
4. **🚨 Halucynacja składników w Sekcji 3 (Phenoxyethanol w detergentach):** Model generujący sekcję składników (A6) dopisywał konserwant kosmetyczny (*Phenoxyethanol*) do płynów do prania, w których producent stosuje konserwację opartą o BIT/CIT/MIT. Narusza to doktrynę zamkniętego świata (Closed-World Reasoning) i wprowadza konsumenta w błąd co do rzeczywistego składu detergentu.
5. **🚨 Architektura "Ślepego Strażnika" (Blind Sentinel):** Agent 10 (Master Compliance Sentinel) otrzymywał w prompcie zakaz ingerencji w sekcje 3, 5 i 6 ("zamrożone hashem"), co uniemożliwiało mu naprawę błędów prawnych w tych sekcjach i generowanie patchy samonaprawczych.

## Podjęte Decyzje Architektoniczne

### 1. Rozszerzenie Słownika Alergenów i Deterministyczny Generator EUH208
W `src/modules/offer-optimizer-v2/services/gpsr.safety.service.js`:
- Rozszerzono bazę alergenów zapachowych o salicylany (*amyl salicylate*, *hexyl salicylate*, *benzyl salicylate*), estry, ketony zapachowe (*OTNE* / *tetramethyl acetyloctahydronaphthalenes*), mentol, kamforę, terpineol, eukaliptol, kumarynę.
- Dodano twardy leksykon konserwantów uczulających: *benzisothiazolinone* (BIT), *methylisothiazolinone* (MIT), *methylchloroisothiazolinone / methylisothiazolinone* (CIT/MIT), *octylisothiazolinone* (OIT), *bronopol*, *glutaral*.
- Zaimplementowano funkcję `formatSubstanceName(substance)` czyszczącą nazwy INCI/IUPAC.
- Zaimplementowano deterministyczny generator zwrotu `EUH208`:
  `EUH208 – Zawiera [substancje oddzielone przecinkami]. Może powodować wystąpienie reakcji alergicznej.`
  Usunięto jakiekolwiek sztuczne ucinanie tablic (`.slice(0, 4)`, `.slice(0, 2)`).

### 2. Rozklejanie Zbitków Procedur P (De-gluing Engine)
W `src/modules/offer-optimizer-v2/services/gpsr.safety.service.js`:
- Zaimplementowano algorytm `splitCombinedPPhrases(phrases)`, który rekurencyjnie dzieli zdania połączone znakiem ` + ` lub `\n` oraz oczyszcza prefiksy i łączniki. Każda procedura ratownicza staje się odrębnym punktem `<li>`.
- Wymuszono obecność zwrotu `P280: Stosować ochronę oczu / ochronę twarzy.` w przypadku wykrycia zwrotu H319 lub H318 w chemii czyszczącej.

### 3. Wzbogacenie Ekstrakcji BaseLinker PIM
W `src/modules/offer-optimizer-v2/baselinker.extract.config.json` oraz `baselinker.extract.js`:
- Dodano mapowanie atrybutów CLP z cech produktu: `clp_signal_word`, `clp_h_phrases`, `clp_p_phrases`, `clp_euh_phrases`, `detergent_composition`.
- Przekazano te pola do stanu orkiestratora (`this.state.extracted_data`), zapewniając węzłom A4, A5, A6 i A10 autentyczne dane z karty SDS/PIM.

### 4. Tarcza Doktryny Zamkniętego Świata dla Składników (Sekcja 3)
- W `src/modules/offer-optimizer-v2/orchestrator.js` wdrożono filtr `sanitizeSection3Html`, który usuwa halucynowane konserwanty (np. Phenoxyethanol), jeśli nie występują one w danych wejściowych PIM/SDS.
- W `src/modules/offer-optimizer-v2/validators/index.js` utworzono walidator `validate_section3_ingredients_closed_world`, który blokuje ofertę w przypadku pojawienia się niezgodności składu z danymi laboratoryjnymi.

### 5. Walidator Sekcji 6 i Oczyszczanie Hybryd CLP/GPSR
- W `src/modules/offer-optimizer-v2/orchestrator.js` zmodyfikowano `sanitizeSection6Html`:
  - Bezwzględne wycięcie nielegalnej hybrydy `Ostrzeżenie CLP/GPSR:` na rzecz czystego rozgraniczenia `Środki ostrożności (CLP):` lub `Informacje o bezpieczeństwie (GPSR):`.
  - Atomizacja sklejonych zwrotów P na niezależne tagi `<li>`.
- W `src/modules/offer-optimizer-v2/validators/index.js` dodano `validate_section6_compliance` weryfikujący brak zbitków, obecność P280 i poprawność formatowania EUH208.

### 6. Odblokowanie Master Sentinela na Pełny Zakres Sekcji (Sekcje 1–6)
- W `src/modules/offer-optimizer-v2/orchestrator.js`:
  - Usunięto sztuczne ograniczenie wejścia A10 do sekcji 1, 2, 4. Przekazywany jest pełny komplet `section_1_html` do `section_6_html`.
  - Pre-audyt weryfikuje słowa zakazane we wszystkich 6 sekcjach.
  - Pętla samonaprawcza dopuszcza i aplikuje patche dla wszystkich 6 sekcji (`allowedSections = ['section_1_html', ..., 'section_6_html']`).
  - Po zaaplikowaniu patchy natychmiast uruchamiane są sanitizery i walidatory sekcji 3, 5 i 6.
- W `docs/Agent_10_prompt_v4.md` oraz `prompts/Agent_10_compiled.md`:
  - Zaktualizowano matrycę audytu o reguły F5 (CLP/GPSR), F6 (doktryna zamkniętego świata składników), F7 (rygor fizykochemiczny CE/pH).
  - Nadano Agentowi 10 formalne uprawnienie do generowania patchy korygujących dla Sekcji 1–6.

### 7. Rygorystyczna Ochrona Modułów Krytycznych
- **Moduł SDS (`src/modules/sds/**`):** Zero zmian. Nienaruszony kod i konfiguracja silnika tłumaczenia kart charakterystyki.
- **Agent 11 i Photoroom:** Pozostawiono w obecnym stanie bez ingerencji.

## Weryfikacja
- Wszystkie zmienione pliki zostały zweryfikowane statycznie kompilatorem Node.js (`node -c`), zwracając kod wyjścia 0.
- Spójność architektoniczna potwierdzona brakiem dryfu między promptami Gemini a logiką orkiestratora.
