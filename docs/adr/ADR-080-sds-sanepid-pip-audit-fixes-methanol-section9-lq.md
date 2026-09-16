# ADR-080: Wdrożenie zaleceń audytu Sanepid / PIP: obsługa metanolu w Sekcji 3.2 i 8.1, Załącznik II REACH w Sekcji 9.1, formatowanie LQ w 14.6

## Status
ZAAKCEPTOWANY / WDROŻONY

## Kontekst i Problem
Audyt zgodności prawno-chemicznej (standard Sanepid / PIP) nowo przetłumaczonej 25-stronicowej karty charakterystyki PDF wykazał 5 krytycznych niezgodności:
1. **Zniknięcie metanolu (CAS 67-56-1) w Sekcji 3.2 oraz zanieczyszczenie acetonu:**
   - W karcie PDF jako 9. składnik widnieje METHANOL ($0 < x < 0,05\%$) z numerem indeksowym `INDEX 603-001-00-X`. Z powodu użycia w regexie ograniczenia do cyfry kontrolnej `\d{3}-\d{3}-\d{2}-\d` zamiast `[\dXx]`, metanol został pominięty jako składnik.
   - W konsekwencji cały blok metanolu (wraz z nagłówkiem strony PDF `Dated 05/12/2024 Suarez Company` oraz klasyfikacjami toksyczności ostrej H301/H311/H331, STOT SE 1 H370, STOT SE 2 H371, ATE) został wchłonięty do komórki klasyfikacji poprzedzającego składnika (acetonu).
   - Wiersz etanolu został zanieczyszczony nazwą kolejnego składnika (`benzyl salicylate`) przez brak granic słowa wokół tokenu `ATE` (słowo `SALICYLATE` kończy się na `ATE`).
2. **Brak metanolu w Sekcji 8.1 (Polskie normatywy NDS i DNEL/PNEC):**
   - Z powodu nieobecności CAS 67-56-1 w wyekstrahowanych składnikach oraz braku rekordu w `nds_database_2018.json`, metanol nie otrzymał polskich wartości NDS (100 mg/m³), NDSCh (300 mg/m³) oraz notacji "skóra" (Dz.U. 2018 poz. 1286 / Dz.U. 2024 poz. 1017).
3. **Błędne "Nie dotyczy" dla parametrów cieczy w Sekcji 9.1 (REACH Załącznik II / UE 2020/878):**
   - W karcie dla cieczy zwroty "not available" i "non disponibile" były bezwarunkowo tłumaczone na "Nie dotyczy". Ciecz zawsze posiada fizyczną gęstość i lepkość; zgodnie z prawem brak badań oznacza "Brak danych" (not available) lub "Nie oznaczono" (not determined).
4. **Rozbicie jednostki 'L' pod obrazkiem rombu LQ w Sekcji 14.6:**
   - Wiersz `Ilości ograniczone (LQ): 1` został rozdzielony z jednostką `L` w PDF, powodując zepchnięcie litery `L` do osobnego akapitu pod obrazkiem rombu LQ.
5. **Literówka w Sekcji 10.3:**
   - Słowo `srebreem` zamiast `srebrem`.

## Podjęte Decyzje Architektoniczne
1. **CLP Annex VI Index Regex (`[\dXx]`):**
   - Rozszerzono regexy w `parseLimsSection3`, `parseSection3Components` i `isLimsFormat` o obsługę znaku 'X' (suma kontrolna modulo 11): `\d{3}-\d{3}-\d{2}-[\dXx]`.
2. **Hermetyzacja składników i eliminacja fałszywych trafień ATE:**
   - Dodano wywołanie `SDSProcessorEngine.cleanPdfArtifacts(cleanText)` na wejściu do `parseLimsSection3`.
   - Zabezpieczono token `ATE` granicami słowa `\bATE\b` oraz `\bATE\s*[:=\(]`, uniemożliwiając fałszywe klasyfikowanie estrów (salicylanów, octanów itp.) jako reguł toksyczności ostrej.
   - Wprowadzono detekcję `nextRawName` w bloku komponentu i odcięcie nazw kolejnych substancji przed ich wyciekiem do komórek klasyfikacji.
   - Dodano obsługę `ATE Inhalation vapours` $\rightarrow$ `ATE (inhalacyjnie, pary) = ...`.
3. **Baza NDS RP i Słowniki CAS:**
   - Dodano CAS 67-56-1 (Metanol, NDS: 100 mg/m³, NDSCh: 300 mg/m³, uwagi: "skóra") do `nds_database_2018.json`.
   - Dodano metanol i aceton do `CAS_TO_PL_MAP`, `ALLERGEN_NAMES_PL` oraz `ecotox_cache.json`.
4. **Zgodność z Załącznikiem II do REACH (UE 2020/878) w Sekcji 9.1:**
   - Przebudowano `normalizePhysChemValue`:
     - `not determined` / `non determinato` $\rightarrow$ "Nie oznaczono"
     - `not available` / `non disponibile` $\rightarrow$ "Brak danych"
     - `not applicable` / `non applicabile` $\rightarrow$ "Brak danych" dla lepkości, gęstości i względnej gęstości pary cieczy; "Nie dotyczy (produkt płynny)" dla charakterystyki cząsteczek.
5. **Scalanie jednostek LQ w Sekcji 14.6:**
   - W `processSection14` dodano scalanie rozbitych wierszy `clean.replace(/...LQ...[0-9]+\s*\n\s*(L|lt|kg|ml)\b/gi)`.
   - W `SDSDocxExporter` wprowadzono pętlę indeksowaną, która po wykryciu osieroconej jednostki na następnej linii scala ją do nagłówka LQ i pomija linię, zabezpieczając przed powstaniem akapitu pod rombem ADR.
6. **Korekta ortograficzna w Sekcji 10:**
   - Wdrożono sanityzację `srebreem` $\rightarrow$ `srebrem` w `cleanPdfArtifacts` oraz `mergeCompletedSds`.

## Konsekwencje
- Metanol jest bezbłędnie wyekstrahowany z pełnymi klasyfikacjami i ATE, trafiając do NDS w sekcji 8.1 oraz do sekcji 12.
- Wiersze acetonu i etanolu są w 100% wolne od zanieczyszczeń nagłówkami i nazwami sąsiednich składników.
- Właściwości fizykochemiczne są w pełni zgodne ze standardem Sanepidu, PIP i Załącznikiem II REACH.
- Akapity DOCX dla LQ w sekcji 14.6 posiadają spójny format inline (`1 L`) nad rombem ADR.
- Pełen zestaw 122+ testów bazowych oraz 5 dedykowanych testów audytowych Sanepid / PIP przechodzi ze statusem 100% PASS.
