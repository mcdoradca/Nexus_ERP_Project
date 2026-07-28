# ADR-028: Zastąpienie Agenta PXM deterministycznym mapowaniem Allegro i wdrożenie logowania OSINT

## Status
Zatwierdzony (2026-07-28)

## Kontekst
System do tej pory korzystał z LLM (Agenta 11 - Lite PXM) do pobierania i przypisywania parametrów do struktury kategorii (Wymagań Allegro). Było to kosztowne, powolne i potencjalnie podatne na halucynacje. Ponadto, istniało ryzyko podwójnej pracy z Agentem 1 (OSINT Autofill), który również przeczesywał internet za brakami. Jednocześnie, brak logowania dla Agenta 1 utrudniał diagnozowanie jego sukcesów i porażek podczas operacji w terenie.

## Decyzja
Podjęliśmy decyzję o zmianie architektury pierwszego kroku `EAN Pipeline`:
1. **Całkowite usunięcie Agenta 11** z przepływu. Skrypt AI został zastąpiony przez szybki skrypt w środowisku Node.js (`src/utils/allegro_mapper.js`), opierający się na Fuzzy String Matching.
2. Skrypt **rygorystycznie pobiera** parametry bazowe i mapuje je do drzewa z API Katalogu Allegro. BaseLinker został na tym etapie wyłączony z mapowania.
3. **Wdrożono natywny monitoring** (`src/utils/agent1_logger.js`) do modułów `osint.scraper.service.js`, `ai.service.js` i `supervisor.service.js`. Narzędzie Winston z rotacją danych rejestruje szczegóły dot. działania Scrapera (DuckDuckGo, statusy HTTP, wyodrębniony tekst, czasy zapytań) oraz weryfikuje poprawność pracy LLM w klastrze EAN Pipeline (Node 1).
4. Skrypt pokrywa weryfikację i mapowanie **WSZYSTKICH** dostępnych w słowniku opcji parametrów. Nie ograniczyliśmy się wyłącznie do tych oznaczonych w drzewie jako `required`. Pozwoliło to na drastyczne podniesienie potencjału pozycjonującego ofertę ze względu na ilość wprowadzonych cech produktu.

## Konsekwencje
- **Koszty:** Znaczące zredukowanie kosztów tokenów API Google poprzez zdjęcie narzędzia `googleSearch` ze zbędnego wywołania modelu.
- **Szybkość:** Faza startowa Grounding'u znacznie przyśpieszyła. Mapowanie odbywa się asynchronicznie i bez udziału LLM.
- **Audytowalność:** Telemetria OSINT dostarcza transparentności – wiadomo teraz na jakich stronach LLM szuka wiedzy o produkcie i czy napotyka restrykcje HTTP (np. błąd 403 z określonej domeny z powodu blokady scrapingu).
- **Złożoność:** Upraszcza wywoływanie węzłów w `supervisor.service.js`, gdzie "Krok 1" jest całkowicie odcięty od wahań konwersacyjnych LLM.
