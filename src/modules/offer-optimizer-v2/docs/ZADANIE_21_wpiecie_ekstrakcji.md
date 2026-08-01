# ZADANIE 21 — WPIĘCIE EKSTRAKCJI DO ORKIESTRATORA (offline)

| Pole | Wartość |
|---|---|
| Numer | 21 |
| Etap | E4b |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Oczekiwany raport | RAPORT_21_wpiecie_ekstrakcji.md |
| **Wywołania BaseLinkera** | **ZERO. Całość na fixture'ach z dysku.** |
| Wywołania LLM | najwyżej jedno (węzeł A1), i tylko jeśli okaże się potrzebne |

## CEL

Dziś potok bierze dane produktowe z A1, czyli od modelu. Decyzje D18 i D19 mówią,
że dane mają pochodzić z BaseLinkera, a model nie jest źródłem. Warstwa ekstrakcji
istnieje i działa, ale nie jest podłączona. To zadanie ją podłącza.

Powód, dla którego to jest pilne: dla SKU testowego model zwracał skład INCI
z siedemnastu składników, podczas gdy prawdziwy ma trzydzieści — z pominięciem oleju
ze słodkich migdałów, czyli alergenu orzechowego. Ten sam skład był identyczny
w czterech przebiegach, więc porównywanie kolejnych uruchomień go nie wykrywało.
Dopóki ekstrakcja nie jest wpięta, bramki GATE-1, GATE-2 i GATE-3 sprawdzają skład,
którego produkt nie ma.

## KROKI

### KROK 1 — źródło danych produktowych z przełącznikiem trybu

Nowa funkcja w `orchestrator.js`: `loadProductData(ean)`.

Dwa tryby, wybierane z konfiguracji:

- **`fixture`** — tryb domyślny na czas E4b. Wczytuje odpowiedź BaseLinkera z pliku w `tests/fixtures/` po EAN-ie. Zero sieci.
- **`api`** — **na razie nieczynny**. Wywołanie w tym trybie ma rzucić błąd o treści wskazującej, że pobranie z API wymaga jawnej zgody operatora i przelotu zgodnego z sekcją 2 promptu startowego.

Nie pisz w tym zadaniu klienta API. Tryb `api` ma istnieć jako zablokowana ścieżka,
nic więcej.

### KROK 2 — nowa kolejność FAZY 1

```
1. ean_checksum (V1)          → błąd = CRITICAL_INPUT_ERROR, koniec
2. loadProductData(ean)       → z fixture'a
3. parseFeaturesTolerant      → obsługa uciętego JSON
4. extractFromFeatures        → sześć pól z matched_key
5. extractResponsiblePersonFromDescription
6. validate_eu_responsible_person
7. analiza braków             → co jeszcze trzeba ustalić
8. A1                         → tylko dla brakujących pól, patrz KROK 3
```

Wyniki ekstrakcji lądują w stanie maszyny razem z `matched_key`, `truncated`
i `recovered_keys`. Operator ma widzieć, skąd pochodzi każda wartość.

### KROK 3 — A1 tylko dla tego, czego naprawdę brakuje

Po ekstrakcji orkiestrator wylicza listę pól, których BaseLinker nie dostarczył,
i **wywołuje A1 wyłącznie dla nich**. Lista brakujących pól wchodzi do bloku
dynamicznego promptu.

Schemat odpowiedzi A1 zostaje **zawężony** do pól, których A1 nadal może dotyczyć:

```
line, country_of_origin, product_name, research_sources_used
```

**Usuwasz ze schematu A1 w całości** (D18): `compliance_gpsr_clp` ze wszystkimi
polami, `raw_ingredients_inci`, `logistics`, `mpn`, `verified_certificates`.

**Jeżeli lista brakujących pól jest pusta — A1 nie jest wywoływany w ogóle.**
Zapisz w stanie maszyny fakt pominięcia węzła wraz z oszczędnością tokenów.
To nie jest optymalizacja na boku, tylko wprost cel projektu: nie płacimy modelowi
za dane, które mamy w bazie.

### KROK 4 — twarde zatrzymania

Po ekstrakcji, przed jakimkolwiek dalszym krokiem:

- brak składu INCI → `HALTED_HITL_REQUIRED`, powód `MISSING_INCI`,
- brak lub niekompletny podmiot odpowiedzialny → `HALTED_HITL_REQUIRED`, powód `MISSING_EU_RESPONSIBLE_PERSON`,
- `validate_eu_responsible_person` odrzuca wartość → `MALFORMED_EU_RESPONSIBLE_PERSON`.

Zatrzymanie jest wynikiem poprawnym. **Zakaz uzupełniania brakujących pól przez
model, żeby potok „przeszedł".**

### KROK 5 — przebiegi kontrolne na fixture'ach

Uruchom potok dla dwóch produktów i wklej dla każdego pełny stan maszyny:

1. **Equilibra `8000137015436`** — fixture `.raw.json`, czyli wariant z uciętym JSON-em. Oczekiwane: skład odzyskany, `truncated: true`, podmiot odpowiedzialny wyekstrahowany z opisu, `mpn` i `brand` puste.
2. **Trimay `8809822541010`** — oczekiwane: skład i pozostałe pola z `features`, podmiot odpowiedzialny nieodnaleziony, a więc `HALTED_HITL_REQUIRED` z powodem `MISSING_EU_RESPONSIBLE_PERSON`.

Drugi przypadek ma się **zatrzymać** i to jest wynik prawidłowy. Nie obchodź go.

### KROK 6 — raport

1. pełny stan maszyny dla obu przebiegów,
2. `usageMetadata`, jeśli A1 był wołany — albo jawna informacja, że został pominięty i dlaczego,
3. `npm test` — pełny wydruk z nazwami przypadków, `fail 0`,
4. `git status --short` i `git diff --stat`,
5. **jawne zdanie: ile wywołań do API BaseLinkera wykonało to zadanie.** Oczekiwana odpowiedź: zero.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Skład INCI w stanie maszyny pochodzi z BaseLinkera, ma 30 składników i zawiera `Prunus Amygdalus Dulcis (Sweet Almond) Oil`
- [ ] Schemat A1 nie zawiera już pól prawnych, INCI, logistyki, `mpn` ani certyfikatów
- [ ] Trimay zatrzymuje się na `MISSING_EU_RESPONSIBLE_PERSON`
- [ ] Każda wartość w stanie ma widoczne pochodzenie (`matched_key` lub źródło)
- [ ] Zero wywołań do API BaseLinkera
- [ ] `npm test`: `fail 0`

## ZAKAZY

- **Zero wywołań do API BaseLinkera.** Tryb `api` ma pozostać zablokowany.
- Zero implementacji A2, A4 i dalszych węzłów — to kolejne zadania.
- Zero A8 i A9 (D11).
- Zakaz uzupełniania brakujących danych przez model.
- Zakaz wpisywania do fixture'ów czegokolwiek, czego nie ma w odpowiedzi API.
- Zakaz `git add -A`; zapis plików przez `fs.writeFileSync` utf8; commit ASCII; sekrety jako `***`.
