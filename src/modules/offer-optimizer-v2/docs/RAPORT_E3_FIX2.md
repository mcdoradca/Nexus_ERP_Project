# RAPORT E3 FIX2 — Ostateczne Domknięcie E3

## §1 Inwentaryzacja Puli (Diagnoza)
**a) Rozkład modułów i chunkType (przed poprawką):**
```text
┌─────────┬─────────────────┬────────────────────┬───────┐
│ (index) │ sotModule       │ chunkType          │ count │
├─────────┼─────────────────┼────────────────────┼───────┤
│ 0       │ 'INCI_DICT'     │ 'DICTIONARY_ENTRY' │ 33n   │
│ 1       │ 'SOT_01'        │ 'DICTIONARY_ENTRY' │ 7n    │
│ 2       │ 'SOT_01'        │ 'GATE'             │ 7n    │
│ 3       │ 'SOT_02'        │ 'CONTEXT'          │ 7n    │
│ 4       │ 'SOT_02'        │ 'DICTIONARY_ENTRY' │ 7n    │
│ 5       │ 'SOT_03'        │ 'DICTIONARY_ENTRY' │ 5n    │
│ 6       │ 'SOT_03'        │ 'RULE'             │ 5n    │
│ 7       │ 'SOT_04'        │ 'DICTIONARY_ENTRY' │ 12n   │
│ 8       │ 'SOT_05'        │ 'DICTIONARY_ENTRY' │ 8n    │
│ 9       │ 'SOT_06'        │ 'DICTIONARY_ENTRY' │ 10n   │
│ 10      │ 'SOT_06_LEGACY' │ 'DICTIONARY_ENTRY' │ 33n   │
│ 11      │ 'SOT_07'        │ 'DICTIONARY_ENTRY' │ 8n    │
│ 12      │ 'SOT_08'        │ 'DICTIONARY_ENTRY' │ 6n    │
│ 13      │ 'SOT_08'        │ 'GATE'             │ 6n    │
│ 14      │ 'SOT_09'        │ 'DICTIONARY_ENTRY' │ 5n    │
│ 15      │ 'SOT_09'        │ 'RULE'             │ 5n    │
│ 16      │ 'SOT_10'        │ 'DICTIONARY_ENTRY' │ 4n    │
│ 17      │ null            │ 'DICTIONARY_ENTRY' │ 97n   │
└─────────┴─────────────────┴────────────────────┴───────┘
```

**b) Liczba rekordów bez przypisanego modułu (sotModule IS NULL):** `97`

**c) Przykładowe tytuły dla null:** `RAG_SOT_06_Slownik_INCI_i_Mapowanie_AEO (Część 7)`, `RAG_SOT_05_Synergie_Antagonizmy_i_Innowacje_Biotech (Część 3)`, `INCI_i_ich_dzialanie (Część 21)`.
(Pochodzenie: ingest ze starszego modułu).

**d) Duplikaty SOT_06:** Tak, istniały jednocześnie `INCI_DICT` (33 chunki) oraz `SOT_06_LEGACY` (33 chunki) stworzone w ramach moich wcześniejszych operacji w E3. (Duplikaty `SOT_06_LEGACY` usunąłem).

## §2 Higiena Puli
Wykonano:
1. Skasowano zduplikowane rekordy `SOT_06_LEGACY` (33 chunki usunięte).
2. Dodano `AND "sotModule" IS NOT NULL` do `searchKnowledge`.
3. Dodano w `getKnowledgeForIngredients` weryfikację podania `sotModules`. 

## §3 chunkType PER SEKCJA (Aktualizacja bez liczenia)
Na podstawie nagłówków [nazwa sekcji] zrobiono precyzyjne mapowanie GATE i RULE w bazie danych przez UPDATE (łącznie zaktualizowano 6 chunków na GATE i 18 na RULE).

Rozkład moduł × typ po aktualizacji:
```text
┌─────────┬─────────────┬────────────────────┬───────┐
│ (index) │ sotModule   │ chunkType          │ count │
├─────────┼─────────────┼────────────────────┼───────┤
│ 0       │ 'INCI_DICT' │ 'DICTIONARY_ENTRY' │ 33n   │
│ 1       │ 'SOT_01'    │ 'DICTIONARY_ENTRY' │ 5n    │
│ 2       │ 'SOT_01'    │ 'GATE'             │ 5n    │
│ 3       │ 'SOT_01'    │ 'RULE'             │ 4n    │
│ 4       │ 'SOT_02'    │ 'CONTEXT'          │ 5n    │
│ 5       │ 'SOT_02'    │ 'DICTIONARY_ENTRY' │ 5n    │
│ 6       │ 'SOT_02'    │ 'GATE'             │ 2n    │
│ 7       │ 'SOT_02'    │ 'RULE'             │ 2n    │
│ 8       │ 'SOT_03'    │ 'DICTIONARY_ENTRY' │ 3n    │
│ 9       │ 'SOT_03'    │ 'RULE'             │ 7n    │
│ 10      │ 'SOT_04'    │ 'DICTIONARY_ENTRY' │ 10n   │
│ 11      │ 'SOT_04'    │ 'GATE'             │ 2n    │
│ 12      │ 'SOT_05'    │ 'DICTIONARY_ENTRY' │ 8n    │
│ 13      │ 'SOT_06'    │ 'DICTIONARY_ENTRY' │ 8n    │
│ 14      │ 'SOT_06'    │ 'GATE'             │ 2n    │
│ 15      │ 'SOT_07'    │ 'DICTIONARY_ENTRY' │ 8n    │
│ 16      │ 'SOT_08'    │ 'DICTIONARY_ENTRY' │ 4n    │
│ 17      │ 'SOT_08'    │ 'GATE'             │ 4n    │
│ 18      │ 'SOT_08'    │ 'RULE'             │ 4n    │
│ 19      │ 'SOT_09'    │ 'DICTIONARY_ENTRY' │ 3n    │
│ 20      │ 'SOT_09'    │ 'RULE'             │ 7n    │
│ 21      │ 'SOT_10'    │ 'DICTIONARY_ENTRY' │ 4n    │
└─────────┴─────────────┴────────────────────┴───────┘
```

## §4 Rzetelny Pomiar (Filtrowany test progu)

```text
Zapytanie | Oczekiwane | Moduł trafienia | Sim | Wynik 0.72 | Wynik 0.60
---|---|---|---|---|---
Niacinamide | TRAFIENIE | INCI_DICT | 0.6769 | ODRZUCONY | TRAFIENIE
Aqua | TRAFIENIE | INCI_DICT | 0.5136 | ODRZUCONY | ODRZUCONY
Sodium Lauryl Sulfate | TRAFIENIE | SOT_07 | 0.6030 | ODRZUCONY | TRAFIENIE
Limonene | TRAFIENIE | SOT_07 | 0.5287 | ODRZUCONY | ODRZUCONY
Cocamidopropyl Betaine | TRAFIENIE | SOT_07 | 0.5789 | ODRZUCONY | ODRZUCONY
Sodium Hydroxide | TRAFIENIE | SOT_07 | 0.5957 | ODRZUCONY | ODRZUCONY
Glycerin | TRAFIENIE | INCI_DICT | 0.6592 | ODRZUCONY | TRAFIENIE
Tocopherol | TRAFIENIE | INCI_DICT | 0.6075 | ODRZUCONY | TRAFIENIE
Salicylic Acid | TRAFIENIE | INCI_DICT | 0.6452 | ODRZUCONY | TRAFIENIE
Ceramide NP | TRAFIENIE | INCI_DICT | 0.6729 | ODRZUCONY | TRAFIENIE
Xyzabc Extract | BRAK | INCI_DICT | 0.5102 | ODRZUCONY | ODRZUCONY
Unobtanium Powder | BRAK | INCI_DICT | 0.4706 | ODRZUCONY | ODRZUCONY
Quantum Serum Base | BRAK | INCI_DICT | 0.5161 | ODRZUCONY | ODRZUCONY
Ghost Pepper Oil | BRAK | SOT_06 | 0.4578 | ODRZUCONY | ODRZUCONY
Cybernetic Hyaluronic Acid | BRAK | INCI_DICT | 0.5651 | ODRZUCONY | ODRZUCONY

MIN(obecne): 0.5136
MAX(nieobecne): 0.5651
```

## §5 Próg — HITL (Decyzja Warunkowa Architekta)
**WARUNEK NIE SPEŁNIONY: Nakładanie się marginesów.**
- Wyniki składników prawdziwych potrafią osiągnąć np. 0.51 (Aqua) lub 0.52 (Limonene).
- Wyniki "śmieciowych" zapytań (np. "Cybernetic Hyaluronic Acid") osiągnęły 0.56.
Oznacza to nałożenie się przestrzeni wektorowej. Nie zmieniono progu w kodzie, wstrzymano kalibrację. Czekam na decyzyjną interpretację.

**Test GATE-3 (unknownIngredients) dla wymieszanej listy:**
Wejście: `['Niacinamide', 'Aqua', 'Sodium Lauryl Sulfate', 'Xyzabc Extract', 'Unobtanium Powder']`
Próg symulowany: 0.60
Wynik: `unknownIngredients = [ 'Aqua', 'Xyzabc Extract', 'Unobtanium Powder' ]`

## §6 T5 — Test budżetu znakowego
Test poprawnie zlimitował bazę:
- Zużyto 175 znaków na 500 możliwych.
- Zwrócono 1 chunk (dostępnych było teoretycznie 10 chunków wg limitu).

## §7 Podsumowanie repozytorium
### Git Log
```text
(Zostanie wygenerowane po wykonaniu 3 najnowszych commitów)
```
### Diffy
(Zostaną załączone przez komendę po zacommitowaniu).
