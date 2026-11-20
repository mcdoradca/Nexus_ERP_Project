# ADR-0188: Separator `|` dla parametrów `multiselect` w BaseLinker API oraz zachowywanie częściowych dopasowań słownika

**Status:** Wdrożone i zweryfikowane  
**Data:** 2026-11-20  
**Moduły:** `src/modules/offer-optimizer-v2/baselinker.export.service.js`, `src/modules/offer-optimizer-v2/tests/baselinker.export.test.js`

---

## 1. Kontekst i Diagnoza Problemu

Podczas eksportu produktu EAN `8032680390937` (*Dermomed Włoskie Bezzapachowe Mydło w Płynie 300 ml*, BaseLinker ID `73002531`, katalog `385`) BaseLinker API (`addInventoryProduct`) zwróciło ostrzeżenie:
`BaseLinker (parameters.Produkt nie zawiera): Niepoprawne wartości dla predefiniowanego parametru "Produkt nie zawiera". Wartość została pominięta.` — i pominęło cały parametr mimo zdefiniowania go w katalogu `385`.

Weryfikacja na żywych danych z Postgresa oraz metod `getInventoryParameters('385')` i `getInventoryProductsData` wykazała dwie przyczyny w [baselinker.export.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/baselinker.export.service.js):
1. W katalogu `385` parametr `Produkt nie zawiera` (`bl_sys_2855`) ma typ **`multiselect`** i zawiera wszystkie 10 wartości z PIM co do znaku. Jednak BaseLinker API wymaga w polu `text_fields.features` dla parametrów `multiselect` separatora **`|`** (np. `parabenów|aluminium|amoniaku|...`, potwierdzone m.in. w produktach `#21055889` i `#48807784`), podczas gdy `matchPredefinedParameterOption` sklejało dopasowane wartości przecinkiem (`matchedValues.join(', ')`), przez co BaseLinker interpretował cały ciąg jako jedną nieznaną opcję i usuwał cały parametr.
2. W przypadku częściowego dopasowania słownika `multiselect` (gdy np. 8 z 9 wartości istnieje w BaseLinkerze, a 1 nie), funkcja zwracała surowy string wejściowy z niepasującym tokenem, powodując odrzucenie przez BaseLinker również wszystkich poprawnych opcji.

---

## 2. Podjęte Decyzje Architektoniczne

- **Separator `|` dla `type === "multiselect"` ([baselinker.export.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/baselinker.export.service.js)):**
  - `matchPredefinedParameterOption` sprawdza najpierw pełne dopasowanie całego ciągu (chroniąc ewentualne opcje słownika zawierające przecinek), a dla `multiselect` łączy dopasowane opcje kanoniczne wymaganym przez BaseLinker separatorem **`|`** (`matchedValues.join('|')`).
  - Przy częściowym dopasowaniu `multiselect` (`matchedValues.length > 0 && unmatchedTokens.length > 0`) do BaseLinkera trafiają wszystkie poprawne dopasowane opcje połączone przez `|` (`partialMatch: true`), natomiast w `warnings` raportowana jest dokładna lista pominiętych tokenów spoza słownika katalogu.
  - Rozszerzono `FALLBACK_INVENTORY_PARAMETERS` o znane parametry `multiselect` (`Produkt nie zawiera`, `Cechy dodatkowe`, `Działanie`, `Typ skóry`, `Typ włosów`, `Materiał wykonania`) oraz dodano normalizację separatora `,` / `;` -> `|` w trybie awaryjnego fallbacku bez opcji `options: []`.
  - Dane w bazie PIM (`Product.features`) i edytorze UI pozostają czytelne po przecinku (normalizacja `|` zachodzi wyłącznie na granicy ładunku eksportowego `buildPayloadWithDiagnostics`, a przy imporcie `baselinker.service.js` zamienia `|` z powrotem na `, `).

---

## 3. Weryfikacja

- **Składnia (`node --check`):** `baselinker.export.service.js`, `baselinker.export.test.js` — **PASS**.
- **Testy jednostkowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`317/317 PASS`** (`0` błędów), w tym rozszerzony `baselinker.export.test.js` (pełne dopasowanie `Produkt nie zawiera` 10/10 z `|`, idempotentność dla `|`, częściowe dopasowanie `multiselect` z raportem pominiętych tokenów, fallback offline dla `multiselect`).
- **Nie-mutujący dry-run na żywym produkcie `8032680390937` i żywym `getInventoryParameters('385')`:** `Produkt nie zawiera` znormalizowane do `"parabenów|aluminium|amoniaku|mydła|olejów mineralnych|parafiny|PEG|silikonów|SLS|substancji zapachowych"` przy `0` ostrzeżeń dla tego parametru.
