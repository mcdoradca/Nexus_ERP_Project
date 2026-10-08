# ADR-0133: Odporność Potoku EAN Pipeline, Tarcza Ochronna Image Proxy & Watchdog Inicjalizacji UI

## Status
Zaakceptowany i Wdrożony na Produkcji (2026-10-08)

## Kontekst i Diagnoza Problemu
Podczas uruchamiania potoku EAN Pipeline w panelu `UnifiedProductPipelineView` na środowisku produkcyjnym wystąpiły następujące anomalie:
1. **Błąd XML AWS S3 `AccessDenied` oraz `net::ERR_CONNECTION_RESET`:**
   W kontrolerze `offer-optimizer.controller.js` metoda `proxyImage` w bloku `catch` wykonywała `res.redirect(url)`. Gdy URL grafiki w kartotece PIM wskazywał na chroniony lub wygasły zasób BaseLinker CDN / AWS S3, przeglądarka podążała za przekierowaniem 302 bezpośrednio do bucketa Amazon S3, który odrzucał żądanie surowym komunikatem XML `<Error><Code>AccessDenied</Code>...` i resetował połączenie TCP.
   Dodatkowo w komponentach klienckich (`PhotographicAuditorCard.jsx` oraz `ImageModal`) w zdarzeniu `onError` tag `<img>` próbował ponownego odpytania bezpośredniego adresu URL (`useDirectUrl(true)`), generując wtórne błędy CORS i S3 w konsoli przeglądarki.

2. **Kaskadowy błąd 502 (Bad Gateway) i zawieszenie potoku na etapie `INICJALIZACJA SYSTEMU / PRE`:**
   Podczas automatycznego deploymentu GitHub Actions proces PM2 został zrestartowany (`pm2 restart nexus`). Żądania sieciowe w tym ułamku sekundy otrzymały kod 502 z Nginx.
   W wyniku przerwania procesu w tle rekord w bazie PostgreSQL pozostał zablokowany z flagą `offerDraft: { status: 'PROCESSING' }`. Przy ponownym otwarciu widoku mechanizm LocalStorage przywrócił stary stan roboczy (`nexus_pipeline_draft_...`), a interfejs zawiesił się w nieskończonym oczekiwaniu na zdarzenia WebSocket z zabitego procesu, bez żadnego limitu czasu (watchdog). Dodatkowo przycisk "Przerwij" w sekcji HITL posiadał błąd logiczny, ustawiający ponownie stan `THINKING` zamiast `IDLE`.

## Podjęte Decyzje Architektoniczne

1. **Defensywna Tarcza Błędów w Image Proxy (`offer-optimizer.controller.js`):**
   - Całkowicie wyeliminowano niebezpieczne przekierowanie `res.redirect(url)` z metody `proxyImage`.
   - W przypadku niepowodzenia pobierania grafiki przez `AiService.fetchImageSecure` kontroler zwraca kontrolowaną odpowiedź HTTP 404 z ustrukturyzowanym JSON-em o wygaśnięciu linku.

2. **Sanityzacja żądań graficznych w UI (`PhotographicAuditorCard.jsx` & `ImageModal`):**
   - Usunięto stan `useDirectUrl` z komponentów renderujących zdjęcia PIM/Vision.
   - W przypadku wystąpienia zdarzenia `onError` tag `<img>` natychmiast aktywuje dedykowaną kartę fallback ("Plik wygasł lub zablokowany przez zewnętrzny serwer") bez wysyłania surowych zapytań do zewnętrznych serwerów S3/BaseLinkera.

3. **Watchdog Inicjalizacji i Przycisk Czyszczenia Szkicu (`UnifiedProductPipelineView.jsx`):**
   - **Watchdog Timeout (25s):** Dodano hook `useEffect`, który monitoruje stan `pipelineStatus === 'THINKING'` podczas fazy `INICJALIZACJA SYSTEMU`. Jeśli w ciągu 25 sekund backend lub WebSocket nie prześle kolejnej fazy, watchdog przerywa oczekiwanie, ustawia stan `ERROR` i wyświetla komunikat instruujący o możliwości natychmiastowego ponownego startu.
   - **Przycisk "Wyczyść Szkic":** Dodano do nagłówka PIM akcję umożliwiającą ręczne usunięcie zablokowanego draftu z `localStorage` (`nexus_pipeline_draft_...`) i przeładowanie czystych danych z bazy.
   - **Naprawa przycisku "Przerwij":** Przycisk w sekcji HITL ustawia właściwe stany spoczynkowe: `setPipelineStatus('IDLE')`, `setPipelinePhase('')`, `setActiveNodes([])`, `setNodeStatuses({})`.

4. **Odblokowanie rekordu w bazie danych:**
   - Zaktualizowano pole `offerDraft` dla rekordu produktu zablokowanego podczas restartu z `PROCESSING` na `{ status: 'IDLE' }`.

## Konsekwencje i Rezultaty
- Wyeliminowano surowe błędy XML AWS `AccessDenied` oraz zerwania połączeń `net::ERR_CONNECTION_RESET` w konsoli F12.
- Użytkownik posiada pełną kontrolę nad restartem procesu i czyszczeniem pamięci podręcznej w przypadku zakłóceń sieciowych lub restartów PM2.
- Wszystkie 155 testów jednostkowych i integracyjnych potoku Offer Optimizer V2 przechodzą pomyślnie (155/155 PASSED).
- Build produkcyjny frontendu (Vite) kompiluje się bez żadnych błędów.
