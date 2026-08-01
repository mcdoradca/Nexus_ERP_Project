# ZADANIE 41 — potok przyjmuje listę EAN i wypluwa pliki

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_41.md` — **maksymalnie jedna strona**, treść
  określona na końcu. Dowodem są pliki w `out/`, nie raport
- **Gałąź:** ta sama

Zmieniamy sposób pracy. Do tej pory żądałem od Ciebie zrzutów i wydruków,
którymi próbowałem sprawdzić potok z drugiej ręki. To był błąd — Operator ma
rację, że to kosztuje tokeny i niczego nie gwarantuje. Od teraz **dowodem jest
plik wyjściowy, który Operator otwiera i czyta sam.**

Twoim zadaniem jest doprowadzić do tego, żeby dało się wrzucić listę EAN-ów
i dostać komplet plików. Nic więcej w tej rundzie nie jest ważne.

---

## KROK 1 — potok pobiera produkt z BaseLinkera po EAN, tylko do odczytu

Dziś moduł v2 nie czyta z BaseLinkera w ogóle — dane biorą się z fixture'ów.
To jest powód, dla którego nie da się przez niego puszczać towaru.

- funkcja pobierająca produkt po EAN: `getInventoryProductsList` do znalezienia
  `product_id`, potem `getInventoryProductsData` po pełne dane
- wynik wchodzi do `EXTRACT` w tej samej postaci co dziś fixture, żeby reszta
  potoku nie wymagała zmian
- odpowiedź surowa zapisywana do `out/raw_<EAN>.json` — to jest artefakt
  źródłowy i ma zostać na dysku
- **wyłącznie metody odczytu.** Żadnej metody zapisującej, także w kodzie
  nieużywanym. `WRITE_BACK_ENABLED` zostaje `false`, `throw` w
  `writeBackToBaseLinker` zostaje
- klucz z `.env`, nie w kodzie
- gdy BaseLinker nie zwróci produktu dla EAN — status `NOT_FOUND` i przechodzisz
  do następnego EAN-u, bez przerywania partii

## KROK 2 — uruchamianie partii

Polecenie, które przyjmuje listę EAN-ów z pliku tekstowego, jeden na linię:

```
node run_offers.js eans.txt
```

Zachowanie:

- dla każdego EAN-u: pobranie, przebieg, zapis `out/offer_<EAN>.json`
- **jeden EAN nie może zatrzymać partii.** Wyjątek, zatrzymanie na bramce,
  odrzucenie przez walidator — łapiesz, zapisujesz w podsumowaniu, idziesz dalej
- gdy potok stanie: `out/offer_<EAN>.json` i tak powstaje, z polem `status`
  i powodem zatrzymania. Operator ma widzieć, dlaczego stanęło, bez czytania logów
- po partii: `out/_podsumowanie.csv`, jeden wiersz na EAN, kolumny:

```
ean;status;powod_zatrzymania;flagi_walidatorow;tokeny_razem;czas_s
```

`status` przyjmuje jedną z wartości: `OK`, `HALT`, `NOT_FOUND`, `ERROR`.

## KROK 3 — bramki zostają włączone i zatrzymują

To jest to, co zastępuje moje sprawdzanie. Walidator, który zatrzymuje potok,
działa przy każdym z dwóch tysięcy produktów, także wtedy, gdy nikt nie patrzy.

Muszą działać i zatrzymywać: GATE-1, GATE-2, `MISSING_INCI`,
`MISSING_EU_RESPONSIBLE_PERSON`, `SAFETY_SIGNAL_IN_REVIEWS`,
`BLOCKED_CRITICAL_LEGAL_BREACH`, `FROZEN_SECTION_VIOLATION` oraz
`validate_grounded_facts` (jeśli jeszcze nie istnieje — dopisujesz go teraz):

1. liczba z jednostką (`ml`, `l`, `g`, `kg`) w opisie, której nie ma
   w `extracted_data.capacity` ani w `product_name` → `UNGROUNDED_QUANTITY`
2. nazwa podmiotu odpowiedzialnego w opisie różna od tej ze stanu
   (po `toLowerCase` i usunięciu znaków niealfanumerycznych)
   → `FABRICATED_RESPONSIBLE_PERSON`
3. `extracted_data.brand.value === null`, a w opisie stoi etykieta marki
   z wartością → `UNGROUNDED_BRAND`

Zatrzymanie zapisuje się w pliku wyjściowym i w podsumowaniu. Nie obchodzisz go,
nie łagodzisz, nie wyłączasz.

## KROK 4 — przebieg na dwóch EAN-ach

```
8000137015436
8809822541010
```

Puść partię na tych dwóch. Mają powstać cztery pliki: dwa `raw_`, dwa `offer_`,
plus `_podsumowanie.csv`. Trimay najpewniej stanie na braku podmiotu
odpowiedzialnego i **to jest wynik poprawny** — plik ma powstać ze statusem
`HALT` i powodem.

---

## RAPORT — jedna strona, nic ponadto

```
## 1. Jak uruchomić — dokładne polecenie i format pliku z EAN-ami
## 2. Lista plików w out/ po przebiegu (ls, same nazwy i rozmiary)
## 3. Zawartość out/_podsumowanie.csv — w całości, to są dwa wiersze
## 4. Co nie działa — lista rzeczy, które zostawiłeś niedokończone, po jednym zdaniu
```

**Nie wklejaj:** treści `description_html`, zrzutów stanu, ciał funkcji,
`plik:linia`, wydruków `npm test`, `git diff`. Operator otwiera pliki sam.

Punkt 4 traktuj poważnie — jest po to, żebyś nie musiał niczego ukrywać.
Rzecz zgłoszona jako niedokończona nie jest błędem rundy. Rzecz przemilczana
i wykryta w pliku wyjściowym unieważnia całą pracę.

## KRYTERIUM UKOŃCZENIA

- `node run_offers.js eans.txt` wykonuje się do końca na dwóch EAN-ach
- w `out/` leżą: `raw_8000137015436.json`, `raw_8809822541010.json`,
  `offer_8000137015436.json`, `offer_8809822541010.json`, `_podsumowanie.csv`
- `offer_8000137015436.json` zawiera `Equilibra srl` i nie zawiera ciągu `MyCli`
- żadna liczba z jednostką w opisie nie jest spoza danych z BaseLinkera
- partia nie przerywa się na pierwszym problemie

## ZAKAZY

- **zero metod zapisujących do BaseLinkera** — w kodzie, w testach, w skrypcie
- zakaz atrap między węzłami; mock wolno wstawić tylko w testach jednostkowych
- zakaz wyłączania i łagodzenia bramek oraz walidatorów
- zakaz uzupełniania brakujących pól produktu treścią z modelu; pole puste
  zostaje puste
- zakaz parafrazowania składu INCI, danych podmiotu odpowiedzialnego i ostrzeżeń
- zakaz `push` na `main` i `staging`, zakaz uruchamiania deploya
- zakaz commitowania klucza API

## WARUNKI PRZERWANIA

Jeden: kompilator nie działa. Wszystko inne jest wynikiem do zapisania
w podsumowaniu i w punkcie 4 raportu.
