# ADR-0153: Reaktywność Frontendu dla Multi-Slot Lifestyle AI oraz Tarcza Anty-Cache Nginx

## Status
Zaakceptowany (Accepted) - Wdrożony na produkcji

## Kontekst i Problem Biznesowy
Użytkownik zgłosił brak widoczności oraz brak reaktywności procesu automatycznego generowania zdjęć scenerii AI (lifestyle) po kliknięciu przycisku *"Zapisz PIM i Uruchom Agenta"*. Analiza kodu i zachowania aplikacji ujawniła 4 fundamentalne problemy architektoniczne:
1. **Brak slotów w DOM Reacta:** W przypadku tworzenia nowej kartoteki lub posiadania tylko 1 packshotu, tablica `visionTickets` miała długość 1. Renderowanie `visionTickets.map(...)` pomijało brakujące indeksy, przez co sloty 2, 3, 5, 6 w ogóle nie montowały się w drzewie komponentów. Użytkownik nie widział żadnych indykatorów generowania scenerii.
2. **Race condition między EAN Pipeline a procesem generowania zdjęć:** Potok tekstowy EAN Pipeline kończył się w 15-20s, wysyłając zdarzenie `PIPELINE_COMPLETE`. Handler WebSocketu nadpisywał `visionTickets` przychodzącymi biletami z bazy danych, obcinając tablicę i niszcząc stan generowanych slotów AI.
3. **Desynchronizacja EAN (`liveEan` vs `newProductForm.ean`):** Stan `liveEan` był ustawiany jedynie przy edycji istniejącego produktu. Przy ręcznym wpisaniu EAN lub użyciu "Interpoluj EAN" `liveEan` pozostawał pusty, co skutkowało odrzucaniem logów WebSocket przez filtr `data.ean !== liveEan` oraz brakiem przekazywania EAN do kart zdjęć.
4. **Cache przeglądarki dla SPA:** Nginx serwował `index.html` bez nagłówków `Cache-Control: no-cache, no-store`, przez co przeglądarka operatora potrafiła trzymać stary bundle JavaScriptu pomimo wdrożenia nowych wersji.

## Podjęte Decyzje Architektoniczne

### 1. Domyślna 6-slotowa struktura w `UnifiedProductPipelineView`
- Zainicjalizowano stan `visionTickets` jako 6 standardowych slotów e-commerce (Slot 1: Packshot główny, Slot 2-6: Scenerie AI, infografiki i zbliżenia).
- Wszystkie procesy ładujące dane (`fallbackTickets`, `draftTickets`, `handleAutofillEAN`) gwarantują minimalny padding do 6 slotów.
- Dzięki temu operator od razu widzi pełną siatkę slotów z przyciskami generowania oraz natychmiastowym feedbackiem wizualnym.

### 2. Bezstratny Deep-Merge w zdarzeniu `PIPELINE_COMPLETE`
- Wprowadzono algorytm scalania w nasłuchiwaczu WebSocket:
  - Sloty posiadające `replacedUrl` (wygenerowane lub wgrane zdjęcia) są bezwzględnie chronione.
  - Sloty znajdujące się w trakcie generowania (`generatingSlots[i] === true`) zachowują swój aktywny stan ładowania.
  - Tablica `visionTickets` nigdy nie jest obcinana do mniejszego rozmiaru przychodzącego z zewnętrznych integracji.

### 3. Jednolite źródło prawdy dla EAN (`effectiveEan`)
- Zdefiniowano `const effectiveEan = (newProductForm?.ean ? String(newProductForm.ean).trim() : '') || (liveEan ? String(liveEan).trim() : '');`.
- Wykorzystano `effectiveEan` w:
  - Filtrze zdarzeń WebSocket (`if (data.ean && effectiveEan && ...)`),
  - Właściwościach `PhotographicAuditorCard` (`ean={effectiveEan}`),
  - Funkcjach regeneracji tytułu, zapisu draftu oraz eksportu do BaseLinkera.
- Powiązano pole wejściowe EAN oraz `handleAutofillEAN` z natychmiastową synchronizacją `setLiveEan`.

### 4. Dwukierunkowa synchronizacja Slotu 1 z PIM
- Wgranie zdjęcia do Slotu 1 w `PhotographicAuditorCard` (`onImageReplace`) natychmiast aktualizuje `newProductForm.imageUrl`.
- Przed wywołaniem `handleCreateProduct()` w `handleTriggerPipeline` następuje weryfikacja i synchronizacja `primaryImgCandidate`.

### 5. Wyrazisty UI Feedback i Tarcza Anty-Cache
- Wdrożono prominentny indykator generowania scenerii:
  - Pasek statusu pod nagłówkiem informujący o trwającym generowaniu wieloslotowym (`Sloty: #2, #3, #5, #6`).
  - Animowana nakładka z obracającym się spinnerem na zdjęciu w `PhotographicAuditorCard`.
  - Pulsujący status indygo w nagłówku karty: *"Generowanie AI w toku..."*.
- W konfiguracji serwera WWW (`nginx-https.tpl` i `nginx.conf`) dodano nagłówki:
  - `add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";` dla routingu SPA `index.html`.
  - `expires 1y; add_header Cache-Control "public, max-age=31536000, immutable";` dla zasobów `/assets/`.

## Konsekwencje i Walidacja
- **Brak regresji:** Wszystkie 197 testów jednostkowych potoku Offer Optimizer v2 przechodzą pomyślnie (`node --test`).
- **Pewność wdrożenia:** `npm --prefix frontend run build` kompiluje produkcyjny bundle bez błędów.
- **Odporność na błędy:** Awaria generowania scenerii AI w tle nie zatrzymuje potoku EAN Pipeline, a zakończenie potoku tekstowego nie przerywa ani nie niszczy generowanych zdjęć.
