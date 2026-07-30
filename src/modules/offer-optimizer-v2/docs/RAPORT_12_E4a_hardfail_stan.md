# RAPORT 12 — E4a ZAMKNIĘCIE: HARD FAIL, SPÓJNOŚĆ STANU, REJESTR DECYZJI

## ZALICZENIE ZADANIA 12

Wszystkie kroki zostały w pełni zrealizowane:
1. Zaimplementowano Hard Fail wymuszany kodem wewnątrz `orchestrator.js` dla węzła A1. Model stracił monopol na przepuszczanie potoku z nieskompletnymi danymi prawnymi. Orkiestrator rzuca `HALTED_HITL_REQUIRED` w przypadku niespełnienia obwarowań GPSR.
2. Zsynchronizowano spójność stanu maszyny: naprawiono usterkę, przez którą faza 1 zmieniała się na prawną, usunięto puste stringi (takie jak we fladze reason) używając `deepNormalize` poprzez przypisanie im literału `null`, a także dodano nadpisywanie `pipeline_id` na ID sesyjne (zgłaszając ten fakt do `normalization_warnings`).
3. Zaktualizowano `DECISION_LOG.md` o dwa nowe rekordy decyzyjne z rygorem dla D15 (brak możliwości cięcia GPSR/CLP/INCI w PIM payloadzie) i D16 (ryzyko Prisma Drift w connection wrapperze).
4. Przetestowano zachowanie błędu i przeprowadzono wdrożenie kontrolne. 

---

## 1. Surowy JSON odpowiedzi A1

*(Zwróć uwagę na objaw 108: model w `eu_responsible_person.name` umieścił ogromny tekst halucynacyjny w celu wpisania wszystkiego w 1 klucz! Skutkowało to brakiem klucza `contact` i `address_eu`. Dzięki wdrożonemu w tym zadaniu mechanizmowi Hard Fail na poziomie kodu, potok zadziałał poprawnie i zatrzymał procesowanie z powodu braku wymaganych pól GPSR!)*

```json
{
  "pipeline_id": "PL-8000137015436-1785440660654",
  "gtin_ean": "8000137015436",
  "brand": "Equilibra",
  "line": "Carbone Attivo",
  "mpn": "MAGAP-24-15436",
  "product_name": "Equilibra Carbone Attivo Krem Żel do Twarzy Oczyszczający Węgiel 75ml",
  "country_of_origin": "Włochy",
  "logistics": {
    "dimensions_cm": "15.0/5.0/3.5",
    "gross_weight_kg": 0.09,
    "net_capacity_or_weight": "75 ml"
  },
  "compliance_gpsr_clp": {
    "biocidal_or_medical_permit": null,
    "clp_h_phrases": [],
    "clp_p_phrases": [],
    "clp_signal_word": null,
    "eu_responsible_person": {
      "name": "Equilibra S.r.l. (Unilever Group Office/Affiliate Branch in Italy or Manufacturer Representative in EU for Equilibra Line of Products under original ownership status of Equilibra Brand S.r.l. or APS Import-Export Sp. z o.o.) via parent entity brand name registration office address in Italy under Art.16 obligations for cosmetic distribution lines in the internal EU market under parent status of manufacture operations or registered distributor standard offices and contact forms for queries under compliance terms). Registered under brand structure address below: Equilibra s.r.l. (and associated distributors as applicable on labelling in Poland including representative distributor APS Import-Export Sp. z o.o.) under legal manufacturing address listed at Torino Office Head Site below for user/market compliance: Equilibra S.r.l. via Plava 74, 10135 Torino (TO), Italy. Local PL Representative Address: APS Import-Export Sp. z o.o., Al. Wincentego Witosa 3, 20-315 Lublin, Poland. Direct Brand Support Contact Address: privacy@equilibra.it / reclamiecommerce@equilibra.it / APS Import-Export Sp. z o.o. contact channels on regional market portal links including www.equilibrasklep.pl brand representative pages. This guarantees GPSR/CLP compliant identification records on labelling registration formats within internal EU market zones under Article 16 of GPSR regulatory measures for cosmetic trade rules. Address list of responsible brand entity follows exactly as published: Equilibra s.r.l., via Plava, 74, 10135 Torino (TO), Italy. Contact: reclamiecommerce@equilibra.it / privacy@equilibra.it / standard brand phone (+39) 800 01 78 74 / local PL distributor APS Import-Export Sp. z o.o., Al. Wincentego Witosa 3, 20-315 Lublin, Poland / info@equilibrasklep.pl / contact web portal support systems: www.equilibra.it / www.equilibrasklep.pl website portals for customer protection under safety requirements standard templates inside EU territory limit maps under regulation standard formats for cosmetics distribution tracks on commercial lines under trade policy rules within EU boundaries. Address parameters exactly match registered commercial data matching corporate office registry data standard formats below for official representation models: Equilibra S.r.l., Via Plava 74, 10135 Torino, Italy. Email address contact registered for safety queries: privacy@equilibra.it / reclamiecommerce@equilibra.it / distributor representative channels: APS Import-Export Sp. z o.o., Al. Wincentego Witosa 3, 20-315 Lublin, Poland, email: info@equilibrasklep.pl / office web: www.equilibrasklep.pl direct support online panels under current valid legislation formats on European Union cosmetic lists of responsibilities for market placements. Registered trade lines parameters: Equilibra S.r.l., Via Plava 74, 10135 Torino, Italy. Contact email address info: privacy@equilibra.it / reclamiecommerce@equilibra.it. Local PL distributor details: APS Import-Export Sp. z o.o., Al. Wincentego Witosa 3, 20-315 Lublin, Poland, email contact info: info@equilibrasklep.pl. Registered brand web contacts: www.equilibra.it / www.equilibrasklep.pl. Addresses and online contact channels matches completely all of GPSR obligations for cosmetological lines of products within the European single market area definitions. Active on labelling lists as shown below in full detail compliance records: Name: Equilibra S.r.l. (Brand Corporate Office Head Site) + APS Import-Export Sp. z o.o. (Local PL Distributor Representative). Address: Via Plava 74, 10135 Torino, Italy (Corporate) & Al. Wincentego Witosa 3, 20-315 Lublin, Poland (Local). Contact: privacy@equilibra.it / reclamiecommerce@equilibra.it / info@equilibrasklep.pl / www.equilibra.it / www.equilibrasklep.pl. Standard compliance format verified details match completely all the structural components of the regulatory frameworks under Article 16 requirements list formats. Name: Equilibra S.r.l. (Unilever Group brand entity / manufacturer). Address: Via Plava 74, 10135 Torino, Italy. Contact email: privacy@equilibra.it / reclamiecommerce@equilibra.it / phone: (+39) 800 01 78 74 / web: www.equilibra.it. Local representative in EU/PL market: APS Import-Export Sp. z o.o., Al. Wincentego Witosa 3, 20-315 Lublin, Poland (contact web: www.equilibrasklep.pl). Address fields matched correctly for direct registration lists. Representative details matches full requirements: Name: Equilibra S.r.l. (Brand manufacturer) & APS Import-Export Sp. z o.o. (Authorized Distributor Representative in Poland). Address: Via Plava 74, 10135 Torino, Italy (Equilibra S.r.l.) and Al. Wincentego Witosa 3, 20-315 Lublin, Poland (APS). Contact: privacy@equilibra.it, reclamiecommerce@equilibra.it, info@equilibrasklep.pl, www.equilibra.it, www.equilibrasklep.pl. Exactly as registered for GPSR compliance safety checks."
    },
    "ph_value": null,
    "sds_required": false,
    "ufi_code": null
  },
  "verified_certificates": [],
  "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice, Ethylhexyl Palmitate, Coco-Caprylate, Glycerin, Glyceryl Stearate, Methylpropanediol, Charcoal Powder, Ammonium Acryloyldimethyltaurate/VP Copolymer, Phenoxyethanol, Parfum (Fragrance), Ethylhexylglycerin, Sodium Stearoyl Glutamate, Lecithin, Tocopherol, Ascorbyl Palmitate, Citric Acid.",
  "missing_critical_data": false,
  "missing_critical_data_reason": null,
  "research_sources_used": [
    "allegro.pl",
    "equilibrasklep.pl",
    "equilibra.it",
    "ufficiocamerale.it",
    "leki.pl",
    "creditsafe.com",
    "empik.com"
  ]
}
```

## 2. Surowe usageMetadata
```json
{
  "promptTokenCount": 1651,
  "candidatesTokenCount": 1768,
  "thoughtsTokenCount": 0,
  "totalTokenCount": 3419
}
```

## 3. CAŁY JSON stanu maszyny po FAZIE 1
```json
{
  "pipeline_id": "PL-8000137015436-1785440660654",
  "timestamp_utc": "2026-07-30T19:44:20.655Z",
  "current_phase": "PHASE_1_GROUNDING",
  "node_status": {
    "PRE": "OK",
    "A1": "HALTED_HITL_REQUIRED"
  },
  "revision_loop_count": 0,
  "next_action": "HALT",
  "hitl_alert": "MISSING_EU_RESPONSIBLE_PERSON",
  "frozen_hashes": {
    "s3": null,
    "s5": null,
    "s6": null
  },
  "token_usage_per_node": {
    "A1": {
      "promptTokenCount": 1651,
      "candidatesTokenCount": 1768,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 3419
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
    "compliance_gpsr_clp.ufi_code",
    "missing_critical_data_reason",
    "pipeline_id_overwritten"
  ],
  "a1_result": {
    "pipeline_id": "PL-8000137015436-1785440660654",
    "gtin_ean": "8000137015436",
    "brand": "Equilibra",
    "line": "Carbone Attivo",
    "mpn": "MAGAP-24-15436",
    "product_name": "Equilibra Carbone Attivo Krem Żel do Twarzy Oczyszczający Węgiel 75ml",
    "country_of_origin": "Włochy",
    "logistics": {
      "dimensions_cm": "15.0/5.0/3.5",
      "gross_weight_kg": 0.09,
      "net_capacity_or_weight": "75 ml"
    },
    "compliance_gpsr_clp": {
      "biocidal_or_medical_permit": null,
      "clp_h_phrases": [],
      "clp_p_phrases": [],
      "clp_signal_word": null,
      "eu_responsible_person": {
        "name": "Equilibra S.r.l. (Unilever Group Office/Affiliate Branch in Italy or Manufacturer Representative in EU for Equilibra Line of Products under original ownership status of Equilibra Brand S.r.l. or APS Import-Export Sp. z o.o.) via parent entity brand name registration office address in Italy under Art.16 obligations for cosmetic distribution lines in the internal EU market under parent status of manufacture operations or registered distributor standard offices and contact forms for queries under compliance terms). Registered under brand structure address below: Equilibra s.r.l. (and associated distributors as applicable on labelling in Poland including representative distributor APS Import-Export Sp. z o.o.) under legal manufacturing address listed at Torino Office Head Site below for user/market compliance: Equilibra S.r.l. via Plava 74, 10135 Torino (TO), Italy. Local PL Representative Address: APS Import-Export Sp. z o.o., Al. Wincentego Witosa 3, 20-315 Lublin, Poland. Direct Brand Support Contact Address: privacy@equilibra.it / reclamiecommerce@equilibra.it / APS Import-Export Sp. z o.o. contact channels on regional market portal links including www.equilibrasklep.pl brand representative pages. This guarantees GPSR/CLP compliant identification records on labelling registration formats within internal EU market zones under Article 16 of GPSR regulatory measures for cosmetic trade rules. Address list of responsible brand entity follows exactly as published: Equilibra s.r.l., via Plava, 74, 10135 Torino (TO), Italy. Contact: reclamiecommerce@equilibra.it / privacy@equilibra.it / standard brand phone (+39) 800 01 78 74 / local PL distributor APS Import-Export Sp. z o.o., Al. Wincentego Witosa 3, 20-315 Lublin, Poland / info@equilibrasklep.pl / contact web portal support systems: www.equilibra.it / www.equilibrasklep.pl website portals for customer protection under safety requirements standard templates inside EU territory limit maps under regulation standard formats for cosmetics distribution tracks on commercial lines under trade policy rules within EU boundaries. Address parameters exactly match registered commercial data matching corporate office registry data standard formats below for official representation models: Equilibra S.r.l., Via Plava 74, 10135 Torino, Italy. Email address contact registered for safety queries: privacy@equilibra.it / reclamiecommerce@equilibra.it / distributor representative channels: APS Import-Export Sp. z o.o., Al. Wincentego Witosa 3, 20-315 Lublin, Poland, email: info@equilibrasklep.pl / office web: www.equilibrasklep.pl direct support online panels under current valid legislation formats on European Union cosmetic lists of responsibilities for market placements. Registered trade lines parameters: Equilibra S.r.l., Via Plava 74, 10135 Torino, Italy. Contact email address info: privacy@equilibra.it / reclamiecommerce@equilibra.it. Local PL distributor details: APS Import-Export Sp. z o.o., Al. Wincentego Witosa 3, 20-315 Lublin, Poland, email contact info: info@equilibrasklep.pl. Registered brand web contacts: www.equilibra.it / www.equilibrasklep.pl. Addresses and online contact channels matches completely all of GPSR obligations for cosmetological lines of products within the European single market area definitions. Active on labelling lists as shown below in full detail compliance records: Name: Equilibra S.r.l. (Brand Corporate Office Head Site) + APS Import-Export Sp. z o.o. (Local PL Distributor Representative). Address: Via Plava 74, 10135 Torino, Italy (Corporate) & Al. Wincentego Witosa 3, 20-315 Lublin, Poland (Local). Contact: privacy@equilibra.it / reclamiecommerce@equilibra.it / info@equilibrasklep.pl / www.equilibra.it / www.equilibrasklep.pl. Standard compliance format verified details match completely all the structural components of the regulatory frameworks under Article 16 requirements list formats. Name: Equilibra S.r.l. (Unilever Group brand entity / manufacturer). Address: Via Plava 74, 10135 Torino, Italy. Contact email: privacy@equilibra.it / reclamiecommerce@equilibra.it / phone: (+39) 800 01 78 74 / web: www.equilibra.it. Local representative in EU/PL market: APS Import-Export Sp. z o.o., Al. Wincentego Witosa 3, 20-315 Lublin, Poland (contact web: www.equilibrasklep.pl). Address fields matched correctly for direct registration lists. Representative details matches full requirements: Name: Equilibra S.r.l. (Brand manufacturer) & APS Import-Export Sp. z o.o. (Authorized Distributor Representative in Poland). Address: Via Plava 74, 10135 Torino, Italy (Equilibra S.r.l.) and Al. Wincentego Witosa 3, 20-315 Lublin, Poland (APS). Contact: privacy@equilibra.it, reclamiecommerce@equilibra.it, info@equilibrasklep.pl, www.equilibra.it, www.equilibrasklep.pl. Exactly as registered for GPSR compliance safety checks."
      },
      "ph_value": null,
      "sds_required": false,
      "ufi_code": null
    },
    "verified_certificates": [],
    "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice, Ethylhexyl Palmitate, Coco-Caprylate, Glycerin, Glyceryl Stearate, Methylpropanediol, Charcoal Powder, Ammonium Acryloyldimethyltaurate/VP Copolymer, Phenoxyethanol, Parfum (Fragrance), Ethylhexylglycerin, Sodium Stearoyl Glutamate, Lecithin, Tocopherol, Ascorbyl Palmitate, Citric Acid.",
    "missing_critical_data": false,
    "missing_critical_data_reason": null,
    "research_sources_used": [
      "allegro.pl",
      "equilibrasklep.pl",
      "equilibra.it",
      "ufficiocamerale.it",
      "leki.pl",
      "creditsafe.com",
      "empik.com"
    ]
  }
}
```

## 4. `npm test`
```text
ℹ tests 61
ℹ suites 0
ℹ pass 61
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 6853.7711
```

## 5. `git log --oneline -2`
```text
1808997 (HEAD -> master) E4a: orchestrator state machine, node A1 contract, hard fail on GPSR data
0654291 E4a: orchestrator state machine, node A1 contract, hard fail on GPSR data
```

## 6. `git status --short` i `git diff --stat` — surowe
```text
 M .agents/.ai-memory.md
 M src/modules/offer-optimizer-v2/ai.wrapper.js
 M src/modules/offer-optimizer-v2/config/nodes.config.js
 M src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md
 M src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md
?? src/modules/offer-optimizer-v2/docs/AKCEPTACJA_PLANU_11_E4a.md
?? src/modules/offer-optimizer-v2/docs/PLAN_DZIALANIA_11.md
?? src/modules/offer-optimizer-v2/docs/PLAN_DZIALANIA_12.md
?? src/modules/offer-optimizer-v2/docs/PROMPT_STARTOWY_SESJA_WYKONAWCY.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_09_zamkniecie_E3_commit.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_10_rejestr_decyzji.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_11_DOK2_literaly_null.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_11_DOK_kontrakt_A1.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_11_E4a_orkiestrator_A1.md
?? src/modules/offer-optimizer-v2/docs/RAPORT_12_E4a_hardfail_stan.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_10_rejestr_decyzji.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_11_DOK2_literaly_null.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_11_E4a_orkiestrator_A1.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_12_E4a_hardfail_stan.md
?? src/modules/offer-optimizer-v2/docs/ZADANIE_12_E4a_korekta_kontraktu_A1.md
?? src/modules/offer-optimizer-v2/scripts/test_orchestrator.js
?? test_pim.js
?? test_prompt.js

 .agents/.ai-memory.md                                      | 3 ++-
 src/modules/offer-optimizer-v2/ai.wrapper.js               | 6 +++++-
 src/modules/offer-optimizer-v2/config/nodes.config.js      | 2 +-
 src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md   | 4 ++--
 src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md | 4 ++--
 5 files changed, 12 insertions(+), 7 deletions(-)
```
