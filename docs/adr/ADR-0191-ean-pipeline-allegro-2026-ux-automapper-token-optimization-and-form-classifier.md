# ADR-0191: Aktualizacja EAN Pipeline pod Allegro 2026 UX/Compliance, Auto-Parametryzację z Etykiet, Klasyfikator Postaci Fizycznej oraz Optymalizację Tokenów i Promptów

- **Status:** Wdrożony i zweryfikowany lokalnie (bez `git commit` / `git push`)
- **Data:** 2026-11-21
- **Zakres:** `src/modules/offer-optimizer-v2/*`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `src/modules/offer-optimizer/ai.service.js`, `src/server.js`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`

## Kontekst i zdiagnozowane problemy
1. **Nowy zwijany widok opisu Allegro 2026 i Załącznik nr 2:** W nowym widoku oferty przed przyciskiem „Rozwiń opis” widoczna jest wyłącznie górna część Sekcji 1. Dodatkowo domyślna `sekcja7` w `UnifiedProductPipelineView.jsx` (6 zduplikowanych miejsc) zawierała obietnice logistyczne i informacje „O sprzedającym” naruszające Załącznik nr 2 Regulaminu Allegro.
2. **Brak deterministycznego auto-uzupełniania parametrów z etykiet:** `POST /api/products/:id/autofill-params` w `src/server.js:786` przekazywał błędne argumenty do nieobecnej funkcji w `ai.service.js`, a Vision Front/Back OCR nie wypełniał deterministycznie wymaganych pól schematu kategorii Allegro (w tym konwersji jednostek i walidacji słowników) ani po ekstrakcji tylnej etykiety, ani w `Orchestrator` `RUN_EXTRACT`.
3. **Błędne klasyfikacje fizykochemiczne i halucynacje domenowe:**
   - Kosmetyki ciekłe z nutą talku w nazwie (np. *Dermomed Talco e Iris Mydło w płynie*) bywały traktowane jak suchy talk bezwodny (usuwanie `pH` z Sekcji 5 i zły klucz FAQ), podobnie żele z dodatkiem olejów (np. *Prunus Amygdalus Dulcis Oil*) mimo bazy wodnej `Aqua`.
   - Stałe tabletki chlorowe dziedziczyły instrukcje przechowywania „w pozycji pionowej” właściwe dla płynnego podchlorynu sodu.
   - Zabetonowane słowo `żel` w szablonie FAQ łazienkowego dla sprayów/płynów, literówka `"soothing_ astringent"` oraz wycieki międzykategorialne (kuchnia/naczynia/piekarnik) w `inci_mechanisms_pl.json`, stopword `gwarantuje` w deterministycznym fallbacku S3, a także niższy priorytet `features['Postać']` operatora względem surowego OCR w `buildDeterministicSection5`.
4. **Marnowanie tokenów i niespójności między agentami:**
   - `agent6Data.a2` pobierał nieistniejące klucze zamiast `sentiment_available`, `average_rating`, `social_proof_matrix` i `safety_signals_detected` zwracanych przez A2.
   - Schemat wyjściowy A6 zawsze żądał wszystkich 6 sekcji mimo deterministycznego nadpisywania S3/S5/S6 przez Orkiestrator.
   - A1 ładował surowy `docs/Agent_1_prompt_v4.md` zamiast skompilowanego promptu, a jego regex GPSR `(?=4\. CLP \(Klasyfikacja)` nigdy nie dopasowywał nagłówka `4. CLP ...` i dopisywał sprzeczny blok zastępczy.
   - A10 Pro (`gemini-3.1-pro` + thinking MEDIUM) uruchamiał się bezwarunkowo nawet po czystym audycie A11 Flash i deterministycznym pre-audycie.
   - `ai.wrapper.js` nie oddzielał statycznego prefiksu `systemInstruction` pod automatyczny Prefix Caching Gemini, a ponowienia RECITATION używały leksykalnej zmiennej `config` zamiast `activeConfig`.

## Decyzje i wdrożone zmiany
### 1. Baza wiedzy RAG i zgodność Allegro 2026
- Utworzono `src/modules/offer-optimizer-v2/docs/ALLEGRO_2026_COMPLIANCE_AND_UX_SSOT.md` (`SOT_01_UX_2026`) oraz zaktualizowano `src/modules/offer-optimizer-v2/docs/RAG_SOT_01_Allegro_Marketplace_2026.md` (`SOT_01`) o wytyczne Allegro 2026 (zwijany opis Above-the-Fold, Załącznik nr 2, KPA parity, `composition` vs WE 648/2004, CLP 2024/2865 art. 48a, `aiCoCreatedContent`).
- Rozszerzono `src/modules/offer-optimizer-v2/scripts/ingest.js` o obsługę flagi `--only=` i nowego dokumentu `ALLEGRO_2026_COMPLIANCE_AND_UX_SSOT.md`. Zaindeksowano oba dokumenty do pgvector (`RAG_SOT_01_Allegro_Marketplace_2026@v2026-11-21` — 4 chunki, pokrycie 99.92%; `ALLEGRO_2026_COMPLIANCE_AND_UX_SSOT@v2026-11-21` — 5 chunków, pokrycie 99.74%) i zweryfikowano żywe wyszukiwanie `searchKnowledge`.
- Dodano walidator `validate_section1_above_the_fold` w `src/modules/offer-optimizer-v2/validators/index.js` (nagłówek z ⭐, lead `<= 280` zn. z `<b>`, lista korzyści, blokada obietnic logistycznych/sprzedawcy i stop-words z §A/Załącznika nr 2).
- Zastąpiono 6 duplikatów obiecujących wysyłkę w `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx` jedną stałą `DEFAULT_SEKCJA_7` wolną od roszczeń wysyłkowych i danych o sprzedającym.

### 2. Auto-parametryzacja z opakowania i naprawa `autofill-params`
- Utworzono `src/modules/offer-optimizer-v2/services/allegro-param-automapper.service.js` (`mapPackagingFeaturesToAllegroSchema`, `matchDictionaryOption`, `parseQuantityToUnit`):
  - Nigdy nie nadpisuje niepustych wartości wprowadzonych przez operatora.
  - Przelicza jednostki pod schemat kategorii Allegro (`ml <-> l`, `g <-> kg`, liczba sztuk z usunięciem jednostek objętości/masy, ścisły tryb jednostek wydajności dla `Liczba prań`/`Liczba użyć` oraz kontrola `restrictions.min`/`max`).
  - Stosuje blokadę BPR 528/2012 (odrzuca opcje biobójcze/antybakteryjne) oraz cross-check deklaracji „Produkt nie zawiera” względem INCI.
- Rozszerzono Vision Front/Back (`vision-extractor.service.js`) bez dodatkowych wywołań LLM o ekstrakcję `opakowanie_rodzaj`, `liczba_sztuk`, `kraj_produkcji_etykieta`, `country_of_origin`, `packaging_type`, `pieces_count`, `numeric_ph`.
- Podpięto auto-mapper w: (a) `Orchestrator` `RUN_EXTRACT` przed `baselinkerExtract.extractFromFeatures`, (b) `offer-optimizer.controller.js` `extractBackLabel` (zwracając `autoMappedParams` i scaliwszy je na froncie w `handleExtractBackLabel`), oraz (c) hybrydowym `aiService.autofillMissingParameters` + wywołaniu w `src/server.js:786`.
- W `PIPELINE_COMPLETE` (`orchestrator.js` + `UnifiedProductPipelineView.jsx`) usunięto dublowanie kluczy `INCI`/`Skład` na rzecz kanonicznego `Skład/INCI` oraz bezpiecznego scalania `auto_mapped_allegro_params` bez nadpisywania ręcznych wpisów.

### 3. Klasyfikator postaci fizycznej i eliminacja błędów domenowych
- Utworzono współdzielony moduł `src/modules/offer-optimizer-v2/services/product-form.classifier.js` (`classifyProductPhysicalForm`), rozróżniający jednoznacznie ciecze wodne, żele z olejami, zapasy/doypacki, suche pudry bezwodne, artykuły stałe oraz stałe tabletki chlorowe vs płynny podchloryn.
- Podpięto `classifyProductPhysicalForm` w `sanitizeSection5Html` (`orchestrator.js`), `buildDeterministicSection5`, `buildDeterministicSection6` (`deterministic-pipeline.engine.js`), `validate_section5_compliance` (`validators/index.js`) oraz `google-suggest-faq.service.js` (poprawiona kolejność wykrywania mydła w płynie przed talkiem i dynamiczna odmiana `formAccusativePl` zamiast zabetonowanego `żel`).
- Naprawiono `inci_mechanisms_pl.json` (literówka `"soothing_ astringent"`, usunięto kalki kuchenne/piekarnikowe/naczyniowe ze składników ogólnych), wyeliminowano `gwarantuje` z fallbacku S3 oraz dodano współdzielone `buildSection3FromA4Result` w `deterministic-pipeline.engine.js`.

### 4. Optymalizacja tokenów, deduplikacja agentów i Prefix Caching
- Zaktualizowano `SHARED_RULES_v4.1.md`, `prompt-compiler.js`, `Agent_6_prompt_v4.md`, `Agent_10_prompt_v4.md` i `Agent_11_prompt_v4.md`, przechodząc na zwięzłą, zdeduplikowaną architekturę i gwarantując dokładnie jeden blok `--- DANE SKU ---\n{{SKU_DATA}}` na końcu każdego skompilowanego promptu.
- Zmierzone rozmiary skompilowanych promptów (`HEAD` vs stan aktualny):
  - `Agent_6_compiled.md`: `36,194 B` -> `14,571 B` (`-21,623 B`, `-59.7%`)
  - `Agent_10_compiled.md`: `26,124 B` -> `8,757 B` (`-17,367 B`, `-66.5%`)
  - `Agent_11_compiled.md`: `18,469 B` -> `9,557 B` (`-8,912 B`, `-48.3%`)
  - `Agent_1_compiled.md`: `9,425 B` -> `9,396 B` (`-29 B`)
- `ai.wrapper.js`: dodano `splitPromptForCaching` (przekazanie statycznego prefiksu jako `baseConfig.systemInstruction`, usunięcie z Kroku 2 JSON parsera, telemetria `cachedContentTokenCount` oraz naprawa `activeConfig` w retry RECITATION).
- `orchestrator.js`: naprawiono `agent6Data.a2`, wdrożono dynamiczny 3-kluczowy schemat A6 (`section_1_html`, `section_2_html`, `section_4_html`) przy pełnym przebiegu z A4/PIM/GPSR, wydzielono DRY `applyDeterministicSectionSanitizers`, `computeComplianceAuditForSections` i `shouldEscalateToAgent10` (z warunkowym pominięciem A10 Pro jako `SKIPPED_CLEAN` przy czystym A11 z pełnym `product_identity`, oraz bezwarunkową eskalacją przy brakującym `product_identity`, `escalate_to_pro: true`, błędach walidacji, wyrobach medycznych, wysokiej chemii CLP lub ryzykach w surowym wejściu/drafcie).

## Niezmienione gwarancje bezpieczeństwa
- Mechanizm ręcznego eksportu z dwukrotnym potwierdzeniem operatora (BaseLinker, Allegro, InPost Von Halsky + HMAC `exportToken`) pozostał nienaruszony.
- Zero zmian schematu bazy danych (`prisma/schema.prisma`) i zero instalacji nowych zależności npm.

## Weryfikacja
- **Składnia backendu (`node --check` na 14 zmodyfikowanych/nowych plikach `.js`):** `ALL_SYNTAX_OK` (exit `0`).
- **Pełna suita testów backendowych (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`324/324 PASS`** (`0` fail, `0` skipped), w tym nowe testy kontraktowe i regresyjne `src/modules/offer-optimizer-v2/tests/pipeline.quality.audit.test.js` wykonywane bezpośrednio na schematach kategorii `253350`, `253353` i `253359` z lokalnej bazy PostgreSQL.
- **Linter frontendu (`npx eslint src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`):** `0` nowych błędów (zachowane wyłącznie `18` zastanych błędów w nietkniętym kodzie).
- **Build frontendu (`npm --prefix frontend run build`):** `vite build` PASS (`✓ built in 9.27s`, `dist/assets/index-ubiyd-2c.js 2,154.76 kB`).
