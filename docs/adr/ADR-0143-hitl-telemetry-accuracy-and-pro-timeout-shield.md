# ADR-0143: Eliminacja błędu HITL A1/A10, adaptacyjny timeout Pro i bezkosztowy HITL Override

## Kontekst
W module `offer-optimizer-v2` podczas końcowej fazy potoku (praca Agenta 10 - Master Compliance Sentinel) dochodziło do zawieszenia procesu i pojawienia się blokującego modalu HITL z komunikatem:
`Węzeł A1 zgłosił brak krytycznych danych/błąd walidacji: [DEFENSIVE AI TIMEOUT] Przekroczono limit czasu (90s) dla wywołania Agent_10_Standard.`

Kliknięcie przycisku „Zatwierdź brak i kontynuuj” skutkowało natychmiastowym powrotem alertu, ponownym uruchamianiem całego potoku od początku i przepalaniem tokenów na wcześniejsze węzły (A1..A7).

### Diagnoza przyczyn źródłowych
1. **Fałszywe raportowanie węzła A1 w oknie HITL:**
   Funkcja wyszukująca zatrzymany węzeł w `offer-optimizer.controller.js` wykonywała `.find()` po kluczach `node_status`. Jeżeli Agent 1 zakończył pracę z nieszkodliwym statusem `ERROR_IGNORED` (np. brak opcjonalnego pola w PIM), `.find()` zatrzymywał się na `A1`, ignorując faktyczną awarię Agenta 10 na końcu potoku.
2. **Pętla patowa przy HITL Override:**
   Frontend otrzymując `node: 'A1'` wysyłał nadpisanie `hitlOverrides: ['A1']`. Orkiestrator nie posiadał ominięcia wywołania AI w Kroku 10 po nadpisaniu oraz w bloku `catch` ustawiał surowy status `ERROR` zamiast `HALTED_HITL_REQUIRED`.
3. **Zbyt niski timeout defensywny dla Gemini 3.1 Pro:**
   Agent 10 operuje na modelu `gemini-3.1-pro-preview` z `thinkingLevel: ThinkingLevel.HIGH`. Generowanie chain-of-thought dla pełnego opisu Allegro przekraczało sztywno zakodowany limit 90s w `ai.wrapper.js`.
4. **Brak telemetrii wejścia w Kroku 10:**
   Orkiestrator nie ustawiał `node_status['A10'] = 'RUNNING'` i nie emitował stanu przed uruchomieniem wnioskowania LLM.

## Podjęte decyzje

1. **Precyzyjne wyznaczanie węzła w kontrolerze:**
   Zaimplementowano wyszukiwanie od tyłu (`.reverse()`) w `offer-optimizer.controller.js` z priorytetyzacją blokujących statusów (`HALTED_HITL_REQUIRED`, `CRITICAL_MISSING_INCI`, `CRITICAL_INPUT_ERROR`, `ERROR`) oraz jawnym wykluczeniem statusów nieszkodliwych (`OK`, `SKIPPED`, `ERROR_IGNORED`, `HITL_OVERRIDDEN`, `COMPLETED`).
2. **Adaptacyjny defensywny timeout w `ai.wrapper.js`:**
   Dla modeli klasy `pro` lub zapytań z `ThinkingLevel.HIGH` (Agent 1, Agent 10) limit czasu został zwiększony z 90s do 180s (3 minuty).
3. **Obsługa `HITL_OVERRIDDEN` w Kroku 10 i `resolveHitl`:**
   - Na starcie Kroku 10 wprowadzono sprawdzenie `if (this.state.node_status['A10'] === 'HITL_OVERRIDDEN')` – przyjęcie sekcji z Agenta 7, przejście do `FINISH` i brak dodatkowego wywołania LLM (0 zużytych tokenów).
   - W bloku `catch` ustawiany jest status `HALTED_HITL_REQUIRED`.
   - W metodzie `resolveHitl` oraz na starcie bloku `FINISH` dodano twardy fallback `if (!this.state.a10_result) this.state.a10_result = { ...(this.state.a7_result || {}) };` eliminujący błędy `TypeError`.
4. **Telemetria Kroku 10:**
   Wprowadzono natychmiastowe ustawienie `node_status['A10'] = 'RUNNING'` oraz wywołanie `emitState()` przed przystąpieniem do analizy.

## Skutki architektoniczne
- Eliminacja pętli patowych w potoku EAN.
- Całkowita ochrona tokenów przed zbędnym re-runem wcześniejszych węzłów.
- Prawidłowe raportowanie winnego agenta w modalu HITL.
- Zapewnienie stabilnego czasu na generowanie chain-of-thought przez Gemini 3.1 Pro.
