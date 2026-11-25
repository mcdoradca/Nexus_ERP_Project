# ADR-0201: Puryzm Modułu 5 (Sekcja 5), Matematyka Dozowania z Etykiety (Label-Truth SSOT) i Płukanie zamiast Prania w Płynach do Płukania

- **Status:** Wdrożono i zweryfikowano testami (`374/374 PASS`)
- **Data:** 2026-11-25
- **Powiązania:** ADR-0194, ADR-0196, ADR-0197, ADR-0198

## 1. Kontekst i diagnoza problemu
Audyt wygenerowanych ofert produkcyjnych (w szczególności *Soft Detersivo Total Black 2250 ml / 50 prań*, EAN `8003640022274`, oraz płynów do płukania tkanin *Ammorbidente*, m.in. Chanteclair/Coccolino) ujawnił cztery powtarzające się klasy błędów:

1. **Rozbieżność postaci fizycznej i hybryda `"płyn żel"`:** Etykieta *Soft Detersivo Total Black* określa wyrób wyłącznie jako `Detersivo` (płynny detergent), natomiast brudny import z ERP/kategorii i wcześniejsze heurystyki utrzymywały `Typ: Płyn Żel` oraz `Postać: żel` w Sekcji 5 i parametrach Allegro, mimo że na etykiecie nie widnieje słowo `Gel`.
2. **Halucynacje tabeli dozowania i pojemności nakrętki:** W Sekcji 4 generowano zmyśloną pojemność nakrętki (`75 ml`) oraz zawyżone dawki (`68 ml` jako standard dla wsadu 4–5 kg w wodzie średniej), co pozostawało w sprzeczności matematycznej z deklarowaną pojemnością i wydajnością (`2250 ml / 50 prań = 45 ml`, przy realnej nakrętce `50 ml` i dwóch wierszach poziomu zabrudzeń z kontretykiety `CONSIGLI D'USO`). Dodatkowo mechanizm współdzielenia faktów między kontami (`workspaceContentProfile`) potrafił kopiować zatruty `Sposób użycia` z innego workspace'u bez walidacji spójności matematycznej, a brak `frontContext` i przeliczania matematycznego w skanerze kontretykiety powodował brak re-skanu błędnych wpisów.
3. **Semantyczne duplikaty i generyczne słowa kategorii w Sekcji 5:** Wyróżniki z etykiety zawierały wielokrotnie powtórzone frazy o niskiej temperaturze (*„Działa w niskich temperaturach, Skuteczne usuwanie plam, butelka wykonana z plastiku z recyklingu, formuła aktywna w niskich temperaturach (na zimno), skuteczny w niskiej temperaturze”*) oraz generyczne nazwy kategorii włoskiej (`Detersivo`, `Ammorbidente`) wpisane jako `Linia produktowa`.
4. **Wycieki terminologii prania w płynach do płukania oraz błędy parsera liczb:** Z opisów ikon z etykiet płynów do płukania (`In lavatrice`, `A mano`) do Sekcji 5 i Sekcji 4 przenikały zwroty `„prać w pralce”`, `„pranie ręczne”` lub literówki (`„płakanie”`), a parser automappera wyłuskiwał błędne `Liczba sztuk` ze spacji w pojemności (`„2 25 l”` → `2`) lub liczników cykli (`„57 prań”` zapisane w polu `Liczba sztuk (Etykieta)`).

## 2. Decyzja architektoniczna
Wdrożono spójną warstwę **Label-Truth SSOT** obejmującą ekstrakcję Vision (Front + Tył), współdzielenie faktów PIM, kompilator Sekcji 5, automapper parametrów Allegro, walidatory V2 oraz prompty Agentów 6/10/11:

1. **Warstwa wspólnych reguł prawdy etykietowej (`src/modules/offer-optimizer-v2/services/label-truth.helpers.js`):**
   - `isGenericCategoryWordNotLine`: rozpoznaje i blokuje generyczne słowa kategorii (`Detersivo`, `Ammorbidente`, `Sgrassatore`, `Anticalcare`, `Sapone`, `Gel`, `Płyn`, `Żel`, itp.) przed trafieniem do pola `Linia produktowa`.
   - `resolveLabelPhysicalForm`: rozstrzyga kanoniczną postać fizyczną wyrobu na podstawie dowodu z etykiety (`Postać (Etykieta)` oraz oficjalnej nazwy `Detersivo`/`Ammorbidente`/`Sapone Liquido` bez `Gel` -> `płyn`), z zastosowaniem polskich lookaroundów wokół znaków diakrytycznych i ochroną przed zwracaniem pełnej nazwy produktu w przypadku braku informacji o postaci.
   - `normalizeFabricSoftenerTerminology`: konwertuje dla płynów do płukania zwroty typu `prać w pralce`, `pranie w pralce`, `pranie ręczne` oraz literówki (`płakanie`, `płukannie`) na poprawną terminologię płukania (`płukać w pralce`, `płukanie ręczne`, `płukanie`).
   - `validateDosageYieldMath`: weryfikuje spójność matematyczną dawki standardowej z instrukcji użycia względem pojemności i deklarowanej wydajności (`pojemność ml / liczba cykli`), wykrywając halucynacje typu `68 ml` dla `2250 ml / 50 prań` (`expectedDoseMl = 45`).

2. **Ekstrakcja Vision (Front + Tył), Kontekst i Re-skan (`vision-extractor.service.js`, `orchestrator.js`, `offer-optimizer.controller.js`, `nodes.config.js`):**
   - Węzeł `0` (`A0 Vision`) skonfigurowano jawnie w `nodes.config.js` (`gemini-3.8-flash`, `thinkingLevel: LOW`).
   - Rozszerzono `FRONT_VISION_PROMPT` i `extractFrontPackFeatures` o zapis `Postać (Etykieta)` i `Dozownik (Etykieta)` oraz odrzucanie słów generycznych z pola linii.
   - Rozszerzono `BACK_PACK_INCI_PROMPT`, `backPackInciSchema` i `extractInciFromBackPack` o przyjmowanie `frontContext` (pojemność, wydajność, spodziewana dawka standardowa, postać, flaga płynu do płukania), ekstrakcję `cap_capacity_ml` i `postac_kontretykieta`, rozróżnienie wierszy zabrudzeń w tabeli `CONSIGLI D'USO` oraz zakaz wpisywania liczby prań do `pieces_count`.
   - W `orchestrator.js` i `offer-optimizer.controller.js` przekazano `frontContext` i `frontImage` do skanowania kontretykiety, dodano automatyczny re-skan gdy obecny `Sposób użycia` nie przechodzi `validateDosageYieldMath`, zasilono `vision_extracted_features` kluczami etykietowymi z bazy przy starcie/wznowieniu oraz zasilano `physical_form`/`capacity`/`yield` do walidatorów i Agentów 11/10.

3. **Puryzm Sekcji 5 i Antyduplikacja Wyróżników (`allegro-compliance.policy.js`, `deterministic-pipeline.engine.js`, `orchestrator.js`, `workspaceContentProfile.service.js`):**
   - W `allegro-compliance.policy.js` dodano `getHighlightSemanticCluster`, ocenę konkretności i deterministyczną deduplikację semantyczną w `sanitizeLabelHighlights` (zachowującą rozdział `RECYCLED_CONTENT` vs `RECYCLABLE_PACKAGING`) oraz usunięto wypełniacze typu `Skuteczne usuwanie plam`.
   - W `deterministic-pipeline.engine.js` (`resolveCanonicalProductName`, `buildDeterministicSection5`) i `orchestrator.js` (`sanitizeSection5Html`) wdrożono usuwanie hybryd `płyn żel`, spójną korektę postaci na bazie `resolveLabelPhysicalForm`, deduplikację klastrów wyróżników i normalizację terminologii płynów do płukania.
   - W `workspaceContentProfile.service.js` rozszerzono `PACKAGING_FACT_FEATURE_KEYS` o nowe klucze etykietowe i zabezpieczono `extractVerifiedPackagingFacts` przed propagowaniem między kontami pola `Sposób użycia`, które nie przechodzi `validateDosageYieldMath`.

4. **Automapper Parametrów Allegro (`allegro-param-automapper.service.js`, `ai.service.js`):**
   - W `mapPackagingFeaturesToAllegroSchema` dodano bezpieczne nadpisywanie sprzecznych wartości `Postać`/`Typ` (np. `żel` / `Płyn Żel` → `płyn`), wyłącznie gdy `labelForm.isVerifiedFromLabel === true` (bez naruszania operatorskich wpisów w innych kategoriach, np. Dermomed).
   - Dodano obsługę `strictLiquid` w `buildPostacCandidates` oraz wykluczono mylące liczby cykli (`57 prań`) i rozspajane zapisy pojemności (`2 25 l`) z parsowania `Liczba sztuk w opakowaniu`.
   - W `ai.service.js` (`autofillMissingParameters`) przekazano wyciągnięte klucze etykietowe do `mapPackagingFeaturesToAllegroSchema` oraz dodano dyrektywę etykietową w promptcie fallbackowym LLM.

5. **Walidatory i Prompty Agentów (`validators/index.js`, `docs/Agent_{6,10,11}_prompt_v4.md`):**
   - Rozszerzono `validate_section5_compliance` o blokadę `płyn żel`, generycznej linii kategorii, niezgodności postaci względem etykiety, duplikatów semantycznych w `Właściwości i wyróżniki` oraz błędów słownych płynów do płukania.
   - Rozszerzono `validate_domain_and_chemical_logic`: w pkt 15 zablokowano `prać w pralce` / `pranie ręczne` / literówki `płakanie` (przy zachowaniu legalnych zapytań FAQ typu `podczas prania w pralce`), a także dodano kontrolę **32** (spójność postaci z etykietą w S1–S5) oraz kontrolę **33** (spójność matematyczna dozowania S4 względem pojemności i wydajności).
   - Zaktualizowano i skompilowano prompty Agentów `6`, `10` i `11` (`prompt-compiler.js`).

## 3. Weryfikacja
- `node src/modules/offer-optimizer-v2/prompt-compiler.js` — kompilacja 10 promptów PASS (`3970` polskich diakrytyków, 0 ostrzeżeń).
- `node --check` na wszystkich zmodyfikowanych plikach `.js` — PASS.
- `node --test src/modules/offer-optimizer-v2/tests/*.test.js` — **`374/374 PASS`** (`fail: 0`, `cancelled: 0`, `skipped: 0`), w tym nowa suita [module5.purism.and.label.dosage.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/module5.purism.and.label.dosage.test.js).
