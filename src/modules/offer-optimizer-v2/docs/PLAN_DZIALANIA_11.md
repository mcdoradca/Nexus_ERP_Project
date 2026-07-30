# PLAN DZIAŁANIA — ZADANIE 11 (E4a)

1. **Inicjalizacja maszyny stanowej**: Utworzę plik `orchestrator.js` implementujący obiekt stanu ze wszystkimi wymaganymi polami (`pipeline_id`, `current_phase`, `node_status`, `hitl_alert`, itp.) oraz zainicjuję maszynę w fazie `PHASE_1_GROUNDING`. 
2. **Pre-walidacja węzła startowego**: Zaimplementuję mechanizm pre-walidacyjny blokujący wywołanie potoku (status `CRITICAL_INPUT_ERROR`), oparty na istniejącym sprawdzaniu sumy kontrolnej EAN (`ean_checksum`) oraz ustaleniu ścieżki chemicznej (`route_chemical`).
3. **Implementacja Węzła A1 (Agent 1)**: Skonfiguruję deterministyczną kompilację promptu A1 (łączącą definicje A1, poprawkę z PATCH v4.1 oraz §I z SHARED_RULES). Zrealizuję bezwzględne wywołanie `ai.metrics.service` (bez cache, `thinkingLevel: 'minimal'`), pobranie surowego JSON-a, rejestrację telemetrii oraz twarde przerwanie maszyny (`HALTED_HITL_REQUIRED`), jeśli model zgłosi brak danych krytycznych.
