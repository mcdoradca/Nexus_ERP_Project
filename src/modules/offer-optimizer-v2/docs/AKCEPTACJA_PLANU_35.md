# AKCEPTACJA PLANU 35 — trzy korekty

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

Plan zaakceptowany poza punktem 2. Trzy rzeczy.

## 1. Nie zamykaj sprawy testów na liczbie 74

W planie stoi „100% PASS rate na 74 testach". Kryterium brzmiało **≥ 93**, wraz
z pełnym wydrukiem i **liczbą testów zebraną z każdego pliku osobno**. To jest
nadal blokujące i nie zmieniło się przez D25.

Zmieniałeś kanonizację w Zadaniach 31B i 34. Jeżeli wśród brakujących
dziewiętnastu pozycji są sprawdzenia GATE-1 i GATE-2, to nie mamy dowodu, że
bramki nadal łapią hydrochinon. Najpierw rozbicie na pliki, potem reszta.

## 2. Żadnych zaszytych wyjątków. Twoje znalezisko zasługuje na regułę

Chcesz wpisać na sztywno alias `C10-18 Triglyceride` → `C10-18 Triglycerides`.
Nie. Wyjątek w kodzie jest niewidoczny w danych, nie da się go audytować
i wyprzedza mechanizm aliasów, zanim go zaprojektowaliśmy.

Ale to, co znalazłeś, jest cenniejsze niż jeden alias: **glosariusz ma liczbę
mnogą tam, gdzie etykieta ma pojedynczą.** To jest cała klasa przypadków, nie
jeden składnik. Dodajesz zatem **piąty wariant**, deterministyczny jak reszta:

> `canon` z dodanym końcowym `s` oraz `canon` z usuniętym końcowym `s`

Bez progów, bez podobieństwa. Sprawdzasz, ile pozycji ze wszystkich fixture'ów
ratuje ta jedna reguła, i podajesz liczbę.

Jeśli po czwartym i piątym wariancie `C10-18 Triglyceride` nadal nie trafia —
wtedy wklejasz dosłowny wpis z `INCI_NAMES` i zostawiasz sprawę mnie.

## 3. Skrypt z punktu 3 czyta fixture'y i niczego w nich nie dotyka

To jest jedyne zastrzeżenie do tej części. `tests/fixtures/` pozostaje
niezmienione.

---

## KRYTERIUM ZALICZENIA

- pełny wydruk `npm test`, `ℹ tests` na końcu, **rozbicie liczby testów na pliki**,
  `fail 0`, **≥ 93**
- czwarty i piąty wariant wpięte: `plik:linia` + wydruk funkcji generującej
- lista odrzuceń dla Equilibry **nie dłuższa niż 4 pozycje**
- liczba i pełna lista **unikalnych** nazw nietrafionych na wszystkich fixture'ach
- asercja: produkt z nieznanym składnikiem **przechodzi dalej**, ma wpis
  `INGREDIENT_NOT_IN_GLOSSARY`, a ten składnik nie występuje w bloku RAG
- `git diff --stat` całego modułu v2

## ZAKAZY

- zakaz zaszywania aliasów i wyjątków w kodzie
- zakaz użycia modelu do kanonizacji, mapowania i korekty nazw
- zakaz similarity, fuzzy match i progów
- zakaz zmian w `tests/fixtures/`, `data/reference`, `normalizeIngredientName`,
  `validators/`
- zakaz usuwania i wyłączania testów
- w wydrukach żadna wartość nie kończy się wielokropkiem
