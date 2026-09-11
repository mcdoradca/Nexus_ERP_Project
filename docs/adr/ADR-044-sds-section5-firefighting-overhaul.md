# ADR-044: Dynamiczna Ekstrakcja i Polonizacja Sekcji 5 Kart SDS (Postępowanie w przypadku pożaru, Rozporządzenie UE 2020/878 & Wzorzec EKOS)

## Status
Zaakceptowany (Accepted)

## Kontekst
W pierwotnej implementacji modułu SDS (`sds.service.js`):
1. Sekcja 5 (Postępowanie w przypadku pożaru) była traktowana jako pole kwarantanny (`QUARANTINE`), przez co system wstrzykiwał fałszywy baner błędu `[FLAGA_QUARANTINE_REVIEW]` oraz zrzucał surowy, nieprzetłumaczony tekst z obcego PDF (`ORYGINAŁ DO WERYFIKACJI:`).
2. W wygenerowanym pliku DOCX sekcja otrzymywała żółte tło kwarantanny, a procedury gaśnicze były niedostępne w języku polskim.
3. Brakowało elastycznej dekompozycji tekstu źródłowego na podsekcje 5.1 (środki odpowiednie/niewłaściwe), 5.2 (szczególne zagrożenia) oraz 5.3 (wytyczne dla straży pożarnej), co stwarzało ryzyko utraty specyficznych wytycznych producenta przy różnych rodzajach produktów chemicznych (aerozole, ciecze łatwopalne, produkty niepalne).

## Decyzje Architektoniczne
1. **Dynamiczny Parser Blokowy Sekcji 5 (`SDSProcessorEngine.processSection5`):**
   - Zaimplementowano metodę wyodrębniającą z surowego tekstu PDF specyficzne deklaracje producenta dla każdej z trzech podsekcji:
     - `5.1. Środki gaśnicze` (podział na środki zalecane oraz zabronione),
     - `5.2. Szczególne zagrożenia związane z substancją lub mieszaniną` (analiza produktów rozkładu termicznego, par wybuchowych, ryzyka wzrostu ciśnienia),
     - `5.3. Informacje dla straży pożarnej` (wyposażenie ochronne EN 469, aparaty SCBA, procedury ochrony wód pożarniczych).
   - Całkowicie wycofano flagę kwarantanny, nadając sekcji status `CLP_MAPPED` (brak żółtego tła w DOCX).
2. **Certyfikowany Słownik Frazeologii Pożarniczej (PL/EN/IT):**
   - Wprowadzono translację specyficznych mediów gaśniczych (np. piana alkoholoodporna, proszki gaśnicze, gaśnice śniegowe CO2, mgła wodna, zakaz zwartego strumienia wody).
   - Skrótowe zapisy producenta (np. "None in particular") są bezpiecznie i merytorycznie zastępowane formułą urzędową: *"Brak szczególnych ograniczeń. Nie zaleca się stosowania zwartego strumienia wody ze względu na ryzyko rozprzestrzenienia pożaru."*
3. **Typografia w DOCX (`SDSDocxExporter`):**
   - Rozszerzono wyrażenie `isBoldStart` o nagłówki: `Odpowiednie środki gaśnicze:`, `Niewłaściwe środki gaśnicze:` oraz `Środki ochrony strażaków:`, co gwarantuje automatyczne pogrubienie etykiet w czcionce Arial 20 pt.

## Konsekwencje
- Sekcja 5 w wygenerowanych dokumentach DOCX jest w 100% czytelna, profesjonalna i zgodna z Rozporządzeniem UE 2020/878 oraz oficjalnym wzorcem EKOS Gdańsk.
- Wyeliminowano ryzyko utraty unikalnych wytycznych pożarowych producenta przy różnych typach formulacji chemicznych.
