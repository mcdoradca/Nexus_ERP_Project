# PLAN DZIAŁANIA ZADANIE 23

Ten plan ma na celu domknięcie pochodzenia atrybutu "line" na bazie danych z systemu MDM (BaseLinker), wdrożenia identyfikatorów źródła dla odróżnienia zawartości twardej i zgadywanej oraz naprawę bramek walidacyjnych (Zabezpieczenie przed atakiem braku domeny).

## KROKI WDROŻENIA

### 1. `line` z BaseLinkera (Krok 1)
- Edycja słownika synonimów w pliku konfiguracyjnym `baselinker.extract.config.json` z dodaniem gałęzi `"line": ["linia", "line", "product line"]`.
- Wzbogacenie `baselinker.extract.js` tak by funkcja `extractFromFeatures` parsowała i zwracała strukturę dla `line`.
- Wprowadzenie zabezpieczenia do logiki Orkiestratora - A1 nie będzie pytany o klucz "line", jeśli zaciągnie się on z bazy wiedzy.

### 2. Identyfikator rzetelności `source` i `verified` (Krok 2)
- Konwersja surowych danych. Aktualnie Orkiestrator przykleja odpowiedź A1 bezpośrednio do stanu, po tych zmianach zbuduje strukturyzowany obiekt: `{ value: string, source: "a1", verified: false }`.
- Przebudowanie przypisania wyjść dla ekstrakcji po stronie Baselinkera - modyfikacja modułu `baselinker.extract.js`, aby każda struktura atrybutu bazowego dysponowała flagą `source: "baselinker"`.

### 3. Zastąpienie cichej bramki domeny P1 (Krok 3)
- Zmodernizowanie mechanizmu z `orchestrator.js` blokującego domeny na białej liście.
- Kaskadowe szukanie `brand` → części pierwszej `product_name` → `eu_responsible_person.name`. 
- Jeżeli próba ewaluacji okaże się niemożliwa - system wrzuci twardy warning z typem `P1_CHECK_IMPOSSIBLE` (brak zgody na ciche "null and pass"). Jeśli natomiast marka się nie zgadza na liście `research_sources_used` to nadal emituje `NO_P1_SOURCE`.
- Stworzenie dodatkowego testu by to udowodnić.

### 4. Komplet dowodów w raporcie (Krok 4)
- Raport zostanie wklejony jako surowy JSON maszyny od 1 klamry do ostatniej bez wycinania czegokolwiek za pomocą ucięć i kropek.
- Rzetelne przedstawienie bloku `usageMetadata` modelu Gemini.
- Wydruki `git diff --stat` ORAZ `git status --short`.
- Odkrycie genezy wymyślonych JSON-owych kluczy - zbadam prompt z `Agent_1_compiled.md`, gdzie instrukcja wciąż mogła prosić LLM by odegrał przestarzałą pętlę dla starych danych mimo ścisłego przekazywania JSON Schema po stronie kodu w API. 

**Czekam na zwrot `Akceptuję`, aby rozpocząć proces chirurgicznego wycinania w środowisku.**
