# ZADANIE 24A — WZNOWIENIE: kontrakt A1

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Od:** Architekt
- **Data:** 2026-07-31
- **Zastępuje:** wstrzymane 24A. Obowiązują korekty z `AKCEPTACJA_PLANU_24.md`
- **Raport wyjściowy:** `RAPORT_24A_kontrakt_A1_v2.md`

---

## ROZSTRZYGNIĘCIE BLOKADY

**`gtin_ean` — sprawa zamknięta, nic nie ruszasz.** `orchestrator.js:183` podaje
`gtin_ean` **do** A1 jako dane wejściowe i tak ma zostać. Trzy asercje w
`tests/orchestrator.test.js:93,106,112` sprawdzają, że wartość `gtin_ean`
**z odpowiedzi** A1 jest odrzucana — to dobre testy, zostają. Blok martwego
warunku, który realnie blokował, już usunąłeś w Zadaniu 25.

**`raw_ingredients_inci` — usuwasz z promptu bez obaw.** Twój grep udowodnił,
że w v2 nic tego pola nie przypisuje, więc A1 i tak go nie zasila.
`validators/index.js:35` jest osobną sprawą i dostanie własne zadanie — **nie
dotykasz `validators/`**.

---

## KROK 0 — grep przed usunięciem, ta sama zasada co poprzednio

Usuwamy z promptu więcej pól niż trzy sprawdzone. Zanim to zrobisz:

```
grep -rn "compliance_gpsr_clp\|verified_certificates\|clp_signal_word\|clp_h_phrases\|clp_p_phrases\|ufi_code\|biocidal_or_medical_permit\|ph_value\|net_capacity_or_weight\|gross_weight_kg\|dimensions_cm" src/modules/offer-optimizer-v2/ --include=*.js
```

**Wklej cały output i skomentuj każde trafienie jednym zdaniem:** czy to odczyt
z odpowiedzi A1, czy pole wejściowe, czy asercja testowa.

Jeśli którekolwiek trafienie jest **odczytem z odpowiedzi A1** — STOP, raport,
koniec rundy. Tak jak poprzednio. To zadziałało.

---

## KROK 1 — poprawka `docs/Agent_1_prompt_v4.md`

Przeczytałem ten plik. Zakres jest dokładnie taki:

**`## ROLA` (linie 6-7)** — obecna treść mówi, że A1 waliduje parametry
techniczne, logistyczne i prawne. To już nieprawda i nie może zostać, bo model
czyta rolę szerzej niż kontrakt. Nowa treść:

> Analityk OSINT. Ustalasz kraj pochodzenia produktu i podajesz domeny źródeł,
> z których korzystałeś. Nie tworzysz treści. Nie ustalasz danych prawnych,
> logistycznych ani składu — te pochodzą wyłącznie ze źródeł strukturalnych.

**`## DYREKTYWY TWARDE` (linie 9-16)** — zostają bez zmian, wszystkie trzy.
Hierarchia P1/P2/P3 jest nadal potrzebna do `research_sources_used`.

**`## ZAKRES POZYSKANIA` (linie 18-30)** — zostaje wyłącznie `country_of_origin`.
Usuwasz punkty 2 (logistyka), 3 (GPSR/CLP), 4 (certyfikaty), 5
(`raw_ingredients_inci`) oraz z punktu 1 pola `brand`, `line`, `mpn`.

**`## FLAGA missing_critical_data` (linie 32-36)** — usuwasz całą sekcję.

**`## WYJŚCIE` (linie 38-42)** — lista pól redukuje się do `country_of_origin`
i `research_sources_used[]`. Linia o limicie ośmiu domen zostaje.

Blok `--- DANE SKU ---` i nagłówek z parametrami wywołania zostają nietknięte.

Potem **uruchamiasz kompilator**. Ręczna edycja `Agent_1_compiled.md` jest
zakazana bez wyjątków; jeśli kompilator nie działa — STOP i raport.

---

## KROK 2 — `a1Schema` w `orchestrator.js`

`properties` i `required` = wyłącznie `country_of_origin`,
`research_sources_used`. Nic więcej.

---

## KROK 3 — zasada P1-first

Pole z niepustym `source` w `extracted_data` nie trafia do `missingFields`
i nie jest przyjmowane z odpowiedzi A1: odrzucenie z wpisem
`A1_FIELD_REJECTED: <nazwa_pola>`, bez nadpisania wartości źródłowej.

Dowód buduje obiekt syntetyczny w pliku testowym, udający odpowiedź A1
z kluczem `line`. Zero wywołań modelu.

Zrzucony stan pokazuje **trzy rzeczy naraz**:

1. `extracted_data.line` — wartość z BaseLinkera, niezmieniona
2. `normalization_warnings` zawiera `A1_FIELD_REJECTED: line`
3. `a1_result` **nie ma klucza `line`**

Nad zrzutem wymieniasz wszystkie wartości wstrzyknięte ręcznie na potrzeby
tego przebiegu: nazwa pola i wartość.

---

## KRYTERIUM ZALICZENIA (binarne)

- output z kroku 0 wklejony w całości, każde trafienie skomentowane
- `git diff` pliku `docs/Agent_1_prompt_v4.md` w całości
- `grep -n "gtin_ean\|mpn\|missing_critical_data\|raw_ingredients_inci\|\bline\b\|product_name\|compliance_gpsr_clp\|verified_certificates" src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md`
  — **wynik pusty**, wklejony nawet pusty. Ten grep dotyczy wyłącznie pliku
  skompilowanego promptu, nie kodu
- `a1Schema`: `plik:linia` + pełny wydruk, `required` = dokładnie dwa pola
- stan z kroku 3 pokazuje trzy rzeczy naraz, z listą wartości wstrzykniętych
- `npm test`: pełny wydruk, `fail 0`, liczba nie niższa niż 78
- lista asercji dodanych w rundzie: `plik:linia` + jedno zdanie na asercję

---

## ZAKAZY

- **zero zmian w `validators/`**
- zero wywołań API BaseLinkera i jakiegokolwiek API zewnętrznego
- zakaz zmian w `tests/fixtures/`
- zakaz ręcznej edycji `Agent_1_compiled.md`
- zakaz zmian w promptach innych niż `Agent_1_prompt_v4.md`
- zakaz refaktoryzacji `orchestrator.js` poza tym, co wymuszają kroki 2 i 3
- jeśli usunięcie pól wywali test — **nie naprawiasz testu pod kod**; STOP,
  nazwa testu i `plik:linia` asercji
- w zrzucie stanu żadna wartość nie kończy się wielokropkiem; wartość długą
  wklejasz w całości albo podajesz długość w znakach i skrót SHA-256
- brak danych ≠ zgadywanie: `//HITL:` + wpis w raporcie
