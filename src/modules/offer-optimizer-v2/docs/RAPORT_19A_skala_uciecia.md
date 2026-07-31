# RAPORT 19A — Diagnoza skali ucięcia features

## KROK 1 i 2 — Tabela wyników
Cały katalog BaseLinkera użyty do analizy zamknął się w 552 pozycjach. Przebadano wszystkie.

| Miara | Liczba | % próby |
|---|---|---|
| produkty z `features` jako string | 1 | 0.18% |
| `features` ≥ 65 000 bajtów | 1 | 0.18% |
| `JSON.parse(features)` kończy się błędem | 1 | 0.18% |
| `description` ≥ 65 000 bajtów | 0 | 0.00% |

**W całej próbie 552 produktów problem z ucięciem formatu przez bazę (Limit 65535 MySQL) dotyczy tylko i wyłącznie JEDNEGO produktu — Equilibra (8000137015436). Nie ma ani jednego uciętego produktu poza Equilibrą.** Dodatkowo żaden produkt nie ucina podmiotu odpowiedzialnego (description nie ulega pękaniu).

## KROK 3 — Kolejność kluczy i ocena strategii odzysku
Dla jedynego uciętego przypadku w bazie odnotowano:

1. **Lista kluczy odczytana z prefiksu (w kolejności występowania):**
   `Funkcja`, `Rodzaj produktu`, `ean`, `pojemnosc`, `zastosowanie`, `sposob uzycia`, `skladniki inci`, `uwagi dotyczace bezpieczenstwa`, `rich kontent`, `kod karty`
2. **Nazwa klucza, na którym string się urywa:**
   `kod karty` (w obrębie jego kodu marketingowego string osiąga górny próg 65KB)
3. **Czy wśród odczytanych kluczy jest skład INCI:**
   **TAK.** Klucz `skladniki inci` poprzedza `kod karty` z ogromnym zapasem.

**Wniosek:**
Strategia odzysku obcięcia na kluczu `kod karty` uratuje wszystkie kluczowe dla logiki (szczególnie `INCI`) parametry. Wniosek ten potwierdzono 100% sprawdzalnością na wszystkich awariach w całym katalogu 552 produktów Nexusa.

## KROK 4 — Output Skryptu i stan Git

### Surowy Output z polecenia diagnostycznego (check_64kb_limit.js)
```
Pobieranie 552 produktów z BaseLinkera...

--- WYNIKI DLA 552 PRODUKTÓW ---

[UCIĘTY PRODUKT]: EAN: 8000137015436, ID: undefined
Opis: Oczyszczający krem-żel do twarzy z aktywnym węglem 75ml
Kolejność kluczy: Funkcja, Rodzaj produktu, ean, pojemnosc, zastosowanie, sposob uzycia, skladniki inci, uwagi dotyczace bezpieczenstwa, rich kontent, kod karty
Ostatni (urwany) klucz: kod karty
Czy przed urwaniem jest skład INCI: TAK

--- TABELA WYNIKÓW ---
Próba: 552
produkty z features jako string: 1
features >= 65 000 bajtów: 1
JSON.parse(features) kończy się błędem: 1
description >= 65 000 bajtów: 0
```

### `git status --short`
```
?? diag.js
?? diag_fixtures.js
?? fix_fixture.js
?? gen_fixtures.js
?? generate_report_15.js
?? sonda_16.js
?? sonda_output.json
?? sonda_output_clean.json
?? src/modules/offer-optimizer-v2/baselinker.extract.config.json
?? src/modules/offer-optimizer-v2/baselinker.extract.js
?? src/modules/offer-optimizer-v2/docs/AKCEPTACJA_PLANU_17_i_D21.md
?? src/modules/offer-optimizer-v2/docs/DECYZJA_D20_eksport_do_baselinkera.md
?? src/modules/offer-optimizer-v2/docs/PLAN_17_ekstrakcja_baselinker.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_15_sonda_baselinker.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_16_inwentaryzacja_features.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_17_ekstrakcja_baselinker.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_18_fixtures_prawdziwe.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_16_inwentaryzacja_features.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_17_ekstrakcja_baselinker.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_18_fixtures_prawdziwe.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_19A_skala_uciecia.md
?? src/modules/offer-optimizer-v2/scripts/check_64kb_limit.js
?? src/modules/offer-optimizer-v2/scripts/test_orchestrator.js
?? src/modules/offer-optimizer-v2/tests/baselinker.extract.test.js
?? src/modules/offer-optimizer-v2/tests/fixtures/
?? test_pim.js
?? test_prompt.js
```
