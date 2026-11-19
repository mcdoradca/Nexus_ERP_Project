# ADR-0183: Pierwszeństwo parametrów PIM/Allegro z formularza oraz SSOT podglądu i eksportu do BaseLinkera

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-19  
**Moduły:** `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/baselinker.export.service.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `src/modules/offer-optimizer-v2/tests/baselinker.export.test.js`

---

## 1. Kontekst i Zidentyfikowane Problemy

Podczas eksportu oferty z Nexusa do BaseLinkera modal weryfikacji oraz finalny ładunek API nadpisywały skorygowane przez operatora parametry z **„Karty Technicznej i Składu (Parametry PIM)"** i **„Katalogu Parametrów Allegro"** starymi wartościami katalogowymi pobranymi z BaseLinkera / Katalogu Allegro (np. dla EAN `8050999571205`: `butelka` zamiast `butelka z pompką`, `1200,00 g` zamiast `1000`, `egzotyczny` zamiast `Mango`, `Mango` zamiast `Energy`):

1. `handleValidateExport` w `UnifiedProductPipelineView.jsx` nie wysyłało `newProductForm.features` do `/api/offer-optimizer/validate-baselinker-export`.
2. `validateBaselinkerExport` w `offer-optimizer.controller.js` dublowało wywołanie `AllegroService.getProductParametersByEan` (`hardFeatures`) i zwracało `{ ...(product.features || {}), ...(hardFeatures || {}) }`, przez co `hardFeatures` nadpisywały `product.features`, a wewnętrzne pole binarne `Zdjęcie tyłu opakowania` (`data:image/jpeg;base64,...`) wyciekało na ekran modalu weryfikacyjnego.
3. `baselinker.export.service.js` (`buildPayload`) scalało parametry w kolejności `{ ...existingFeatures, ...hardFeatures, ...(draftData.features || {}) }`, co bez `draftData.features` (lub z nadpisanymi parametrami z modalu) powodowało wygraną `hardFeatures`, a `exportToBaselinker` nie zapisywało potwierdzonych parametrów z powrotem do `Product.features` w bazie PIM.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Przekazanie pełnego stanu parametrów z UI (`featuresAuthoritative`)
- `handleValidateExport` i `handleConfirmExport` w `UnifiedProductPipelineView.jsx` przekazują bieżący obiekt `features: newProductForm.features || {}` z flagą `featuresAuthoritative: true`.

### 2.2. Wspólny helper scalający i priorytet PIM/UI nad fallbackiem katalogowym
- W `baselinker.export.service.js` wydzielono funkcję `mergeFeaturesForBaselinker({ existingFeatures, draftFeatures, hardFeatures, featuresAuthoritative })` wykorzystywaną przez `buildPayload`:
  - Aktualne wartości z UI (`draftFeatures`) i bazy PIM (`existingFeatures`) mają zawsze pierwszeństwo przed `hardFeatures` (niezależnie od wielkości liter w nazwie klucza).
  - `hardFeatures` uzupełnia wyłącznie puste lub brakujące klucze.
  - Przy `featuresAuthoritative: true` klucze celowo usunięte przez operatora w formularzu UI nie są przywracane z bazy ani z `hardFeatures`.
  - Wewnętrzne klucze obrazów i wartości `data:image/...` (`Zdjęcie tyłu opakowania`, `zdjecie tylu opakowania`, `_backimageurl`) są bezwarunkowo usuwane z ładunku BaseLinkera.

### 2.3. Single Source of Truth między modalem weryfikacji a eksportem i utrwalenie w PIM
- `validateBaselinkerExport` (`offer-optimizer.controller.js`): usunięto redundantne wywołanie `AllegroService.getProductParametersByEan`, a jako `parameters` dla modalu zwrócono bezpośrednio `generatedPayload?.text_fields?.features || {}` zbudowane przez `buildPayload`.
- `exportToBaselinker` (`offer-optimizer.controller.js`): przed wysyłką do BaseLinkera zaktualizowano `Product.features` w bazie PIM o potwierdzone parametry (z zachowaniem wewnętrznego pola `Zdjęcie tyłu opakowania` w bazie), zapewniając spójność po stronie kontrolera oraz `baselinker.service.js`.

---

## 3. Weryfikacja

- **Składnia (`node --check`):** `baselinker.export.service.js`, `offer-optimizer.controller.js` — **PASS**.
- **Testy jednostkowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** obejmuje rozszerzony `baselinker.export.test.js` (test `mergeFeaturesForBaselinker` oraz pełny `buildPayload` ze zamockowanym starym `AllegroService.getProductParametersByEan`).
- **Frontend:** `npm --prefix frontend run build` (`vite build`) oraz ESLint dla `UnifiedProductPipelineView.jsx`.
- **Dry-run na bazie Postgres (`8050999571205`):** `buildPayload` zachowuje poprawione `Opakowanie: 'butelka z pompką'`, `Waga: '1000'`, `Zapach: 'Mango'`, `Linia: 'Energy'` bez wycieku `Zdjęcie tyłu opakowania` / `data:image/...`.
