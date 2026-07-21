# ADR-017: Stabilizacja produkcyjna po migracji GCP → OVH VPS

## Kontekst
Po migracji systemu Nexus ERP z Google Cloud Platform (GCP) na serwer VPS OVH (`n-e-s.it`) wystąpiły awarie większości modułów, ze szczególnym uwzględnieniem EAN Pipeline oraz procesów wykonywanych w tle. Przeprowadzony audyt wykazał błędy uniemożliwiające stabilną pracę serwera backendowego:
1. Brakujący import modułu `sentinelService` w `src/server.js`, powodujący błędy `ReferenceError` podczas inicjalizacji harmonogramów CRON.
2. Pozostałości po GCP IP (`34.59.28.145`) oraz tymczasowe obejście CORS (`callback(null, true)`), tworzące lukę bezpieczeństwa i powodujące błędy komunikacji z frontendem.
3. Duplikaty endpointów `/api/health` oraz `/api/allegro-sentinel/trigger` (wersja unauthenticated nadpisywała wersję chronioną).

## Decyzje
1. **Import i obsługa błędów Sentinel**: Zaimportowano `sentinelService` z `./modules/campaigns/sentinel.service` w `src/server.js` oraz owrapowano harmonogram CRON w klauzulę `try-catch`, co zabezpiecza proces Node.js przed wywróceniem.
2. **Restrykcje CORS**: Zaktualizowano domyślną listę `allowedOrigins` wskazując domenę produkcyjną OVH (`https://n-e-s.it`, `http://n-e-s.it`, `https://www.n-e-s.it`) oraz usunięto globalny bypass CORS.
3. **Refaktoryzacja Endpointów**: Usunięto zduplikowany handler `/api/health` (pozostawiając wersję z pełną weryfikacją Prisma ORM) oraz zduplikowany niechroniony endpoint `/api/allegro-sentinel/trigger` (pozostawiając wersję z autoryzacją `authenticateToken` i `requireSuperUser`).
4. **Wdrożenie CI/CD**: Zmerge'owano poprawki do gałęzi `dev` oraz `main`, uruchamiając automatyczny pipeline GitHub Actions (`deploy.yml`).

## Status
Zaakceptowane i wdrożone na produkcję.

## Konsekwencje
- **Wydajność i Stabilność**: Serwer po ponownym uruchomieniu przez PM2 działa stabilnie, health check (`https://n-e-s.it/api/health`) zwraca status `ok` oraz potwierdza połączenie z Supabase PostgreSQL.
- **Bezpieczeństwo**: CORS i routing API są ściśle ograniczone i zabezpieczone autoryzacją JWT.
- **Automatyzacja**: Zmiany w kodzie są synchronizowane automatycznie przez GitHub Actions.
