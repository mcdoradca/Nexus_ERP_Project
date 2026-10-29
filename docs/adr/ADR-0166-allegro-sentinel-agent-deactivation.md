# ADR-0166: Dezaktywacja agenta Agent_Ads_Sentinel (Allegro Deep Research)

## Status
ZAAKCEPTOWANY / WDROŻONY (2026-10-29)

## Kontekst
Agent `Agent_Ads_Sentinel` (Kryptonim: **Sentinel**), zaimplementowany w `src/modules/allegro-ads/allegro.sentinel.service.js`, wykonywał cyklicznie (CRON `0 4 * * *`) oraz na żądanie (`POST /api/allegro-sentinel/trigger`) głęboki research zmian regulaminowych, opłat Allegro Smart! oraz minimalnych stawek CPC/CPM w Allegro Ads przy użyciu modelu `gemini-3.8-flash` z włączonym narzędziem `googleSearch` (Google Search Grounding), publikując raporty w `UniversalChat` (`GlobalMessage`).

Decyzją biznesową właściciela systemu dalsza praca tego agenta nie jest już wymagana, w związku z czym zlecono jego trwałe wyłączenie w celu wyeliminowania zbędnych zapytań do API Gemini oraz wyciszenia automatycznych alertów w czacie globalnym.

## Podjęte Decyzje i Zmiany Architektoniczne

1. **Blokada w źródle prawdy (`src/modules/allegro-ads/allegro.sentinel.service.js`):**
   - Wprowadzono flagę sterującą `const SENTINEL_ENABLED = false;` (wyeksponowaną również w `module.exports`).
   - W funkcji `runSentinelAudit()` dodano strażnika (`if (!SENTINEL_ENABLED)`), który natychmiast przerywa wykonanie przed wywołaniem `generateWithRetry` / `gemini-3.8-flash` i zwraca bezpieczny ciąg `"BRAK KRYTYCZNYCH ZMIAN"`.
   - W funkcji `initSentinel()` zablokowano rejestrację zadania `cron.schedule('0 4 * * *', ...)`.
   - Zgodnie z polityką audytową Time-Decay zachowano wszystkie dotychczasowe instrukcje `console.log` oraz `console.error`.

2. **Zabezpieczenie wyzwalaczy w `src/server.js`:**
   - W endpoincie `POST /api/allegro-sentinel/trigger` wyłączono wywołanie `allegroSentinelService.runSentinelAudit()` w tle, zwracając kontrolowany status HTTP `200` z flagą `disabled: true` oraz informacją o wyłączeniu agenta.
   - Przy starcie serwera wywołanie `allegroSentinelService.initSentinel()` obwarowano warunkiem `if (allegroSentinelService.SENTINEL_ENABLED)`.

3. **Aktualizacja rejestru agentów i pamięci architektonicznej:**
   - Oznaczono `Agent_Ads_Sentinel` jako `[WYŁĄCZONY 2026-10-29]` w `.agents/ai_agents_registry.md` oraz zaktualizowano `.agents/.ai-memory.md`.

