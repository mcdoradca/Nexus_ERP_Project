# ADR-0121: Egzekwowanie Pełnego Adresu Fizycznego Podmiotu Odpowiedzialnego GPSR i Eliminacja Ucinania Danych w Potoku

## Status
Przyjęty i wdrożony (100% Produkcja) - 2026-09-30

## Kontekst i Zgłoszony Problem
Zgodnie z art. 19 Rozporządzenia Ogólnego o Bezpieczeństwie Produktów (GPSR - (UE) 2023/988), podmiot odpowiedzialny umieszczany w ofercie internetowej musi bezwzględnie zawierać:
1. Nazwę (lub zarejestrowany znak towarowy) producenta / osoby odpowiedzialnej.
2. Pełny adres pocztowy (fizyczny adres siedziby w UE: ulica z numerem, kod pocztowy, miasto, kraj).
3. Dane do kontaktu elektronicznego (adres e-mail lub strona WWW).

Podczas działania potoku ofertowego zauważono defekt: zamiast pełnej nazwy i adresu podmiotu odpowiedzialnego, w wyjściowym opisie oferty konsument otrzymywał wyłącznie samą nazwę korporacji.

## Analiza Przyczyn Źródłowych (Root Cause Analysis)
1. **Dyrektywa skrótowa w szablonach Agenta 6 (`Agent_6_compiled.md` i `Agent_6_prompt_v4.md`):**
   W specyfikacji blueprintu Sekcji 6 (GPSR) prompt zawierał dosłowne polecenie: `+ podmiot odpowiedzialny w UE (nazwa).`. Słowo w nawiasie powodowało, że copywriter (Agent 6) świadomie i celowo odrzucał odnaleziony adres pocztowy i wklejał do HTML samą nazwę firmy.
2. **Luki w schemacie JSON Agenta 1 (`a1Schema` w `orchestrator.js`):**
   Obiekt `eu_responsible_person` nie posiadał klauzuli `required: ["name", "address_eu"]`. W połączeniu z kwerendą Google Search nastawioną wyłącznie na markę/producenta, model w Kroku 2 (strukturyzacji JSON) akceptował rekord z samą nazwą bez adresu siedziby.
3. **Brak bezpośredniego przekazania podmiotu z PIM do Agenta 6:**
   W `agent6Data` brakowało bezpośredniego przekazania `eu_responsible_person: this.state.extracted_data.eu_responsible_person?.data`. Gdy dane podmiotu pochodziły z BaseLinkera (`descResult`), Agent 1 nie był uruchamiany i Agent 6 nie miał dostępu do tych informacji w `a1`.
4. **Niezadeklarowana zmienna w `orchestrator.js`:**
   W linii 741 występował zapis `const finalEu = this.state.extracted_data.eu_responsible_person?.data || eu;`, gdzie zmienna `eu` nie istniała w zasięgu leksykalnym.

## Podjęte Decyzje Architektoniczne
1. **Wzmocnienie Agenta 1 (OSINT) i Schematu JSON (`a1Schema`):**
   - W `Agent_1_prompt_v4.md` dodano kwerendy wyszukiwania gwarantujące odnalezienie fizycznej siedziby (`"adres"`, `"headquarters"`, `"registered office"`, `"sede legale"`).
   - Wprowadzono bezwzględny zakaz zwracania samej nazwy firmy bez adresu pocztowego (jeśli brak adresu w oficjalnych źródłach, cały obiekt przyjmuje `null`).
   - W `a1Schema` dodano `required: ["name", "address_eu"]` wewnątrz obiektu `eu_responsible_person`.
2. **Korekta Szablonów Agenta 6 i Przekazywania Danych:**
   - Zastąpiono zapis `(nazwa)` jednoznacznym nakazem umieszczenia pełnego adresu: `<li>➡️ <b>Podmiot odpowiedzialny w UE:</b> [Nazwa], [Ulica i nr, Kod Miasto, Kraj]</li>` ze ścisłym zakazem ucinania adresu.
   - W `agent6Data` dodano bezpośrednie przekazanie `eu_responsible_person: this.state.extracted_data.eu_responsible_person?.data`.
3. **Deterministyczna Tarcza Formatująca w Orkiestratorze (Zero-Bypass):**
   - Po wygenerowaniu Sekcji 6 przez Agenta 6, a przed zamrożeniem hashem SHA-256 (`hashS6`), orkiestrator weryfikuje wpis podmiotu odpowiedzialnego. Jeśli model podał tylko nazwę lub pominął adres, kod automatycznie wstrzykuje pełny łańcuch: `${name}, ${address_eu}` z zachowaniem reguł antyspamowych Allegro (brak linków/maili w treści HTML).
4. **Sanacja Błędu Referencji:**
   - W linii 741 zamieniono `|| eu` na bezpieczne `|| {}`.

## Weryfikacja
- Dodano test jednostkowy w `tests/orchestrator.test.js`: *„GPSR Tarcza Defensywna: A6 rekonstruuje pełny adres podmiotu w Sekcji 6, gdy model podał tylko nazwę”*.
- Cała suita testów systemowych (130/130 testów) zakończona wynikiem 100% PASS bez regresji.
