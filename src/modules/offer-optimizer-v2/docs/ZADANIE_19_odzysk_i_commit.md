# ZADANIE 19 — ODZYSK `features` I COMMIT DOROBKU

| Pole | Wartość |
|---|---|
| Numer | 19 |
| Etap | E4b |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Zastępuje | wstrzymaną wersję ZADANIE_19 z 2026-07-30 — **realizuj wyłącznie tę** |
| Poprzednie zadanie | ZADANIE_19A — **ZALICZONE** |
| Oczekiwany raport | RAPORT_19_odzysk_i_commit.md |
| Zakres | jedna funkcja + testy + porządek w repozytorium. **Zero LLM.** |

## ZALICZENIE ZADANIA 19A

Pomiar objął cały katalog, nie próbę — 552 produkty. Wynik jest jednoznaczny
i zmienia priorytet sprawy.

| Miara | Wynik |
|---|---|
| produkty z uciętym `features` | **1 z 552** (0,18%) |
| `description` powyżej limitu | **0** |
| skład INCI przed miejscem ucięcia | **tak**, z dużym zapasem |

Podmiot odpowiedzialny jest bezpieczny w całym katalogu — `description` nie pęka
u żadnego produktu. To zdejmuje z nas obawę, która przy jednym przypadku Equilibry
wyglądała groźnie.

### Ustalenie, którego nie było w zadaniu, a jest cenne

Ze wszystkich 552 produktów **tylko ten jeden** zwraca `features` jako string.
Pozostałe 551 wraca jako obiekt. Korelacja jest zupełna, więc zachodzi prosty
niezmiennik:

```
typeof text_fields.features === 'string'  ⟺  JSON jest uszkodzony
```

BaseLinker najwyraźniej sam próbuje zdekodować to pole i przy niepowodzeniu oddaje
surowy ciąg. Wykrywanie awarii nie wymaga więc żadnej heurystyki — wystarczy
sprawdzenie typu. Wykorzystaj to.

## KROKI

### KROK 1 — `parseFeaturesTolerant(raw)`

Funkcja w `baselinker.extract.js`, zwraca `{ data, truncated, recovered_keys }`.

1. `typeof raw === 'object'` → `{ data: raw, truncated: false }`. To ścieżka dla 551 z 552 produktów i ma być pierwsza.
2. `typeof raw === 'string'` → spróbuj `JSON.parse`. Sukces (przypadek teoretyczny, w katalogu nie występuje) → `truncated: false`.
3. Niepowodzenie → obetnij do **ostatniej kompletnej pary klucz-wartość**, domknij klamrą, sparsuj ponownie.
   - Iteruj wstecz maksymalnie pięć razy.
   - Nie udało się → `{ data: null, truncated: true, recovered_keys: [] }`.
4. Sukces po obcięciu → `truncated: true`, `recovered_keys` = klucze faktycznie odzyskane.

Zasady bezwzględne:
- **Obcinamy, nigdy nie uzupełniamy.** Zakaz doklejania czegokolwiek do wartości.
- Wartość urwana w środku nie wchodzi do wyniku. Lepiej `null` niż połowa zdania.
- `truncated: true` wraz z `recovered_keys` trafia do stanu maszyny jako ostrzeżenie — operator ma widzieć, że karta w BaseLinkerze jest uszkodzona.

### KROK 2 — `kod karty` na liście kluczy ignorowanych

Blok HTML szablonu marketingowego. Potok go nie czyta i nie będzie czytał.
Dopisz do `baselinker.extract.config.json` jako klucz jawnie pomijany.

### KROK 3 — testy na `equilibra_8000137015436.raw.json`

Bez żadnej edycji pliku:

1. `truncated: true`,
2. `inci.value` odzyskany, kończy się kropką, zawiera `Prunus Amygdalus Dulcis (Sweet Almond) Oil`,
3. `capacity`, `usage`, `warnings` odzyskane z prawidłowymi `matched_key`,
4. `mpn` i `brand` nadal `null`,
5. `recovered_keys` nie zawiera `kod karty`,
6. fixture'y Trimay: `truncated: false`, wyniki bez zmian wobec Zadania 18.

### KROK 4 — commit dorobku E4b

`git status --short` pokazuje, że **cały moduł ekstrakcji istnieje wyłącznie w drzewie
roboczym**. Nieśledzone są `baselinker.extract.js`, `baselinker.extract.config.json`,
`tests/baselinker.extract.test.js`, cały katalog `tests/fixtures/` oraz wszystkie
dokumenty procesu z `docs/`.

Praca dwóch rund nie jest zabezpieczona. Zacommituj, po nazwie, bez `git add -A`:

- `src/modules/offer-optimizer-v2/baselinker.extract.js`
- `src/modules/offer-optimizer-v2/baselinker.extract.config.json`
- `src/modules/offer-optimizer-v2/tests/baselinker.extract.test.js`
- `src/modules/offer-optimizer-v2/tests/fixtures/` (wszystkie pliki)
- `src/modules/offer-optimizer-v2/scripts/check_64kb_limit.js`
- `src/modules/offer-optimizer-v2/scripts/test_orchestrator.js`
- wszystkie `docs/ZADANIE_*.md`, `docs/RAPORT_*.md`, `docs/PLAN_*.md`, `docs/AKCEPTACJA_*.md`, `docs/DECYZJA_*.md`

```
git commit -m "E4b: baselinker extraction layer, tolerant features parser, real fixtures"
```

### KROK 5 — skrypty robocze do `.gitignore`

W katalogu głównym leżą pliki robocze z ostatnich rund: `diag.js`, `diag_fixtures.js`,
`fix_fixture.js`, `gen_fixtures.js`, `generate_report_15.js`, `sonda_16.js`,
`sonda_output.json`, `sonda_output_clean.json`, `test_pim.js`, `test_prompt.js`.

Zgodnie z D14 **nie kasujemy ich z dysku** — dopisz do `.gitignore`, żeby nie wchodziły
do commitów.

Uwaga: `fix_fixture.js` i `gen_fixtures.js` to skrypty, którymi powstał wcześniej
poprawiony fixture. Upewnij się, że pliki w `tests/fixtures/` pochodzą z Zadania 18,
a nie z nich.

### KROK 6 — raport

1. wynik `extractFromFeatures` dla Equilibry z `.raw.json` — pełny obiekt,
2. `npm test` od linii `ℹ tests` — oczekiwane ≥ 78,
3. `git log --oneline -2`,
4. `git status --short` — bez plików `??` w `src/modules/offer-optimizer-v2/`.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Equilibra z `.raw.json` zwraca skład, pojemność, sposób użycia i ostrzeżenia
- [ ] `mpn` i `brand` nadal `null`
- [ ] `truncated: true` w wyniku i w stanie maszyny
- [ ] Moduł, testy i fixture'y są w gicie
- [ ] `src/modules/offer-optimizer-v2/` bez plików nieśledzonych
- [ ] `npm test`: `fail 0`

## ZAKAZY

- Zakaz uzupełniania i rekonstruowania uciętych wartości.
- Zakaz kasowania plików z dysku (D14).
- Zero LLM, zero zapisu do BaseLinkera, zero implementacji A2/A4.
- Zakaz `git add -A`; zapis przez `fs.writeFileSync` utf8; commit ASCII; sekrety jako `***`.
