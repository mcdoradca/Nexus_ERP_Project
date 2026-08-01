# ZADANIE 29 — domknięcie A2 + A4 w potoku

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_29.md`, ściśle wg SZABLONU

A2 działa na żywo — to jest zrobione i tego nie ruszamy. Ta runda domyka cztery
drobiazgi i dokłada A4, żeby potok szedł `EXTRACT → A1 → A2 → A4`.

**Sprostowanie do mojego warunku STOP nr 2:** miał chronić przed naginaniem
testów pod kod, ale objął też przypadek, w którym zachowanie zmieniło się
celowo. Test na `RUN_A2` masz poprawić — to była zaplanowana zmiana. Zasada
w nowym brzmieniu: **test wolno zaktualizować tylko wtedy, gdy zmianę zachowania
zleciłem na piśmie; w każdym innym przypadku naprawiasz kod.**

---

## KROK 1 — cztery poprawki

**a) Prompt A2 u źródła.** `Agent_2_compiled.md:35` wciąż każe modelowi zwracać
`pipeline_id` i `gtin_ean`. Usuwasz oba z sekcji WYJŚCIE w
`docs/Agent_2_prompt_v4.md` i rekompilujesz. Ręczna edycja `*_compiled.md`
zakazana. Dowód: `grep -n "pipeline_id\|gtin_ean" Agent_2_compiled.md` — pusto.

**b) `next_action` po A2 = `RUN_A4`.** Agent A3 nie istnieje w architekturze,
a potok ustawia dziś `RUN_A3`. Poprawiasz kod i asercję w
`orchestrator.test.js:57` (autoryzowane, patrz sprostowanie wyżej).

**c) Regresja `P1_CHECK_IMPOSSIBLE`.** Test `orchestrator.test.js:182` przestał
przechodzić i **to jest regresja, nie zmiana zachowania**. Naprawiasz kod, nie
test. W raporcie jedno zdanie: co ją spowodowało.

**d) Walidacja domen.** W `a1_result.research_sources_used` z przebiegu na żywo
wróciło `https://www.gs1.org.gs1.pl` — domena syntaktycznie niepoprawna, czyli
ślad zmyślania. Każdy wpis w `research_sources_used` i `scraped_sources`
sprawdzasz: nie parsuje się jako poprawna domena → usuwasz z tablicy i dopisujesz
`INVALID_SOURCE_DOMAIN: <wartość>` do `normalization_warnings`.

---

## KROK 2 — A4 w potoku

A4 wołasz **wyłącznie gdy `state.chemical_route === true`**. Passthrough nie
istnieje — produkt bez trasy chemicznej nigdy nie trafia do A4.

Kolejność:

1. skompiluj `Agent_4_prompt_v4.md` istniejącym kompilatorem
2. rozbij `extracted_data.inci.value` na listę składników istniejącą funkcją
   normalizacji (`normalizeIngredientName`)
3. pobierz wiedzę przez `getKnowledgeForIngredients` — to jest **jedyne** źródło
   dla A4; blok RAG wchodzi do promptu
4. składnik bez wpisu w RAG: **nie trafia do payloadu A4**, zamiast tego wpis
   `UNKNOWN_INGREDIENT_NEEDS_LOOKUP: <nazwa>` w `normalization_warnings`
5. `a4Schema` = `category_type`, `technical_benefits_aeo`, `detected_synergies`,
   `mandatory_clp_warnings`. **Bez `pipeline_id`** — jeśli stoi w prompcie
   źródłowym, usuwasz go tam i rekompilujesz
6. `allowedKeysA4` = te same cztery pola; reszta odrzucana z
   `A4_FIELD_REJECTED: <pole>`
7. limity z kodu, nie z modelu: `technical_benefits_aeo` max 2500 znaków,
   `detected_synergies` max 4, nadmiar ucinasz z `A4_LIMIT_TRUNCATED: <pole>`
8. `mandatory_clp_warnings`: v2 nie ma zwrotów H/P z żadnego źródła
   strukturalnego, więc wartość **musi** być `null`. Jeśli model zwróci
   cokolwiek innego — odrzucasz z `A4_CLP_WITHOUT_SOURCE` i zostawiasz `null`
9. wynik do `state.a4_result`, `next_action` po A4 = `RUN_A5`

---

## KROK 3 — jeden przebieg na żywo

`EXTRACT → A1 → A2 → A4` na Equilibrze (EAN 8000137015436), dane produktu
z fixture'a. Wywołania modelu dozwolone, **wywołania API BaseLinkera nadal
zakazane**.

---

## KROK 4 — testy

Nowe asercje: A4 nie jest wołany przy `chemical_route === false`; składnik spoza
RAG daje `UNKNOWN_INGREDIENT_NEEDS_LOOKUP` i nie wchodzi do payloadu;
`mandatory_clp_warnings` wymuszone na `null`; ucięcie limitów; odrzucenie pól
spoza `allowedKeysA4`; `INVALID_SOURCE_DOMAIN` przy złej domenie.

`npm test`: **`fail 0`**, nie mniej niż 92.

---

## WARUNKI STOP — jedyne

1. kompilator nie działa
2. `getKnowledgeForIngredients` nie zwraca wiedzy dla żadnego składnika Equilibry
   — wtedy wklejasz surowy wynik wywołania i kończysz
3. A4 zwraca roszczenie medyczne mimo dyrektyw — wklejasz surową odpowiedź modelu
   i kończysz

W każdym innym przypadku dowozisz całość. Nie przerywasz, żeby pytać.

---

## SZABLON RAPORTU

```
## 1. Cztery poprawki
- (a) git diff Agent_2_prompt_v4.md + grep na Agent_2_compiled.md
- (b) git diff fragmentu next_action + git diff asercji :57
- (c) jedno zdanie o przyczynie regresji P1_CHECK_IMPOSSIBLE + git diff poprawki
- (d) plik:linia walidacji domen + wydruk

## 2. A4 — kontrakt
- plik:linia + pełny wydruk a4Schema i allowedKeysA4
- grep -n "pipeline_id" na Agent_4_compiled.md — wynik
- lista składników Equilibry przekazanych do A4 (po odsianiu spoza RAG)
- lista wpisów UNKNOWN_INGREDIENT_NEEDS_LOOKUP

## 3. Przebieg na żywo
- wstrzyknięcia ręczne (jeśli żadnych: "brak")
- PEŁNY orch.state po A4, bez wielokropków
- token_usage_per_node dla A1, A2, A4
- pełna treść technical_benefits_aeo zwrócona przez A4

## 4. Zachowania brzegowe
- zrzut stanu przy chemical_route = false (A4 pominięty)
- zrzut stanu przy mocku A4 z niepustym mandatory_clp_warnings
- lista wpisów A4_FIELD_REJECTED, A4_LIMIT_TRUNCATED, A4_CLP_WITHOUT_SOURCE

## 5. Testy
- pełny wydruk npm test
- lista nowych asercji: plik:linia + jedno zdanie

## 6. git diff --stat całego modułu v2
```

Raport bez którejkolwiek sekcji nie jest oceniany.

---

## ZAKAZY

- zero wywołań API BaseLinkera
- zakaz zmian w `tests/fixtures/`, `validators/`, `prompt-compiler.js`
- zakaz ręcznej edycji `*_compiled.md`
- zakaz naprawiania testów pod kod poza punktem 1b, który autoryzowałem
- w zrzutach żadna wartość nie kończy się wielokropkiem; wartość długa w całości
  albo długość w znakach i SHA-256
- brak danych ≠ zgadywanie: `//HITL:` + wpis w raporcie
- statusu zadania nie ustalasz
