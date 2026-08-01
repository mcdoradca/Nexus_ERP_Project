# ZADANIE 19C — DOWÓD TESTOWY DO ZADANIA 19

| Pole | Wartość |
|---|---|
| Numer | 19C |
| Etap | E4b |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Dotyczy | RAPORT_19_odzysk_i_commit.md |
| Oczekiwany raport | RAPORT_19C_dowod_testow.md |
| Zakres | **jeden output do wklejenia, ewentualnie brakujące testy. Zero LLM.** |

## CO ZOSTAŁO ZROBIONE DOBRZE

Odzysk działa i działa dokładnie tak, jak miał działać.

Z uciętego pliku wraca skład INCI z zachowaną kropką na końcu, pojemność, sposób
użycia i ostrzeżenia. `mpn` i `brand` pozostają `null` — nic nie zostało dorobione.
`truncated: true` wychodzi na zewnątrz modułu razem z listą dziewięciu odzyskanych
kluczy, a `kod karty` w tej liście nie ma.

Ta lista dziewięciu kluczy zgadza się co do jednego z kolejnością zmierzoną
niezależnie w Zadaniu 19A. To dobry, sprawdzalny szczegół.

Produkt, który dwie rundy temu zwracał sześć razy `null`, zwraca teraz komplet
danych, których potok potrzebuje.

## CZEGO BRAKUJE

### Liczba testów nie drgnęła

Zadanie 19 wymagało sześciu nowych przypadków testowych i progu `tests ≥ 78`.
Raport podaje **72** — dokładnie tyle samo, co po Zadaniu 18.

Wyjaśnienie w raporcie brzmi: „≥ 78 asercji nie było widoczne z uwagi na strukturę
starych tasków". To nie jest wyjaśnienie, tylko jego brak. Zdania tego typu zastępuj
informacją, czego nie sprawdziłeś — to zasada obowiązująca w tym projekcie od
początku i działa w obie strony: mnie też chroni przed wyciąganiem wniosków
z niczego.

Są dwie możliwości i trzeba wiedzieć, która zachodzi:

1. nowe przypadki powstały, a stare zostały przez nie zastąpione — wtedy liczba może się nie zmienić i wszystko jest w porządku,
2. nowe przypadki nie powstały, a wynik z sekcji 1 raportu pochodzi z doraźnego uruchomienia skryptu, nie z baterii.

W drugim przypadku odzysk nie jest pokryty testem, więc pierwsza zmiana w tym
module może go po cichu zepsuć.

### Brak listy nazw testów

Poprzednie raporty zawierały wydruk z reportera `spec` z nazwami przypadków.
Ten ma same liczby zbiorcze, więc nie widzę, czy przypadki z Kroku 3 istnieją.

## KROKI

### KROK 1 — pełny wydruk baterii

```
npm test
```

Wklej **cały output**, od pierwszej linii do ostatniej, z nazwami wszystkich
przypadków testowych. Nie skracaj, nie wybieraj fragmentów.

### KROK 2 — rozliczenie liczby

Odpowiedz na dwa pytania, z referencją `plik:linia`:

1. Ile przypadków testowych zawiera `tests/baselinker.extract.test.js` i jak się nazywają?
2. Które z sześciu przypadków wymaganych w Kroku 3 Zadania 19 są pokryte, a których nie ma?

Wymagane były:
- `truncated: true` na `.raw.json`,
- odzyskany skład z kropką i z `Prunus Amygdalus Dulcis`,
- `capacity`, `usage`, `warnings` z prawidłowymi `matched_key`,
- `mpn` i `brand` równe `null`,
- `recovered_keys` bez `kod karty`,
- Trimay: `truncated: false`, wyniki bez zmian.

### KROK 3 — uzupełnienie, jeśli czegoś brakuje

Dopisz brakujące przypadki, uruchom baterię ponownie i wklej pełny output.
Jeśli nic nie brakuje — napisz to wprost i przejdź dalej.

### KROK 4 — jedno zdanie o katalogach

Z akceptacji 19B: podaj, **ile katalogów zwraca `getInventories`** i jakie mają
identyfikatory. Masz to wywołanie w skrypcie diagnostycznym, więc to jedna linia
do wypisania.

Potrzebuję tego do doboru próby przy E5 — jeśli katalogów jest więcej niż jeden,
„552 produkty" opisuje część, a nie całość.

### KROK 5 — commit, jeśli doszły testy

Jeśli Krok 3 coś dodał, zacommituj po nazwie i wklej `git log --oneline -1`.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Pełny output `npm test` z nazwami przypadków
- [ ] Jednoznaczna odpowiedź: sześć przypadków z Kroku 3 Zadania 19 istnieje albo nie
- [ ] Liczba katalogów w BaseLinkerze
- [ ] `npm test`: `fail 0`

## ZAKAZY

- Zero zmian w `baselinker.extract.js` — logika jest poprawna, nie ruszaj jej.
- Zero LLM, zero zapisu do BaseLinkera, zero implementacji A2/A4.
- Zakaz `git add -A`; commit ASCII; sekrety jako `***`.
