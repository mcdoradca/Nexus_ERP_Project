# ADR-0189: Agregacja `items[].warnings/errors` z Allegro `POST /ingredients/parse`, ochrona składów detergentowych WE 648/2004 i fallback `422` dla walidacji `offer.modules.composition`

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-20  
**Moduły:** `src/modules/offer-optimizer/allegro.service.js`, `src/utils/allegro_mapper.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/tests/allegro.params.export.test.js`

---

## 1. Kontekst i Diagnoza Problemu

Podczas eksportu parametrów dla oferty Allegro `#19111680577` (*DUAL POWER TABLETKI WYBIELAJĄCE 40 SZT*, kategoria `253359`, rynek `allegro-pl`, język `pl-PL`) wywołanie `PATCH /sale/product-offers/19111680577` zakończyło się błędem:
`Allegro API PATCH error (422): Użyj języka odpowiedniego dla rynku, na którym wystawiasz ofertę. [offer.modules.composition.data.products[0].items[0].ingredients]`.

Weryfikacja na żywych odpowiedziach `POST /ingredients/parse` z Allegro wykazała trzy przyczyny:
1. **Błędny odczyt zagnieżdżonych `warnings` i `errors` w [allegro.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/allegro.service.js):** Allegro zwraca ostrzeżenia (`UNKNOWN_INGREDIENT`) i błędy (`INVALID_INGREDIENT_CHARACTERS`) wewnątrz `products[0].items[i].warnings` / `items[i].errors`, podczas gdy `parseIngredientsWithAllegro` czytało wyłącznie poziom `products[0].warnings` / `products[0].errors` (zawsze puste `[]`).
2. **Deklaracja detergentu/biocydu WE 648/2004 błędnie wysłana jako kosmetyczne INCI:** Tekst `≥30% Chlorine-based bleaching agents. Contains: Troclosene sodium, dihydrate.` zawierał dwukropek po `Contains:`, przez co parser Allegro potraktował angielską frazę `"≥30% Chlorine-based bleaching agents. Contains"` jako `items[0].name` (nazwę pod-produktu w zestawie), a pozostałe 2 elementy oznaczył jako `UNKNOWN_INGREDIENT` (`0/2` rozpoznanych). Przez zignorowanie `items[0].warnings` system uznał skład za poprawny (`supported: true`) i wysłał angielski obiekt `composition`, uruchamiając filtr językowy Allegro na polskiej aukcji.
3. **Brak fallbacku `422` dla błędów walidacji samej ścieżki `offer.modules.composition`:** Fallback z ADR-0186 reagował tylko na błąd nieobsługiwanej kategorii, a nie na błąd walidacji/języka składu konkretnego produktu.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Deterministyczna ocena odpowiedzi `/ingredients/parse` ([allegro.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/allegro.service.js))
- Wydzielono funkcję `evaluateParsedIngredientsResponse({ parsedProd, rawInci, productName })`:
  - Agreguje `errors` i `warnings` zarówno z `parsedProd`, jak i ze wszystkich `parsedProd.items[i]`.
  - Oznacza `supported: false` wraz z czytelnym `unsupportedReason`, gdy wystąpi błąd parsera (`errors.length > 0`), gdy `items[].name` zawiera urwany nagłówek detergentu (`%`, `Contains`, `Zawiera`, `bleaching agents`, `surfactants`), lub gdy nie rozpoznano składników w standardzie INCI (`recognizedIngredients === 0`, `< 50%` rozpoznanych przy `UNKNOWN_INGREDIENT`, lub skład detergentu WE 648/2004 z dowolnym `UNKNOWN_INGREDIENT`).
  - Przepuszcza poprawne składy kosmetyczne INCI (nie odrzucając całego kosmetyku za pojedyncze ostrzeżenie przy większości rozpoznanych składników).

### 2.2. Oczyszczanie synonimów CTFA/FDA w nawiasach kwadratowych bez tłumaczenia INCI ([allegro_mapper.js](file:///z:/Nexus_ERP_Project/src/utils/allegro_mapper.js))
- W `extractCleanInciForAllegro` dodano usuwanie wyłącznie dopisków synonimowych w nawiasach kwadratowych (np. `AQUA [WATER]` -> `AQUA`, `CI 19140 [YELLOW 5]` -> `CI 19140`), zachowując 100% legalnego angielskiego/łacińskiego nazewnictwa INCI oraz botanicznych nawiasów okrągłych.

### 2.3. Dedykowany fallback `422` bez zatruwania cache kategorii ([allegro.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/allegro.service.js), [offer-optimizer.controller.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/offer-optimizer.controller.js), [UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx))
- Dodano `isAllegroCompositionValidationError(error)` wykrywający odpowiedzi `422`/`400`, w których wszystkie błędy odnoszą się wyłącznie do ścieżki `offer.modules.composition` / `productSet[].composition`.
- W `exportAllegroParams` przy takim błędzie `composition` jest bezpiecznie zdejmowane przez `stripCompositionFromPatchBody` i `PATCH` jest ponawiany dla pozostałych parametrów i GPSR — **bez** dopisywania kategorii do 24h cache `ALLEGRO_COMPOSITION_UNSUPPORTED_CATEGORIES`.
- Modal Pre-flight w `UnifiedProductPipelineView.jsx` wyświetla konkretny `compositionDiagnostics.unsupportedReason`.

---

## 3. Weryfikacja

- **Składnia (`node --check`):** `allegro.service.js`, `allegro_mapper.js`, `offer-optimizer.controller.js`, `allegro.params.export.test.js` — **PASS**.
- **Testy jednostkowe:** `allegro.params.export.test.js` (`16/16 PASS` — nowe testy 14 i 15) oraz pełna suita `offer-optimizer-v2/tests/*.test.js` (`319/319 PASS`).
- **Frontend:** ESLint (`0` nowych błędów w `UnifiedProductPipelineView.jsx`), `npm --prefix frontend run build` — **PASS** (`6.01s`).
- **Żywa weryfikacja read-only na `POST /ingredients/parse`:**
  - Dual Power `#19111680577` (kat. `253359`): `supported: false`, `0/2` rozpoznanych, czytelne `unsupportedReason` — pole `composition` automatycznie pomijane w Pre-flight.
  - Dermomed kosmetyk (kat. `253350`): `AQUA [WATER]` / `CI 19140 [YELLOW 5]` oczyszczone -> `supported: true`, **`16/16` rozpoznanych (`0` ostrzeżeń)**.
