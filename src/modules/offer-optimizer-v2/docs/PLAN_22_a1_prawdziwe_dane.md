# PLAN DZIAŁANIA - ZADANIE 22 (A1 na prawdziwych danych)

Plan przewiduje usunięcie pozostałości przekazywania `pimData` ze środowiska testowego bezpośrednio do A1LLM, całkowite zablokowanie decyzyjności LLM w sprawach krytycznych oraz redukcję schematu. Zgodnie z procedurą 100% testów.

## KROKI 
### 1. Zmiany w `orchestrator.js`
- **Blok dynamiczny i atrapa (Krok 1):** Usunięcie ładowania `pimData` dla `a1Schema` (w linii gdzie było `const safePim = { ...pimData, missingFields };`). Wstrzyknięcie czystego obiektu opartego wyłącznie na danych z BaseLinkera z dodaniem ew. EANu:
   ```javascript
   const agentData = {
       gtin_ean: this.gtin,
       extracted_data: this.state.extracted_data,
       missingFields: missingFields
   };
   ```
- **Redukcja schematu A1 (Krok 2):** Z `a1Schema` zostanie jedynie `line`, `product_name`, `country_of_origin`, `research_sources_used`. Pola `missing_critical_data` etc. zostaną wymazane z properties oraz required.
- **Odpięcie zależności zatrzymania od AI (Krok 3):** Usunięcie w kodzie (okolice linii 260) if'ów: `if (result.missing_critical_data_reason === 'BANNED_SUBSTANCE_DETECTED')` i `if (result.missing_critical_data)`. Moduł A1 w przypadku przejścia przez ekstrakcję ma oddawać jedynie `OK` bez wchodzenia w kompetencje sprawdzania.
- **Biała lista śledząca (Krok 4):** Dostosowanie kodu filtrującego i budującego wynik z modelu tak by ignorowane klucze ładował do rejestru `warnings.push('A1_FIELD_REJECTED: ' + k);`. Sama tablica z dozwolonymi `allowedKeys` będzie zredukowana do `['line', 'country_of_origin', 'product_name', 'research_sources_used']`.

### 2. Zmiany w `tests/orchestrator.test.js` (Krok 5)
Dodanie 4 brakujących asercji testowych:
1. Brak INCI na mockowanym produkcie z dysku lub obiektu rzucającego błąd `MISSING_INCI`. AI jest odcięte (nie wywoła się).
2. Brak podmiotu EU odpowiedzialnego - znany test dla Trimay (`MISSING_EU_RESPONSIBLE_PERSON`). LLM uśpiony.
3. Komplet danych z atrapą na A1. Symulacja dla sztuki posiadającej podmioty i Inci z wyodrębnieniem przejścia do `A1 = OK`. 
4. Odpowiedź z nadprogramowymi polami - wykorzystanie `callAgentWithTelemetry` do podsunięcia mu m.in. `gtin_ean` by test udowodnił zjawisko rejestracji i odcięcia jako `A1_FIELD_REJECTED`.

### 3. Procedury Kontrolne (Krok 6 i 7)
- Odpalenie całego pakietu poleceniem `npm test`. Oczekiwany brak błędów.
- Wykonanie surowego testu `node` na klasie `Orchestrator` celem wygenerowania plików stanu Offline.
- Stworzenie pełnego raportu w pliku `docs/RAPORT_22_a1_prawdziwe_dane.md` z dokładnym opisem, outputem gita, testów oraz wklejonymi JSON-ami z folderu `logs/`. 
- Gwarancja absolutnie 0 wywołań w API BaseLinker z flagą `fixture`.
