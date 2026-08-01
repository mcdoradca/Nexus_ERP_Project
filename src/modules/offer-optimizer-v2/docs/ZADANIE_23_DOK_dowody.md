# ZADANIE 23-DOK — dowody do Zadania 23

- **Od:** Architekt
- **Do:** Wykonawca
- **Data:** 2026-07-31
- **Poprzednik:** `RAPORT_23_pochodzenie_line.md` — **niezaliczony**, ocena w `OCENA_23_pochodzenie_line.md`
- **Raport wyjściowy:** `RAPORT_23_DOK_dowody.md`

---

## KONTEKST

Wdrożenie z Zadania 23 wygląda na wykonane, ale raport go nie dowodzi. Główne
kryterium — `line` czytane z BaseLinkera, gdy klucz `Linia` istnieje — nie ma
w raporcie ani jednego outputu, bo oba wklejone stany mają `line: null`.
Testy zostały policzone prozą.

**To jest runda dowodowa. Nie naprawiasz niczego, nie refaktoryzujesz, nie
dokładasz funkcji.** Defekty, które znalazłem, są spisane w ocenie i pójdą
osobnym zadaniem. Wszystko poniżej robisz offline, na plikach, które już masz
na dysku.

---

## KROKI

**1. Pełny wydruk `npm test`.**
Cały output, wszystkie nazwy testów, `fail 0`, licznik. Bez `(...)`, bez
„i pozostałe", bez podawania liczby zamiast wydruku.

Do tego, osobno: **lista asercji dodanych w Zadaniu 23** — dla każdej `plik:linia`
i jedno zdanie, co sprawdza. Nie interesuje mnie, o ile wzrosła liczba bloków
testowych; interesuje mnie, co dokładnie doszło do sprawdzania.

**2. Dowód głównego kryterium.**
Uruchom ten test, w którym obiekt wejściowy ma klucz `Linia`, i wklej **pełny
stan maszyny** z tego przebiegu. W stanie ma być widoczne:

```
"line": { "value": "<wartość>", "source": "baselinker", "matched_key": "Linia" }
```

oraz `token_usage_per_node` puste albo bez wpisu `A1` — czyli dowód, że przy
obecnym kluczu `Linia` model nie jest w ogóle pytany.

**3. Schemat A1.**
`plik:linia` definicji `responseSchema` dla węzła A1 z aktualnego odczytu,
plus pełny wydruk tego obiektu. Z-3.

**4. Trzy `git diff`, każdy z surowym outputem.**

- `git diff --stat -- src/modules/offer-optimizer-v2/tests/fixtures/` — oczekiwany
  output: pusty. Wklej nawet pusty
- `git diff -- .agents/.ai-memory.md` — pełny, plus jedno zdanie: dlaczego zmiana
  poza modułem v2 (OP-5)
- `git diff -- src/modules/offer-optimizer-v2/config/nodes.config.js` — pełny,
  plus jedno zdanie: co ta zmiana ma wspólnego z Zadaniem 23 (Z-5)

**5. Sprawdzenie klucza `Linia` w surowym fixturze Equilibry.**
W fixturze `.raw` (wariant przed obcięciem na 65535 bajtach) sprawdź, czy
w `text_fields.features` występuje klucz `Linia` i jaka jest jego wartość.
Wklej surowy output polecenia, którym to sprawdziłeś, i znaleziony fragment.

Jeśli klucz tam jest, a w wariancie `.trimmed` go nie ma — napisz to wprost.
**Niczego nie naprawiaj.** Chcę wiedzieć, czy ucięcie 64KB kasuje dane, których
brak potem wypełnia A1.

---

## KRYTERIUM ZALICZENIA (binarne)

Zaliczone wtedy i tylko wtedy, gdy **wszystkie pięć** punktów ma surowy output
w raporcie **oraz**:

- wydruk `npm test` jest kompletny, `fail 0`, licznik nie niższy niż 76
- stan z punktu 2 pokazuje `"source": "baselinker"` i `"matched_key": "Linia"`
  przy niepustym `line.value`
- punkt 4 zawiera trzy outputy, nie opis trzech outputów

Brak któregokolwiek outputu albo output skrócony = niezaliczone bez dalszej
lektury. Nie czytam raportu dwa razy.

---

## ZAKAZY

- **Zero wywołań API BaseLinkera.** Zero wywołań jakiegokolwiek API zewnętrznego.
  Wszystko z plików na dysku
- Zakaz jakichkolwiek zmian w `tests/fixtures/`
- Zakaz zmian w `Agent_1_prompt_v4.md`, `Agent_1_compiled.md` i w kompilatorze
  promptów — decyzja należy do mnie i jest w toku
- Zakaz zmian funkcjonalnych w `orchestrator.js`, `baselinker.extract.js`
  i `nodes.config.js`. Jedyne dopuszczalne zmiany kodu w tej rundzie to nowe
  asercje w plikach testowych, jeśli okażą się potrzebne do punktu 2
- Zakaz naprawiania defektów D-23.1 … D-23.6 z oceny. Pójdą osobno
- Zakaz skracania: bez `(...)`, bez liczb podawanych prozą zamiast wydruku
- Brak danych ≠ zgadywanie. `//HITL:` w kodzie i wpis w raporcie
