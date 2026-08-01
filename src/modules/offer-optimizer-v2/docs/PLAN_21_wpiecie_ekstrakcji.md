# PLAN DZIAŁANIA - 21 wpięcie ekstrakcji do orkiestratora

## ZROZUM - KRYTYCZNE ZAŁOŻENIA
1. **Tryb offline:** Zero wywołań BaseLinker API. Używam wariantu `fixture` ładującego lokalne pliki z `tests/fixtures/`.
2. **Wyłączenie pól A1:** Agent 1 nie będzie uzupełniał elementów prawnych (`compliance_gpsr_clp`), logistyki, INCI (`raw_ingredients_inci`), `mpn` ani `verified_certificates`.
3. **Twarde zatrzymanie:** Trzy bramki przerywające przetwarzanie po fazie 1: `MISSING_INCI`, `MISSING_EU_RESPONSIBLE_PERSON` i `MALFORMED_EU_RESPONSIBLE_PERSON`.

## PLAN ZMIAN (3 PUNKTY)

### Punkt 1: Konfiguracja i Tryb `loadProductData`
- Dodanie stałej `DATA_SOURCE_MODE = 'fixture'` do pliku `config/nodes.config.js`.
- Utworzenie w `orchestrator.js` funkcji `loadProductData(ean)`, wyciągającej dane z jednego z istniejących wariantów testowych plików `.json` w katalogu `tests/fixtures/`. Dla opcji `api` rzucony zostanie dedykowany błąd blokujący.

### Punkt 2: Maszyna stanowa i Twarde Zatrzaski (Bramki)
- Wywołanie w `runPhase1` funkcji podpinających w następującej kolejności: `loadProductData(ean)` -> `parseFeaturesTolerant` -> `extractFromFeatures` -> `extractResponsiblePersonFromDescription` -> `validate_eu_responsible_person`.
- Dodanie walidacji po ekstrakcji: Przerwanie procesu (`HALTED_HITL_REQUIRED`) w przypadku braku lub wadliwości podmiotu odpowiedzialnego (EU) oraz braku INCI. Wartości odzyskane na tym etapie ładuję do maszyny stanowej.

### Punkt 3: Redukcja `a1Schema` i Warunkowe Użycie LLM
- Usunięcie prawnych, logistycznych i sprzętowych węzłów ze schematu `a1Schema`.
- Analiza brakujących pól po ekstrakcji z BaseLinkera. Agent (A1) jest puszczany tylko jeśli występują braki danych (m.in `brand`, `line`, `product_name`, `country_of_origin`). W przypadku braku potrzeby, Node A1 zostanie pominięty, a stosowna adnotacja o zaoszczędzeniu tokenów trafi do zapisu stanu.
