# ZADANIE 19B — WERYFIKACJA WYNIKÓW ZADANIA 19A

| Pole | Wartość |
|---|---|
| Numer | 19B |
| Etap | E4b |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Dotyczy | RAPORT_19A_skala_uciecia.md |
| Oczekiwany raport | RAPORT_19B_weryfikacja_pomiaru.md |
| Zakres | **wyłącznie odczyt i dowody. Zero kodu produkcyjnego, zero LLM.** |
| Status ZADANIA_19 | wstrzymane do czasu tej weryfikacji |

## PO CO TO ZADANIE

Wynik z Zadania 19A jest mocny: jeden uszkodzony produkt na 552, opisy nietknięte,
skład zawsze przed miejscem ucięcia. Na tym wyniku opieram decyzję, że parser
odzyskujący to trzydzieści linii zabezpieczenia, a nie zmiana architektury.

Decyzja tej wagi nie może stać na liczbach podanych w prozie. To nie jest zarzut —
to ta sama zasada Z-1, którą stosujemy do wszystkiego innego w tym projekcie:
**liczba bez surowego dowodu nie jest liczbą, tylko twierdzeniem.**

Raport z 19A podaje agregaty, ale nie pozwala ich sprawdzić. Dodatkowo w outpupcie
widnieje `ID: undefined`, co znaczy, że skrypt nie odczytał identyfikatora produktu —
a skoro nie odczytał jednego pola, warto zobaczyć, co odczytał naprawdę.

Nie powtarzaj pomiaru inaczej. Pokaż to, co już policzyłeś, w postaci sprawdzalnej.

## KROKI

### KROK 1 — źródło skryptu

Wklej **całą zawartość** `src/modules/offer-optimizer-v2/scripts/check_64kb_limit.js`,
z nagłówkiem `plik:linia_od-linia_do`.

Chcę zobaczyć, jak dokładnie liczysz: czy `Buffer.byteLength` czy `.length`, jak
pobierasz listę produktów, czy iterujesz po wszystkich stronach wyników.

### KROK 2 — dowód kompletności pobrania

BaseLinker stronicuje wyniki. Podaj:

1. ile wywołań `getInventoryProductsList` wykonał skrypt i ile pozycji zwróciło każde,
2. ile wywołań `getInventoryProductsData` i po ile identyfikatorów w każdym,
3. sumę: liczba produktów, dla których faktycznie odczytano `text_fields`.

Jeśli któryś produkt nie zwrócił `text_fields` — podaj ile takich było. Produkt
pominięty milcząco fałszuje mianownik.

### KROK 3 — rozkład, nie tylko wynik

To jest sedno tego zadania.

Wypisz **piętnaście produktów o największym `features`**, posortowanych malejąco,
w formacie:

```
EAN | product_id | typ (string/object) | Buffer.byteLength | parsuje się (tak/nie)
```

Osobno **dziesięć produktów o najdłuższym `description`**, w tym samym formacie.

Jeżeli Equilibra ma 65535 bajtów, a drugi w kolejności produkt kilka tysięcy, to
widać to natychmiast i twierdzenie z 19A się broni. Jeżeli rozkład wygląda inaczej —
też się dowiemy.

### KROK 4 — kontrola na znanych produktach

Dla czterech produktów, których zawartość znam z poprzednich zadań, podaj zmierzone
wartości:

| EAN | `features` typ | `features` bajty | `description` bajty |
|---|---|---|---|
| 8000137015436 (Equilibra) | | | |
| 8809822541010 (Trimay) | | | |
| 8809822541003 (Trimay) | | | |
| 8809822540990 (Trimay) | | | |

### KROK 5 — plik z pełnym wynikiem

Zapisz pełny wynik pomiaru dla wszystkich 552 produktów do
`scripts/output/features_sizes.json` (jedna pozycja na produkt: EAN, product_id, typ,
rozmiar, wynik parsowania). W raporcie wklej pierwsze pięć i ostatnie pięć pozycji
oraz łączną liczbę rekordów w pliku.

Plik ma zostać w repozytorium — jest dowodem, do którego będzie można wrócić.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Pełne źródło skryptu z `plik:linia`
- [ ] Liczby wywołań API i suma odczytanych produktów, zgodna z 552
- [ ] Rozkład piętnastu największych `features` i dziesięciu największych `description`
- [ ] Tabela kontrolna dla czterech znanych EAN-ów
- [ ] `features_sizes.json` z 552 rekordami, w repozytorium

## CZEGO NIE ROBIMY

- Nie zmieniamy `baselinker.extract.js` ani testów.
- Nie piszemy parsera odzyskującego — to Zadanie 19, po tej weryfikacji.
- Nie kasujemy niczego z dysku.
- Zero zapisu do BaseLinkera, zero LLM.

Jeśli którakolwiek liczba z 19A okaże się inna po ponownym pomiarze — **napisz to
wprost i podaj obie wartości.** Korekta własnego wyniku nie jest porażką; jest
jedynym powodem, dla którego weryfikacja ma sens.
