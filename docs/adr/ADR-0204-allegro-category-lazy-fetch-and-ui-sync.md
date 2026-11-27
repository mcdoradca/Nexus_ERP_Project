# ADR-0204: Automatyczne Lazy-Fetch Schematu Kategorii Allegro (`/api/categories/:id`), Odporne Ładowanie UI oraz Auto-Uzupełnianie Kategorii z Aukcji

- **Status:** Wdrożono i zweryfikowano testami (`383/383 PASS`, ESLint `0` nowych błędów, `vite build` PASS `7.82s`)
- **Data:** 2026-11-27
- **Powiązania:** ADR-0197, ADR-0203

## 1. Kontekst i analiza problemu
W widoku `UnifiedProductPipelineView` (karta produktu / *EAN Pipeline*) po wpisaniu kategorii Allegro `260130` (*Odplamiacze*) nie budowało się drzewo parametrów kategorii (*Katalog Parametrów Allegro (0)*), a konsola przeglądarki zwracała błąd:
- `GET /api/categories/260130 -> 404 (Not Found)`.

Audyt wykazał następujące przyczyny:
1. **Brak lazy-fetch w `GET /api/categories/:id` (`src/server.js`):**
   - W tabeli `MarketplaceCategory` zapisane były tylko `63` wcześniej użyte kategorie (bez `260130`).
   - Endpoint `GET /api/categories/:id` czytał wyłącznie lokalny cache (`prisma.marketplaceCategory.findUnique`) bez `resolveWorkspaceContext` i zwracał od razu `404 Kategoria nie została zbuforowana`, mimo że w `allegro.service.js` istnieje już metoda `getCategoryParametersFull(categoryId, { forceRefresh, workspaceId, accountId })` potrafiąca dociągnąć schemat i nazwę kategorii z Allegro API.
   - Dodatkowo `fetchCategoryParameters` w `allegro.service.js` tworzyła zbędną lokalną instancję `new PrismaClient()` przy zapisie kategorii zamiast używać współdzielonego klienta modułowego `prisma`.
2. **Brak debounce'a, walidacji i komunikatów błędu w UI (`UnifiedProductPipelineView.jsx`):**
   - `useEffect` uderzał w `/api/categories/${allegroCategoryId}` na każdą pojedynczą wpisywaną cyfrę bez walidacji i bez obsługi wyścigów (`cancelled`), a błędy były po cichu tłumione (`setCategorySchema(null)`).
   - Po wyszukaniu/wybraniu aukcji Allegro (`handleSearchAllegroOffers`), mimo że backend zwraca `categoryId` oferty, puste pole `allegroCategoryId` nie było automatycznie uzupełniane z wybranej aukcji.
3. **Błąd z konsoli przeglądarki (`A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received`):**
   - Pochodzi z zainstalowanej w przeglądarce wtyczki Chrome (zewnętrzne rozszerzenie widoczne na zrzucie ekranu), nie z kodu aplikacji Nexus ERP.

## 2. Decyzja architektoniczna

1. **Lazy-fetch w `GET /api/categories/:id` i bezpieczny fallback w `getCategoryParametersFull` (`src/server.js`, `src/modules/offer-optimizer/allegro.service.js`):**
   - Dodano `resolveWorkspaceContext` do `GET /api/categories/:id`, walidację cyfrową `/^\d+$/` (`400` przy błędnym formacie) oraz wywołanie `allegroService.getCategoryParametersFull(cleanId, { forceRefresh, workspaceId: req.workspaceId, accountId })` z obsługą `?refresh=true`.
   - Rozróżniono statusy odpowiedzi: `404` zwracane wyłącznie wtedy, gdy kategoria nie istnieje w samym Allegro API; błędy autoryzacji OAuth2 (`401`/`403`) lub komunikacji z Allegro raportowane są jako `502` z czytelnym komunikatem.
   - W `getCategoryParametersFull` dodano opcjonalne wstrzykiwanie zależności testowych (`injectedPrisma`, `injectedApiClient`, `injectedGetToken`) oraz bezpieczny fallback: gdy `?refresh=true` zawiedzie przez chwilowy błąd Allegro API, a w DB istnieje już ważny cache parametrów, metoda zwraca schemat z cache (`staleFallback: true`) zamiast czyścić drzewo formularza.
   - Usunięto tworzenie zbędnego `new PrismaClient()` w `fetchCategoryParameters`.

2. **Odporne ładowanie schematu, odświeżanie i synchronizacja z ofertą w UI (`frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`):**
   - Dodano stany `isLoadingCategorySchema`, `categorySchemaError`, `categorySchemaRefreshRev` i `forceCategoryRefreshRef`.
   - `useEffect` ładujący `/api/categories/:id` zyskał walidację `/^\d+$/`, `debounce 350 ms` (omijany przy ręcznym odświeżeniu `?refresh=true`) oraz flagę `cancelled` chroniącą przed race condition.
   - W sekcji **ID Kategorii Allegro** dodano przycisk **`Pobierz schemat`** / **`Odśwież schemat`** oraz status załadowanej nazwy i liczby parametrów; w nagłówku i ciele **Katalogu Parametrów Allegro** dodano wskaźnik ładowania oraz alert błędu z przyciskiem **`Ponów pobranie`**.
   - W `handleSearchAllegroOffers` oraz przy wyborze aukcji z listy kandydatów puste pole `allegroCategoryId` jest automatycznie uzupełniane wartością `categoryId` wybranej oferty Allegro.

## 3. Weryfikacja
- `node --check src/server.js` oraz `node --check src/modules/offer-optimizer/allegro.service.js` — **PASS (`exit 0`)**.
- `node --test src/modules/offer-optimizer-v2/tests/*.test.js` — **`383/383 PASS`** (`fail: 0`, `cancelled: 0`, `skipped: 0`), w tym nowa suita [allegro.category.lazy.fetch.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/allegro.category.lazy.fetch.test.js).
- ESLint (`frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`) — **`0` nowych błędów** (`17` wcześniejszych na nietkniętych liniach `68..2206`).
- `npm --prefix frontend run build` (`vite build`) — **PASS** (`7.82s`).
