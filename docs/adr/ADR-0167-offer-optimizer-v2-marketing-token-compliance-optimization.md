# ADR-0167: Optymalizacja kosztowa (Token Burn), behawioralna (A4/A6/A7) oraz uszczelnienie tarcz CLP/HTML w potoku Offer Optimizer V2

- **Status:** Wdrożony (Accepted & Implemented)
- **Data:** 2026-10-29
- **Moduł:** `src/modules/offer-optimizer-v2/` (`orchestrator.js`, `validators/index.js`, `prompt-compiler.js`, `docs/Agent_4..10_prompt_v4.md`)

## 1. Kontekst i Zidentyfikowane Problemy

Audyt telemetrii produkcyjnej potoku EAN (`offer-optimizer-v2`, np. `state_PL-8004120909931`) oraz wygenerowanych ofert JSON ujawnił trzy krytyczne obszary wymagające optymalizacji:

1. **Przepalanie tokenów myślenia (`thoughtsTokenCount` ~35% całkowitego kosztu SKU) i nadmiarowy payload:**
   - Sekcje `## WYJŚCIE` w promptach `Agent_5_prompt_v4.md`, `Agent_6_prompt_v4.md`, `Agent_7_prompt_v4.md` oraz `Agent_10_prompt_v4.md` wymagały zwracania pól nieistniejących w twardych schematach `responseSchema` (`a5Schema`, `a6Schema`, `a7Schema`, `a10Schema`) w `orchestrator.js` (np. `pipeline_id`, `illegal_claims_stripped_log`, `sekcja1..6`, `behavioral_audit`, `final_verdict`, `repair_patches`, `audit_matrix_scores`). Powodowało to dysonans poznawczy podczas dekodowania strukturalnego (blisko 8 000 tokenów myślenia w samych węzłach A7 i A10).
   - Obiekty `agent5Data` i `agent6Data` przekazywały pełny surowy wynik `a1_result` (wraz z wielokrotnymi tablicami kandydatów INCI i listami URL-i), a `agent6Data` otrzymywał również surowy obiekt `a2_result` mimo wcześniejszej sanityzacji w A5.
   - Kompilator `prompt-compiler.js` doklejał do sekcji `§J` techniczną tabelę `## MAPA DYSTRYBUCJI PREFIKSÓW`.

2. **Urwany kontrakt danych behawioralnych do Agenta 7 i duplikacja `⚙️` vs `⚡` w Sekcji 3:**
   - W `orchestrator.js` obiekt `agent7Data` nie przekazywał do Agenta 7 pól wymaganych przez jego prompt: `preserved_minor_flaws`, `product_category`, `net_capacity`, `dozowanie`, `customer_delights` oraz `real_life_use_cases`. Skutkowało to brakiem danych do wyliczenia matematycznej Kotwicy Rutyny (M3) oraz autentycznego efektu Pratfall (M1).
   - W Sekcji 3 Agent 4 i Agent 6 powielały opis tych samych grup składników zarówno w `technical_benefits_aeo` (`⚙️`), jak i w `detected_synergies` (`⚡`).

3. **Luki w deterministycznej sanitizacji i walidacji Allegro/CLP po normalizacji tagów (`<b>` → `<strong>`):**
   - Funkcja `normalizeTags` zamienia `<b>` na `<strong>` po wyjściu z A6, podczas gdy wyrażenia regularne w `sanitizeSection3Html`, `sanitizeSection6Html`, `validate_section6_compliance` oraz `validate_section3_ingredients_closed_world` dopasowywały wyłącznie `<b>`. Przez to post-sanitizacja po patchach A10 była ślepa na znaczniki `<strong>`.
   - W zwrotach kombinowanych CLP (np. `P305+P351+P338`) modele potrafiły zastąpić urzędowy dwukropek po nagłówku okolicznościowym (`W PRZYPADKU DOSTANIA SIĘ DO OCZU:`) myślnikiem (`–`).
   - Przy łączeniu Sekcji 5 i 6 w pole `description_extra4` (`orchestrator.js`) używano separatora `\n<br>\n`, wstrzykując zakazany przez Allegro tag `<br>`.

## 2. Decyzja Architektoniczna

1. **Synchronizacja 1:1 `## WYJŚCIE` ↔ `responseSchema` oraz odchudzenie payloadów:**
   - Zaktualizowano sekcje `## WYJŚCIE` i instrukcje w `Agent_4_prompt_v4.md`, `Agent_5_prompt_v4.md`, `Agent_6_prompt_v4.md`, `Agent_7_prompt_v4.md`, `Agent_10_prompt_v4.md` oraz `SHARED_RULES_v4.1.md`, uzgadniając nazwy pól (`section_1_html..section_6_html`, `patches`) z definicjami `responseSchema` w `orchestrator.js`.
   - Odchudzono pole `a1` w `agent5Data` i `agent6Data` (wyłącznie `country_of_origin` i `logistics`) oraz usunięto surowe `a2` z `agent6Data`.
   - Naprawiono regex sekcji w `prompt-compiler.js`, wykluczając `## MAPA DYSTRYBUCJI PREFIKSÓW` z kompilatów.

2. **Odblokowanie pełnego potencjału marketingowego (A4, A6, A7):**
   - Wzbogacono `agent7Data` w `orchestrator.js` o `product_category`, `net_capacity`, `dozowanie`, `preserved_minor_flaws`, `customer_delights` oraz `real_life_use_cases`.
   - Wprowadzono rygor **Mobile-First Eye-Tracking (Ścieżka Pogrubień FAB)** w A6 i A7, adresowanie mikro-tarć koszykowych (`Silent Cart Killers` z SOT 09 §2) w A5/A6 oraz zakaz duplikacji treści między `⚙️` (drabina *Składnik → Mechanizm → Odczuwalna korzyść użytkowa*) a `⚡` (wyłącznie synergie międzygrupowe, max 3) w A4/A6/A10.

3. **Uszczelnienie tarcz CLP i czystości HTML Allegro:**
   - Uodporniono wszystkie wyrażenia regularne w `sanitizeSection3Html`, `sanitizeSection6Html`, `validate_section6_compliance` oraz `validate_section3_ingredients_closed_world` na oba warianty znaczników `<(?:b|strong)>`.
   - Dodano deterministyczną korektę i walidację przywracającą urzędowy dwukropek (`:`) po nagłówkach okolicznościowych procedur ratunkowych CLP (`W PRZYPADKU POŁKNIĘCIA:`, `W PRZYPADKU DOSTANIA SIĘ DO OCZU:`, `W PRZYPADKU KONTAKTU ZE SKÓRĄ:`, `W przypadku utrzymywania się działania drażniącego na oczy:`).
   - Zastąpiono separator `\n<br>\n` w `description_extra4` czystym separatorem `\n\n`.

## 3. Konsekwencje i Weryfikacja
- **Redukcja kosztów tokenów:** Wyeliminowanie konfliktu między instrukcjami promptów a `responseSchema` oraz odchudzenie payloadów JSON obniża zużycie tokenów (szczególnie `thoughtsTokenCount` w węzłach A5, A7 i A10 Pro).
- **Wzrost konwersji:** Agent 7 operuje na rzeczywistych danych o pojemności, dozowaniu, drobnych wadach i zachwytach klientów, a Sekcja 3 jest wolna od powtórzeń `⚙️` vs `⚡`.
- **100% Zgodność:** Wszystkie 238 testów jednostkowych w `src/modules/offer-optimizer-v2/tests/*.test.js` przechodzi w 100% na zielono.

