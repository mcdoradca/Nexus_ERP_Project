# [RAPORT_24A_DOK] Wykonanie rewersji kompilatora i zebranie dowodów dla V2

## KROK 1 — rewert kompilatora, poprawka źródła
Kompilator `prompt-compiler.js` został przywrócony do stanu z HEAD (`git checkout HEAD prompt-compiler.js`).
W pliku `docs/PATCH_v4.1_prompty.md` z usuniętą w całości sekcją `## Agent_1_prompt_v4.md` znajduje się nowa treść ucinająca przemycane stare klucze dla pierwszego noda, bez naruszenia sekcji A4, A5, A9, A10.

**Dowód — tabela sum kontrolnych:**
| Agent | SHA-256 z HEAD | SHA-256 Nowe (po usunięciu A1 patcha) |
|---|---|---|
| A1 | ee4e3fd774cbe52002858e08034733f02dfcbbdec00986b115d6e6dd8ffe0c5b | 96321d2fea7a34a07403c3478fb84c83564a9e6106a87999836839c820e0bc1e |
| A2 | 701adbe0b184785f7765f3ac1b606794e6aa35ed2cd3080d211c8e2e485535cc | 701adbe0b184785f7765f3ac1b606794e6aa35ed2cd3080d211c8e2e485535cc |
| A4 | dcc52c00114116353bc7cf491da9a3f5d17a49071e5cbe5d478d24e1459c32e7 | dcc52c00114116353bc7cf491da9a3f5d17a49071e5cbe5d478d24e1459c32e7 |
| A5 | ae2c1f249d5a4d6c078ef20828d5f6bdd71248e33638d06a19c3f0c3d768403b | ae2c1f249d5a4d6c078ef20828d5f6bdd71248e33638d06a19c3f0c3d768403b |
| A6 | b7709c931234d4a52b99981a994d4bef23a01983fd00215445379785c1f545d3 | b7709c931234d4a52b99981a994d4bef23a01983fd00215445379785c1f545d3 |
| A7 | 23ae5149b54c5f52857ddc542738334c8bc75546b4f004d2a81772355617ae0c | 23ae5149b54c5f52857ddc542738334c8bc75546b4f004d2a81772355617ae0c |
| A8 | 441ff309b043ec1b2a949102cbf6c13999dc89cc7709b5583ad6b7045c35af7d | 441ff309b043ec1b2a949102cbf6c13999dc89cc7709b5583ad6b7045c35af7d |
| A9 | 7dc10f25a6cd0ad6befa69d985d50b62fbaf1fd2410ae39cb44202e838915a3b | 7dc10f25a6cd0ad6befa69d985d50b62fbaf1fd2410ae39cb44202e838915a3b |
| A10 | 58865d65360d54a500846b5b8af4962a69bb54607d7dafef41eb41c48b125ac8 | 58865d65360d54a500846b5b8af4962a69bb54607d7dafef41eb41c48b125ac8 |

*(Zmienił się zgodnie z oczekiwaniami tylko i wyłącznie Agent 1).*

## KROK 2 — brakujące dowody
**a) Krok 0 (Grep testowy)**
Polecenie:
```bash
grep -rn "compliance_gpsr_clp\|verified_certificates\|clp_signal_word\|clp_h_phrases\|clp_p_phrases\|ufi_code\|biocidal_or_medical_permit\|ph_value\|net_capacity_or_weight\|gross_weight_kg\|dimensions_cm" src/modules/offer-optimizer-v2/ --include=*.js
```
Trafienia i komentarze:
- `src/modules/offer-optimizer-v2/scripts/test_orchestrator.js:11:        dimensions_cm: "15.0/5.0/3.5",`
  > **Komentarz:** Mock pola wejściowego PIM używany przez syntetyczny test (brak relacji z A1).
- `src/modules/offer-optimizer-v2/validators/index.js:38:    if (pim.clp_signal_word && String(pim.clp_signal_word).trim() !== '') {`
  > **Komentarz:** Walidator zabezpieczający sprawdzający zmienną wejściową dla flagi z bazy, nie jest to odczyt wygenerowany z odpowiedzi A1.

*(Brak jakichkolwiek odczytów z węzła A1 w systemie bazujących na wykluczonych parametrach).*

**b) `git diff -- src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md` w całości**
```diff
diff --git a/src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md b/src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md
index 53c0413..d370c7e 100644
--- a/src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md
+++ b/src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md
@@ -3,8 +3,9 @@
 # Prefiks statyczny (cache) = całość poniżej; dane SKU doklejane na końcu.
 
 ## ROLA
-Inżynier Danych PIM i analityk OSINT. Odnajdujesz i walidujesz twarde parametry
-techniczne, logistyczne i prawne produktu. Nie tworzysz treści.
+Analityk OSINT. Ustalasz kraj pochodzenia produktu i podajesz domeny źródeł,
+z których korzystałeś. Nie tworzysz treści. Nie ustalasz danych prawnych,
+logistycznych ani składu — te pochodzą wyłącznie ze źródeł strukturalnych.
 
 ## DYREKTYWY TWARDE
 1. ZERO INFERENCJI: zakaz wymyślania, szacowania i dopowiadania wartości (wymiary,
@@ -16,29 +17,10 @@ techniczne, logistyczne i prawne produktu. Nie tworzysz treści.
 3. Suma kontrolna EAN jest już zweryfikowana przez Orkiestrator — nie powtarzaj.
 
 ## ZAKRES POZYSKANIA
-1. Identyfikacja: brand, line, mpn, country_of_origin. Zakaz podstawiania gtin_ean pod mpn. Jeśli nieodnaleziony mpn, wstaw literał null.
-2. Logistyka: net_capacity_or_weight, gross_weight_kg, dimensions_cm (X/Y/Z — wymóg
-   gabarytowy One Box/InPost).
-3. GPSR/CLP (KRYTYCZNE — bezpieczeństwo ludzi, pełny rygor):
-   - eu_responsible_person: nazwa + fizyczny adres UE + e-mail/URL (GPSR Art. 16).
-   - clp_signal_word (NIEBEZPIECZEŃSTWO/UWAGA/null), clp_h_phrases[], clp_p_phrases[]
-     — kody dokładnie jak w SDS, bez parafraz.
-   - ufi_code (16 znaków), biocidal_or_medical_permit (URPL/ECHA/CE+jednostka).
-   - ph_value z Sekcji 9 SDS.
-4. Certyfikaty: tylko akredytowane (ECOCERT, COSMOS, EU Ecolabel, V-Label, ICEA,
-   BIOAGRICERT). Odrzucaj pseudocertyfikaty marketingowe.
-5. raw_ingredients_inci: pełny skład w niezmienionej postaci (dla A4).
-
-## FLAGA missing_critical_data = true GDY:
-- eu_responsible_person niekompletny (adres lub kontakt) — GPSR blokuje sprzedaż;
-- sds_required=true a SDS nieodnaleziona (brak H/P/UFI dla produktu niebezpiecznego).
-Flaga true zatrzymuje potok (HITL). W wątpliwości ZAWSZE flaguj — fałszywy alarm
-kosztuje minuty operatora, przepuszczona chemia bez SDS kosztuje zdrowie klienta.
+1. Identyfikacja: country_of_origin.
 
 ## WYJŚCIE
-JSON wg responseSchema. Pola: pipeline_id, gtin_ean, brand, line, product_name,
-country_of_origin, logistics{}, compliance_gpsr_clp{}, verified_certificates[],
-raw_ingredients_inci, missing_critical_data, research_sources_used[].
+JSON wg responseSchema. Pola: country_of_origin, research_sources_used[].
 Limity: research_sources_used max 8 domen.
 
 --- DANE SKU (blok dynamiczny, doklejany przez Orkiestrator) ---
```

**c) `a1Schema` w `orchestrator.js`**
`src/modules/offer-optimizer-v2/orchestrator.js:14-24`
```javascript
const a1Schema = {
    type: "object",
    properties: {
        country_of_origin: { type: "string" },
        research_sources_used: { type: "array", items: { type: "string" }, maxItems: 8 }
    },
    required: [
        "country_of_origin",
        "research_sources_used"
    ]
};
```

**d) `npm test` w całości**
```
> nexus_erp_project@1.0.0 test
> node --test --test-reporter=spec "src/modules/offer-optimizer-v2/tests/*.test.js"

▶ Zadanie 18 - baselinker.extract.js na rzeczywistych danych
  ✔ 1. Equilibra (trimmed): skład INCI zgodny znak w znak z BaseLinkerem, posiada kropkę na końcu (1.7431ms)
  ✔ 2. Equilibra (trimmed): mpn = null, brak zmyślania "Kodu producenta" jeśli go nie ma (0.4514ms)
  ✔ 3. Trimay (trimmed): mpn = EAN, ekstraktor oddaje to dosłownie bez ucinania (1.5828ms)
  ✔ 4. Equilibra (raw): test odzysku (64KB bug w BaseLinker) (2.3082ms)
  ✔ 5. Trimay (raw): skład INCI na niekniętym obiekcie (bajt-w-bajt z BaseLinkera) (0.8929ms)
  ✔ 6. Equilibra: podmiot odpowiedzialny wyekstrahowany z description (0.92ms)
  ✔ 7. Trimay: podmiot odpowiedzialny = null, raw_fragment = null (0.777ms)
  ✔ 8. Test syntetyczny: klucz Linia z bazy omija A1, posiada source i matched_key (0.33ms)
✔ Zadanie 18 - baselinker.extract.js na rzeczywistych danych (11.3175ms)
✔ Zabezpieczenie przed regresją kompilatora: brak parametrów w promptach (1.9811ms)
✔ Konfiguracja węzłów: A5 na klasie Pro z thinkingLevel HIGH (0.1844ms)
✔ Test wycieku GATE-1 i GATE-2 do indeksu i walidacji (7931.1955ms)
✔ normalizeIngredientName - powinno normalizować nazwy (1.2173ms)
✔ extractIngredientsFromChunk - SOT_06 (1.1671ms)
✔ extractIngredientsFromChunk - INCI_DICT (0.3923ms)
✔ extractIngredientsFromChunk - SOT_10 (0.2666ms)
✔ Orchestrator - Brak INCI przerywa na EXTRACT (4.7559ms)
✔ Orchestrator - Brak EU RP przerywa na EXTRACT (8.6675ms)
✔ Orchestrator - GATE-1 wykrywa hydroquinone i zatrzymuje na EXTRACT (1.277ms)
✔ Orchestrator - Komplet danych na fizycznym produkcie nie zatrzymuje fazy 1 (1.5714ms)
✔ Orchestrator - Biała lista ucina sztuczne pola (1.5179ms)
✔ Orchestrator - Zasada P1-first dla pola line (1.8777ms)
✔ Orchestrator - P1 sprawdzenie zwraca P1_CHECK_IMPOSSIBLE gdy brak domeny (1.5285ms)
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-07-31": 1 chunków semantycznych.
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-07-31": 1 chunków semantycznych.
✔ Idempotencja ingestu (dokument nadpisuje samego siebie) (3436.3145ms)
✔ GATE-3 Deterministic Match - getKnowledgeForIngredients (835.9407ms)
✔ GATE-3 Deterministic Match - Weryfikacja similarity (jest zignorowane do gatingu) (209.2397ms)
✔ GATE-3 Deterministic Match - Brak wrażliwości na znaki wieloznaczne % i _ (415.6399ms)
✔ Asercje Metadanych - GATE/RULE/entryName (2292.9014ms)
✔ Teardown (1.7566ms)
▶ Test korupcji kodowania list bezpieczeństwa
  ✔ Wykrywa frazy medyczne z polskimi znakami (2.0953ms)
  ✔ Wykrywa stop-words z polskimi znakami (0.9361ms)
✔ Test korupcji kodowania list bezpieczeństwa (3.9047ms)
✔ V1 ean_checksum (1.0752ms)
✔ V2 route_chemical (0.3679ms)
✔ V3 scan_stopwords (0.4858ms)
✔ V4 scan_medical_claims_lexical (0.2255ms)
✔ V5 validate_html_whitelist (1.5132ms)
✔ V6 diff_numeric (1.5161ms)
✔ V7 emoji_structure_check (0.9744ms)
▶ V8 gate_ingredients
  ✔ GATE-1 check 1: perboric acid, sodium salt (2.0955ms)
  ✔ GATE-1 check 2: trimethylbenzoyl diphenylphosphine oxide (0.1134ms)
  ✔ GATE-1 check 3: tpo (0.0702ms)
  ✔ GATE-1 check 4: n,n-dimethyl-p-toluidine (0.0896ms)
  ✔ GATE-1 check 5: tetrabromobisphenol-a (0.0879ms)
  ✔ GATE-1 check 6: dibutyltin oxide (0.0626ms)
  ✔ GATE-1 check 7: 4-methylbenzylidene camphor (0.5702ms)
  ✔ GATE-1 check 8: 4-mbc (0.1113ms)
  ✔ GATE-1 check 9: benzophenone-2 (0.0708ms)
  ✔ GATE-1 check 10: bp-2 (0.0931ms)
  ✔ GATE-1 check 11: benzophenone-5 (0.0605ms)
  ✔ GATE-1 check 12: bp-5 (0.0556ms)
  ✔ GATE-1 check 13: titanium dioxide (nano) (0.0501ms)
  ✔ GATE-1 check 14: hydrated silica (nano) (0.0507ms)
  ✔ GATE-1 check 15: silica silylate (nano) (0.0533ms)
  ✔ GATE-1 check 16: silver (nano) (0.05ms)
  ✔ GATE-2 check 1: ketoconazole (0.1235ms)
  ✔ GATE-2 check 2: climbazole (0.0559ms)
  ✔ GATE-2 check 3: clotrimazole (0.0513ms)
  ✔ GATE-2 check 4: miconazole (0.1285ms)
  ✔ GATE-2 check 5: hydroquinone (0.6544ms)
  ✔ GATE-2 check 6: tretinoin (0.0823ms)
  ✔ GATE-2 check 7: adapalene (0.0592ms)
  ✔ GATE-2 check 8: isotretinoin (0.0524ms)
  ✔ GATE-2 check 9: egf (0.1236ms)
  ✔ GATE-2 check 10: fgf (0.071ms)
  ✔ GATE-2 check 11: erythromycin (0.0533ms)
  ✔ GATE-2 check 12: clindamycin (0.0497ms)
  ✔ GATE-2 check 13: neomycin (0.0472ms)
  ✔ GATE-2 check 14: corticosteroids (0.0473ms)
  ✔ GATE-2 check 15: hydrocortisone (0.0483ms)
  ✔ GATE-1 forma etykietowa (0.1739ms)
  ✔ GATE-1 brak falszywych trafien (0.1314ms)
  ✔ Safe ingredients (0.1183ms)
✔ V8 gate_ingredients (7.0992ms)
✔ V9 c2pa_check (0.2363ms)
✔ V10 freeze_sections (0.9708ms)
✔ V11 validate_eu_responsible_person (0.3987ms)
✔ V11 validate_eu_responsible_person - puste obiekty (0.096ms)
✔ V11 validate_eu_responsible_person - zbyt dlugie pole (0.0778ms)
ℹ tests 79
ℹ suites 0
ℹ pass 79
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8403.1026
```


## KROK 3 — Prawdziwy zrzut stanu `orch.state`
*Poniżej znajduje się czysty dump `orch.state` z testu, bez zmyślonej referencji `extracted_data_line`.*

**Wstrzyknięcia do obiektu w teście (A1 LLM Mock):**
- `country_of_origin`: `"IT"`
- `line`: `"ZMYSLONA LINIA Z A1"`

```json
{
  "pipeline_id": "PL-8000137015436-1785501260614",
  "timestamp_utc": "2026-07-31T12:34:20.614Z",
  "current_phase": "PHASE_1_GROUNDING",
  "node_status": {
    "EXTRACT": "OK",
    "A1": "OK"
  },
  "revision_loop_count": 0,
  "next_action": "RUN_A2",
  "hitl_alert": null,
  "frozen_hashes": {
    "s3": null,
    "s5": null,
    "s6": null
  },
  "token_usage_per_node": {
    "A1": {
      "promptTokenCount": 1,
      "candidatesTokenCount": 1,
      "totalTokenCount": 2
    }
  },
  "extracted_data": {
    "inci": {
      "value": "Aqua (Water), Glyceryl Stereate, Cetyl Alcohol, Ethylhexyl Stereate, Coco-Caprylate/Caprate, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Glycerin, Hydrolyzed Eruca Sativa Leaf, Cetearyl Alcohol, C10-18 Triglyceride, Aloe Barbadensis Leaf Juice, Vaccinium Myrtillus Fruit Extract, Ribes Nigrum Fruit Extract, Charcoal Powder, Sodium Hyaluronate, Xanthan Gum, Helianthus Annuus (Sunflower) Seed Oil, Tocopherol, Phenoxyethanol, Stearic Acid, Parfum (Fragrance), Ethylexyglycerin, Dicaprylyl Ether, Sodium Lauroyl Glutamate, Sodium Benzoate, Beta-Sitosterol, Potassium Sorbate, Squalene, Citric Acid, Sodium Dehydroacetate.",
      "source": "baselinker",
      "matched_key": "skladniki inci"
    },
    "mpn": {
      "value": null,
      "source": null,
      "matched_key": null
    },
    "brand": {
      "value": null,
      "source": null,
      "matched_key": null
    },
    "capacity": {
      "value": "75 ml",
      "source": "baselinker",
      "matched_key": "pojemnosc"
    },
    "usage": {
      "value": "Nakładaj na idealnie oczyszczoną skórę twarzy rano i/lub wieczorem, masując aż do całkowitego wchłonięcia.",
      "source": "baselinker",
      "matched_key": "sposob uzycia"
    },
    "warnings": {
      "value": "Tylko do użytku zewnętrznego. Unikać kontaktu z oczami.",
      "source": "baselinker",
      "matched_key": "uwagi dotyczace bezpieczenstwa"
    },
    "line": {
      "value": null,
      "source": null,
      "matched_key": null
    },
    "truncated": true,
    "recovered_keys": [
      "Funkcja",
      "Rodzaj produktu",
      "ean",
      "pojemnosc",
      "zastosowanie",
      "sposob uzycia",
      "skladniki inci",
      "uwagi dotyczace bezpieczenstwa",
      "rich kontent"
    ],
    "eu_responsible_person": {
      "source": "description",
      "data": {
        "name": "Equilibra srl",
        "address_eu": "Via Plava, 74 Torino – 10135 Italy",
        "contact": "cosmetica@equilibra.it",
        "raw_fragment": "<p>Equilibra srl</p><p>Via Plava, 74 Torino – 10135 Italy</p><p><a href=\"mailto:cosmetica@equilibra.it\">cosmetica@equilibra.it</a></p>"
      }
    },
    "product_name": {
      "value": "Oczyszczający krem-żel do twarzy z aktywnym węglem 75ml",
      "source": "baselinker",
      "matched_key": null
    }
  },
  "normalization_warnings": [
    "pipeline_id_overwritten",
    "A1_FIELD_REJECTED: line",
    "A1_FIELD_REJECTED: pipeline_id"
  ],
  "a1_result": {
    "country_of_origin": {
      "value": "IT",
      "source": "a1"
    },
    "research_sources_used": {
      "value": [],
      "source": "a1"
    }
  }
}
```

## KROK 4 — `allowedKeys` bez `line`
Wydruk obiektu tablicy dopuszczonych kluczy po zmianie bezpośrednio z `orchestrator.js:255-257`:
```javascript
            const allowedKeys = [
                'country_of_origin', 'research_sources_used', 'brand'
            ];
```

W asercji `tests/orchestrator.test.js:143-145` (Orchestrator - Zasada P1-first dla pola line) test bada sytuację na produkcie Equilibra bez pola w źródle z usuniętym wstrzyknięciem BaseLinkera (PIM = null, A1 = "ZMYSLONA LINIA Z A1"):
```javascript
    assert.strictEqual(orch.state.extracted_data.line.value, null); // Brak w bazie
    assert.strictEqual(orch.state.a1_result.line, undefined); // Odrzuca z A1 mimo braku w bazie

    const warns = orch.state.normalization_warnings || [];
    assert.ok(warns.includes('A1_FIELD_REJECTED: line'));
```
Logika blokowania sztucznych pól na poziomie `allowedKeys` jest szczelna. 

**Wniosek i status:** Gotowe. Zgodnie z dyrektywą - raport dostarcza cztery żądane obszary dowodów (shasum, bash, dump w pamięci oraz twarde ominięcie warunków). Zmiany architektoniczne pominięte w imię zachowania czystości wyodrębnionego kodu, a źródła zostały poprawione dla przyszłych użyć systemu.
