# ADR-0200: Synchronizacja tytułu oferty (`name`) w bezpośrednim eksporcie do Allegro REST API (`PATCH /sale/product-offers/{offerId}`)

- **Status:** Accepted
- **Date:** 2026-11-24
- **Owners:** Nexus ERP Engineering (`offer-optimizer`, `utils/allegro_mapper`, `frontend/OfferOptimizer`)

## 1. Kontekst (Problem)
Po wdrożeniu silnika optymalizacji tytułów SEO/Ads (`ADR-0199`) użytkownik zidentyfikował, że tytuł oferty (`liveTitle`) jest poprawnie generowany i przenoszony przy eksporcie do BaseLinkera (`name|pl|allegro_16402`), ale **nie jest wysyłany i nie aktualizuje się na Allegro** przy korzystaniu z dwóch bezpośrednich ścieżek eksportu w widoku `UnifiedProductPipelineView`:
1. **Wyślij Parametry Allegro** (`validate-allegro-params-export` → `export-allegro-params`),
2. **Wyślij Opis i Zdjęcia Allegro** (`validate-allegro-content-export` → `export-allegro-content`).

Przyczyną był brak obsługi pola `name` w `buildAllegroParameterPatchPayload`, `buildAllegroContentPreflight`, `buildAllegroContentPatchBody`, brak przekazywania `liveTitle` z modali Pre-flight w frontendzie oraz brak utrwalenia zaktualizowanego tytułu w `offerDraft.title` po udanym PATCH.

## 2. Decyzja Architektoniczna
1. **Wspólna funkcja ewaluacji tytułu w `src/utils/allegro_mapper.js` (`evaluateAllegroOfferTitleUpdate`):**
   - Jedno źródło prawdy współdzielone przez `buildAllegroParameterPatchPayload` oraz `buildAllegroContentPreflight` (zero duplikacji walidacji).
   - Wykorzystuje bezpośrednio `validateAllegroOfferTitle` z `title-optimizer.service.js` (limit `12–75` znaków, min. 3 słowa, zakaz spamu/biobójczych/medycznych/surowych literówek ERP).
   - Wykrywa blokadę `trustedContent.paths` dla kluczy `name` oraz `product.name` w `getOfferContentTrustFlags(catalogProduct)` — zamiast blokować eksport pozostałych pól, oznacza `effectiveIncludeTitle = false`, `blockedByTrusted = true` i dopisuje ostrzeżenie w Pre-flight.
   - Gdy nowy tytuł jest identyczny z obecnym `existingOffer.name`, nie dopisuje `patchBody.name` ani nie wyzwala fałszywej zmiany.
   - Umożliwia wysyłkę samego tytułu (`patchBody = { name }`) bez dotykania `productSet`, `images` ani `description`.
   - `stripCompositionFromPatchBody` zachowuje `patchBody.name` jako pozostałą zmianę przy fallbacku 422 dla `composition`.
2. **Fallback `422` dla zablokowanego tytułu (`allegro.service.js` + `offer-optimizer.controller.js`):**
   - Dodano `isAllegroTitleEditError(error)` wykrywający błędy `422/400` wyłącznie dla ścieżki `name` / `offer.name` (np. aukcja z licytacją lub blokada edycji nazwy).
   - Jeśli `patchBody.name` występuje obok innych pól (`parameters`, `productSet`, `images`, `description`), kontroler automatycznie ponawia PATCH bez `name`, raportując częściowy sukces i zachowując dotychczasowy tytuł w bazie. Gdy wysłano wyłącznie `name`, błąd 422 jest zwracany wprost (bez cichego maskowania).
3. **Bezpieczeństwo tokenów Pre-flight i trwałość w PIM (`offer-optimizer.controller.js`):**
   - Token `export-allegro-params` podpisuje `patchBody` zawierający ewentualne `patchBody.name`.
   - `buildCanonicalContentDescriptor` w `export-allegro-content` wiąże kryptograficznie `includeTitle` i `title` w `tokenDigestObj` oraz przekazuje nowy tytuł do `auditOfferDraftCompliance`.
   - Po udanym zapisie tytułu na Allegro obie ścieżki utrwalają nowy `title` w `product.offerDraft.title` oraz w historii eksportu (`allegroLastParamsExport` / `allegroLastContentExport`).
4. **Spójne karty Pre-flight w UI (`UnifiedProductPipelineView.jsx`):**
   - Dodano niezależne przełączniki `allegroParamsIncludeTitle` i `allegroContentIncludeTitle` (domyślnie `true`, automatycznie odznaczane i blokowane przy `blockedByTrusted`) oraz wspólny helper renderujący kartę **Tytuł oferty Allegro (`name`)** z porównaniem **Obecnie na Allegro ↔ Nowy tytuł z PIM** i licznikiem `X / 75 zn.`.

## 3. Weryfikacja
- `node --check src/utils/allegro_mapper.js`, `src/modules/offer-optimizer/allegro.service.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`: **PASS**.
- `node --test src/modules/offer-optimizer-v2/tests/*.test.js`: **369/369 PASS** (`fail 0`, `skipped 0`, `cancelled 0`), w tym nowe podtesty 16–17 w `allegro.params.export.test.js` oraz podtest 12 w `allegro.content.export.test.js`.
- `npx eslint src/views/OfferOptimizer/UnifiedProductPipelineView.jsx` (z katalogu `frontend/`): **0 błędów na liniach objętych ADR-0200** (18 wcześniejszych błędów `no-unused-vars`/`no-empty` w nieedytowanych liniach `63..2065`, 0 ostrzeżeń).
- `npm --prefix frontend run build` (`vite build`): **PASS** (`2623` modułów, `2.49s`).
