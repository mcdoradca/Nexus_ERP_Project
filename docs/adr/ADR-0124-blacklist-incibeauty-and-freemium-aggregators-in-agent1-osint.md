# ADR-0124: Wpisanie incibeauty.com i agregatorów freemium na czarną listę w OSINT Agenta 1

## Status
ZAAKCEPTOWANY / WDROŻONY

## Data
2026-10-01

## Kontekst
W procesie pozyskiwania składów INCI przez Agenta 1 za pośrednictwem Google Search Grounding wykryto, że serwisy typu `incibeauty.com` (oraz powiązane platformy freemium) w wersjach publicznych/darmowych ukrywają lub ucinają listę składników (wymagając płatnej subskrypcji). 
Gdy model Gemini pobierał częściowy skład z `incibeauty.com`, zestawienie go z pełną etykietą producenta lub drogerii generowało sztuczny spadek współczynnika podobieństwa Jaccarda poniżej wymaganego progu 85%, co prowadziło do niepotrzebnych zatrzymań potoku i alertów HITL (`OSINT_CONFLICTING_INCI_MAX_RETRYS`).

## Decyzja Architektoniczna
1. **Rozszerzenie czarnej listy `FORBIDDEN_SOURCES`:**
   W `src/modules/offer-optimizer-v2/config/nodes.config.js` dodano wyrażenia regularne blokujące domeny z rodziny `incibeauty`:
   `'incibeauty\\..*'`, `'inci\\.beauty'`.
   Orkiestrator automatycznie odrzuca te źródła z listy `research_sources_used`.

2. **Twarde dyrektywy w prompcie systemowym Agenta 1:**
   W `src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md` dodano:
   - W sekcji `DYREKTYWY TWARDE (CRITICAL)`: `KATEGORYCZNY ZAKAZ BAZ FREEMIUM/PAYWALL: Bezwzględny zakaz pobierania składów ze strony incibeauty.com / inci.beauty (oraz serwisów ukrywających lub ucinających składniki w wersji darmowej). Pobieraj wyłącznie pełne, nienaruszone etykiety.`
   - W sekcji `1. INCI (Skład)`: `WYMÓG KRYTYCZNY 3 (ANTY-INCIBEAUTY / ANTY-FREEMIUM): Kategoryczny zakaz pobierania składów ze stron incibeauty.com / inci.beauty oraz wszelkich baz z uciętą/częściową listą składników. Pobieraj wyłącznie kompletne wykazy INCI z oficjalnych stron marek, włoskich drogerii lub sklepów internetowych.`

3. **Zachowanie zgodności z mechanizmem PIM Override:**
   Wprowadzone zmiany nie naruszyły wyrażenia regularnego w `orchestrator.js:509`, które dynamicznie wygasza pobieranie INCI, gdy skład istnieje już w PIM.

## Konsekwencje i weryfikacja
- Agent 1 zamiast uciętych wykazów z baz freemium pobiera pełne etykiety z włoskich supermarketów i drogerii (np. `spesasicura.com`, `paglieri.com`, `galaxus.ch`, `kaufland.fr`).
- Cały zestaw testów regresyjnych (`orchestrator.test.js`) przeszedł pomyślnie: 135/135 zaliczonych.
