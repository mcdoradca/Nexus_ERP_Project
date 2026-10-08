# ADR-0136: Przywrócenie Modułu SDS do Stanu Wyjściowego (Commit 69bd377)

## Data
2026-10-08

## Status
Zaakceptowany i Wdrożony (Status: PRODUKCJA / 100% STABILNY)

## Kontekst i Przyczyna
Po próbach modyfikacji parametrów samplera i poziomów wnioskowania (`thinkingLevel: "HIGH"`) w dniu 08.10.2026, potok SDS uległ destabilizacji: model `gemini-3.8-flash` zwracał pustą odpowiedź przy bezpośrednim odpytywaniu plików DOCX/PDF, co zrzucało wykonanie do klasycznego parsera i skutkowało wyciekiem surowego tekstu włoskiego w sekcjach deterministycznych.

## Decyzja Architektoniczna
Zgodnie z decyzją użytkownika dokonano pełnego przywrócenia (rollbacku) wszystkich 10 plików modułu SDS (`src/modules/sds/`) do sprawdzonego, w pełni stabilnego stanu produkcyjnego z początku dnia: commita **`69bd377`** (z zachowaniem sprawdzonych wywołań `temperature: 0.0` oraz łańcucha fallbacków `gemini-3.8-flash` -> `gemini-3.1-pro-preview`).

Przywrócone pliki modułu SDS:
- `src/modules/sds/sds.vision.agent.js`
- `src/modules/sds/sds.agent.js`
- `src/modules/sds/sds.verifier.agent.js`
- `src/modules/sds/sds.investigator.agent.js`
- `src/modules/sds/engine/agents/administrative.auditor.js`
- `src/modules/sds/engine/agents/hazard.classification.auditor.js`
- `src/modules/sds/engine/agents/health.environment.auditor.js`
- `src/modules/sds/engine/agents/narrative.translator.agent.js`
- `src/modules/sds/engine/agents/semantic.arbiter.agent.js`
- `src/modules/sds/engine/agents/workplace.safety.auditor.js`

## Weryfikacja Jakościowa
1. **Pomyślny test na realnym dokumencie DOCX:**
   Zweryfikowano działanie `SDSVisionAgent` na pliku `docs/SDS/8051944811087_SDS_NAJMA_1to1_Konwertowany.docx`:
   - Automatyczny, płynny fallback na `gemini-3.1-pro-preview`.
   - Poprawne, czyste wygenerowanie Sekcji 1.1, 4.1, 8.1, 9.1 w 100% w języku polskim bez obcojęzycznych wycieków.
2. **Bateria testów zgodności:**
   - `tests/sds.compliance.test.js`: 7/7 PASSED (100%).
   - `tests/sds.schema.validator.test.js`: 7/7 PASSED (100%).
   - Składnia plików JS: 0 błędów (`node -c`).
