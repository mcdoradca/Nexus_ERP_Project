# OCENA RAPORTU 25 — zależności kontraktu A1

> **ODBIORCA: DOKUMENTACJA.** Tylko do `docs/`. Wykonawcy nie wklejasz.

- **Zadanie:** 25
- **Raport:** `RAPORT_25_zaleznosci.md`
- **Data oceny:** 2026-07-31
- **Werdykt: ZALICZONE**

---

## 1. Bilans

| Kryterium | Wynik |
|---|---|
| `grep` po `gtin_ean` — pusty wynik | **kryterium było błędne, moje.** Patrz sekcja 3 |
| cztery odpowiedzi w punkcie 2 | spełnione, wszystkie z surowym outputem |
| `npm test` pełny, `fail 0`, ≥ 78 | spełnione — 78/78 |

Usunięty blok wyglądał tak:

```javascript
if (result.mpn === result.gtin_ean) {
    result.mpn = null;
    warnings.push('mpn_equals_ean');
}
```

Potwierdza to diagnozę: po poprawce promptu oba pola byłyby `undefined`,
warunek zapalałby się na każdym produkcie, zerował `mpn` i dopisywał ostrzeżenie.
Kontrola przenosi się do warstwy ekstrakcji w 24B (D-23.5).

---

## 2. D-25.1 — `route_chemical` nie widzi składu. Poważne.

`validators/index.js:24-43` decyduje o `is_chemical` na podstawie czterech
sygnałów:

| Sygnał | Stan w v2 |
|---|---|
| `pim.category` zawiera chemia/chemical/biobójcz/biocid | działa |
| `pim.sds_required === true` | działa |
| `pim.raw_ingredients_inci` niepuste | **nigdy niewypełniane** — potwierdzone grepem, w v2 nie ma miejsca przypisującego to pole |
| `pim.clp_signal_word` niepuste | **nigdy niewypełniane** — BaseLinker nie ma strukturalnych pól CLP (handoff §8) |

Zostają dwa z czterech. Kosmetyk ze składem INCI, bez `sds_required` i bez
kategorii chemicznej, wychodzi dziś z `is_chemical: false`. **Przed Zadaniem 21
wychodziłby `true`**, bo A1 wypełniał `raw_ingredients_inci`. Przeniesienie
składu do `extracted_data.inci` odcięło ten sygnał i nikt tego nie zauważył,
bo bramka nie krzyczy — po prostu nie wchodzi w gałąź.

Zaznaczam, żeby nie powtórzyć błędu A5: **nie mylę chemii domowej jako kategorii
asortymentu z chemiczną ścieżką potoku.** `route_chemical` traktuje obecność INCI
jako jeden z czterech sygnałów kierujących na ścieżkę regulowaną, niezależnie od
tego, czy produkt jest kosmetykiem czy detergentem. Właśnie dlatego utrata tego
sygnału dotyka całego asortymentu kosmetycznego, a nie wąskiej grupy.

**Czego jeszcze nie wiem:** co konsumuje `isChemical` z `orchestrator.js:79`
i co się zmienia w potoku przy `false`. Bez tego nie umiem ocenić rozmiaru dziury.
To jest treść Zadania 26.

**Dlaczego to może poczekać jedną rundę:** v2 nie obsługuje sprzedaży. Cutover
nie nastąpił (OP-4), potok stoi na fixture'ach, żadna oferta z tego modułu nie
poszła na Allegro. Ryzyko jest w kodzie, nie na półce.

---

## 3. Mój błąd — A10

**Postawiłem kryterium „`grep` po `gtin_ean` daje pusty wynik" na kodzie,
którego nie czytam.** W rzeczywistości `gtin_ean` stoi w `orchestrator.js:183`
jako **pole wejściowe** przekazywane do A1 (to jest w porządku, model dostaje EAN,
który przetwarzamy) oraz w trzech asercjach testowych sprawdzających, że wartość
`gtin_ean` **z odpowiedzi** A1 jest odrzucana. Te asercje są cenne i mają zostać.

Spełnienie mojego kryterium dosłownie wymagałoby skasowania dobrego testu.
Wykonawca tego nie zrobił, wkleił trafienia i wyjaśnił dlaczego. Zachował się
poprawnie.

To drugi raz z rzędu (po A9), kiedy kryterium mierzy co innego, niż zamierzałem.
Wspólna przyczyna: piszę kryteria o kodzie, do którego nie mam wglądu.

**Reguła dla mnie:** kryterium odwołujące się do grepa brzmi
„output wklejony, każde trafienie skomentowane" — nigdy „wynik pusty", chyba że
sam wcześniej ustaliłem, co tam stoi.

---

## 4. Kolejka

1. **wznowienie 24A** — kontrakt A1 (wydane)
2. **26** — `route_chemical` i konsumenci `isChemical` (D-25.1)
3. **24B** — sanityzacja pól bez źródła, ADR, przeniesienie kontroli `mpn == EAN` (D-23.5)
