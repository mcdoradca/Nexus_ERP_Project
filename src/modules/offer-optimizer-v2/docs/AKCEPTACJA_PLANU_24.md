# AKCEPTACJA PLANU 24 — z czterema korektami i podziałem na rundy

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Od:** Architekt
- **Data:** 2026-07-31
- **Dotyczy:** `PLAN_24_kontrakt_A1.md`
- **Werdykt: plan zaakceptowany**, po naniesieniu korekt poniżej

Plan trafnie rozpoznaje wszystkie pięć kroków. Cztery rzeczy wymagają zmiany,
zanim zaczniesz, i jedna zmienia sposób raportowania na stałe.

---

## KOREKTA 1 — blokująca: zakaz ręcznej edycji `Agent_1_compiled.md`

W kroku 1 napisałeś: „dokonam rekompilacji **lub ręcznie zaktualizuję** plik
docelowy". Drugiej opcji nie ma.

Plik kompilowany, który nie jest funkcją pliku źródłowego, kłamie przy pierwszej
następnej kompilacji — a nikt się o tym nie dowie, bo dowód będzie wyglądał
poprawnie. To dokładnie ten typ sprzeczności, przez który A1 przez cztery zadania
zwracał pola spoza kontraktu.

**Wolno wyłącznie uruchomić kompilator.** Jeśli kompilator nie odpala,
nie kompiluje albo daje wynik inny niż oczekiwany — **STOP, raport, koniec rundy.**
Nie dotykasz `Agent_1_compiled.md` edytorem w żadnej sytuacji.

---

## KOREKTA 2 — krok 3: czym jest „A1 próbujący wymusić zapis"

Po kroku 2 `line` nie ma w schemacie, więc prawdziwy model już go nie zwróci.
Dowód blokady buduje się na **obiekcie syntetycznym w pliku testowym**,
udającym odpowiedź A1 z kluczem `line`. Zero wywołań modelu, zero zmian
w `tests/fixtures/`.

Zrzucony stan ma pokazać **trzy rzeczy naraz**:

1. `extracted_data.line` — wartość z BaseLinkera, niezmieniona
2. `normalization_warnings` zawiera `A1_FIELD_REJECTED: line`
3. `a1_result` **nie ma klucza `line`** — odrzucona wartość nie zostaje nigdzie
   w stanie. Ostrzeżenie zamiast wartości, nie ostrzeżenie obok wartości

---

## KOREKTA 3 — krok 4: sanityzacja nie może być cicha

Sprowadzenie do `null` wartości bez `source` jest słuszne, ale samo w sobie
tworzy brak. **Brak wypełnia potem model** — to jest mechanizm, który właśnie
likwidujemy, więc nie wolno go odtworzyć piętro niżej.

Każde wyzerowanie zostawia wpis: `VALUE_WITHOUT_SOURCE_DROPPED: <nazwa_pola>`
w `normalization_warnings`.

---

## KOREKTA 4 — w planie nie ma testów

Nie wymieniłeś ich w żadnym z pięciu kroków. Przypominam, bo to jest kryterium
zaliczenia, nie dodatek:

- pełny wydruk `npm test`, `fail 0`, liczba nie niższa niż 78
- lista asercji dodanych w rundzie: `plik:linia` + jedno zdanie na asercję
- **nowe zachowania mają mieć własne asercje**: odrzucenie pola z istniejącym
  źródłem P1 oraz zerowanie wartości bez źródła

---

## ZMIANA W RAPORTOWANIU — na stałe

Napisałeś, że `brand` = `"Equilibra"` przy `source: null` powstał przez ręczne
nadpisanie podczas przebiegu dowodowego do Zadania 23. Przyjmuję to wyjaśnienie
i dobrze, że je podałeś sam. Ale to znaczy, że zrzut, który oceniałem jako dowód,
mieszał dane wyekstrahowane z wstrzykniętymi ręcznie, bez oznaczenia.

> **Każda wartość wstrzyknięta ręcznie na potrzeby przebiegu dowodowego jest
> wymieniona nad zrzutem: nazwa pola i wartość.** Zrzut bez takiej listy jest
> deklaracją, że wszystko w nim pochodzi z kodu. Zrzut, który miesza jedno
> z drugim bez oznaczenia, nie jest dowodem.

---

## PODZIAŁ NA DWIE RUNDY

Pięć kroków plus testy to za dużo na jedno podejście. Dzielę:

### ZADANIE 24A — kontrakt A1 (kroki 1, 2, 3)

Raport: `RAPORT_24A_kontrakt_A1.md`

Dodatkowo, przed zmianą w kroku 1, sprawdź i podaj w raporcie:

```
grep -rn "missing_critical_data\|raw_ingredients_inci\|gtin_ean" src/modules/offer-optimizer-v2/ --include=*.js
```

Jeśli kod czyta którekolwiek z tych pól z odpowiedzi A1 — **nie usuwasz ich
z promptu, tylko zatrzymujesz się i raportujesz `plik:linia`.** Usunięcie pola
z kontraktu w tej samej rundzie, w której coś je jeszcze czyta, wywala potok.

**Kryterium zaliczenia 24A (binarne):**

- `grep -n` po `Agent_1_compiled.md` na ciągi `gtin_ean`, `mpn`,
  `missing_critical_data`, `raw_ingredients_inci`, `line` — wynik pusty, wklejony
- `git diff` pliku źródłowego `Agent_1_prompt_v4.md` w całości
- `a1Schema`: `plik:linia` + pełny wydruk, `required` = dokładnie dwa pola
- stan z korekty 2 pokazuje trzy rzeczy naraz
- `npm test` pełny, `fail 0`, ≥ 78, lista asercji

### ZADANIE 24B — sanityzacja i ADR (kroki 4, 5)

Wydam po zaliczeniu 24A. Nie zaczynaj go wcześniej.

---

## ZAKAZY — bez zmian

- zero wywołań API BaseLinkera i jakiegokolwiek API zewnętrznego
- zakaz zmian w `tests/fixtures/`
- zakaz zmian w promptach innych niż `Agent_1_prompt_v4.md`
- zakaz ręcznej edycji `Agent_1_compiled.md`
- zakaz refaktoryzacji `orchestrator.js` poza tym, co wymuszają kroki 2 i 3
- **w zrzucie stanu żadna wartość nie kończy się wielokropkiem**; wartość długą
  wklejasz w całości albo podajesz jej długość w znakach i skrót SHA-256
- brak danych ≠ zgadywanie: `//HITL:` + wpis w raporcie
