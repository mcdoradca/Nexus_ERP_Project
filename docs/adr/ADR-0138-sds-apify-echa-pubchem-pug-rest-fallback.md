# ADR-0138: Defensywny Fallback Apify ECHA oparty o Oficjalne API NCBI PubChem PUG REST

## Status
**ACCEPTED / PRODUCTION-READY** (Data: 2026-10-08)

## Kontekst i Problem Biznesowy
Moduł kart charakterystyki SDS (`src/modules/sds`) w ekosystemie Nexus ERP korzysta z zewnętrznej integracji z platformą Apify w celu odpytywania bazy Europejskiej Agencji Chemikaliów (ECHA):
1. `ApifyEchaConnector` (`engine/extractors/apify.echa.connector.js`) – pobieranie autorytatywnej klasyfikacji CLP, piktogramów oraz zwrotów EuPhraC H i P.
2. `SDSInvestigatorAgent` (`sds.investigator.agent.js`) – agent śledczy HITL do identyfikacji anomalii CAS przy użyciu aktora `studio-amba~echa-scraper`.
3. `SDSSwarmOrchestrator` (`engine/sds.swarm.orchestrator.js`) – orkiestracja audytu składników chemicznych Sekcji 3.

W przypadku braku zmiennej środowiskowej `APIFY_API_TOKEN`, wyczerpania limitu konta (rate limit / 429), awarii sieciowej zewnętrznych serwerów Apify lub przekroczenia czasu oczekiwania na aktora (timeout > 120s), system dotychczas rzucał nieobsługiwany wyjątek (`throw new Error('[ApifyEchaConnector] Brak APIFY_API_TOKEN...')`) lub pozostawiał pusty kontekst dla LLM. Groziło to zatrzymaniem potoku generowania kart SDS.

Wymaganiem biznesowym i technicznym było stworzenie defensywnego, beztokenowego fallbacku opartego w 100% o oficjalną specyfikację **NCBI PubChem PUG REST** (https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest), wykonanego z chirurgiczną precyzją, bez ingerencji w relacje bazy danych i bez dodawania zewnętrznych bibliotek npm.

Przed rozpoczęciem wdrożenia zabezpieczono stan stabilny repozytorium twardym punktem przywracania:
- Git Tag: `checkpoint-sds-golden-master-cif-stable`
- Git Branch: `backup-sds-stable-golden-master-cif`

## Podjęte Decyzje Architektoniczne

### 1. Dedykowany Klient PUG REST: `PubChemPugRestClient`
Utworzono bezstanowy komponent w `src/modules/sds/engine/extractors/pubchem.pug.rest.client.js` realizujący:
- **Dwuetapowe odpytywanie PUG REST / PUG View:**
  1. `fetchCompoundProperties(query)`: endpoint `/compound/name/{query}/property/IUPACName,MolecularFormula,Title/JSON` zwracający unikalny identyfikator PubChem `CID`, wzór sumaryczny `MolecularFormula` i międzynarodową nazwę `IUPACName`.
  2. `fetchGHSClassification(cid)`: endpoint PUG View `/data/compound/{CID}/JSON?heading=GHS%20Classification` zwracający zharmonizowaną klasyfikację GHS (opartą o zgłoszenia ECHA C&L Notifications Summary).
- **Parsowanie i Polonizacja:**
  - Zwroty H: regex `\bH\d{3}[a-zA-Z]?\b`
  - Zwroty P: regex `\bP\d{3}(?:\+P\d{3})*\b`
  - Piktogramy: identyfikacja kodów `GHS01`–`GHS09` z adresów URL grafik SVG
  - Hasło ostrzegawcze: mapowanie `"Danger"` -> `"Niebezpieczeństwo"`, `"Warning"` -> `"Uwaga"`
- **Tarcza obronna (Defensive AI / Zero-Crash):**
  - Timeout 12s per żądanie,
  - Obsługa HTTP 404 (zwraca `null` bez rzucania błędów),
  - Wykładniczy backoff dla przejściowych błędów sieciowych (1 retry z opóźnieniem 1s).

### 2. Integracja Fallbacku w `ApifyEchaConnector`
- W przypadku braku `APIFY_API_TOKEN` lub błędu wykonania aktora Apify, konektor nie rzuca błędu, lecz loguje ostrzeżenie i asynchronicznie wywołuje `this.pubchemFallback.fetchFullChemicalProfile(query)`.
- Zwracany obiekt posiada ujednolicony znacznik źródła `source: 'PUBCHEM-PUG-REST-ECHA-FALLBACK'`.

### 3. Integracja Fallbacku w `SDSInvestigatorAgent`
- W procedurze `callApifyScraper`: w razie braku tokenu, pustego wyniku z aktora Apify lub błędu zapytania, agent automatycznie zasila kontekst danymi z `PubChemPugRestClient`.
- Dzięki temu model `gemini-3.8-flash` otrzymuje autentyczną strukturę IUPAC, wzór i klasyfikację z PubChem zamiast generować halucynacje.

### 4. Normalizacja w `EuphracUpdater`
- Rozszerzono regex w `EuphracUpdater` (`src/modules/sds/engine/extractors/euphrac.updater.js`) do obsługi zarówno zwrotów z dwukropkiem (`H225: opis`), jak i samych kodów GHS (`H225`), zachowując istniejące definicje w bazie `euphrac_ssot.json`.

## Konsekwencje
1. **100% Niezawodność (Zero-Downtime):** Awaria platformy Apify, brak środków na koncie lub brak tokenu w środowisku lokalnym/CI nie zatrzymuje generowania kart charakterystyki.
2. **Pełna Zgodność Prawna:** Dane pobierane z PubChem w sekcji GHS pochodzą bezpośrednio ze zgłoszeń producentów do Europejskiej Agencji Chemikaliów (ECHA C&L Inventory).
3. **Brak nowych zależności:** Zastosowano istniejącą w projekcie bibliotekę `axios` i natywne API Node.js.

## Weryfikacja Testowa
- Utworzono suitę testową: `tests/sds.pubchem_fallback.test.js` (**6/6 PASSED**):
  - Pobieranie właściwości (Etanol CAS 64-17-5 CID 702),
  - Ekstrakcja GHS (zwroty H225, H319, piktogram GHS02, hasło "Niebezpieczeństwo"),
  - Pełny profil kwasu siarkowego (CAS 7664-93-9, H314, GHS05),
  - Bezpieczna obsługa nieistniejących substancji (null bez błędu),
  - Automatyczny fallback w `ApifyEchaConnector` bez tokenu,
  - Odporność na symulowaną awarię domeny Apify.
- Pełna regresja suity SDS:
  - `tests/sds.golden_master_cif.test.js`: **6/6 PASSED**
  - `tests/sds.schema.validator.test.js`: **7/7 PASSED**
  - `tests/sds.compliance.test.js`: **7/7 PASSED**
  - `tests/sds.vision_and_docx_builder.test.js`: **3/3 PASSED**
