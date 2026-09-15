# ADR-076: Zero-Hardcodes Audit and Universal Pipeline Sanitization in SDS Engine

## Status
Zaakceptowany (Accepted)

## Kontekst
W toku kompleksowego, całościowego audytu modułu kart charakterystyki SDS (`src/modules/sds/`) pod kątem zabetonowanych, statycznych danych i skrótów programistycznych ("hardcodes"), zidentyfikowano 6 krytycznych obszarów naruszenia reguły uniwersalności (Zero Hardcodes):
1. **Sekcja 4.2:** W `processSection4` fallback alergenu skórnego był ustawiony na sztywno: `const compName = sensComp ? sensComp.name : "kumarynę";`, co przy niewykryciu składnika zafałszowywało skład i wpisywało kumarynę do dowolnej obcej karty.
2. **Sekcja 14 w eksporterze DOCX:** Przypisanie domyślnej klasy ADR `'3'` (`adrClassMatch ? adrClassMatch[1] : '3'`) powodowało, że produkty niepodlegające przepisom transportowym (ADR "Nie dotyczy") otrzymywały fizyczny piktogram transportowy Klasy 3 (materiały ciekłe zapalne).
3. **Filtry paginacyjne dokumentów:** W `cleanPdfArtifacts`, `extractDnelPnec`, `parseLimsSection3` oraz `processSection12` reguły czyszczenia powtarzających się nagłówków wielostronicowych zakładały na sztywno nazwę `Suarez Company` oraz `Suarez`.
4. **Sekcja 1.2:** Wymuszanie zabetonowanego ciągu `(dyfuzor zapachowy do wnętrz)` przy ogólnym wykryciu `air freshener` oraz w regule 13 audytora sanitacji tabeli `- -`.
5. **Sekcja 16 i stopka DOCX:** Sztywne ciągi `ITALLUX Sp. z o.o.` bez pełnej dynamicznej parametryzacji przez `this.companyConfig`.
6. **Prompt audytora Gemini w `SDSVerifierAgent`:** Wzmianki o kumarynie, BHT i Klasie 3 w system prompcie stwarzały ryzyko halucynacji LLM dla innych typów produktów chemicznych.

## Decyzje Architektoniczne
1. **Eliminacja fallbacku kumaryny w Sekcji 4.2:**
   - Usunięto literał `"kumarynę"`.
   - Gdy `sensComp` jest obecny, wywoływane jest `toAccusative(sensComp.name)`. Gdy brak składnika uczulającego w Sekcji 3, generowany jest bezpieczny i poprawny zwrot ogólny: `"U osób szczególnie wrażliwych może wywołać reakcję alergiczną skóry. Przy długotrwałym kontakcie może powodować wysuszenie lub pękanie skóry."`
2. **Warunkowe generowanie nalepki ADR w DOCX:**
   - Usunięto domyślną klasę `'3'`.
   - Nalepka transportowa jest generowana WYŁĄCZNIE, gdy Sekcja 14 nie zawiera oświadczenia o wyłączeniu z przepisów transportowych (`Nie dotyczy / Nie podlega przepisom`) oraz zidentyfikowano rzeczywisty numer klasy ADR.
3. **Uniwersalizacja filtrów nagłówków paginacyjnych:**
   - Wprowadzono strukturalne dopasowania nagłówków dokumentów wielostronicowych w oparciu o sekwencje: `Revision/Revisione/Wersja`, `Dated/Data`, `Printed/Stampato`, `Page/Pagina/Strona`, `Replaced revision`, eliminując zależność od nazwy konkretnego producenta.
4. **Dynamiczne zastosowania w Sekcji 1.2:**
   - Określenie `dyfuzor zapachowy do wnętrz` jest dołączane wyłącznie wtedy, gdy źródłowy plik SDS zawiera wprost słowa `diffusore`, `diffuser`, `reed` lub `bastoncini`. W pozostałych przypadkach stosowane jest czyste tłumaczenie `odświeżacz powietrza`.
5. **Dynamiczny obiekt `companyConfig`:**
   - Zapewniono pełne dziedziczenie parametrów podmiotu (`companyName`, `address`, `city`, `website`, `email`, `phone`) w konstruktorze `SDSProcessorEngine`, Sekcji 1.3, Sekcji 16 oraz stopce DOCX z obsługą zmiennych środowiskowych i dynamicznych nadpisań w locie.
6. **Neutralizacja promptu nadzorczego Gemini:**
   - Zastąpiono produktowo-specyficzne wskazówki w prompcie uniwersalnymi dyrektywami regulacyjnymi REACH/CLP.

## Skutki i Weryfikacja
- Całość silnika SDS stała się w 100% generyczna, odporna na różne typy produktów (detergenty, kosmetyki, perfumy do prania, preparaty techniczne, farby).
- Utworzono dedykowany zestaw testów `tests/sds.zero_hardcodes.test.js` (4/4 testy PASSED).
- Uruchomiono pełny pakiet 122 testów regresyjnych oraz testów prawnych (100% PASSED).
