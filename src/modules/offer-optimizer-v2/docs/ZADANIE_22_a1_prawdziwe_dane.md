# ZADANIE 22 — A1 NA PRAWDZIWYCH DANYCH

| Pole | Wartość |
|---|---|
| Numer | 22 |
| Etap | E4b |
| Wydał | Architekt |
| Data wydania | 2026-07-31 |
| Poprzednie zadanie | ZADANIE_21 — **NIEZALICZONE**, powód poniżej |
| Oczekiwany raport | RAPORT_22_a1_prawdziwe_dane.md |
| **Wywołania BaseLinkera** | **ZERO. Całość na fixture'ach z dysku.** |

## CO JEST DOBRZE — NIE RUSZAJ

**Ekstrakcja działa i to jest duży krok.**

Dla Equilibry z uciętego pliku wraca skład trzydziestu składników z olejem ze
słodkich migdałów, `truncated: true`, dziewięć odzyskanych kluczy bez `kod karty`,
a podmiot odpowiedzialny wychodzi z opisu z **prawidłowym** adresem `Via Plava, 74
Torino – 10135 Italy` i zachowanym `raw_fragment`. `product_name` bierze się
z `text_fields.name`, `mpn` i `brand` są puste, bo w tym produkcie ich nie ma.
Każde pole ma `matched_key`.

**Przebieg dla Trimay jest wzorcowy.** Zatrzymanie na `MISSING_EU_RESPONSIBLE_PERSON`
następuje w warstwie `EXTRACT`, `token_usage_per_node` jest puste — model nie został
wywołany ani razu. Potok stanął **przed** wydaniem pieniędzy na dane, których i tak
nie wolno przyjąć. Dokładnie o to chodziło.

Zero wywołań do API BaseLinkera. Potwierdzone.

## DLACZEGO ZADANIE NIE JEST ZALICZONE

### A1 dostał dane zmyślone, a nie dane produktu

```json
"a1_result": {
  "gtin_ean": "5901234567890",
  "brand": "MOCK_BRAND",
  "line": "MOCK_LINE",
  "product_name": "mock pim",
  "country_of_origin": "Poland"
}
```

To nie jest odpowiedź na pytanie o Equilibrę. EAN `5901234567890` to numer
przykładowy, nie nasz. „Poland" jako kraj pochodzenia włoskiego kosmetyku. Nazwy
z prefiksem `MOCK_`.

Wywołanie faktycznie poszło — `usageMetadata` pokazuje 1453 tokeny wejścia — ale
w bloku dynamicznym promptu siedziały dane atrapowe zamiast danych z BaseLinkera.
Najpewniej źródłem jest `test_pim.js` albo mockowy obiekt w `scripts/test_orchestrator.js`.

Skutek jest taki, że **przebieg dla Equilibry niczego nie dowodzi.** Nie wiemy, czy
A1 na prawdziwych danych zwróci sensowną markę i linię, bo nigdy ich nie zobaczył.

### Zatrzymanie Equilibry jest fałszywe

Stan pokazuje `A1: HALTED_HITL_REQUIRED` z komunikatem „Brak danych krytycznych".
Zatrzymanie wynika z pola `missing_critical_data: true`, które **przyszło od modelu**
odpowiadającego na atrapę.

Equilibra ma komplet: skład, podmiot odpowiedzialny, pojemność, sposób użycia,
ostrzeżenia. **Ten produkt nie ma prawa się zatrzymać.** Oczekiwany wynik to
przejście FAZY 1.

Głębszy problem: `missing_critical_data` nadal decyduje o zatrzymaniu potoku. D18
mówi wprost — **model deklaruje, kod rozstrzyga.** O kompletności danych decyduje
sprawdzenie wyekstrahowanych wartości, nie samoocena modelu.

### Redukcja schematu A1 jest niepełna

W odpowiedzi nadal są `gtin_ean`, `missing_critical_data`
i `missing_critical_data_reason`. Wartość tego ostatniego —
`MISSING_CRITICAL_GPSR_AND_SAFETY_DATA_SHEET` — jest zmyślona, takiego kodu nie ma
w projekcie.

### Biała lista nie zostawiła śladu

`normalization_warnings` zawiera tylko `NO_P1_SOURCE` i `pipeline_id_overwritten`.
Skoro model zwrócił pola spoza dozwolonej czwórki, w stanie powinien być wpis
o ich odfiltrowaniu. Albo lista nie zadziałała, albo nie loguje.

### Liczba testów bez zmian, wydruk skrócony

`tests/orchestrator.test.js` zmienił się o 36 linii, a testów nadal 72 — brak
przypadków dla dwóch nowych zatrzymań. Wydruk `npm test` znowu przyszedł ucięty
przez `(...)`, mimo że zadanie prosiło o pełną listę nazw.

## KROKI

### KROK 1 — blok dynamiczny z prawdziwych danych

Prompt A1 dostaje w bloku dynamicznym **wyłącznie dane wyekstrahowane z BaseLinkera**
plus EAN. Zero obiektów mockowych, zero danych z `test_pim.js`.

Odszukaj miejsce, w którym wstrzykiwana jest atrapa, usuń tę ścieżkę i podaj
w raporcie `plik:linia` przed zmianą.

Do bloku dynamicznego wchodzi też **jawna lista pól, o które pytamy** — tych,
których BaseLinker nie dostarczył.

### KROK 2 — domknięcie schematu A1

Schemat odpowiedzi A1 zawiera **dokładnie cztery pola** i nic poza nimi:

```
line, country_of_origin, product_name, research_sources_used
```

Usuwasz `gtin_ean` (znamy go, sami go podajemy), `missing_critical_data`
i `missing_critical_data_reason` (o kompletności rozstrzyga kod).

### KROK 3 — o zatrzymaniu decyduje kod

Zatrzymania po FAZIE 1 wynikają **wyłącznie** ze sprawdzenia danych wyekstrahowanych:

- brak składu INCI → `MISSING_INCI`,
- brak lub niekompletny podmiot odpowiedzialny → `MISSING_EU_RESPONSIBLE_PERSON`,
- odrzucenie przez `validate_eu_responsible_person` → `MALFORMED_EU_RESPONSIBLE_PERSON`.

Żadne pole z odpowiedzi A1 nie może zatrzymać potoku. Jeśli A1 nie znajdzie marki —
pole zostaje `null`, a potok idzie dalej. Marka nie jest daną prawną.

### KROK 4 — biała lista zostawia ślad

Każde pole odrzucone przy scalaniu trafia do stanu jako ostrzeżenie z nazwą pola,
na przykład `A1_FIELD_REJECTED: gtin_ean`. Odrzucenie ma być widoczne, nie ciche.

### KROK 5 — testy dla nowych zatrzymań

Dopisz przypadki:

1. brak INCI w danych wejściowych → `MISSING_INCI`, A1 **nie jest wołany**,
2. brak podmiotu odpowiedzialnego → `MISSING_EU_RESPONSIBLE_PERSON`, A1 **nie jest wołany**,
3. komplet danych → FAZA 1 kończy się bez zatrzymania,
4. A1 zwraca pole spoza białej listy → pole odrzucone, ostrzeżenie w stanie.

### KROK 6 — przebiegi kontrolne

Ponów oba przebiegi z Zadania 21 i wklej pełne stany maszyny.

**Oczekiwane wyniki:**

| Produkt | Wynik |
|---|---|
| Equilibra `8000137015436` (`.raw.json`) | FAZA 1 **bez zatrzymania**; A1 wołany o `line` i `country_of_origin`; odpowiedź dotyczy prawdziwego produktu, nie atrapy |
| Trimay `8809822541010` | zatrzymanie `MISSING_EU_RESPONSIBLE_PERSON` w `EXTRACT`, zero wywołań LLM — bez zmian wobec Zadania 21 |

Jeśli A1 na prawdziwych danych zwróci `country_of_origin` inne niż Włochy albo linię
niezgodną z produktem — **nie poprawiaj tego.** Wklej, co zwrócił, i opisz. To jest
informacja o modelu, nie usterka do ukrycia.

### KROK 7 — raport

1. `plik:linia` miejsca, w którym siedziała atrapa, przed zmianą,
2. pełne stany maszyny dla obu przebiegów,
3. surowa odpowiedź A1 wraz z `usageMetadata`,
4. **pełny wydruk `npm test` z nazwami wszystkich przypadków** — bez `(...)`, bez skracania,
5. `git status --short` i `git diff --stat`,
6. jawne zdanie: ile wywołań do API BaseLinkera wykonało to zadanie.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] W stanie nie ma żadnej wartości z prefiksem `MOCK` ani EAN-u innego niż badany
- [ ] Schemat A1 zawiera dokładnie cztery pola
- [ ] Equilibra kończy FAZĘ 1 **bez zatrzymania**
- [ ] Trimay zatrzymuje się jak dotąd, bez wywołania LLM
- [ ] Odrzucone pola A1 widoczne w stanie
- [ ] `npm test` ≥ 76, `fail 0`, pełny wydruk z nazwami
- [ ] Zero wywołań do API BaseLinkera

## ZAKAZY

- **Zero wywołań do API BaseLinkera.** Tryb `api` pozostaje zablokowany.
- Zakaz danych mockowych w ścieżce produkcyjnej potoku. Atrapy wyłącznie w testach jednostkowych, jawnie nazwane.
- Zakaz uzupełniania brakujących danych przez model.
- Zero implementacji A2, A4 i dalszych węzłów. Zero A8 i A9.
- Zakaz `git add -A`; zapis przez `fs.writeFileSync` utf8; commit ASCII; sekrety jako `***`.
