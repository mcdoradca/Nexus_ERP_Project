# ADR-060: Potrójna Tarcza Ochronna dla Danych Bioakumulacji w Sekcji 12.3 (Parser, RAG Cache i Verifier Agent)

## Status
ZAAKCEPTOWANY (Wdrożony na produkcji)

## Data
2026-09-14

## Kontekst i Identyfikacja Problemu
W audycie karty charakterystyki stwierdzono pominięcie parametru bioakumulacji dla salicylanu benzylu (CAS: 118-58-1):
> *"salicylan benzylu (CAS: 118-58-1): wykazuje zdolność do bioakumulacji (Bioaccumulative), współczynnik biokoncentracji BCF = 311. Program tłumaczący pominął ten parametr. Wymaga on ręcznego dopisania lub poprawki w regule parsowania sekcji 12.3."*

### Przyczyny źródłowe:
1. **Sztywna zależność granicy podsekcji od sekcji PBT w `clumpedMatch`:**
   W silniku `processSection12` blok 12.3 był wycinany warunkiem `(idxBioAcc !== -1 && idxPbt !== -1) ? workingText.substring(idxBioAcc, idxPbt).trim() : ""`. Jeżeli w karcie sekcja 12.5 zawierała inną formułę (np. po włosku *„Non contiene sostanze PBT”*, *„Valutazione PBT”* lub angielskie *„Assessment of PBT”*), `idxPbt` przyjmowało wartość `-1`, co powodowało wyczyszczenie całego `block3` do pustego stringa.
2. **Brak substancji w systemowym buforze ekotoksykologicznym:**
   W pliku `ecotox_cache.json` brakowało rekordu dla salicylanu benzylu (CAS: 118-58-1), co uniemożliwiało fallbackowe uzupełnienie danych w przypadku problemów z układem tekstu źródłowego.
3. **Niezgodność frazeologiczna z audytem prawnym:**
   Dotychczasowy generator tworzył zapis ze średnikiem i podwójnym dwukropkiem (`wykazuje potencjał bioakumulacji; współczynnik biokoncentracji (BCF): = 311`), podczas gdy audytor prawny wymaga urzędowej formuły: `wykazuje zdolność do bioakumulacji (Bioaccumulative), współczynnik biokoncentracji BCF = 311.`.

## Podjęte Decyzje Architektoniczne (Architektura Potrójnej Tarczy)

1. **Poziom 1: Dynamiczne wyznaczanie granic w parserze (`sds.service.js`):**
   - Usunięto zależność `block3` od `idxPbt`. W przypadku braku znacznika PBT granica podsekcji 12.3 dynamicznie sięga do znacznika zaburzaczy hormonalnych (`idxEndo`), innych skutków (`idxOther`) lub końca tekstu.
   - Rozszerzono regex wyszukiwania bioakumulacji o odmiany językowe (`Bioaccumulat`, `Bioaccumulab`, `Potenziale di bioaccumulo`, `BCF`, `Bioconcentr`).
   - Ujednolicono format wyjściowy: `wykazuje zdolność do bioakumulacji (Bioaccumulative), współczynnik biokoncentracji BCF = [wartość]`.

2. **Poziom 2: Uzupełnienie bazy referencyjnej ECHA/REACH (`ecotox_cache.json`):**
   - Wprowadzono do bufora `src/modules/sds/rag_knowledge/ecotox_cache.json` pozycję dla salicylanu benzylu (CAS: `118-58-1`):
     ```json
     "118-58-1": {
       "name_pl": "salicylan benzylu",
       "biodegradability": "Łatwo biodegradowalny.",
       "bioaccumulation": "wykazuje zdolność do bioakumulacji (Bioaccumulative), współczynnik biokoncentracji BCF = 311.",
       "mobility": "Brak danych.",
       "pbt": false,
       "endocrineDisruptor": false
     }
     ```

3. **Poziom 3: Reguła 9 w Agencie Audytorze (`SDSVerifierAgent`):**
   - Zaimplementowano regułę `SECTION_12_BIOACCUMULATION_COMPLIANCE`, która dla każdego składnika ze składu (Sekcja 3) posiadającego dane bioakumulacji weryfikuje ich obecność w wygenerowanej treści Sekcji 12.3.
   - W przypadku wykrycia pominięcia agent automatycznie wstrzykuje brakujący wpis do punktu „Informacje dotyczące składników” w podsekcji 12.3.

## Weryfikacja
- `tests/sds.compliance.test.js`:
  - `TEST 5`: Standardowa ekstrakcja bioakumulacji.
  - `TEST 5B`: Ekstrakcja przy zbitych nagłówkach i inline CAS z weryfikacją fraz `wykazuje zdolność do bioakumulacji (Bioaccumulative)` i `BCF = 311`.
  - `TEST 7`: Weryfikacja działania auto-remediacji w `SDSVerifierAgent` dla CAS 118-58-1.
- Wynik: 100% PASS we wszystkich testach regulacyjnych.
