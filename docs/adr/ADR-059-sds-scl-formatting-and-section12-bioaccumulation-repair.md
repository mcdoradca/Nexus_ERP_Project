# ADR-059: Naprawa integralności przedziałów SCL (Sekcja 3.2) oraz ekstrakcji i formatowania danych bioakumulacji (Sekcja 12.3)

## Status
ZAAKCEPTOWANY (Wdrożony na produkcji)

## Data
2026-09-13

## Kontekst i Identyfikacja Regresji
Podczas audytu jakości wygenerowanych kart SDS w formacie DOCX wykryto dwa krytyczne defekty parsowania tekstu źródłowego:
1. **Sekcja 3.2 – Ucięcie wartości specyficznych stężeń granicznych (SCL):**
   - W tabeli składników wiersze SCL (np. dla mieszaniny C(M)IT/MIT, CAS: 55965-84-9) utraciły przedziały stężeń i nazwy klas zagrożenia (`0,06% ≤ C < 0,6%: Skin Irrit. 2` oraz `0,06% ≤ C < 0,6%: Eye Irrit. 2`), pozostawiając w dokumencie jedynie osierocone kody `H315` oraz `H319` w oddzielnych akapitach tabeli.
   - **Przyczyna źródłowa:** Nadgorliwe wyrażenie regularne mające usuwać resztki stężeń z pola klasyfikacji dopasowywało linie zaczynające się od stężenia procentowego i usuwało całą linię przedziału SCL, pozostawiając kod H złamany do nowej linii jako osierocony akapit.
2. **Sekcja 12.3 – Brak danych bioakumulacji dla substancji (np. salicylanu benzylu, CAS: 118-58-1):**
   - Karta oryginalna w Sekcji 12.3 zawierała dane dla dwóch substancji: salicylanu benzylu (`Bioaccumulative; Test: BCF... Value: = 311`) oraz C(M)IT/MIT (`BCF = 3,16; log Kow ≤ 0,71`), natomiast w DOCX pojawił się wyłącznie C(M)IT/MIT.
   - **Przyczyna źródłowa:**
     a) Funkcja `adjustBoundary` przy kartach ze zbitymi nagłówkami (12.1-12.6 u góry strony) nie cofała indeksu granicy sekcji 12.3, gdy CAS znajdował się inline w tej samej linii przed słowem kluczowym `Bioaccumulative` (np. `benzyl salicylate (CAS: 118-58-1): Bioaccumulative`), w wyniku czego nazwa i CAS były odcinane do sekcji 12.2.
     b) Parser 12.3 po dopasowaniu CAS wywoływał `continue;`, bezpowrotnie porzucając odczyt parametrów testowych BCF i bioakumulacji zawartych w tej samej linii.
     c) Wyrażenie regularne `logMatch` i `bcfMatch` nie obsługiwało operatorów relacyjnych dwuznakowych (`<=`, `>=`) po słowie `Value:`, a także separatorów średnikowych.

## Podjęte Decyzje Architektoniczne
1. **Pętla normalizacji SCL w `parseSection3Components` (`src/modules/sds/sds.service.js`):**
   - Zastąpienie destrukcyjnego regexa selektywnym filtrem: usuwane są wyłącznie samotne, puste stężenia z nagłówków (np. `≥0.00015%-`), podczas gdy wszelkie reguły SCL (związane ze stężeniem `C`, dwukropkiem i klasą zagrożenia) są ściśle chronione.
   - Wdrożenie automatycznego scalania połamanych linii SCL: jeśli po regule SCL w kolejnym wierszu występuje samotny kod `H\d{3}` lub `EUH\d{3}`, zostaje on włączony w jeden wiersz reguły SCL (`0,06% ≤ C < 0,6%: Działanie drażniące na skórę, kategoria 2 H315`).
   - Normalizacja typograficzna: zamiana `<=` / `>=` na `≤` / `≥` oraz kropek dziesiętnych w procentach na polskie przecinki dziesiętne (`0,06% ≤ C < 0,6%`, `C ≥ 0,6%`, `C ≥ 0,0015%`).
2. **Uodpornienie parsera Sekcji 12 (`processSection12`):**
   - **Rozbudowa `adjustBoundary`:** Wykrywanie prefiksu bieżącej linii przed indeksem podziału pod kątem obecności CAS lub nazwy składnika z sekcji 3 – w przypadku trafienia granica cofa się do początku wiersza składnika.
   - **Eliminacja `continue;`:** Usunięcie instrukcji pomijania wiersza po znalezieniu CAS w podsekcjach 12.1, 12.2 i 12.3. Jeśli linia z CAS zawiera dane testowe (`Bioaccumulative`, `BCF`, `EC50`, `biodegradable`), są one natychmiast ekstrahowane.
   - **Udoskonalenie regexów BCF i Log Kow:** Dopasowanie operatorów relacyjnych (`<=`, `>=`, `<`, `>`, `≤`, `≥`, `=`, `~`), obsługa wieloznakowych separatorów (średniki, przecinki) oraz polskiej frazeologii (`Wartość: = 311` -> `współczynnik biokoncentracji (BCF): = 311`).
   - **Standaryzacja wyjścia w 12.3:** Generowanie jednolitej struktury wpisów: `[nazwa] (CAS: [nr]): [potencjał]; współczynnik biokoncentracji (BCF): [wartość]; współczynnik podziału n-oktanol/woda (log Kow): [wartość].`.
3. **Wzmocnienie Agenta Audytora Prawno-Chemicznego (`SDSVerifierAgent`):**
   - Dodano Regułę 8 (`SCL_ORPHAN_H_CODE_REMEDIATION`): automatyczne wykrywanie i scalanie ewentualnych osieroconych kodów H w Sekcji 3.2.

## Weryfikacja i Testy
- `tests/sds.compliance.test.js`:
  - **TEST 1:** Potwierdzenie braku wycieku stężenia do klasyfikacji przy rozbitych wierszach.
  - **TEST 1B:** Weryfikacja integralności SCL i scalania osieroconych kodów H (brak osieroconych H315/H319, zachowanie przedziałów `0,06% ≤ C < 0,6%`).
  - **TEST 5 & TEST 5B:** Ekstrakcja bioakumulacji w warunkach standardowych oraz przy zbitych nagłówkach i inline CAS (pełna ekstrakcja dla obu substancji: salicylanu benzylu i C(M)IT/MIT).
  - Wynik testów: 100% PASS (wszystkie asercje spełnione).
