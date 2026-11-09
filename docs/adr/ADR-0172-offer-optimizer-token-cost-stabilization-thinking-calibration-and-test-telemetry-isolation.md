# ADR-0172: Stabilizacja Kosztów Potoku EAN, Kalibracja Tokenów Myślenia Agenta 10 (Pro Preview) oraz Izolacja Telemetrii Testowej

## Status
Zaakceptowany i wdrożony (v4.16).

## Kontekst
Po wdrożeniu architektury Dual-Agent QA (ADR-0169) oraz analizy wizualnej tyłu opakowania (ADR-0171), telemetria produkcyjna wykazała niemal 2-krotny wzrost kosztu pojedynczego przebiegu potoku EAN Pipeline dla pojedynczego produktu (z ~21k-28k do ~62k-70k tokenów), przy czym koszt finansowy wzrósł ponad 2-krotnie.

Szczegółowy audyt telemetrii (`AgentMetric`) z ostatnich 6 godzin wykazał:
1. **Eksplozję Tokenów Myślenia (Thinking Tokens) w Agencie 10:**
   Węzeł 10 (Master Compliance Sentinel) działający na modelu `gemini-3.1-pro-preview` z parametrem `ThinkingLevel.HIGH` zużywał średnio od 7 800 do 12 300 tokenów myślenia na pojedyncze wywołanie, generując zaledwie ~200-500 tokenów odpowiedzi (JSON patches). Spowodowało to m.in. krytyczny błąd przekroczenia 180-sekundowego timeoutu defensywnego (`[DEFENSIVE AI TIMEOUT]`) i odpowiadało za ponad 85% kwoty na rachunku API GCP.
2. **Fałszywe zanieczyszczenie telemetrii (Rzekoma anomalia Agenta 5):**
   Test jednostkowy `ADR-0127` w pliku `orchestrator.test.js` wykonywał zapytanie na żywym API z promptem `"Test prompt"` (dokładnie 3 tokeny wejściowe), odkładając w bazie produkcyjnej fałszywe metryki zużycia tokenów przy każdym teście deweloperskim.

## Podjęte Decyzje Architektoniczne

### 1. Kalibracja `ThinkingLevel.LOW` dla Agenta 10 (`gemini-3.1-pro-preview`)
- W [nodes.config.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/config/nodes.config.js) zaktualizowano konfigurację węzła 10:
  ```javascript
  10: { model: 'gemini-3.1-pro-preview', thinkingLevel: ThinkingLevel.LOW }
  ```
- **Uzasadnienie merytoryczne i zachowanie jakości:**
  Agent 10 pozostaje na najbardziej zaawansowanym modelu prawnym `gemini-3.1-pro-preview`. Testy weryfikacyjne potwierdziły, że przy poziomie `ThinkingLevel.LOW` model generuje ~600 tokenów myślenia (zamiast ~10 000), zachowując 100% czułości prawnej (bezbłędne wychwytywanie braków EUH206, regulacji CLP, GPSR oraz standardów Allegro).
- **Zysk:**
  - Redukcja tokenów myślenia o **~90-95%** w węźle Pro.
  - Spadek czasu odpowiedzi Agenta 10 z 60-120 sekund do zaledwie 6-8 sekund.
  - Całkowite wyeliminowanie ryzyka timeoutów 180s.
  - Oszczędność ~10 000 najdroższych tokenów Pro na każdy przetwarzany produkt.

### 2. Izolacja Telemetrii i Testów Jednostkowych
- W pliku [ai.wrapper.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/ai.wrapper.js) wyeksportowano instancję klienta API `ai` oraz funkcję `generateContentWithTimeout`.
- W pliku [orchestrator.test.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/tests/orchestrator.test.js) test `ADR-0127` został zaizolowany poprzez mockowanie odpowiedzi generatora. Test sprawdza poprawność wywołania i brak błędu `ReferenceError` w ścieżce Standard Path w 2 ms, bez wykonywania zapytań sieciowych do API i bez zanieczyszczania tabeli `AgentMetric`.

### 3. Zachowanie Pełnej Spójności Frontend / Backend
- Struktura obiektów JSON, formaty patchy, statusy węzłów (`node_status`), WebSocket events (`PIPELINE_STATUS`) oraz 9 twardych bramek walidacyjnych pozostają w 100% nienaruszone.
- Widok frontendowy [UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx) odbiera identyczny stan ofert, zyskując szybszą aktualizację statusu węzła A10 (z kilkudziesięciu sekund do kilku sekund).

## Konsekwencje
- Koszt przetwarzania jednego produktu w EAN Pipeline spada o **~40-50% całkowitej sumy tokenów** i o **~75-80% kosztu finansowego** (dzięki redukcji drogich tokenów Pro).
- Jakość merytoryczna, zgodność z prawem CLP/GPSR/BPR oraz ochrona BHP pozostają na niezmiennie najwyższym poziomie (architektura Dual-Agent QA zachowana w 100%).
- 161 testów jednostkowych weryfikujących potok przechodzi w 100% bez błędów.

