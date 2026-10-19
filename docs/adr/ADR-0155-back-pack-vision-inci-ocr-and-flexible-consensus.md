# ADR-0155: Multimodalny Odczyt Składu ze Zdjęć Etykiety (Back-of-Pack Vision INCI OCR) oraz Uelastycznienie Konsensusu OSINT

**Data:** 2026-10-19  
**Status:** Zaakceptowane / Wdrożone produkcyjnie  
**Dotyczy:** Offer Optimizer V2, Agent 0 (Vision Extractor), Agent 1 (OSINT & PIM Autofill), `vision-extractor.service.js`, `orchestrator.js`

---

## 1. Kontekst i Problem Biznesowy
Podczas analizy produktów chemicznych i kosmetycznych (np. włoskich odplamiaczy i detergentów ze składem CLP/WE 648/2004) zidentyfikowano dwa krytyczne problemy skutkujące zawieszaniem potoku w pętlach ponowień i nieuzasadnionymi zatrzymaniami HITL (`OSINT_CONFLICTING_INCI_MAX_RETRYS`):

1. **Brak skanera multimodalnego dla etykiet ze składem (Back-of-Pack):**
   Mimo że kartoteka produktu w PIM lub BaseLinkerze posiada często zdjęcia tylnej etykiety lub zdjęcia opakowania z widocznym składem chemicznym, system ignorował te obrazy i zmuszał Agenta 1 do wielominutowego przeszukiwania internetu przez Google Search Grounding.
2. **Zbyt restrykcyjny algorytm konsensusu w Orkiestratorze (`sim >= 0.85`):**
   Gdy Agent 1 odnalazł w sieci dwa autentyczne składy produktu różniące się wyłącznie synonimami handlowymi (np. `FLUORESCENT BRIGHTENER` vs `OPTICAL BRIGHTENER`) lub drobną obecnością buforu (np. `CITRIC ACID`), naiwny algorytm Jaccarda wyliczał podobieństwo na poziomie 75–76%. Ze względu na sztuczny próg 0.85 (85%) system uznawał te składy za sprzeczne, uruchamiał wyszukiwanie od nowa 3 razy z rzędu (kilka minut opóźnienia), a ostatecznie zatrzymywał potok w czerwonym modalu HITL.

---

## 2. Podjęte Decyzje Architektoniczne

### A. Wdrożenie `extractInciFromBackPack` w `vision-extractor.service.js` (Agent 0)
- Skonfigurowano dedykowany multimodalny skaner OCR dla modelu `gemini-3.8-flash` z rygorystycznym schematem JSON (`backPackInciSchema`).
- Model bada zdjęcia z galerii produktu (`candidateImages`). Jeśli wykryje etykietę ze składem (`INCI`, `Ingredients`, `Composizione chimica`, `Inhaltsstoffe`):
  - Ustawia `has_ingredients_label: true`.
  - Normalizuje skład do formatu INCI (wielkie litery, oddzielone przecinkami).
  - W przypadku etykiet chemicznych w językach obcych (np. włoskie nazwy CAS/CLP: `Alcoli, C12-18, etossilati; Perossido di idrogeno...`) dokonuje bezpośredniej transkrypcji na standardowe nazwy chemiczne (`ALCOHOLS, C12-18, ETHOXYLATED, HYDROGEN PEROXIDE, SODIUM DODECYLBENZENESULFONATE, COCO-BETAINE`).
- Zgodnie z Doktryną Zamkniętego Świata: w przypadku braku etykiety lub nieczytelnego zdjęcia model zwraca `has_ingredients_label: false` i potok bezpiecznie przechodzi do kolejnych kroków.

### B. Integracja Back-of-Pack Vision OCR w `orchestrator.js`
- W fazie ekstrakcji PIM (`RUN_EXTRACT`), jeśli w PIM brakuje poprawnego składu INCI (`!isValidInciValue`) oraz dostępne są zdjęcia produktu, orkiestrator wywołuje `extractInciFromBackPack`.
- W przypadku odczytania składu ($\ge 3$ składniki, poprawność INCI):
  - Skład jest natychmiast zapisywany w `product.features['INCI']` i `['Skład']`.
  - Dokonywana jest trwała aktualizacja rekordu w bazie PIM (Prisma).
  - Pole `inci` zostaje usunięte z `criticalMissing`.
  - Gdy pozostałe dane krytyczne (marka, GPSR) są obecne, Agent 1 (OSINT) zostaje natychmiast **POMINIĘTY (`node_status['A1'] = 'SKIPPED'`)**, a potok przechodzi wprost do Agenta 2 w ułamku sekundy.

### C. Uelastycznienie Konsensusu INCI w `orchestrator.js`
- Obniżono główny próg Jaccarda dla spójnej pary z `0.85` na `0.65`. Pokrywa to synonimy branżowe (`optical brightener` vs `fluorescent brightener`), kolejność surfaktantów i kosmetyczne reformulacje.
- Dodano fallback: jeśli żaden match nie przekroczył 0.65, ale kandydaci są poprawnymi, bezpiecznymi składami bez Lilialu ($\ge 4$ składniki) i dzielą kluczowy rdzeń substancji czynnych ($\ge 45\%$), orkiestrator automatycznie wybiera pełniejszy wariant bez uruchamiania pętli ponowień.

---

## 3. Weryfikacja i Testy
- Dodano testy jednostkowe w `tests/vision_extractor.test.js`:
  - Obsługa pustych wejść (`found = false`).
  - Ekstrakcja i normalizacja z etykiet detergentowych / kosmetycznych.
  - Prawidłowe odrzucenie zdjęć bez etykiety składu.
- Dodano test jednostkowy w `tests/orchestrator.test.js`:
  - Test konsensusu synonimów INCI (76% podobieństwa dla `Optical` vs `Fluorescent Brightener`) – natychmiastowa akceptacja w 214ms bez retry i bez HITL.
- Pełny pakiet testów: **203/203 testów PASSED (0 błędów)**.
