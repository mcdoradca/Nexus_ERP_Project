# ADR-0180: Stały Układ Sekcji Opisu A/B A/B (`[IMAGE, TEXT]`) oraz Wielokontowe Rozwiązywanie `offerId` w Multi-Account Vault Allegro

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-18  
**Moduły:** `src/utils/allegro_mapper.js`, `src/modules/offer-optimizer/allegro.service.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/tests/allegro.content.export.test.js`

---

## 1. Kontekst i Zidentyfikowane Problemy

1. **Szachownica sekcji w eksporcie opisu (`allegro_mapper.js`, `UnifiedProductPipelineView.jsx`):**
   W `buildAllegroDescriptionSections` sekcje parzyste (`sekcja2`, `sekcja4`, `sekcja6`) miały ustawione `imageFirst: false` (`[TEXT, IMAGE]`), generując naprzemienną szachownicę zamiast jednolitego układu **A/B A/B** (zdjęcie zawsze po lewej, opis po prawej).
2. **Obsługa ręcznego numeru aukcji (`offerId`) i drugiego konta firmowego (`Prosto_z_Wloch` vs `wenecja444`):**
   - Przycisk `Znajdź aukcję na Allegro` (`handleSearchAllegroOffers`) nadpisywał niepusty, ręcznie wpisany przez operatora numer `allegroOfferId` pierwszą znalezioną aukcją z innego konta.
   - `getOfferAndCatalogForParams` przy ręcznym wklejeniu `offerId` odpytywało wyłącznie jedno konto domyślne/wskazane zamiast automatycznie sprawdzić pozostałe konta w `ALLEGRO_ACCOUNTS_VAULT` po `403`/`404`.
   - Jednocześnie ustalono, że w bazie autoryzowane jest aktualnie tylko konto `#50233197`, a REST API Allegro wymaga oddzielnego tokenu OAuth dla każdego konta użytkownika (`user_id`), więc dla aukcji konta `Prosto_z_Wloch` wymagane jest jednorazowe podpięcie jego tokena w `Panelu Admina -> Integracje API`.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Stały Układ `A/B A/B` (`[IMAGE, TEXT]`) (`allegro_mapper.js`, `UnifiedProductPipelineView.jsx`)
- W `buildAllegroDescriptionSections` ustawiono `imageFirst: true` dla wszystkich sekcji `sekcja1`–`sekcja6` (zawsze `{ type: 'IMAGE' }` po lewej, `{ type: 'TEXT' }` po prawej; `sekcja7` bez zdjęcia pozostaje jako sam `TEXT`).
- Zsynchronizowano kolejność bloków w `TileSimulator` w `UnifiedProductPipelineView.jsx` (`IMAGE` przed `TEXT`).

### 2.2. Wielokontowe Rozwiązywanie `offerId` i Ochrona Ręcznego Wyboru (`allegro.service.js`, `offer-optimizer.controller.js`, `UnifiedProductPipelineView.jsx`)
- Wydzielono helper `tryFetchOfferOnAccount` w `allegro.service.js` (DRY) oraz rozbudowano `getOfferAndCatalogForParams(offerId, { accountId, allowCrossAccountFallback, injectedPrisma, httpClient })`: przy `403`/`404` automatycznie iteruje po pozostałych autoryzowanych kontach z `ALLEGRO_ACCOUNTS_VAULT` (sortując wg `hasWriteScope`). Gdy oferta nie należy do żadnego podpiętego konta, zwraca `404` (`ALLEGRO_OFFER_NOT_OWNED_BY_CONNECTED_ACCOUNTS`) z listą autoryzowanych kont i wskazówką autoryzacji drugiego konta.
- W `validateAllegroParamsExport` i `validateAllegroContentExport` zaktualizowano `ctx.effAccountId` na `resolvedAccountId` zwrócony przez `getOfferAndCatalogForParams`, dzięki czemu parser INCI `/ingredients/parse`, podpis `HMAC-SHA256` oraz zwracane metadane `account` używają faktycznego właściciela oferty.
- W `UnifiedProductPipelineView.jsx`: `handleSearchAllegroOffers` nie nadpisuje niepustego, ręcznie wpisanego `allegroOfferId` (jedynie dopasowuje `accountId` przy dokładnym dopasowaniu ID), zmieniono etykietę wyboru na `Wszystkie konta (auto / szukaj)` oraz dodano czytelną informację przy liczbie podłączonych kont `<= 1`.

---

## 3. Weryfikacja

- **Składnia (`node --check`):** `allegro_mapper.js`, `allegro.service.js`, `offer-optimizer.controller.js`, `allegro.content.export.test.js` — **PASS (`0` błędów)**.
- **Testy jednostkowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`293/293 PASS`** (`0` fail, `0` skipped), w tym **`allegro.content.export.test.js` (`10/10 PASS` — nowe testy `9` i `10`)**.
- **Frontend ESLint & Vite Build:**
  - `npx eslint src/views/OfferOptimizer/UnifiedProductPipelineView.jsx` (z `frontend/`): `0` nowych błędów w zmodyfikowanych fragmentach (`18` zastanych błędów wyłącznie w nienaruszonym kodzie `<= 1606`).
  - `npm --prefix frontend run build`: **PASS** (`✓ built in 2.15s`).
- **Nie-mutujący test E2E `validateAllegroContentExport` (konto `50233197`, bez `PATCH`):**
  - `offerId: '19112062838'` (EAN `8054633830741`) -> `HTTP 200`, układ sekcji: `IMAGE+TEXT | IMAGE+TEXT | IMAGE+TEXT | IMAGE+TEXT | IMAGE+TEXT | TEXT`.
  - `offerId: '19133046035'` (oferta z niepodłączonego konta `Prosto_z_Wloch`) -> `HTTP 404`, `code: 'ALLEGRO_OFFER_NOT_OWNED_BY_CONNECTED_ACCOUNTS'`, komunikat wskazujący konta sprawdzone (`#50233197`) i brak podmiany numeru aukcji.
