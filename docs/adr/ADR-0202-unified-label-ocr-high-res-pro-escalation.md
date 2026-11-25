# ADR-0202: Ujednolicony Skaner Etykiet Przód + Tył (MEDIA_RESOLUTION_HIGH, Sharp ROI Zoom-Crops, Auto-Eskalacja Flash -> Pro, Zero-Guessing OCR)

- **Status:** Wdrożono i zweryfikowano testami (`377/377 PASS`, ESLint `0` nowych błędów, `vite build` PASS)
- **Data:** 2026-11-25
- **Powiązania:** ADR-0196, ADR-0198, ADR-0201

## 1. Kontekst i analiza problemu
Analiza pikseli zdjęcia produkcyjnego *Soft Detersivo Total Black 2250 ml* (`800×800 px`, `41 KB`) ujawniła, że sama tabela `CONSIGLI D'USO` zajmowała na nim ~`118×50 px` (wysokość cyfr ~4–5 px), a dodatkowe czynniki w potoku OCR i promptach powodowały fałszywe odczyty mimo walidacji ADR-0201:

1. **Brak `MEDIA_RESOLUTION_HIGH` i wycinków ROI:** Cały packshot ze sporym białym tłem trafiał w obniżonym próbkowaniu do `gemini-3.8-flash` (razem z frontem), przez co cyfry przy nakrętce (`= 50 ml`) i w komórkach tabeli zlewały się (np. `50` → `75`, `35` → `30`, `45` → `40`, `70` → `65`, `105` → `120`).
2. **Efekt „różowego słonia” i podpowiadana kotwica:** Zakazy w prompcie wymieniające `75 ml` oraz podpowiedź `= ok. 45 ml` w `frontContextNote` sprawiły, że przy nieczytelnych cyfrach model wstawił `45 ml` na środek tabeli, a pozostałe komórki i `1 nakrętka = 75 ml` zsyntetyzował z pamięci, omijając post-hoc kontrolę matematyczną.
3. **Brak oceny czytelności i auto-eskalacji:** Skaner nie raportował niskiej rozdzielczości/nieczytelności (`LOW_UNREADABLE`) i nie eskalował niepewnych przypadków do mocniejszego modelu multimodalnego.
4. **Ucinanie tabeli oraz halucynacja pH w Sekcji 4:** Agent 6 pomijał wodę miękką i twardą z tabeli oraz dopisywał nieobecny na etykiecie `"odczyn alkaliczny"`.
5. **Rozdzielony skan Przód vs Tył w UI:** Operator wgrywał osobno zdjęcie tyłu i dopiero przy uruchomieniu pełnego potoku odbywał się odczyt frontu — brakowało wspólnego kroku pre-skanu front + tył przed startem potoku.

## 2. Decyzja architektoniczna

1. **Wysoka rozdzielczość multimodalna i węzeł eskalacji (`nodes.config.js`, `ai.wrapper.js`):**
   - Węzeł `0` (`gemini-3.8-flash`, `ThinkingLevel.LOW`) otrzymał `MediaResolution.MEDIA_RESOLUTION_HIGH`.
   - Dodano węzeł eskalacyjny `'0_pro'` (`gemini-3.1-pro-preview`, `ThinkingLevel.MEDIUM`, `MediaResolution.MEDIA_RESOLUTION_HIGH`).
   - W `ai.wrapper.js` (`callAgentWithTelemetry`) wdrożono przekazywanie `config.mediaResolution` przy wywołaniach z obrazami oraz defensywny fallback dla `400 INVALID_ARGUMENT` na wypadek nieobsługiwanego pola przez konkretny endpoint modelu.

2. **Przycinanie marginesów, powiększone wycinki ROI i polityka Zero-Guessing (`vision-extractor.service.js`):**
   - Dodano funkcje `prepareFrontLabelImage` oraz `prepareBackLabelImageSet` oparte na `sharp` (przycięcie białych marginesów `trim`, strefa główna kontretykiety powiększona `Lanczos3` ≥ `1400 px` oraz powiększenie dolnej strefy tabeli dozowania i ikony nakrętki ≥ `1600 px` + lekkie wyostrzenie `sharpen`; z bezpiecznym fallbackiem dla miniaturowych obrazów/testów `<160 px`).
   - Z `BACK_PACK_INCI_PROMPT` oraz `frontContextNote` usunięto wszelkie przykładowe liczby (`75 ml`, `68 ml`, `60 ml`, `45 ml`, wyliczenia kotwicy). Dodano jawne pola schematu: `dosage_table_legibility` (`HIGH | MEDIUM | LOW_UNREADABLE | NOT_PRESENT`), `cap_capacity_legible` (`boolean`) oraz `unreadable_fields`.
   - W `extractInciFromBackPack` wdrożono sekwencję: najpierw `agentId: "0"` (`gemini-3.8-flash` + pełne ujęcie + zbliżenie tabeli), a przy `LOW_UNREADABLE`, `cap_capacity_legible === false`, rozbieżności matematycznej `validateDosageYieldMath` lub niskiej rozdzielczości źródłowej (`<1000 px`) z `MEDIUM` — automatyczną eskalację do `agentId: "0_pro"` (`gemini-3.1-pro-preview`) z pełnym zestawem zbliżeń ROI.
   - Gdy po eskalacji objętość nakrętki jest nieczytelna (`cap_capacity_legible === false`), system usuwa niezweryfikowaną wartość nakrętki z cech i instrukcji użycia; gdy tabela pozostaje `LOW_UNREADABLE` i nie przechodzi kontroli matematycznej, nie zapisuje zmyślonych dawek do PIM i zwraca jawny alert `ocrQualityWarning` (`Ostrzeżenie OCR (Etykieta)`).

3. **Ujednolicony endpoint Przód + Tył, re-użycie w Orchestratorze i ochrona kluczy (`offer-optimizer.routes.js`, `offer-optimizer.controller.js`, `orchestrator.js`, `baselinker.export.service.js`, `deterministic-pipeline.engine.js`, `vonhalsky_mapper.js`, `workspaceContentProfile.service.js`):**
   - Dodano `POST /api/offer-optimizer/extract-labels` (współdzielony z `extractBackLabel`), który skanuje sekwencyjnie **Front** (odczyt `Nazwa produktu (Etykieta Front)`, `Postać`, `Pojemność`, `Wydajność`, `Zapach`), przekazuje ten kontekst natychmiast do skanu **Tyłu**, uruchamia `resolveLabelPhysicalForm` i automapper parametrów Allegro oraz zapisuje wynik + znacznik `_labelsPreScannedAt`.
   - `Orchestrator` respektuje `'Zdjęcie frontu opakowania'` i pomija duplikujące wywołanie `A0` przy świeżym pre-skanie `_labelsPreScannedAt` bez ostrzeżeń OCR, a wszystkie wewnętrzne klucze obrazów i diagnostyki OCR odfiltrowano przed eksportem do BaseLinkera, Von Halsky'ego i promptów AI.

4. **Podwójny slot skanera etykiet w UI (`frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`):**
   - Obok slotu `Zdjęcie tyłu opakowania` dodano slot `Zdjęcie frontu etykiety`, podniesiono kompresję uploadu do `2400 px` (`JPEG 0.94`), dodano wspólny przycisk **`Skanuj Przód + Tył (AI SSOT)`** oraz baner `labelOcrDiagnostics` informujący o użytym modelu (Flash/Pro), rozdzielczości zdjęcia i ewentualnym wymogu ostrzejszego zdjęcia.

5. **Prompty i Walidator Check 34 (`Agent_{6,10,11}_prompt_v4.md`, `validators/index.js`):**
   - Zakazano obcinania twardości wody (`miękka/średnia/twarda`) w Kroku 2 oraz halucynowania `"odczynu alkalicznego"` / pojemności nakrętki bez oparcia w etykiecie.
   - Dodano kontrolę **34** w `validate_domain_and_chemical_logic` blokującą niepotwierdzone deklaracje `"odczynu alkalicznego"` / `"zasadowego pH"`.

## 3. Weryfikacja
- `node src/modules/offer-optimizer-v2/prompt-compiler.js` — PASS (`3998` polskich diakrytyków, `0` błędów).
- `node --check` na wszystkich zmodyfikowanych i nowych plikach backendowych `.js` — PASS.
- `node --test src/modules/offer-optimizer-v2/tests/*.test.js` — **`377/377 PASS`** (`fail: 0`, `cancelled: 0`, `skipped: 0`).
- `npm --prefix frontend run build` (`vite build`) — **PASS** (`7.33s`).
- `npx eslint src/views/OfferOptimizer/UnifiedProductPipelineView.jsx` — **`0` nowych błędów** (`18` wcześniejszych na nietkniętych liniach `63..2128`).
