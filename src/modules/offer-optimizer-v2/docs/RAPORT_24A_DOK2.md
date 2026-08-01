# [RAPORT_24A_DOK2] Zrzuty dowodowe z rewersji i poprawka brandu

## 1. `git diff -- src/modules/offer-optimizer-v2/prompt-compiler.js`
*(pusto - potwierdzony brak zmian względem HEAD po `git checkout`)*

## 2. `git diff -- src/modules/offer-optimizer-v2/docs/PATCH_v4.1_prompty.md`
```diff
diff --git a/src/modules/offer-optimizer-v2/docs/PATCH_v4.1_prompty.md b/src/modules/offer-optimizer-v2/docs/PATCH_v4.1_prompty.md
index d5337fc..fb04efc 100644
--- a/src/modules/offer-optimizer-v2/docs/PATCH_v4.1_prompty.md
+++ b/src/modules/offer-optimizer-v2/docs/PATCH_v4.1_prompty.md
@@ -3,14 +3,7 @@
 # nie regeneruję całych plików (zasada diff, którą sami wdrażamy w potoku).
 
-## Agent_1_prompt_v4.md
-+ Do sekcji ZAKRES POZYSKANIA dodaj pkt 6: "Bramka GATE-1 (SHARED_RULES §I):
-  jeśli w INCI/PIM występuje substancja z listy zakazanych SOT 04 §1, ustaw
-  missing_critical_data=true z powodem BANNED_SUBSTANCE_DETECTED — blokada
-  publikacji, HITL."
-+ Do sekcji GPSR/CLP dopisz: "Dla chemii domowej pozyskuj dane wg potoku
-  SOT 07 §3 (SDS sekcje 3/9/11, Arkusz Danych Składników 648/2004, rejestry
-  Ecolabel, cross-referencing EAN dla wydajności roboczej)."
+
 
 ## Agent_4_prompt_v4.md
 + Nowa sekcja BRAMKI WEJŚCIOWE (przed FORMAT GEO):
```

## 3. Pełna treść `Agent_1_compiled.md`
```markdown
# [NODE 1 - PIM RESEARCHER & OSINT AUTOFILL v4.0]

## ROLA
Analityk OSINT. Ustalasz kraj pochodzenia produktu i podajesz domeny źródeł,
z których korzystałeś. Nie tworzysz treści. Nie ustalasz danych prawnych,
logistycznych ani składu — te pochodzą wyłącznie ze źródeł strukturalnych.

## DYREKTYWY TWARDE
1. ZERO INFERENCJI: zakaz wymyślania, szacowania i dopowiadania wartości (wymiary,
   wagi, stężenia, pH, UFI, certyfikaty). Parametr nieodnaleziony w źródle
   autorytatywnym = null. Zakaz placeholderów. Wartość nieodnaleziona ma być literałem `null` w JSON, NIE tekstem (stringiem `"null"`).
2. HIERARCHIA ŹRÓDEŁ: P1 (jedyne dla danych prawnych): GS1, ECHA/CPNP, URPL, SDS
   producenta, strona marki. P2 (cross-walidacja): karty dystrybutorów, hurtownie.
   P3 (zakaz): blogi SEO, fora, aukcje konkurencji.
3. Suma kontrolna EAN jest już zweryfikowana przez Orkiestrator — nie powtarzaj.

## ZAKRES POZYSKANIA
1. Identyfikacja: country_of_origin.

## WYJŚCIE
JSON wg responseSchema. Pola: country_of_origin, research_sources_used[].
Limity: research_sources_used max 8 domen.

--- DANE SKU (blok dynamiczny, doklejany przez Orkiestrator) ---


--- WSPÓLNE REGUŁY ---
## §I. BRAMKI SKŁADNIKOWE — NOWE w v4.1 (A1, A4; egzekwuje: kod + STOP potoku)
GATE-1 SUBSTANCJE ZAKAZANE (SOT 04 §1): wykrycie w INCI/PIM substancji CMR
i zakazanych (m.in. Perboric acid, TPO, N,N-dimethyl-p-toluidine, 4-MBC, BP-2/BP-5,
zakazane nano) = natychmiastowa blokada publikacji + HITL.
GATE-2 SKŁADNIKI NIE-KOSMETYCZNE (SOT 06 §2): Ketoconazole, Clotrimazole,
Miconazole, Hydroquinone, Tretinoin, Adapalene, Isotretinoin, EGF/FGF, antybiotyki
(Erythromycin, Clindamycin, Neomycin), kortykosteroidy = błędna kategoryzacja
(produkt leczniczy) → INGREDIENT_NOT_COSMETIC → STOP potoku + HITL. Firma NIE
handluje lekami.
GATE-3 SKŁADNIK NIEZNANY: brak wpisu w bloku RAG (similarity < progu) →
UNKNOWN_INGREDIENT_NEEDS_LOOKUP → składnik pomijany w opisie, raport do HITL.
Zakaz zgadywania funkcji/bezpieczeństwa (SOT 06, nota antyhalucynacyjna).

--- DANE SKU ---
{{SKU_DATA}}
```

## 4. `brand` wypada z `allowedKeys`

**Zmiana w `orchestrator.js:255-257`:**
```javascript
            const allowedKeys = [
                'country_of_origin', 'research_sources_used'
            ];
```

**Zrzut `orch.state` z wywołania testowego:**
Wstrzyknięto do mocka A1 (symulacja halucynacji PIM):
- `brand: "ZMYSLONA MARKA Z A1"`
- `country_of_origin: "IT"`

```json
{
  "pipeline_id": "PL-8000137015436-1785501881663",
  "timestamp_utc": "2026-07-31T12:44:41.663Z",
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
    "A1_FIELD_REJECTED: brand",
    "A1_FIELD_REJECTED: pipeline_id"
  ],
  "a1_result": {
    "country_of_origin": {
      "value": "IT",
      "source": "a1"
    }
  }
}
```

## 5. `npm test`
```
> nexus_erp_project@1.0.0 test
> node --test --test-reporter=spec "src/modules/offer-optimizer-v2/tests/*.test.js"

▶ Zadanie 18 - baselinker.extract.js na rzeczywistych danych
  ✔ 1. Equilibra (trimmed): skład INCI zgodny znak w znak z BaseLinkerem, posiada kropkę na końcu (1.5614ms)
  ✔ 2. Equilibra (trimmed): mpn = null, brak zmyślania "Kodu producenta" jeśli go nie ma (0.4356ms)
  ✔ 3. Trimay (trimmed): mpn = EAN, ekstraktor oddaje to dosłownie bez ucinania (1.7566ms)
  ✔ 4. Equilibra (raw): test odzysku (64KB bug w BaseLinker) (0.8956ms)
  ✔ 5. Trimay (raw): skład INCI na niekniętym obiekcie (bajt-w-bajt z BaseLinkera) (0.7098ms)
  ✔ 6. Equilibra: podmiot odpowiedzialny wyekstrahowany z description (0.8744ms)
  ✔ 7. Trimay: podmiot odpowiedzialny = null, raw_fragment = null (0.6315ms)
  ✔ 8. Test syntetyczny: klucz Linia z bazy omija A1, posiada source i matched_key (0.2803ms)
✔ Zadanie 18 - baselinker.extract.js na rzeczywistych danych (9.2718ms)
✔ Zabezpieczenie przed regresją kompilatora: brak parametrów w promptach (2.0994ms)
✔ Konfiguracja węzłów: A5 na klasie Pro z thinkingLevel HIGH (0.2031ms)
✔ Test wycieku GATE-1 i GATE-2 do indeksu i walidacji (7485.7373ms)
✔ normalizeIngredientName - powinno normalizować nazwy (1.0797ms)
✔ extractIngredientsFromChunk - SOT_06 (1.108ms)
✔ extractIngredientsFromChunk - INCI_DICT (0.3351ms)
✔ extractIngredientsFromChunk - SOT_10 (2.1372ms)
✔ Orchestrator - Brak INCI przerywa na EXTRACT (4.4462ms)
✔ Orchestrator - Brak EU RP przerywa na EXTRACT (9.8204ms)
✔ Orchestrator - GATE-1 wykrywa hydroquinone i zatrzymuje na EXTRACT (1.4102ms)
✔ Orchestrator - Komplet danych na fizycznym produkcie nie zatrzymuje fazy 1 (1.7389ms)
✔ Orchestrator - Biała lista ucina sztuczne pola (1.3143ms)
✔ Orchestrator - Zasada P1-first dla pola line (1.7771ms)
✔ Orchestrator - Zasada P1-first dla pola brand (1.9141ms)
✔ Orchestrator - P1 sprawdzenie zwraca P1_CHECK_IMPOSSIBLE gdy brak domeny (1.5439ms)
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-07-31": 1 chunków semantycznych.
[RAG] "TEST_DOC_IDEMPOTENCY@v2026-07-31": 1 chunków semantycznych.
✔ Idempotencja ingestu (dokument nadpisuje samego siebie) (3505.4984ms)
✔ GATE-3 Deterministic Match - getKnowledgeForIngredients (838.6271ms)
✔ GATE-3 Deterministic Match - Weryfikacja similarity (jest zignorowane do gatingu) (220.7991ms)
✔ GATE-3 Deterministic Match - Brak wrażliwości na znaki wieloznaczne % i _ (548.8003ms)
✔ Asercje Metadanych - GATE/RULE/entryName (2009.7484ms)
✔ Teardown (3.1973ms)
▶ Test korupcji kodowania list bezpieczeństwa
  ✔ Wykrywa frazy medyczne z polskimi znakami (2.0663ms)
  ✔ Wykrywa stop-words z polskimi znakami (0.9756ms)
✔ Test korupcji kodowania list bezpieczeństwa (3.8015ms)
✔ V1 ean_checksum (0.961ms)
✔ V2 route_chemical (0.3503ms)
✔ V3 scan_stopwords (0.4401ms)
✔ V4 scan_medical_claims_lexical (0.2047ms)
✔ V5 validate_html_whitelist (1.5083ms)
✔ V6 diff_numeric (0.779ms)
✔ V7 emoji_structure_check (0.822ms)
▶ V8 gate_ingredients
  ✔ GATE-1 check 1: perboric acid, sodium salt (1.9361ms)
  ✔ GATE-1 check 2: trimethylbenzoyl diphenylphosphine oxide (0.1056ms)
  ✔ GATE-1 check 3: tpo (0.0736ms)
  ✔ GATE-1 check 4: n,n-dimethyl-p-toluidine (0.0664ms)
  ✔ GATE-1 check 5: tetrabromobisphenol-a (0.0721ms)
  ✔ GATE-1 check 6: dibutyltin oxide (0.0584ms)
  ✔ GATE-1 check 7: 4-methylbenzylidene camphor (0.1438ms)
  ✔ GATE-1 check 8: 4-mbc (0.0757ms)
  ✔ GATE-1 check 9: benzophenone-2 (0.0568ms)
  ✔ GATE-1 check 10: bp-2 (0.0563ms)
  ✔ GATE-1 check 11: benzophenone-5 (0.0505ms)
  ✔ GATE-1 check 12: bp-5 (0.0493ms)
  ✔ GATE-1 check 13: titanium dioxide (nano) (0.0483ms)
  ✔ GATE-1 check 14: hydrated silica (nano) (0.0481ms)
  ✔ GATE-1 check 15: silica silylate (nano) (0.0488ms)
  ✔ GATE-1 check 16: silver (nano) (0.0482ms)
  ✔ GATE-2 check 1: ketoconazole (0.1215ms)
  ✔ GATE-2 check 2: climbazole (0.0545ms)
  ✔ GATE-2 check 3: clotrimazole (0.0529ms)
  ✔ GATE-2 check 4: miconazole (0.1278ms)
  ✔ GATE-2 check 5: hydroquinone (0.2948ms)
  ✔ GATE-2 check 6: tretinoin (0.112ms)
  ✔ GATE-2 check 7: adapalene (0.0683ms)
  ✔ GATE-2 check 8: isotretinoin (0.0541ms)
  ✔ GATE-2 check 9: egf (0.1226ms)
  ✔ GATE-2 check 10: fgf (0.0661ms)
  ✔ GATE-2 check 11: erythromycin (0.071ms)
  ✔ GATE-2 check 12: clindamycin (0.0508ms)
  ✔ GATE-2 check 13: neomycin (0.0481ms)
  ✔ GATE-2 check 14: corticosteroids (0.046ms)
  ✔ GATE-2 check 15: hydrocortisone (0.0477ms)
  ✔ GATE-1 forma etykietowa (0.1821ms)
  ✔ GATE-1 brak falszywych trafien (0.1319ms)
  ✔ Safe ingredients (0.1256ms)
✔ V8 gate_ingredients (6.7713ms)
✔ V9 c2pa_check (0.1917ms)
✔ V10 freeze_sections (0.8499ms)
✔ V11 validate_eu_responsible_person (0.3856ms)
✔ V11 validate_eu_responsible_person - puste obiekty (0.0908ms)
✔ V11 validate_eu_responsible_person - zbyt dlugie pole (0.0759ms)
ℹ tests 80
ℹ suites 0
ℹ pass 80
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7919.73
```
