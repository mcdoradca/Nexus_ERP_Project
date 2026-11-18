# ADR-0178: Ochrona Własnego Opisu i Galerii Aukcji przed Nadpisaniem Katalogiem Produktów podczas Eksportu Parametrów Allegro (`PATCH /sale/product-offers/{offerId}`)

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-18  
**Moduły:** `src/utils/allegro_mapper.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/tests/allegro.params.export.test.js`

---

## 1. Kontekst i Zweryfikowana Przyczyna Błędu Produkcyjnego

Podczas bezpośredniego eksportu parametrów, składu INCI (`composition`) oraz ostrzeżeń GPSR (`safetyInformation`) na istniejącą ofertę Allegro (`POST /validate-allegro-params-export` -> `POST /export-allegro-params` -> `PATCH /sale/product-offers/{offerId}`), oferta z wcześniej wgranym z BaseLinkera opisem i zdjęciami była całkowicie nadpisywana opisem oraz galerią pochodzącymi z Katalogu Produktów Allegro.

Bezpośrednią przyczyną w `src/utils/allegro_mapper.js` (`buildAllegroParameterPatchPayload`) było wysyłanie `patchBody.productSet[0].product = { id: item.product.id, parameters: [...] }` **bez jednoczesnego przekazania aktualnego opisu i zdjęć edytowanej oferty**.

Zgodnie z oficjalną dokumentacją Allegro REST API (`swagger.yaml` dla `PATCH /sale/product-offers/{offerId}`, poradnik `jak-zarzadzac-ofertami-7GzB2L37ase#edycja-pojedynczej-oferty`, diagram priorytetów `request > product > offer` oraz komunikaty `allegro/allegro-api` `#4291`, `#4691`, `#11823`, `#11981`, `#12104`, `#12200`, `#13838`):
1. Wskazanie `productSet[].product.id` (nawet tego samego identyfikatora UUID produktu, który jest już podpięty pod ofertę) wymusza po stronie Allegro resynchronizację oferty z bieżącymi danymi Katalogu Produktów.
2. W tym trybie brak pola `description` powoduje nadpisanie opisu oferty opisem z Katalogu, a brak pola `images` oraz `productSet[0].product.images = []` powoduje zastąpienie lub doklejenie zdjęć katalogowych do galerii oferty.
3. Całkowite pominięcie `product.id` przy wysyłce `product.parameters` nie jest bezpieczne we wszystkich kategoriach, gdyż w części przypadków uruchamia wyszukiwanie produktu po parametrach (`DuplicateDetectionMissingParametersException`, `#12161`, `#13758`).

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Tarcza Ochronna Treści Oferty przy Zmianie `productSet` (`src/utils/allegro_mapper.js`)
- Wydzielono współdzielony helper `getOfferContentTrustFlags(catalogProduct)` (DRY dla `buildAllegroParameterPatchPayload` oraz `buildAllegroContentPreflight`) rozpoznający blokady `trustedContent.paths` / `trustedContent.productPaths` dla `images` i `description`.
- Wzbogacono `normalizeOfferImageUrls(rawImages)` o bezpieczną deduplikację z zachowaniem kolejności galerii (pierwszy adres URL pozostaje miniaturką oferty) oraz dodano niemutujący `cloneStandardizedDescription(rawDescription)`.
- Dodano funkcję `buildPreservedOfferContentForProductPatch({ existingOffer, catalogProduct })`, wywoływaną przez `buildAllegroParameterPatchPayload` wyłącznie wtedy, gdy modyfikacja obejmuje `productSet` (`needsProductSetPatch === true`: zmiana parametrów produktowych, `safetyInformation` lub `composition`):
  1. Gdy oferta posiada sekcje `existingOffer.description.sections` i pole `description` nie jest zablokowane przez `trustedContent`, kopia `description` zostaje jawnie dołączona do `patchBody.description`.
  2. Gdy oferta posiada co najmniej jedno zdjęcie w `existingOffer.images` i pole `images` nie jest zablokowane przez `trustedContent`:
     - aktualna lista URL-i trafia do `patchBody.images`,
     - w `patchBody.productSet[0].product` ustawiane jest **`images: []`** (oficjalna blokada automatycznego podpinania/doklejania zdjęć katalogowych),
     - filtrowana lista `existingOffer.aiCoCreatedContent.images` (wyłącznie URL-e obecne w zachowanej galerii) trafia do `patchBody.aiCoCreatedContent`, aby nie utracić deklaracji AI Act.
  3. Gdy oferta ma pustą galerię (`images: []`), `product.images = []` **nie** jest wysyłane (zgodnie z tabelą zdjęć Allegro, aby nie wyzerować galerii przy braku zdjęć w korzeniu).
  4. Gdy modyfikowane są wyłącznie parametry ofertowe (`describesProduct: false`, brak `productSet` w `PATCH`) lub brak jakichkolwiek zmian (`hasChanges: false`), `patchBody` nie zawiera `description`, `images` ani `productSet`.
- Rozszerzono wynik `buildAllegroParameterPatchPayload` o obiekt diagnostyczny `preservedOfferFields`.

### 2.2. Integralność Tokenu HMAC, Audyt i UI Pre-Flight (`offer-optimizer.controller.js`, `UnifiedProductPipelineView.jsx`)
- `validateAllegroParamsExport` podpisuje cały `patchBody` (zawierający również chroniony `description` i `images`) tokenem `HMAC-SHA256` (TTL 5 min) oraz zwraca `preservedOfferFields` na frontend.
- `exportAllegroParams` loguje w `exportLogger.info` dokładne liczniki ochrony treści (`zdjęcia`, `opisSekcje`, `blokadaKataloguZdjec`).
- W modalu Pre-flight parametrów (`UnifiedProductPipelineView.jsx`) dodano kartę **„Tarcza Ochrony Opisu i Zdjęć Aukcji (Allegro Catalog Guard)”**, wyraźnie informującą przed kliknięciem wysyłki, ile sekcji opisu oraz zdjęć aukcji jest chronionych i kiedy `productSet` pozostaje nieużywany.

---

## 3. Weryfikacja

- **Kontrola składni (`node --check`):** `src/utils/allegro_mapper.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `src/modules/offer-optimizer-v2/tests/allegro.params.export.test.js` — `0` błędów.
- **Testy jednostkowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`289/289 PASS`** (`0` fail, `0` skipped), w tym **`allegro.params.export.test.js` (`11/11 PASS`)** oraz **`allegro.content.export.test.js` (`6/6 PASS`)**.
- **Frontend ESLint & Vite Build:**
  - `npx eslint src/views/OfferOptimizer/UnifiedProductPipelineView.jsx` (z folderu `frontend/`): `0` nowych błędów w zmodyfikowanych fragmentach (`18` zastanych błędów `no-unused-vars`/`no-empty` na nienaruszonych liniach `21..1600`).
  - `npm --prefix frontend run build` (`vite build`): **PASS** (`built in 2.07s`).
- **Nie-mutujący test E2E Pre-flight przeciwko żywemu API Allegro (bez `PATCH`, konto `50233197`):**
  - EAN `8004120910364` (oferta `17803378483`) -> `HTTP 200`, `hasChanges: true`, `patchBody keys: ['productSet', 'images', 'description']`, `patchBody.images: 6`, `patchBody.description.sections: 6`, `productSet[0].product.images: []`, `hasExportToken: true`.
  - EAN `8059602247612` (oferta `18114732375`) -> `HTTP 200`, `hasChanges: true`, `patchBody keys: ['productSet', 'images', 'description']`, `patchBody.images: 6`, `patchBody.description.sections: 6`, `productSet[0].product.images: []`, `hasExportToken: true`.
