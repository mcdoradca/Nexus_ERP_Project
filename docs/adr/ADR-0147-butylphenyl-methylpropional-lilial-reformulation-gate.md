# ADR-0147: Filtracja reformulacji kosmetycznych i automatyczna dyskwalifikacja zakazanego Butylphenyl Methylpropional (Lilial) w Agencie 1 i Orkiestratorze EAN Pipeline

## Status
Zaakceptowany / Wdrożony (Production-Ready)

## Kontekst i Geneza Problemu
Od 1 marca 2022 r. w Unii Europejskiej na mocy Rozporządzenia Komisji (UE) 2021/1902 obowiązuje bezwzględny zakaz stosowania w produktach kosmetycznych substancji zapachowej **Butylphenyl Methylpropional** (nazwy handlowe/synonimy: *Lilial*, *p-BMHCA*, *2-(4-tert-butylbenzyl)propionaldehyde*, CAS: 80-54-6) z uwagi na jej przeklasyfikowanie do kategorii substancji reprotoksycznych CMR 1B (art. 15 Rozporządzenia Kosmetycznego WE 1223/2009).

Wszyscy renomowani producenci europejscy (m.in. Felce Azzurra / Paglieri, Tesori d'Oriente, Spuma di Sciampagna, Nivea, Malizia, L'Oréal) zreformułowali swoje produkty i usunęli Lilial z receptur, zachowując ten sam kod EAN/GTIN.
Jednak w globalnej sieci internetowej (drogerie archiwalne, stare karty produktów, fora kosmetyczne) nadal funkcjonują nieaktualne wpisy ze starym składem sprzed reformulacji z 2022 roku. W rezultacie Agent 1 (OSINT Researcher) napotykał konfliktowe źródła składów INCI:
1. Skład stary (z Lilialem / Butylphenyl Methylpropional).
2. Skład nowy po reformulacji (bez Lilialu).

Dotychczasowy mechanizm orkiestratora liczył podobieństwo Jaccarda i w razie braku 85% spójności wstrzymywał potok błędem `OSINT_CONFLICTING_INCI_MAX_RETRYS`, lub dopuszczał ryzyko zaciągnięcia wycofanej, nielegalnej w UE receptury.

## Wdrożone Rozwiązanie

### 1. Walidatory Domenowe (`src/modules/offer-optimizer-v2/validators/index.js`)
- Rozszerzono listę substancji zakazanych `gate1` w funkcji `gate_ingredients()` o:
  - `'butylphenyl methylpropional'`
  - `'lilial'`
  - `'p-bmhca'`
  - `'2-(4-tert-butylbenzyl)propionaldehyde'`
- Zaimplementowano i wyeksportowano dedykowaną funkcję heurystyczną:
  ```javascript
  const LILIAL_REGEX = /\b(butylphenyl[\s-]*methylpropional|lilial|p[\s-]*bmhca|2-\(4-tert-butylbenzyl\)propionaldehyde)\b/i;
  function hasBannedLilial(str) {
      if (!str || typeof str !== 'string') return false;
      return LILIAL_REGEX.test(str);
  }
  ```

### 2. Normalizacja Bazy RAG (`src/modules/offer-optimizer-v2/normalization.js`)
- Do listy `gate1` włączono Butylphenyl Methylpropional oraz synonimy, co uniemożliwia wyciek lub zaindeksowanie tej substancji do bazy wiedzy składników kosmetycznych SoT.

### 3. Orkiestrator EAN Pipeline (`src/modules/offer-optimizer-v2/orchestrator.js`)
- W fazie ewaluacji kandydatów INCI zebranych przez Agenta 1 wdrożono automatyczny filtr reformulacji przed analizą podobieństwa Jaccarda:
  ```javascript
  if (candidates.length > 0) {
      const legalCandidates = candidates.filter(c => !hasBannedLilial(c));
      if (legalCandidates.length > 0 && legalCandidates.length < candidates.length) {
          const discarded = candidates.filter(c => hasBannedLilial(c));
          console.log(`[Orchestrator V2] Odrzucono ${discarded.length} starych/wycofanych wariantów INCI zawierających zakazany BUTYLPHENYL METHYLPROPIONAL (Lilial, zakaz UE od 2022). Pozostało ${legalCandidates.length} wariantów nowej formuły.`);
          traceInci(this.gtin, 'A1_DISCARDED_LILIAL_CANDIDATES', discarded);
          candidates = legalCandidates;
      } else if (legalCandidates.length === 0 && candidates.some(c => hasBannedLilial(c))) {
          console.warn(`[Orchestrator V2] Wszyscy kandydaci INCI (${candidates.length}) zawierają zakazany BUTYLPHENYL METHYLPROPIONAL (Lilial). Wymagana reformulacja lub weryfikacja HITL.`);
          traceInci(this.gtin, 'A1_ALL_CANDIDATES_HAVE_LILIAL', candidates);
      }
  }
  ```
- Dzięki temu, jeśli OSINT odnajdzie mix starej i nowej receptury, stara wycofana wersja jest natychmiast odrzucana, a orkiestrator procesuje wyłącznie legalną, aktualną formułę.

### 4. Baza Promptów Agenta 1 i Shared Rules (`Agent_1_prompt_v4.md`, `SHARED_RULES_v4.1.md`)
- Dodano twardy wymóg: `WYMÓG KRYTYCZNY 4 (ROZPOZNAWANIE REFORMULACJI I ZAKAZ BUTYLPHENYL METHYLPROPIONAL / LILIAL)` do promptu Agenta 1 (`Agent_1_prompt_v4.md`). Agent ma nakaz traktowania wariantów ze składnikiem Lilial jako starej receptury i bezwzględny obowiązek jej odrzucania na rzecz aktualnej formuły.
- Zaktualizowano `§I. BRAMKI SKŁADNIKOWE` w `SHARED_RULES_v4.1.md`.
- Zrekompilowano prompty do katalogu `prompts/` przez `node prompt-compiler.js`.

### 5. Zestaw Testów Jednostkowych i Regresyjnych
- Rozszerzono `src/modules/offer-optimizer-v2/tests/validators.test.js`, `tests/gate.test.js` oraz `tests/gate_12.test.js`.
- Zweryfikowano działanie `hasBannedLilial` dla wariantów wielkości liter, myślników, spacji i pełnych ciągów INCI.
- Wszystkie 171 testów w potoku zakończyły się wynikiem pozytywnym (0 błędów).

## Konsekwencje
- Wyeliminowano ryzyko publikacji na Allegro i e-commerce ofert z nielegalnym, wycofanym składem kosmetyków.
- Zlikwidowano fałszywe pętle rewizyjne i niepotrzebne postoje HITL dla zreformułowanych produktów europejskich.
- Zachowano pełną zgodność prawną z Rozporządzeniem UE 1223/2009 i Rozporządzeniem Komisji (UE) 2021/1902.
