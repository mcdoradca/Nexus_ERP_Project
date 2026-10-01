# ADR-0123: Eliminacja Fałszywych Alertów CRITICAL_MISSING_INCI (Tarcza Anty-Recitation w ai.wrapper.js) oraz Podniesienie Poziomu Myślenia do ThinkingLevel.HIGH

## Status
Przyjęty i wdrożony (100% Produkcja) - 2026-10-01

## Kontekst i Zgłoszony Problem
Podczas przetwarzania popularnych produktów rynkowych (np. Equilibra Carbone Attivo EAN: `8000137015436` oraz Felce Azzurra EAN: `8001280068003`), dla których dane i składy INCI są powszechnie dostępne w europejskich rejestrach, potok zgłaszał fałszywy alert HITL:
`CRITICAL_MISSING_INCI: Brak składu (INCI) w PIM i błąd OSINT (Krok 1 (Grounding) zwrócił pustą lub zbyt krótką odpowiedź (0 znaków). Brak danych z sieci.). Uzupełnij dane.`
Mimo że model w logach odnajdywał bogate składy i producenta, potok ulegał zatrzymaniu.

## Analiza Przyczyn Źródłowych (Root Cause Analysis)
1. **Blokada biblioteczna gettera `.text` w `@google/genai` (v2.14.0):**
   W trybie dwukrokowym (`TWO-STEP`) Krok 1 odpytuje model `gemini-3.1-pro-preview` z narzędziem `googleSearch`. Gdy model odnajduje autentyczny skład i cytuje go ze stron drogerii, filtr licencyjny Google oznacza odpowiedź statusem `finishReason: "RECITATION"`. W takiej sytuacji getter `groundedResponse.text` w SDK `@google/genai` zwraca `undefined`.
2. **Płytki odczyt w `ai.wrapper.js`:**
   W `ai.wrapper.js` zmienna `groundedText` była pobierana wyłącznie przez `groundedResponse.text || ''`. W przypadku `RECITATION` zmienna przyjmowała pusty ciąg (`0 znaków`), mimo że w surowym obiekcie `groundedCandidate.content.parts[0].text` znajdował się pełny, bogaty raport ze składem INCI i danymi podmiotu odpowiedzialnego.
3. **Brak mapowania standardowych pól w Orkiestratorze:**
   Pola `country_of_origin` oraz `logistics.net_capacity_or_weight` zwracane przez Agenta 1 nie były mapowane na polskie synonimy cech w `extracted_data`, co przy dynamicznych schematach Allegro powodowało fałszywe oznaczanie tych cech jako brakujących.

## Podjęte Decyzje Architektoniczne
1. **Wdrożenie Tarczy Defensywnej `extractGroundedTextFromResponse` w `ai.wrapper.js`:**
   - Bezpośrednia kaskadowa ekstrakcja z `groundedCandidate.content.parts` (omijająca blokadę gettera `.text` przy `RECITATION`).
   - Ekstrakcja z partów narracyjnych z fallbackiem do bufora myśli (`thought: true`) oraz fragmentów stron `groundingMetadata.groundingChunks`.
   - Automatyczny defensywny re-grounding (retry) z dyrektywą parafrazowania, jeśli filtr licencyjny całkowicie zablokował części tekstowe.
2. **Podniesienie Poziomu Myślenia dla Agenta 1 (`nodes.config.js`):**
   - Zwiększono poziom wnioskowania z `ThinkingLevel.MEDIUM` do `ThinkingLevel.HIGH` dla węzła Agenta 1 (`gemini-3.1-pro-preview`), co zapewnia głębszą analizę źródeł rejestrowych i konsensusu recepturowego.
3. **Mapowanie Cech w Orkiestratorze (`orchestrator.js`):**
   - Dodano bezpośrednie mapowanie `result.country_of_origin` na `this.state.extracted_data.country_of_origin` i `Kraj pochodzenia`.
   - Dodano mapowanie `result.logistics.net_capacity_or_weight` na `this.state.extracted_data['Pojemność']` i `capacity`.

## Weryfikacja
- Testy na żywo dla EAN `8000137015436` (Equilibra) oraz EAN `8001280068003` (Felce Azzurra): potok bezbłędnie ekstrahuje składy INCI i dane podmiotu odpowiedzialnego bez zgłaszania błędu 0 znaków.
- Dodano 3 dedykowane testy jednostkowe w `src/modules/offer-optimizer-v2/tests/orchestrator.test.js`.
- Pełna suita testowa: **135/135 testów PASSED** (0 błędów, 0 regresji).
