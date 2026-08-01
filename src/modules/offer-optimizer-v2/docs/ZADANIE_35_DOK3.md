# ZADANIE 35-DOK3 — dwie listy przeczą sobie

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_35_DOK3.md`

Podmiot odpowiedzialny wyjaśniony i zabezpieczony, atrapa usunięta, grep pusty —
to przyjmuję. Spadek odrzuceń Equilibry z dziewięciu do jednego byłby świetnym
wynikiem, gdyby nie jedno.

---

## Sprzeczność

W `RAPORT_35_DOK` lista **22 unikalnych nietrafionych ze wszystkich fixture'ów**
zawiera między innymi:

```
Ethylhexyl Stereate
Glyceryl Stereate      ← w liście 27 z RAPORT_35
Ethylexyglycerin       ← w liście 27 z RAPORT_35
```

Wszystkie trzy stoją w składzie **Equilibry**:

> Aqua (Water), **Glyceryl Stereate**, Cetyl Alcohol, **Ethylhexyl Stereate**,
> Coco-Caprylate/Caprate, (…), Parfum (Fragrance), **Ethylexyglycerin**, (…)

W `RAPORT_35_DOK2` odrzucenie dla Equilibry to **jedna** pozycja:
`Ethylhexyl Stereate`.

`Glyceryl Stereate` i `Ethylexyglycerin` to literówki dostawcy — poprawnie brzmi
`Glyceryl Stearate` i `Ethylhexylglycerin`. **Nie mają prawa trafić w glosariusz.**
Skoro nie trafiają w zestawieniu zbiorczym, nie mogą trafiać w Equilibrze.

Jedno z dwóch: albo lista zbiorcza jest nieaktualna, albo **reguła sklejania
połyka pozycje nietrafione**, doklejając je do sąsiada i wyprowadzając z pola
widzenia. Ta druga możliwość jest groźna: pozycja wchłonięta przez sąsiada nie
jest już sprawdzana osobno, a przez bramki przechodzi jako część czegoś innego.

---

## KROK 1 — tabela dla Equilibry, trzydzieści wierszy

Dla każdej pozycji ze składu Equilibry, po kolei:

```
nazwa surowa | warianty canon (wszystkie 5) | sklejona z sąsiadem? z którym? | trafienie TAK/NIE
```

Bez skrótów, bez pomijania trafionych. Chcę zobaczyć każdy wiersz.

## KROK 2 — kontrola reguły sklejania

Ile razy w przebiegu na całym zbiorze fixture'ów doszło do sklejenia i **jakie
pary** zostały sklejone. Pełna lista par w postaci
`"A" + "B" → "A,B" → trafienie`.

Sklejenie ma następować **wyłącznie** wtedy, gdy wynik trafia w glosariusz.
Jeśli w Twoim wydruku pojawi się para, która została sklejona mimo braku
trafienia — to jest błąd i wtedy go pokazujesz, nie naprawiasz.

## KROK 3 — uzgodnienie liczb

Przelicz listę unikalnych nietrafionych po wszystkich fixture'ach jeszcze raz,
tym samym kodem, którym liczyłeś odrzucenia Equilibry. Podaj liczbę i listę.

Jeżeli `Glyceryl Stereate` i `Ethylexyglycerin` znikną z listy zbiorczej —
wyjaśnij jednym zdaniem, dzięki któremu wariantowi trafiły, i podaj dosłowny
wpis z `INCI_NAMES`, w który trafiły.

---

## KRYTERIUM ZALICZENIA

- tabela z kroku 1: 30 wierszy, wszystkie kolumny
- pełna lista sklejeń z kroku 2
- uzgodniona liczba i lista z kroku 3, bez sprzeczności z krokiem 1
- `npm test`: pełny wydruk, `fail 0`, ≥ 108
- `git diff --stat` całego modułu v2

## ZAKAZY

- zakaz zmian w regule sklejania i w wariantach w tej rundzie — **ustalasz,
  nie naprawiasz**
- zakaz podmieniania w testach usług, które test ma sprawdzać
- zakaz zaszywania aliasów i wyjątków
- zakaz zmian w `tests/fixtures/`, `data/reference`, `validators/`
- w wydrukach żadna wartość nie kończy się wielokropkiem
