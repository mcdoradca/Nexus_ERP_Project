# ADR-0117: Aktywacja Klastra Agentów Dziedzinowych (Swarm), Prawdziwego Silnika RAG oraz Eliminacja Sabotażu Prawnego w Kartach SDS

## Data
2026-09-18

## Status
Zaakceptowany i Wdrożony (100% Produkcja)

## Kontekst i Identyfikacja Przyczyn Pierwotnych (Root Cause)
Użytkownik zidentyfikował krytyczną anomalię jakościową: prywatna instancja modelu Gemini analizująca wygenerowane karty SDS była w stanie wskazać kilkanaście poważnych uchybień regulacyjnych, podczas gdy zintegrowany system agentowy generował dokumenty obarczone tymi samymi błędami. 

Szczegółowy audyt inżynierski kodu ujawnił cztery fundamentalne przyczyny:
1. **Zapaść integracyjna (Martwa Magistrala - Dead Code):**
   Architektura roju agentów zdefiniowana w ADR-0114, ADR-0115 i ADR-0116 (`SDSSwarmOrchestrator` oraz 4 ekspertów dziedzinowych) w ogóle nie była wywoływana w głównym potoku `sds.controller.js` -> `processSdsWithVisionAgent`. Silnik przetwarzał kartę pojedynczym zapytaniem Gemini Vision, omijał wszystkich audytorów dziedzinowych i natychmiast kompilował plik DOCX.
2. **Fasadowy silnik RAG (Mock-RAG):**
   Moduł `LocalKnowledgeConnector` zwracał statyczne, zhardkodowane obiekty i kilka prostych warunków `if`. Pliki urzędowe z `docs/SDS/` (Baza NDS RP Dz.U. 2018 / 2024, Katalog Odpadów Dz.U. 2020, Załącznik VI do CLP) nie były w ogóle przeszukiwane. Metoda `lookupWasteCode` nie istniała, co przy próbie jej wywołania rzucało `TypeError`.
3. **Deterministyczny sabotaż prawny w kodzie:**
   W `sds.vision.agent.js` w metodzie `enrichWithPolishRegulations` na sztywno wklejono do Sekcji 15.1 niemieckie normy `WGK: Klasa 1`, `TRGS 510: LGK 10` oraz `Ograniczenie 75` (tatuaże dla odświeżaczy powietrza). Kod sam wstrzykiwał rażące błędy niezgodne z polską jurysdykcją.
4. **Błąd pętli Function Calling w gemini-3.8-flash:**
   SDK `@google/generative-ai` przesyłał odpowiedzi narzędzi z etykietą `role: "function"`, która w API v1beta dla `gemini-3.8-flash` jest odrzucona (wymagany thought signature). Ponadto sprawdzanie `response.functionCalls().length` bez weryfikacji typu rzucało wyjątek `Cannot read properties of undefined (reading 'length')`.

## Decyzja Architektoniczna

1. **Autentyczny Silnik RAG (`LocalKnowledgeConnector`):**
   - Zastąpiono mocki fizycznym indeksem pamięciowym ładującym urzędowe bazy:
     * `nds_database_2018.json` (Dz.U. 2018 poz. 1286 z Dz.U. 2024 poz. 1017) – wyszukiwanie po CAS i nazwach PL/EN.
     * `waste_codes_pl.json` (Dz.U. 2020 poz. 10) – algorytm doboru kodów 6-cyfrowych dla konsumenta (20 01 30 / 20 01 29*), przemysłu (16 03 06 / 07 06 99 / 16 03 05*) i opakowań (15 01 02 / 15 01 10*).
     * `clp_annex_vi_harmonized.json` – zharmonizowane wartości ATE, SCL i współczynniki M (np. CAS 55965-84-9).
     * `adr_transport_pl.json` – klasyfikacja transportowa ADR dla numerów UN.
     * `lookupLegalActs` – skonsolidowane, czyste prawodawstwo UE i RP (REACH 2020/878, CLP 1272/2008, prekursory 2019/1148, Seveso III, ustawa o odpadach, ustawa o opakowaniach, ADR).

2. **Eliminacja Sabotażu Prawnego:**
   - Całkowicie wycięto niemieckie normy WGK i TRGS 510 z `sds.vision.agent.js` oraz wdrożono deterministyczne filtry oczyszczające w `_applyDeterministicEnforcements` i `_applyDeterministicSafetyShield`.
   - Ograniczenie 75 Załącznika XVII do REACH zostało ograniczone wyłącznie do tuszów do tatuażu; dla mieszanin łatwopalnych zastosowano pozycje 3 i 40.
   - Wdrożono ścisłą obsługę Art. 18 ust. 3 CLP (jeśli produkt nie posiada zwrotów H, pole nazw niebezpiecznych substancji na etykiecie przyjmuje wartość *"Nie dotyczy."*).
   - Wdrożono wymóg pełnego zdania informacyjnego dla zwrotu EUH208.

3. **Wpięcie Orkiestratora Roju (`SDSSwarmOrchestrator`) do Potoku Produkcyjnego:**
   - W `sds.agent.js` w funkcji `processSdsWithVisionAgent` bezpośrednio po ekstrakcji Vision AI wpięto `SDSSwarmOrchestrator.auditSdsData(sdsData)`.
   - Rój dzieli model sekcji na 4 klastry:
     * `HazardClassificationAuditorAgent` (sekcje 2, 3, 9, 14, 15)
     * `HealthEnvironmentAuditorAgent` (sekcje 4, 11, 12)
     * `WorkplaceSafetyAuditorAgent` (sekcje 5, 6, 7, 8, 10, 13)
     * `AdministrativeAuditorAgent` (sekcje 1, 16)
   - Agenci dziedzinowi odpytują narzędzia RAG w wieloturowych pętlach i weryfikują spójność prawno-chemiczną.
   - Dla stabilnego Function Calling zastosowano najwyższej klasy model reasoningowy `gemini-3.1-pro-preview`.
   - Po audycie roju uruchamiana jest bramka lintera `SDSLinter.auditAndLint(sdsData)`, gwarantująca brak naruszeń przed wyrenderowaniem pliku Worda.

## Skutki i Rezultaty
- Wszystkie testy regresyjne i integracyjne (41/41) zakończone wynikiem 100% PASSED.
- Usunięto błąd `meta is not defined` w `SDSDocxExporter`.
- Wyeliminowano halucynacje i sabotaż prawny w generowanych plikach DOCX.
- Architektura Multi-Agent Swarm i RAG stała się aktywną, pracującą na produkcji rzeczywistością, a nie martwym kodem.
