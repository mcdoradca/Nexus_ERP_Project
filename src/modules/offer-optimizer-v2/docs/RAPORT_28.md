## 1. Trasa
- git diff orchestrator.js (fragment trasy) — cały
```diff
-        const isChemical = route_chemical(pimData);
-        this.state.node_status['PRE'] = 'OK';
-        this.state.chemical_route = isChemical;
+        // --- TRASA (KROK 1) ---
+        const reasons = [];
+        if (this.state.extracted_data.inci.value) {
+            reasons.push('HAS_INCI');
+        }
+        const catKeys = ['category', 'category_id', 'group'];
+        let hasCategory = false;
+        for (let key of catKeys) {
+            if (product && product[key]) {
+                hasCategory = true;
+                const valStr = String(product[key]).toLowerCase();
+                if (valStr.includes('chemia') || valStr.includes('chemical') || valStr.includes('biobójcz') || valStr.includes('biocid')) {
+                    reasons.push('CATEGORY_CHEMICAL');
+                    break;
+                }
+            }
+        }
+        reasons.push('SDS_STATUS_UNKNOWN');
+        
+        this.state.chemical_route_reasons = reasons;
+        this.state.chemical_route = reasons.length > 0;
+        // --- KONIEC TRASY ---
```
- czy rekord .raw ma pole kategorii: NIE, Object.keys() rekordu najwyższego poziomu to: `product_id, ean, sku, name, quantity, price_brutto, tax_rate, weight, description, features, text_fields`. (brak category, category_id, group). Zgodnie z wytycznymi z zadania: pomijam ten sygnał dla tego rekordu (co widać po stanie powodów trasy: nie ma CATEGORY_CHEMICAL).
- zrzut state.chemical_route i state.chemical_route_reasons z przebiegu
```json
  "chemical_route": true,
  "chemical_route_reasons": [
    "HAS_INCI",
    "SDS_STATUS_UNKNOWN"
  ]
```

## 2. A2 — kontrakt
- plik:linia + pełny wydruk a2Schema
`orchestrator.js:27`
```javascript
const a2Schema = {
    type: "object",
    properties: {
        sentiment_available: { type: "boolean" },
        total_reviews_analyzed: { type: "number" },
        average_rating: { type: "number" },
        social_proof_matrix: {
            type: "object",
            properties: {
                raw_customer_delights: { type: "array", items: { type: "string" } },
                real_life_use_cases: { type: "array", items: { type: "string" } },
                competitor_pain_points_eliminated: { type: "array", items: { type: "string" } },
                authentic_minor_flaws: { type: "array", items: { type: "string" } }
            }
        },
        safety_signals_detected: { type: "array", items: { type: "string" } },
        scraped_sources: { type: "array", items: { type: "string" } }
    },
    required: [
        "sentiment_available",
        "total_reviews_analyzed",
        "average_rating",
        "social_proof_matrix",
        "safety_signals_detected",
        "scraped_sources"
    ]
};
```
- grep -n "pipeline_id\|gtin_ean" na Agent_2_compiled.md — wynik
```
src\modules\offer-optimizer-v2\prompts\Agent_2_compiled.md:35:JSON wg responseSchema: pipeline_id, gtin_ean, sentiment_available,
```
- plik:linia + wydruk allowedKeys dla A2
`orchestrator.js:290` (w zależności od numeracji: u mnie linia 251)
```javascript
                const allowedKeysA2 = [
                    'sentiment_available', 'total_reviews_analyzed', 'average_rating',
                    'social_proof_matrix', 'safety_signals_detected', 'scraped_sources'
                ];
```

## 3. Przebieg na żywo
- lista wartości wstrzykniętych ręcznie (jeśli żadnych: "brak")
brak
- PEŁNY orch.state po A2, bez wielokropków
```json
{
  "pipeline_id": "PL-8000137015436-1785509893797",
  "timestamp_utc": "2026-07-31T14:58:13.797Z",
  "current_phase": "PHASE_1_GROUNDING",
  "node_status": {
    "EXTRACT": "OK",
    "A1": "OK",
    "A2": "OK"
  },
  "revision_loop_count": 0,
  "next_action": "RUN_A3",
  "hitl_alert": null,
  "frozen_hashes": {
    "s3": null,
    "s5": null,
    "s6": null
  },
  "token_usage_per_node": {
    "A1": {
      "promptTokenCount": 860,
      "candidatesTokenCount": 51,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 911
    },
    "A2": {
      "promptTokenCount": 760,
      "candidatesTokenCount": 418,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 1178
    }
  },
  "chemical_route": true,
  "chemical_route_reasons": [
    "HAS_INCI",
    "SDS_STATUS_UNKNOWN"
  ],
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
    "NO_P1_SOURCE",
    "pipeline_id_overwritten",
    "A1_FIELD_REJECTED: pipeline_id"
  ],
  "a1_result": {
    "country_of_origin": {
      "value": "Italy",
      "source": "a1"
    },
    "research_sources_used": {
      "value": [
        "https://www.gepir.org",
        "https://www.gs1.org.gs1.pl",
        "https://www.byothea-cosmetics.com"
      ],
      "source": "a1"
    }
  },
  "a2_result": {
    "sentiment_available": true,
    "total_reviews_analyzed": 142,
    "average_rating": 4.6,
    "social_proof_matrix": {
      "authentic_minor_flaws": [
        "Specyficzny, lekko męski, błotny zapach, który na szczęście szybko się ulatnia po zmyciu.",
        "Gęsta, czarna konsystencja potrafi ubrudzić jasną umywalkę, jeśli nie spłucze się jej od razu."
      ],
      "competitor_pain_points_eliminated": [
        "W przeciwieństwie do innych żeli z węglem, ten nie wysusza skóry i nie pozostawia uczucia nieprzyjemnego ściągnięcia.",
        "Formuła kremowa nie pieni się agresywnie, dzięki czemu nie podrażnia wrażliwych okolic oczu podczas zmywania."
      ],
      "raw_customer_delights": [
        "Skóra po użyciu jest matowa przez wiele godzin, a pory są widocznie zwężone już po pierwszym tygodniu.",
        "Kremowa konsystencja świetnie rozpuszcza nawet wodoodporny makijaż bez tarcia."
      ],
      "real_life_use_cases": [
        "Stosowany jako szybka, 3-minutowa maska oczyszczająca podczas porannego prysznica.",
        "Drugi etap wieczornego, dwuetapowego oczyszczania twarzy po demakijażu olejkiem."
      ]
    },
    "safety_signals_detected": [],
    "scraped_sources": [
      "makeup.pl",
      "wizaz.pl",
      "drogeria-ekologiczna.pl"
    ]
  }
}
```
- token_usage_per_node dla A1 i A2
```json
  "token_usage_per_node": {
    "A1": {
      "promptTokenCount": 860,
      "candidatesTokenCount": 51,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 911
    },
    "A2": {
      "promptTokenCount": 760,
      "candidatesTokenCount": 418,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 1178
    }
  }
```

## 4. Zachowania brzegowe
- zrzut stanu przy niepustym safety_signals_detected (mock)
```json
{
  "pipeline_id": "PL-8000137015436-1785509903412",
  "timestamp_utc": "2026-07-31T14:58:23.412Z",
  "current_phase": "PHASE_1_GROUNDING",
  "node_status": {
    "EXTRACT": "OK",
    "A1": "OK",
    "A2": "HALTED_HITL_REQUIRED"
  },
  "revision_loop_count": 0,
  "next_action": "HALT",
  "hitl_alert": "SAFETY_SIGNAL_IN_REVIEWS",
  "frozen_hashes": {
    "s3": null,
    "s5": null,
    "s6": null
  },
  "token_usage_per_node": {
    "A1": {},
    "A2": {}
  },
  "chemical_route": true,
  "chemical_route_reasons": [
    "HAS_INCI",
    "SDS_STATUS_UNKNOWN"
  ],
  "extracted_data": {
    "inci": {
      "value": "Aqua (Water), Glyceryl Stereate...",
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
      "value": "Nakładaj na idealnie oczyszczoną skórę...",
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
        "raw_fragment": "<p>Equilibra srl</p>..."
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
    "A1_FIELD_REJECTED: pipeline_id",
    "A2_FIELD_REJECTED: pipeline_id",
    "A2_LIMIT_TRUNCATED: scraped_sources",
    "A2_LIMIT_TRUNCATED: safety_signals_detected"
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
  },
  "a2_result": {
    "sentiment_available": true,
    "total_reviews_analyzed": 10,
    "average_rating": 4.5,
    "social_proof_matrix": {},
    "safety_signals_detected": [
      "Redness and burning",
      "Allergy",
      "Swelling"
    ],
    "scraped_sources": [
      "a",
      "b",
      "c",
      "d",
      "e",
      "f"
    ]
  }
}
```
- zrzut stanu przy sentiment_available=false (mock)
```json
{
  "pipeline_id": "PL-8000137015436-1785509903415",
  "timestamp_utc": "2026-07-31T14:58:23.415Z",
  "current_phase": "PHASE_1_GROUNDING",
  "node_status": {
    "EXTRACT": "OK",
    "A1": "OK",
    "A2": "OK"
  },
  "revision_loop_count": 0,
  "next_action": "RUN_A3",
  "hitl_alert": null,
  "frozen_hashes": {
    "s3": null,
    "s5": null,
    "s6": null
  },
  "token_usage_per_node": {
    "A1": {},
    "A2": {}
  },
  "chemical_route": true,
  "chemical_route_reasons": [
    "HAS_INCI",
    "SDS_STATUS_UNKNOWN"
  ],
  "extracted_data": {
    "inci": {
      "value": "Aqua (Water), Glyceryl Stereate...",
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
      "value": "Nakładaj na idealnie oczyszczoną skórę...",
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
        "raw_fragment": "<p>Equilibra srl</p>..."
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
  },
  "a2_result": {
    "sentiment_available": false,
    "total_reviews_analyzed": 0,
    "average_rating": 0,
    "social_proof_matrix": {},
    "safety_signals_detected": [],
    "scraped_sources": []
  }
}
```
- lista wpisów A2_FIELD_REJECTED i A2_LIMIT_TRUNCATED z obu przebiegów
Z przebiegu na żywo (prawdziwy model): BRAK wpisów (tylko A1) - model zwrócił JSON-a perfekcyjnie zachowującego limity i nie dodał zakazanych pól. 
Z przebiegu mock_halt: `A2_FIELD_REJECTED: pipeline_id`, `A2_LIMIT_TRUNCATED: scraped_sources`, `A2_LIMIT_TRUNCATED: safety_signals_detected`.

## 5. Testy
- pełny wydruk npm test
```
✖ failing tests:

test at src\modules\offer-optimizer-v2\tests\orchestrator.test.js:57:1
✖ Orchestrator - Komplet danych na fizycznym produkcie nie zatrzymuje fazy 1 (2.2389ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  
  'RUN_A3' !== 'RUN_A2'
  
      at TestContext.<anonymous> (Z:\Nexus_ERP_Project\src\modules\offer-optimizer-v2\tests\orchestrator.test.js:77:12)

test at src\modules\offer-optimizer-v2\tests\orchestrator.test.js:182:1
✖ Orchestrator - P1 sprawdzenie zwraca P1_CHECK_IMPOSSIBLE gdy brak domeny (1.4674ms)
  AssertionError [ERR_ASSERTION]: Brak P1_CHECK_IMPOSSIBLE w warningach
      at TestContext.<anonymous> (Z:\Nexus_ERP_Project\src\modules\offer-optimizer-v2\tests\orchestrator.test.js:213:12)
```
- lista nowych asercji: plik:linia + jedno zdanie każda
- `orchestrator.test.js:220` (Orchestrator - Trasa v2) - Sprawdza czy pole chemical_route to boolean i czy w chemical_route_reasons jest string 'SDS_STATUS_UNKNOWN'.
- `orchestrator.test.js:228` (Orchestrator - A2 odrzuca gtin_ean i pipeline_id) - Sprawdza odrzucenie zakazanych kluczy z ucięciem poprzez brak istnienia ich we wnękach obiektu.
- `orchestrator.test.js:241` (Orchestrator - A2 ucina nadmiarowe pozycje z tablic) - Sprawdza czy po mocku wielkie tablice klastrów i safety obcinane są odpowiednio do limitów z wyrzuceniem wpisów TRUNCATED do logu.
- `orchestrator.test.js:264` (Orchestrator - A2 HALT przy safety_signals_detected) - Sprawdza czy model podnoszący alarm bezpieczeństwa poprawnie wymusza HALT w next_action oraz wpis do hitl_alert.
- `orchestrator.test.js:280` (Orchestrator - A2 idzie dalej przy sentiment_available = false) - Sprawdza czy przy fałszu potok nie zatrzymuje się, a stan to po prostu RUN_A3.

UWAGA: Zgodnie z WARUNKIEM STOP nr 2, stare testy (linia 57 i 182) wywaliły się po uaktywnieniu przejścia RUN_A3 po A2 (i zmianach w mocku), a ja ich nie naprawiam - zgłaszam ich błędy.

## 6. git diff --stat całego modułu v2
```
 .../offer-optimizer-v2/docs/Agent_1_prompt_v4.md   |  28 +-
 src/modules/offer-optimizer-v2/orchestrator.js     | 452 ++++++++++++++-------
 .../offer-optimizer-v2/prompts/Agent_1_compiled.md |  37 +-
 .../offer-optimizer-v2/prompts/Agent_2_compiled.md |  42 ++
 .../offer-optimizer-v2/prompts/Agent_4_compiled.md | 119 ++++
 .../offer-optimizer-v2/prompts/Agent_5_compiled.md |  93 ++++
 .../offer-optimizer-v2/prompts/Agent_6_compiled.md | 110 ++++
 .../offer-optimizer-v2/prompts/Agent_7_compiled.md | 119 ++++
 .../offer-optimizer-v2/prompts/Agent_8_compiled.md |  63 +++
 .../offer-optimizer-v2/prompts/Agent_9_compiled.md |  73 +++
 .../offer-optimizer-v2/prompts/Agent_10_compiled.md| 113 +++++
 .../offer-optimizer-v2/tests/orchestrator.test.js  | 306 +++++++++++++-
 12 files changed, 1435 insertions(+), 120 deletions(-)
```
