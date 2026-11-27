# ADR-0205: Bezstratne Scalanie Skanów Przód ↔ Tył (Delta `appliedFeatures` / `removedKeys` oraz Ochrona Kontretykiety)

- **Status:** Wdrożono i zweryfikowano testami (`385/385 PASS`, ESLint `0` nowych błędów, `vite build` PASS `4.04s`)
- **Data:** 2026-11-27
- **Powiązania:** ADR-0202, ADR-0203, ADR-0204

## 1. Kontekst i analiza problemu
Po oddzielnym uruchomieniu agenta skanującego tylną etykietę (`mode: 'back'`), a następnie uruchomieniu drugiego agenta skanującego przód etykiety (`mode: 'front'`), część parametrów uzupełnionych przez pierwszego agenta znikała lub była nadpisywana w stanie formularza UI i/lub w bazie PIM:

1. **Destrukcyjne zastępowanie stanu i `serverControlledDropKeys` w UI ([UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx)):**
   - `handleExtractLabels` nie przekazywał bieżących cech formularza (`currentFeatures`) ani `allegroCategoryId` / `productName` do `POST /api/offer-optimizer/extract-labels`.
   - Dla produktu jeszcze niezapisanego w DB (lub zawierającego niezapisane zmiany) skan frontu zwracał wyłącznie cechy frontowe bez pól z pierwszego skanu tyłu, po czym `serverControlledDropKeys` celowo usuwał lub nie odtwarzał `Sposób użycia`, `Sposób użycia (Etykieta)` i `Pojemność nakrętki (Etykieta)`, a `setLabelOcrDiagnostics(diag)` kasował diagnostykę OCR z tyłu.
2. **Ślepe nadpisywanie w `runUnifiedLabelExtraction` ([offer-optimizer.controller.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/offer-optimizer.controller.js)):**
   - Pętla `for (const [fk, fv] of Object.entries(frontFeatures)) updatedFeatures[fk] = fv;` nadpisywała znormalizowaną `Pojemność` surowym tekstem np. `"900 ml"`, nadpisywała `Postać (Etykieta)` z kontretykiety oraz słownikową `Marka`.
   - W `copyBackKeys` brakowało klucza `'Liczba prań (Etykieta)'`.
   - Automapper przy niezapisanym produkcie (`!existingProduct`) lub niebuforowanej kategorii nie uruchamiał się w ogóle.
3. **Ryzyko równoległych wywołań Przód + Tył:** przycisk `Skanuj Front` i `Skanuj Tył` nie blokowały się wzajemnie przed równoczesnym uruchomieniem z poziomu jednego okna.

## 2. Decyzja architektoniczna

1. **Bezstratny merge cech frontowych po stronie backendu ([label-truth.helpers.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/services/label-truth.helpers.js)):**
   - Dodano `sanitizeClientCurrentFeatures(rawFeatures)`: bezpiecznie usuwa ciężkie `data:image` i klucze zdjęć przed wysłaniem stanu formularza do backendu.
   - Dodano `mergeFrontScanFeaturesSafely(existingFeatures, frontFeatures)`:
     - nigdy nie nadpisuje autorytatywnych kluczy kontretykiety (`Skład/INCI`, `Ostrzeżenia`, `Ostrzeżenia (Etykieta)`, `Sposób użycia`, `Sposób użycia (Etykieta)`, `Pojemność nakrętki (Etykieta)`, `Piktogramy CLP (Etykieta)`, `Nazwa produktu (Kontretykieta)`, `Przeznaczenie (Etykieta)`, `Wyróżniki / Certyfikaty (Etykieta)`, `Kraj pochodzenia (Etykieta)`, `Opakowanie (Etykieta)`, `Liczba sztuk (Etykieta)`, `Liczba prań (Etykieta)`, `pH (Etykieta)`, `Producent`);
     - zachowuje `Postać (Etykieta)` z kontretykiety i zapisuje odczyt frontu do `Postać (Front)`;
     - nie nadpisuje znormalizowanej słownikowo `Marka` ani przeliczonej `Pojemność`/`Waga` surową wartością frontową (surowy zapis pozostaje w `Pojemność / Waga`).

2. **Jawny kontrakt delty w `extract-labels` ([offer-optimizer.controller.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/offer-optimizer.controller.js)):**
   - Endpointy `/extract-labels` i `/extract-back-label` przyjmują opcjonalne `currentFeatures`, `allegroCategoryId` i `productName`, łącząc zapis z DB z bieżącymi polami tekstowymi formularza.
   - Dodano `'Liczba prań (Etykieta)'` do `copyBackKeys`, włączono pobieranie schematu przez `AllegroService.getCategoryParametersFull` (działa również dla niezapisanych produktów i nowych kategorii typu `260130`) oraz zwrócono jawne pola odpowiedzi: `mode`, `appliedFeatures` (dokładna delta zmienionych/odczytanych pól) i `removedKeys` (wyłącznie klucze świadomie usunięte w tym przebiegu).

3. **Bezstratne scalanie delty i blokada współbieżnych skanów w UI ([allegroParamFormatter.js](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/utils/allegroParamFormatter.js), [UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx)):**
   - Dodano `stripHeavyImagesFromFeatures` oraz `mergeLabelExtractionResponseIntoFeatures`: punktem startowym jest zawsze bieżący `prev.features` formularza, usuwane są wyłącznie jawne `removedKeys` z ochroną pól kontretykiety przy `mode === 'front'`, nakładane są `appliedFeatures` i `autoMappedParams`, a całość kończy `syncFeaturesFromLabelTruth` + `normalizeFeaturesForAllegroSchema`.
   - `labelOcrDiagnostics` aktualizuje się wyłącznie przy `mode !== 'front'`, a wszystkie przyciski skanowania (`Skanuj Front`, `Skanuj Tył`, `Odczytaj z tyłu opakowania (AI)`, `Skanuj Przód + Tył`) posiadają wspólną blokadę równoległego uruchomienia.

## 3. Weryfikacja
- `node --check` na `label-truth.helpers.js`, `offer-optimizer.controller.js`, `allegroParamFormatter.js` — **PASS (`exit 0`)**.
- `node --test src/modules/offer-optimizer-v2/tests/*.test.js` — **`385/385 PASS`** (`fail: 0`, `cancelled: 0`, `skipped: 0`), w tym nowa suita [label.front.back.lossless.merge.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/label.front.back.lossless.merge.test.js).
- ESLint (`frontend/`): `allegroParamFormatter.js` — **`0` błędów**; `UnifiedProductPipelineView.jsx` — **`0` nowych błędów** (`17` wcześniejszych na nietkniętych liniach `70..2168`).
- `npm --prefix frontend run build` (`vite build`) — **PASS** (`4.04s`).
