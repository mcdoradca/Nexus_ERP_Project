# ADR-062: Obsługa wariantów literowych CLP (H361fd/H360/H350), kodów łączonych oraz dekodowanie błędów Blob w interfejsie SDS

## Status
**PRZYJĘTY / WDROŻONY** (2026-09-14)

## Kontekst biznesowy i techniczny
Podczas produkcyjnego przetwarzania rzeczywistych kart charakterystyki SDS w formacie RTF (m.in. `8034055535448_SDS_ORCHIDEA_E_VANIGLIA (1).rtf`) silnik zwrócił błąd HTTP 500:
`[CRITICAL HALT] Nieznany kod zagrożenia: H361FD` w `sds.service.js:1035`.

Analiza przyczyn źródłowych wykazała dwa powiązane problemy:
1. **Baza zwrotów CLP:** Oficjalny słownik zwrotów `OFFICIAL_CLP_H_PHRASES` zawierał jedynie kod bazowy `H361` i `H360`. Rozporządzenie (WE) nr 1272/2008 (CLP) w tabeli 1.2 Załącznika III przewiduje kody ze specyfikacją dróg i narządów (podlitery): `H361fd`, `H361f`, `H361d`, `H360FD`, `H360Fd`, `H360Df`, `H350i`, a także kody łączone dróg narażenia (`H300+H310`, `H302+H312`, `H302+H332`, `H302+H312+H332`). Metoda `SDSChemicalExtractor.extractHCodes` normalizuje kody do wielkich liter (`.toUpperCase()`), w wyniku czego `H361fd` stał się `H361FD`, co wywołało nieobsłużony wyjątek w twardej walidacji Sekcji 2. Ponadto w mapie `H_TO_GHS_MAP` brakowało mapowania rodziny `H361` na piktogram `GHS08`.
2. **Komunikacja Axios z binarnym Blobem w UI:** W komponencie `frontend/src/components/SdsGeneratorTool.jsx` zapytania do endpointów `/api/sds/process` i `/api/sds/resume-process` posiadają nagłówek `responseType: 'blob'`. W przypadku błędu serwera (4xx/500), ciało odpowiedzi jest instancją `Blob`. Brak rozpakowania lub czytania właściwości `details` powodował wyświetlanie generycznego komunikatu błędu Axios bez szczegółów technicznych.

## Podjęte decyzje architektoniczne

1. **Rozszerzenie słownika CLP (`OFFICIAL_CLP_H_PHRASES`) i mapowania GHS (`H_TO_GHS_MAP`):**
   - Zarejestrowano pełną nomenklaturę kodów zagrożeń reprotoksycznych (`H361fd`, `H361FD`, `H361f`, `H361F`, `H361d`, `H361D`, `H360FD`, `H360fd`, `H360Fd`, `H360Df`, `H362`), kancerogennych (`H350`, `H350i`, `H350I`), mutagennych (`H340`, `H341`) oraz powszechnych kombinacji CLP (`H300+H310`, `H301+H311`, `H302+H312`, `H302+H332`, `H312+H332`, `H302+H312+H332`).
   - W `H_TO_GHS_MAP` dodano bezpośrednie przypisania do piktogramu `GHS08` oraz `GHS09`.

2. **Defensywny resolwer kodów zagrożeń (`SDSChemicalExtractor.resolveHazardPhrase`):**
   - Wdrożono metodę `resolveHazardPhrase(code)` w klasie `SDSChemicalExtractor`:
     - Weryfikuje kod bezpośrednio oraz w wariancie wielkich liter.
     - Automatycznie syntetyzuje kody łączone ze znakiem `+`, łącząc oficjalne frazy składowe.
     - Stosuje bezpieczny fallback do kodu bazowego `H\d{3}` (np. `H361` dla nietypowych wariantów literowych), zapewniając deterministyczny zwrot bez ryzyka paraliżu systemu.
   - W `processSection2` zaktualizowano walidację, zapobiegając nieuzasadnionym błędom krytycznym i dynamicznie memoizując frazę w słowniku.

3. **Synchronizacja i uodpornienie Sekcji 16 oraz wnioskowania GHS:**
   - W `inferGhsFromHCodes` dodano obsługę kodów łączonych oraz fallback 4-znakowy (`cleanH.substring(0, 4)`), co gwarantuje prawidłowe przypisanie piktogramu `GHS08` dla każdego podkodu `H361*` i `H360*`.
   - W `processSection16` zastąpiono lokalny ad-hoc regex metodą `SDSChemicalExtractor.extractHCodes()`, eliminując obcinanie kodów dwuliterowych (`H361fd`).

4. **Pełne dekodowanie binarnego Bloba błędu w UI:**
   - W `frontend/src/components/SdsGeneratorTool.jsx` w funkcjach `handleGenerate` i `handleResume` wdrożono asynchroniczne odczytywanie tekstu z Bloba (`await err.response.data.text()`), parsowanie JSON i wyświetlanie komunikatu z priorytetem pola `json.details || json.error`.

## Konsekwencje i weryfikacja
- Całkowita eliminacja błędu 500 przy kartach SDS z kodami `H361fd`, `H360FD` i kodami łączonymi.
- Pełna czytelność komunikatów o ewentualnych błędach w interfejsie użytkownika.
- Zestaw testów RTF `tests/sds.rtf.test.js`: 5/5 PASSED (z asercją dla `H361fd` i `GHS08`).
- Testy regulacyjne `tests/sds.compliance.test.js`: 7/7 PASSED.
- Testy systemowe `npm test`: 122/122 PASSED.
- Kompilacja produkcyjna `npm run build` w `frontend/`: kod 0.
