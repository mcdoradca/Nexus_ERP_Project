# ADR-0185: Odporność wyszukiwania PIM na białe znaki w EAN, bezpieczna konwersja typów w `saveDraft` oraz automatyczne dopasowanie Marki przy starcie EAN Pipeline

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-19  
**Moduły:** `src/utils/productLookup.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `src/server.js`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/tests/product.save-draft.test.js`

---

## 1. Kontekst i Diagnoza Problemu

Podczas pracy na produkcie `1a4ec6f8-73b0-4987-a232-d3cb76df4454` (*Dermomed Mydło w płynie talk i irys 1000 ml zapas*) zapis szkicu (`/api/offer-optimizer/save-draft`) kończył się trzykrotnie błędem HTTP 500, a operator widział komunikat braku wymaganego elementu mimo uzupełnionego formularza:

1. W bazie Postgres kolumna `Product.ean` miała spację na końcu (`"8032680390036 "`), podczas gdy `UnifiedProductPipelineView.jsx` (`effectiveEan`) przycinał kod do `"8032680390036"` i wysyłał go do `save-draft` bez `productId`.
2. `saveDraft` w `offer-optimizer.controller.js` szukał produktu wyłącznie przez `prisma.product.findUnique({ where: { ean } })` (zwracając `null`), a następnie wykonywał wprost `prisma.product.update({ where: { ean } })`, co skutkowało błędem Prisma `P2025` (*„An operation failed because it depends on one or more records that were required but not found”* -> HTTP 500).
3. `saveDraft` nie konwertował pól liczbowych z formularza (`weight`, `length`, `width`, `height`, `taxRate`, `stock`, `basePrice`, `salePrice`, itd.) z formatów string/`""`/przecinek przed zapisem Prisma oraz nie weryfikował istnienia klucza obcego `allegroCategoryId` / `brandId`.
4. `POST /api/products` i `PATCH /api/products/:id` w `src/server.js` zapisywały `ean` i `sku` bez `.trim()`, a w `UnifiedProductPipelineView.jsx` każda edycja pola **„Marka \*”** natychmiast zerowała `brandId: ''`, powodując blokadę startu EAN Pipeline komunikatem o braku Marki mimo widocznej nazwy marki w polu.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Wspólny moduł wyszukiwania i konwersji typów ([productLookup.js](file:///z:/Nexus_ERP_Project/src/utils/productLookup.js))
- Dodano funkcje `trimOrNull`, `parseLocaleFloat`, `parseLocaleInt`, `buildNumericProductUpdateFields` oraz `resolveProductByIdOrEan(prisma, { id, productId, ean, include, select })`.
- `resolveProductByIdOrEan` kolejno sprawdza `id`/`productId`, dokładny `ean`, przycięty `ean.trim()`, a w ostateczności wykonuje bezpieczny fallback `contains` z dokładną weryfikacją w JS `String(p.ean || '').trim() === cleanEan` (chroni przed błędnym dopasowaniem częściowego prefiksu EAN i gwarantuje dołączenie `ean: true` przy podaniu `select`).

### 2.2. Utwardzenie `saveDraft`, potoku `triggerUltimatePipeline` i kontrolerów eksportu ([offer-optimizer.controller.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/offer-optimizer.controller.js), [server.js](file:///z:/Nexus_ERP_Project/src/server.js))
- `saveDraft`: wykorzystuje `resolveProductByIdOrEan` (z czystym `404` zamiast `P2025` `500`), aktualizuje rekord po `id`, przy braku kolizji automatycznie leczy EAN z nadmiarowymi spacjami, konwertuje wszystkie pola liczbowe przez `buildNumericProductUpdateFields`, waliduje istnienie `brandId` i `allegroCategoryId` (z próbą dociągnięcia kategorii z Allegro API) oraz obsługuje błędy `P2002` (`409`) i `P2003` (`400`).
- `analyzeSingle`, `regenerateTitle`, `validateBaselinkerExport`, `exportToBaselinker`, `generateLifestyle`, `triggerUltimatePipeline`, `checkPipelineStatus` oraz kontrolery Allegro Params/Content przepięto na `resolveProductByIdOrEan`; `triggerUltimatePipeline` używa `canonicalEan` i `productWhere` po `id` oraz bezpiecznej funkcji zapisu statusu w blokach `HALT`/`ERROR`/`catch`.
- W `src/server.js` (`POST /api/products`, `PATCH /api/products/:id`, `/api/products/autofill/:ean`, `/api/products/baselinker-sync/:ean`) dodano przycinanie białych znaków z `ean`/`sku`/`brandId`/`subiektId`/`baselinkerId`/`allegroCategoryId`, konwersję liczb przecinkowych oraz bezpieczne wyszukiwanie przez `resolveProductByIdOrEan`.

### 2.3. Odporność formularza frontendowego ([UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx))
- `handleSaveDraft`, `handleValidateExport`, `handleConfirmExport` i `handleTriggerPipeline` przesyłają `productId` oraz przycięty `ean`; listener WebSocket porównuje przycięte `String(data.ean).trim()`.
- Pole **„Marka \*”** automatycznie dopasowuje `brandId` podczas wpisywania istniejącej nazwy marki, a `handleCreateProduct` w razie braku `brandId` przy wypełnionym `brandSearchTerm` najpierw wyszukuje lub tworzy markę przez `/api/brands`, zgłaszając dokładnie nazwy brakujących pól dopiero przy faktycznym braku danych.

---

## 3. Weryfikacja

- **Składnia (`node --check`):** `src/utils/productLookup.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `src/server.js`, `src/modules/offer-optimizer-v2/tests/product.save-draft.test.js` — **PASS**.
- **Testy jednostkowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`306/306 PASS`** (`0` błędów, `0` pominiętych), w tym nowe testy w `product.save-draft.test.js` weryfikujące `resolveProductByIdOrEan` (spacja w EAN, ochrona prefiksu, `select` bez `ean`, priorytet `productId`) i `buildNumericProductUpdateFields`.
- **Frontend:** ESLint na `UnifiedProductPipelineView.jsx` — `0` nowych błędów (pozostaje 18 wcześniejszych `no-unused-vars` w nietkniętych liniach `21..1681`), `npm --prefix frontend run build` (`vite build`) **PASS** (`9.40s`).
- **Weryfikacja na żywej bazie Postgres (tylko odczyt):** `resolveProductByIdOrEan(prisma, { ean: '8032680390036' })` poprawnie odnalazło rekord `1a4ec6f8-73b0-4987-a232-d3cb76df4454` pomimo zapisanego `"8032680390036 "` w bazie.
