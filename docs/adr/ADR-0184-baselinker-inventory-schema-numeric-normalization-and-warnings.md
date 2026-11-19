# ADR-0184: Normalizacja parametrów liczbowych (`type: "number"`), walidacja słowników `getInventoryParameters` oraz raportowanie `warnings` przy eksporcie do BaseLinkera

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-19  
**Moduły:** `src/modules/offer-optimizer-v2/baselinker.export.service.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/tests/baselinker.export.test.js`

---

## 1. Kontekst i Diagnoza Problemu

Po wdrożeniu ADR-0183 parametry tekstowe i słownikowe zaczęły trafiać do BaseLinkera z UI Nexusa, jednak dla produktów takich jak EAN `8054633831977` (BaseLinker ID `61592982`, katalog `385`) pole **„Waga produktu z opakowaniem jednostkowym”** pozostawało puste w formularzu BaseLinkera (`Informacje -> Parametry`), mimo że w Nexusie miało wartość `1,1` (lub `1,200 kg` / `2,0` na innych produktach).

Weryfikacja metodami API BaseLinkera `getInventoryParameters` oraz `getInventoryProductsData` dla katalogu `385` wykazała:
1. W BaseLinkerze parametry `Waga produktu z opakowaniem jednostkowym` (`bl_sys_2038`), `Pojemność` (`bl_sys_2044`), `EAN (GTIN)` (`bl_sys_2040`), `Kod producenta` (`bl_sys_2041`), `Liczba prań` (`bl_sys_2036`) i `Liczba sztuk w opakowaniu` (`bl_sys_2057`) mają zdefiniowany typ **`"number"`** (parametry predefiniowane — w przeciwieństwie do indywidualnych nie wyświetlają ikony `(i)` w UI BaseLinkera).
2. `baselinker.export.service.js` wysyłał do `addInventoryProduct` surowe polskie zapisy z przecinkiem lub jednostką (`"1,1"`, `"1,200 kg"`, `"2,0"`, `"1000,00 ml"`). BaseLinker odrzuca/czyści taki zapis w formularzu UI dla pól `type: "number"`, natomiast czyste liczby dziesiętne z kropką (np. `"2.35"` na produkcie `20714837`) wyświetlają się poprawnie w panelu (`2,35`).
3. Brakowało również dopasowania/ostrzeżeń dla parametrów predefiniowanych `select`/`multiselect` (np. na `61592982` `Postać: "żel pod prysznic"`, `Typ`, `Przeznaczenie` i `Cechy dodatkowe` nie mieściły się w słownikach BaseLinkera i były cicho pomijane), a `exportToBaselinker` i kontroler nie raportowały pola `response.data.warnings` z `addInventoryProduct`.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Pobieranie schematu `getInventoryParameters` z cache i bezpiecznym fallbackiem (`baselinker.export.service.js`)
- Wydzielono wspólny helper transportowy `callConnectorApi(method, parameters, timeout)` (DRY dla `getInventoryParameters` i `addInventoryProduct`).
- Dodano metodę `fetchInventoryParameters(inventoryId)` z cache TTL (10 min per katalog) oraz bezpiecznym fallbackiem `FALLBACK_INVENTORY_PARAMETERS` dla znanych parametrów liczbowych w razie niedostępności API/sieci (np. tryb offline).

### 2.2. Deterministyczna normalizacja parametrów pod schemat BaseLinkera
- Dodano `parseAndFormatNumericFeatureValue(keyName, rawVal)`:
  - Przekształca wartości liczbowe z przecinkiem lub jednostką na czysty zapis numeryczny z kropką (`"1,1"` -> `"1.1"`, `"1,200 kg"` -> `"1.2"`, `"1000,00 ml"` -> `"1000"`, `"1,800 l"` -> `"1.8"`), redukując zbędne zera po kropce (`trimDecimalTrailingZeros`).
  - Dla parametru `Waga produktu z opakowaniem jednostkowym` jawna jednostka gramowa (`g`, np. `"ok. 850 g"`) jest bezpiecznie przeliczana na kilogramy (`"0.85"`).
  - Czyste ciągi cyfr (`/^\d+$/`, np. `EAN (GTIN)`, `Kod producenta` z zerem wiodącym `"04801320150"`) są zachowywane 1:1 bez konwersji `parseFloat`, a nieparsowalne wartości alfanumeryczne (np. `"DM-100"`) nie są niszczone — zamiast tego trafiają do ostrzeżeń walidacji.
- Dodano `matchPredefinedParameterOption` i `normalizeFeaturesForBaselinkerSchema(features, parameters)`:
  - Kanonizuje dopasowania do słowników `select`/`multiselect` (odporność na wielkość liter i spacje brzegowe w opcjach BaseLinkera, np. `" bez aluminium"`), a przy braku opcji w katalogu BaseLinkera zachowuje wartość bez destrukcji i generuje czytelny komunikat ostrzegawczy.

### 2.3. Diagnostyka Pre-flight i raportowanie `warnings` po eksporcie
- Dodano `buildPayloadWithDiagnostics(inventoryId, productId, draftData, product)` zwracającą `{ payload, warnings }` przy zachowaniu wstecznej kompatybilności `buildPayload(...)` (czysty obiekt ładunku API).
- `validateBaselinkerExport` (`offer-optimizer.controller.js`) zwraca `preflightWarnings` w `validation.warnings` do modalu weryfikacyjnego przed eksportem.
- `exportToBaselinker` w serwisie i kontrolerze parsuje `response.data.warnings` przez `formatBaselinkerApiWarnings`, loguje je w `exportLogger.warn` i przekazuje do frontendu (`UnifiedProductPipelineView.jsx` wyświetla uwagi z BaseLinkera w komunikacie po eksporcie).

---

## 3. Weryfikacja

- **Składnia (`node --check`):** `src/modules/offer-optimizer-v2/baselinker.export.service.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `src/modules/offer-optimizer-v2/tests/baselinker.export.test.js` — **PASS**.
- **Testy jednostkowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`304/304 PASS`** (`0` błędów, `0` pominiętych), w tym nowe testy w `baselinker.export.test.js` (normalizacja `"1,1"`, `"1,200 kg"`, `"ok. 850 g"`, `"1000,00 ml"`, `"1,800 l"`, ochrona wiodących zer i alfanumerycznych kodów producenta, dopasowanie słowników `select`/`multiselect`, diagnostyka `buildPayloadWithDiagnostics`, raportowanie `apiWarnings`, cache i fallback `fetchInventoryParameters`).
- **Frontend:** `npm --prefix frontend run build` (`vite build`) **PASS** (`2.17s`), ESLint na `UnifiedProductPipelineView.jsx` — `0` nowych błędów (18 starych `no-unused-vars` w nietkniętych liniach `21..1616`).
- **Dry-run na danych produkcyjnych z Postgresa i żywym `getInventoryParameters('385')` (bez mutacji danych):** EAN `8054633831977` (`61592982`) — `Waga produktu z opakowaniem jednostkowym` znormalizowane z `"1,1"` do **`"1.1"`**, `Pojemność: "1000"`, `EAN (GTIN): "8054633831977"`, `Kod producenta: "4801320150"`, `Stan opakowania: "oryginalne"`, oraz wygenerowane 4 czytelne ostrzeżenia Pre-flight dla pól słownikowych (`Typ`, `Postać`, `Przeznaczenie`, `Cechy dodatkowe`).
