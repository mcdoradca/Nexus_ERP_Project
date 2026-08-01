# RAPORT ZADANIA 25 — zależności kontraktu A1 (odblokowanie 24A)

## 1. Usunięcie warunku z `orchestrator.js:216`

Dokonano usunięcia bloku martwego warunku (zgodnie z załączonym poniżej dowodem diff). Należy jednak zwrócić uwagę, że wygenerowany `npm test` po usunięciu rzucił statusem fail 0 (żaden test nie upadł - asercje testowały pole `undefined`, więc niezależnie od usunięcia testy nadal uchodzą pomyślnie).

**Dowód git diff:**
```diff
diff --git a/src/modules/offer-optimizer-v2/orchestrator.js b/src/modules/offer-optimizer-v2/orchestrator.js
index 72886f4..d040a45 100644
--- a/src/modules/offer-optimizer-v2/orchestrator.js
+++ b/src/modules/offer-optimizer-v2/orchestrator.js
@@ -213,10 +213,6 @@
             };
             deepNormalize(result);
 
-            if (result.mpn === result.gtin_ean) {
-                result.mpn = null;
-                warnings.push('mpn_equals_ean');
-            }
 
             if (result.research_sources_used && Array.isArray(result.research_sources_used)) {
                 const originalSources = [...result.research_sources_used];
```

**Dowód grep -rn "gtin_ean":**
*Uwaga: W związku z rygorystycznym zakazem refaktoryzacji reszty kodu z punktu 1., zmienna `gtin_ean` nadal istnieje (np. jest przekazywana do agentData l.183 oraz badana w testach). Poniżej zestaw wyłapanych pozostałości:*
```
src/modules/offer-optimizer-v2/orchestrator.js:183:            gtin_ean: this.gtin,
src/modules/offer-optimizer-v2/tests/orchestrator.test.js:93:                gtin_ean: "999999",
src/modules/offer-optimizer-v2/tests/orchestrator.test.js:106:    assert.strictEqual(orch.state.a1_result.gtin_ean, undefined);
src/modules/offer-optimizer-v2/tests/orchestrator.test.js:112:    assert.ok(warns.includes('A1_FIELD_REJECTED: gtin_ean'));
```


## 2. Ustalenie faktów o `validators/index.js:35`

- **Ciało funkcji:**
```javascript
24: function route_chemical(pim) {
25:     if (!pim) return { is_chemical: false, reasons: [] };
26:     const reasons = [];
27:     const cat = (pim.category || '').toLowerCase();
28:     
29:     if (cat.includes('chemia') || cat.includes('chemical') || cat.includes('biobójcz') || cat.includes('biocid')) {
30:         reasons.push('Category chemical/biocidal');
31:     }
32:     if (pim.sds_required === true || String(pim.sds_required).toLowerCase() === 'true') {
33:         reasons.push('SDS required');
34:     }
35:     if (pim.raw_ingredients_inci && String(pim.raw_ingredients_inci).trim() !== '') {
36:         reasons.push('Has INCI ingredients');
37:     }
38:     if (pim.clp_signal_word && String(pim.clp_signal_word).trim() !== '') {
39:         reasons.push('Has CLP signal word');
40:     }
41:     
42:     return { is_chemical: reasons.length > 0, reasons };
43: }
```
- **Wszystkie trafienia grep:**
```
src/modules/offer-optimizer-v2/validators/index.js:35:    if (pim.raw_ingredients_inci && String(pim.raw_ingredients_inci).trim() !== '') {
src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md:28:5. raw_ingredients_inci: pełny skład w niezmienionej postaci (dla A4).
src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md:39:raw_ingredients_inci, missing_critical_data, research_sources_used[].
src/modules/offer-optimizer-v2/scripts/test_orchestrator.js:14:    raw_ingredients_inci: "Aqua (Water), Aloe Barbadensis Leaf Juice, Ethylhexyl Palmitate, Coco-Caprylate, Glycerin, Glyceryl Stearate, Methylpropanediol, Charcoal Powder, Ammonium Acryloyldimethyltaurate/VP Copolymer, Phenoxyethanol, Parfum (Fragrance), Ethylhexylglycerin, Sodium Stearoyl Glutamate, Lecithin, Tocopherol, Ascorbyl Palmitate, Citric Acid."
src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md:30:5. raw_ingredients_inci: pełny skład w niezmienionej postaci (dla A4).
src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md:41:raw_ingredients_inci, missing_critical_data, research_sources_used[].
src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E2.md:31:   raw_ingredients_inci LUB clp_signal_word!=null. Zwraca {is_chemical,
src/modules/offer-optimizer-v2/docs/OCENA_23_pochodzenie_line.md:45:                             brand, line, product_name, (...) raw_ingredients_inci,
src/modules/offer-optimizer-v2/docs/DECYZJA_D23_kontrakt_A1.md:17:   `raw_ingredients_inci`, `missing_critical_data`. Linia `32` wprowadza flagę
src/modules/offer-optimizer-v2/docs/PROMPT_STARTOWY_SESJA_WYKONAWCY.md:141:verified_certificates[], raw_ingredients_inci,
src/modules/offer-optimizer-v2/docs/PLAN_21_wpiecie_ekstrakcji.md:5:2. **Wyłączenie pól A1:** Agent 1 nie będzie uzupełniał elementów prawnych (`compliance_gpsr_clp`), logistyki, INCI (`raw_ingredients_inci`), `mpn` ani `verified_certificates`.
src/modules/offer-optimizer-v2/docs/RAPORT_16_inwentaryzacja_features.md:75:| `raw_ingredients_inci` | `text_fields.features` | Płaski ciąg znaków CSV (tekst) ujęty zazwyczaj pod kluczem `Ingredients / INCI` lub `skladniki inci`. |
src/modules/offer-optimizer-v2/docs/RAPORT_14_dowody_E4a.md:41:    "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice...",
src/modules/offer-optimizer-v2/docs/RAPORT_14_dowody_E4a.md:127:    "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice...",
src/modules/offer-optimizer-v2/docs/RAPORT_11_E4a_orkiestrator_A1.md:31:  "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice...",
src/modules/offer-optimizer-v2/docs/RAPORT_12_E4a_hardfail_stan.md:44:  "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice...",
src/modules/offer-optimizer-v2/docs/RAPORT_12_E4a_hardfail_stan.md:135:    "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice...",
src/modules/offer-optimizer-v2/docs/RAPORT_11_DOK_kontrakt_A1.md:40:  "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice...",
src/modules/offer-optimizer-v2/docs/RAPORT_11_DOK2_literaly_null.md:49:  "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice...",
src/modules/offer-optimizer-v2/docs/RAPORT_11_DOK2_literaly_null.md:141:    "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice...",
src/modules/offer-optimizer-v2/docs/RAPORT_24A_kontrakt_A1.md:3:Zgodnie z poleceniem z `AKCEPTACJA_PLANU_24.md`, przed usunięciem pól z promptu sprawdziłem użycie ciągów `missing_critical_data\|raw_ingredients_inci\|gtin_ean` w kodzie za pomocą polecenia `grep`.
src/modules/offer-optimizer-v2/docs/RAPORT_24A_kontrakt_A1.md:15:Ponadto, wartości `raw_ingredients_inci` jest odpytywana m.in w module bramki:
src/modules/offer-optimizer-v2/docs/RAPORT_24A_kontrakt_A1.md:18:35:    if (pim.raw_ingredients_inci && String(pim.raw_ingredients_inci).trim() !== '') {
src/modules/offer-optimizer-v2/docs/ZADANIE_16_inwentaryzacja_features.md:79:`raw_ingredients_inci` **dołącza do listy pól, których A1 nie ustala**. Źródło:
src/modules/offer-optimizer-v2/docs/ZADANIE_16_inwentaryzacja_features.md:122:| `raw_ingredients_inci` | | |
src/modules/offer-optimizer-v2/docs/ZADANIE_17_ekstrakcja_baselinker.md:43:`raw_ingredients_inci` oraz `logistics` A1 nie jest źródłem — nigdy, w żadnym
src/modules/offer-optimizer-v2/docs/ZADANIE_15_sonda_baselinker.md:70:`raw_ingredients_inci`, `research_sources_used` oraz bramkę GATE-1 z PATCH v4.1
src/modules/offer-optimizer-v2/docs/ZADANIE_15_sonda_baselinker.md:75:`raw_ingredients_inci` był identyczny znak w znak we wszystkich czterech przebiegach,
src/modules/offer-optimizer-v2/docs/ZADANIE_12_E4a_korekta_kontraktu_A1.md:90:verified_certificates[], raw_ingredients_inci,
src/modules/offer-optimizer-v2/docs/ZADANIE_11_E4a_orkiestrator_A1.md:84:- `responseSchema` = pola z sekcji WYJŚCIE promptu A1: `pipeline_id, gtin_ean, brand, line, product_name, country_of_origin, logistics{}, compliance_gpsr_clp{}, verified_certificates[], raw_ingredients_inci, missing_critical_data, research_sources_used[]` (max 8 domen).
src/modules/offer-optimizer-v2/docs/RAPORT_23_pochodzenie_line.md:17:39: raw_ingredients_inci, missing_critical_data, research_sources_used[].
src/modules/offer-optimizer-v2/docs/ZADANIE_25_zaleznosci.md:62:- `grep -rn "raw_ingredients_inci" src/modules/offer-optimizer-v2/` — wszystkie
src/modules/offer-optimizer-v2/docs/ZADANIE_25_zaleznosci.md:66:  do `raw_ingredients_inci`. Jeśli nie istnieje — napisz to jednym zdaniem wprost
src/modules/offer-optimizer-v2/docs/ZADANIE_21_wpiecie_ekstrakcji.md:69:polami, `raw_ingredients_inci`, `logistics`, `mpn`, `verified_certificates`.
src/modules/offer-optimizer-v2/docs/ZADANIE_24_kontrakt_A1.md:30:`verified_certificates`, `raw_ingredients_inci`, `missing_critical_data`, oraz sekcję
src/modules/offer-optimizer-v2/docs/ZADANIE_24_kontrakt_A1.md:73:  `missing_critical_data`, `raw_ingredients_inci`, `line` — dowodem jest wydruk
```
- **Kto woła i jaki obiekt (plik:linia):**
Woła go `src/modules/offer-optimizer-v2/orchestrator.js:79` (`const isChemical = route_chemical(pimData);`) podając `pimData` (główny payload z zewnątrz potoku). Ponadto są testy wywołujące ten moduł w `src/modules/offer-optimizer-v2/tests/validators.test.js:33`.
- **Przypisanie wartości do raw_ingredients_inci:**
W module V2 **nie istnieje żadne miejsce**, które przypisuje wartość do pola `raw_ingredients_inci`.

## 3. npm test

Wydruk z wynikiem 0 błędów po usunięciu blokady.

```
> nexus_erp_project@1.0.0 test
> node --test --test-reporter=spec "src/modules/offer-optimizer-v2/tests/*.test.js"

▶ Zadanie 18 - baselinker.extract.js na rzeczywistych danych
  ✔ 1. Equilibra (trimmed): skład INCI zgodny znak w znak z BaseLinkerem, posiada kropkę na końcu (3.4642ms)
  ✔ 2. Equilibra (trimmed): mpn = null, brak zmyślania "Kodu producenta" jeśli go nie ma (0.4768ms)
  ✔ 3. Trimay (trimmed): mpn = EAN, ekstraktor oddaje to dosłownie bez ucinania (1.7357ms)
  ✔ 4. Equilibra (raw): test odzysku (64KB bug w BaseLinker) (1.1618ms)
  ✔ 5. Trimay (raw): skład INCI na niekniętym obiekcie (bajt-w-bajt z BaseLinkera) (0.7473ms)
  ✔ 6. Equilibra: podmiot odpowiedzialny wyekstrahowany z description (0.8595ms)
  ✔ 7. Trimay: podmiot odpowiedzialny = null, raw_fragment = null (0.7067ms)
  ✔ 8. Test syntetyczny: klucz Linia z bazy omija A1, posiada source i matched_key (0.3389ms)
✔ Zadanie 18 - baselinker.extract.js na rzeczywistych danych (13.0081ms)
✔ Zabezpieczenie przed regresją kompilatora: brak parametrów w promptach (2.1675ms)
✔ Konfiguracja węzłów: A5 na klasie Pro z thinkingLevel HIGH (0.2156ms)
✔ Test wycieku GATE-1 i GATE-2 do indeksu i walidacji (9265.2207ms)
✔ normalizeIngredientName - powinno normalizować nazwy (1.1463ms)
✔ extractIngredientsFromChunk - SOT_06 (2.4292ms)
✔ extractIngredientsFromChunk - INCI_DICT (0.3803ms)
✔ extractIngredientsFromChunk - SOT_10 (0.2835ms)
✔ Orchestrator - Brak INCI przerywa na EXTRACT (4.6353ms)
✔ Orchestrator - Brak EU RP przerywa na EXTRACT (9.2105ms)
✔ Orchestrator - GATE-1 wykrywa hydroquinone i zatrzymuje na EXTRACT (1.3424ms)
✔ Orchestrator - Komplet danych na fizycznym produkcie nie zatrzymuje fazy 1 (2.0503ms)
✔ Orchestrator - Biała lista ucina sztuczne pola (1.5223ms)
✔ Orchestrator - P1 sprawdzenie zwraca P1_CHECK_IMPOSSIBLE gdy brak domeny (1.4982ms)
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-07-31": 1 chunków semantycznych.
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-07-31": 1 chunków semantycznych.
✔ Idempotencja ingestu (dokument nadpisuje samego siebie) (3892.0942ms)
✔ GATE-3 Deterministic Match - getKnowledgeForIngredients (1724.6248ms)
✔ GATE-3 Deterministic Match - Weryfikacja similarity (jest zignorowane do gatingu) (221.0263ms)
✔ GATE-3 Deterministic Match - Brak wrażliwości na znaki wieloznaczne % i _ (461.097ms)
✔ Asercje Metadanych - GATE/RULE/entryName (2555.9804ms)
✔ Teardown (4.3184ms)
▶ Test korupcji kodowania list bezpieczeństwa
  ✔ Wykrywa frazy medyczne z polskimi znakami (2.1767ms)
  ✔ Wykrywa stop-words z polskimi znakami (1.0481ms)
✔ Test korupcji kodowania list bezpieczeństwa (3.987ms)
✔ V1 ean_checksum (1.1103ms)
✔ V2 route_chemical (0.3976ms)
✔ V3 scan_stopwords (0.5021ms)
✔ V4 scan_medical_claims_lexical (0.2307ms)
✔ V5 validate_html_whitelist (3.8419ms)
✔ V6 diff_numeric (1.4254ms)
✔ V7 emoji_structure_check (0.8689ms)
▶ V8 gate_ingredients
  ✔ GATE-1 check 1: perboric acid, sodium salt (2.2201ms)
  ✔ GATE-1 check 2: trimethylbenzoyl diphenylphosphine oxide (0.1169ms)
  ✔ GATE-1 check 3: tpo (0.0713ms)
  ✔ GATE-1 check 4: n,n-dimethyl-p-toluidine (0.0672ms)
  ✔ GATE-1 check 5: tetrabromobisphenol-a (0.072ms)
  ✔ GATE-1 check 6: dibutyltin oxide (0.0583ms)
  ✔ GATE-1 check 7: 4-methylbenzylidene camphor (0.1281ms)
  ✔ GATE-1 check 8: 4-mbc (0.0778ms)
  ✔ GATE-1 check 9: benzophenone-2 (0.0555ms)
  ✔ GATE-1 check 10: bp-2 (0.0571ms)
  ✔ GATE-1 check 11: benzophenone-5 (0.0502ms)
  ✔ GATE-1 check 12: bp-5 (0.0502ms)
  ✔ GATE-1 check 13: titanium dioxide (nano) (0.0477ms)
  ✔ GATE-1 check 14: hydrated silica (nano) (0.0486ms)
  ✔ GATE-1 check 15: silica silylate (nano) (0.049ms)
  ✔ GATE-1 check 16: silver (nano) (0.0667ms)
  ✔ GATE-2 check 1: ketoconazole (0.1171ms)
  ✔ GATE-2 check 2: climbazole (0.0638ms)
  ✔ GATE-2 check 3: clotrimazole (0.0513ms)
  ✔ GATE-2 check 4: miconazole (0.1266ms)
  ✔ GATE-2 check 5: hydroquinone (0.6213ms)
  ✔ GATE-2 check 6: tretinoin (0.0891ms)
  ✔ GATE-2 check 7: adapalene (0.0595ms)
  ✔ GATE-2 check 8: isotretinoin (0.0592ms)
  ✔ GATE-2 check 9: egf (0.1143ms)
  ✔ GATE-2 check 10: fgf (0.064ms)
  ✔ GATE-2 check 11: erythromycin (0.0489ms)
  ✔ GATE-2 check 12: clindamycin (0.0482ms)
  ✔ GATE-2 check 13: neomycin (0.0463ms)
  ✔ GATE-2 check 14: corticosteroids (0.0461ms)
  ✔ GATE-2 check 15: hydrocortisone (0.0471ms)
  ✔ GATE-1 forma etykietowa (0.1999ms)
  ✔ GATE-1 brak falszywych trafien (0.1611ms)
  ✔ Safe ingredients (0.1273ms)
✔ V8 gate_ingredients (6.6233ms)
✔ V9 c2pa_check (0.164ms)
✔ V10 freeze_sections (2.4804ms)
✔ V11 validate_eu_responsible_person (0.4368ms)
✔ V11 validate_eu_responsible_person - puste obiekty (0.1025ms)
✔ V11 validate_eu_responsible_person - zbyt dlugie pole (0.0818ms)
ℹ tests 78
ℹ suites 0
ℹ pass 78
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 9990.0298
```
