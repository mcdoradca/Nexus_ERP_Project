# ADR-0120: Deterministyczna Synteza Ostrzeżeń Bezpieczeństwa GPSR na Podstawie Składu (INCI) z Wykorzystaniem Bazy Wiedzy SDS

## Status
Przyjęty i wdrożony (100% Produkcja) - 2026-09-30

## Kontekst Biznesowy i Regulacyjny
W ramach unijnego Rozporządzenia Ogólnego o Bezpieczeństwie Produktów (GPSR - Rozporządzenie Parlamentu Europejskiego i Rady (UE) 2023/988), każda oferta handlowa w handlu elektronicznym (w tym Allegro, BaseLinker, marketplace'y) musi zawierać zrozumiałe dla konsumenta ostrzeżenia i informacje dotyczące bezpieczeństwa produktu w języku polskim.

W potoku ofertowym Offer Optimizer V2 (`EAN Pipeline`), ostrzeżenia o bezpieczeństwie (`safety_warnings`) były dotychczas pozyskiwane z dwóch źródeł:
1. Systemu PIM (jeśli były wprost wpisane na karcie produktu w BaseLinkerze).
2. Agenta 1 (OSINT Scraper), który próbował odnaleźć oficjalne ostrzeżenia z etykiety w sieci.

W sytuacji, gdy dany produkt nie posiadał wyekstrahowanych ostrzeżeń w PIM ani w OSINT, Agent 5 generował pustą tablicę `mandatory_safety_warnings: []`, a w gotowej ofercie `safety_warnings` pozostawało puste. Stwarzało to bezpośrednie ryzyko odrzucenia oferty przez marketplace lub naruszenia wymogów GPSR, mimo że system dysponował pełnym i zweryfikowanym składem produktu (INCI dla kosmetyków lub składem chemicznym dla chemii gospodarczej). Jednocześnie projekt posiada zaawansowaną bazę wiedzy z modułu SDS (`src/modules/sds/rag_knowledge/euphrac_ssot.json` i `echa_phrases_pl.json`), zawierającą zwroty bezpieczeństwa (CLP P-phrases), procedury pierwszej pomocy oraz reguły klasyfikacji zagrożeń.

## Podjęte Decyzje Architektoniczne

1. **Utworzenie Dedykowanego Serwisu Bezpieczeństwa GPSR (`GpsrSafetyService`):**
   - Utworzono plik `src/modules/offer-optimizer-v2/services/gpsr.safety.service.js`.
   - Zaimplementowano silnik regułowy łączący analizę toksykologiczną składników INCI z urzędowymi zwrotami bezpieczeństwa P (CLP/ECHA):
     * **Alergeny zapachowe (Rozporządzenie (UE) 2023/1545 oraz klasyczne 26 alergenów):** Wykrywanie m.in. Linalool, Limonene, Geraniol, Citronellol, Coumarin, Hexyl Cinnamal itp. Generowanie ostrzeżenia o ryzyku reakcji alergicznych oraz zalecenia próby uczuleniowej.
     * **Retinoidy (Rozporządzenie (UE) 2024/996):** Wykrywanie Retinolu, Retinalu, Retinyl Palmitate. Generowanie restrykcyjnego ostrzeżenia o konieczności stosowania filtrów UV (SPF 50+) oraz przeciwwskazaniu dla kobiet w ciąży i karmiących piersią.
     * **Kwasy złuszczające (AHA/BHA):** Wykrywanie Glycolic Acid, Salicylic Acid, Lactic Acid, Mandelic Acid. Generowanie ostrzeżenia o zwiększonej wrażliwości skóry na słońce i ochronie fotoprotekcyjnej.
     * **Surfaktanty i środki pianotwórcze:** Wykrywanie SLS, SLES, Sodium Laureth Sulfate, C14-16 Olefin Sulfonate. Wstrzykiwanie procedury ochrony oczu opartej na zwrocie P305+P351+P338 (obfite płukanie wodą w razie kontaktu).
     * **Alkohole lotne i aerozole:** Wykrywanie Alcohol Denat., Isopropyl Alcohol, Butane, Propane, Isobutane. Generowanie ostrzeżenia o łatwopalności z procedurą P210 (ochrona przed źródłami ciepła i zapłonu).
     * **Ochrona dzieci (P102):** Obligatoryjne wstrzyknięcie zwrotu *"Chronić przed dziećmi"* dla wszelkich produktów chemii gospodarczej lub preparatów ze składnikami aktywnymi.
     * **Bezpieczny Fallback:** Dla neutralnych produktów kosmetycznych bez składników ryzyka generowane jest uniwersalne, profesjonalne zalecenie unikania kontaktu z oczami, stosowania zewnętrznego i wykonania próby uczuleniowej.

2. **Wzbogacenie Promptu Agenta 5 (`Offer Structurer & Compliance Engine`):**
   - Zaktualizowano szablony `src/modules/offer-optimizer-v2/prompts/Agent_5_compiled.md` oraz `src/modules/offer-optimizer-v2/docs/Agent_5_prompt_v4.md`.
   - Dodano **Dyrektywę 4**: w przypadku braku oficjalnych ostrzeżeń z etykiety, Agent 5 ma bezwzględny obowiązek wykorzystać dostarczony obiekt `gpsr_safety_baseline` oraz skład INCI do zsyntetyzowania 2–4 konkretnych, ustandaryzowanych ostrzeżeń GPSR w języku polskim.
   - Wprowadzono zakaz zwracania pustej tablicy `mandatory_safety_warnings: []`, gdy w danych wejściowych obecny jest skład produktu.

3. **Orkiestracja Potoku i Tarcza Defensywna (`orchestrator.js`):**
   - Przed wywołaniem Agenta 5 orkiestrator generuje zestaw ostrzeżeń bazowych za pomocą `gpsrSafetyService.generateGpsrWarnings` i przekazuje je do kontekstu jako `gpsr_safety_baseline`.
   - Wprowadzono tarczę defensywną po wykonaniu Agenta 5: jeśli model LLM mimo to zwróciłby pustą tablicę `mandatory_safety_warnings`, orkiestrator automatycznie wstrzykuje deterministyczny baseline z `gpsrSafetyService`.
   - Ostrzeżenia trafiają zarówno do tablicy `safety_warnings: { source: 'a5' }` w finalnym obiekcie oferty, jak i do Sekcji 6 opisu HTML, chronionej hashem SHA-256.

## Weryfikacja i Testy
- Utworzono dedykowaną suitę testową: `src/modules/offer-optimizer-v2/tests/gpsr.safety.test.js`.
- Przetestowano 7 kluczowych scenariuszy:
  1. Wykrywanie alergenów zapachowych (UE 2023/1545).
  2. Wykrywanie retinoidów z rygorem UV i ciążowym (UE 2024/996).
  3. Wykrywanie kwasów złuszczających AHA/BHA z zaleceniem SPF.
  4. Wykrywanie silnych detergentów z procedurą płukania oczu P305+P351+P338.
  5. Wykrywanie alkoholi lotnych i aerozoli z ostrzeżeniem łatwopalności.
  6. Generowanie bezpiecznego fallbacku dla kosmetyków o łagodnym składzie.
  7. Priorytetyzacja oficjalnych ostrzeżeń, jeśli zostały już podane przez producenta/PIM/A1.
- Wszystkie 129 testów w repozytorium przeszły w 100% z wynikiem pozytywnym (`pass 129, fail 0`).
