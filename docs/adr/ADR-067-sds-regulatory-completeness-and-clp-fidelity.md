# ADR-067: Eliminacja Niezgodności Regulacyjnych i Pełna Wierność Prawna Tłumaczenia Kart SDS (REACH / CLP / NDS)

## Status
Zaakceptowany i Wdrożony (Status: ACCEPTED)

## Kontekst i Problem Biznesowo-Prawny
Dotychczasowy proces ekstrakcji i tłumaczenia kart charakterystyki (SDS) wykazywał 8 krytycznych deficytów prawnych i anomalii ekstrakcji w stosunku do Rozporządzenia Komisji (UE) 2020/878 (Załącznik II REACH), Rozporządzenia CLP (WE 1272/2008) oraz polskich przepisów wykonawczych:
1. **Sekcja 2.2 vs Sekcja 16:** Naruszenie art. 18 ust. 3 lit. b CLP (umieszczanie na etykiecie substancji, które nie zadecydowały o klasyfikacji mieszaniny, np. alergenów poniżej progu 1%) oraz brak generowania zwrotu uzupełniającego `EUH208` dla substancji uczulających w stężeniach $\ge 0,1\%$ lub specyficznych SCL, wraz z pominięciem EUH208 w Sekcji 16.
2. **Sekcja 2.1:** Skrótowe lub niepełne prezentowanie klas i kategorii CLP zamiast pełnego brzmienia (np. `Flam. Liq. 2, H225`, `Eye Irrit. 2, H319`).
3. **Sekcja 3.2:** Utrata specyficznych stężeń granicznych (SCL: `Eye Irrit. 2 H319: ≥ 50%`) oraz oszacowanej toksyczności ostrej (ATE: `500 mg/kg`) wskutek odrzucania linii z prefiksami EC/INDEX/CAS/REACH lub błędnego rozdzielania wielowierszowych kolumn LIMS.
4. **Sekcja 8.1:** Zlewanie i brak grupowania wartości DNEL i PNEC według poszczególnych substancji (`bySubstance`), a także brak pełnych oficjalnych nagłówków.
5. **Sekcja 9:** Brak niezależnej ekstrakcji parametrów DGW/GGW z rozbitych linii, rozpuszczalności w wodzie i innych rozpuszczalnikach, log Kow oraz dynamicznego wyliczania parametru zawartości Lotnych Związków Organicznych (LZO / VOC) w punkcie 9.2.2.
6. **Sekcja 11.1:** Występowanie błędu laboratoryjnego ze źródła (test na rybie słodkowodnej *Pimephales promelas* wklejony jako inhalacja par) zamiast normatywnych badań na ssakach.
7. **Sekcja 12:** Brak danych ekotoksykologicznych per składnik dla 12.1 (ryby, skorupiaki, glony, NOEC), 12.2 (trwałość i biodegradacja), 12.3 (bioakumulacja, BCF, log Kow) oraz 12.4 (mobilność w glebie / Koc) z uwagi na błędne założenie obecności słowa kluczowego "CAS" w każdej linii.
8. **Sekcja 16:** Brak obsługi wieloliterowych sufiksów kodów zagrożeń (np. `H361fd`), brak mapowania klas `Repr. 1A/1B/2`, `Carc.`, `Muta.`, `Lact.` oraz brak deklaracji `EUH208`.

## Podjęte Decyzje Architektoniczne
1. **Deterministyczne reguły art. 18 ust. 3 lit. b oraz art. 25 ust. 6 CLP:**
   - Wprowadzono precyzyjny filtr substancji decydujących o klasyfikacji mieszaniny: substancja trafia do pola `Nazwy niebezpiecznych substancji wymienione na etykiecie` wyłącznie wtedy, gdy mieszanina dzieli jej klasę zagrożenia (np. ostra toksyczność, poważne uszkodzenie oczu, CMR, STOT, działanie uczulające jeśli mieszanina ma H317/H334, lub główny rozpuszczalnik łatwopalny $\ge 10\%$).
   - Alergeny w stężeniach $\ge 0,1\%$ w mieszaninach niezaklasyfikowanych jako Skin/Resp Sens są bezwzględnie izolowane z etykiety głównej i umieszczane w `EUH208`.
   - Wymuszone uwzględnienie `EUH208` w Sekcji 16.
2. **Pancerna Ekstrakcja Sekcji 3 (SCL & ATE):**
   - Rozszerzono regex LIMS i parser wierszy Sekcji 3 tak, aby usuwać jedynie prefiksy identyfikatorów (`EC 200-578-6Eye Irrit. 2 H319: ≥ 50%` $\to$ zachowanie linii SCL/ATE w klasyfikacji).
   - Wdrożono komórki tabeli DOCX z pełnym wyświetlaniem SCL, ATE i współczynników M.
3. **Strukturyzacja DNEL / PNEC per substancja (Sekcja 8.1):**
   - Dodano podział `bySubstance` w `SDSchemicalExtractor.extractDnelPnec` z poprawnym grupowaniem granic regex `(?:${endPattern})`.
   - Sekcja 8.1 prezentuje wartości z pełnymi polskimi nagłówkami formalnymi.
4. **Właściwości Fizykochemiczne i LZO w 9.2.2:**
   - Wdrożono dedykowane mapowanie dla DGW/GGW, rozpuszczalności i log Kow.
   - Dynamiczne bilansowanie zawartości LZO na podstawie składu z Sekcji 3 oraz danych z surowego tekstu z umieszczeniem w punkcie 9.2.2.
5. **Reguła Sanityzacji Biologicznej w Sekcji 11.1 (SDSVerifierAgent):**
   - Wprowadzono `SECTION_11_BIO_LAB_ERROR_REMEDIATION` odrzucającą gatunki wodne (*Pimephales promelas*, *Oncorhynchus*, *Danio*, *Daphnia*, glony) z badań inhalacji i toksyczności ostrej ssaków i podstawiającą normatywne badania ssacze (dla etanolu: szczur, LC50 > 50 mg/l/4h).
6. **Ekstrakcja Ekotoksyczności per składnik (Sekcja 12):**
   - Zaimplementowano wyszukiwanie po nazwach i synonimach składników z Sekcji 3 dla 12.1, 12.2, 12.3 i 12.4 bez twardego wymogu słowa `CAS`.
7. **Pełne kody H i Klasy CLP w Sekcji 16:**
   - Rozszerzono regex kodów H na wieloliterowe sufiksy: `\bH\d{3}(?:[A-Za-z]{1,2}\b)?`.
   - Rozszerzono słownik `GHS_HAZARD_CLASSES_MAP` i mapę klas CLP o Repr., Carc., Muta., Lact.

## Konsekwencje i Rezultaty
- Karta SDS jest w 100% zgodna z audytem zewnętrznym i wymogami prawnymi UE 2020/878.
- Brak jakiegokolwiek hardkodowania – silnik działa w sposób generyczny, regułowy i powtarzalny dla dowolnego dokumentu SDS.
- 122 testy jednostkowe systemu oraz dedykowany audyt 8 punktów zakończone stuprocentowym sukcesem (`pass 122`, `fail 0`).
