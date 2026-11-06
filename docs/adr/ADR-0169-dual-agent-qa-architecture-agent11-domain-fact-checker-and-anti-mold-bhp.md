# ADR-0169: Architektura Dual-Agent QA (Agent 11 Kognitywny Inspektor Domenowy + Agent 10 Master Compliance Sentinel), Eliminacja FAST-PASS oraz Tarcza BHP Pleśni

## Status
Zaakceptowany i wdrożony (v4.14).

## Kontekst
W wersji v4.13 potok EAN Pipeline / Offer Optimizer V2 opierał się na mechanizmie warunkowego pomijania audytu LLM (`FAST-PASS` w węźle A10) w sytuacji, gdy pre-audyt kodowy zgłosił 0 błędów w regułach syntaktycznych i leksykalnych.
Praktyka produkcyjna wykazała, że kontrole czysto kodowe nie wykrywały subtelnych, karygodnych błędów merytorycznych, kalek międzykategorialnych oraz niebezpiecznych procedur BHP, m.in.:
1. **Kalka kuchenna w preparatach sanitarnych / odgrzybiaczach:** Wklejanie formułek z odtłuszczaczy piekarników i garnków („usuwa przypalenia”) do opisów sody w sprayu do łazienki/pleśni.
2. **Pominięcie kluczowych surfaktantów z INCI:** Pomijanie `COCAMINE OXIDE` (tlenek kokaminy – surfaktant amfoteryczny/niejonowy odporny na chlor, odpowiedzialny za gęstą pianę przylegającą do pionowych ścian) i błędne przypisywanie pianotwórczości soli kuchennej (`Sodium Chloride` – wiskozant).
3. **Niebezpieczny błąd BHP w procedurze usuwania pleśni:** Zalecanie użytkownikowi w Kroku 1 mechanicznego ścierania, przecierania na sucho lub zdrapywania powierzchownych nalotów przed nałożeniem chemii, co powoduje gwałtowne pylenie toksycznych zarodników i mikotoksyn do dróg oddechowych.
4. **Absurd technologiczny (reżim stosowania):** Nazywanie silnie żrącego roztworu podchlorynu sodu z NaOH środkiem do „codziennych porządków” lub „regularnego sprzątania”.
5. **Slogany marketingowe w specyfikacji technicznej:** Wklejanie włoskich haseł marketingowych typu `Siła wybielania` / `Potere Sbiancante` do Sekcji 5 `Cechy dodatkowe`.
6. **Zabroniona ikona na Allegro:** Użycie ikony `⛔`, która nie znajduje się na whiteliscie dopuszczonych znaków Allegro (wymagane zastąpienie symbolem `⚠️`).

## Podjęte Decyzje Architektoniczne

### 1. Całkowita Eliminacja Ścieżki FAST-PASS
- Wycięto warunkowe pomijanie Agenta 10 (`isFullPipelineRun && allSixPresent && preAuditReport === "Automated checks passed."`).
- Każda wygenerowana oferta przechodzi obowiązkowy, bezwzględny audyt semantyczno-prawny LLM.

### 2. Wdrożenie Architektury Dwuagentowego Nadzoru (Dual-Agent QA Swarm)
Rozdzielono odpowiedzialność audytową na dwa wyspecjalizowane węzły:
- **Node 11 (Agent 11 - Kognitywny Inspektor Domenowo-Produktowy i Fact-Checker):**
  - Wywołanie: lekki i szybki model Gemini Flash (`gemini-3.8-flash`).
  - **Krok 1 (Identyfikacja Tożsamości Ontologicznej):** Przed audytem tekstu precyzyjnie definiuje: `exact_product_type`, `primary_regime` (interwencja vs codzienny), `target_surfaces_and_exclusions` oraz `primary_active_chemistry`.
  - **Krok 2 (Faktograficzny Audyt Merytoryczny):** Sprawdza tekst pod kątem kalek kuchennych/pralniczych w łazience, bezpieczeństwa biologicznego BHP, reżimu interwencji sanitarnej, kompletności INCI oraz puryzmu parametrów technicznych. Zwraca patche naprawcze `patches[]`.
- **Node 10 (Agent 10 - Master Compliance Sentinel):**
  - Wywołanie: `gemini-3.1-pro-preview` (głębokie rozumowanie prawne).
  - Weryfikuje zgodność prawną CLP, GPSR, BPR (Rozp. 528/2012), Kosmetyczne (1223/2009 & 655/2013), słowa zakazane Allegro (§A), nierozerwalność procedur medycznych i tagi Allegro.

### 3. Tarcza BHP Procedury Przeciwgrzybiczej i Interwencji
- W `deterministic-pipeline.engine.js`:
  - Wdrożono regułę zamieniającą mechaniczne ścieranie pleśni w Kroku 1 na bezpośrednią aplikację płynu/sprayu na zagrzybioną powierzchnię bez wstępnego przecierania.
  - Wdrożono regułę sanitizującą zwroty o „codziennych porządkach” dla żrących roztworów z chlorem i kwasów na „doraźne zabiegi czyszczące” / „okresową interwencję sanitarną”.
  - Usunięto kalki o usuwaniu przypaleń z chemii sanitarnej.
  - Zastąpiono ikonę `⛔` dopuszczonym symbolem ostrzegawczym `⚠️`.
  - Odfiltrowano puste hasła marketingowe (`Siła wybielania`, `Potere Sbiancante`, `Ulepszona formuła`) z `Cechy dodatkowe` w Sekcji 5.
  - Włączono `COCAMINE OXIDE` do bazy `inci_mechanisms_pl.json` oraz wyeliminowano fałszywą pianotwórczość przypisaną do `Sodium Chloride`.

### 4. Twarde Bramki Walidacyjne
- W `src/modules/offer-optimizer-v2/validators/index.js` dodano reguły:
  - 11: Kalka kuchenna w chemii sanitarnej/przeciwgrzybiczej.
  - 12: Zagrożenie biologiczne BHP (ścieranie pleśni na sucho).
  - 13: Błędny reżim stosowania (chlor jako codzienne sprzątanie).
  - 14: Niedozwolony symbol Allegro `⛔`.

## Konsekwencje
- Wyeliminowano ryzyko publikacji ofert z niebezpiecznymi instrukcjami BHP dla zdrowia konsumenta.
- Wyeliminowano halucynacje chemiczne i kalki międzykategorialne.
- Oferty są w 100% zgodne z zasadami Allegro 2026 (brak symbolu `⛔`, czyste parametry techniczne w Sekcji 5).
- Architektura Dual-Agent QA zapewnia pełną redundancję i głęboką weryfikację faktograficzno-prawną.

