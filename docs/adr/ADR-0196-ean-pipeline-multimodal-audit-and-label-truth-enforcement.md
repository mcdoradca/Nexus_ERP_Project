# ADR-0196: Multimodalny Audyt Etykiet (A11/A10) i Deterministyczna Prawdopodobność Prawdy Produktowej w EAN Pipeline

- **Status:** Accepted
- **Data:** 2026-11-23
- **Moduł:** `offer-optimizer-v2` (EAN Pipeline, Vision OCR A0, Silniki Deterministyczne, Walidatory V10, Audyt A11/A10)

## Kontekst i Analiza Przyczyn Źródłowych (RCA — case `Viakal EAN 8700216405348`)
Analiza produkcyjnego opisu dla produktu `Viakal odkamieniacz bagno expres fi 470 ml` (SKU `0000010269`) wykazała 5 systemowych luk w potoku:
1. **Ślepy audyt tekstowy (A11 / A10 bez zdjęć):** `ai.wrapper.js` przyjmował wyłącznie pojedyncze pole `image`, a orkiestrator przekazywał do Agenta 11 i Agenta 10 wyłącznie tekstowy JSON bez zdjęć przodu i tyłu etykiety, przez co audytorzy nie widzieli nadruków `SENZA RISCIACQUO`, `VIaKAL BAGNO EXPRESS FIORI DI PRIMAVERA` ani piktogramu `GHS07`.
2. **Wyciek brudnej nazwy ERP:** `FRONT_VISION_PROMPT` nie wydobywał kanonicznej nazwy produktu, linii i wariantu, przez co surowy tytuł hurtowy (`expres`, małe litery, ucięty skrót `fi`) trafiał do FAQ (`s2`) i specyfikacji (`s5`).
3. **Sprzeczność `SENZA RISCIACQUO` vs nakaz spłukiwania i utrata wyróżnika w S5:** Brak rozpoznania formuły bez spłukiwania oraz kolizja z pamięcią o innych wariantach sprawiały, że w Kroku 4 (`s4`) nakazywano spłukiwanie wodą sprzeczne z frontem etykiety i FAQ (`s2`), a wyróżnik `Bez spłukiwania` nie był wymuszany w `s5`.
4. **Fałsz chemiczny przy `Parfum` i alergenie `Hexyl Cinnamal`:** Słownik `inci_mechanisms_pl.json`, `deterministic-pipeline.engine.js` oraz prompt A4/A11 przypisywały zwykłej kompozycji zapachowej (`Parfum`) i alergenowi z Rozp. WE 648/2004 chemiczne „neutralizowanie woni wilgoci”.
5. **Ucięte ostrzeżenia CLP i halucynowane `P280` w Sekcji 6:** Odczyt kontretykiety nie rejestrował `clp_pictograms` (`GHS07`), jednowierszowe ostrzeżenia były ucinane po pierwszym kodzie przez parser w `gpsr.safety.service.js` (tracąc zdania o wdychaniu rozpylonej cieczy i niemieszaniu z wybielaczami), a przy łagodnym `H319` bez deklaracji na etykiecie dochodziło do dopisywania `P280` / rękawic.

## Podjęta Decyzja (Wariant 2 — Zaakceptowany)
1. **Multimodalne `images[]` i przekazywanie zdjęć Front+Tył do A11/A10:**
   - Rozszerzono `ai.wrapper.js` o tablicę `images` z zachowaniem wstecznej kompatybilności `image`, maskowaniem base64 w logach (`sanitizeContentsForLog`) i zachowaniem obrazów przy retry `RECITATION` (`appendTextToContents`).
   - Rozszerzono `orchestrator.js` o prywatne bufory `_frontImageAsset` / `_backImageAsset` (poza serializowanym `this.state`) oraz metodę `_resolveAuditImages(product, pimData)`, przekazującą oba zdjęcia z rolami do `callAgentWithTelemetry` dla Agenta 11 i Agenta 10.
2. **Wariant 2 (Zachowanie izolacji Sekcji 6 CLP/GPSR):**
   - Sekcja 6 (`section_6_html` / `sekcja6`) **pozostaje wykluczona** z publicznego opisu oferty (`final_offer.description_extra4` oraz eksportu BaseLinker w `baselinker.export.service.js`).
   - Jednocześnie podniesiono wierność samej Sekcji 6 w `gpsr.safety.service.js`, `deterministic-pipeline.engine.js` i `vision-extractor.service.js`: obsługa piktogramów `GHS01–GHS09` (`Piktogram zagrożenia – GHS0x (...)`), bezpieczne rozbijanie wielozdaniowych ostrzeżeń ze zachowaniem skrótów (`splitWarningSentencesPreservingAbbreviations`), zachowanie ostrzeżeń po `P305+P351` oraz blokada halucynowania `P280`/rękawic przy łagodnych produktach bez deklaracji na etykiecie.
3. **Prawda etykietowa i czystość logiczna bez cykli `require()`:**
   - Wydzielono czyste helpery `src/modules/offer-optimizer-v2/services/label-truth.helpers.js` (`isNoRinseFormula`, `hasDeclaredOdorNeutralizer`, `detectRawCatalogNameLeak`), zrywając cykl zależności między `validators/index.js` a `deterministic-pipeline.engine.js`.
   - Dodano `resolveCanonicalProductName` w silniku deterministycznym oraz `resolveCanonicalNameForProduct` w orkiestratorze (naprawa `expres -> Express`, eliminacja uciętych prefiksów typu `fi`, priorytet oficjalnej nazwy z frontu).
   - Zaktualizowano `google-suggest-faq.service.js`, `inci_mechanisms_pl.json`, `deterministic-pipeline.engine.js` (uczciwy opis `Parfum` + `Hexyl Cinnamal`, zachowanie `Bez spłukiwania` w S5, no-rinse FAQ Q3).
   - Dodano walidatory **Checks 24–28** w `validators/index.js` (`validate_domain_and_chemical_logic`) wykrywające sprzeczność spłukiwania z etykietą, brak `Bez spłukiwania` w S5, konflikt wewnętrzny FAQ vs S4, fałszywą neutralizację zapachów przez `Parfum`/alergeny, wyciek surowej nazwy ERP oraz brak zadeklarowanego piktogramu `GHS0x` w Sekcji 6.
   - Zaktualizowano prompty źródłowe `Agent_4/6/10/11_prompt_v4.md` i zrekompilowano pliki `prompts/Agent_*_compiled.md`.

## Weryfikacja
- Kompilacja promptów: `node src/modules/offer-optimizer-v2/prompt-compiler.js` — PASS (10 agentów).
- Pełny zestaw testów regresyjnych: `node --test src/modules/offer-optimizer-v2/tests/*.test.js` — **`350/350 PASS`** (`# fail 0`), w tym nowa suita [label.truth.and.multimodal.audit.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/label.truth.and.multimodal.audit.test.js), bez ostrzeżeń o cyklach zależności.
