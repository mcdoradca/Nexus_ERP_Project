# OCENA RAPORTU 23 — pochodzenie `line`, kontrola źródeł P1

- **Zadanie:** 23
- **Raport:** `RAPORT_23_pochodzenie_line.md`
- **Data oceny:** 2026-07-31
- **Werdykt: NIEZALICZONE**

Powód: główne kryterium zadania nie ma dowodu w raporcie, brakuje wydruku testów
i lokalizacji `plik:linia` schematu A1. Trzy kryteria z sześciu niespełnione.

---

## 1. Bilans kryteriów binarnych

| Kryterium | Wynik |
|---|---|
| `line` czytane z BaseLinkera, gdy klucz `Linia` istnieje | **BRAK DOWODU** — w obu wklejonych stanach `line: null`. Test na obiekcie syntetycznym opisany jednym zdaniem prozy, bez outputu |
| każde pole ma `{ value, source, matched_key }` | spełnione, z zastrzeżeniem D-23.3 |
| brak źródła P1 **zawsze** zostawia ostrzeżenie | **NIESPEŁNIONE** — stan Trimay nie zawiera klucza `normalization_warnings` w ogóle |
| pełne stany maszyny bez `...` | spełnione |
| `usageMetadata` | spełnione (A1: 1508 / 94 / 1602) |
| `a1Schema` z `plik:linia` | **NIESPEŁNIONE** — nie podano |
| `git diff --stat` | spełnione |
| zero wywołań API BaseLinkera | spełnione — brak śladów wywołań, brak zmian w `tests/fixtures/` |
| `npm test`: pełny wydruk z nazwami, `fail 0`, ≥ 76 | **NIESPEŁNIONE** — „78/78, FAIL 0" podane prozą. Z-1 |

Trzy niespełnione kryteria wystarczają. Reszta oceny jest po to, żeby runda
dowodowa domknęła wszystko naraz i nie było trzeciego podejścia.

---

## 2. Trzy punkty kontrolne z zadania

**1. Fixture'y — nietknięte.** `git status --short` i `--stat` nie wykazują
niczego w `tests/fixtures/`. Przyjmuję, z formalnym domknięciem w 23-DOK
(jawny `git diff --stat` na tym katalogu z pustym outputem).

**2. Hipoteza o skompilowanym prompcie — potwierdzona, ale źródło leży głębiej,
niż zakładał wykonawca.** Sprawdziłem plik źródłowy pakietu v4.1:

```
Agent_1_prompt_v4.md:19   Identyfikacja: brand, line, mpn, country_of_origin.
Agent_1_prompt_v4.md:32   ## FLAGA missing_critical_data = true GDY:
Agent_1_prompt_v4.md:39-41   JSON wg responseSchema. Pola: pipeline_id, gtin_ean,
                             brand, line, product_name, (...) raw_ingredients_inci,
                             missing_critical_data, research_sources_used[].
```

To jest jeden do jednego treść, którą wykonawca znalazł w `Agent_1_compiled.md:36-39`.
**Kompilator nie dokłada niczego od siebie — przepisuje wiernie.** Nie ma czego
w nim łatać. Prompt każe A1 ustalać `mpn` i skład INCI, czyli wprost to, czego
zabraniają D18 i D19. Decyzja D23 (poprawka pliku źródłowego v4.1) po zamknięciu
23-DOK — nie chcę dwóch otwartych pozycji naraz.

**3. A1 znowu zmyślił linię.** Zwrócił `Purifying Active Charcoal` zamiast
`Carbone Attivo`. Źródła: `collistar.com` i `cliven.it` — to konkurencyjne włoskie
marki kosmetyczne, nie Equilibra. Trzecie źródło (CosIng) nie zawiera nazw linii
handlowych.

Istotne: poprzednio zmyślił `Purifying Black Carbon`, teraz `Purifying Active
Charcoal`. **Inna wartość przy tym samym wejściu.** To domyka obserwację z mojego
błędu A3 — pole niestabilne między przebiegami jest generowane. Wykonawca wkleił
wynik bez poprawiania, zgodnie z poleceniem.

---

## 3. Defekty do naprawy — zapisane, nie naprawiane w tej rundzie

| Kod | Defekt |
|---|---|
| D-23.1 | `NO_P1_SOURCE` bez nazwy pola. Ostrzeżenie bez wskazania, czego dotyczy, jest bezużyteczne dla HITL. Format docelowy: `NO_P1_SOURCE: line` |
| D-23.2 | Ścieżka `HALT` nie przechodzi przez kontrolę P1 — stan Trimay nie ma `normalization_warnings`. Zatrzymanie potoku nie może kasować ostrzeżeń |
| D-23.3 | `product_name` ma `source: "baselinker"` przy `matched_key: null`. Powinno być `matched_key: "text_fields.name"` — pole nie pochodzi z `features`, ale ma znane miejsce pochodzenia |
| D-23.4 | `product_name` występuje jednocześnie w `extracted_data` (źródło baselinker) i w `a1_result` (źródło a1), bez rozstrzygnięcia pierwszeństwa i bez `A1_FIELD_REJECTED`. Przy `mpn` odrzucenie zadziałało. Niespójność reguły |
| D-23.5 | `mpn_equals_ean` zapala się dla Equilibry (wartość z A1), nie zapala dla Trimay, gdzie `Kod producenta` = EAN ze źródła baselinker. Sygnał jakości danych ma działać niezależnie od źródła |
| D-23.6 | Zmiany poza modułem v2 (`.agents/.ai-memory.md`) i w `config/nodes.config.js` bez słowa uzasadnienia. OP-5 i Z-5. Wyjaśnienie w 23-DOK |

---

## 4. Do otwartych spraw E4b

**Ucięcie 64KB może kasować dane, nie tylko `kod karty`.** Stan Equilibry ma
`truncated: true`, a `recovered_keys` nie zawiera `Marka`, `Kod producenta` ani
`Linia` — i rzeczywiście `brand`, `mpn` oraz `line` wyszły puste. Do tej pory
traktowaliśmy ucięcie jako stratę bloku HTML szablonu. Jeśli ginie z nim `Linia`,
to znaczy, że **ucięcie tworzy brak, który potem zmyśla A1** — i mamy jedną
przyczynę dwóch objawów. Weryfikacja w 23-DOK, punkt 5, offline, na fixturze `.raw`.

**Luka bramkowa jest szersza niż wstawione spacje.** Skład Equilibry z BaseLinkera
zawiera literówki dostawcy: `Glyceryl Stereate`, `Ethylhexyl Stereate`,
`Ethylexyglycerin`. W składzie Trimay `Cu rauma Longa` to i spacja, i przestawiona
litera względem `Curcuma Longa`. Wariant „skład bez spacji", który zapisaliśmy jako
lekarstwo, nie wystarczy.

To **nie jest** argument za similarity w bramkach — S-5 i D5 zostają. To argument
za tym, żeby pozycja, która po normalizacji **prawie** trafia w wpis listy zakazanej,
szła na HITL, a nie przechodziła cicho. Projekt progu i mechaniki — osobna decyzja
przed wpięciem A4.

---

## 5. Co w tym raporcie było dobre

- ekstrakcja podmiotu odpowiedzialnego Equilibry z HTML `description` z dosłownym
  `raw_fragment` — zgodnie z D21, wartość zgadza się z potwierdzeniem operatora
- skład Equilibry: 30 składników, z alergenem orzechowym na pozycji 6, kolejność
  zachowana, źródło `skladniki inci`. To jest odczyt, nie generacja
- `A1_FIELD_REJECTED` dla `mpn` i `pipeline_id` — obrona przed nadpisaniem stanu
  przez model zadziałała
- wykonawca nie dotknął pliku źródłowego v4.1 mimo pokusy i oddał decyzję w górę
