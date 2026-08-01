# [RAPORT_26_route_chemical] Audyt ustalania ścieżki chemicznej i sds_required

## 1. Co się dzieje ze zwróconą wartością (ciało funkcji `orchestrator.js`)
W aktualnej architekturze funkcja znajduje się w ciele `async run(pimData)` w `orchestrator.js:65-84`:

```javascript
65:     async run(pimData) {
66:         // Pre-validation
67:         const chk = ean_checksum(this.gtin);
68:         if (!chk.valid) {
69:             this.state.node_status['PRE'] = 'CRITICAL_INPUT_ERROR';
70:             this.state.next_action = 'HALT';
71:             this.emitState();
72:             return;
73:         }
74: 
75:         const isChemical = route_chemical(pimData);
76:         this.state.node_status['PRE'] = 'OK';
77:         this.state.chemical_route = isChemical;
78: 
79:         if (this.state.current_phase === PHASE_1_GROUNDING) {
80:             await this.runPhase1(pimData);
81:         }
82:         
83:         // E4b, E4c, E4d
84:     }
```
**Podsumowanie co robi z nią potok:** Zmienna booleanowska z flagą `isChemical` zostaje wyłącznie zrzucona do właściwości obiektu stanowego `this.state.chemical_route`. Zwrócona przez potok lista `reasons` jest kompletnie ignorowana i odrzucona (nigdzie nie przydzielona z desktrukturyzacji obiektu `{ is_chemical: ... , reasons: ... }` (uwaga: `route_chemical` na podstawie kodu `validators/index.js:42` zwraca obiekt `{ is_chemical, reasons }`, a orkiestrator pobierając `const isChemical = route_chemical(pimData);` przypisuje do zmiennej cały ten ZŁOŻONY obiekt a następnie osadza go na fladze `this.state.chemical_route` (przez co `chemical_route` nie jest wartością logiczną, lecz obiektem).

## 2. Wszyscy konsumenci (Grep na isChemical/route_chemical)
**Polecenie:** `git grep -rnE "isChemical|is_chemical|route_chemical" -- "src/modules/offer-optimizer-v2/**/*.js"`
**Trafienia (wykluczono pliki MD, zgodnie ze wzorcem powłoki):**
- `src/modules/offer-optimizer-v2/tests/validators.test.js:33:test('V2 route_chemical', async (t) => {`
  > Definicja asercji testowej dla omawianej funkcji kategoryzującej.
- `src/modules/offer-optimizer-v2/tests/validators.test.js:34:    assert.deepStrictEqual(v.route_chemical({ category: 'Kosmetyki' }), { is_chemical: false, reasons: [] });`
  > Wywołanie funkcji z testowym obiektem zawierającym jedynie klucz `category`.
- `src/modules/offer-optimizer-v2/tests/validators.test.js:35:    assert.deepStrictEqual(v.route_chemical({ category: 'Chemia domowa' }).is_chemical, true);`
  > Wywołanie z innym mockiem z kluczem `category` celem testowania flagi.
- `src/modules/offer-optimizer-v2/tests/validators.test.js:36:    assert.deepStrictEqual(v.route_chemical({ sds_required: true }).is_chemical, true);`
  > Wywołanie funkcji mockując obecność klucza `sds_required`, sprawdzające rzucanie `is_chemical`.
- `src/modules/offer-optimizer-v2/tests/validators.test.js:37:    assert.deepStrictEqual(v.route_chemical(null).is_chemical, false);`
  > Test zachowania przy braku jakichkolwiek wejść (obsługa pustych referencji).
- `src/modules/offer-optimizer-v2/validators/index.js:24:function route_chemical(pim) {`
  > Faktyczna definicja funkcji kategoryzacji sprawdzającej 4 wymogi bazy.
- `src/modules/offer-optimizer-v2/validators/index.js:25:    if (!pim) return { is_chemical: false, reasons: [] };`
  > Zwracana struktura z tablicą i domyślnym kluczem z the funkcji z linii 24.
- `src/modules/offer-optimizer-v2/validators/index.js:42:    return { is_chemical: reasons.length > 0, reasons };`
  > Faktyczny return sprawdzanej funkcji rzucający stanem chemicznym.
- `src/modules/offer-optimizer-v2/validators/index.js:274:    route_chemical,`
  > Eksport tej samej funkcji do innych komponentów (m.in. na rzecz `orchestrator.js`).
- `src/modules/offer-optimizer-v2/orchestrator.js:75:        const isChemical = route_chemical(pimData);`
  > Jedyne miejsce wywołania logiki i wykonania kategoryzacji w głównym kodzie programu.

## 3. Czym jest `pimData` i co ma w środku
PimData wywodzi się z surowej ekstraktacji BaseLinkera (po przefiltrowaniu przed potok `run`).
Źródło (w `runPhase1`, chociaż funkcja oceniająca jest w `run`):
W pliku testowym użyto po prostu wejściowego `extractFromFeatures()`. Obiekty generowane stamtąd zawierają:

**TRIMAY keys:**
```
[ 'inci', 'mpn', 'brand', 'capacity', 'usage', 'warnings', 'line', 'truncated', 'recovered_keys' ]
```
**EQUILIBRA keys:**
```
[ 'inci', 'mpn', 'brand', 'capacity', 'usage', 'warnings', 'line', 'truncated', 'recovered_keys' ]
```

## 4. `sds_required` — złoże puste
**Polecenie:** `git grep -rn "sds_required" -- "src/modules/offer-optimizer-v2/**/*.js"`
**Trafienia (wykluczono MD):**
- `src/modules/offer-optimizer-v2/tests/validators.test.js:36:    assert.deepStrictEqual(v.route_chemical({ sds_required: true }).is_chemical, true);`
- `src/modules/offer-optimizer-v2/validators/index.js:32:    if (pim.sds_required === true || String(pim.sds_required).toLowerCase() === 'true') {`

**Rozstrzygnięcie:** W całym module v2 (nie licząc statycznych asercji w testach) w ogóle nie istnieje ani jedno miejsce, które by przypisywało wartość do pola `sds_required` — kod zajmuje się jedynie jego bezpiecznym odczytem z tablic wejściowych (które, jak wykazuje krok wyżej, nigdy nie docierają z BaseLinkera).

## 5. `npm test`
```
> nexus_erp_project@1.0.0 test
> node --test --test-reporter=spec "src/modules/offer-optimizer-v2/tests/*.test.js"

▶ Zadanie 18 - baselinker.extract.js na rzeczywistych danych
  ✔ 1. Equilibra (trimmed): skład INCI zgodny znak w znak z BaseLinkerem, posiada kropkę na końcu (3.4877ms)
  ✔ 2. Equilibra (trimmed): mpn = null, brak zmyślania "Kodu producenta" jeśli go nie ma (0.4828ms)
  ✔ 3. Trimay (trimmed): mpn = EAN, ekstraktor oddaje to dosłownie bez ucinania (2.4473ms)
  ✔ 4. Equilibra (raw): test odzysku (64KB bug w BaseLinker) (1.1761ms)
  ✔ 5. Trimay (raw): skład INCI na niekniętym obiekcie (bajt-w-bajt z BaseLinkera) (0.7437ms)
  ✔ 6. Equilibra: podmiot odpowiedzialny wyekstrahowany z description (0.8929ms)
  ✔ 7. Trimay: podmiot odpowiedzialny = null, raw_fragment = null (0.6345ms)
  ✔ 8. Test syntetyczny: klucz Linia z bazy omija A1, posiada source i matched_key (0.2709ms)
✔ Zadanie 18 - baselinker.extract.js na rzeczywistych danych (12.5933ms)
✔ Zabezpieczenie przed regresją kompilatora: brak parametrów w promptach (4.6303ms)
✔ Konfiguracja węzłów: A5 na klasie Pro z thinkingLevel HIGH (0.2119ms)
✔ Test wycieku GATE-1 i GATE-2 do indeksu i walidacji (7113.3802ms)
✔ normalizeIngredientName - powinno normalizować nazwy (1.4542ms)
✔ extractIngredientsFromChunk - SOT_06 (2.0415ms)
✔ extractIngredientsFromChunk - INCI_DICT (0.3611ms)
✔ extractIngredientsFromChunk - SOT_10 (0.2528ms)
✔ Orchestrator - Brak INCI przerywa na EXTRACT (6.8207ms)
✔ Orchestrator - Brak EU RP przerywa na EXTRACT (9.6983ms)
✔ Orchestrator - GATE-1 wykrywa hydroquinone i zatrzymuje na EXTRACT (1.5884ms)
✔ Orchestrator - Komplet danych na fizycznym produkcie nie zatrzymuje fazy 1 (1.7613ms)
✔ Orchestrator - Biała lista ucina sztuczne pola (1.4095ms)
✔ Orchestrator - Zasada P1-first dla pola line (2.0191ms)
✔ Orchestrator - Zasada P1-first dla pola brand (1.9113ms)
✔ Orchestrator - P1 sprawdzenie zwraca P1_CHECK_IMPOSSIBLE gdy brak domeny (1.4437ms)
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-07-31": 1 chunków semantycznych.
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-07-31": 1 chunków semantycznych.
✔ Idempotencja ingestu (dokument nadpisuje samego siebie) (3429.1518ms)
✔ GATE-3 Deterministic Match - getKnowledgeForIngredients (845.2612ms)
✔ GATE-3 Deterministic Match - Weryfikacja similarity (jest zignorowane do gatingu) (209.0253ms)
✔ GATE-3 Deterministic Match - Brak wrażliwości na znaki wieloznaczne % i _ (418.0978ms)
✔ Asercje Metadanych - GATE/RULE/entryName (1899.0674ms)
✔ Teardown (9.6542ms)
▶ Test korupcji kodowania list bezpieczeństwa
  ✔ Wykrywa frazy medyczne z polskimi znakami (3.0664ms)
  ✔ Wykrywa stop-words z polskimi znakami (1.0107ms)
✔ Test korupcji kodowania list bezpieczeństwa (4.8476ms)
✔ V1 ean_checksum (1.0015ms)
✔ V2 route_chemical (0.3576ms)
✔ V3 scan_stopwords (0.4664ms)
✔ V4 scan_medical_claims_lexical (0.2282ms)
✔ V5 validate_html_whitelist (1.7504ms)
✔ V6 diff_numeric (0.7964ms)
✔ V7 emoji_structure_check (0.815ms)
▶ V8 gate_ingredients
  ✔ GATE-1 check 1: perboric acid, sodium salt (1.8941ms)
  ✔ GATE-1 check 2: trimethylbenzoyl diphenylphosphine oxide (0.1038ms)
  ✔ GATE-1 check 3: tpo (0.0711ms)
  ✔ GATE-1 check 4: n,n-dimethyl-p-toluidine (0.0654ms)
  ✔ GATE-1 check 5: tetrabromobisphenol-a (0.0717ms)
  ✔ GATE-1 check 6: dibutyltin oxide (0.0741ms)
  ✔ GATE-1 check 7: 4-methylbenzylidene camphor (0.1309ms)
  ✔ GATE-1 check 8: 4-mbc (0.0737ms)
  ✔ GATE-1 check 9: benzophenone-2 (0.056ms)
  ✔ GATE-1 check 10: bp-2 (0.0562ms)
  ✔ GATE-1 check 11: benzophenone-5 (0.0502ms)
  ✔ GATE-1 check 12: bp-5 (0.0493ms)
  ✔ GATE-1 check 13: titanium dioxide (nano) (0.0481ms)
  ✔ GATE-1 check 14: hydrated silica (nano) (0.0475ms)
  ✔ GATE-1 check 15: silica silylate (nano) (0.0486ms)
  ✔ GATE-1 check 16: silver (nano) (0.0481ms)
  ✔ GATE-2 check 1: ketoconazole (0.1192ms)
  ✔ GATE-2 check 2: climbazole (0.0541ms)
  ✔ GATE-2 check 3: clotrimazole (0.0488ms)
  ✔ GATE-2 check 4: miconazole (0.1188ms)
  ✔ GATE-2 check 5: hydroquinone (0.5719ms)
  ✔ GATE-2 check 6: tretinoin (0.1049ms)
  ✔ GATE-2 check 7: adapalene (0.0643ms)
  ✔ GATE-2 check 8: isotretinoin (0.0523ms)
  ✔ GATE-2 check 9: egf (0.1153ms)
  ✔ GATE-2 check 10: fgf (0.0652ms)
  ✔ GATE-2 check 11: erythromycin (0.0504ms)
  ✔ GATE-2 check 12: clindamycin (0.0468ms)
  ✔ GATE-2 check 13: neomycin (0.0478ms)
  ✔ GATE-2 check 14: corticosteroids (0.0502ms)
  ✔ GATE-2 check 15: hydrocortisone (0.0494ms)
  ✔ GATE-1 forma etykietowa (0.1782ms)
  ✔ GATE-1 brak falszywych trafien (0.1314ms)
  ✔ Safe ingredients (0.121ms)
✔ V8 gate_ingredients (6.1035ms)
✔ V9 c2pa_check (0.173ms)
✔ V10 freeze_sections (3.2824ms)
✔ V11 validate_eu_responsible_person (0.4567ms)
✔ V11 validate_eu_responsible_person - puste obiekty (0.1067ms)
✔ V11 validate_eu_responsible_person - zbyt dlugie pole (0.0868ms)
ℹ tests 80
ℹ suites 0
ℹ pass 80
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7619.8158
```

## 6. Zmiany w kodzie (`git diff --stat`)
```bash
(pusto)
```
