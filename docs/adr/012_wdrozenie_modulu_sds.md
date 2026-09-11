# ADR 012: Wdrożenie Modułu SDS (Generator Kart Charakterystyki)

## Kontekst
Karty Charakterystyki SDS (Safety Data Sheets) muszą być prawnie i wizualnie zgodne z normami REACH i CLP dla rynku polskiego. Dotychczas tłumaczenia włoskich kart odbywały się ręcznie, co generowało błędy w sekcjach chronionych prawnie (Limity NDS, Ustawy o utylizacji). Istniał wymóg zintegrowania tego procesu w systemie Antigravity z wykorzystaniem Agentów LLM.

## Decyzja Architektoniczna
Zdecydowano na hybrydowe rozwiązanie (Tri-Track Processing):
1. **Deterministyczny Silnik Node.js** parsujący PDF i zamykający w kwarantannie sekcje prawne (1.4, 8, 13, 15).
2. **Generowanie Piktogramów w pamięci RAM:** Zrezygnowano z bibliotek systemowych (`cairo`, `canvas`) na rzecz wbudowanego w JS writera PNG, w celu utrzymania stabilności w mikroserwisach.
3. **LLM jako Tłumacz:** Agenci AI Google Gemini są używani wyłącznie do sekcji opisowych (tzw. "TRANSLATED") jako bezpieczne narzędzie post-processingu tekstowego z odpowiednim system-promptem.
4. **Format Word DOCX:** Eksport nie odbywa się do zablokowanego PDF, ale do edytowalnego DOCX, ponieważ Ekspert ds. SDS musi mieć możliwość korekty wyizolowanych (żółtych) "stref kwarantanny".

## Konsekwencje i Ograniczenia
- Dodano biblioteki `docx` do `package.json` – ich ciężar jest akceptowalny w skali projektu.
- Pamięć RAG pozostawiona jako struktury do rozszerzenia (tymczasowo zaimplementowano je jako puste JSON-y, by spełnić kontrakt architektoniczny bez awarii działania, gdy Agent potrzebuje dostępu).
- Upload działa na bazie buforów pamięci `multer` z limitem do 10MB dla PDF-ów.

## Status
Wdrożone (2026-09-10).
Zintegrowano na froncie w `MToolView.jsx`.
Backend w `src/modules/sds/`.
