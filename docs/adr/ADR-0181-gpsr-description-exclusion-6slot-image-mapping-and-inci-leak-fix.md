# ADR-0181: Wykluczenie GPSR z opisu ofert (Allegro/BaseLinker), przemapowanie 6 modułów ze wszystkimi 6 zdjęciami oraz eliminacja dopisywania składników INCI do GPSR

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-18  
**Moduły:** `src/utils/allegro_mapper.js`, `src/modules/offer-optimizer-v2/baselinker.export.service.js`, `src/modules/offer-optimizer-v2/orchestrator.js`, `src/modules/offer-optimizer-v2/services/gpsr.safety.service.js`, `src/modules/offer-optimizer-v2/services/deterministic-pipeline.engine.js`, `src/modules/offer-optimizer-v2/validators/index.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `src/modules/offer-optimizer-v2/docs/Agent_*_prompt_v4.md` (+ kompilaty `prompts/`), `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`

---

## 1. Kontekst i Zidentyfikowane Problemy

1. **Brakujące zdjęcia w opisie Allegro i GPSR (`sekcja6`) w treści opisu:**
   - `buildAllegroDescriptionSections` w `src/utils/allegro_mapper.js` budował 7 sekcji (`sekcja1..6` ze zdjęciami `0..5` oraz `sekcja7` bez zdjęcia: `imgIdx: -1`). Gdy `sekcja6` była pusta (lub stanowiła dane GPSR przeznaczone do osobnego pola Allegro `safetyInformation`), 6. zdjęcie nie trafiało do opisu aukcji, a `sekcja7` zawsze pozostawała bez zdjęcia.
   - Jednocześnie eksport do BaseLinkera sklejał moduł 5 (`sekcja5`) z modułem 6 (`sekcja6` GPSR) pod polem `description_extra4` (zarówno w `baselinker.export.service.js`, `orchestrator.js` `FINISH`, jak i w `offer-optimizer.controller.js` `exportToBaselinker` tworzącym `product.descriptionHtml`).
2. **Dopisywanie składników INCI na końcu danych GPSR w potoku `ean pipeline`:**
   - Dla kosmetyków `gpsr.safety.service.js` skanował `inci` przeciwko `fragranceAllergens` i doklejał przed `Podmiot odpowiedzialny w UE` punkt `Produkt zawiera kompozycję zapachową z potencjalnymi alergenami (...)`.
   - Dla chemii gospodarczej bez jawnego `EUH208` na etykiecie `gpsr.safety.service.js` syntetyzował `EUH208 – Zawiera [składniki z INCI]...`, a `orchestrator.js` przekazywał do `validate_section6_compliance` flagę `has_sensitizers` liczoną z `extracted_data.inci.value`, co zmuszało węzeł `A10` do łatania `sekcja6` składnikami z INCI.
   - Surowe linie z etykiet (`Zawiera – ...`, `Contains: ...`, `Skład INCI: ...`) lub akapity `<p>` ostrzeżeń omijały czyszczenie w `sanitizeSection6Html` / `buildDeterministicSection6` (m.in. przez warunek uzależniający usunięcie `Zawiera –` od obecności `EUH208` oraz filtrowanie wyłącznie `<li>`).

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Wykluczenie GPSR (`sekcja6`) z opisu ofert Allegro i BaseLinkera
- `offerDraft.htmlContent.sekcja6` jest nadal generowane w potoku i zapisywane w bazie PIM na potrzeby osobnego pola GPSR Allegro (`extractSafetyInformationText` -> `productSet[0].safetyInformation`).
- `buildAllegroDescriptionSections` (`src/utils/allegro_mapper.js`) wyłącza `sekcja6` z sekcji opisu oferty, eksportując wyłącznie 6 modułów opisowych (`sekcja1, sekcja2, sekcja3, sekcja4, sekcja5, sekcja7`).
- `baselinker.export.service.js` (`buildPayload`), `orchestrator.js` (`FINISH`) oraz `offer-optimizer.controller.js` (`exportToBaselinker`) rozdzielają moduły 5 i 6: do `description_extra4` oraz `product.descriptionHtml` trafia wyłącznie `sekcja5` (bez `sekcja6`), a `PIPELINE_COMPLETE.result.editorHtml` przekazuje oddzielnie `sekcja5` i `sekcja6`.

### 2.2. Mapowanie 6 modułów opisu na wszystkie 6 zdjęć (`A/B`: `[IMAGE, TEXT]`)
- `buildAllegroDescriptionSections` (`src/utils/allegro_mapper.js`) oraz `TileSimulator` (`frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`) mapują 6 aktywnych modułów opisu (zawsze zdjęcie po lewej, opis po prawej) do wszystkich 6 zdjęć:
  - Moduł 1 (`sekcja1`) ← Zdjęcie 2 (`imgIdx: 1`)
  - Moduł 2 (`sekcja2`) ← Zdjęcie 3 (`imgIdx: 2`)
  - Moduł 3 (`sekcja3`) ← Zdjęcie 4 (`imgIdx: 3`)
  - Moduł 4 (`sekcja4`) ← Zdjęcie 5 (`imgIdx: 4`)
  - Moduł 5 (`sekcja5`) ← Zdjęcie 6 (`imgIdx: 5`)
  - Moduł 6 (`sekcja6`) ← pominięty w opisie (sekcja GPSR)
  - Moduł 7 (`sekcja7`) ← Zdjęcie 1 (`imgIdx: 0`)
- Zaktualizowano etykiety zakładek edytora w `UnifiedProductPipelineView.jsx`.

### 2.3. Zatrzymanie dopisywania składników INCI do danych GPSR
- W `gpsr.safety.service.js`: usunięto generowanie kosmetycznego ostrzeżenia o alergenach zapachowych z `inci` oraz syntetyczny fallback `EUH208` z `inci` (zachowując `EUH208` wyłącznie wtedy, gdy tylna etykieta producenta `Ostrzeżenia` jawnie zawiera `EUH208`). Wzmocniono `isOrphanClpOrRawIngredientFragment` o wykrywanie `Skład INCI:` / `INCI:` / `Zawiera [:–-]` i syntetycznych linii alergenów z INCI oraz rozszerzono cięcie etykiet w `labelClauses`.
- W `orchestrator.js` (`sanitizeSection6Html` i `RUN_A10`) oraz `deterministic-pipeline.engine.js` (`buildDeterministicSection6`): usunięto wymóg `has_sensitizers` oparty o `inci` (sprawdzane tylko jawne `EUH208` z etykiety/`gpsr_baseline`), rozszerzono bezwarunkowe czyszczenie `Zawiera [:–-]` oraz wycieków INCI także w akapitach `<p>`. Rozbudowano `validate_section6_compliance` w `validators/index.js` oraz zaktualizowano i skompilowano prompty `Agent_5`, `Agent_6`, `Agent_10`, `Agent_11` (`prompt-compiler.js`) i `baselinker_export_agent.md`.

---

## 3. Weryfikacja

- **Kompilacja promptów (`node src/modules/offer-optimizer-v2/prompt-compiler.js`):** 10 agentów skompilowanych (`4578` diakrytyków, `0` błędów).
- **Składnia (`node --check`):** wszystkie zmodyfikowane pliki `.js` — **PASS (`SYNTAX_OK=True`)**.
- **Testy jednostkowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`295/295 PASS`** (`0` fail, `0` skipped — w tym zaktualizowane `allegro.content.export.test.js`, `gpsr.safety.test.js`, `orchestrator.test.js` oraz nowy `baselinker.export.test.js`).
- **Frontend ESLint & Vite Build:**
  - `npx eslint src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`: `0` nowych błędów (`18` zastanych błędów w innych, niemodyfikowanych fragmentach pliku).
  - `npm --prefix frontend run build`: **PASS** (`✓ built in 2.29s`).
- **Nie-mutujący test dry-run na danych z Postgresa (`8054633830741`, `8054633830833`, `8032680398483`):** wszystkie 3 produkty generują `6` sekcji opisu Allegro (`IMAGE+TEXT` z wykorzystaniem wszystkich 6 zdjęć), `extractSafetyInformationText` zachowuje dostęp do `offerDraft.sekcja6`, `description_extra4` BaseLinkera nie zawiera GPSR, a `sanitizeSection6Html` / `gpsrSafetyService` nie dopisują składników INCI ani alergenów na końcu GPSR.
