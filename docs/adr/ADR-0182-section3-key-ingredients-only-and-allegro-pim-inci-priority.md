# ADR-0182: Eliminacja pełnej stopki INCI/648 z Modułu 3 oraz priorytetyzacja Skład/INCI z Karty Technicznej PIM na Allegro

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-18  
**Moduły:** `src/modules/offer-optimizer-v2/normalization.js`, `src/modules/offer-optimizer-v2/services/deterministic-pipeline.engine.js`, `src/modules/offer-optimizer-v2/orchestrator.js`, `src/modules/offer-optimizer-v2/validators/index.js`, `src/modules/offer-optimizer-v2/baselinker.export.service.js`, `src/modules/offer-optimizer-v2/docs/Agent_{4,6,10,11}_prompt_v4.md` (+ kompilaty `prompts/`), `src/utils/allegro_mapper.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`

---

## 1. Kontekst i Zidentyfikowane Problemy

1. **Surowa stopka pełnego składu `Skład INCI: ...` / `Skład (zgodnie z Rozp. WE 648/2004): ...` na dole Modułu 3:**
   - Zarówno `tryBuildDeterministicSection3` w `deterministic-pipeline.engine.js`, jak i krok `RUN_A6` w `orchestrator.js` doklejały na końcu `section_3_html` akapit `<p><b>Skład INCI:</b> ...</p>` (lub `<p><b>Skład (zgodnie z Rozp. WE 648/2004):</b> ...</p>`), a prompty `Agent_6_prompt_v4.md`, `Agent_10_prompt_v4.md` oraz `Agent_11_prompt_v4.md` wprost nakazywały utrzymywanie stopki pełnego składu 1:1 na dole Sekcji 3.
   - Zgodnie z architekturą systemu pełny wykaz INCI jest przechowywany w widoku **„Karta Techniczna i Skład (Parametry PIM)"** (`Skład/INCI`) i stamtąd trafia do odpowiednich pól/parametrów Allegro (`productSet[0].composition` / parametr kategorii), natomiast **Moduł 3** powinien prezentować wyłącznie najważniejsze składniki i mechanizm ich działania (`⚙️`) wraz ze synergiami (`⚡`).
2. **Priorytet i mapowanie `Skład/INCI` z Karty Technicznej PIM do Allegro:**
   - W `extractCleanInciForAllegro` (`src/utils/allegro_mapper.js`) pole `ingredientsInci` (`existingDraft.ingredients_inci`) miało pierwszeństwo przed `features['Skład/INCI']`, przez co ręczna lub OCR-owa aktualizacja w Karcie Technicznej PIM mogła zostać przysłonięta starszą wartością szkicu. Ponadto `resolvePimRawValueForParam` nie zawierało aliasu dla tekstowych parametrów kategorii Allegro o nazwie `Skład` / `Skład INCI`.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Usunięcie stopki pełnego składu z generacji Modułu 3
- `deterministic-pipeline.engine.js` (`tryBuildDeterministicSection3`): usunięto doklejanie `inciFooter` do `section_3_html` (pozostają punkty `⚙️` oraz `⚡`).
- `orchestrator.js` (`RUN_A6`): usunięto wymuszanie/doklejanie akapitu `compFooterHtml` (`<p><b>Skład INCI:</b> ...</p>` / `WE 648/2004`) na końcu `result.section_3_html`.
- `docs/Agent_{4,6,10,11}_prompt_v4.md` (+ kompilacja przez `prompt-compiler.js`): zastąpiono nakazy doklejania pełnej listy INCI na dole Sekcji 3 wyraźnym zakazem — Sekcja 3 opisuje działanie najważniejszych składników, a pełny skład trafia wyłącznie do Karty Technicznej PIM i parametrów Allegro.
- `validators/index.js` (`validate_domain_and_chemical_logic`, reguła 23): wykrywanie niedozwolonego samodzielnego akapitu `<p>` ze stopką `Skład INCI:` / `Skład (zgodnie z Rozp. WE 648/2004):` w `section_3_html`.

### 2.2. Wspólny sanitizer wsteczny (DRY) dla zapisanych szkiców i eksportów
- W `src/modules/offer-optimizer-v2/normalization.js` dodano eksportowany helper `stripRawInciFooterFromSection3(html)` (parsowanie przez `cheerio` wyłącznie samodzielnych akapitów `<p>` spoza `<li>`, usuwanie stopek INCI/648 wraz z ewentualnym separatorem `<br>` przed stopką oraz osieroconych pustych akapitów końcowych `<p><br></p>`, bez naruszania akapitów opisowych i punktów `<li>`).
- Wspólny helper został wpięty w:
  - `orchestrator.js`: `sanitizeSection3Html`, `RUN_A6`, `RUN_A10` oraz `FINISH` (`description_extra2` / `PIPELINE_COMPLETE`),
  - `allegro_mapper.js`: `buildAllegroDescriptionSections` (dla `sekcja3` przed sanityzacją opisu Allegro),
  - `baselinker.export.service.js`: `buildPayload` (`description_extra2`),
  - `offer-optimizer.controller.js`: `analyzeSingle` / ładowanie szkicu, `saveDraft`, `exportToBaselinker` oraz wyjście `triggerUltimatePipeline`.

### 2.3. Mapowanie `Skład/INCI` z Karty Technicznej PIM na Allegro
- `extractCleanInciForAllegro` (`src/utils/allegro_mapper.js`): odwrócono kolejność kandydatów tak, by bieżące wartości z PIM (`features['Skład/INCI']`, `'INCI'`, `'Skład'`, `'skład'`, `'SKŁAD'`) miały priorytet przed `ingredientsInci`, z walidacją każdego kandydata (placehodlery typu `'Koncentrat'` nie blokują fallbacku).
- `resolvePimRawValueForParam`: dla tekstowych (`type === 'string'`) parametrów kategorii Allegro nazwanych `Skład`, `Skład INCI`, `INCI`, `Skład produktu` lub `Składniki` dodano fallback z `normalizedFeatureMap` (`sklad/inci`, `inci`, `sklad`) czyszczony przez `extractCleanInciForAllegro`.

---

## 3. Weryfikacja

- **Kompilacja promptów (`node src/modules/offer-optimizer-v2/prompt-compiler.js`):** 10 agentów skompilowanych (`4657` diakrytyków, `0` błędów).
- **Składnia (`node --check`):** wszystkie zmodyfikowane pliki `.js` — **PASS**.
- **Testy jednostkowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`300/300 PASS`** (`0` fail, `0` skipped — m.in. `baselinker.export.test.js`, `allegro.content.export.test.js`, `allegro.params.export.test.js`, `validators.test.js`).
- **Nie-mutująca weryfikacja dry-run na zapisanych szkicach w bazie PostgreSQL (`8054633830710`, `8054633831663`, `8054633836859`, `8054633830949`, `8054633831168`, `8054633831656`, `8054633831151`, `8054633831670`, `8050999571199`):** `stripRawInciFooterFromSection3`, `buildAllegroDescriptionSections` oraz `baselinkerExportService.buildPayload` czysto wycinają historyczne stopki `Skład INCI:` / `WE 648/2004:` z Modułu 3, zachowując 100% punktów `⚙️`/`⚡` oraz dostarczając pełny skład z PIM do `extractCleanInciForAllegro`.
