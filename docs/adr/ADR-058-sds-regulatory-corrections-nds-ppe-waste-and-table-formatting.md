# ADR-058: Eliminacja Błędów Formatowania Tabel, Aktualizacja NDS (Dz.U. 2024 poz. 1017), Proporcjonalność ŚOI, Sanityzacja Hierarchii Sekcji 11 i Poprawność Kwalifikacji Odpadów

## Status
Zaakceptowany i wdrożony.

## Kontekst i Problem
Audyt zewnętrzny wygenerowanych kart SDS wykazał 6 problemów wynikających z ułomności parserów PDF, nieaktualnej bazy referencyjnej oraz nadgorliwości heurystyk:
1. **Sekcja 3.2 (Błąd w tabeli DOCX):** W przypadku stężeń łamanych w PDF na dwie linijki (np. `≥0.00015%-\n<0.0015%`), pierwsza linijka stężenia C(M)IT/MIT wyciekała do kolumny klasyfikacji CLP poprzedniego składnika (salicylanu benzylu: `Skin Sens. 1B, H317≥0.00015%-`), a dolny próg w kolejnym wierszu był obcinany do `< 0,0015 %`.
2. **Sekcja 8.1 (Krajowe normatywy NDS):** Generowano informację, że dla C(M)IT/MIT (CAS: 55965-84-9) nie określono wartości NDS w Polsce. Zgodnie z Rozporządzeniem MRPiPS z dnia 24 czerwca 2024 r. (Dz.U. 2024 poz. 1017) substancja ta posiada obowiązujące w Polsce wartości: NDS 0,2 mg/m³, NDSCh 0,4 mg/m³ oraz notację „skóra”. Baza NDS w systemie bazowała na pierwotnym tekście z 2018 roku bez nowelizacji.
3. **Sekcja 8.2 (Środki Ochrony Indywidualnej):** Narzucano bezwzględny wymóg gogli szczelnych PN-EN 166 i rękawic chemoodpornych PN-EN ISO 374-1 dla produktu, który w Sekcji 2.1 nie jest zaklasyfikowany jako stwarzający jakiekolwiek zagrożenie (nadgorliwość spowodowana obecnością śladowego konserwantu w sekcji 3).
4. **Sekcja 11 (Układ nagłówków 11.1 a–j vs 11.2):** W DOCX nagłówek *11.2. Informacje o innych zagrożeniach* był wklejony pomiędzy punkt g/h a punkty i) i j). Zgodnie z Załącznikiem II do Rozporządzenia (UE) 2020/878 punkty i) oraz j) należą obligatoryjnie do podsekcji 11.1, a nagłówek 11.2 musi znajdować się dopiero po punkcie j). Błąd wynikał z bezkrytycznego przepisania przez LLM błędu podziału stron z zagranicznego PDF.
5. **Sekcja 12.3 (Zdolność do bioakumulacji):** Pomijano dane BCF dla substancji, w których w PDF brakowało etykiety `Value:` lub użyto słowa `Bioaccumulative` zamiast `Not bioaccumulative` (np. salicylan benzylu BCF = 311).
6. **Sekcja 13 (Kwalifikacja odpadów):** Dla produktu niesklasyfikowanego w Sekcji 2.1 nadawano kod odpadu niebezpiecznego z gwiazdką `20 01 29*` (*Detergenty zawierające substancje niebezpieczne*). Zgodnie z ustawą o odpadach i Katalogiem Odpadów (Dz.U. 2020 poz. 10) właściwym kodem jest `20 01 30` (odpad inny niż niebezpieczny).

## Podjęte Decyzje Architektoniczne

### 1. Naprawa Parsera Sekcji 3.2 (`SDSchemicalExtractor.parseSection3Components`)
- Zaimplementowano wstępne łączenie połamanych linii zakresów stężeń (`cleanText.replace(...)`) przed tokenizacją wierszy.
- Wdrożono ujednolicony regex `concPattern` obsługujący zakresy dwuprocentowe (`≥0.00015% - <0.0015%`) oraz stężenia z myślnikami.
- Wdrożono rygorystyczne wyznaczanie `rowEnd` oparte o indeks kolejnego stężenia oraz sanityzację pola `classText`, usuwającą wszelkie resztki stężeń z klasyfikacji.
- Ujednolicono metodę `formatConcentration` eliminując zdublowane znaki `%` w zakresach.

### 2. Aktualizacja Bazy NDS o Nowelizację Dz.U. 2024 poz. 1017
- Rozszerzono bazę `src/modules/sds/rag_knowledge/nds_database_2018.json` do 552 pozycji o substancje znowelizowane w Dz.U. 2024 poz. 1017, w tym:
  - CAS `55965-84-9`: NDS: `0,2 mg/m³`, NDSCh: `0,4 mg/m³`, uwagi: `skóra`.
  - Pozostałe pozycje: czerwień zasadowa 9, N-metyloformamid, 2-metoksypropan-1-ol, dekan-1-ol, 2,6-di-tert-butylo-4-metylofenol, 1-etylo-2-pirolidon, enfluran, fosforan trifenylu, ftalan diizobutylu, metakrylan 2,3-epoksypropylu, oksym butan-2-onu, 1,2-dihydroksybenzen, kwas benzoesowy, N-nitrozodipropyloamina.
- Poprawiono mapowanie pól w `processSection8` (`entry.substance`, `entry.NDS`, `entry.NDSCh`, `entry.NDSP`, `entry.uwagi`) oraz dodano powołanie tekstu jednolitego z Dz.U. 2024 poz. 1017.
- Wprowadzono automatyczne ładowanie rejestru `NDSRegistry` w konstruktorze `SDSProcessorEngine`.

### 3. Proporcjonalność ŚOI w Sekcji 8.2
- Zmodyfikowano heurystykę: badana jest klasyfikacja całej mieszaniny w Sekcji 2.1 (`hasMixtureHazard`).
- Dla produktów niesklasyfikowanych w Sekcji 2.1 wdrożono dwutorowe zalecenia:
  - *Normalne warunki stosowania konsumenckiego:* środki ochrony indywidualnej nie są wymagane (zgodnie z oceną ryzyka w karcie źródłowej PDF).
  - *Warunki przemysłowe / przeładunek hurtowy / usuwanie awarii:* zaleca się stosowanie rękawic odpornych na chemikalia (PN-EN ISO 374-1) oraz okularów ochronnych (PN-EN 166).
- Dla produktów zaklasyfikowanych jako stwarzające zagrożenie (H318/H319, H314/H315/H317, H224/H225) zachowano bezwzględny obowiązek stosowania certyfikowanych ŚOI.

### 4. Sanityzacja Hierarchii Sekcji 11 (11.1 a–j vs 11.2)
- Zaimplementowano metodę `SDSProcessorEngine.sanitizeSection11Hierarchy(content)` uruchamianą w `mergeCompletedSds`: wykrywa nagłówek 11.2 wklejony przed punktami h, i, j i przenosi go poniżej punktu j).
- Zaktualizowano `SYSTEM_PROMPT` w `sds.agent.js` o regułę nakazującą zachowanie punktów a–j w podsekcji 11.1 przed nagłówkiem 11.2.

### 5. Rozszerzenie Parsera Bioakumulacji w Sekcji 12.3
- Uelastyczniono rozpoznawanie deklaracji: obsługa `Bioaccumulative` oraz `Not bioaccumulative`.
- Wdrożono uniwersalne wyrażenia regularne dla BCF (`BCF = 311`, `BCF: 311`, `Value: = 334.6`) i log Kow.
- Dodano powiązanie wpisów ekotoksykologicznych z nazwami składników z Sekcji 3 (`components`) w przypadku braku numeru CAS w wierszu.

### 6. Poprawa Kwalifikacji Odpadów w Sekcji 13
- Kody odpadów niebezpiecznych z gwiazdką `*` (np. `20 01 29*`, `07 06 04*`, `16 03 05*`) są przypisywane WYŁĄCZNIE wtedy, gdy cała mieszanina w Sekcji 2.1 jest zaklasyfikowana jako stwarzająca zagrożenie.
- Dla mieszanin niesklasyfikowanych bezwzględnie stosowane są kody inne niż niebezpieczne: komunalne `20 01 30` oraz przemysłowe `07 06 99` / `16 03 06`.

### 7. Rozszerzenie Agenta Audytora (`SDSVerifierAgent`)
- Wdrożono nowe reguły kontroli: `PPE_PROPORTIONALITY_COMPLIANCE`, `NDS_2024_COMPLIANCE`, `SECTION_11_HIERARCHY_FIX` oraz `WASTE_CODE_CLASSIFICATION_FIX`.

## Wyniki Weryfikacji
1. `tests/sds.compliance.test.js`: 7/7 testów zakończonych sukcesem (czas: 330 ms).
2. Pełny pakiet testów systemowych repozytorium (`npm test`): 122/122 testów PASSED, kod 0.
3. Test end-to-end na realnym pliku PDF `docs/SDS/8051944811087_SDS_NAJMA.pdf`: pełna zgodność regulacyjna, zerowa liczba naruszeń.
