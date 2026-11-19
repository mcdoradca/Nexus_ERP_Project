# ADR-0186: Automatyczny fallback i cache TTL (24h) dla kategorii Allegro nieobsługujących jeszcze `productSet[].composition`

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-19  
**Moduły:** `src/modules/offer-optimizer/allegro.service.js`, `src/utils/allegro_mapper.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/tests/allegro.params.export.test.js`

---

## 1. Kontekst i Diagnoza Problemu

Podczas aktualizacji parametrów oferty Allegro `#19112067504` w kategorii `253350` (*Supermarket -> Utrzymanie czystości -> Chemia gospodarcza -> Mydła*):

1. Endpoint pomocniczy `POST /ingredients/parse` z `categoryId: "253350"` zwracał status `200 OK` oraz poprawnie sparsowane składniki INCI (`supported: true`).
2. Jednocześnie Allegro REST API nie wdrożyło jeszcze obsługi pola `productSet[0].composition` w samej kategorii `253350`, przez co wywołanie `PATCH /sale/product-offers/19112067504` z dołączonym `productSet[0].composition` kończyło się błędem `422`: *„Nie można podać składników dla kategorii produktu (0) [productSet]”* i blokowało wysłanie wszystkich pozostałych parametrów kategorii oraz ostrzeżeń GPSR (`safetyInformation`).

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Detekcja błędu `422`, bezpieczne oczyszczanie `patchBody` i 24h TTL Cache ([allegro.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/allegro.service.js), [allegro_mapper.js](file:///z:/Nexus_ERP_Project/src/utils/allegro_mapper.js))
- Dodano `isAllegroCompositionCategoryError(error)` rozpoznającą błędy `422` (PL i EN) informujące, że kategoria nie przyjmuje składników w `productSet`.
- Dodano cache negatywny kategorii z 24-godzinnym TTL (`ALLEGRO_COMPOSITION_UNSUPPORTED_CATEGORIES` w `SystemSetting` + cache w pamięci operacyjnej) oraz funkcje `getCategoryCompositionSupport`, `markCategoryCompositionUnsupported` i `clearCategoryCompositionUnsupported` (bez modyfikacji schematu bazy danych). Cache automatycznie wygasa po 24h lub czyści się przy udanej wysyłce, gdy Allegro rozszerzy obsługę na kolejną kategorię.
- W `allegro_mapper.js` dodano `hasCompositionInPatchBody` oraz `stripCompositionFromPatchBody(patchBody, existingOffer)`, które usuwa `composition` z `productSet`, a gdy poza składem w `productSet` nie było innych zmian (`product.parameters`, `safetyInformation`), zdejmuje również pusty `productSet` oraz powiązane pola ochronne (`images`, `description`, `aiCoCreatedContent`) zgodnie z RFC 7396.

### 2.2. Samonaprawczy eksport i Pre-flight ([offer-optimizer.controller.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/offer-optimizer.controller.js))
- `validateAllegroParamsExport`: sprawdza wsparcie kategorii w cache; dla kategorii znanych jako nieobsługujące jeszcze `composition` zachowuje wynik walidacji `POST /ingredients/parse` (`parserValid`), ale ustawia `categorySupported: false` i domyślnie pomija `composition` w payloadzie z czytelnym ostrzeżeniem (zachowując flagę `forceCompositionRetry` do ręcznego ponownego testu).
- `exportAllegroParams`: po otrzymaniu `422` (`isAllegroCompositionCategoryError`) zapisuje kategorię w cache, oczyszcza `patchBody` przez `stripCompositionFromPatchBody` względem aktualnej oferty i natychmiast ponawia `PATCH /sale/product-offers/{offerId}` z pozostałymi parametrami oraz `safetyInformation` (lub zwraca `SKIPPED_COMPOSITION_UNSUPPORTED`, jeśli jedyną zmianą był sam skład). Jeśli `PATCH` z `composition` powiedzie się (np. po uruchomieniu tej funkcji przez Allegro), automatycznie usuwa kategorię z cache.

### 2.3. Ergonomia modalu Pre-flight ([UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx))
- Synchronizacja checkboxa **„Dołącz skład INCI do PATCH”** z `compositionDiagnostics.supported`, możliwość natychmiastowego przełączenia bez osobnego przycisku (w tym wymuszenia testu dla kategorii z ostrzeżeniem) oraz aktualizacja stanu po fallbacku bez INCI z wyświetleniem komunikatu dla operatora.

---

## 3. Weryfikacja

- **Składnia (`node --check`):** `allegro_mapper.js`, `allegro.service.js`, `offer-optimizer.controller.js`, `allegro.params.export.test.js` — **PASS**.
- **Testy jednostkowe:** `allegro.params.export.test.js` (nowe testy 12 i 13 dla `stripCompositionFromPatchBody`, `isAllegroCompositionCategoryError` i cache TTL) + pełna suita `offer-optimizer-v2/tests/*.test.js` — **PASS**.
- **Frontend:** ESLint (`0` nowych błędów w `UnifiedProductPipelineView.jsx`) oraz `npm --prefix frontend run build` — **PASS**.
