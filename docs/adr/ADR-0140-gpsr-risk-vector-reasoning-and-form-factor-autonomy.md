# ADR-0140: Ewolucja Nadzoru GPSR z Determinizmu Kodowego do Wnioskowania o Wektorach Ryzyka i Postaci Produktu

## Status
Przyjęty i wdrożony (100% Produkcja) - 2026-10-13

## Kontekst i Problem Dziedzinowy
W potoku ofertowym Offer Optimizer V2 (EAN Pipeline), wyroby stałe i artykuły higieniczne (np. woskowana nić dentystyczna) otrzymywały w sekcji 6 opisu ofertowego absurdalny i nieadekwatny zestaw ostrzeżeń:
- `P305+P351+P338 – W przypadku dostania się do oczu ostrożnie płukać wodą przez kilka minut.`
- `P102 – Chronić przed dziećmi.` (w kontekście chemicznym, z pominięciem fizycznych wektorów uduszenia/zadławienia)
- Zalecenia przechowywania w akapicie wprowadzającym: `Przechowywać w szczelnie zamkniętym fabrycznym opakowaniu z dala od źródeł ciepła i promieni słonecznych. Chronić przed mrozem.`

### Przyczyny Źródłowe
1. **Fałszywa flaga chemiczna w orkiestratorze (`orchestrator.js`):**
   Węzeł przygotowawczy orkiestratora na sztywno oznaczał flagę `chemical_route = true` (z powodu `SDS_STATUS_UNKNOWN` i `HAS_INCI`), przekazując `isChemical: true` do `GpsrSafetyService`. Serwis kwalifikował każdy produkt jako chemię gospodarczą / detergent podlegający CLP/SDS i generował procedurę P305 dotyczącą oczu.
2. **Kaganiec decyzyjny Agenta 5 (`Agent_5_compiled.md`):**
   Prompt Agenta 5 zawierał rygorystyczną klauzulę zakazu usuwania lub modyfikacji zwrotów H/P przekazanych w baseline. Agent widział, że produkt to nić dentystyczna, ale dyrektywa zmuszała go do przepisania P305 (oczy) do `mandatory_safety_warnings`.
3. **Sztywna klisza w szablonie promptu Agenta 6 (`Agent_6_compiled.md`):**
   Akapit wprowadzający sekcji 6 zawierał sztywny przykład z formułką o fabrycznym opakowaniu i „chronieniu przed mrozem”, który model kopiował bezrefleksyjnie dla wszystkich wyrobów.

## Podjęte Decyzje Architektoniczne

1. **Przejście na Analizę Wektorów Ryzyka i Postaci Wyrobu (Risk Vector & Exposure Pathway Reasoning):**
   - Zaktualizowano prompt Agenta 5 (`Agent_5_compiled.md` oraz `docs/Agent_5_prompt_v4.md`).
   - Wprowadzono dyrektywę audytu postaci fizycznej wyrobu (artykuł stały/mechaniczny vs kosmetyk ciekły vs chemia gospodarcza vs aerozol) i dróg narażenia konsumenta.
   - Dla artykułów higieny jamy ustnej i wyrobów stałych (nici, szczoteczki, czyściki) wprowadzono kategoryczny zakaz generowania procedur o płukaniu oczu (P305) i kontakcie ze skórą.
   - Nałożono obowiązek skupienia się na **realnych zagrożeniach dla człowieka i edukacji konsumenta**:
     * Ochrona małych dzieci przed zadławieniem, połknięciem lub uduszeniem/zaplątaniem nici wokół palców lub szyi.
     * Nadzór osoby dorosłej w przypadku stosowania przez dzieci.
     * Bezpieczna technika użycia (ochrona dziąseł przed mechanicznym podrażnieniem, niepołykanie).

2. **Oddzielenie Kwalifikacji Chemii Gospodarczej od Analizy Składu (`orchestrator.js`):**
   - W wywołaniu `gpsrSafetyService.generateGpsrWarnings` flaga `isChemical` bazuje teraz na zmiennej `isActualHouseholdChemical` (kategoria chemiczna, wymagany SDS lub sygnał CLP), a nie na technicznej fladze `chemical_route` używanej do wyzwalania węzła A4.

3. **Wzbogacenie Wiedzy Bazowej w `GpsrSafetyService` (`gpsr.safety.service.js`):**
   - Dodano profil dziedzinowy `ORAL_CARE_ACCESSORY` dla nici dentystycznych i akcesoriów jamy ustnej, dostarczający adekwatny zestaw wyjściowy chroniący dzieci przed zadławieniem i zaplątaniem.

4. **Elastyczne i Edukacyjne Reguły Przechowywania w Agencie 6 (`Agent_6_compiled.md`):**
   - Usunięto zabetonowaną kliszę o „chronieniu przed mrozem”.
   - Nakazano Agentowi 6 dobieranie zaleceń higieny i przechowywania adekwatnie do formy produktu (suche, czyste, higieniczne miejsce z dala od wilgoci i małych dzieci dla wyrobów stałych).

## Weryfikacja
- Zaktualizowano suitę testową: `src/modules/offer-optimizer-v2/tests/gpsr.safety.test.js` o scenariusz woskowanej nici dentystycznej.
- Wszystkie 156 testów modułu `offer-optimizer-v2` (`*.test.js`) przeszły w 100% pozytywnie (`pass 156, fail 0`).
