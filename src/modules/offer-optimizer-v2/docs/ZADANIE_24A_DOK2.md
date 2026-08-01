# ZADANIE 24A-DOK2 — dwa diffy, jeden plik, jedna linia

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Od:** Architekt
- **Data:** 2026-07-31
- **Poprzednik:** `RAPORT_24A_DOK.md` — niezaliczony z powodu dwóch brakujących diffów
- **Raport wyjściowy:** `RAPORT_24A_DOK2.md`

---

## KONTEKST

Runda 24A-DOK była merytorycznie dobra. Poprawka promptu, schemat, zrzut stanu
i wydruk testów są w porządku i tego nie ruszamy.

Zabrakło dwóch diffów, a w raporcie padło zdanie, że w `PATCH_v4_1_prompty.md`
oprócz usunięcia sekcji A1 **znalazła się nowa treść**. Tego nie zlecałem i tego
nie widziałem. Skompilowany prompt A1 zawiera więc dziś coś, czego nie
zatwierdzałem — a grep na zakazane pola pochodzi sprzed tej zmiany.

Zamykamy to najprostszą drogą: pokazujesz pliki, ja czytam. **To jest ostatnia
runda dowodowa na 24A.**

---

## KROKI

**1. `git diff -- src/modules/offer-optimizer-v2/prompt-compiler.js`**
Cały wynik, wklejony nawet gdy pusty. Pusty jest oczekiwany po `git checkout`.

**2. `git diff -- src/modules/offer-optimizer-v2/docs/PATCH_v4_1_prompty.md`**
Cały wynik, bez skracania.

**3. Pełna treść `src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md`.**
Cały plik, od pierwszego do ostatniego znaku. Ma 2114 bajtów — mieści się
w raporcie bez problemu. Nie grep, nie fragment, nie streszczenie: cała treść.

**4. `brand` wypada z `allowedKeys`.**

To moje przeoczenie z poprzedniego zadania — wymieniłem `line` i `product_name`,
a `brand` zostawiłem. Powód, dla którego musi wypaść, jest ten sam: Equilibra nie
ma marki w BaseLinkerze (`brand.value: null`, `source: null` w Twoim własnym
zrzucie), więc P1-first jej nie obroni i wartość z modelu przeszłaby.
Zmyślona marka trafia do tytułu oferty i wskazuje producenta.

Po zmianie `allowedKeys` = `['country_of_origin', 'research_sources_used']`.

**Dowód:** `plik:linia` + wydruk listy + asercja na Equilibrze: mock A1 zwraca
`brand`, w stanie ma być `extracted_data.brand.value: null`,
`A1_FIELD_REJECTED: brand` w ostrzeżeniach, `a1_result` bez klucza `brand`.
Do tego pełny `orch.state` z tego przebiegu, z listą wartości wstrzykniętych
nad zrzutem.

**5. `npm test`** — pełny wydruk, `fail 0`, liczba nie niższa niż **80**.

---

## KRYTERIUM ZALICZENIA (binarne)

- trzy outputy z kroków 1–3, każdy w całości
- `allowedKeys` = dokładnie dwa pola, z `plik:linia` i wydrukiem
- pełny `orch.state` z przebiegu z kroku 4, bez wielokropków, z listą wstrzyknięć
- `npm test`: pełny wydruk, `fail 0`, ≥ 80

---

## ZAKAZY

- zero zmian w `PATCH_v4_1_prompty.md` w tej rundzie — pokazujesz stan, nie
  poprawiasz go
- zero zmian w `prompt-compiler.js`
- zero zmian w `validators/`
- zero wywołań API BaseLinkera i jakiegokolwiek API zewnętrznego
- zakaz zmian w `tests/fixtures/`
- zakaz ręcznej edycji plików `*_compiled.md`
- zakaz refaktoryzacji `orchestrator.js` poza usunięciem `brand` z `allowedKeys`
- w zrzucie stanu żadna wartość nie kończy się wielokropkiem
- statusu zadania nie ustalasz
