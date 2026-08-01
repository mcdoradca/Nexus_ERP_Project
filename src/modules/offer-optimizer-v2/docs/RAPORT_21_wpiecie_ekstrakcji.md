# RAPORT 21 - Wpięcie ekstrakcji do orkiestratora

Zadanie wykonane pomyślnie. **Wykonało 0 wywołań do API BaseLinkera**. Oparto się w 100% na danych typu `fixture` ładując pliki offline. A1 LLM został odciążony z ustalania danych prawnych, parametrów Inci i logistyki (będących częścią strukturalnej ekstrakcji, jeśli obecne).

## 1. Wykonany Zakres
* Zmiana w `config/nodes.config.js` [D2]: Dodano flagę konfiguracyjną `DATA_SOURCE_MODE = 'fixture'`.
* Zmiana w `orchestrator.js` [D18/D19]: Wprowadzono nową funkcję ładującą `loadProductData(ean)`, która wczytuje plik konfiguracyjny BaseLinkera jako `json`. Uruchamiana w `runPhase1`. Następnie w locie parsowany jest cały tekst features za pomocą ekstraktora, zdekodowane klucze (`recovered_keys`), włączając "source" trafiają do zmiennej stanu. 
* Zmiana w `orchestrator.js` [D22]: Zaimplementowano Hard-Halty za pomocą nowych blokad (Brak Inci = MISSING_INCI; Zły/brak podmiotu odpowiedzialnego EU = MISSING_EU_RESPONSIBLE_PERSON). 
* Zmiana w `orchestrator.js` [D18]: Zmieniono schemat AI (`a1Schema`) poprzez redukcję punktów prawnych/logistycznych. Wprowadzono `white list` eliminującą przypadkowe zmyślone nadmiarowe pola (`filtered_out_by_whitelist`).
* Zmiana w `tests/orchestrator.test.js`: Odzwierciedlono logikę testów pod realia Hard Haltungs po procesie ekstrakcji (zamiast starego wywoływania fake AI API). Test Trimay został zaadaptowany.

## 2. Wyniki npm test
```
> node --test --test-reporter=spec "src/modules/offer-optimizer-v2/tests/*.test.js"
(...)
✔ V11 validate_eu_responsible_person - puste obiekty (0.0907ms)
✔ V11 validate_eu_responsible_person - zbyt dlugie pole (0.0753ms)
ℹ tests 72
ℹ suites 0
ℹ pass 72
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 7690.727
```

## 3. Stan git po modyfikacjach
```
 M config/nodes.config.js
 M orchestrator.js
 M tests/orchestrator.test.js
...
 .../offer-optimizer-v2/config/nodes.config.js      |   5 +-
 src/modules/offer-optimizer-v2/orchestrator.js     | 169 ++++++++++++++-------
 .../offer-optimizer-v2/tests/orchestrator.test.js  |  36 +----
 3 files changed, 121 insertions(+), 89 deletions(-)
```

## 4. Raport: Surowe przebiegi symulacji (Equilibra i Trimay)
### a) Przebieg dla Equilibra `8000137015436` na `.raw.json`
Maszyna skutecznie zdekodowała ucięty JSON i zatrzymała się docelowo po uruchomieniu AI na braku danych. 
Zgodnie z wymaganiem, podmiot EU jest wypięty z description (`source: "description"`), `mpn` i `brand` puste. `truncated: true`. W stanie poprawnie zrzucono usunięty "słodki migdał". LLM wywołał się uzupełniając mockupowo brakujące zasoby jak brand, ale `missing_fields` uodporniło go na INCI i EU rp (a finalResult załączyło filtrującą białą listę na merge'owaniu).

```json
{
  "pipeline_id": "PL-8000137015436-1785493655829",
  "timestamp_utc": "2026-07-31T10:27:35.829Z",
  "current_phase": "PHASE_1_GROUNDING",
  "node_status": {
    "EXTRACT": "OK",
    "A1": "HALTED_HITL_REQUIRED"
  },
  "revision_loop_count": 0,
  "next_action": "HALT",
  "hitl_alert": "Brak danych krytycznych - sprawdź research LLM",
  "frozen_hashes": { "s3": null, "s5": null, "s6": null },
  "token_usage_per_node": {
    "A1": {
      "promptTokenCount": 1453,
      "candidatesTokenCount": 191,
      "thoughtsTokenCount": 0,
      "totalTokenCount": 1644
    }
  },
  "extracted_data": {
    "inci": {
      "value": "Aqua (Water), Glyceryl Stereate, Cetyl Alcohol, Ethylhexyl Stereate, Coco-Caprylate/Caprate, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Glycerin, Hydrolyzed Eruca Sativa Leaf, Cetearyl Alcohol, C10-18 Triglyceride, Aloe Barbadensis Leaf Juice, Vaccinium Myrtillus Fruit Extract, Ribes Nigrum Fruit Extract, Charcoal Powder, Sodium Hyaluronate, Xanthan Gum, Helianthus Annuus (Sunflower) Seed Oil, Tocopherol, Phenoxyethanol, Stearic Acid, Parfum (Fragrance), Ethylexyglycerin, Dicaprylyl Ether, Sodium Lauroyl Glutamate, Sodium Benzoate, Beta-Sitosterol, Potassium Sorbate, Squalene, Citric Acid, Sodium Dehydroacetate.",
      "matched_key": "skladniki inci"
    },
    "mpn": { "value": null, "matched_key": null },
    "brand": { "value": null, "matched_key": null },
    "capacity": { "value": "75 ml", "matched_key": "pojemnosc" },
    "usage": { "value": "Nakładaj na idealnie oczyszczoną skórę twarzy rano i/lub wieczorem, masując aż do całkowitego wchłonięcia.", "matched_key": "sposob uzycia" },
    "warnings": { "value": "Tylko do użytku zewnętrznego. Unikać kontaktu z oczami.", "matched_key": "uwagi dotyczace bezpieczenstwa" },
    "truncated": true,
    "recovered_keys": [ "Funkcja", "Rodzaj produktu", "ean", "pojemnosc", "zastosowanie", "sposob uzycia", "skladniki inci", "uwagi dotyczace bezpieczenstwa", "rich kontent" ],
    "eu_responsible_person": {
      "source": "description",
      "data": {
        "name": "Equilibra srl",
        "address_eu": "Via Plava, 74 Torino – 10135 Italy",
        "contact": "cosmetica@equilibra.it",
        "raw_fragment": "<p>Equilibra srl</p><p>Via Plava, 74 Torino – 10135 Italy</p><p><a href=\"mailto:cosmetica@equilibra.it\">cosmetica@equilibra.it</a></p>"
      }
    },
    "product_name": "Oczyszczający krem-żel do twarzy z aktywnym węglem 75ml"
  },
  "normalization_warnings": [ "NO_P1_SOURCE", "pipeline_id_overwritten" ],
  "a1_result": {
    "pipeline_id": "PL-8000137015436-1785493655829",
    "gtin_ean": "5901234567890",
    "brand": "MOCK_BRAND",
    "line": "MOCK_LINE",
    "product_name": "mock pim",
    "country_of_origin": "Poland",
    "missing_critical_data": true,
    "missing_critical_data_reason": "MISSING_CRITICAL_GPSR_AND_SAFETY_DATA_SHEET",
    "research_sources_used": [ "https://ec.europa.eu/growth/tools-databases/cosing/", "https://echa.europa.eu/", "https://products.gs1.pl/" ]
  }
}
```

### b) Przebieg dla Trimay `8809822541010`
Prawidłowe **Zatrzymanie maszyny**: `MISSING_EU_RESPONSIBLE_PERSON` poprzez bramkę w `EXTRACT`. Brak token_usage (LLM nie został wywołany).
Przerwanie zjawiska w najwcześniejszej warstwie.

```json
{
  "pipeline_id": "PL-8809822541010-1785493658217",
  "timestamp_utc": "2026-07-31T10:27:38.217Z",
  "current_phase": "PHASE_1_GROUNDING",
  "node_status": {
    "EXTRACT": "HALTED_HITL_REQUIRED"
  },
  "revision_loop_count": 0,
  "next_action": "HALT",
  "hitl_alert": "MISSING_EU_RESPONSIBLE_PERSON",
  "frozen_hashes": { "s3": null, "s5": null, "s6": null },
  "token_usage_per_node": {},
  "extracted_data": {
    "inci": {
      "value": "Water, Glycerin, Niacinamide, Carrageenan, Butylene Glycol, Ceratonia Siliqua (Carob) Gum, Pentylene Glycol, PEG-60 Hy drogenated Castor Oil, Ethyl Hexanediol, Hexylene Glycol, Potassium Chloride, Pinus Sylvestris Leaf Extract, Sucrose, Calcium Lacta te, Allantoin, Cyamopsis Tetragonoloba (Guar) Gum, Cellulose Gum, Chlorphenesin, Hydroxyacetophenone, Calcium Chloride, 1,2 Hexanediol, Illicium Verum (Anise) Fruit Extract, Dipotassium Glycyrrhizate, Ethylhexylglycerin, Propanediol, Disodium EDTA, Frag rance, Arginine, Melia Azadirachta Flower Extract, Ocimum Sanctum Leaf Extract, Melia Azadirachta Leaf Extract, Caprylyl Glycol, Cu rauma Longa (Turmeric) Root Extract, Corallina Officinalis Extract, Ascorbic Acid, Tranexamic Acid, Ethyl Ascorbyl Ether, Nelumbo Nu cifera Callus Culture Extract, Brassica Oleracea Capitata (Cabbage) Leaf Extract, Brassica Oleracea Italica (Broccoli) Extract, Solanum Lycopersicum (Tomato) Fruit Extract, Citrus Junos Fruit Extract, Polysorbate 80, Hippophae Rhamnoides Fruit Extract, Tocopheryl A cetate, Ubiquinone, Sodium Hyaluronate",
      "matched_key": "Ingredients / INCI"
    },
    "mpn": { "value": "8809822541010", "matched_key": "Kod producenta" },
    "brand": { "value": "TRIMAY", "matched_key": "Brand" },
    "capacity": { "value": "60 szt.", "matched_key": "Capacity" },
    "usage": { "value": "Po oczyszczeniu skóry nałóż płatki żelowe na obszary wymagające szczególnej pielęgnacji (np. pod oczami, w miejscu zmarszczek mimicznych). Pozostaw na 15 minut, następnie usuń i wyrzuć zużyty produkt. Delikatnie wklep pozostałe serum w skórę.", "matched_key": "Usage instructions" },
    "warnings": { "value": "Przechowywać poza zasięgiem dzieci. Nie połykać. Unikać kontaktu z oczami.", "matched_key": "Warnings" },
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
    "product_name": "Trimay Hydrożelowe płatki pod oczy Vita Bright 60 szt."
  }
}
```
