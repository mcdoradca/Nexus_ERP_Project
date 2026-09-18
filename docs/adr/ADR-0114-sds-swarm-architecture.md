# ADR-0114: Wdrożenie architektury Multi-Agent Swarm oraz SSOT (Single Source of Truth) dla modułu SDS

**Data:** 2026-09-18
**Status:** Zaakceptowany
**Kontekst:** 
Moduł translacji i generowania kart charakterystyki (SDS) opierał się dotychczas na jednym, potężnym (monolitycznym) pliku `sds.service.js` oraz pojedynczym modelu LLM obsługującym całość logiki analityczno-tłumaczeniowej (tzw. overfitting promptu). 
Rodziło to dwa główne problemy:
1. Brak elastyczności i wysokie ryzyko halucynacji (model LLM przy tak dużym obciążeniu gubił wartości liczbowe lub doklejał normy prawne spoza polskiej jurysdykcji).
2. Hardkodowanie struktur językowych i słowników (zwroty H/P, organizmy testowe, klasy zagrożeń) głęboko w kodzie, co wymagało interwencji programistycznej przy każdej nowej substancji.

## Decyzja

1. **Przejście na architekturę Multi-Agent Swarm (Rój Agentów)** 
   Oparto proces translacyjny o trzy wyizolowane instancje AI (wykorzystujące model `gemini-3.8-flash` z ustawieniami pełnego determinizmu `temperature: 0.0`), każda z wąską specjalizacją.
2. **Dekompozycja monolitu `sds.service.js`**
   Klasy odpowiedzialne za ekstrakcję oraz składanie plików zostały przeniesione do warstw `engine/extractors` oraz `engine/assemblers`. Stary `processSdsWithAgent` zastąpiono maszyną stanów w postaci orkiestratora `SDSSwarmOrchestrator`.
3. **Wdrożenie dynamicznego SSOT**
   Twarde kodowanie wartości CLP/REACH przeniesiono do pliku konfiguracyjnego `rag_knowledge/euphrac_ssot.json`, wspieranego przez nowo utworzony mechanizm `ApifyEchaConnector`.

## Architektura Roju (Swarm) - Zadania i Efekty

Każdy Agent działa jako odrębny krok w potoku (Pipeline), przekazując wynik swojej pracy następnemu:

### 1. NarrativeTranslatorAgent
- **Zadanie:** Czyste tłumaczenie narracyjnych bloków tekstu medycznego, chemicznego i technicznego z języka źródłowego na polski. 
- **Zasady (System Prompt):** Surowy zakaz ingerencji w wartości liczbowe oraz kategoryczny zakaz dodawania jakichkolwiek przepisów prawnych z własnej inicjatywy. Brak formatowania markdown, odpowiedź wyłącznie w surowym JSON.
- **Oczekiwany efekt:** Płynne językowo opisy (np. pierwszej pomocy, czy procedur gaśniczych) bez jakichkolwiek ubytków wynikających z narzutów prawnych modelu.

### 2. RegulatoryAuditorAgent
- **Zadanie:** Prawny weryfikator (Gatekeeper). Sprawdza tekst opuszczający Agenta Translatora pod kątem regulacji EU REACH i polskiego prawa (NDS, CLP, kody odpadów wg Dz.U.).
- **Zasady:** Wycinanie z tekstu norm lokalnych nieobowiązujących w Polsce (np. TRGS, WGK, OSHA). Sprawdzanie prawidłowości formatowania pustych klasyfikacji (np. wymóg dodania frazy "Nie dotyczy").
- **Oczekiwany efekt:** Tekst staje się w pełni legalny z punktu widzenia inspektora Państwowej Inspekcji Pracy (PIP) oraz zgodny z aktualnym Załącznikiem II Rozporządzenia 2020/878. Znikają tzw. "martwe klasyfikacje".

### 3. SemanticArbiterAgent
- **Zadanie:** Arbiter Integralności Danych. Zabezpiecza proces przed halucynacjami cyfrowymi na końcu potoku.
- **Zasady:** Dokonuje skrupulatnego porównania źródłowego (wejściowego) tekstu z efektem pracy Audytora. Wyszukuje rozbieżności numeryczne (temperatury, limity, %, mg/kg, wartości pH) i w razie jakichkolwiek odchyleń – bezwzględnie przywraca wartość oryginalną.
- **Oczekiwany efekt:** 100% pewność, że AI w toku dwuetapowych modyfikacji tekstowych nie zmieniło kluczowych, mierzalnych parametrów decydujących o ludzkim zdrowiu lub życiu.

### 4. ApifyEchaConnector & EuphracUpdater
- **Zadanie:** Stanowi warstwę "Extractors". Komunikuje się bezpośrednio z autoryzowanymi bazami (scraper ECHA) poprzez platformę Apify, weryfikując kody CAS i zaciągając aktualne klasyfikacje zagrożeń, zwroty GHS.
- **Oczekiwany efekt:** Zero-hardcoding. System sam zaktualizuje bazę `euphrac_ssot.json` lub załata braki w locie, zapobiegając potrzebie ręcznego dopisywania nowych fraz chemicznych.

## Konsekwencje (Consequences)
**Zalety:**
- Zniwelowano do zera występowanie niemieckich norm prawnych w polskich kartach.
- Zapewniono absolutną precyzję liczbową (Arbiter Semantyczny).
- Struktura DOCX nie została naruszona – zachowano integrację z wejściowym `SDSVisionAgent` i modułem sklejającym `SDSDocxExporter`.

**Ryzyka / Wady:**
- Większa konsumpcja zapytań (3x API Call do LLM) na każdą kartę.
- Wymagana wyższa stabilność usług sieciowych (Google GenAI API oraz Apify). Obwód został jednak zabezpieczony przez fallback do lokalnego cache (`rag_knowledge/euphrac_ssot.json`).
