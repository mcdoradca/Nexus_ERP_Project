# ZADANIE 24 — wdrożenie D23: kontrakt A1

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Od:** Architekt
- **Do:** Wykonawca
- **Data:** 2026-07-31
- **Podstawa:** `DECYZJA_D23_kontrakt_A1.md`, defekty D-23.7, D-23.8, D-23.9, D-23.11
- **Raport wyjściowy:** `RAPORT_24_kontrakt_A1.md`

---

## KONTEKST

Zadanie 23 jest zamknięte. Dowody potwierdziły, że `line` czyta się z BaseLinkera —
i przy okazji pokazały, że A1 **nadal** zwraca `line` mimo istniejącej wartości
źródłowej, a stan trzyma dwie wartości tego samego pola. Przyczyna jest w kontrakcie:
`a1Schema.required` wymusza od modelu wartość, której model nie ma skąd znać.

To zadanie usuwa przyczynę. Wszystko offline, na plikach z dysku.

---

## KROKI

**1. Poprawka pliku źródłowego `Agent_1_prompt_v4.md`.**
Z sekcji identyfikacji (linia 19) i z sekcji `## WYJŚCIE` (linie 39-41) zostają
wyłącznie `country_of_origin` i `research_sources_used[]`. Usuwasz `brand`, `line`,
`mpn`, `gtin_ean`, `product_name`, `pipeline_id`, `logistics`, `compliance_gpsr_clp`,
`verified_certificates`, `raw_ingredients_inci`, `missing_critical_data`, oraz sekcję
`## FLAGA missing_critical_data` (linia 32) — flaga należy do kodu, nie do modelu.

Potem rekompilujesz prompt.
**Dowód:** `git diff` pliku źródłowego w całości + wydruk sekcji `## WYJŚCIE`
z `Agent_1_compiled.md` po rekompilacji, z numerami linii.

**2. `a1Schema` w `orchestrator.js`.**
`properties` i `required` = wyłącznie `country_of_origin`, `research_sources_used`.
**Dowód:** `plik:linia` + pełny wydruk obiektu po zmianie.

**3. Zasada P1-first w kodzie.**
Pole z niepustym `source` w `extracted_data` nie trafia do `missingFields`.
Wartość dla takiego pola przychodząca z A1 jest odrzucana wpisem
`A1_FIELD_REJECTED: <nazwa_pola>` i nie nadpisuje wartości źródłowej.

**Dowód:** przebieg syntetyczny z obecnym kluczem `Linia` i mockiem A1, który
próbuje zwrócić `line`. W zrzuconym stanie ma być jednocześnie:
`extracted_data.line` niezmienione, `normalization_warnings` zawiera
`A1_FIELD_REJECTED: line`, `a1_result` bez klucza `line`.

**4. Pole `brand` bez źródła.**
W stanie z 23-DOK `brand` miał wartość `"Equilibra"` przy `source: null`. Ustal,
w którym miejscu kodu ta wartość powstaje, i doprowadź do stanu, w którym
**żadne pole w `extracted_data` nie ma wartości przy pustym `source`** — albo
nadajesz źródło, albo pole zostaje `null`.
**Dowód:** `plik:linia` miejsca powstania wartości + zrzut stanu po zmianie.

**5. Korekta `.agents/.ai-memory.md`.**
Wpis o Zadaniu 23 zawiera dwa zdania nieprawdziwe: o rozwiązaniu halucynacji
`Purifying Active Charcoal` i o pełnej weryfikacji poprawności. Zadanie 23 zostało
zaliczone dopiero po rundzie dowodowej, a halucynacja `line` nie jest usunięta —
robi to dopiero to zadanie. Popraw oba zdania na stan faktyczny.

**Zasada na przyszłość:** wpis o zadaniu powstaje **po** werdykcie architekta
i cytuje ten werdykt. Nie zapisujesz w pamięci własnej oceny wykonanej pracy.
**Dowód:** `git diff` tego pliku.

---

## KRYTERIUM ZALICZENIA (binarne)

- `Agent_1_compiled.md` po rekompilacji **nie zawiera** ciągów `gtin_ean`, `mpn`,
  `missing_critical_data`, `raw_ingredients_inci`, `line` — dowodem jest wydruk
  `grep -n` po tych ciągach z pustym wynikiem
- `a1Schema.required` = dokładnie dwa pola
- stan z kroku 3 pokazuje jednocześnie trzy rzeczy wymienione w jego dowodzie
- żadne pole w zrzuconych stanach nie ma wartości przy `source: null`
- `npm test`: pełny wydruk, `fail 0`, liczba nie niższa niż **78**
- lista asercji dodanych w tej rundzie: `plik:linia` + jedno zdanie na asercję

---

## ZAKAZY

- **Zero wywołań API BaseLinkera i jakiegokolwiek API zewnętrznego.**
  Wszystko z plików na dysku, `DATA_SOURCE_MODE = 'fixture'`
- Zakaz zmian w `tests/fixtures/`
- Zakaz zmian w innych promptach niż `Agent_1_prompt_v4.md`
- Zakaz naprawiania defektów D-23.1 … D-23.6 i D-23.10 — pójdą osobnym zadaniem
- Zakaz refaktoryzacji `orchestrator.js` poza tym, co wymuszają kroki 2 i 3
- **W zrzucie stanu żadna wartość nie kończy się wielokropkiem.** Wartość długą
  wklejasz w całości albo podajesz jej długość w znakach i skrót SHA-256.
  Wielokropek w zrzucie = raport nieoceniany
- Brak danych ≠ zgadywanie. `//HITL:` w kodzie i wpis w raporcie
