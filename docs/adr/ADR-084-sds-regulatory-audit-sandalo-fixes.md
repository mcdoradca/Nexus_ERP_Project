# ADR-084: Wdrożenie poprawek audytu regulacyjnego karty SDS SANDALO (Sanepid / PIP / Sieci handlowe)

## Status
Zaakceptowany (Implemented & Production-Ready)

## Kontekst
Podczas audytu regulacyjnego (Sanepid, Państwowa Inspekcja Pracy, sieci handlowe) karty charakterystyki sporządzonej dla produktu **SWEET HOME - PROFUMATORE AMBIENTE SANDALO** (`docs/SDS/8034055535424_SDS_SANDALO (1).pdf`), wykryto 5 krytycznych uchybień formalno-prawnych i technicznych:
1. **Sekcja 4.1:** Pozostawiony język angielski w opisie pierwszej pomocy dla skóry (`Take off immediately all contaminated clothing...`) oraz wyciek nagłówka strony PDF (`Suarez Company First compilation BLK0276-2 - SWEET HOME - PROFUMATORE AMBIENTE SANDALO 6/35 contamination`) wklejony w środku zdania w podpunkcie ochrony osób udzielających pomocy.
2. **Sekcja 12.1:** Katastrofalne przesunięcie badań ekotoksykologicznych (kaskadowy błąd off-by-one / misallocation) w pętli przeszukującej komponenty. DPGME zostało przypisane do badań kwasu octowego, aceton otrzymał badania octanu 4-tert-butylocykloheksylu (LC50 = 8,6 mg/l), a 4-tert-butylcyclohexyl acetate połączyło badania z DPGME.
3. **Sekcje 2.1 & 2.2:** Naruszenie art. 18 ust. 3 lit. b) rozporządzenia CLP – bezprawne umieszczenie zwrotu `EUH208` dla mieszaniny sklasyfikowanej jako stwarzająca zagrożenie dla zdrowia `Skin Sens.` (`H317`). Wszystkie substancje uczulające wywołujące tę klasyfikację muszą znajdować się na etykiecie pod „Zawiera:”. Brak precyzyjnej podkategorii `Skin Sens. 1A, H317` (wyzwalanej przez aldehyd cynamonowy o SCL $\ge 0,01\%$) oraz ucięcie zwrotu `P501`.
4. **Sekcja 3.2:** Ucięcie wieloczłonowych nazw chemicznych IUPAC do pojedynczych końcówek (`ACETATE`, `MONOMETHYL ETHER`, `OL`, `PENTYL SALICYLATE`), pozostawienie nieprzetłumaczonych uwag klasyfikacyjnych (`Classification note according to Annex VI... B/C`) oraz pominięcie wartości `ATE (inhalacyjnie, pyły/mgły) = 0,501 mg/l` dla fenolu.
5. **Sekcja 8.1:** Przesunięcia i braki w blokach DNEL/PNEC – blok PNEC dla salicylanów został omyłkowo przypisany do `2-ethyl-4-(2,2,3-trimethylcyclopent-3-en-1-yl)but-2-en-1-ol`, pominięto PNEC dla `(±) trans-3,3-dimethyl-5-(2,2,3-trimethylcyclopent-3-en-1-yl)pent-4-en-2-ol` oraz DNEL/PNEC dla `Reaction mass of 1-[(1R*,6S*)-2,2,6-trimethylcyclohexyl]hexan-3-ol...`.

## Podjęte Decyzje Architektoniczne

1. **Uniwersalny filtr nagłówków stron i artefaktów (Strip-Headers):**
   Wdrożono rygorystyczny regex `/(?:^|\n|\b)(?:Suarez\s+Company|Company)[^\n]*[\s\S]{1,500}?\n\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/gi` oraz selektywne usuwanie numerów stron na osobnych liniach `/(?:^|\n)\s*\d{1,3}\s*\/\s*\d{1,3}\s*(?=\n|$)/g`. Zapewniono 100% czystości tekstu w sekcjach 4.1, 8.1 i 12.1.
2. **Sekwencyjna detekcja i dopasowywanie w Sekcji 12.1 (Anti-Shift Engine):**
   Zastąpiono zawodną pętlę `components.forEach` + `extractSubstanceBlock` deterministycznym, dwufazowym silnikiem sekwencyjnym:
   - Faza 1: Wyodrębnienie z tekstu sekcji 12.1 wszystkich kolejnych bloków badawczych wraz z ich nagłówkami (szukając przejść między wskaźnikami `LC50/EC50/NOEC`).
   - Faza 2: Precyzyjne dopasowanie wyekstrahowanych bloków testów do komponentów z Sekcji 3.2 na podstawie znormalizowanych nazw IUPAC, synonimów, CAS i WE, z zabezpieczeniem przed fałszywymi dopasowaniami podciągów. Wyeliminowano całkowicie przesunięcie off-by-one.
3. **Zgodność z CLP Art. 18(3)(b) i Art. 25(6) w Sekcji 2.2:**
   - W `formatEuh208`: jeśli mieszanina posiada w klasyfikacji kod `H317` lub `H334`, funkcja natychmiastowo zwraca `null` (bezwzględny zakaz generowania `EUH208` dla mieszanin sklasyfikowanych jako uczulające).
   - W `processSection2`: przy zaklasyfikowaniu mieszaniny do `H317`, wszystkie składniki uczulające wyzwalające tę klasyfikację trafiają do listy decydentów na etykiecie głównej pod „Zawiera:”, znosząc arbitralny filtr `maxC >= 10`.
   - W sekcji 2.1: precyzyjna kategoryzacja `Skin Sens. 1A, H317` w przypadku obecności aldehydu cynamonowego (SCL $\ge 0,01\%$).
   - Zachowanie `P501` jako krytycznego zwrotu usuwania odpadów przy regule maksymalnie 6 zwrotów P.
4. **Wsteczna agregacja wielowierszowych nazw i uwag w Sekcji 3.2:**
   - `parseLimsSection3` łączy połamane linie tabeli (np. `Classification note` + `according to Annex VI...: B/C` -> `Uwaga B/C zgodnie z załącznikiem VI do rozporządzenia CLP`).
   - Odzyskanie pełnych wartości `ATE (inhalacyjnie, pyły/mgły) = 0,501 mg/l` dla fenolu oraz `ATE (droga pokarmowa) = 2000 mg/kg` dla masy poreakcyjnej salicylanu.
5. **Precyzyjne powiązanie DNEL/PNEC z komponentami (Sekcja 8.1):**
   - Wdrożono normalizację myślników `[—–]` i elastyczność białych znaków `\s+` w dopasowaniu nazw wieloczłonowych (np. `(±) trans-3,3-dimetylo...`).
   - Wymuszono weryfikację nagłówka przed blokami `Predicted no-effect` / `Health - Derived`, uniemożliwiając kradzież PNEC salicylanu przez substancje bez badań.
6. **Bramka Jakości (SDSLinter):**
   Dodano do `SDSLinter` reguły:
   - Reguła 9: Zakaz `EUH208` przy `H317` (CLP Art. 18(3)(b)).
   - Reguła 10: Zakaz pozostawiania nagłówków stron (running headers) w treści sekcji.
   - Reguła 11: Obowiązkowa obecność zwrotu `P501` dla mieszanin stwarzających zagrożenie.

## Skutki i Weryfikacja
- Wszystkie 5 punktów audytu zostało w 100% zaimplementowanych i zweryfikowanych dedykowanym zestawem testów w `tests/sds.sandalo_audit.test.js` (6/6 PASS).
- Testy regresyjne `sds.talco_audit.test.js` (7/7 PASS), `sds.8_points_audit.test.js` (PASS) oraz `sds.zero_hardcodes.test.js` (100% PASS) potwierdziły pełną stabilność i brak regresji.
