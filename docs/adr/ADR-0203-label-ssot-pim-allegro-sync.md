# ADR-0203: Hierarchia Prawdy Etykietowej (Label-Truth SSOT), Walidatory Semantyczne oraz Synchronizacja Kart PIM i Katalogu Allegro

- **Status:** Wdrożono i zweryfikowano testami (`382/382 PASS`, ESLint `0` nowych błędów, `vite build` PASS `2.24s`)
- **Data:** 2026-11-26
- **Powiązania:** ADR-0197, ADR-0201, ADR-0202

## 1. Kontekst i analiza problemu
Analiza rekordu produkcyjnego *Chanteclair Lavatrice Pulito Profondo 2070 ml* (EAN `8015194533328`, kategoria Allegro `260128`) oraz widoku `UnifiedProductPipelineView` ujawniła systemowe rozjazdy między trzema źródłami danych (BaseLinker, skaner etykiet Przód+Tył, Katalog Parametrów Allegro):

1. **Odwrócony priorytet (BaseLinker wygrywał z Etykietą):**
   - `allegro-param-automapper.service.js` nadpisywał istniejące pola wartościami z etykiety wyłącznie dla `Postać` i `Typ`. Pozostałe pola (`Liczba prań`, `Pojemność`, `Waga`, `Kraj pochodzenia`, `Opakowanie`, `Liczba sztuk`, `Zapach`, `Cechy dodatkowe`) wpadały w `skippedExisting`, przez co po odczytaniu z etykiety `Wydajność: 46 prań` w Katalogu Allegro pozostawało przestarzałe **`41`** z BaseLinkera.
   - Endpointy `/api/products/:id/autofill-params`, `/api/products/autofill/:ean` i `/api/products/baselinker-sync/:ean` (`src/server.js`) wykonywały ślepe `{ ...existingFeatures, ...blData.features }`, nadpisując zweryfikowane odczyty z etykiety danymi magazynowymi.
   - `offer-optimizer.controller.js` (`runUnifiedLabelExtraction`), `ai.service.js` i `orchestrator.js` mieszały ogólne `updatedFeatures`/`product.features` z podzbiorami `visionFront`/`visionBack`.
2. **Błędny `Zapach` (`"Pulito Profondo"`, `"delikatny"`):**
   - Prompt frontowy prosił o „Wariant zapachowy lub wersja”, a filtry blokowały jedynie ok. 8 słów, przepuszczając funkcje produktu, kolory prania i ogólniki (`Pulito Profondo`, `Głębokie czyszczenie`, `delikatny`, `Total Black`, `Classico`) oraz brakowało tłumaczeń włoskich nut zapachowych na język polski.
3. **Dodatkowe błędy precyzji pól:**
   - `sanitizeVisionFrontText` podmieniała `Pulito Profondo` na `Głębokie czyszczenie` w oficjalnych nazwach własnych produktu (`Nazwa produktu (Etykieta Front)`, `Kontretykieta`, `Wariant`), tworząc mieszanki PL/IT (*„Chanteclair Lavatrice Głębokie czyszczenie extra smacchiante”*).
   - Do `Składniki wiodące (Front)` trafiały nazwy funkcji/kategorii produktu (`"Odtłuszczacz"` z *con Sgrassatore*) zamiast substancji aktywnych.
   - Automapper nie mapował `Rodzaj prania`, `Zastosowanie do` oraz cech etykietowych (`skuteczny w niskiej temperaturze`, `z odplamiaczem`).
4. **Dwie niespięte karty i duplikacja pól w UI (`UnifiedProductPipelineView.jsx`):**
   - `CORE_PIM_KEYS` wymuszało podwójne renderowanie pól schematu Allegro (`Pojemność`, `Waga`, `Postać`, `Zapach`, `Kraj pochodzenia`) w obu kartach jednocześnie, a zielona karta PIM wyświetlała na równi zdublowane klucze techniczne (`Dozownik` + `Dozownik (Etykieta)`, `Sposób użycia` + `Sposób użycia (Etykieta)`, `Wydajność` + `Liczba prań`) bez synchronizacji przy edycji.

## 2. Decyzja architektoniczna

1. **Centralne helpery SSOT (`src/modules/offer-optimizer-v2/services/label-truth.helpers.js`):**
   - `sanitizeScentValue(rawVal)`: odrzuca funkcje/warianty/kolory/przymiotniki (w tym `Pulito Profondo`, `Głębokie czyszczenie`, `delikatny`, `Extra Smacchiante`, `Total Black`, `Classico`, `Universale`, `Sgrassatore`, `Ochrona kolorów`) i tłumaczy autentyczne nuty zapachowe IT/EN na polski (np. `Lavanda` → `Lawenda`, `Muschio Bianco` → `Białe piżmo`, `Sapone di Marsiglia` → `Mydło marsylskie`).
   - `filterHeroIngredients(rawList)`: usuwa słowa funkcyjne z `Składniki wiodące (Front)` (konwertując np. `Odtłuszczacz` → `Formuła odtłuszczająca` i `Odplamiacz` → `Działanie odplamiające` do wyróżników).
   - `extractVerifiedLabelYield(...)`: pobiera liczbę cykli wyłącznie z twardych dowodów etykietowych (`Wydajność`, `Liczba prań (Etykieta)`, `Standardowa liczba prań: N` w `Sposób użycia (Etykieta)`), nigdy ze surowego pola BaseLinkera `Liczba prań`.
   - `extractLabelEvidenceSubsets(...)`: czysto rozdziela cechy Vision Front/Back od surowych kluczy magazynowych przed wywołaniem automappera.
   - `mergeFeaturesWithLabelPrecedence(existing, incoming)`: egzekwuje zasadę **Etykieta > Operator/PIM > BaseLinker/Allegro** podczas łączenia zewnętrznych danych (zewnętrzne źródła wypełniają tylko puste braki i nie wstrzykują błędnych zapachów).

2. **Rozdział nazw własnych od wyróżników i precyzyjne OCR (`src/modules/offer-optimizer-v2/vision-extractor.service.js`):**
   - Dodano i wyeksportowano `sanitizeVisionOfficialName(str)`, używane do `pelna_nazwa_etykieta`, `wariant_etykieta_front`, `linia_produktowa_front` oraz `oficjalna_nazwa_kontretykieta` (zachowuje oryginalne włoskie nazwy własne typu `Pulito Profondo` przy zachowaniu ochrony BPR 528/2012 i usunięciu hype `Nr 1`/`100%`).
   - Uściślono `FRONT_VISION_PROMPT` dla `zapach_wariant` (wyłącznie realna nuta zapachowa po polsku lub `null`) oraz `kluczowe_skladniki_front`, przepuszczając wyniki przez `sanitizeScentValue` i `filterHeroIngredients`, a z `extractInciFromBackPack` wyodrębniano dodatkowo `Liczba prań (Etykieta)`.

3. **Nadpisywanie sprzecznych danych z etykiety i brakujące mapowania `260128` (`src/modules/offer-optimizer-v2/services/allegro-param-automapper.service.js`):**
   - Rozszerzono logikę nadpisywania starych wartości twardymi faktami z etykiety dla `Liczba prań` (`41` → `46`), `Pojemność` (`2` → `2.07`), `Waga`, `Kraj pochodzenia`, `Opakowanie`, `Liczba sztuk w opakowaniu`, czyszczenia/tłumaczenia `Zapach` (z usuwaniem nie-zapachów jak `Pulito Profondo`/`delikatny`) oraz scalania `Cechy dodatkowe` — przy pełnym zachowaniu ochrony edycji operatorskich bez sprzecznego dowodu etykietowego (przypadek Dermomed).
   - Dodano deterministyczne mapowanie `Rodzaj prania` (`automatyczne`, `ręczne`, `uniwersalne` z odfiltrowaniem zdań wykluczeń) oraz `Zastosowanie do` (`czarnego`, `kolorów`, `białego`, `uniwersalne`), a w `Cechy dodatkowe` dodano rozpoznawanie `skuteczny w niskiej temperaturze` i `z odplamiaczem`.

4. **Spójny przepływ backendu (`src/server.js`, `offer-optimizer.controller.js`, `ai.service.js`, `orchestrator.js`):**
   - Wszystkie trzy endpointy BaseLinker/Auto-Fill w `src/server.js` używają `mergeFeaturesWithLabelPrecedence`.
   - `runUnifiedLabelExtraction`, `autofillMissingParameters` oraz `OrchestratorV2` korzystają z `extractLabelEvidenceSubsets`, czyszczą nieprawidłowe zapachy i walidują ewentualne odpowiedzi fallbackowe Flash AI przez `sanitizeScentValue`.

5. **Jedno źródło prawdy i spójne karty w UI (`frontend/src/views/OfferOptimizer/utils/allegroParamFormatter.js`, `UnifiedProductPipelineView.jsx`):**
   - Dodano czyste funkcje `sanitizeScentValueFrontend`, `extractLabelYieldCountFrontend`, `detectLabelAllegroConflicts`, `syncFeaturesFromLabelTruth` oraz `syncLinkedFeatureOnEdit`.
   - Z zielonej karty **Karta Techniczna i Skład (Parametry PIM)** usunięto duplikację pól należących do schematu Allegro (`Pojemność`, `Waga`, `Postać`, `Zapach`, `Kraj pochodzenia` itd.) oraz przeniesiono techniczne duplikaty/cienie OCR do zwijanej sekcji **`Odczyt z etykiety (SSOT)`**.
   - W karcie **Katalog Parametrów Allegro** dodano baner wykrywający rozbieżności z etykietą / walidacją zapachu z akcją 1-klik **`Zsynchronizuj z etykietą`**, ostrzeżenia i szybkie akcje bezpośrednio przy polach (`Ustaw 46`, `Wyczyść` / `Zmień na Lawenda`) oraz dwukierunkową synchronizację przy ręcznej edycji (`Liczba prań` ↔ `Wydajność`, `Pojemność / Waga` → `Pojemność`, pola kanoniczne → klucze `(Etykieta)`).

## 3. Weryfikacja
- `node --check` na wszystkich 8 zmodyfikowanych plikach `.js` — **PASS** (`exit 0`).
- `node --test src/modules/offer-optimizer-v2/tests/*.test.js` — **`382/382 PASS`** (`fail: 0`, `cancelled: 0`, `skipped: 0`), w tym nowa suita [label.ssot.and.scent.sync.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/label.ssot.and.scent.sync.test.js).
- `npx eslint src/views/OfferOptimizer/utils/allegroParamFormatter.js` — **`0` błędów**; `UnifiedProductPipelineView.jsx` — **`0` nowych błędów** (`18` wcześniejszych na nietkniętych liniach `68..2155`).
- `npm --prefix frontend run build` (`vite build`) — **PASS** (`2.24s`).
