# ADR-0125: Wielojęzyczna matryca operatorów OSINT i kwoty unikalnych źródeł (min. 10 / min. 5)

## Status
ZAAKCEPTOWANY / WDROŻONY

## Data
2026-10-01

## Kontekst
W procesie pozyskiwania składów INCI oraz danych GPSR przez Agenta 1 (Google Search Grounding) zauważono, że kwerendy oparte wyłącznie na polskich frazach lub pojedynczym zapytaniu po EAN zawężały pole poszukiwań do zaledwie 2-3 lokalnych domen. Dla popularnych produktów europejskich (np. włoskich marek Felce Azzurra, Equilibra czy marek niemieckich i francuskich) uniemożliwiało to odnalezienie wiarygodnych etykiet w drogeriach zagranicznych i na oficjalnych stronach producentów.

## Decyzja Architektoniczna
1. **Wdrożenie wielojęzycznej matrycy synonimów INCI w `Agent_1_prompt_v4.md`:**
   Wprowadzono obligatoryjną matrycę kwerend łączących EAN i nazwę ze słownikiem branżowym w 6 językach:
   - **IT (Włoski):** `[EAN] (ingredienti OR inci OR composizione OR formula OR "elenco ingredienti")` (kluczowe dla marek włoskich)
   - **DE (Niemiecki):** `[EAN] (inhaltsstoffe OR bestandteile OR zusammensetzung OR "inci-liste")` (kluczowe dla rynku DACH)
   - **FR (Francuski):** `[EAN] (ingrédients OR composition OR "liste inci" OR formule)`
   - **EN (Angielski):** `[EAN] (ingredients OR "inci list" OR "full ingredients" OR composition)`
   - **ES (Hiszpański):** `[EAN] (ingredientes OR composición)`
   - **PL (Polski):** `[EAN] (skład OR składniki OR inci)`

2. **Twarde kwoty penetracji źródeł (min. 10 unikalnych stron / min. 5 w retry):**
   - Nałożono na Agenta 1 wymóg zbadania i zacytowania w `research_sources_used` minimum 10 unikalnych stron w pierwszym podejściu oraz pobrania minimum 2-3 wariantów składu.
   - W `orchestrator.js` w komunikacie `revision_warning` nakazano zbadanie minimum 5 kolejnych unikalnych stron zagranicznych z użyciem powyższych synonimów.

3. **Optymalizacja Google Grounding w Krok 1 (`ai.wrapper.js`):**
   - Usunięto zewnętrzny `thinkingConfig` z Kroku 1 (`groundingConfig`), zachowując go dla agentów analitycznych i strukturyzacji, co zapobiega fałszywym blokadom `RECITATION` w buforze myśli Gemini przy intensywnym przeszukiwaniu wielu stron.
   - Zachowano tarcze defensywne odzyskiwania tekstu z `candidate.content.parts` oraz retry parafrazujący.

## Konsekwencje i weryfikacja
- Agent 1 dla EAN `8001280068041` odpytał aż 12 unikalnych stron w Europie (`spesasicura.com`, `magale.it`, `tregemme.hu`, `ebay.de`, `paglieri.com`, `easycoop.com`, `kaufland.de`, `bernava.net`, etc.) i zwrócił 3 pełne kandydatury INCI oraz kompletne dane GPSR.
- Wszystkie testy regresyjne w `tests/orchestrator.test.js` (135/135) zakończyły się wynikiem pozytywnym.
