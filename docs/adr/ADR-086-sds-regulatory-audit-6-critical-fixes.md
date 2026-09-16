# ADR-086: SDS Regulatory Audit 6 Critical Fixes (Zero Hardcode Compliance)

## Status
Zaakceptowany (Accepted) i wdrożony do produkcji.

## Kontekst i Problem
Audyt regulatoryjny (Sanepid / PIP / sieci handlowe) karty `SWEET HOME - PROFUMATORE AMBIENTE SANDALO` (plik `docs/SDS/8034055535424_SDS_SANDALO org.docx`) wykazał 6 dyskwalifikujących punktów niezgodności z prawem UE i polskim:
1. **Sekcja 1.2:** Fałszywy komunikat „Brak szczegółowych informacji w karcie źródłowej” przy jednoczesnej obecności w pliku źródłowym zastosowania konsumenckiego (odświeżacz powietrza).
2. **Sekcja 2.2:** Wycinanie zwrotów medycznych `P333+P313` oraz `P337+P313` spowodowane destrukcyjnym `slice(0, 6)` oraz powielenie składników w „Zawiera:” w wersjach PL i EN.
3. **Sekcja 3.2:** Brak symbolu `%` w przedziałach stężeń (`74 ≤ x < 78 %`), pozostawienie angielskich uwag CLP (`Substancja z określonymi na poziomie Wspólnoty...`, `Uwaga B`) oraz nieprzetłumaczone prefiksy ATE.
4. **Sekcja 8.1:** Zjawisko matrix-shift w parametrach DNEL/PNEC (BHT otrzymywał wartości metanolu, fenol kwasu octowego), zlepianie 4 wartości DNEL linalolu w ciąg `4,1 / 0,7 / 16,5 / 2,8 mg/m³` oraz zaśmiecenie tabeli separatorami `|`.
5. **Sekcja 9:** Bezzasadne usuwanie urzędowych uzasadnień braku danych (`Reason for missing data: ...` – Załącznik II do UE 2020/878) oraz pozostawianie hybryd językowych (`brown`, `Remark:Visual`, `Easily ciecz łatwopalna and vapors`).
6. **Sekcje 11.1 i 12:** Naruszenie art. 31 REACH poprzez fałszowanie autentycznej wartości inhalacyjnej etanolu (zamiana `120 mg/l/4h` na `> 50 mg/l/4h`), traktowanie kodu nagłówkowego `BLK0276-2` jako organizmu wodnego w 12.1 oraz wycinanie przeczenia `NOT rapidly degradable` w 12.2 dla masy heksan-3-olu.

Bezwzględnym warunkiem technicznym (narzuconym przez użytkownika) było zachowanie zasady **ZERO HARDCODES** – silnik musi działać uniwersalnie dla dowolnej karty SDS.

## Podjęte Decyzje Architektoniczne

1. **Uniwersalna ekstrakcja i polonizacja Sekcji 1.2:**
   - Wdrożono dynamiczny parser tabeli zastosowań identyfikujący kolumny/wiersze konsumenckie, profesjonalne i przemysłowe bez względu na podział linii.
   - Dodano wielojęzyczny słownik kategorii produktów (odświeżacze powietrza, detergenty, perfumy do tkanin, farby, kleje, chłodziwa itp.).

2. **Integralność zwrotów P i deduplikacja (Sekcja 2.2):**
   - Usunięto destrukcyjne obcinanie `slice(0, 6)` w `sds.verifier.agent.js` – zwroty medyczne i ratunkowe nadane przez producenta w Sekcji 2.2 muszą być w 100% zachowane zgodnie z art. 28 ust. 3 CLP i wytycznymi ECHA.
   - Wprowadzono uniwersalną deduplikację składników w „Zawiera:” w oparciu o unikalne klucze CAS i zrejestrowane nazwy polskie.

3. **Standaryzacja tabeli Sekcji 3.2 (DOCX & Text):**
   - W `SDSDocxParser.parseSection3Table` dodano automatyczne dopełnianie brakującego symbolu `%` w przedziałach liczbowych.
   - Wdrożono dynamiczny resolver nazw substancji `resolvePlName` dla złożonych struktur chemicznych i mas poreakcyjnych.
   - Zautomatyzowano translację urzędowych uwag CLP (Noty A–U, noty zharmonizowane Wspólnoty) i prefiksów ATE.

4. **Eliminacja przesunięcia macierzy DNEL/PNEC (Sekcja 8.1):**
   - Dodano precyzyjne granice tokenów substancji `(?:\b|[\s\|\-\)]|$)` eliminujące fałszywe dopasowania (np. kwas octowy z procentem vs fenol).
   - Wdrożono dedykowaną obsługę 4-elementowych zestawów DNEL (inhalacja: ostra/przewlekła dla pracowników i konsumentów) z czytelnym podziałem na grupy docelowe.
   - Oczyszczono wartości PNEC z artefaktów separatorów kolumn `|`.

5. **Legalność i kompletność językowa Sekcji 9:**
   - Zastąpiono kasowanie `Reason for missing data` tłumaczeniem urzędowym:
     - `it only applies to solids` -> `Nie dotyczy (dotyczy wyłącznie ciał stałych)`
     - `property is not relevant to safety and classification` -> `Brak danych (właściwość nie ma znaczenia dla bezpieczeństwa i klasyfikacji produktu)`
     - `organic peroxides / self-reactive` -> `Brak danych (badanie dotyczy wyłącznie substancji ulegających samorzutnemu rozkładowi i nadtlenków organicznych)`
     - `non-soluble` -> `Nie dotyczy (substancja/mieszanina nierozpuszczalna w wodzie)`
   - Wdrożono słownik barw i fraz palności (eliminacja hybryd takich jak `Easily ciecz łatwopalna and vapors`).

6. **Wierność danych toksykologicznych i ekotoksykologicznych (Sekcje 11.1 i 12):**
   - Zachowano autentyczną wartość `120 mg/l/4h` w badaniu inhalacyjnym etanolu, korygując wyłącznie model biologiczny (szczur zamiast ryby Pimephales promelas) bez fałszowania liczb.
   - Odrzucono nagłówki stron i kody produktów (`BLK0276-2`, `SWEET HOME`, `Suarez`, `Revision`) z wykazu organizmów testowych w Sekcji 12.1.
   - W Sekcji 12.2 wprowadzono pierwszeństwo weryfikacji przeczenia `NOT rapidly degradable` / `nie ulega szybkiej degradacji` przed badaniem twierdzącym `rapidly degradable`, a także uodporniono `extractSubstanceBlock` na rozbieżności spacji i myślników w długich nazwach IUPAC.

7. **Harmonizacja Bramki Jakościowej (SDSSchemaValidator Quality Gate vs Art. 28 CLP):**
   - Rozwiązano konflikt jurysdykcyjny pomiędzy regułą etykietowania opakowań (CLP Art. 28 ust. 3: „Na etykiecie umieszcza się zazwyczaj nie więcej niż 6 zwrotów...”) a Kartą Charakterystyki (REACH Art. 31 i Załącznik II - Rozporządzenie UE 2020/878).
   - Karta SDS nie jest fizyczną etykietą opakowania – jej prawnym celem jest dostarczenie pełnego kompendium informacji o zagrożeniach dla całego łańcucha dostaw. Wycinanie autentycznych procedur medycznych (P333+P313, P337+P313), zaleceń prewencyjnych (P210, P302+P352, P305+P351+P338) czy ochrony konsumentów (P101, P102, P501) w imię etykietowego limitu 6 zwrotów stanowiło bezpośrednie naruszenie prawa.
   - W `SDSSchemaValidator` usunięto fałszywą asercję blokującą `pMatches.length > 6`. Wprowadzono kontrolę obecności zwrotów P oraz weryfikację braku duplikatów.

## Skutki i Weryfikacja
- Wszystkie 6 punktów audytu zostało pokrytych dedykowanym testem `tests/sds.audit_6_points_sandalo.test.js`.
- Model SDS z 8 autentycznymi zwrotami P przechodzi pełną walidację w `SDSSchemaValidator.validateFinalSds` bez jakichkolwiek błędów blokujących.
- Zestaw testów `sds.docx_input.test.js`, `sds.zero_hardcodes.test.js`, `sds.8_points_audit.test.js`, `sds.schema.validator.test.js` oraz `sds.audit_6_points_sandalo.test.js` przechodzi w 100% (22/22 testy zielone).
- Brak jakichkolwiek hardkodów na poziomie produktu.
