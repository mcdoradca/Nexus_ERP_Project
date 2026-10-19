# ADR-0151: Współbieżna Orkiestracja Generowania Zdjęć AI dla Slotów 2, 3, 5, 6 z Dwukierunkową Izolacją Awarii

## Data
2026-10-19

## Status
Zaakceptowany i Wdrożony

## Kontekst
W module Offer Optimizer (`UnifiedProductPipelineView.jsx`) generowanie scenerii lifestylowych (Photoroom AI) dla slotów wizualnych odbywało się dotychczas manualnie lub sekwencyjnie. Użytkownik wymagał:
1. Uruchamiania generowania scenerii dla Slotów 2, 3, 5 i 6 (indeksy 1, 2, 4, 5) równolegle z potokiem EAN Pipeline za pomocą jednego wspólnego przycisku *"Zapisz PIM i Uruchom Agenta"*.
2. Rygorystycznej, dwukierunkowej izolacji awarii:
   - Awaria generowania grafik (np. wyczerpanie limitu Photoroom API, timeout sieciowy, błąd serwera obrazów) nie może zatrzymać ani opóźnić potoku tekstowego EAN Pipeline.
   - Awaria potoku EAN Pipeline (np. błąd agenta, zatrzymanie w trybie HITL, brak danych OSINT) nie może przerwać trwającego w tle generowania i pobierania obrazów AI.
3. Równoczesnego generowania dla wskazanych slotów (współbieżność).
4. Pełnego zachowania wszystkich funkcji edycyjnych każdego slotu: podgląd (RAW i powiększenie modalne), usunięcie, ręczna podmiana/upload pliku (Dropzone z kompresją Canvas < 1.9 MB), zapis do bazy/drafts oraz możliwość ponownej, indywidualnej regeneracji wybranego slotu na żądanie.

## Decyzje Architektoniczne
1. **Unifikacja usługi generowania zdjęć (DRY):**
   - Utworzono moduł `frontend/src/views/OfferOptimizer/services/lifestyleImageService.js` z funkcją `requestLifestyleGeneration`.
   - Obsługuje ona inicjalizację zadania `POST /api/offer-optimizer/generate-lifestyle`, asynchroniczny odbiór `jobId` oraz 180-sekundowy polling ze strategią *Defensive AI* (tolerancja na chwilowe błędy sieciowe bez natychmiastowego zerwania).
2. **Współbieżna orkiestracja w UI (`UnifiedProductPipelineView.jsx`):**
   - Wprowadzono funkcję `triggerParallelSlotGenerations([1, 2, 4, 5], ean, primaryImageObj)` wywoływaną w procedurze `handleTriggerPipeline`.
   - Wywołanie potoku obrazów jest uruchamiane jako odrębna obietnica w tle bez blokowania `await` na główny potok EAN Pipeline.
   - Zastosowano `Promise.allSettled`, co gwarantuje, że błąd w jednym slocie (np. Slot 3) nie wpływa na pozostałe sloty (Slot 2, 5, 6).
   - Przed wywołaniem żądań tablica `visionTickets` jest normalizowana do co najmniej 6 ciągłych elementów, co zapobiega powstawaniu *sparse array* w stanie Reacta.
3. **Funkcyjna atomowość stanu i ochrona przed Race Conditions:**
   - Aktualizacje `visionTickets` odbywają się wyłącznie poprzez domknięcia funkcyjne `setVisionTickets(prev => ...)`.
   - W odbiorniku socketowym `PIPELINE_COMPLETE` wyeliminowano ryzyko nadpisania wygenerowanych obrazów pustą tablicą – zaimplementowano *deep merge* chroniący pole `replacedUrl`.
4. **Precyzyjne trasowanie logów procesów w tle:**
   - W kontrolerze backendowym `offer-optimizer.controller.js` socketowy event `LIFESTYLE_LOG` został wzbogacony o `imageIndex` oraz `agentId: Agent 11 (Slot ${imageIndex + 1})`.
   - W `PhotographicAuditorCard.jsx` logi są filtrowane per-slot, dzięki czemu karty nie mieszają komunikatów z równoległych zadań Photoroom.

## Konsekwencje
- Sloty 2, 3, 5 i 6 generują się w 100% współbieżnie z potokiem EAN Pipeline.
- Zapewniono pełną fault tolerance – awarie po stronie wizualnej nie degradują potoku EAN i odwrotnie.
- Interfejs użytkownika w kartach audytora natychmiast prezentuje stan ładowania dla wszystkich 4 slotów jednocześnie, umożliwiając dalszą manualną edycję po ich ukończeniu.
