# ADR-0141: Deterministyczna Sterylizacja Promptu Agenta 1 i Ochrona PIM INCI przed Zbędnym Wyszukiwaniem w Potoku EAN V2

## Status
**ACCEPTED & PRODUCTION-READY** (Data: 2026-10-13)

## Kontekst i Problem Biznesowo-Techniczny
Podczas procesowania produktów w potoku `offer-optimizer-v2`, dla których w kartotece produktowej („Karta Techniczna i Skład (Parametry PIM)”) pole `Skład/INCI` było już uzupełnione, dochodziło do niepożądanego zachowania:
1. Agent 1 (OSINT Researcher) mimo znajomości składu z PIM uruchamiał wielojęzyczne kwerendy Google Grounding (`ingredienti`, `inhaltsstoffe`, `ingredients`, `skład`) w poszukiwaniu składu, marnując tysiące tokenów i limity wyszukiwarki.
2. W `orchestrator.js` linie 552–555 zawierały próbę sterylizacji promptu, lecz regexy bazowały na nieistniejących frazach ze starych wersji promptu (`(będzie to tablica tablic).`) oraz niezgodnych punktorach (`- Skład INCI` zamiast `* Skład INCI`). W rezultacie podmiany tekstu po cichu zwracały niezmieniony szablon promptu.
3. W przypadku rozbieżności między znalezionymi w sieci składami a składem PIM, orkiestrator wchodził w pętlę retry `A1_INCI_CONFLICT_RETRY` (do 3 wywołań Agenta 1), co zwielokrotniało zużycie tokenów, a w przypadku znalezienia dopasowania nadpisywało zweryfikowany skład PIM wartością pobraną z internetu (`source: 'osint_a1'`).

## Zastosowane Rozwiązanie Architektoniczne
1. **Deterministyczna Sterylizacja Promptu w `orchestrator.js`:**
   - Wykrywanie obecności składu: `const hasPimInci = Boolean(extracted?.inci?.value && String(extracted.inci.value).trim().length > 0);`.
   - W przypadku `hasPimInci === true`:
     - Wyłączenie punktorów priorytetu INCI w celach wyszukiwania na rzecz dyrektywy `Skład INCI: POMIŃ (Skład INCI został już w 100% podany w PIM)`.
     - Zastąpienie sekcji wielojęzycznej matrycy kwerend nakazem skupienia się wyłącznie na pozostałych brakach (GPSR / Podmiot Odpowiedzialny, logistyka, CLP) z kategorycznym zakazem odpytywania Google Search o synonimy składników.
     - Zamiana punktu 1 na dyrektywę `ZIGNORUJ` nakazującą zwrot pustej tablicy `[]` w `extracted_inci_candidates`.
     - Przekazanie `existing_pim_inci` w dynamicznym bloku danych SKU (`agentData`).
2. **Warunkowy `revision_warning` w Pętli Ponowień:**
   - Jeśli ponowienie następuje z powodu braków GPSR lub parametrów logistycznych, a produkt ma już INCI w PIM, prompt ponowienia nie instruuje modelu do poszukiwania `ingredienti`/`inhaltsstoffe`, lecz skupia się na producencie i podmiocie odpowiedzialnym.
3. **Ochrona Stanu PIM przed Nadpisaniem i Eliminacja Pętli Retry INCI:**
   - W orkiestratorze po zakończeniu Agenta 1: jeśli `hasPimInci === true`, ewaluacja kandydatów OSINT oraz algorytm Jaccarda zostają pominięte.
   - Stan `state.extracted_data.inci` zostaje nienaruszony z PIM (`source: 'baselinker_features'` / `features`).
   - Zablokowano fałszywe zatrzymania `OSINT_CONFLICTING_INCI_MAX_RETRYS` i `OSINT_TRANSLATED_INCI_ERROR` dla produktów z wprowadzonym składem PIM.
4. **Pełna Zgodność z Golden Master dla Produktów bez Składu:**
   - Gdy `hasPimInci === false` (brak składu w PIM), szablon promptu Agenta 1 pozostaje w 100% nienaruszony (Golden Master z ADR-0139), gwarantując pełny OSINT z badaniem 10 źródeł, skanowaniem zdjęć tyłu etykiet i pełną bramką CosIng.

## Skutki i Korzyści
- **Oszczędność Tokenów i Limitów:** Całkowite wyeliminowanie zapytań Google Search Grounding dotyczących składu dla produktów z wypełnioną kartą PIM.
- **Odporność na Błędy i Przyspieszenie:** Znaczne skrócenie czasu wykonania Kroku 1 (Grounding) oraz brak niepotrzebnych pętli powtórzeń (retry).
- **Integralność Danych:** Skład zatwierdzony w PIM nie jest nadpisywany niepewnymi danymi z wyszukiwarki.
