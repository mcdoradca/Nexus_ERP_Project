# ADR-0190: Izolacja kluczy opisowych Vision OCR od słowników Allegro/BaseLinker, widoczność ukrytych wartości w UI oraz ścisły eksport 1:1 BaseLinkera z odświeżaniem cache słownika

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-20  
**Moduły:** `src/modules/offer-optimizer-v2/vision-extractor.service.js`, `src/modules/offer-optimizer-v2/orchestrator.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `src/modules/offer-optimizer-v2/services/deterministic-pipeline.engine.js`, `src/modules/offer-optimizer-v2/services/gpsr.safety.service.js`, `src/modules/offer-optimizer-v2/baselinker.export.service.js`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/tests/baselinker.export.test.js`, `src/modules/offer-optimizer-v2/tests/vision_extractor.test.js`, `src/modules/offer-optimizer-v2/tests/validators.test.js`

---

## 1. Kontekst i Diagnoza Problemu

Podczas przygotowania eksportu produktu EAN `8006530224482` (*Viakal odkamieniacz Z mydłem 470 ml spray*, BL ID `73002538`, katalog `385`, kategoria Allegro `253353` *Odkamieniacze*) do BaseLinkera wystąpiły rozbieżności między tym, co operator widział w kartach *Karta Techniczna i Skład (Parametry PIM)* oraz *Katalog Parametrów Allegro*, a ładunkiem i ostrzeżeniami modalu Pre-flight:

1. **Kolizja kluczy opisowych Vision Back-Pack OCR ze słownikami Allegro/BaseLinker:** `extractInciFromBackPack` ([vision-extractor.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/vision-extractor.service.js)) zapisywał opisowe zdania z kontretykiety (`target_surfaces` oraz `certifications_and_claims`) bezpośrednio pod zastrzeżonymi nazwami parametrów słownikowych `Przeznaczenie` oraz `Cechy dodatkowe`, a następnie `orchestrator.js`, `offer-optimizer.controller.js` oraz `UnifiedProductPipelineView.jsx` bezwarunkowo nadpisywały nimi `Product.features`.
2. **Ukryte wartości spoza słownika w UI *Katalogu Parametrów Allegro*:** Dla `Cechy dodatkowe` (`multipleChoices: true`, `id: 233865`) Karta 1 ukrywała parametr (bo należy do schematu Allegro), a Karta 2 renderowała wyłącznie checkboxy ze słownika. Zapisany w `Product.features['Cechy dodatkowe']` opis `"Twój sprzymierzeniec w usuwaniu kamienia i plam po wodzie, dla czystej i lśniącej łazienki"` był całkowicie niewidoczny w UI, a kliknięcie checkboxa `brak` doklejało go do niewidocznego tekstu (`[...selectedMulti, d.value]`), utrwalając śmieć w bazie. Dodatkowo UI nie rozdzielało wartości po separatorze `|` wprowadzonym w ADR-0188 i nie pokazywało ostrzeżenia dla obcych wartości w polach `select`.
3. **10-minutowy sztywny cache `getInventoryParameters` i wstrzykiwanie obcych `hardFeatures`:** Po dodaniu przez operatora brakującej opcji słownikowej w BaseLinkerze (np. `"w płynie"` w `bl_sys_2032` `Postać`) 10-minutowy cache RAM w [baselinker.export.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/baselinker.export.service.js) przez cały TTL zgłaszał fałszywe ostrzeżenie o nieistniejącej opcji. Ponadto `buildPayloadWithDiagnostics` nawet w trybie autorytatywnym z UI (`featuresAuthoritative: true`) wciąż odpytywał Katalog Allegro (`hardFeatures`) i potrafił doklejać klucze nieobecne w kartach UI.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Separacja kluczy opisowych Vision OCR i etykiet Sekcji 5
- W [vision-extractor.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/vision-extractor.service.js), [orchestrator.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/orchestrator.js), [offer-optimizer.controller.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/offer-optimizer.controller.js) i [UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx) opisowe pola kontretykiety zapisywane są wyłącznie pod niekolizyjnymi kluczami **`Przeznaczenie (Etykieta)`** oraz **`Wyróżniki / Certyfikaty (Etykieta)`** (spójnie z `Przeznaczenie (Front)` i `Wyróżniki (Etykieta Front)`).
- W [deterministic-pipeline.engine.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/services/deterministic-pipeline.engine.js), [orchestrator.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/orchestrator.js) (`resolveProductPurpose`) i [gpsr.safety.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/services/gpsr.safety.service.js) dodano obsługę nowych kluczy z pełną wsteczną kompatybilnością dla starszych rekordów.
- W `buildDeterministicSection5` zmieniono etykiety HTML Sekcji 5 z nazw parametrów Allegro (`Przeznaczenie`, `Cechy dodatkowe`) na niekolizyjne **`Zastosowanie i powierzchnie`** oraz **`Właściwości i wyróżniki`**, a także odfiltrowano placeholderowe wartości słownikowe (`brak`, `brak informacji`, `nie dotyczy`) przy składaniu listy wyróżników.

### 2.2. Jawna prezentacja i czyszczenie wartości spoza słownika w UI ([UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx))
- Wydzielono helper `splitAllegroMultiChoiceValue(rawVal, dictionary)` z normalizacją `NFC` i obsługą separatorów `,`, `;`, `|` (zgodność z ADR-0188), rozdzielający tokeny na `validSelected` i `unknownTokens`.
- Dla `isMultiChoice` (np. `Cechy dodatkowe`) każda ukryta wartość spoza słownika Allegro jest jawnie wyświetlana w bursztynowym banerze z przyciskiem **„Wyczyść spoza słownika”**; kliknięcie dowolnego checkboxa zapisuje wyłącznie `validSelected` (nigdy nie dokleja do ukrytych śmieci), a opcja `brak` wzajemnie wyklucza się z pozostałymi cechami.
- Dla słownikowych pól `select` bez `hasAmbiguous` ukryta wartość spoza słownika jest sygnalizowana banerem ostrzegawczym z przyciskiem **„Wyczyść”**.
- W Karcie 1 (`Karta Techniczna i Skład`) dodano `Przeznaczenie (Etykieta)` oraz `Wyróżniki / Certyfikaty (Etykieta)` do `CORE_PIM_KEYS` / `MULTILINE_PIM_KEYS`, a placeholder dodawania klucza zmieniono z kolizyjnego `Cechy dodatkowe` na `Kraj pochodzenia`.

### 2.3. Ścisły eksport BaseLinkera 1:1 z kart UI oraz auto-refresh cache słownika ([baselinker.export.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/baselinker.export.service.js))
- Dodano `.normalize('NFC')` w `normalizeParameterName` oraz parametr `{ forceRefresh = false }` w `fetchInventoryParameters` (z defensywnym zachowaniem poprzedniego wpisu cache w razie awarii sieci).
- `normalizeFeaturesForBaselinkerSchema` zwraca teraz flagę `hasUnmatchedDictionaryOption`; w `buildPayloadWithDiagnostics`, gdy użyto danych z cache i wykryto niedopasowaną opcję `select`/`multiselect`, słownik katalogu BaseLinker jest jednorazowo przeładowywany na żywo przed wystawieniem ostrzeżeń.
- W trybie `featuresAuthoritative: true` (wysyłanym z UI) `buildPayloadWithDiagnostics` pomija odpytywanie `AllegroService.getProductParametersByEan`, a `mergeFeaturesForBaselinker` eksportuje ściśle 1:1 wyłącznie parametry obecne w kartach UI (bez doklejania obcych `hardFeatures` i bez pól binarnych zdjęć). Tryb nie-autorytatywny (`featuresAuthoritative: false`) zachowuje dotychczasowy fallback luk.

---

## 3. Weryfikacja

- **Składnia (`node --check`):** wszystkie 9 zmodyfikowanych plików backendowych i testowych — **PASS**.
- **Testy jednostkowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`320/320 PASS`** (`0` fail, `0` skipped), w tym nowe/rozszerzone testy w `baselinker.export.test.js` (tryb ścisły 1:1 vs legacy, auto-refresh cache po dodaniu `"w płynie"` + NFC, zachowanie cache przy błędzie sieci), `vision_extractor.test.js` (niekolizyjne klucze OCR kontretykiety) i `validators.test.js` (etykiety Sekcji 5 + filtracja `"brak"`).
- **Frontend:** ESLint na `UnifiedProductPipelineView.jsx` (`0` nowych błędów, pozostało 18 zastanych sprzed zmiany), `npm --prefix frontend run build` (`vite build`) — **PASS** (`4.86s`).
- **Żywa weryfikacja read-only dla EAN `8006530224482` (katalog `385`):** po oczyszczeniu ukrytego tokenu w `Cechy dodatkowe` dry-run zwraca `warnings: []`, `Postać: "w płynie"`, `Cechy dodatkowe: "brak"`, brak `Przeznaczenie`, 100% zgodność z kartami UI.
