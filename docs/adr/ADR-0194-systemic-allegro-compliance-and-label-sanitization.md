# ADR-0194: Systemowa Zgodność z Regulaminem Allegro, Sanityzacja Etykiet OCR i Ochrona Sekcji 6

**Status:** Zaakceptowane i wdrożone  
**Data:** 2026-11-23  
**Zakres:** Offer Optimizer V2 (`Agent 0` Vision OCR, Deterministic Pipeline, Validators, Orchestrator, Prompty V4/Compiled), Eksporty Pre-flight (Allegro REST API, BaseLinker, InPost Von Halsky), Dane Referencyjne INCI

---

## 1. Kontekst i Problem Biznesowy
Mimo wcześniejszej listy twardych wyrazów zakazanych (`stop-words`), opisy i sekcja **Właściwości i wyróżniki** (Moduł 5) nadal generowały zwroty flagowane przez automatyczne boty moderacyjne Allegro (szczególnie widoczne na przykładzie produktu Viakal, EAN `8700216906159`: *„Wysoka skuteczność do Twojej łazienki, Rekomendowany przez Ideal Standard, Format XXL, Technologia zapobiegająca powstawaniu kropel, wysoka skuteczność przeciw kamieniowi, Pomaga zwalczać nieprzyjemne zapachy, Chętnie wybierany produkt na rynku włoskim”*).

Audyt wykazał cztery nakładające się przyczyny źródłowe:
1. **`Agent 0` Vision OCR (`vision-extractor.service.js`):** prompty `FRONT_VISION_PROMPT` oraz `BACK_PACK_INCI_PROMPT` wprost prosiły o wyciąganie haseł marketingowych z opakowania; dodatkowo wcześniejsze czyszczenie fragmentu `"N°1"` zostawiało osierocone `"In Italia"`, zanim zadziałał filtr wyróżników.
2. **Wadliwe zamiany w `sanitizeHtmlClaimsAndStopwords` (`deterministic-pipeline.engine.js`):** zastępowanie fraz typu `Nr 1` / `rewelacja` / `super cena` frazami `"wysoka skuteczność"` oraz `"wysoka wydajność"` samo wstrzykiwało slogany sprzedażowe (m.in. *"Wysoka skuteczność do Twojej łazienki"*), a `cleanFeaturesForPrompt` i `buildDeterministicSection5` przepuszczały surowe historyczne pola `Wyróżniki*` / `Cechy dodatkowe` z bazy do promptów LLM i HTML.
3. **Brak detekcji ryzyk pośrednich (implicit risks) w walidatorach i eskalacji:** `validators/index.js` oraz `orchestrator.js` nie wykrywały rekomendacji obcych marek (`Rekomendowany przez Ideal Standard`), rankingów popularności (`Chętnie wybierany...`), promocji gabarytowych (`Format XXL`), niezweryfikowanych haseł technologicznych (`Technologia...`), zwrotów w 2. osobie (`do Twojej łazienki`), agresywnej semantyki (`zwalczać`, `błyskawicznie` poza Sekcją 6) ani niezweryfikowanego greenwashingu, przez co opisy kończyły jako `SKIPPED_CLEAN`.
4. **Brak wspólnego źródła prawdy (SSOT) i ostrzeżeń przed eksportem:** logika sanityzacji była rozproszona, a eksportery Allegro, BaseLinker i Von Halsky nie prezentowały spójnego audytu ryzyk przed wysyłką.

Zgodnie z decyzją właściciela produktu istniejące historyczne rekordy w PostgreSQL pozostawiono bez zmian (bez masowej migracji czyszczącej w DB).

---

## 2. Podjęta Decyzja Architektoniczna

### 2.1. Centralne Źródło Prawdy Polityki Zgodności (`src/modules/offer-optimizer-v2/services/allegro-compliance.policy.js`)
Utworzono jeden moduł SSOT definiujący:
- **`COMPLIANCE_RISK_CATEGORIES`** (8 kategorii ryzyk regulaminowych i algorytmicznych Allegro),
- **`scanStrictStopwords`**, **`scanAllegroComplianceRisks`**, **`normalizeHighlightItem`**, **`sanitizeLabelHighlights`**, **`sanitizeAllegroMarketingText`**, **`auditOfferDraftCompliance`**.
- Dopasowania używają granic opartych o Unicode lookaround `(?<![a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ0-9])` zamiast standardowego `\b` JS (który zawodzi na polskich znakach diakrytycznych).
- Przy `isMedicalDevice: true` oznaczenie `CE` (długość 2) omija filtr długości `< 3`.
- **Izolacja Sekcji 6 (Ostrzeżenia CLP/GPSR) i marek/cech fizycznych:** `auditOfferDraftCompliance` i sanitizery przy `isSafetySection === true` sprawdzają w Sekcji 6 wyłącznie dane kontaktowe oraz `oryginaln*`, pozostawiając wymagane prawem ostrzeżenia CLP/GPSR oraz `Skład/INCI` w pełni nienaruszone; równocześnie chronione są legalne nazwy marek (np. `Dual Power`) oraz klasy twardości włosia (np. `Ultra Soft`).

### 2.2. Utwardzenie `Agent 0` Vision OCR (`src/modules/offer-optimizer-v2/vision-extractor.service.js`)
- Zaktualizowano `FRONT_VISION_PROMPT` i `BACK_PACK_INCI_PROMPT` o bezwzględny zakaz ekstrakcji sloganów reklamowych, rankingów, rekomendacji firm trzecich oraz haseł `XXL`/promo; usunięto stare tłumaczenia sloganów (`formula migliorata`, `spray attivo`, `potere sbiancante`).
- Podpięto `sanitizeLabelHighlights` bezpośrednio na surowych wynikach `glowne_hasla_front` oraz `certifications_and_claims` (eliminując problem osieroconego `"In Italia"` po usunięciu `"N°1"`), przy zachowaniu nietkniętych pól `Skład/INCI` i `Ostrzeżenia`.

### 2.3. Silnik Deterministyczny, Szablony INCI, Walidatory i Eskalacja (`deterministic-pipeline.engine.js`, `inci_mechanisms_pl.json`, `validators/index.js`, `orchestrator.js`)
- W `deterministic-pipeline.engine.js`: `cleanFeaturesForPrompt` oczyszcza/pomija historyczne `Wyróżniki*` / `Cechy dodatkowe` przed przekazaniem do LLM; rozszerzono `sanitizeOfferTitle`; zastąpiono wadliwe zamiany w `sanitizeHtmlClaimsAndStopwords` funkcją `sanitizeAllegroMarketingText` (z pominięciem reguł marketingowych dla `isSafetySection === true`); `buildDeterministicSection5` przepuszcza wiersz `Właściwości i wyróżniki` (w tym `features['Wyróżniki (Etykieta Front)']`) przez `sanitizeLabelHighlights` i pomija wiersz, jeśli po filtracji jest pusty. Poprawiono też `'błyskawicznie'` -> `'szybko'` (również w `inci_mechanisms_pl.json`), `'spłanie'` -> `'spłukanie'` oraz `'Technologia niskiej emisji...'` -> `'Układ niskiej emisji...'`.
- W `validators/index.js`: `scan_stopwords` deleguje do `scanStrictStopwords`; dodano i wyeksportowano `scan_allegro_implicit_risks` (`scanAllegroComplianceRisks`), które dopięto do `validate_section1_above_the_fold` oraz `validate_section5_compliance`.
- W `orchestrator.js`: `sanitizeSection5Html` wykonuje Krok 3b z `sanitizeLabelHighlights`; `applyDeterministicSectionSanitizers` oraz pętle A6/A10 przekazują `isSafetySection: i === 6`, `sectionType` i `brand`; wejście `vision_features` do A2/A4/A5/A7/A11/A10 przechodzi przez `cleanFeaturesForPrompt`; `computeComplianceAuditForSections` zbiera `detectedImplicitRisks`, a `shouldEscalateToAgent10` eskaluje przez `IMPLICIT_ALLEGRO_RISK_POST_A11`.

### 2.4. Prompty AI i Bramki Pre-flight Eksportów
- Zaktualizowano `SHARED_RULES_v4.1.md` (Reguła 5 w `§A`), `Agent_10_prompt_v4.md` i `Agent_11_prompt_v4.md` (zakaz parafrazowania sloganów z etykiety, rankingów, obcych marek i `Format XXL`), `Agent_4_prompt_v4.md` (usunięto przykład `błyskawicznie`), zsynchronizowano sekcje `ADR-0193` w `Agent_6_prompt_v4.md` i przekompilowano wszystkie 10 promptów przez `prompt-compiler.js` (`3238` polskich znaków diakrytycznych).
- Podpięto nieblokujące ostrzeżenia `auditOfferDraftCompliance` w pre-flightach eksportowych: `buildAllegroContentPreflight` (`src/utils/allegro_mapper.js` -> `warnings` + `complianceAudit`), `buildPayloadWithDiagnostics` (`baselinker.export.service.js` -> `warnings` + `complianceAudit`) oraz `buildVonHalskyOfferPayload` (`src/utils/vonhalsky_mapper.js` -> `warnings`).

---

## 3. Weryfikacja Produkcyjna
- **Nowa suita regresyjna (`src/modules/offer-optimizer-v2/tests/allegro.compliance.policy.test.js`):** 9 testów obejmujących przypadek Viakal `8700216906159`, rzeczywiste etykiety katalogowe, zamockowany OCR `Agent 0`, nienaruszalność marek/klas (`Dual Power`, `Ultra Soft`) i Sekcji 6 CLP, eskalację A11 -> A10 oraz ostrzeżenia pre-flight Allegro/BaseLinker/Von Halsky.
- **Pełna suita testów (`node --test src/modules/offer-optimizer-v2/tests/*.test.js`):** `344/344 PASS` (`0` fail, `0` skipped).
- **Składnia Backend (`node --check`):** `SYNTAX_OK` na wszystkich zmodyfikowanych i utworzonych plikach JS.
- **Build Frontend (`npm --prefix frontend run build`):** `vite build` **PASS** (`2.14s`, brak modyfikacji plików frontendowych w ramach ADR-0194).
- **Baza danych:** brak zmian schematu `prisma/schema.prisma`, brak modyfikacji historycznych rekordów zgodnie z decyzją użytkownika.
