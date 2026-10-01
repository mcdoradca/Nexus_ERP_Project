# ADR-0127: Eliminacja zawieszania potoku EAN Pipeline, synchronizacja telemetrii WebSocket oraz tarcze timeoutu AI i sanacja stanu wznowienia

## Status
Zaakceptowany i wdrożony (Accepted & Implemented)

## Kontekst
Użytkownik zgłosił problem zawieszania się potoku EAN Pipeline (V2). Średnio co drugie uruchomienie potok pozornie lub faktycznie zawieszał się na kroku 1 (Agent 1) lub podczas przejścia z kroku 1 do kroku 2 (A1 -> A2), wymagając odświeżenia strony (F5). Po drugim kliknięciu potok działał płynnie.

### Analiza przyczyn źródłowych (Root Causes)
1. **Brak emisji zdarzeń stanu (`this.emitState()`) przy sukcesie węzłów w Orchestratorze:**
   Metoda `this.emitState()` w `orchestrator.js` była wywoływana wyłącznie w blokach błędów lub krytycznego zatrzymania (`HALT`). Przy normalnym przebiegu węzłów (`PRE ➔ EXTRACT ➔ A1 ➔ A2 ➔ A4 ➔ A5 ➔ A6 ➔ A7 ➔ A10`), zdarzenie `PIPELINE_STATUS` nie było emitowane ani razu. Przez 45-90 sekund pracy Agenta 1 i 2 frontend nie otrzymywał żadnego sygnału o zmianie statusu węzłów na `RUNNING` czy `OK`, przez co interfejs sprawiał wrażenie zawieszonego w stanie `THINKING`.
2. **Cichy zgon potoku (Silent Failure) w kontrolerze:**
   W pętli asynchronicznej `offer-optimizer.controller.js` blok `catch (err)` zapisywał błąd do bazy Prisma, ale nigdy nie wysyłał socketu `PIPELINE_ERROR` do przeglądarki. W przypadku jakiegokolwiek błędu sieci, timeoutu czy problemu z pobraniem schematu kategorii, frontend wisiał w nieskończoność.
3. **Zablokowane wznawianie stanu (`resumeFromState`):**
   Jeśli poprzednia sesja zakończyła się zatrzymaniem (`next_action === 'HALT'`), wznawianie stanu bez jawnych `hitlOverrides` powodowało, że orkiestrator natychmiast opuszczał fazę bez wykonania węzłów A1 i A2, zatrzymując się na starym alercie.
4. **Brak defensywnego timeoutu na wywołaniach Gemini API:**
   Globalny timeout klienta `@google/genai` był ustawiony na 10 minut (`600000ms`), co przy zacięciu połączenia Google Search powodowało wielominutowe zawieszenie procesu.
5. **Blokujący modal `alert()` na frontendzie:**
   Synchroniczny `alert("Agent Supervisor rozpoczął pracę...")` blokował pętlę zdarzeń przeglądarki. Pakiety WebSocket emitowane przez backend w pierwszych sekundach były odrzucane, ponieważ `liveEan` nie zdążył zostać zaktualizowany w stanie komponentu React.
6. **Dlaczego po odświeżeniu i drugim kliku potok działał płynnie:**
   Po znalezieniu INCI w pierwszej próbie dane trafiały do PIM/formularza. Przy ponownym kliknięciu PIM posiadał już wypełniony skład INCI, dzięki czemu Agent 1 pomijał żmudne przeszukiwanie sieci i pętle retry konsensusu, a potok natychmiast przechodził do kolejnych węzłów.

## Podjęte Decyzje Architektoniczne

1. **Pełna telemetria cyklu życia węzłów w Orchestratorze (`orchestrator.js`):**
   - Wdrożono wywołania `this.emitState()` na wejściu (status `RUNNING` lub `RETRYING`) oraz na wyjściu (status `OK` lub `SKIPPED`) każdego węzła: `PRE`, `EXTRACT`, `A1`, `A2`, `A4`, `A5`, `A6`, `A7`, `A10`.
   - Każda zmiana akcji i statusu natychmiast zapisuje stan na dysku i rozgłasza zdarzenie `PIPELINE_STATUS` przez WebSocket.

2. **Defensywna tarcza timeoutu w AI Wrapper (`ai.wrapper.js`):**
   - Wdrożono funkcję `generateContentWithTimeout(params, timeoutMs, callLabel)` opartą na `Promise.race` z automatycznym czyszczeniem timera.
   - Ustalono twarde limity: 90s dla zapytań z Google Search (Krok 1 Grounding oraz Standard Path) oraz 60s dla ekstrakcji struktury JSON (Krok 2) i fallbacków.
   - W przypadku przekroczenia czasu w Kroku 1 aktywowany jest defensywny fallback bez Google Search lub kontrolowany wyjątek, zapobiegający martwym zatorom.

3. **Sanacja stanu wznowienia i eliminacja cichych zgonów (`offer-optimizer.controller.js`):**
   - W przypadku wznowienia potoku (`resumeFromState`), jeśli poprzedni stan miał `next_action === 'HALT'` i użytkownik nie przekazał jawnych `hitlOverrides`, flaga akcji jest automatycznie resetowana na `RUN_EXTRACT`, a błędy i alerty HITL są czyszczone, umożliwiając świeże i kompletne wykonanie.
   - W blokach `catch (err)` oraz przy przedwczesnym zakończeniu potoku bez `final_offer` bezwzględnie emitowany jest socket `PIPELINE_ERROR`, co natychmiast informuje frontend i zdejmuje stan ładowania.

4. **Odblokowanie UI i synchronizacja identyfikatora na frontendzie (`UnifiedProductPipelineView.jsx`):**
   - Usunięto blokujący `window.alert()` przed startem Supervisora.
   - `liveEan` oraz faza inicjalizacji są ustawiane synchronicznie PRZED wysłaniem żądania POST do serwera, co gwarantuje akceptację wszystkich przychodzących pakietów WebSocket.
   - Komponent wizualizacji statusów węzłów rozszerzono o obsługę statusów: `OK`, `COMPLETED`, `SKIPPED`, `RUNNING`, `IN_PROGRESS`, `RETRYING`, `ERROR`, `HALTED_HITL_REQUIRED` z dynamicznymi kolorami i ikonami.

## Konsekwencje
- Potok EAN Pipeline jest w 100% reaktywny – użytkownik w czasie rzeczywistym widzi postęp każdego agenta Swarm w terminalu i na liście węzłów.
- Wyeliminowano zjawisko wiszących procesów i konieczność ręcznego odświeżania strony klawiszem F5.
- Wszystkie 137 testów jednostkowych i integracyjnych przechodzi pomyślnie.
