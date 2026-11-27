# ADR-0207: Odnawianie Przesuwne Sesji JWT (`Sliding Session`), `POST /api/auth/refresh` oraz Izolacja Zakresu Błędów `401`

- **Status:** Wdrożono i zweryfikowano testami (`390/390 PASS`, ESLint `0` nowych błędów, `vite build` PASS `8.23s`)
- **Data:** 2026-11-27
- **Powiązania:** ADR-0206

## 1. Kontekst i analiza problemu
Podczas ciągłej pracy na widoku PIM / potoku produktów użytkownik był nagle wylogowywany z systemu po zakończeniu pracy nad produktem, z serią błędów `401` na równoległych wywołaniach `fetchData()` (`/api/tasks`, `/api/projects`, `/api/campaigns`, `/api/users`, `/api/brands`, `/api/products`, `/api/notifications`, `/api/crm/companies`, `/api/chat/unread`) oraz komunikatem `[Axios Interceptor] Wykryto wygasłą sesję (401). Automatyczne wylogowanie.`.

W kodzie zidentyfikowano 3 powiązane luki:
1. **Sztywne wygasanie JWT po 24h bez odświeżania ([auth.service.js](file:///z:/Nexus_ERP_Project/src/modules/auth/auth.service.js)):** brak endpointu odświeżania sesji oraz brak odnawiania przesuwnego (*sliding session*) powodowały twarde wygaśnięcie tokena dokładnie po 24h od logowania.
2. **Brak izolacji zakresu `401` w interceptorze ([App.jsx](file:///z:/Nexus_ERP_Project/frontend/src/App.jsx)):** błędy `401` zwracane przez kontrolery integracji zewnętrznych (Allegro `ALLEGRO_USER_AUTH_REQUIRED`, InPost Von Halsky) nie były odróżniane od `401` sesji ERP z [auth.middleware.js](file:///z:/Nexus_ERP_Project/src/middlewares/auth.middleware.js), przez co błąd integracji zewnętrznej mógł wyzwolić wylogowanie z całego systemu.
3. **Brak ochrony przed powielonym wylogowaniem i nadpisaniem formularza:** wielokrotne równoległe `401` z `Promise.all` wyzwalały `handleLogout()` kilkukrotnie, czyszcząc również `aps_editing_product`, a przeładowanie stanu `token` mogło zresetować niezapisaną pracę w `UnifiedProductPipelineView`.

## 2. Decyzja architektoniczna

1. **Odnawianie sesji po stronie backendu ([auth.service.js](file:///z:/Nexus_ERP_Project/src/modules/auth/auth.service.js), [auth.controller.js](file:///z:/Nexus_ERP_Project/src/modules/auth/auth.controller.js), [auth.routes.js](file:///z:/Nexus_ERP_Project/src/modules/auth/auth.routes.js), [auth.middleware.js](file:///z:/Nexus_ERP_Project/src/middlewares/auth.middleware.js)):**
   - Wydzielono `issueUserToken`, `refreshUserSession`, `serializeAuthUser` i `getJwtExpiresIn`; dodano chroniony endpoint `POST /api/auth/refresh`.
   - W `createAuthenticateToken` / `authenticateToken` dodano jawne błędy sesji (`authScope: 'NEXUS_SESSION'`, `code: 'AUTH_TOKEN_MISSING' | 'AUTH_TOKEN_EXPIRED' | 'AUTH_TOKEN_INVALID' | 'AUTH_USER_NOT_FOUND' | 'AUTH_SESSION_REQUIRED'`, nagłówek `X-Nexus-Auth-Error`) oraz **sliding refresh** — gdy ważnemu tokenowi z nagłówka `Authorization` pozostaje `< 12h` do wygaśnięcia (`SLIDING_REFRESH_THRESHOLD_SEC`), odpowiedź otrzymuje nagłówek `X-Nexus-Refreshed-Token` ze świeżym tokenem (24h).
   - W [server.js](file:///z:/Nexus_ERP_Project/src/server.js) dodano `exposedHeaders: ['X-Nexus-Refreshed-Token', 'X-Nexus-Auth-Error']` do konfiguracji CORS.
   - W [offer-optimizer.controller.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/offer-optimizer.controller.js) i [vonhalsky.controller.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/vonhalsky.controller.js) błędy integracji zewnętrznych oznaczono jawnie jako `authScope: 'EXTERNAL_INTEGRATION'`.

2. **Bezpieczne odświeżanie i izolacja `401` na frontendzie ([authSession.js](file:///z:/Nexus_ERP_Project/frontend/src/utils/authSession.js), [App.jsx](file:///z:/Nexus_ERP_Project/frontend/src/App.jsx), [UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx)):**
   - Utworzono czysty moduł `authSession.js` (`getActiveAuthToken`, `parseJwtExpiryMs`, `shouldProactivelyRefreshToken`, `isTokenAlreadyExpired`, `isNexusSessionAuthError`).
   - Interceptor odpowiedzi Axios przechwytuje `x-nexus-refreshed-token`, a cichy timer (co 10 min + `visibilitychange`) odświeża sesję przez `POST /api/auth/refresh`, gdy zostało `< 4h`. Odświeżenie aktualizuje `localStorage` (`aps_token`), `tokenRef.current` i `axios.defaults.headers.common['Authorization']` **bez wywoływania `setToken(...)`**, dzięki czemu Socket.IO i edytowany formularz produktu pozostają nietknięte.
   - `axios.interceptors.request`, `window.fetch` i `io(..., { auth: (cb) => ... })` zawsze pobierają najświeższy aktywny token; `fetchData()` i `fetchUnreadCount()` przerywają wykonanie przy braku aktywnego tokena.
   - Wylogowanie z powodu `401` uruchamia się jednokrotnie (`isLoggingOutRef`), wyłącznie dla `isNexusSessionAuthError(error) === true`, i zachowuje `aps_editing_product` do momentu ponownego zalogowania tego samego użytkownika (przy zmianie `user.id` albo ręcznym kliknięciu „Wyloguj” stan jest czyszczony).
   - W `UnifiedProductPipelineView.jsx` poprawiono priorytet odczytu tokena (`aps_token` przed przestarzałym `token`).

## 3. Weryfikacja
- `node --check` na wszystkich 8 zmodyfikowanych/dodanych plikach backendu `.js` — **PASS (`exit 0`)**.
- `node --test src/modules/offer-optimizer-v2/tests/*.test.js` — **`390/390 PASS`** (`fail: 0`, `cancelled: 0`, `skipped: 0`), w tym nowa suita [auth.session.resilience.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/auth.session.resilience.test.js).
- ESLint (`frontend/`): `authSession.js` — **`0` błędów**; `App.jsx` — **`0` nowych błędów** (`34` wcześniejszych na nietkniętych liniach `116..985`); `UnifiedProductPipelineView.jsx` — **`0` nowych błędów** (`17` wcześniejszych na nietkniętych liniach `72..2201`).
- `npm --prefix frontend run build` (`vite build`) — **PASS** (`8.23s`).
