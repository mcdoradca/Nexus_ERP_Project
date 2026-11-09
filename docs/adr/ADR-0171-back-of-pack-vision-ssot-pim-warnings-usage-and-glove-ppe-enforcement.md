# ADR-0171: Back-of-Pack Vision OCR SSOT, Pola PIM (Ostrzeżenia i Sposób użycia) oraz Rygor ŚOI/BHP w Chemii Domowej (Rękawice Ochronne vs Zakaz Halucynacji Masek i Gogli)

- **Status:** Zaakceptowany i Wdrożony
- **Data:** 2026-11-09
- **Moduł:** Offer Optimizer V2 (`ean.pipeline`), Kartoteka PIM (`UnifiedProductPipelineView.jsx`), Vision Extractor (`vision-extractor.service.js`), GPSR/CLP Safety Service (`gpsr.safety.service.js`), Walidatory (`validators/index.js`)

## 1. Kontekst i Problem
W dotychczasowym działaniu potoku EAN (`offer-optimizer-v2`) występowały dwa powiązane problemy systemowe:
1. **Brak dedykowanego miejsca w PIM na zdjęcie tyłu opakowania oraz ustrukturyzowanych pól na `Ostrzeżenia` i `Sposób użycia`:** W sekcji *"Karta Techniczna i Skład (Parametry PIM)"* istniało wyłącznie pole `Skład/INCI`, a Vision Extractor (`extractInciFromBackPack`) skanował tylną etykietę wyłącznie pod kątem składu chemicznego.
2. **Halucynacje i nieadekwatność wymogów ŚOI/BHP w chemii domowej:**
   - Z powodu braku odczytanego z etykiety tekstu ostrzeżeń i instrukcji użycia, agenci generujący opis potrafili halucynować przemysłowe środki ochrony indywidualnej (np. nakaz zakładania **maski ochronnej i okularów/gogli ochronnych** do domowego czyszczenia piekarnika), a agenci weryfikujący (Agent 11 i Agent 10) przepuszczali te błędy.
   - Jednocześnie dla żrących lub silnie drażniących środków (zawierających `Sodium Hydroxide`, `Potassium Hydroxide`, `Sodium Hypochlorite`, silne kwasy lub zwroty `H314`/`H315`) wcześniejszy filtr w `sanitizeSection6Html` wycinał z Sekcji 6 każdy punkt `P280`, przez co brakowało obowiązkowej informacji o konieczności stosowania **rękawic ochronnych** (`P280 – Stosować rękawice ochronne.`).

## 2. Decyzja Architektoniczna
Wdrożono architekturę **Back-of-Pack Label Single Source of Truth (SSOT)**:
1. **Frontend i Backend Kartoteki PIM (`UnifiedProductPipelineView.jsx`, `offer-optimizer.routes.js`, `offer-optimizer.controller.js`):**
   - Dodano dedykowaną kartę **„Zdjęcie tyłu opakowania”** w sekcji PIM z kompresją obrazu w wysokiej rozdzielczości (1600px JPEG pod czytelność drobnego druku etykiety), podglądem pełnoekranowym oraz przyciskiem **„Skanuj AI” / „Odczytaj z tyłu opakowania (AI)”** wywołującym endpoint `POST /api/offer-optimizer/extract-back-label`.
   - Rozszerzono stałe pola sekcji *„Karta Techniczna i Skład (Parametry PIM)”* z `['Skład/INCI']` do trójki: **`['Skład/INCI', 'Ostrzeżenia', 'Sposób użycia']`** (renderowane jako wieloliniowe pola `<textarea>`).
   - Zabezpieczono `baselinker.export.service.js`, `baselinker.extract.config.json` oraz `cleanFeaturesForPrompt` przed wyciekiem Base64 `Zdjęcie tyłu opakowania` do parametrów tekstowych BaseLinkera i promptów tekstowych LLM.
2. **Agent 0 Vision Back-of-Pack OCR (`vision-extractor.service.js` & `orchestrator.js`):**
   - Rozbudowano `BACK_PACK_INCI_PROMPT`, schemat `backPackInciSchema` oraz funkcję `extractInciFromBackPack`, aby w jednym wywołaniu multimodalnym Gemini 3.8 Flash Vision odczytywać z tylnej etykiety wszystkie 3 sekcje:
     - `inci` -> `Skład/INCI`,
     - `warnings` -> `Ostrzeżenia` (w tym hasło ostrzegawcze, zwroty H/P/EUH oraz wymagane środki ochrony z etykiety w języku polskim, bez zgadywania),
     - `usage_instructions` -> `Sposób użycia` (dozowanie, kroki aplikacji, czas działania, spłukiwanie, wykluczenia w języku polskim).
   - W `orchestrator.js` (`runPhase1`) dodano automatyczne uruchamianie skanowania tylnej etykiety, gdy w PIM brakuje któregokolwiek z 3 pól (`Skład/INCI`, `Ostrzeżenia`, `Sposób użycia`), z zapisem do bazy Prisma i zachowaniem pierwszeństwa ręcznych wpisów operatora.
3. **Deterministyczny Silnik Bezpieczeństwa i Walidatory (`gpsr.safety.service.js`, `deterministic-pipeline.engine.js`, `validators/index.js`, `orchestrator.js`):**
   - W `gpsr.safety.service.js` (`generateGpsrWarnings`) dodano odczyt `features['Ostrzeżenia']` oraz `features['Sposób użycia']`, detekcję ryzyka `PROTECTIVE_GLOVES_REQUIRED` (dla środków z NaOH, KOH, NaOCl, silnymi kwasami, do piekarników/pleśni, z `H314`/`H315` lub gdy etykieta zawiera słowo `rękawic`/`guanti`/`gloves`) i generowanie zwrotu `P280 – Stosować rękawice ochronne.` (przy jednoczesnym braku P280 dla łagodnych środków prania z samym H319).
   - W `orchestrator.js` (`sanitizeSection6Html`) naprawiono regułę 7: zachowuje ona `P280 – Stosować rękawice ochronne.`, a usuwa wyłącznie przemysłowe warianty P280 o ochronie oczu/twarzy bez wzmianki o rękawicach. Ponadto w `RUN_A6` i `RUN_A10` dodano deterministyczną tarczę wstrzykującą wymóg rękawic ochronnych do Sekcji 4 i Sekcji 6, gdy `requiresProtectiveGloves === true`.
   - W `deterministic-pipeline.engine.js` (`sanitizeHtmlClaimsAndStopwords` – KROK G2) dodano deterministyczną zamianę halucynowanych masek i okularów/gogli ochronnych na rękawice ochronne i wietrzenie pomieszczenia (o ile maska/gogle nie widnieją wprost w `pimWarnings`/`pimUsage`).
   - W `validators/index.js` (`validate_domain_and_chemical_logic`) dodano:
     - **Regułę 16:** blokadę halucynacji masek ochronnych, półmasek, respiratorów, gogli i okularów ochronnych w chemii domowej spoza etykiety,
     - **Regułę 17:** bezwzględny obowiązek obecności rękawic ochronnych zarówno w Sekcji 4, jak i Sekcji 6 (`P280 – Stosować rękawice ochronne.`) dla środków żrących, silnie zasadowych/kwasowych, wybielaczy, preparatów do piekarników/pleśni oraz gdy wymaga tego etykieta.
   - Zaktualizowano i przekompilowano prompty `Agent_5_prompt_v4.md`, `Agent_6_prompt_v4.md`, `Agent_11_prompt_v4.md` oraz `Agent_10_prompt_v4.md`.

## 3. Rewizja 2 (Audyt Etykiety Kontra Opis dla *Dual Power Orizon Płyn do szyb i szkła 500 ml*, EAN `8050999571427`)
W wyniku audytu tylnej etykiety *Dual Power Orizon Vetri 500 ml* (`Italchimica S.r.l.`) względem wygenerowanego opisu wdrożono 4 poprawki systemowe:
1. **Brak fałszywego `H319` i potrójnych duplikatów w Sekcji 6 (`gpsr.safety.service.js`, `deterministic-pipeline.engine.js`, `orchestrator.js`):**
   - Dla mieszanin nieklasyfikowanych jako drażniące oczy (`isMildUnclassifiedChemical`), które na tylnej etykiecie posiadają wyłącznie zwroty ostrożności `P101`, `P102`, `P103` oraz `EUH208` (bez piktogramu CLP, bez hasła `UWAGA` i bez `H319`), zablokowano fabrykowanie `Hasło ostrzegawcze – UWAGA`, `H319 – Działa drażniąco na oczy.`, `P264`, `P301+P312`, `Nie połykać.`, `P305+P351+P338` oraz `P337+P313`.
   - Naprawiono wyrażenie regularne w `sanitizeSection6Html` (`orchestrator.js`), które zamieniało `Zawiera:` i `Uwaga:` na `Zawiera –` / `Uwaga –`, oraz wdrożono twardą deduplikację po kodach CLP (`P101`, `P102`, `P103`, `EUH208`) i po znormalizowanej treści zdania (eliminacja duplikatów z `mandatory_clp_warnings` Agenta 4 oraz rozbitych członów `EUH208`).
2. **Wzbogacenie Sekcji 3 i FAQ Q4 przy deklaracjach WE 648/2004 ograniczonych do konserwantów (`deterministic-pipeline.engine.js`, `Agent_6_prompt_v4.md`):**
   - W `tryBuildDeterministicSection3` dodano KROK 2b: gdy skład na etykiecie detergentu (np. płynu do szyb wg Rozp. 648/2004) wymienia wyłącznie konserwanty (`Benzisothiazolinone`, `Methylchloroisothiazolinone/Methylisothiazolinone`), silnik deterministycznie poprzedza je rzeczywistymi mechanizmami bazy czyszczącej (szybko odparowująca baza na surowcach pochodzenia naturalnego + technologia niskiej emisji *Air Label Score A+*), dzięki czemu Sekcja 3 i FAQ Q4 nigdy nie prezentują konserwantów (`BIT`, `MCI/MI`) jako głównych substancji myjących.
3. **Rozszerzenie ekstrakcji Vision Back-of-Pack (`vision-extractor.service.js`):**
   - Rozbudowano `BACK_PACK_INCI_PROMPT` oraz `backPackInciSchema` o pola `target_surfaces` (-> `Przeznaczenie`, np. *szyby, kryształy, lustra oraz powierzchnie plastikowe i laminowane*), `certifications_and_claims` (-> `Cechy dodatkowe`, np. *Air Label Score A+, testowany dermatologicznie, testowany na nikiel, rtęć, ołów i chrom, H.A.C.C.P., butelka w 30% z plastiku z recyklingu*) oraz `manufacturer_name` (-> `Producent`, np. *Italchimica S.r.l.*).
4. **Higiena Sekcji 5 (`deterministic-pipeline.engine.js`, `orchestrator.js`):**
   - Zablokowano wyświetlanie placeholderów `Producent: nieznany producent` (automatyczny fallback do `eu_responsible_person.name` z GPSR, np. `Italchimica S.r.l.`, lub marki) oraz ogólnikowych wypełniaczy `Wydajność deklarowana: Długi czas użytkowania` pozbawionych wartości liczbowej.

## 4. Weryfikacja
- Testy jednostkowe (`gpsr.safety.test.js`, `vision_extractor.test.js`, `validators.test.js`): **117/117 PASS (0 błędów)**.
- Kompilacja promptów (`prompt-compiler.js`) i walidacja składni JS (`node --check`): **PASS (0 błędów)**.

