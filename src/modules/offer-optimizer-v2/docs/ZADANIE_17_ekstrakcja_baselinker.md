# ZADANIE 17 — WARSTWA EKSTRAKCJI Z BASELINKERA (bez LLM)

| Pole | Wartość |
|---|---|
| Numer | 17 |
| Etap | E4b (pierwsze zadanie podetapu) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_16 — **ZALICZONE** |
| Oczekiwany raport | RAPORT_17_ekstrakcja_baselinker.md |
| Zakres | nowy moduł + testy jednostkowe. **Zero wywołań LLM — to zadanie nie zużywa tokenów modelu.** |

## ZALICZENIE ZADANIA 16

Inwentaryzacja dała liczby, na których da się projektować. Podsumowanie wiążące:

| Dana | Pokrycie w próbie 20 | Klucze |
|---|---|---|
| Skład INCI | **12 / 20** | `Ingredients / INCI`, `skladniki inci` |
| Kod producenta (`mpn`) | **19 / 20** | `Kod producenta` |
| Marka | 19 / 20 | `Marka`, `Brand` |
| Pojemność | ~12 / 20 | `Pojemność`, `Capacity`, `Pojemność opakowania`, `Wielkość` |
| Sposób użycia | 12 / 20 | `Usage instructions`, `sposob uzycia` |
| Uwagi bezpieczeństwa | 12 / 20 | `Warnings`, `uwagi dotyczace bezpieczenstwa` |
| Podmiot odpowiedzialny | **1 / 20** | tylko w `description`, jako doklejony HTML |
| `ph_value`, `clp_*`, `ufi_code` | 0 / 20 | brak |

Dwa nazewnictwa — polskie bez ogonków i angielskie — nie są przeszkodą. Rozwiązuje
je normalizacja klucza plus mapa synonimów, rozszerzalna przy nowych dostawcach.

## D19 — HIERARCHIA ŹRÓDEŁ DANYCH

**Decyzja operatora z 2026-07-30. Do wpisania do `DECISION_LOG.md`.**

```
1. BaseLinker — dane produktu (features, description, pola natywne)
2. Tabela marek — uzupełniana ręcznie przez operatora, docelowo
   zastąpiona produktyzacją po stronie BaseLinkera
3. HALTED_HITL_REQUIRED
```

Model nie występuje w tej hierarchii w ogóle. Dla pól z D18 i dla
`raw_ingredients_inci` oraz `logistics` A1 nie jest źródłem — nigdy, w żadnym
przypadku, także gdy „wie".

Uzasadnienie w `RAPORT_16`: skład zwracany przez A1 dla SKU `8000137015436` był
zmyślony w sposób powtarzalny przez cztery przebiegi, z pominięciem alergenu
orzechowego obecnego w produkcie.

## KROKI

### KROK 1 — sonda producentów (odczyt, dwie minuty)

`getInventoryProductsData` zwraca `manufacturer_id` (dla Equilibry: `1625271`).
Zanim zaprojektujemy tabelę marek, sprawdź, czy BaseLinker już ma na to miejsce.

Wywołaj metodę listującą producentów z katalogu i wklej **surową odpowiedź** dla
kilku pozycji. Odpowiedz na jedno pytanie: czy rekord producenta zawiera pola
adresowe i kontaktowe, czy wyłącznie nazwę.

Jeśli metoda nie istnieje albo zwraca samą nazwę — napisz to wprost i przejdź dalej.
Nie szukaj obejść.

### KROK 2 — moduł `baselinker.extract.js`

Nowy plik w `src/modules/offer-optimizer-v2/`. Funkcje czyste, bez efektów ubocznych,
bez wywołań sieciowych — na wejściu obiekt produktu z BaseLinkera, na wyjściu dane.

**a) `normalizeFeatureKey(key)`**
Małe litery, usunięcie polskich znaków diakrytycznych, zamiana `/`, `-`, `_`
na spację, redukcja wielokrotnych spacji, `trim`. Dzięki temu `Ingredients / INCI`,
`skladniki inci` i `Składniki INCI` sprowadzają się do porównywalnych postaci.

**b) Mapa synonimów** — w osobnym pliku konfiguracyjnym, nie w kodzie funkcji:

```
inci        → ingredients inci, skladniki inci, sklad inci, inci
mpn         → kod producenta
brand       → marka, brand
capacity    → pojemnosc, capacity, pojemnosc opakowania, wielkosc
usage       → usage instructions, sposob uzycia
warnings    → warnings, uwagi dotyczace bezpieczenstwa
```

Nietrafienie w żaden synonim → `null`. **Zakaz dopasowania „na podobieństwo"**,
zakaz zgadywania po fragmencie nazwy.

**c) `extractFromFeatures(product)`**
`text_fields.features` to string z zakodowanym JSON-em — najpierw parsowanie,
w `try/catch`. Wartości zwracane **dosłownie**, bez przeformatowania: skład INCI
ma wyjść znak w znak taki, jaki jest w BaseLinkerze.

Wynik zawiera dla każdego pola: wartość oraz **nazwę klucza, z którego pochodzi**
(`matched_key`). To jest potrzebne do audytu — musimy umieć powiedzieć, skąd wzięła
się każda dana.

**d) `extractResponsiblePersonFromDescription(html)`**
Ostrożnie i konserwatywnie. Szukaj bloku zawierającego adres e-mail (`mailto:`
albo wzorzec adresu) wraz z sąsiadującymi akapitami. Zwróć `{ name, address_eu,
contact, raw_fragment }`.

Zasady:
- gdy nie da się jednoznacznie rozdzielić nazwy od adresu → wszystkie pola `null`, ale `raw_fragment` wypełniony,
- **zakaz uzupełniania czegokolwiek spoza tekstu wejściowego**,
- wynik przechodzi przez istniejący `validate_eu_responsible_person`.

Dla wzorca z Equilibry (`<p>Equilibra srl</p><p>Via Plava, 74 Torino – 10135 Italy</p><p><a href="mailto:...">`) ma zadziałać. Dla produktów Trimay ma zwrócić `null` — i to jest wynik poprawny.

### KROK 3 — testy jednostkowe na prawdziwych danych

Zapisz w `tests/fixtures/` surowe odpowiedzi BaseLinkera dla czterech produktów
z Zadania 16: Equilibra `8000137015436` i trzy Trimay. Fixture'y skracaj wyłącznie
przez usunięcie pola `kod karty` z `features` (to blok HTML szablonu, nieużywany).

Przypadki testowe:
1. Equilibra: skład INCI zgodny **znak w znak** z BaseLinkerem, 30 składników, zawiera `Prunus Amygdalus Dulcis (Sweet Almond) Oil`.
2. Equilibra: `mpn` z klucza `Kod producenta`, różny od EAN-u.
3. Equilibra: podmiot odpowiedzialny wyekstrahowany z `description`, `address_eu` zawiera `Via Plava`.
4. Trimay: skład INCI odnaleziony pod kluczem `Ingredients / INCI`.
5. Trimay: podmiot odpowiedzialny = `null`, `raw_fragment` = `null`.
6. `features` niebędące poprawnym JSON-em → wszystkie pola `null`, brak wyjątku.
7. Klucz nieznany (np. `Skladniki`) → `null`, **nie** dopasowanie na podobieństwo.

### KROK 4 — raport

Wklej surowe outputy:

1. odpowiedź metody producentów z KROKU 1,
2. `npm test` od linii `ℹ tests` — oczekiwane ≥ 71,
3. `git status --short` i `git diff --stat`,
4. wynik `extractFromFeatures` dla Equilibry i dla jednego Trimay — pełny obiekt, z `matched_key`.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Skład INCI Equilibry zgodny znak w znak z BaseLinkerem, z `Prunus Amygdalus Dulcis`
- [ ] `mpn` z `Kod producenta`, nie z EAN-u
- [ ] Podmiot odpowiedzialny Equilibry wyekstrahowany, Trimay = `null`
- [ ] Niepoprawny JSON w `features` nie wywala modułu
- [ ] Każde pole ma `matched_key`
- [ ] `npm test`: `fail 0`

## ZAKAZY

- **Zero wywołań LLM w tym zadaniu.** Cała ekstrakcja jest deterministyczna.
- Nie podłączaj tego jeszcze do orkiestratora ani nie zmieniaj A1 — to Zadanie 18.
- Zakaz dopasowania kluczy „na podobieństwo", zakaz wartości domyślnych.
- Zakaz przeformatowania składu INCI — dosłownie tak, jak w źródle.
- Zero zapisu do BaseLinkera.
- Zakaz `git add -A`; zapis plików przez `fs.writeFileSync` utf8; commit ASCII; sekrety jako `***`.
