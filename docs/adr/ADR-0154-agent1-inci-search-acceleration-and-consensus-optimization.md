# ADR-0154: Przyspieszenie Poszukiwania INCI przez Agenta 1, Odciążenie Kognitywne Kroków JSON i Optymalizacja Konsensusu

**Data:** 2026-10-19  
**Status:** Zaakceptowane / Wdrożone produkcyjnie  
**Dotyczy:** Offer Optimizer V2, Agent 1 (OSINT & PIM Autofill), `ai.wrapper.js`, `orchestrator.js`, `osint.scraper.service.js`, `docs/Agent_1_prompt_v4.md`

---

## 1. Kontekst i Problem Biznesowy
Podczas działania potoku EAN Pipeline dla produktów z brakującym składem INCI Agent 1 (PIM Autofill) potrzebował od 2 do ponad 4 minut na odnalezienie i zwalidowanie składu w sieci, co drastycznie spowalniało automatyzację e-commerce.

Szczegółowy audyt logów wykonania (`Node_1_Execution_Trace_*.log`, `INCI_TRACE_*.log`) oraz kodu ujawnił cztery wąskie gardła:
1. **Dwukrokowy proces z ThinkingLevel.HIGH w Kroku 2:** Z powodu wymogów Google GenAI SDK (konflikt narzędzia `googleSearch` ze schematem JSON – HTTP 412) Agent 1 działa w architekturze dwukrokowej. Krok 1 (Grounding) pobiera dane, a Krok 2 (JSON Schema) formatował je do schematu, lecz miał narzucony `ThinkingLevel.HIGH` dla modelu Pro. Model spędzał 60–90 sekund na wewnętrznym „rozmyślaniu” w zadaniu czystej ekstrakcji strukturalnej.
2. **Przeciążony prompt („Deep Research”):** W `Agent_1_prompt_v4.md` nakazywano sztuczną kwotę badania minimum 10 unikalnych stron, wielojęzyczną matrycę zapytań w 6 językach oraz próbę wyszukiwania i skanowania zdjęć tyłu opakowań przez Google Search. Zamiast szybkiego sprawdzenia 2–3 czołowych drogerii, model wykonywał powolne kwerendy wieloetapowe.
3. **Pułapka pojedynczego kandydata w Orkiestratorze:** W `orchestrator.js` algorytm podobieństwa Jaccarda wymagał `candidates.length > 1`. Gdy Agent 1 odnalazł w sieci kompletny, oficjalny skład (np. 20 składników z oficjalnej drogerii) i zwrócił go jako 1 kandydata, orkiestrator traktował to jako brak spójnej pary, wyzwalał `A1_INCI_CONFLICT_RETRY` i uruchamiał całe 2-minutowe wyszukiwanie od nowa.
4. **Nieskuteczny pre-scraper Bing:** W `osint.scraper.service.js` zapytanie `"${ean}" "${productName}"` zamykało całą nazwę w cudzysłowie, co skutkowało 0 wynikami w Bing i brakiem wstępnych danych dla Agenta 1.

---

## 2. Zrealizowane Zmiany Architektoniczne

### A. Odciążenie Kognitywne Kroku 2 w `ai.wrapper.js`
- W Kroku 2 (Strukturyzacja JSON) usunięto narzucanie `thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }`.
- Krok 2 to deterministyczna ekstrakcja z wygenerowanego w Kroku 1 tekstu raportu badawczego. Pozbawienie go narzutu myślenia skróciło czas generowania JSON z 75s do 2–4s bez jakiejkolwiek degradacji struktury.

### B. Przebudowa Promptu Agenta 1 (`docs/Agent_1_prompt_v4.md` i `prompts/Agent_1_compiled.md`)
- Zastąpiono sztuczny wymóg 10 stron i szukania zdjęć tyłu opakowań **zasadą penetracji drogerii**:
  - Nakaz aktywnego zbadania wiarygodnych e-drogerii (Rossmann, Hebe, Notino, Super-Pharm, oficjalna strona marki, drogerie europejskie).
  - Twardy zakaz lenistwa: jeśli pierwsza strona zawiera tylko ogólny opis marketingowy, model ma bezwzględny obowiązek sprawdzić kolejne linki, aż odnajdzie pełną listę składników (kategoryczny zakaz przedwczesnego poddawania się i rzucania pustego wyniku).
  - Pobranie minimum 2 potwierdzeń/wariantów składu do `extracted_inci_candidates` w celu umożliwienia porównania spójności.
  - Zachowano wszystkie bramki jakościowe: anty-recitation (numeracja i wielkie litery), anty-translate (zakaz polskich tłumaczeń), zakaz freemium paywall (incibeauty) oraz bezwzględną dyskwalifikację Lilialu (CMR).

### C. Likwidacja Fałszywego Retry w `orchestrator.js`
- W węźle oceny kandydatów INCI dodano ścieżkę dla pojedynczego, pełnego składu:
  - Jeśli `candidates.length === 1`, sprawdzana jest poprawność struktury (`baselinkerExtract.isValidInciValue`), minimalna liczba składników ($\ge 4$) oraz brak zakazanego Lilialu (`!hasBannedLilial`).
  - Spełnienie tych kryteriów oznacza natychmiastową akceptację (`foundMatch = true`) bez wymuszania powtórnej pętli wyszukiwania.

### D. Uelastycznienie Pre-Scrapera w `osint.scraper.service.js`
- Usunięto sztywne cudzysłowy blokujące wyszukiwarkę wokół pełnej nazwy produktu.
- Zapytanie bazuje na ścisłym EAN `"${ean}"` oraz oczyszczonych słowach kluczowych i synonimach braków, co pozwala Bingowi dostarczać treść stron drogerii bezpośrednio do `osint_data`.

### E. Migracja Węzła 1 (Agent 1) na `gemini-3.8-flash` i Tarcza Timeoutu
- Zdiagnozowano, że wywołanie `gemini-3.1-pro-preview` z narzędziem `googleSearch` (grounding) na API Google trwa od 180 do 222 sekund, co wykraczało poza limit i powodowało kaskadowy błąd defensywnego fallbacku `Agent_1_Step1_Fallback` (60s).
- Zmigrowano Węzeł 1 w `nodes.config.js` na lekki i zoptymalizowany pod kątem wyszukiwania model `gemini-3.8-flash` (bez `thinkingLevel`).
- Testy na żywym API wykazały, że `gemini-3.8-flash` wykonuje pełny grounding Google Search w **21 sekund** (10x szybciej niż Pro), bez błędu RECITATION i z pełnym odzyskiem składu INCI.
- Zaktualizowano taksonomię w `config.test.js`: jedynym węzłem Pro z `ThinkingLevel.HIGH` pozostaje Agent 10 (Sentinel).
- W `ai.wrapper.js` dodano twarde czyszczenie `delete fallbackGroundingConfig.thinkingConfig` przed wywołaniem fallbacku, zapewniając że żaden fallback nie zawiśnie w pętli myślenia.

---

## 3. Weryfikacja i Testy
- Utworzono test jednostkowy w `orchestrator.test.js`: *„Orchestrator V2: Akceptacja 1 kompletnego, poprawnego składu INCI z OSINT bez zbędnego retry”*.
- Zaktualizowano test taksonomii w `config.test.js`: A1 jako Flash z groundingiem, A10 jako jedyny model Pro.
- Zweryfikowano odporność fallbacku w `ai.wrapper.js`.
- Zrekompilowano prompty przez `prompt-compiler.js`.
- Cały zestaw testów jednostkowych przeszedł na zielono: **198/198 testów PASSED (0 błędów)**.
