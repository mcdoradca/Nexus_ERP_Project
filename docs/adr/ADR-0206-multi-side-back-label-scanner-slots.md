# ADR-0206: Rozszerzenie Skanera Tyłu Opakowania o 2 Dodatkowe Sloty Boczne (`Tył` + `Bok 1` + `Bok 2`)

- **Status:** Wdrożono i zweryfikowano testami (`387/387 PASS`, ESLint `0` nowych błędów, `vite build` PASS `13.82s`)
- **Data:** 2026-11-27
- **Powiązania:** ADR-0202, ADR-0203, ADR-0205

## 1. Kontekst i analiza problemu
Opakowania kartonowe (np. proszki do prania) mają kluczowe informacje rozłożone na trzech ściankach poza frontem: tył (np. tabela dozowania) oraz lewy i prawy bok (np. skład INCI / WE 648/2004, ostrzeżenia CLP, dane producenta). Dotychczasowy skaner etykiet i orkiestrator V2 obsługiwały tylko jeden slot tylny (`Zdjęcie tyłu opakowania`), co uniemożliwiało równoczesne wgranie i holistyczny odczyt wielościennych kartonów bez utraty danych.

## 2. Decyzja architektoniczna

1. **Kanoniczne klucze 3 slotów tylnych/bocznych i wspólne helpery SSOT ([label-truth.helpers.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/services/label-truth.helpers.js)):**
   - Zdefiniowano `BACK_LABEL_IMAGE_KEYS = ['Zdjęcie tyłu opakowania', 'Zdjęcie tyłu opakowania 2', 'Zdjęcie tyłu opakowania 3']`, `BACK_LABEL_LEGACY_ALIAS_KEYS = ['_backImageUrl', '_backImageUrl2', '_backImageUrl3']` (przechowywane w istniejącym JSON `product.features` bez zmian schematu DB), `isInternalLabelImageKey`, `extractBackLabelSlotsFromFeatures` i `collectBackLabelImagesFromFeatures`.
   - Rozszerzono `FRONT_PROTECTED_BACK_KEYS`, `sanitizeClientCurrentFeatures`, `hasVerifiedLabelMarkers`, `extractLabelEvidenceSubsets`, `isProtectedLabelTechnicalKey` oraz `mergeFeaturesWithLabelPrecedence` o wszystkie 3 sloty tylne/boczne, chroniąc je przed nadpisaniem przy skanie samego frontu (`ADR-0205`).

2. **Holistyczny OCR wielościenny i ochrona limitu payloadu ([vision-extractor.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/vision-extractor.service.js)):**
   - Rozszerzono `BACK_PACK_INCI_PROMPT` o analizę łączną 1–3 ścianek opakowania oraz wyodrębniono współdzielone helpery (`capMultimodalImagePayload`, `evaluateBackPackEscalationReasons`, `mergeProEscalationResult`, `sumTokenUsage`, `buildBackPackParsedOutput`).
   - W `extractInciFromBackPack(..., { combineAllImages: true })` wszystkie aktywne zdjęcia (1–3 ścianki + zbliżenia ROI Sharp) trafiają **łącznie w jednym wywołaniu multimodalnym** do Agenta `0` (`gemini-3.8-flash`) oraz ewentualnej auto-eskalacji `0_pro` (`gemini-3.1-pro-preview`), z twardym budżetem payloadu `14 MB` base64 gwarantującym obecność wszystkich pełnych kadrów ścianek.
   - Rozszerzono `ocrDiagnostics` o `imagesAnalyzedCount` oraz `sideResolutions`, a wynik o `capturedImages` i `imageUrls` (z zachowaniem pełnej kompatybilności wstecznej `capturedImage` / `imageUrl`).

3. **Kontroler, Orkiestrator V2 i higiena eksportów:**
   - [offer-optimizer.controller.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/offer-optimizer.controller.js): `runUnifiedLabelExtraction`, `extractLabels` i `extractBackLabel` akceptują `backImageSlots` i `backImageUrls` (obok dotychczasowego `backImageUrl`), zapisują aktywne sloty, usuwają wyczyszczone sloty przez `removedKeys` i przekazują `backImageUrls` w `triggerUltimatePipeline` oraz `preservedInternalImages` przy eksporcie BaseLinker.
   - [orchestrator.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/orchestrator.js): używa `collectBackLabelImagesFromFeatures` z trybem `combineAllImages: true` dla wielu dedykowanych zdjęć tyłu/boków oraz przekazuje wszystkie aktywne ścianki do audytu multimodalnego A11/A10 (`_resolveAuditImages`, `this._backImageAssets`).
   - Zaktualizowano czarne listy kluczy technicznych w [baselinker.export.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/baselinker.export.service.js), [deterministic-pipeline.engine.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/services/deterministic-pipeline.engine.js), [workspaceContentProfile.service.js](file:///z:/Nexus_ERP_Project/src/services/workspaceContentProfile.service.js) i [vonhalsky_mapper.js](file:///z:/Nexus_ERP_Project/src/utils/vonhalsky_mapper.js).

4. **UI 1 Front + 3 Sloty Tył/Boki ([allegroParamFormatter.js](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/utils/allegroParamFormatter.js), [UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx)):**
   - Dodano `BACK_LABEL_SLOT_KEYS`, `getBackLabelSlotsFromFeatures`, ochronę wszystkich 3 slotów w `stripHeavyImagesFromFeatures`, `mergeLabelExtractionResponseIntoFeatures` (`overrideBackSlots`) oraz autosave `localStorage` i `HIDDEN_IMAGE_KEYS` w karcie PIM.
   - W panelu tyłu opakowania dodano siatkę 3 równych slotów (`Tył`, `Bok 1`, `Bok 2`) z obsługą multi-wyboru plików (1–3 naraz), indywidualnego czyszczenia/podmiany i wspólnego skanowania wszystkich wgranych ścianek (`Skanuj Tył i boki (N/3)` / `Skanuj Przód + Tył i boki (AI SSOT)`).

## 3. Weryfikacja
- `node --check` na wszystkich 10 zmodyfikowanych plikach `.js` — **PASS (`exit 0`)**.
- `node --test src/modules/offer-optimizer-v2/tests/*.test.js` — **`387/387 PASS`** (`fail: 0`, `cancelled: 0`, `skipped: 0`), w tym nowe testy w [vision_extractor.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/vision_extractor.test.js) i [label.front.back.lossless.merge.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/label.front.back.lossless.merge.test.js).
- ESLint (`frontend/`): `allegroParamFormatter.js` — **`0` błędów**; `UnifiedProductPipelineView.jsx` — **`0` nowych błędów** (`17` wcześniejszych na nietkniętych liniach `72..2201`).
- `npm --prefix frontend run build` (`vite build`) — **PASS** (`13.82s`).
