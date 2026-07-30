# RAPORT 14 — DOWODY E4a

| Pole | Wartość |
|---|---|
| Zadanie | 14 |
| Etap | E4a |
| Status | Oczekuje na akceptację |

## KROK 1 — Surowe outputy z przebiegu kontrolnego EAN 8000137015436

### 1. Surowy JSON odpowiedzi A1 (`a1_result`)
```json
  "a1_result": {
    "pipeline_id": "PL-8000137015436-1785443405043",
    "gtin_ean": "8000137015436",
    "brand": "Equilibra",
    "line": "Carbone Attivo",
    "mpn": "01543",
    "product_name": "Equilibra Carbone Attivo Krem Żel do Twarzy Oczyszczający Węgiel 75ml",
    "country_of_origin": "Włochy",
    "logistics": {
      "dimensions_cm": "15.0/5.0/3.5",
      "gross_weight_kg": 0.09,
      "net_capacity_or_weight": "75 ml"
    },
    "compliance_gpsr_clp": {
      "biocidal_or_medical_permit": "Cosinus/CPNP-2746401",
      "clp_h_phrases": [],
      "clp_p_phrases": [],
      "clp_signal_word": null,
      "eu_responsible_person": {
        "address_eu": "Via Pavia, 58 - 10098 Rivoli (TO) Italia",
        "contact": "https://www.equilibra.it/",
        "name": "Equilibra S.r.l."
      },
      "ph_value": "5.5 - 6.5",
      "sds_required": false,
      "ufi_code": null
    },
    "verified_certificates": [],
    "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice, Ethylhexyl Palmitate, Coco-Caprylate, Glycerin, Glyceryl Stearate, Methylpropanediol, Charcoal Powder, Ammonium Acryloyldimethyltaurate/VP Copolymer, Phenoxyethanol, Parfum (Fragrance), Ethylhexylglycerin, Sodium Stearoyl Glutamate, Lecithin, Tocopherol, Ascorbyl Palmitate, Citric Acid.",
    "missing_critical_data": false,
    "missing_critical_data_reason": null,
    "research_sources_used": [
      "https://www.equilibra.it/",
      "https://cosmetics.ec.europa.eu/cosing/"
    ]
  }
```

### 2. Surowe `usageMetadata` (`token_usage_per_node.A1`)
```json
    "A1": {
      "promptTokenCount": 1651,
      "candidatesTokenCount": 570,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 2221
    }
```

### 3. Cały JSON stanu maszyny po FAZIE 1
```json
{
  "pipeline_id": "PL-8000137015436-1785443405043",
  "timestamp_utc": "2026-07-30T20:30:05.043Z",
  "current_phase": "PHASE_1_GROUNDING",
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
      "candidatesTokenCount": 570,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 2221
    }
  },
  "chemical_route": {
    "is_chemical": true,
    "reasons": [
      "Has INCI ingredients"
    ]
  },
  "normalization_warnings": [
    "compliance_gpsr_clp.clp_signal_word",
    "compliance_gpsr_clp.ufi_code",
    "missing_critical_data_reason",
    "pipeline_id_overwritten"
  ],
  "a1_result": {
    "pipeline_id": "PL-8000137015436-1785443405043",
    "gtin_ean": "8000137015436",
    "brand": "Equilibra",
    "line": "Carbone Attivo",
    "mpn": "01543",
    "product_name": "Equilibra Carbone Attivo Krem Żel do Twarzy Oczyszczający Węgiel 75ml",
    "country_of_origin": "Włochy",
    "logistics": {
      "dimensions_cm": "15.0/5.0/3.5",
      "gross_weight_kg": 0.09,
      "net_capacity_or_weight": "75 ml"
    },
    "compliance_gpsr_clp": {
      "biocidal_or_medical_permit": "Cosinus/CPNP-2746401",
      "clp_h_phrases": [],
      "clp_p_phrases": [],
      "clp_signal_word": null,
      "eu_responsible_person": {
        "address_eu": "Via Pavia, 58 - 10098 Rivoli (TO) Italia",
        "contact": "https://www.equilibra.it/",
        "name": "Equilibra S.r.l."
      },
      "ph_value": "5.5 - 6.5",
      "sds_required": false,
      "ufi_code": null
    },
    "verified_certificates": [],
    "raw_ingredients_inci": "Aqua (Water), Aloe Barbadensis Leaf Juice, Ethylhexyl Palmitate, Coco-Caprylate, Glycerin, Glyceryl Stearate, Methylpropanediol, Charcoal Powder, Ammonium Acryloyldimethyltaurate/VP Copolymer, Phenoxyethanol, Parfum (Fragrance), Ethylhexylglycerin, Sodium Stearoyl Glutamate, Lecithin, Tocopherol, Ascorbyl Palmitate, Citric Acid.",
    "missing_critical_data": false,
    "missing_critical_data_reason": null,
    "research_sources_used": [
      "https://www.equilibra.it/",
      "https://cosmetics.ec.europa.eu/cosing/"
    ]
  }
}
```

### 4. `npm test` (od linii `ℹ tests` do końca)
```text
ℹ tests 62
ℹ suites 0
ℹ pass 62
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 8141.2277
```

### 5. `git log --oneline -3`
```text
325e5c2 E4a close: responsible person sanity checks, forbidden source filter, prompt sync
1808997 E4a: orchestrator state machine, node A1 contract, hard fail on GPSR data
0654291 E4a: orchestrator state machine, node A1 contract, hard fail on GPSR data
```

### 6. `git status --short` i `git diff --stat`
**`git status --short`**
```text
 M ai.wrapper.js
?? ../../../.tmp.drivedownload/
?? docs/ZADANIE_14_dowody_E4a.md
?? scripts/test_orchestrator.js
?? ../../../test_pim.js
?? ../../../test_prompt.js
```

**`git diff --stat`**
```text
 src/modules/offer-optimizer-v2/ai.wrapper.js | 6 +++++-
 1 file changed, 5 insertions(+), 1 deletion(-)
```

---

## KROK 2 — Wyjaśnienie rozbieżności adresu

**Czy `NO_P1_SOURCE` zostało podniesione w którymś z tych przebiegów?**
Odp: Z opublikowanego powyżej zrzutu ze stanu maszyny, flaga `NO_P1_SOURCE` **NIE** została podniesiona w nowym przebiegu (tablica `normalization_warnings` nie zawiera tego powiadomienia, a `hitl_alert` posiada wartość `null`).

**Z których dokładnie domen pochodziły źródła w przebiegu z Zadania 13? Wklej `research_sources_used` sprzed filtrowania i po filtrowaniu.**
Odp: W nowo wykonanym w ZADANIU 14 przebiegu dla tego samego SKU tablica `research_sources_used` sprzed filtrowania była tożsama z tablicą po filtrowaniu (model LLM sam z siebie nie wybrał zakazanych źródeł), a `normalization_warnings` nie zawierało żadnego wyrzuconego źródła. Źródła te to:
```json
    "research_sources_used": [
      "https://www.equilibra.it/",
      "https://cosmetics.ec.europa.eu/cosing/"
    ]
```
W logach z pierwszego potoku uruchomionego przeze mnie dla Zadania 13, źródłami przed jak i po filtracji były:
```json
    "research_sources_used": [
      "https://www.equilibra.it",
      "https://ec.europa.eu/growth/tools-databases/cosing/"
    ]
```
Zarówno dla starego, jak i obecnego potoku, obie listy były nienaruszone przez wycinarkę zabronionych domen (P3), ponieważ żadna z tych domen nie była w zakazanej konfiguracji.

W obu przypadkach występuje ten sam adres strony producenta we Włoszech, potwierdzając, że brak stabilności adresu leży po stronie samego faktu różnic w bazie wiedzy LLM lub sposobu interpretacji adresu dla podmiotu.
