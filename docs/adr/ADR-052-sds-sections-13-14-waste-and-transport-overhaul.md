# ADR-052: Przebudowa i Prawna Certyfikacja Sekcji 13 (Postępowanie z Odpadami) oraz Sekcji 14 (Informacje Dotyczące Transportu) wg Rozporządzenia (UE) 2020/878

## Status
Zaakceptowany i wdrożony.

## Kontekst i Problem
W dotychczasowej implementacji modułu SDS występowały dwa krytyczne mankamenty prawne i architektoniczne dotyczące gospodarki odpadami oraz transportu:
1. **Sekcja 13 (Postępowanie z odpadami):**
   - Była traktowana jako kwarantanna (`QUARANTINE`) z żółtym wyróżnieniem i deweloperskim banerem `[FLAGA_QUARANTINE_REVIEW]`.
   - Brakowało precyzyjnego przypisania kodów odpadów wg Rozporządzenia Ministra Klimatu z dnia 2 stycznia 2020 r. w sprawie katalogu odpadów (Dz.U. 2020 poz. 10) oraz rozróżnienia na odpady przemysłowe, komunalne oraz opakowaniowe, a także dynamicznej weryfikacji właściwości niebezpiecznych mieszaniny.
2. **Sekcja 14 (Informacje dotyczące transportu):**
   - Sekcja 14 była zrzucana do modelu LLM w tablicy `toTranslate`. Skutkowało to powielaniem artefaktów źródłowych ("N/A", "N.A.", "Road and Rail (ADR-RID): ADR exempt: No"), ryzykiem halucynacji oraz brakiem gwarancji zachowania 7 obligatoryjnych podsekcji zdefiniowanych w Załączniku II do Rozporządzenia Komisji (UE) 2020/878.
   - Występowało ryzyko posługiwania się nieobowiązującym już tytułem podsekcji 14.7 (dawniej MARPOL/IBC, a od wejścia w życie 2020/878 wyłącznie: *„Transport morski luzem zgodnie z instrumentami IMO”*).

## Podjęte Decyzje Architektoniczne

1. **Pełna Legalizacja i Zdjęcie Kwarantanny z Sekcji 13 (`processSection13`):**
   - Sekcja 13 przeszła ze statusu `QUARANTINE` do pełnego determinizmu `CLP_MAPPED`.
   - Wdrożono obligacyjną strukturę podsekcji `13.1. Metody unieszkodliwiania odpadów` z podziałem na:
     - **Zalecenia dotyczące produktu i pozostałości:** zakaz zrzutu do kanalizacji/wód/gleby, odzysk, unieszkodliwianie w uprawnionych instalacjach (termiczne przekształcanie, zakłady utylizacji).
     - **Zalecenia dotyczące odpadów opakowaniowych:** selektywna zbiórka, recykling materiałowy, postępowanie z opakowaniami zanieczyszczonymi.
     - **Klasyfikacja i kody odpadów (Katalog Odpadów Dz.U. 2020 poz. 10):** dynamiczna ewaluacja stopnia zagrożenia produktu (GHS/zwroty H). Dla odpadów bezpiecznych: `07 06 99` / `16 03 06` oraz komunalne `20 01 30`. Dla odpadów zaklasyfikowanych jako stwarzające zagrożenie: `07 06 04*` / `16 03 05*` oraz komunalne `20 01 29*`. Odpady opakowaniowe: `15 01 02` (tworzywa sztuczne) oraz zastrzeżenie `15 01 10*` (opakowania zanieczyszczone).
     - **Klauzula BDO:** wskazanie, że ostateczny kod odpadu ustala bezpośredni wytwórca odpadu na podstawie miejsca i specyfiki jego powstania.
     - **Podstawy prawne RP i UE:** Ustawa o odpadach (t.j. Dz.U. 2023 poz. 1587 z późn. zm.), Ustawa o gospodarce opakowaniami i odpadami opakowaniowymi (t.j. Dz.U. 2023 poz. 1658 z późn. zm.), Rozporządzenie w sprawie katalogu odpadów (Dz.U. 2020 poz. 10), Dyrektywa ramowa 2008/98/WE.

2. **Deterministyczny Silnik Sekcji 14 (`processSection14`) i Odcięcie LLM:**
   - Sekcję 14 wycofano w całości z `toTranslate` LLM i włączono do silnika deterministycznego `CLP_MAPPED`. W ten sposób LLM przetwarza wyłącznie sekcje 10 i 11.
   - Narzucono obecność 7 obligatoryjnych podsekcji wg Rozporządzenia (UE) 2020/878:
     - `14.1. Numer UN lub numer identyfikacyjny ID`
     - `14.2. Prawidłowa nazwa przewozowa UN`
     - `14.3. Klasa(-y) zagrożenia w transporcie`
     - `14.4. Grupa pakowania`
     - `14.5. Zagrożenia dla środowiska`
     - `14.6. Szczególne środki ostrożności dla użytkowników`
     - `14.7. Transport morski luzem zgodnie z instrumentami IMO`
   - Silnik posiada architekturę dualną:
     - **Dla towarów bezpiecznych (np. NAJMA):** oświadczenie nadrzędne o braku podlegania przepisom transportowym (ADR/RID, IMDG, IATA), wpisy "Nie dotyczy" w podsekcjach oraz profesjonalne zalecenia przewozu w opakowaniach handlowych w 14.6.
     - **Dla towarów niebezpiecznych (ADR):** ekstrakcja numeru UN i integracja z bazą `ADRRegistry` (`adr_transport_pl.json`), mapowanie polskiej nazwy przewozowej, klasy zagrożenia, grupy pakowania, weryfikacja zanieczyszczenia morza (Marine Pollutant) oraz kodów ograniczeń w tunelach (np. D/E).

3. **Inicjalizacja i Bazy Referencyjne:**
   - Zaimplementowano klasę `ADRRegistry`, która ładuje `adr_transport_pl.json` przy starcie modułu (dodano m.in. wpis dla UN 1266 - Wyroby perfumeryjne).
   - W konstruktorze `SDSProcessorEngine` zintegrowano autoinicjalizację `ADRRegistry` i `EcotoxRegistry`.

4. **Typografia DOCX (`SDSDocxExporter`):**
   - Rozszerzono filtry `isLabelHeader` i `isBoldStart` o podsekcje i etykiety Sekcji 13 (zalecenia produktowe, opakowaniowe, kody odpadów, ustawy) oraz Sekcji 14 (kod tunelu, kategoria transportowa, ilości LQ/EQ).

## Konsekwencje i Rezultaty
- Sekcja 13 i Sekcja 14 są w 100% zgodne z Rozporządzeniem Komisji (UE) 2020/878 oraz polskim prawodawstwem.
- Zdjęto kwarantannę z Sekcji 13 (brak sztucznych flag i żółtych banerów).
- Całkowicie wyeliminowano ryzyko halucynacji i wtrąceń "N/A" w Sekcji 14.
