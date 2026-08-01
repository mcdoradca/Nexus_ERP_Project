# ZADANIE 26 — `route_chemical`: co naprawdę decyduje o ścieżce chemicznej

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Od:** Architekt
- **Data:** 2026-07-31
- **Podstawa:** defekt D-25.1 z `OCENA_25.md`
- **Raport wyjściowy:** `RAPORT_26_route_chemical.md`

---

## KONTEKST — przeczytaj, zanim zaczniesz

Twój grep z Zadania 25 pokazał, że `route_chemical` opiera decyzję na czterech
sygnałach, a dwa z nich w module v2 nie mają jak zadziałać:

- `pim.raw_ingredients_inci` — **nic w v2 tego pola nie przypisuje** (ustaliłeś to sam)
- `pim.clp_signal_word` — BaseLinker nie ma strukturalnych pól CLP

Zostają `pim.category` i `pim.sds_required`.

Stawka jest wyższa niż wygląda. Zasada **S-3** mówi: brak SDS przy
`sds_required == true` to twarde zatrzymanie potoku. Jeżeli `sds_required`
nigdy nie jest ustawiane na `true`, ta zasada nie ma jak się uruchomić —
i nikt się o tym nie dowie, bo taki warunek nie zgłasza błędu, tylko cicho
nie wchodzi w gałąź. Asortyment to kosmetyki **i chemia domowa**, około 2000 SKU.

**To jest runda ustaleń. Nie naprawiasz niczego.** Nie chcę poprawki napisanej
na wyczucie w miejscu, które decyduje o ścieżce prawnej produktu. Najpierw fakty,
decyzja moja, dopiero potem kod.

---

## KROKI

**1. Co się dzieje ze zwróconą wartością.**
Pełne ciało funkcji zawierającej `orchestrator.js:79`
(`const isChemical = route_chemical(pimData);`), z numerami linii, od nagłówka
funkcji do jej końca. Chcę zobaczyć, co potok robi z `isChemical` i z `reasons`.

**2. Wszyscy konsumenci.**

```
grep -rn "isChemical\|is_chemical\|route_chemical" src/modules/offer-optimizer-v2/ --include=*.js
```

Cały wynik, każde trafienie skomentowane jednym zdaniem: definicja, wywołanie,
odczyt wyniku czy asercja testowa.

**3. Czym jest `pimData`.**
`plik:linia` miejsca, w którym ten obiekt powstaje, oraz **pełna lista jego
kluczy** — `Object.keys(pimData)` wypisane z przebiegu offline, osobno dla
Equilibry i dla jednego produktu Trimay. To rozstrzyga, czy `category`,
`sds_required`, `clp_signal_word` i `raw_ingredients_inci` mają w ogóle szansę
być niepuste.

**4. `sds_required`.**

```
grep -rn "sds_required" src/modules/offer-optimizer-v2/ --include=*.js
```

Cały wynik plus jedno zdanie rozstrzygające: czy w module v2 istnieje
jakiekolwiek miejsce, które **przypisuje** temu polu wartość, czy tylko miejsca,
które je czytają.

**5. `npm test`** — pełny wydruk, `fail 0`, 80. Nic nie zmieniasz, więc liczba
ma zostać ta sama; to sanity check, że repo jest w stanie, w którym je zostawiłeś.

---

## KRYTERIUM ZALICZENIA (binarne)

- pełne ciało funkcji z kroku 1, z numerami linii
- oba grepy w całości, każde trafienie skomentowane
- dwie listy kluczy `pimData` z kroku 3, wypisane, nie opisane
- jedno zdanie rozstrzygające o `sds_required`
- `npm test`: pełny wydruk, `fail 0`, 80
- `git diff --stat` całego modułu v2 — **oczekiwany wynik pusty**, wklejony
  nawet pusty

---

## ZAKAZY

- **zero zmian w kodzie.** Żadnego pliku `.js` w module v2. To jest runda
  ustaleń i pusty `git diff --stat` jest jednym z kryteriów
- zero wywołań API BaseLinkera i jakiegokolwiek API zewnętrznego
- zakaz zmian w `tests/fixtures/`
- zakaz proponowania i wdrażania poprawki `route_chemical` — decyzja jest moja
  i podejmę ją po Twoim raporcie
- w zrzutach żadna wartość nie kończy się wielokropkiem
- brak danych ≠ zgadywanie: `//HITL:` + wpis w raporcie
- statusu zadania nie ustalasz
