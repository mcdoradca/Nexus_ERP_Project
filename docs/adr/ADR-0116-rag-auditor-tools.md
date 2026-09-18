# ADR-0116: Wdrożenie Retrieval-Augmented Generation (RAG) i Function Calling dla Agentów Audytujących

## Status
Zatwierdzony i zaimplementowany (2026-09-18).

## Kontekst
Zidentyfikowano krytyczny błąd metodologiczny (dług architektoniczny): agenci dziedzinowi (Eksperci) byli instruowani poprzez obszerne, sztywne wytyczne w promptach systemowych (tzw. "regexy" i "dupochrony"). Model językowy był zmuszany m.in. do pamiętania o "galaksolidzie", "wycinaniu WGK", "używaniu piasku jako sorbentu" na stałe.
Użytkownik zwrócił uwagę, że podejście to prowadzi do powstania nieskończonej liczby reguł warunkowych, zabija uniwersalność agentów i podważa architekturę Zero-Hardcoding, która zakłada ewaluację kart za pomocą zewnętrznych baz wiedzy, a nie ifologii w prompcie.

## Decyzja
Zdecydowano się na natychmiastowe usunięcie hardkodowanych przypadków z instrukcji systemowych (System Instructions) agentów i całkowite przejście na architekturę **Retrieval-Augmented Generation (RAG)** opartą o **Function Calling (Narzędzia)**.

### Implementacja
1. **LocalKnowledgeConnector**: Dodano symulację bazy SSOT, która zapewnia narzędzia (tools): `lookupPolishNDS`, `querySafetySOP`, `lookupPpeNorms`, `lookupWasteCode`. Moduł docelowo ma parsować surowe akty prawne (np. `docs/SDS/Baza NDS RP.txt`).
2. **ApifyEchaConnector**: Wpięto rzeczywiste odwołania do bazy danych ECHA przez Apify.
3. **Agent Loop**: Agenci (np. `WorkplaceSafetyAuditorAgent`, `HazardClassificationAuditorAgent`, `HealthEnvironmentAuditorAgent`) używają pętli pozwalającej im zgłaszać żądania użycia narzędzi (FunctionCalls), a następnie odbierać informacje z RAG i dopasowywać weryfikację sekcji do twardego prawa.

## Konsekwencje
- **Pozytywne:** Agenci powrócili do roli uniwersalnych analityków tekstu, zachowując bezwzględną czystość kodu. Wiedza ekspercka jest odizolowana od silnika LLM (jest przechowywana w plikach normatywnych / API ECHA).
- **Negatywne (Dług techniczny):** Obecnie `LocalKnowledgeConnector` zwraca gotowe heurystyki. Docelowym etapem jest pełny silnik wektorowy (lub system parserów deterministycznych) dla dzienników ustaw (Dz.U. 2018, Dz.U. 2020), aby w 100% zautomatyzować zwroty NDS i BDO.

## Związane Dokumenty
- Raport przekazania: `HANDOVER.md` (Incydent 18 Wrz 2026).
