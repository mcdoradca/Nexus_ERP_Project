# ADR-0197: Deterministyczna Normalizacja i Konwersja Jednostek Parametrów Liczbowych Allegro

- **Status:** Accepted
- **Data:** 2026-11-24
- **Moduły:** `offer-optimizer-v2`, `offer-optimizer`, `server.js`, `utils/allegro_mapper.js`, `frontend/src/views/OfferOptimizer/`

## Kontekst
W widoku **Katalog Parametrów Allegro** ([UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx)) pola liczbowe (`float` / `integer`), takie jak **POJEMNOŚĆ (L)** czy **WAGA PRODUKTU (KG)**, przyjmowały surowe ciągi z jednostkami lub przecinkami pochodzące z BaseLinkera i AI (np. `"600 Ml"` przy parametrze `(L)` zamiast `"0.6"`, lub `"0,650 kg"` przy `(KG)` zamiast `"0.65"`):
1. [allegro-param-automapper.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/services/allegro-param-automapper.service.js) pomijał istniejące wartości w `features`, nie przeliczając ich pod docelową jednostkę `param.unit` z wybranej kategorii Allegro.
2. Endpointy Auto-Fill i zapisu w [server.js](file:///z:/Nexus_ERP_Project/src/server.js) oraz fallback AI w [ai.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/ai.service.js) zapisywały surowe wartości liczbowe z tekstem jednostek.
3. Formularz PIM na frontendzie nie normalizował wartości po załadowaniu schematu kategorii ani po edycji (`onBlur`) i nie informował operatora przed eksportem do Allegro REST API (gdzie pola liczbowe wymagają wyłącznie czystych liczb bez jednostek).

## Podjęta Decyzja
1. **Backend — jednolity konwerter jednostek (`ml/cl/l`, `mg/g/dag/kg`, `mm/cm/m`, `szt.`):**
   - Dodano funkcje `normalizeUnitToken`, `convertBetweenUnits`, `formatNumericForAllegro`, `normalizeNumericValueForAllegroParam` oraz `normalizeNumericFeaturesForAllegroSchema` w [allegro-param-automapper.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/services/allegro-param-automapper.service.js).
   - Funkcja `mapPackagingFeaturesToAllegroSchema` reformatuje również istniejące zabrudzone parametry `float`/`integer` do czystej liczby w `param.unit` (np. `"600 Ml"` -> `"0.6"`, `"0,650 kg"` -> `"0.65"`), blokując konwersję między niezgodnymi rodzinami fizycznymi (np. `ml` nie może zostać zamienione na `kg`).
   - Dla samotnych liczb bez jednostki (np. `"600"` w `POJEMNOŚĆ (L)`) wnioskowanie `ml -> l` / `g -> kg` zachodzi wyłącznie przy potwierdzeniu w kontekście produktu (`600 ml`) lub przekroczeniu `restrictions.max` kategorii.
   - Zaktualizowano fallback AI w [ai.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/ai.service.js), dodano pomocnik `normalizeFeaturesAgainstCategoryId` w [server.js](file:///z:/Nexus_ERP_Project/src/server.js) (`GET /api/products/autofill/:ean`, `POST /api/products`, `PATCH /api/products/:id`) oraz rozszerzono [allegro_mapper.js](file:///z:/Nexus_ERP_Project/src/utils/allegro_mapper.js) (`convertValueToParameterUnit`) o jednostki `cl`, `mg`, `dag`/`dkg` i bezpieczne formatowanie bez notacji naukowej.
2. **Frontend — identyczna normalizacja w formularzu PIM:**
   - Dodano czysty moduł ESM [allegroParamFormatter.js](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/utils/allegroParamFormatter.js) z funkcjami konwersji i walidacji UI (`validateNumericAllegroParamValue`, `getNumericPlaceholderForParam`).
   - W [UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx) wpięto automatyczną normalizację po wczytaniu schematu/produktu (`useEffect`), po Auto-Fill i komunikatach WebSocket z potoku, przed zapisem PIM oraz na `onBlur` pól liczbowych (bez przerywania pisania w `onChange`). Dodano też wizualny znacznik jednostki (`param.unit`) oraz ostrzeżenie z przyciskiem 1-klik `"Przelicz na ..."`.

## Weryfikacja
- **Składnia JS (`node --check`):** `server.js`, `allegro_mapper.js`, `ai.service.js`, `allegro-param-automapper.service.js` — PASS.
- **Testy backend + parytet frontend (ESM):** [allegro.numeric.unit.normalization.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/allegro.numeric.unit.normalization.test.js) oraz pełna regresja `node --test src/modules/offer-optimizer-v2/tests/*.test.js` — **`353/353 PASS`** (`# fail 0`).
- **Frontend:** `eslint` na `allegroParamFormatter.js` (0 błędów) i `UnifiedProductPipelineView.jsx` (0 błędów w zmienionych liniach; 18 istniejących wcześniej `no-unused-vars` w nietkniętym kodzie) oraz `npm run build` (`vite build`) — **PASS** (`6.94s`).
