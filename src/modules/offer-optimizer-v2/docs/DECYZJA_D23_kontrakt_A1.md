# DECYZJA D23 — kontrakt A1 zgodny z D18 i D19

> **ODBIORCA: DOKUMENTACJA.** Do `docs/` + wpis do `DECISION_LOG.md`.
> Wykonawcy nie wklejasz — Zadanie 24 jest samowystarczalne.

- **Data:** 2026-07-31
- **Zastępuje:** nic. **Uszczegóławia:** D18, D19
- **Wdrożenie:** Zadanie 24
- **Do wpisania w `DECISION_LOG.md`**

---

## USTALENIA FAKTYCZNE

1. `Agent_1_prompt_v4.md:19` każe A1 ustalać `brand, line, mpn, country_of_origin`.
   Linie `39-41` wymieniają jako pola wyjścia `gtin_ean`, `mpn`,
   `raw_ingredients_inci`, `missing_critical_data`. Linia `32` wprowadza flagę
   `missing_critical_data`.
2. `Agent_1_compiled.md:36-39` zawiera ten tekst jeden do jednego. **Kompilator
   przepisuje wiernie.**
3. `orchestrator.js:14-28`: `a1Schema.required` = `["line", "product_name",
   "country_of_origin", "research_sources_used"]`.
4. A1 zwrócił `line` w dwóch przebiegach na dwóch różnych wartościach
   (`Purifying Black Carbon`, `Purifying Active Charcoal`) ze źródłami, które są
   konkurencyjnymi markami, a w przebiegu syntetycznym zwrócił wartość mimo
   obecności wartości z BaseLinkera.
5. Linia Equilibry (`Carbone Attivo`) jest znana operatorowi i **nie występuje**
   w surowym rekordzie BaseLinkera.

---

## ROZSTRZYGNIĘCIE

**1. Poprawiamy plik źródłowy, nie kompilator.**

Kompilator nie dokłada niczego od siebie, więc nie ma w nim czego łatać. Łatka
wycinająca pola z outputu zostawiłaby w pakiecie v4.1 tekst sprzeczny z D18
i D19 — a to jest tekst, który każdy kolejny wykonawca przeczyta jako obowiązujący.
Sprzeczność w źródle jest droższa niż zmiana źródła.

**2. Zasada P1-first.**

> Pole, które ma w stanie niepuste źródło P1, **nie jest przekazywane do A1**
> w `missingFields` i **nie jest przyjmowane** z odpowiedzi A1. Wartość
> przychodząca z A1 dla takiego pola jest odrzucana z wpisem
> `A1_FIELD_REJECTED: <pole>` i nigdy nie nadpisuje wartości źródłowej.

**3. Pole, którego model nie może znać, nie stoi w `required`.**

`required` w `responseSchema` jest zobowiązaniem modelu do zwrócenia wartości.
Model bez wiedzy o polu wymaganym nie ma opcji „nie wiem" — wytworzy wartość.
Halucynacja linii nie była skłonnością modelu, tylko **wykonaniem naszego
kontraktu**.

**4. `line` znika z kontraktu A1 całkowicie** — z `properties` i z `required`,
oraz z sekcji identyfikacji w prompcie źródłowym. Podstawa: punkt 5 ustaleń.
Gdy BaseLinker nie ma linii, jedyne dopuszczalne ścieżki to wpis ręczny
operatora albo HITL. Model w hierarchii D19 nie występuje.

**5. `product_name` znika z kontraktu A1.** `text_fields.name` jest zawsze
obecne w BaseLinkerze; A1 dostarczał wartość równoległą do istniejącego
źródła P1, bez rozstrzygnięcia pierwszeństwa.

**Po tym cięciu A1 zwraca wyłącznie `country_of_origin` i `research_sources_used`.**

---

## KONSEKWENCJA OTWARTA — do rozstrzygnięcia przed E4c

Po punktach 4 i 5 jedynym merytorycznym polem A1 zostaje `country_of_origin`.
Kraj pochodzenia bywa informacją regulowaną (oznaczenia typu „made in"), więc
pytanie, czy wolno go brać z modelu, jest tej samej klasy co pytania rozstrzygnięte
przez D18. Jeśli odpowiedź brzmi „nie", **węzeł A1 traci funkcję w fazie 1**.

Nie rozstrzygam tego teraz i nie ruszam architektury potoku. Podniosę przy
zamknięciu Zadania 24, razem z policzonym kosztem tokenowym węzła.
