# ADR-0145: Integracja Agenta 0 (Front-Pack Vision Extractor) z bazą PIM (SSOT) i widokiem parametrów

## Kontekst
W dotychczasowej architekturze potoku EAN Pipeline (`offer-optimizer-v2`) żaden agent nie analizował zdjęcia produktu pod kątem odczytu cech fizycznych i użytkowych. Informacje o pojemności, zapachu, postaci fizycznej i dozowniku były poszukiwane wyłącznie w internecie (Google Search Grounding przez Agenta 1) lub wymagały ręcznego wprowadzania przez operatora.

Jednocześnie kartoteka PIM zawsze dysponuje zdjęciem frontowym (packshotem) produktu. Przednia etykieta zawiera bezsporne fakty: wariant zapachowy, pojemność/dozowanie, postać fizyczną (płyn, żel, proszek, kapsułki), typ zamknięcia/dozownika (pompka, atomizer, korek z miarką) oraz kluczowe obietnice marketingowe.

Zgodnie z wytycznymi architektonicznymi operatora:
**Odczytane cechy muszą być trwale zapisane w bazie danych w tabeli `Product.features` i na bieżąco prezentowane w widoku „Karta Techniczna i Skład (Parametry PIM)”, skąd jako Jedyne Źródło Prawdy (SSOT) są pobierane przez kolejnych agentów (A1, A2, A4, A5, A6, A7, A10).**

## Podjęte decyzje

1. **Multimodalne rozszerzenie `ai.wrapper.js`:**
   - Wprowadzono obsługę parametru `image: { mimeType, base64 }` w `callAgentWithTelemetry`.
   - W ścieżce Standard Path ładunek `contents` jest formatowany jako tablica części multimodalnych (`[ { text: prompt }, { inlineData: { mimeType, data: base64 } } ]`).

2. **Utworzenie serwisu `vision-extractor.service.js` (Agent 0):**
   - Skonfigurowano model `gemini-3.8-flash` z rygorystycznym JSON Schema (`FrontPackVisionSchema`) nakierowanym wyłącznie na:
     - `pojemnosc_waga` (np. "750 ml", "1.5 kg")
     - `zapach_wariant` (np. "Lawenda", "Sensitive")
     - `postac` (np. "płyn", "pianka", "spray")
     - `dozownik` (np. "pompka", "atomizer / spray", "korek")
     - `wydajnosc_liczba_uzyc` (np. "40 prań")
     - `przeznaczenie_front` (np. "do czyszczenia łazienki")
     - `glowne_hasla_front` (np. ["Ultra Power", "98% składników naturalnych"])
   - Wdrożono Doktrynę Zamkniętego Świata – model zwraca `null` zamiast zgadywać.

3. **Orkiestracja i zapis do bazy PIM (Prisma) w `orchestrator.js`:**
   - Na starcie `RUN_EXTRACT` orkiestrator pobiera `frontImageUrl` i uruchamia Agenta 0.
   - Odczytane cechy są łączone ze słownikiem cech produktu z zachowaniem zasady nienaruszalności: **wartości wprowadzone wcześniej ręcznie przez człowieka nie są nadpisywane**.
   - Dokonywana jest trwała aktualizacja rekordu w bazie Prisma:
     `prisma.product.update({ where: { ean }, data: { features: JSON.stringify(currentFeatures) } })`.
   - Zaktualizowany słownik `features` trafia do `this.state.extracted_data.features` oraz `this.state.vision_extracted_features`.

4. **Reaktywność frontendu (`UnifiedProductPipelineView.jsx`):**
   - W nasłuchiwaczu zdarzenia `PIPELINE_STATUS` zaimplementowano natychmiastowe zasilanie `newProductForm.features` cechami z `extracted_data.features`.
   - Sekcja „Karta Techniczna i Skład (Parametry PIM)” na bieżąco prezentuje odczytane cechy jako edytowalne pola w interfejsie.

5. **Dystrybucja do kolejnych agentów:**
   - Wszyscy agenci (Agent 1, Agent 2, Agent 4, Agent 5, Agent 6, Agent 10) otrzymują w payloadzie wzbogacone cechy PIM.
   - Agent 1 wie, jakiego wariantu szukać w sieci, Agent 2 precyzyjnie wypełnia parametry Allegro, a Agent 6 generuje opis w 100% zgodny z fizycznym dozownikiem i zapachem produktu.

## Skutki architektoniczne
- Pełna spójność danych (SSOT): cechy z obrazu stają się trwałym elementem kartoteki PIM.
- Eliminacja pomyłek w wariantach zapachowych i pojemnościach.
- Zgodność z Doktryną Obronną (Defensive AI): w przypadku braku zdjęcia lub awarii CDN krok Vision jest bezpiecznie pomijany (`SKIPPED`) bez przerywania potoku.
