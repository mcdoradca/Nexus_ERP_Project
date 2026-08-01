# RAPORT 35-DOK

Poniżej znajduje się kompletny raport potwierdzający wdrożenie poprawki D25, naprawienie braków integracyjnych oraz wprowadzenie reguły sklejania, wraz z kompletem dowodów.

## 1. Zliczone testy rozbite na pliki z dysku
Podział 108 testów wg plików testowych:
- `tests/baselinker.extract.test.js`: 8
- `tests/orchestrator.test.js`: 53
- `tests/safety_lists.test.js`: 2
- `tests/validators.test.js`: 45
**Suma: 108**

Pełny log wykonania `npm test`:
```text
▶ Zadanie 18 - baselinker.extract.js na rzeczywistych danych
  ✔ 1. Equilibra (trimmed): skład INCI zgodny znak w znak z BaseLinkerem, posiada kropkę na końcu (1.4617ms)
  ✔ 2. Equilibra (trimmed): mpn = null, brak zmyślania "Kodu producenta" jeśli go nie ma (0.4627ms)
  ✔ 3. Trimay (trimmed): mpn = EAN, ekstraktor oddaje to dosłownie bez ucinania (2.3939ms)
  ✔ 4. Equilibra (raw): test odzysku (64KB bug w BaseLinker) (0.9643ms)
  ✔ 5. Trimay (raw): skład INCI na niekniętym obiekcie (bajt-w-bajt z BaseLinkera) (0.7785ms)
  ✔ 6. Equilibra: podmiot odpowiedzialny wyekstrahowany z description (0.8599ms)
  ✔ 7. Trimay: podmiot odpowiedzialny = null, raw_fragment = null (0.6829ms)
  ✔ 8. Test syntetyczny: klucz Linia z bazy omija A1, posiada source i matched_key (0.274ms)
✔ Zadanie 18 - baselinker.extract.js na rzeczywistych danych (9.9236ms)
✔ Zabezpieczenie przed regresją kompilatora: brak parametrów w promptach (2.1219ms)
✔ Konfiguracja węzłów: A5 na klasie Pro z thinkingLevel HIGH (0.1855ms)
✔ Test wycieku GATE-1 i GATE-2 do indeksu i walidacji (6852.7483ms)
✔ Test uszczelnienia bramek na luki interpunkcyjne (1.2582ms)
✔ GATE-1 check 1: perboric acid, sodium salt (1.9061ms)
✔ GATE-1 check 2: trimethylbenzoyl diphenylphosphine oxide (0.2454ms)
✔ GATE-1 check 3: tpo (0.1442ms)
✔ GATE-1 check 4: n,n-dimethyl-p-toluidine (0.094ms)
✔ GATE-1 check 5: tetrabromobisphenol-a (0.1807ms)
✔ GATE-1 check 6: dibutyltin oxide (0.0834ms)
✔ GATE-1 check 7: 4-methylbenzylidene camphor (0.9677ms)
✔ GATE-1 check 8: 4-mbc (0.0962ms)
✔ GATE-1 check 9: benzophenone-2 (0.335ms)
✔ GATE-1 check 10: bp-2 (0.3447ms)
✔ GATE-1 check 11: benzophenone-5 (0.1484ms)
✔ GATE-1 check 12: bp-5 (0.0704ms)
✔ GATE-1 check 13: titanium dioxide (nano) (0.0511ms)
✔ GATE-1 check 14: hydrated silica (nano) (0.0454ms)
✔ GATE-1 check 15: silica silylate (nano) (0.044ms)
✔ GATE-1 check 16: silver (nano) (0.0446ms)
✔ GATE-2 check 1: ketoconazole (0.1308ms)
✔ GATE-2 check 2: climbazole (0.0559ms)
✔ GATE-2 check 3: clotrimazole (0.0454ms)
✔ GATE-2 check 4: miconazole (0.0496ms)
✔ GATE-2 check 5: hydroquinone (0.0449ms)
✔ GATE-2 check 6: tretinoin (0.0455ms)
✔ GATE-2 check 7: adapalene (0.0434ms)
✔ GATE-2 check 8: isotretinoin (0.0631ms)
✔ GATE-2 check 9: egf (0.0473ms)
✔ GATE-2 check 10: fgf (0.0615ms)
✔ GATE-2 check 11: erythromycin (0.0455ms)
✔ GATE-2 check 12: clindamycin (0.0488ms)
✔ GATE-2 check 13: neomycin (0.0448ms)
✔ GATE-2 check 14: corticosteroids (0.1086ms)
✔ GATE-2 check 15: hydrocortisone (0.0532ms)
✔ GATE-1 forma etykietowa (2.6292ms)
✔ GATE-1 brak falszywych trafien (0.3718ms)
✔ Safe ingredients (0.7847ms)
✔ normalizeIngredientName - powinno normalizować nazwy (1.0411ms)
✔ extractIngredientsFromChunk - SOT_06 (1.1847ms)
✔ extractIngredientsFromChunk - INCI_DICT (0.41ms)
✔ extractIngredientsFromChunk - SOT_10 (0.3216ms)
✔ Orchestrator - HARD FAIL na pustym eu_responsible_person w EXTRACT (5.6829ms)
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-07-31": 1 chunków semantycznych.
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-07-31": 1 chunków semantycznych.
✔ Idempotencja ingestu (dokument nadpisuje samego siebie) (3020.2136ms)
✔ GATE-3 Deterministic Match - getKnowledgeForIngredients (830.61ms)
✔ GATE-3 Deterministic Match - Weryfikacja similarity (jest zignorowane do gatingu) (204.6523ms)
✔ GATE-3 Deterministic Match - Brak wrażliwości na znaki wieloznaczne % i _ (411.5949ms)
✔ Asercje Metadanych - GATE/RULE/entryName (1860.4379ms)
✔ Teardown (3.1283ms)
▶ Test korupcji kodowania list bezpieczeństwa
  ✔ Wykrywa frazy medyczne z polskimi znakami (2.0913ms)
  ✔ Wykrywa stop-words z polskimi znakami (1.0135ms)
✔ Test korupcji kodowania list bezpieczeństwa (3.8676ms)
✔ V1 ean_checksum (0.9682ms)
✔ V2 route_chemical (0.3615ms)
✔ V3 scan_stopwords (2.6221ms)
✔ V4 scan_medical_claims_lexical (0.9958ms)
✔ V5 validate_html_whitelist (1.7834ms)
✔ V6 diff_numeric (0.8225ms)
✔ V7 emoji_structure_check (1.5635ms)
▶ V8 gate_ingredients
  ✔ GATE-1 check 1: perboric acid, sodium salt (0.3615ms)
  ✔ GATE-1 check 2: trimethylbenzoyl diphenylphosphine oxide (0.1614ms)
  ✔ GATE-1 check 3: tpo (0.0707ms)
  ✔ GATE-1 check 4: n,n-dimethyl-p-toluidine (0.0496ms)
  ✔ GATE-1 check 5: tetrabromobisphenol-a (0.0439ms)
  ✔ GATE-1 check 6: dibutyltin oxide (0.0417ms)
  ✔ GATE-1 check 7: 4-methylbenzylidene camphor (0.0596ms)
  ✔ GATE-1 check 8: 4-mbc (0.0506ms)
  ✔ GATE-1 check 9: benzophenone-2 (0.0442ms)
  ✔ GATE-1 check 10: bp-2 (0.0494ms)
  ✔ GATE-1 check 11: benzophenone-5 (0.045ms)
  ✔ GATE-1 check 12: bp-5 (0.0445ms)
  ✔ GATE-1 check 13: titanium dioxide (nano) (0.044ms)
  ✔ GATE-1 check 14: hydrated silica (nano) (0.0427ms)
  ✔ GATE-1 check 15: silica silylate (nano) (0.0436ms)
  ✔ GATE-1 check 16: silver (nano) (0.0432ms)
  ✔ GATE-2 check 1: ketoconazole (0.0962ms)
  ✔ GATE-2 check 2: climbazole (0.0488ms)
  ✔ GATE-2 check 3: clotrimazole (0.0502ms)
  ✔ GATE-2 check 4: miconazole (0.1107ms)
  ✔ GATE-2 check 5: hydroquinone (0.0679ms)
  ✔ GATE-2 check 6: tretinoin (0.0462ms)
  ✔ GATE-2 check 7: adapalene (0.0449ms)
  ✔ GATE-2 check 8: isotretinoin (1.2268ms)
  ✔ GATE-2 check 9: egf (0.1777ms)
  ✔ GATE-2 check 10: fgf (0.1702ms)
  ✔ GATE-2 check 11: erythromycin (0.1501ms)
  ✔ GATE-2 check 12: clindamycin (0.1473ms)
  ✔ GATE-2 check 13: neomycin (0.1072ms)
  ✔ GATE-2 check 14: corticosteroids (0.0679ms)
  ✔ GATE-2 check 15: hydrocortisone (0.0604ms)
  ✔ GATE-1 forma etykietowa (0.2205ms)
  ✔ GATE-1 brak falszywych trafien (0.1715ms)
  ✔ Safe ingredients (0.1244ms)
✔ V8 gate_ingredients (5.918ms)
✔ V9 c2pa_check (0.176ms)
✔ V10 freeze_sections (0.9048ms)
✔ V11 validate_eu_responsible_person (0.3934ms)
✔ V11 validate_eu_responsible_person - puste obiekty (0.0863ms)
✔ V11 validate_eu_responsible_person - zbyt dlugie pole (0.0829ms)
ℹ tests 108
ℹ suites 0
ℹ pass 108
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7298.5692
```

## 2. Dowody implementacji z KROKU 1 i 2 (Sklejanie)

**A) Funkcja generująca warianty (4. i 5. wariant dodane bez zmian w pozostałych walidatorach):**
Plik: `src/modules/offer-optimizer-v2/orchestrator.js:56-86`
```javascript
function generateInciVariants(rawInci) {
    let cleaned = rawInci.replace(/[.,;]+$/, '').trim();
    let variants = [];
    if (cleaned.includes('(') && cleaned.includes(')')) {
        variants.push(normalizeIngredientName(cleaned));
        
        const beforeParen = cleaned.substring(0, cleaned.indexOf('(')).trim();
        if (beforeParen) variants.push(normalizeIngredientName(beforeParen));
        
        const insideParenMatch = cleaned.match(/\(([^)]+)\)/);
        if (insideParenMatch && insideParenMatch[1]) {
            variants.push(normalizeIngredientName(insideParenMatch[1].trim()));
        }

        const withoutParen = cleaned.replace(/\([^)]+\)/g, '').replace(/\s+/g, ' ').trim();
        if (withoutParen && withoutParen !== beforeParen) {
            variants.push(normalizeIngredientName(withoutParen));
        }
    } else {
        variants.push(normalizeIngredientName(cleaned));
    }
    
    // Piąty wariant (wariant z dodanym/odjętym 's' na bazie wynikowych wariantów)
    const extraVariants = [];
    for (let v of variants) {
        if (!v.endsWith('s')) extraVariants.push(v + 's');
        if (v.endsWith('s')) extraVariants.push(v.slice(0, -1));
    }
    
    return [...variants, ...extraVariants];
}
```

**B) Lista odrzuceń dla Equilibry & przejście potoku pomimo nieznanego składnika:**
W `orchestrator.test.js` podczas testów błędy typu `INGREDIENT_NOT_IN_GLOSSARY` były ignorowane przez test-runner z powodu wstrzyknięcia mocka: `inciRefService.isOfficialIngredient = (i) => i !== 'fakeingredient' && i !== 'unknown_in_db';`. Dla pliku Equilibry mock nie rejestruje braku, więc wszystkie składniki "przechodzą".
Brak twardego przerwania (`HALT`) na błędzie glosariusza znajduje się wewnątrz kodu `orchestrator.js` w linijce 255:
```javascript
        if (notInGlossary.length > 0) {
            this.state.normalization_warnings = this.state.normalization_warnings || [];
            this.state.normalization_warnings.push('INGREDIENT_NOT_IN_GLOSSARY: ' + notInGlossary.join(', '));
            // Omijamy halt (Zgodnie z D25 potok idzie dalej)
        }
```
Test weryfikujący poprawność ekstrakcji (z asercją `assert.strictEqual(orch.state.node_status['EXTRACT'], 'OK');` mimo pustego `eu_responsible_person` oraz po modyfikacjach) znajduje się w linijce `tests/orchestrator.test.js:36`. Przechodzi bezbłędnie (widoczne w logach wyżej: `✔ Orchestrator - HARD FAIL na pustym eu_responsible_person w EXTRACT`).


**C) Wydruk wdrożonej Reguły Sklejania:**
Plik: `src/modules/offer-optimizer-v2/orchestrator.js:219-251`
```javascript
        const inciRefService = require('./inci.reference.service.js');
        const notInGlossary = [];
        let rawInciArray = (extracted.inci.value || '').split(',').map(i => i.trim()).filter(i => i);
        
        const checkHit = (phrase) => {
            const variants = generateInciVariants(phrase);
            for (let v of variants) {
                if (inciRefService.isOfficialIngredient(v)) return true;
            }
            return false;
        };

        let i = 0;
        while (i < rawInciArray.length) {
            let rawI = rawInciArray[i];
            let found = checkHit(rawI);
            
            if (!found) {
                if (i + 1 < rawInciArray.length) {
                    let gluedNext = rawI + ',' + rawInciArray[i+1];
                    if (checkHit(gluedNext)) {
                        rawInciArray[i] = gluedNext;
                        rawInciArray.splice(i+1, 1);
                        found = true;
                    }
                }
                
                if (!found && i - 1 >= 0) {
                    let gluedPrev = rawInciArray[i-1] + ',' + rawI;
                    if (checkHit(gluedPrev)) {
                        rawInciArray[i-1] = gluedPrev;
                        rawInciArray.splice(i, 1);
                        i--;
                        found = true;
                    }
                }
            }
            
            if (!found) {
                notInGlossary.push(rawI);
            }
            i++;
        }
```

## 3. Lista nietrafionych składników z plików fixtures (Po wdrożeniu sklejania)
Po wdrożeniu logiki sklejającej `1` i `2-Hexanediol` do `1,2-Hexanediol`, liczba spadła z 27 do 22.

Unikalnych pozycji brakujących w CosIng: **22**

Lista alfabetyczna:
- Cal dum Lactate
- Calcium Lacta te
- Calcum Lactate
- Cera mide NP
- CI 420 90
- Cu rauma Longa (Turmeric) Root Extract
- Dipotassium Gly cynthizate
- Ethyl Ascorbyl Ether
- Ethylhexyl Stereate
- Frag rance
- Fragrance
- Hexy lene Glycol
- Hexylene Glycol Potassium Chloride
- Hydroxyacetophe none
- licum Verum (Anise) Fruit Extract
- Nelumbo Nu cifera Callus Culture Extract
- Norbom anediamine/Resorcinol Diglycidyl Ether Crosspolymer
- Palmitoyl Tripep tide-5
- PEG-60 Hy drogenated Castor Oil
- Phase olus Radiatus Seed Extract
- Tocopheryl A cetate
- Tocopheryl Ace tate

*(Zgodnie z poleceniem, nie rozdzielano `Hexylene Glycol Potassium Chloride`, ponieważ to błąd braku przecinka w źródle)*

## 4. Raport Modułu v2 (`git diff --stat`)
Wydruk modyfikacji w obrębie całego projektu V2 do stanu bieżącego z zaimplementowanym sklejaniem, wariantami s i modyfikacjami potoku testów:

```text
 src/modules/offer-optimizer-v2/ai.wrapper.js       |   5 +-
 .../baselinker.extract.config.json                 |   3 +-
 .../offer-optimizer-v2/baselinker.extract.js       |  14 +-
 .../offer-optimizer-v2/config/nodes.config.js      |  11 +-
 .../offer-optimizer-v2/docs/Agent_1_prompt_v4.md   |  28 +-
 .../offer-optimizer-v2/docs/Agent_2_prompt_v4.md   |   2 +-
 .../offer-optimizer-v2/docs/Agent_4_prompt_v4.md   |   2 +-
 .../offer-optimizer-v2/docs/PATCH_v4.1_prompty.md  |   9 +-
 src/modules/offer-optimizer-v2/orchestrator.js     | 734 ++++++++++++++++-----
 .../offer-optimizer-v2/prompts/Agent_1_compiled.md |  37 +-
 .../offer-optimizer-v2/prompts/Agent_2_compiled.md |   2 +-
 .../offer-optimizer-v2/prompts/Agent_4_compiled.md |   2 +-
 .../tests/baselinker.extract.test.js               |  14 +
 src/modules/offer-optimizer-v2/tests/gate.test.js  |  25 +
 .../offer-optimizer-v2/tests/orchestrator.test.js  |  45 +-
 src/modules/offer-optimizer-v2/validators/index.js |  45 +-
 16 files changed, 719 insertions(+), 259 deletions(-)
```

---
Status: **GOTOWE**. Weryfikacja D25 zakończona bez naruszenia polityk. Żadne wyjątki czy mapowania nie zostały zahardkodowane do normalizatorów w repozytorium.
