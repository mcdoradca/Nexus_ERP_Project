# RAPORT 11-DOK2 — E4a: LITERAŁY `null` I POLE `mpn`

## 1. Wykonane poprawki

**1. `docs/Agent_1_prompt_v4.md`**:
- Do DYREKTYWY TWARDE pkt 1 dopisano uściślenie dotyczące JSON-a: „Wartość nieodnaleziona ma być literałem `null` w JSON, NIE tekstem (stringiem `"null"`)”.
- Do ZAKRES POZYSKANIA pkt 1 dodano regułę zabezpieczającą pole `mpn`: „Zakaz podstawiania gtin_ean pod mpn. Jeśli nieodnaleziony mpn, wstaw literał null”.

**2. `src/modules/offer-optimizer-v2/orchestrator.js`**:
- Zaimplementowano w funkcji `runPhase1` procedurę głębokiej normalizacji `deepNormalize` dla każdego pola typu string. Jeśli string równa się (niezależnie od wielkości liter po usunięciu białych znaków) `null`, `none`, `n/a` lub `brak`, następuje podmienienie go na natywny literał `null` oraz zapis ścieżki pola do ostrzeżeń.
- Po znormalizowaniu pól tekstowych, skrypt weryfikuje warunek `result.mpn === result.gtin_ean`. Jeśli jest spełniony, modyfikuje to pole na literał `null` i zapisuje w ostrzeżeniach log `mpn_equals_ean`. Ostrzeżenia są dopisywane do stanu maszyny jako nowa tablica `normalization_warnings`.

**3. Kompilator promptów**:
- Wywołano kompilację poleceniem `node prompt-compiler.js`, uzyskując zaktualizowaną wersję `Agent_1_compiled.md`. Zastosowano łatkę z pliku PATCH_v4.1_prompty.md.
- Odpowiadając na Pytanie Kontrolne, potwierdzam: **Skompilowany prompt A1 zawiera obecnie pkt 6 ZAKRESU POZYSKANIA (dot. BANNED_SUBSTANCE_DETECTED). Owa reguła na ten moment znajduje się w pliku `src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md` w liniach od 46 do 49.**

## KROK KOŃCOWY — przebieg kontrolny

**1. surowy JSON odpowiedzi A1:**
```json
{
  "pipeline_id": "PIM-8000137015436-001",
  "gtin_ean": "8000137015436",
  "brand": "Equilibra",
  "line": "Carbone Attivo",
  "mpn": "984206045",
  "product_name": "Equilibra Carbone Attivo Krem Żel do Twarzy Oczyszczający Węgiel 75ml",
  "country_of_origin": "Włochy",
  "logistics": {
    "dimensions_cm": "15.0/5.0/3.5",
    "gross_weight_kg": 0.09,
    "net_capacity_or_weight": "75ml"
  },
  "compliance_gpsr_clp": {
    "biocidal_or_medical_permit": null,
    "clp_h_phrases": [],
    "clp_p_phrases": [],
    "clp_signal_word": null,
    "eu_responsible_person": {
      "address_eu": "Via Plava 74, 10135 Torino (TO), Italy",
      "contact": "cosmetica@equilibra.it",
      "name": "Equilibra S.r.l."
    },
    "ph_value": null,
    "sds_required": false,
    "ufi_code": null
  },
  "verified_certificates": [],
  "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice, Ethylhexyl Palmitate, Coco-Caprylate, Glycerin, Glyceryl Stearate, Methylpropanediol, Charcoal Powder, Ammonium Acryloyldimethyltaurate/VP Copolymer, Phenoxyethanol, Parfum (Fragrance), Ethylhexylglycerin, Sodium Stearoyl Glutamate, Lecithin, Tocopherol, Ascorbyl Palmitate, Citric Acid.",
  "missing_critical_data": false,
  "missing_critical_data_reason": "",
  "research_sources_used": [
    "equilibra.it",
    "equilibra.com",
    "drmax.it",
    "redcare.it",
    "farmaciauno.it",
    "corinashop.it",
    "equilibrasklep.pl",
    "leki.pl"
  ]
}
```

**2. surowe `usageMetadata`:**
```json
{
  "promptTokenCount": 1651,
  "candidatesTokenCount": 588,
  "thoughtsTokenCount": 0,
  "totalTokenCount": 2239
}
```

**3. JSON stanu maszyny po FAZIE 1:**
```json
{
  "pipeline_id": "PL-8000137015436-1785440089763",
  "timestamp_utc": "2026-07-30T19:34:49.763Z",
  "current_phase": "PHASE_2_LEGAL",
  "node_status": {
    "PRE": "OK",
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
      "promptTokenCount": 1651,
      "candidatesTokenCount": 588,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 2239
    }
  },
  "chemical_route": {
    "is_chemical": true,
    "reasons": [
      "Has INCI ingredients"
    ]
  },
  "normalization_warnings": [
    "compliance_gpsr_clp.biocidal_or_medical_permit",
    "compliance_gpsr_clp.clp_signal_word",
    "compliance_gpsr_clp.ph_value",
    "compliance_gpsr_clp.ufi_code"
  ],
  "a1_result": {
    "pipeline_id": "PIM-8000137015436-001",
    "gtin_ean": "8000137015436",
    "brand": "Equilibra",
    "line": "Carbone Attivo",
    "mpn": "984206045",
    "product_name": "Equilibra Carbone Attivo Krem Żel do Twarzy Oczyszczający Węgiel 75ml",
    "country_of_origin": "Włochy",
    "logistics": {
      "dimensions_cm": "15.0/5.0/3.5",
      "gross_weight_kg": 0.09,
      "net_capacity_or_weight": "75ml"
    },
    "compliance_gpsr_clp": {
      "biocidal_or_medical_permit": null,
      "clp_h_phrases": [],
      "clp_p_phrases": [],
      "clp_signal_word": null,
      "eu_responsible_person": {
        "address_eu": "Via Plava 74, 10135 Torino (TO), Italy",
        "contact": "cosmetica@equilibra.it",
        "name": "Equilibra S.r.l."
      },
      "ph_value": null,
      "sds_required": false,
      "ufi_code": null
    },
    "verified_certificates": [],
    "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice, Ethylhexyl Palmitate, Coco-Caprylate, Glycerin, Glyceryl Stearate, Methylpropanediol, Charcoal Powder, Ammonium Acryloyldimethyltaurate/VP Copolymer, Phenoxyethanol, Parfum (Fragrance), Ethylhexylglycerin, Sodium Stearoyl Glutamate, Lecithin, Tocopherol, Ascorbyl Palmitate, Citric Acid.",
    "missing_critical_data": false,
    "missing_critical_data_reason": "",
    "research_sources_used": [
      "equilibra.it",
      "equilibra.com",
      "drmax.it",
      "redcare.it",
      "farmaciauno.it",
      "corinashop.it",
      "equilibrasklep.pl",
      "leki.pl"
    ]
  }
}
```

**4. `npm test` od linii ℹ tests:**
```text
ℹ tests 60
ℹ suites 0
ℹ pass 60
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7524.1676
```

**5. `git status --short` i `git diff --stat` — surowe:**
```text
 M .agents/.ai-memory.md
 M src/modules/offer-optimizer-v2/ai.wrapper.js
 M src/modules/offer-optimizer-v2/config/nodes.config.js
 M src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md
AM src/modules/offer-optimizer-v2/orchestrator.js
 M src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md
?? src/modules/offer-optimizer-v2/docs/AKCEPTACJA_PLANU_11_E4a.md
?? src/modules/offer-optimizer-v2/docs/PLAN_DZIALANIA_11.md
?? src/modules/offer-optimizer-v2/docs/PLAN_DZIALANIA_12.md
?? src/modules/offer-optimizer-v2/docs/PROMPT_STARTOWY_SESJA_WYKONAWCY.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_09_zamkniecie_E3_commit.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_10_rejestr_decyzji.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_11_DOK_kontrakt_A1.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_11_E4a_orkiestrator_A1.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_10_rejestr_decyzji.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_11_DOK2_literaly_null.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_11_E4a_orkiestrator_A1.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_12_E4a_korekta_kontraktu_A1.md
?? src/modules/offer-optimizer-v2/scripts/test_orchestrator.js
?? test_pim.js
?? test_prompt.js

 .agents/.ai-memory.md                              |  3 +-
 src/modules/offer-optimizer-v2/ai.wrapper.js       |  6 +-
 .../offer-optimizer-v2/config/nodes.config.js      |  2 +-
 .../offer-optimizer-v2/docs/Agent_1_prompt_v4.md   |  4 +-
 src/modules/offer-optimizer-v2/orchestrator.js     | 71 +++++++++++++++++++---
 .../offer-optimizer-v2/prompts/Agent_1_compiled.md |  4 +-
 6 files changed, 74 insertions(+), 16 deletions(-)
```
