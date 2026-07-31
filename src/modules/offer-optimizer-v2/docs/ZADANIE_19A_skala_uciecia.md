# ZADANIE 19A — SKALA UCIĘCIA `features` W KATALOGU

| Pole | Wartość |
|---|---|
| Numer | 19A |
| Etap | E4b |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Zastępuje | ZADANIE_19 — **wstrzymane** do czasu tych wyników |
| Oczekiwany raport | RAPORT_19A_skala_uciecia.md |
| Zakres | **wyłącznie odczyt API i pomiar. Zero kodu produkcyjnego, zero LLM.** |

## PO CO TO ZADANIE

Limit `65535` bajtów to rozmiar pola `TEXT` w MySQL, więc **ograniczenie jest
systemowe po stronie BaseLinkera, nie właściwością Equilibry.** Dotknie każdego
produktu, którego `features` przekroczy tę granicę.

Czego nie wiemy: **ilu produktów to dotyczy** i — ważniejsze — **czy strategia
odzysku w ogóle zadziała poza Equilibrą.**

Odzysk z Zadania 19 opiera się na założeniu, że klucz `kod karty` stoi jako ostatni,
więc ucięcie zjada tylko jego. U Equilibry tak jest. Jeśli u innego produktu ostatni
w kolejności okaże się `skladniki inci`, to ucięcie zabierze skład i żaden parser
tego nie odwróci — trzeba będzie szukać innego rozwiązania, na przykład po stronie
konfiguracji BaseLinkera.

Budowanie parsera przed sprawdzeniem tego założenia byłoby pisaniem kodu pod jeden
znany przypadek.

## KROKI

### KROK 1 — próba katalogu

Pobierz **200 produktów** z katalogu (lub wszystkie, jeśli jest ich mniej — wtedy
napisz ile). Dla każdego zmierz, bez parsowania:

- `Buffer.byteLength(text_fields.features)` gdy jest stringiem,
- typ wartości: `string` czy `object` (BaseLinker bywa niekonsekwentny — Trimay wraca jako obiekt, Equilibra jako string),
- `Buffer.byteLength(text_fields.description)`.

### KROK 2 — cztery liczby

Podaj w tabeli:

| Miara | Liczba | % próby |
|---|---|---|
| produkty z `features` jako string | | |
| `features` ≥ 65 000 bajtów | | |
| `JSON.parse(features)` kończy się błędem | | |
| `description` ≥ 65 000 bajtów | | |

Ostatni wiersz jest ważny osobno: podmiot odpowiedzialny Equilibry siedzi
**w `description`**, na samym końcu. Jeśli i to pole ma limit 65535, to przy dłuższych
opisach tracimy dane producenta dokładnie tam, gdzie ich najbardziej potrzebujemy.

### KROK 3 — kolejność kluczy przy ucięciu

Dla **każdego** produktu, którego `features` się nie parsuje, wypisz:

1. listę kluczy, które udało się odczytać z prefiksu, **w kolejności występowania**,
2. nazwę klucza, na którym string się urywa,
3. czy wśród odczytanych kluczy jest skład INCI (`skladniki inci`, `Ingredients / INCI` lub inny wariant).

To jest sedno tego zadania. Odpowiada na pytanie: czy odzysk uratuje skład zawsze,
czasem, czy tylko u Equilibry.

Nie pisz do tego modułu produkcyjnego. Skrypt diagnostyczny w `scripts/`,
jednorazowy, wystarczy.

### KROK 4 — raport

1. tabela z Kroku 2,
2. zestawienie z Kroku 3 dla wszystkich znalezionych przypadków,
3. surowy output skryptu,
4. `git status --short`.

Jeśli w próbie **nie ma ani jednego** uciętego produktu poza Equilibrą — napisz to
wprost. To też jest wynik i zmienia priorytet całej sprawy.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Cztery liczby z Kroku 2
- [ ] Dla każdego uciętego produktu: kolejność kluczy i miejsce urwania
- [ ] Jednoznaczna odpowiedź, czy skład INCI leży przed miejscem ucięcia we wszystkich znalezionych przypadkach

## ZAKAZY

- Zero zmian w `baselinker.extract.js` i w testach.
- Zero zapisu do BaseLinkera.
- Zero LLM.
- Skrypt diagnostyczny nie wchodzi do potoku — ma trafić do `scripts/`.
