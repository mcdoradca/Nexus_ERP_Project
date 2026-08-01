# ZADANIE 23 — POCHODZENIE `line`, KONTROLA ŹRÓDEŁ, BRAKUJĄCE DOWODY

| Pole | Wartość |
|---|---|
| Numer | 23 |
| Etap | E4b |
| Wydał | Architekt |
| Data wydania | 2026-07-31 |
| Poprzednie zadanie | ZADANIE_22 — **cel osiągnięty**, trzy sprawy do domknięcia |
| Oczekiwany raport | RAPORT_23_pochodzenie_line.md |
| **Wywołania BaseLinkera** | **ZERO. Całość na fixture'ach z dysku.** |

## CO SIĘ UDAŁO — TO JEST PRZEŁOM

Po raz pierwszy potok **rozróżnił produkt z kompletem danych od produktu z brakami**,
i zrobił to na podstawie danych z bazy, nie opinii modelu.

| Produkt | Wynik | Tokeny |
|---|---|---|
| Equilibra `8000137015436` | `EXTRACT: OK` → `A1: OK` → `next_action: RUN_A2` | wywołane raz |
| Trimay `8809822541010` | `EXTRACT: HALTED_HITL_REQUIRED`, `MISSING_EU_RESPONSIBLE_PERSON` | **zero** |

Wszystkie trzy korekty naniesione. Bramka GATE-1 działa na prawdziwym składzie —
test „GATE-1 wykrywa hydroquinone i zatrzymuje na EXTRACT" jest zielony. Biała lista
odrzuciła `mpn` i `pipeline_id` z widocznym śladem w stanie. Atrapy zniknęły
ze ścieżki produkcyjnej. Wydruk testów przyszedł pełny, tak jak prosiłem.

`country_of_origin` wróciło jako **Włochy**, a nie „Poland" jak przy atrapie. Model
odpowiadał wreszcie na pytanie o właściwy produkt.

Liczba testów 76 zamiast 77 tłumaczy się sama: stary przypadek „HARD FAIL na pustym
eu_responsible_person" został zastąpiony nowym „Brak EU RP przerywa na EXTRACT".
To zastąpienie jest słuszne — zatrzymanie przeniosło się o warstwę wcześniej.
Następnym razem napisz o tym w raporcie, zamiast zostawiać mnie z liczeniem.

## CO WYMAGA DOMKNIĘCIA

### 1. `line` prawdopodobnie zmyślone

A1 zwrócił `"line": "Purifying Black Carbon"`.

Linia produktowa tego kosmetyku nazywa się **`Carbone Attivo`** — tak stoi w danych
BaseLinkera i tak zwracały wcześniejsze przebiegi. „Purifying Black Carbon" to
angielska fraza marketingowa, która brzmi wiarygodnie i nie jest nazwą linii.

Znamienne są też źródła: `limespazzola.it` i `cosmoprof.com`. Pierwsza to sklep
niezwiązany z tą marką, druga to organizator targów kosmetycznych. **Strony
producenta `equilibra.it` nie ma wśród źródeł w ogóle.**

`line` nie jest daną prawną, więc pomyłka nie zagraża nikomu — ale trafia do tytułu
oferty, a tytuł jest tym, co widzi kupujący i po czym szuka. Wymyślona nazwa linii to
oferta, której nikt nie znajdzie.

**Rozwiązanie jest to samo, co przy pozostałych polach: brać z BaseLinkera.**
Inwentaryzacja z Zadania 16 pokazała klucz `Linia` obecny u 9 z 20 produktów.
Nie ma go w mapie synonimów, więc nikt go nie czyta.

### 2. Kontrola źródeł P1 przestała działać

`normalization_warnings` **nie zawiera** `NO_P1_SOURCE`, mimo że wśród źródeł nie ma
ani jednej domeny producenta. W poprzednim przebiegu to ostrzeżenie się pojawiało.

Przyczyna jest w konstrukcji sprawdzenia: dopasowuje domenę do znormalizowanej nazwy
marki, a `brand` dla Equilibry jest `null`, bo w jej `features` nie ma klucza marki.
Brak marki oznacza więc, że **kontrola nie ma czego porównać i po cichu przepuszcza
wszystko**.

Zabezpieczenie, które milczy przy braku danych wejściowych, jest gorsze niż jego brak
— bo wygląda na działające.

### 3. Brakujące dowody

Zadanie 22 wymagało czterech rzeczy, których w raporcie nie ma:

- **pełnych** stanów maszyny — oba przyszły pocięte przez `...`,
- `usageMetadata` wywołania A1 — nie ma ani jednej liczby,
- `git diff --stat` — jest sam `git status`,
- `plik:linia` miejsca, gdzie siedziała atrapa, sprzed zmiany.

## KROKI

### KROK 1 — `line` z BaseLinkera

- Dopisz do `baselinker.extract.config.json` mapowanie: `line` → `linia`, `line`, `product line`.
- Dodaj `line` jako **siódme pole** zwracane przez `extractFromFeatures`, z `matched_key` jak pozostałe.
- W orkiestratorze `line` trafia na listę braków dla A1 **tylko wtedy, gdy BaseLinker go nie ma**.
- Test: produkt z kluczem `Linia` → wartość z BaseLinkera, `matched_key: "Linia"`, A1 nie pytany o to pole.

### KROK 2 — pola od modelu oznaczone jako niepotwierdzone

Każde pole pochodzące z odpowiedzi A1 dostaje w stanie znacznik źródła, na przykład
`{ value: "...", source: "a1", verified: false }`.

Pola z BaseLinkera mają `source: "baselinker"` i `matched_key`.

Cel jest prosty: patrząc na stan maszyny musi być widać, które wartości pochodzą
z bazy, a które od modelu. Przy eksporcie do BaseLinkera (D20) te drugie będą
wymagały innego traktowania.

### KROK 3 — kontrola źródeł nie może milczeć

Popraw sprawdzenie P1 tak, żeby brak danych wejściowych **nie oznaczał zaliczenia**:

- `brand` znane → dopasowanie domeny do marki, jak dotąd,
- `brand` nieznane → dopasowanie do znormalizowanej pierwszej części `product_name` albo do nazwy z `eu_responsible_person.name`,
- nadal nie da się rozstrzygnąć → ostrzeżenie **`P1_CHECK_IMPOSSIBLE`**, nigdy ciche przejście.

Test: odpowiedź A1 ze źródłami spoza domeny producenta → w stanie jest `NO_P1_SOURCE`
albo `P1_CHECK_IMPOSSIBLE`. Brak obu = test czerwony.

### KROK 4 — uzupełnienie dowodów

W raporcie:

1. **pełne** stany maszyny dla obu przebiegów — od pierwszej klamry do ostatniej, bez `...`,
2. `usageMetadata` wywołania A1: `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `totalTokenCount`,
3. definicja `a1Schema` z `plik:linia` — chcę zobaczyć, czy schemat rzeczywiście ma cztery pola, skoro model zwrócił `mpn` i `pipeline_id`,
4. `git status --short` **oraz** `git diff --stat`,
5. jawne zdanie: ile wywołań do API BaseLinkera wykonało to zadanie.

Punkt 3 jest istotny: przy działającym `responseSchema` model nie powinien móc zwrócić
pola spoza schematu. Skoro zwrócił dwa, albo redukcja schematu nie weszła do kodu,
albo schemat nie jest przekazywany do wywołania. Biała lista to złapała, ale to jest
druga linia obrony, nie pierwsza.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] `line` czytane z BaseLinkera, gdy klucz istnieje
- [ ] Każde pole w stanie ma widoczne źródło: `baselinker` albo `a1`
- [ ] Brak źródła P1 zawsze zostawia ostrzeżenie — `NO_P1_SOURCE` lub `P1_CHECK_IMPOSSIBLE`
- [ ] Pełne stany maszyny, `usageMetadata`, `a1Schema` z `plik:linia`, `git diff --stat`
- [ ] Zero wywołań do API BaseLinkera
- [ ] `npm test`: `fail 0`, pełny wydruk z nazwami

## ZAKAZY

- **Zero wywołań do API BaseLinkera.** Tryb `api` pozostaje zablokowany.
- Zakaz poprawiania wartości zwróconych przez A1. Jeśli znowu zwróci zmyśloną linię — wklej i opisz, nie koryguj.
- Zakaz danych mockowych w ścieżce produkcyjnej.
- Zero implementacji A2, A4 i dalszych węzłów. Zero A8 i A9.
- Zakaz `git add -A`; zapis przez `fs.writeFileSync` utf8; commit ASCII; sekrety jako `***`.
