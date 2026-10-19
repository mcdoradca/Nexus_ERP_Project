# ADR-0157: Rekontekstualizacja Formulacji Chemicznych (Detergenty vs CosIng), Integralność Leksyki Medycznej CLP i Dyscyplina Ikonograficzna Sekcji 3

## Status
ZAAKCEPTOWANY / WDROŻONY NA PRODUKCJI

## Kontekst i Problem
1. **Kompromitacja merytoryczna ról składników (Kwas mrówkowy jako konserwant w odkamieniaczu):**
   W potoku EAN Pipeline dla produktów z kategorii chemii gospodarczej (np. odkamieniacz do łazienek) Agent 4 opisał kwas mrówkowy (Formic Acid) jako „konserwant stabilizujący formułę płynu”.
   *Przyczyna:* Słownik `INCI_FUNCTIONS.json` czerpie bezpośrednio z unijnej bazy **CosIng** (Rozporządzenie WE 1223/2009 o kosmetykach), gdzie kwas mrówkowy figuruje w Załączniku V wyłącznie jako konserwant (`PRESERVATIVE`). Orkiestrator wstrzykiwał sztywny wpis CosIng do promptu Agenta 4, a Agent 4 posiadał sztywną dyrektywę zakazu używania wiedzy spoza RAG oraz rolę ograniczoną do „chemika kosmetycznego”. W rezultacie Agent 4 i Agent 6 bezkrytycznie przypisali kwasowi odkamieniającemu rolę konserwantu.
   *Fakt chemiczny:* W detergentach i środkach czyszczących (Rozporządzenie WE 648/2004) kwasy organiczne i nieorganiczne (mrówkowy, cytrynowy, sulfamowy, mlekowy, fosforowy) stanowią **aktywny czynnik odkamieniający (limescale remover)**, roztwarzający osady wapienne, mydlane i rdzę.

2. **Uszkodzenie procedur pierwszej pomocy CLP przez nadgorliwy filtr antykontaktowy:**
   Tarcza `stripContactInfo` zastosowała nieostrożny regex z prefiksami słów bez prawej granicy `\b`, co doprowadziło do dewastacji języka polskiego:
   - Słowo „kontaktowe” zamieniło się w „owe” („Wyjąć soczewki owe...”).
   - Słowo „KONTAKTU” zamieniło się w „U” („W PRZYPADKU U ZE SKÓRĄ”).
   - Słowo „Kompleks” zamieniło się w „pleks” („pleks neutralizujący”).
   W karcie charakterystyki wyrobu stwarzającego zagrożenie (H318/H315) ucięcie instrukcji ratowniczych stanowiło bezpośrednie zagrożenie dla użytkownika.

3. **Chaos wizualny w Sekcji 3 (zielone koniczynki ☘ zamiast ⚙️ i ⚡):**
   W `SHARED_RULES_v4.1.md` dopuszczono znak `☘`, a prompt Agenta 6 dopuszczał punktor `✔️`. Model samowolnie wstawiał koniczynki `☘` do składników naturalnych, niszcząc jednolity design systemu (`⚙️` dla mechanizmów/składników, `⚡` dla synergii).

## Podjęte Decyzje Architektoniczne
1. **Dziedzinowa Rekontekstualizacja Formulacji Chemicznych (Agent 4 & Orchestrator):**
   - Zaktualizowano rolę Agenta 4 w `Agent_4_prompt_v4.md` na: *Ekspert Chemii Formulacyjnej (Kosmetyki, Detergenty i Chemia Gospodarcza) oraz Inżynier Wiedzy GEO/AEO*.
   - Wprowadzono dyrektywę dziedzinową: słownik CosIng reprezentuje zastosowania w kosmetykach. Dla detergentów i chemii czyszczącej (WE 648/2004) Agent 4 ma obowiązek interpretować składniki wg ich fizykochemicznej roli czyszczącej (kwasy = odkamieniacze, surfaktanty = emulgatory/środki myjące, sekwestranty = zmiękczacze).
   - W `orchestrator.js` oznaczono blok RAG jako `[INCI_DICT_COSING]` oraz dodano wytyczną rekontekstualizacji i przekazanie parametru kategorii produktu do `agent4Data`.

2. **Oczyszczenie Tarczy Antykontaktowej `stripContactInfo`:**
   - Całkowicie usunięto jakiekolwiek próby dopasowywania i wycinania słów słownikowych („kontakt”, „kom”).
   - Tarcza została ograniczona wyłącznie do niepodważalnych danych teleadresowych:
     - Adresów e-mail (`[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}`).
     - Linków i domen URL (`https?://`, `www.`).
     - Rzeczywistych numerów telefonów (międzynarodowych z `+` lub z jawną etykietą `tel.`, `infolinia:`, `telefon:`).
   - Wszystkie zwroty CLP („kontakt ze skórą”, „soczewki kontaktowe”) oraz nazwy marketingowe („Kompleks”) są w 100% bezpieczne i nienaruszone.

3. **Dyscyplina Ikonograficzna Sekcji 3:**
   - Wykreślono `☘` z dozwolonych punktorów w `SHARED_RULES_v4.1.md` oraz promptach Agenta 4 i Agenta 6.
   - Narzucono twardy kanon: każdy składnik/właściwość techniczna otrzymuje WYŁĄCZNIE `⚙️`, a każda synergia WYŁĄCZNIE `⚡`.
   - Dodano `⚡` do `allowedSet` w `validators/index.js` (walidator V7 emoji structure check).
   - Zrekompilowano wszystkie prompty przez `prompt-compiler.js`.

## Skutki i Weryfikacja
- Baza testowa powiększona do 208 testów (100% PASSED).
- Testy regresyjne w `tests/brand.responsible.test.js` potwierdzają pełną ochronę zwrotów CLP przed mutilacją.
- Agent 4 posiada pełne uprawnienia domenowe do poprawnego opisywania chemii odkamieniającej i czyszczącej bez ulegania ograniczeniom kosmetycznego rejestru CosIng.
