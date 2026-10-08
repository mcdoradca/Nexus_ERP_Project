# ADR 0132: Dostosowanie ekosystemu Gemini do API Gemini 3 (Wycofanie parametrów samplera i zarządzanie poziomami wnioskowania thinkingLevel)

## Data
2026-10-08

## Kontekst
Firma Google ogłosiła oficjalne wycofanie parametrów próbkowania stochastycznego (`temperature`, `top_p`, `top_k`) oraz parametru budżetu myślenia (`thinking_budget` / `thinkingBudget`) w modelach Gemini serii 2.5 / 3.x (w tym `gemini-3.1-pro-preview` oraz `gemini-3.8-flash`). Modele te odrzucają requesty zawierające wycofane parametry zwracając błąd HTTP 400 `INVALID_ARGUMENT`.

W ekosystemie Nexus ERP (obejmującym potok Offer Optimizer V2, moduł Ad Intelligence, roje audytorów SDS UE 2020/878, moduł komunikacji NeS oraz generator zestawów) sterowanie jakością i stylem opierało się dotąd częściowo na parametrze `temperature` (od `0.0` dla pełnego determinizmu i braku halucynacji, do `0.65`–`1.2` dla kreatywności w copywritingu i pokoju narad War Room).

Wycofanie samplera wymagało:
1. Całkowitego wyeliminowania parametrów `temperature`, `top_p`, `top_k` oraz `thinking_budget` ze wszystkich wywołań SDK (`@google/genai` oraz `@google/generative-ai`).
2. Przypisania precyzyjnego poziomu wnioskowania (`thinkingLevel`: `MINIMAL`, `LOW`, `MEDIUM`, `HIGH`) w oparciu o rzetelną taksonomię kognitywną zadań poszczególnych agentów (zapobiegając zjawisku *overthinking* dla parserów danych i *underthinking* dla audytorów prawnych).
3. Przeniesienia kontroli nad stylem, inwencją twórczą i dyscypliną faktograficzną w 100% do **warstwy semantycznej promptów systemowych** (Cognitive Architecture).

## Decyzja

### 1. Taksonomia Kognitywna i Poziomy Myślenia (Thinking Levels)
Zdefiniowano 4 suwerenne profile kognitywne agentów w systemie:

1. **Profil A: Sędziowie, Audytorzy Prawni i Toksykolodzy (`ThinkingLevel.HIGH`):**
   - **Agenci:** Agent 10 (`Master Compliance Sentinel`), Agent 5 (`Legal Compliance Shield`), SDS Verifier Agent, SDS Hazard Auditor, SDS Health & Environment Auditor, SDS Workplace Safety Auditor.
   - **Uzasadnienie:** Wykrywanie subtelnych kontradykcji chemicznych (F6), weryfikacja zgodności z rozporządzeniami UE (CLP, REACH, BPR, Omnibus, GPSR) oraz wieloetapowa dedukcja krzyżowa wymagają głębokiego łańcucha wnioskowania.
   - **Warstwa semantyczna:** Doktryna Zamkniętego Świata (*Closed-World Assumption*) – bezwzględny zakaz inferencji poza dostarczone fakty (SOT/INCI).

2. **Profil B: Stratedzy, Architekci Treści i Persony Kreatywne (`ThinkingLevel.MEDIUM`):**
   - **Agenci:** Agent 6 (`Master Copywriter GEO/AEO`), Agent 7 (`Psychology Adaptor`), Ad Intelligence Strategy Synthesizer, Creative War Room (persony: *Wójcik, Kamiński, Zawadzki, Bochenek*), Prompt Director (Węzeł 1: Reżyser Wizualny), Portfolio Manager (`Bundle Copywriter`).
   - **Uzasadnienie:** Zbalansowane planowanie narracji, wieloaspektowa kompozycja ofert oraz eliminacja powierzchownych klisz przy jednoczesnym zachowaniu twardych ograniczeń faktograficznych.
   - **Warstwa semantyczna:** Mandat Myślenia Dywergencyjnego (*Lateral Thinking Protocol*) – zakaz utartych schematów językowych ("najwyższa jakość", "innowacyjny produkt"), rotacja kątów wejścia i perspektyw percepcyjnych.

3. **Profil C: Analitycy, Scorerzy i Arbitrzy Zależności (`ThinkingLevel.LOW` do `MEDIUM`):**
   - **Agenci:** Agent 1 Krok 1 (OSINT Rejestrowy), Agent 4 (Chemical AEO Parser), Agent 2 (Sentiment Clusterer), Ad Intelligence Scorer, Prompt Director Węzeł 2 (Architekt Dyfuzji), SDS Semantic Arbiter, Allegro Ads Sentinel.
   - **Uzasadnienie:** Zogniskowana ocena analityczna według sztywnych matryc scoringowych, wykrywanie anomalii i kategoryzacja bez zbędnych spekulacji.

4. **Profil D: Ekstraktorzy Danych i Strukturatorzy (`ThinkingLevel.MINIMAL`):**
   - **Agenci:** Agent 1 Krok 2 (JSON Parser raportu badawczego), BaseLinker Export Agent (`Payload Formatter`), SDS Vision Extractor, SDS Narrative Translator.
   - **Uzasadnienie:** Natychmiastowe przepisanie danych do schematu JSON bez tworzenia tokenów spekulacyjnych (*overthinking* w Krok 2 groziło dopowiadaniem brakujących parametrów).

### 2. Eliminacja Wycofanych Parametrów w Kodzie
- Zaktualizowano `src/modules/offer-optimizer-v2/config/nodes.config.js` – usunięto właściwości `temperature` ze wszystkich węzłów (w tym węzła 1, 2, 4 i 11), przypisano precyzyjne `ThinkingLevel`.
- Zaktualizowano `src/modules/offer-optimizer-v2/ai.wrapper.js` – usunięto `temperature` z `baseConfig` oraz z Kroku 2 (`structureConfig`), ustawiając w Kroku 2 `thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }`.
- Zaktualizowano `src/modules/offer-optimizer-v2/orchestrator.js` – usunięto przekazywanie `temperature: 0` w wywołaniach Agenta 5 i Agenta 10.
- Zaktualizowano `src/modules/offer-optimizer-v2/baselinker.export.agent.js` – usunięto `temperature: 0.8`, wdrożono `ThinkingLevel.MINIMAL`.
- Zaktualizowano moduł `ad-intelligence` (`ad-intelligence.service.js`, `creative-war-room.service.js`, `prompt-director.service.js`) – usunięto parametry temperatury oraz przestarzały `thinkingBudget: 1024`, wdrażając enum `ThinkingLevel` (`HIGH`, `MEDIUM`, `LOW`).
- Zaktualizowano moduł `sds` (`sds.agent.js`, `sds.investigator.agent.js`, `sds.verifier.agent.js`, `sds.vision.agent.js`, `engine/agents/*`) – usunięto `temperature: 0.0`, wdrożono `thinkingConfig` z odpowiednimi poziomami (`HIGH` dla audytorów, `MINIMAL` dla wizji i translatora, `MEDIUM` dla arbitra).
- Zaktualizowano moduł komunikacji `nexus-bot.service.js` – usunięto `temperature: 0.1` i `topP: 0.8`, wdrożono `thinkingLevel: "MEDIUM"`.

### 3. Wzmocnienie Warstwy Semantycznej Promptów
- W promptach Agenta 6 wdrożono regułę 8: *Mandat Dywergencyjnego Copywritingu* (bezwzględny zakaz klisz korporacyjnych, rotacja kątów natarcia).
- W promptach Agenta 7 wdrożono regułę 4: *Subtelność Behawioralna* (zakaz przesady perswazyjnej, język zaufanego doradcy).
- W promptach Agenta 10 wdrożono regułę F7: *Doktryna Zamkniętego Świata* (bezwzględny brak tolerancji dla twierdzeń bez dowodu).
- W promptach Creative War Room dodano *Doktrynę Anty-Klisz* dla każdej z 4 person.

## Konsekwencje i Weryfikacja
- **Zgodność z API Google:** System jest w 100% odporny na wycofanie parametrów samplera i budżetu myślenia. Błąd HTTP 400 `INVALID_ARGUMENT` został wyeliminowany.
- **Odporność na regresję testową:** Rozszerzono `src/modules/offer-optimizer-v2/tests/config.test.js` o asercje weryfikujące brak wycofanych parametrów (`temperature`, `top_p`, `top_k`, `thinkingBudget`) oraz zgodność taksonomii `thinkingLevel` dla wszystkich węzłów.
- **Wyniki testów:** 154/154 testy potoku Offer Optimizer V2 przechodzą pomyślnie (`154 pass, 0 fail`).
