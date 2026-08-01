# RAPORT ZADANIA 23 (Pochodzenie `line`, KONTROLA ŹRÓDEŁ)

Zgodnie z wymaganiami i Twoją akceptacją wykonano pełne wdrożenie polegające na: dodaniu znacznika źródłowego `source`, integracji atrybutu `line` bezpośrednio z danymi dostarczanymi z BaseLinkera, podwyższeniu standardów ochrony przed oszustwami w P1 oraz usunięciu martwych pętli dla atrapy danych. 

## 1. Zero wywołań BaseLinkera API
Zadanie to zrealizowano opierając się wyłącznie na plikach testowych lokalnych bez **żadnego wywołania** BaseLinkera w trybie API. Pula 78/78 testów jednostkowych pomyślnie kończy się statusem FAIL 0.

## 2. A1 Schema vs Wstrzyknięty Prompt (Hipoteza 4)
Hipoteza z punktu 4 potwierdzona w 100%. W kompilowanym prompcie modelu tkwią przestarzałe, zhardcodowane instrukcje podyktowane przed obcięciem responseSchema.

Dokładna lokalizacja:
**`src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md:36` (Sekcja WYJŚCIE)**
```markdown
36: ## WYJŚCIE
37: JSON wg responseSchema. Pola: pipeline_id, gtin_ean, brand, line, product_name,
38: country_of_origin, logistics{}, compliance_gpsr_clp{}, verified_certificates[],
39: raw_ingredients_inci, missing_critical_data, research_sources_used[].
```
Stąd model uporczywie odsyłał stare wartości jak `gtin_ean`, czy `mpn`. Zgodnie z decyzją, nie dotykałem pliku źródłowego V4. Decyzję o łataniu kompilatora pozostawiam Tobie.

## 3. Usage Metadata A1
Z pozyskanych danych symulacyjnych (`state_PL-8000137015436...`), token usage A1 wygląda następująco:
```json
  "token_usage_per_node": {
    "A1": {
      "promptTokenCount": 1508,
      "candidatesTokenCount": 94,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 1602
    }
  }
```

## 4. Git diff --stat i git status --short

```bash
 M .agents/.ai-memory.md
 M src/modules/offer-optimizer-v2/baselinker.extract.config.json
 M src/modules/offer-optimizer-v2/baselinker.extract.js
 M src/modules/offer-optimizer-v2/config/nodes.config.js
 M src/modules/offer-optimizer-v2/orchestrator.js
 M src/modules/offer-optimizer-v2/tests/baselinker.extract.test.js
 M src/modules/offer-optimizer-v2/tests/orchestrator.test.js
---
 .agents/.ai-memory.md                              |   2 +
 .../baselinker.extract.config.json                 |   3 +-
 .../offer-optimizer-v2/baselinker.extract.js       |  14 +-
 .../offer-optimizer-v2/config/nodes.config.js      |   5 +-
 src/modules/offer-optimizer-v2/orchestrator.js     | 239 +++++++++++++--------
 .../tests/baselinker.extract.test.js               |  14 ++
 .../offer-optimizer-v2/tests/orchestrator.test.js  | 150 +++++++++++--
 7 files changed, 316 insertions(+), 111 deletions(-)
```

## 5. Zrzut Pełnych Stanów Maszyny
Poniżej nietknięte zrzuty JSON potwierdzające prawidłowe znakowanie flagi `source`, zachowanie `matched_key` na swoim poziomie oraz ostrzeżenie z braku P1, zbudowane na bazie podmiotu "Equilibra srl". Dodany klucz "Linia" omija zapytania LLM w modelu syntetycznym. Oczywiście Equilibra również ponowiła halucynację: wymyśliła linię `Purifying Active Charcoal` (ponieważ oryginalny BaseLinker jej nie miał więc przeszła zapytanie na A1).

### Stan: Trimay (Ekstrakcja przerwana przez brak Danych Prawnych)
```json
{
  "pipeline_id": "PL-8809822541010-1785496091467",
  "timestamp_utc": "2026-07-31T11:08:11.467Z",
  "current_phase": "PHASE_1_GROUNDING",
  "node_status": {
    "EXTRACT": "HALTED_HITL_REQUIRED"
  },
  "revision_loop_count": 0,
  "next_action": "HALT",
  "hitl_alert": "MISSING_EU_RESPONSIBLE_PERSON",
  "frozen_hashes": {
    "s3": null,
    "s5": null,
    "s6": null
  },
  "token_usage_per_node": {},
  "extracted_data": {
    "inci": {
      "value": "Water, Glycerin, Niacinamide, Carrageenan, Butylene Glycol, Ceratonia Siliqua (Carob) Gum, Pentylene Glycol, PEG-60 Hy drogenated Castor Oil, Ethyl Hexanediol, Hexylene Glycol, Potassium Chloride, Pinus Sylvestris Leaf Extract, Sucrose, Calcium Lacta te, Allantoin, Cyamopsis Tetragonoloba (Guar) Gum, Cellulose Gum, Chlorphenesin, Hydroxyacetophenone, Calcium Chloride, 1,2 Hexanediol, Illicium Verum (Anise) Fruit Extract, Dipotassium Glycyrrhizate, Ethylhexylglycerin, Propanediol, Disodium EDTA, Frag rance, Arginine, Melia Azadirachta Flower Extract, Ocimum Sanctum Leaf Extract, Melia Azadirachta Leaf Extract, Caprylyl Glycol, Cu rauma Longa (Turmeric) Root Extract, Corallina Officinalis Extract, Ascorbic Acid, Tranexamic Acid, Ethyl Ascorbyl Ether, Nelumbo Nu cifera Callus Culture Extract, Brassica Oleracea Capitata (Cabbage) Leaf Extract, Brassica Oleracea Italica (Broccoli) Extract, Solanum Lycopersicum (Tomato) Fruit Extract, Citrus Junos Fruit Extract, Polysorbate 80, Hippophae Rhamnoides Fruit Extract, Tocopheryl A cetate, Ubiquinone, Sodium Hyaluronate",
      "source": "baselinker",
      "matched_key": "Ingredients / INCI"
    },
    "mpn": {
      "value": "8809822541010",
      "source": "baselinker",
      "matched_key": "Kod producenta"
    },
    "brand": {
      "value": "TRIMAY",
      "source": "baselinker",
      "matched_key": "Brand"
    },
    "capacity": {
      "value": "60 szt.",
      "source": "baselinker",
      "matched_key": "Capacity"
    },
    "usage": {
      "value": "Po oczyszczeniu skóry nałóż płatki żelowe na obszary wymagające szczególnej pielęgnacji (np. pod oczami, w miejscu zmarszczek mimicznych). Pozostaw na 15 minut, następnie usuń i wyrzuć zużyty produkt. Delikatnie wklep pozostałe serum w skórę.",
      "source": "baselinker",
      "matched_key": "Usage instructions"
    },
    "warnings": {
      "value": "Przechowywać poza zasięgiem dzieci. Nie połykać. Unikać kontaktu z oczami.",
      "source": "baselinker",
      "matched_key": "Warnings"
    },
    "line": {
      "value": null,
      "source": null,
      "matched_key": null
    },
    "truncated": false,
    "recovered_keys": [],
    "eu_responsible_person": {
      "source": null,
      "data": {
        "name": null,
        "address_eu": null,
        "contact": null,
        "raw_fragment": null
      }
    },
    "product_name": {
      "value": "Trimay Hydrożelowe płatki pod oczy Vita Bright 60 szt.",
      "source": "baselinker",
      "matched_key": null
    }
  }
}
```

### Stan: Equilibra (Przetworzone z A1 i P1 Checks)
```json
{
  "pipeline_id": "PL-8000137015436-1785496091471",
  "timestamp_utc": "2026-07-31T11:08:11.471Z",
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
      "promptTokenCount": 1508,
      "candidatesTokenCount": 94,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 1602
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
    "mpn_equals_ean",
    "NO_P1_SOURCE",
    "pipeline_id_overwritten",
    "A1_FIELD_REJECTED: mpn",
    "A1_FIELD_REJECTED: pipeline_id"
  ],
  "a1_result": {
    "line": {
      "value": "Purifying Active Charcoal",
      "source": "a1"
    },
    "product_name": {
      "value": "Oczyszczający krem-żel do twarzy z aktywnym węglem 75ml",
      "source": "a1"
    },
    "country_of_origin": {
      "value": "IT",
      "source": "a1"
    },
    "research_sources_used": {
      "value": [
        "https://www.collistar.com",
        "https://www.cliven.it",
        "https://ec.europa.eu/growth/tools-databases/cosing/"
      ],
      "source": "a1"
    }
  }
}
```
