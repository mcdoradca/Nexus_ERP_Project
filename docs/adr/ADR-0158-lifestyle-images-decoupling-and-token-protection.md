# ADR-0158: Dekoupling Generowania Zdjęć AI od Potoku Opisu i Smart Idempotency Ochrony Tokenów

## Data
2026-10-20

## Status
Zaakceptowany i Wdrożony

## Kontekst
W module Offer Optimizer (`UnifiedProductPipelineView.jsx`) generowanie scenerii lifestylowych (Photoroom AI) dla slotów 2, 3, 5 i 6 było sprzężone z procedurą `handleTriggerPipeline`.
Podczas pracy operatora z produktem dochodziło do sytuacji, w których zdjęcia zostały już pomyślnie wygenerowane, ale konieczne było powtórzenie lub poprawienie potoku generowania opisów, tytułów i cech PIM (np. korekta składu INCI, weryfikacja podmiotu odpowiedzialnego, dostosowanie parametrów Allegro).
W dotychczasowej implementacji:
1. Kliknięcie *"Zapisz PIM i Uruchom Agenta"* bezwarunkowo uruchamiało `triggerParallelSlotGenerations([1, 2, 4, 5], ...)`.
2. Funkcja `triggerParallelSlotGenerations` nie weryfikowała obecności istniejących zdjęć w biletach (`visionTickets`), wysyłając 4 żądania do zewnętrznego API Photoroom, niszcząc wygenerowane wcześniej zdjęcia i zużywając tokeny API oraz generując koszty (`aiImageCost`).
3. Wznowienie potoku ze stanu wstrzymania HITL (`handleTriggerPipeline(newOverrides)`) powodowało ponowne wysłanie żądań do API Photoroom.
4. Brakowało możliwości uruchomienia samego potoku tekstu/parametrów bez dotykania zdjęć, jak również selektywnego wygenerowania scenerii wyłącznie dla brakujących slotów.
5. W kontrolerze backendowym (`triggerUltimatePipeline`) oznaczenie produktu jako `PROCESSING` powodowało nadpisanie pola `offerDraft` obiektem bez biletów `visionTickets`.

## Decyzje Architektoniczne
1. **Smart Idempotency w `triggerParallelSlotGenerations`:**
   - Zaimplementowano predykat `isSlotFilled(ticket)`, który weryfikuje czy dany slot posiada już wygenerowany obraz (`ticket.replacedUrl`) lub poprawne zdjęcie wgrane przez użytkownika (`ticket.originalUrl` z poprawnym protokołem, z wykluczeniem placeholderów i alertów).
   - Przed dispatchowaniem zadań następuje odfiltrowanie obsadzonych slotów oraz slotów będących w trakcie generowania (`generatingSlots[idx]`).
   - Jeśli wszystkie sloty w tablicy docelowej posiadają już zdjęcia, wywołanie jest natychmiast anulowane z logiem w konsoli (`Pomijanie zapytań do API Photoroom (ochrona tokenów)`), nie zużywając tokenów ani nie zmieniając stanów.
   - Jeśli brakuje tylko części slotów (np. Slot 3 i 6 są puste, a 2 i 5 obsadzone), zapytania wysyłane są **wyłącznie dla brakujących slotów**.

2. **Dekoupling i Granularne Sterowanie w UI (`UnifiedProductPipelineView.jsx`):**
   - Dodano stan `autoGenerateLifestyle` (domyślnie `true`) sterowany checkboxem w nagłówku PIM: *"Auto-scenerie AI"*.
   - Dodano dedykowany przycisk *"Tylko Opis (0 tokenów foto)"* (`skipImages: true`), który uruchamia wyłącznie potok agentów tekstowych i parametrów bez jakichkolwiek zapytań graficznych.
   - W sekcji *Audyt Multimodalny (Vision AI)* dodano bezpośrednie akcje:
     - *"✨ Uzupełnij brakujące scenerie"* – generuje wyłącznie brakujące sloty z `[1, 2, 4, 5]`.
     - *"🔄 Wymuś regenerację (4x)"* – jawne wymuszenie regeneracji wszystkich 4 slotów z modalnym potwierdzeniem operatora (`forceRegenerate: true`).

3. **Blokada Re-triggeru w Trybie HITL:**
   - W procedurze wznawiania potoku z poziomu alertów decyzyjnych HITL przekazywany jest parametr `handleTriggerPipeline(newOverrides, false, { skipImages: true })`, co gwarantuje 100% izolacji od procesu wizualnego podczas interwencji operatora.

4. **Trwałość `offerDraft.visionTickets` w Backendzie (`offer-optimizer.controller.js`):**
   - W metodzie `triggerUltimatePipeline` zaktualizowano oznaczanie statusu `PROCESSING`: dotychczasowe właściwości `offerDraft` (w tym `visionTickets`, `images`, `htmlContent`) są zachowywane poprzez spread (`{ ...existingDraft, status: 'PROCESSING', startedAt: Date.now() }`).

## Konsekwencje i Korzyści
- **Zero niepotrzebnych kosztów API:** Powtórne uruchomienie generowania opisu nie generuje ani jednego zapytania do API Photoroom dla obsadzonych slotów.
- **Ochrona wypracowanych assetów:** Poprawne, zaakceptowane przez operatora scenerie nie są nadpisywane podczas iteracji nad tekstem czy parametrami aukcji.
- **Pełna autonomia operatora:** Operator ma natychmiastowy wybór pomiędzy pełnym potokiem, potokiem tekstowym, selektywnym uzupełnieniem braków a wymuszeniem regeneracji całości.
- **Stabilność testów:** 10 testów architektury wieloslotowej w `lifestyle.multi_slot.test.js` potwierdza poprawność logiki izolacji i idempotencji.
