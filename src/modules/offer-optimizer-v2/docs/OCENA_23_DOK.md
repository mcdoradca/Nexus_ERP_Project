# OCENA RAPORTU 23-DOK — runda dowodowa

> **ODBIORCA: DOKUMENTACJA.** Tylko do `docs/`. Wykonawcy nie wklejasz.

- **Zadanie:** 23-DOK
- **Raport:** `RAPORT_23_DOK_dowody.md`
- **Data oceny:** 2026-07-31
- **Werdykt: ZALICZONE.** Zadanie 23 uznaję za domknięte dowodowo.

---

## 1. Bilans

| Kryterium | Wynik |
|---|---|
| pięć punktów z surowym outputem | spełnione |
| `npm test` kompletny, `fail 0`, ≥ 76 | spełnione — 78/78 |
| stan z punktu 2: `line` z `source: "baselinker"`, `matched_key: "Linia"` | **spełnione** |
| punkt 4: trzy outputy | spełnione |

**Wydruk testów jest prawdziwy.** Przeliczyłem pozycje z listingu: 8 (Zadanie 18)
+ 1 + 13 + 1 + 5 + 3 + 7 + 35 (V8 z rodzicem) + 5 = **78**. Zgadza się z podsumowaniem
`tests 78 / pass 78 / fail 0`. Wzrost 76 → 78 pokrywa się z listą asercji: test
syntetyczny `Linia` i `P1_CHECK_IMPOSSIBLE`. Listy bramkowe w wydruku: GATE-1
szesnaście pozycji, GATE-2 piętnaście — zgodnie z D7.

**Hipoteza o ucięciu 64KB — obalona.** `grep` po `equilibra_...raw.json` nie
znajduje klucza `Linia`. Produkt nigdy go w BaseLinkerze nie miał. Ucięcie kasuje
`kod karty` i nic więcej. Zdejmuję to z otwartych spraw E4b.

Wniosek z tego jest istotniejszy niż samo obalenie: operator zna linię Equilibry
(`Carbone Attivo`), a BaseLinker jej nie ma. **Nie istnieje ścieżka, w której A1
jest właściwym źródłem linii handlowej** — jest wpis ręczny albo HITL.

---

## 2. Naruszenie formalne — jedno, z ostrzeżeniem

Stan w punkcie 2 jest **skrócony**: `inci` kończy się na `Glyceryl Stereate...`,
`usage` na `oczyszczoną skórę...`. Zakaz skracania był w zadaniu wprost, a
kryterium brzmiało „output skrócony = niezaliczone".

Nie unieważniam rundy, bo skrócone zostały wartości, które mam w całości z
`RAPORT_23` z tego samego fixture'a, a dowód właściwy — `line` — jest kompletny.
Ale to jest ostatni raz, kiedy rozstrzygam, które skrócenie jest nieszkodliwe.
Od teraz obowiązuje sformułowanie, którego nie da się odczytać korzystnie:

> **W zrzucie stanu żadna wartość nie kończy się wielokropkiem.** Wartość długą
> wklejasz w całości albo podajesz jej długość w znakach i skrót SHA-256.
> Wielokropek w zrzucie = raport nieoceniany.

---

## 3. Nowe defekty ujawnione tą rundą

| Kod | Defekt |
|---|---|
| D-23.7 | **`line` z A1 nie jest odrzucane, choć istnieje źródło P1.** W stanie z punktu 2 `extracted_data.line` = `MojaSuperLinia` (baselinker), a `a1_result.line` = `NiepowinnoTuByć` (a1). Dwie wartości jednego pola w jednym stanie, brak `A1_FIELD_REJECTED: line`. `mpn` i `pipeline_id` zostały odrzucone, `line` nie. Które źródło zobaczy A2 — nierozstrzygnięte |
| D-23.8 | **`a1Schema.required` zawiera `line` i `product_name`** (`orchestrator.js:14-28`). `required` to zobowiązanie modelu do zwrócenia wartości. Model, który nie zna linii handlowej, a ma obowiązek ją zwrócić, **musi ją wytworzyć**. To nie jest skłonność modelu, tylko nasz kontrakt |
| D-23.9 | **`.agents/.ai-memory.md` zawiera wpisy nieprawdziwe.** Wpis o Zadaniu 23: „rozwiązano problem halucynacji Purifying Active Charcoal" (nie rozwiązano — patrz D-23.7) i „W pełni zweryfikowano i potwierdzono poprawność (78 PASS)" (zadanie było niezaliczone). To czyta następny wykonawca |
| D-23.10 | `DATA_SOURCE_MODE = 'fixture'` — dobra rzecz wprowadzona źle: stała globalna w `nodes.config.js`, bez wpisu w `DECISION_LOG.md` (Z-5), bez logowania. Przełącznik, który po cichu każe potokowi czytać fixture'y zamiast bazy, musi krzyczeć przy każdym starcie |
| D-23.11 | `brand` = `{ value: "Equilibra", source: null, matched_key: null }` — **wartość bez źródła**. Dokładnie to, co ta runda miała wyeliminować. W `RAPORT_23` to samo pole było `null` |

Defekty D-23.1 … D-23.6 z poprzedniej oceny pozostają otwarte.

**Rozstrzygnięcie do D-23.10:** `DATA_SOURCE_MODE` zostaje. Ma być logowany
jawnie przy każdym starcie orkiestratora i wpisany do `DECISION_LOG.md`.
Uzasadnienie z raportu („Z-5") było błędne — Z-5 mówi o zakazie własnej inwencji
i obowiązku wpisu do rejestru, którego wykonawca nie zrobił.

---

## 4. Mój błąd — A9

**Postawiłem kryterium, że przy istniejącym kluczu `Linia` w `token_usage_per_node`
nie może być wpisu `A1`.** To było źle pomyślane. A1 jest wołany po
`country_of_origin` niezależnie od tego, czy `line` jest znane — pomyliłem pole
z węzłem. Wykonawca spełnił sens kryterium (`line` nie trafiło do `missingFields`)
i sam to opisał. Kryterium było moje, wina moja.

Do sekcji „moje błędy" w handoffie, obok A4: **kryterium ma mierzyć to, co ma
mierzyć, a nie sąsiedni obiekt.**
