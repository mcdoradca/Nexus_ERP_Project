# ADR-0170: Fabric Softener Rinse Cycle Ontology & Technological Sanitizer (v4.15)

## Status
Accepted

## Kontekst
W generowanych przez potok Offer Optimizer v2 opisach płynów do płukania tkanin (*ammorbidente*) ujawnił się krytyczny błąd pojęciowo-technologiczny polegający na traktowaniu płynów do płukania jak detergentów piorących:
1. **Błędne jednostki wydajności:** Płyn do płukania tkanin nie pierze i nie usuwa zabrudzeń. Odpowiada za kondycjonowanie włókien w ostatniej fazie cyklu pralki (płukanie). Podawanie fraz takich jak „65 prań”, „Wydajność deklarowana: 65 prań”, „cykle prania” wprowadzało kupujących w błąd technologiczny.
2. **Kalki pojęciowe w leadzie, zaletach i FAQ:** Stosowanie zwrotów „środek piorący”, „po każdym praniu”, „rozpuszczanie zabrudzeń” w kontekście płynu zmiękczającego.
3. **Pytania FAQ w Filarze 3 i 4:** Zadawanie pytań o odplamianie lub skuteczność w usuwaniu plam zamiast o miękkość tkanin, ochronę włókien, redukcję elektryzowania się ubrań, ułatwienie prasowania oraz wydajność mierzoną w cyklach płukania.

## Decyzja Architektoniczna

### 1. Rozróżnienie domenowe: Czysty płyn do płukania vs Detergent 2w1
Wprowadzono bezwzględną klasyfikację ontologiczną:
- **Czysty płyn do płukania tkanin (`isSoftener` / `isFabricSoftener`):**
  - Kryteria: Wykrycie słów `płyn[a-ząćęłńóśźż]* do płukania`, `ammorbidente`, `zmiękczacz[a-ząćęłńóśźż]* do tkanin`, `koncentrat[a-ząćęłńóśźż]* do płukania`.
  - Wykluczenie detergentów: Brak w nazwie/kontekście fraz `płyn[a-ząćęłńóśźż]* do prania`, `żel[a-ząćęłńóśźż]* do prania`, `prosz[a-ząćęłńóśźż]* do prania`, `kapsułk[a-ząćęłńóśźż]* do prania`, `2w1`, `2 in 1`, `detersivo`.
  - Rezultat: Bezwzględny nakaz stosowania terminologii „cykle płukania” / „płukania” zamiast „prania”.
- **Detergenty piorące oraz środki 2w1 (`2w1`, `detersivo con ammorbidente`):**
  - Zachowują jednostkę „prań”, ponieważ aktywnie piorą tkaniny.

### 2. Silnik Deterministyczny (`deterministic-pipeline.engine.js`)
- **Sekcja 5 (Parametry techniczne):**
  - Automatyczne przekształcenie parametru wydajności z „prań” na „cykli płukania” z pełną odmianą fleksyjną PWN:
    - `1` -> `1 cykl płukania`
    - Końcówki `2, 3, 4` (z wyłączeniem `12, 13, 14`) -> `${n} cykle płukania` (np. `22 cykle płukania`, `62 cykle płukania`)
    - Pozostałe -> `${n} cykli płukania` (np. `65 cykli płukania`)
- **Sanityzator HTML (`sanitizeHtmlClaimsAndStopwords`):**
  - Dodano KROK I dedykowany dla płynów do płukania:
    - `\d+\s*prań` -> odmiana PWN `cykli płukania`
    - `cykl([a-ząćęłńóśźż]*)\s+prania` -> `cykl$1 płukania` (np. `cyklach płukania`, `cyklu płukania`)
    - `po każdym praniu` -> `po każdym płukaniu`
    - `podczas prania` -> `podczas płukania tkanin`
    - `środek piorący` / `detergent piorący` -> `płyn do płukania tkanin`
    - `usuwa plamy/brud/zabrudzenia` -> `zmiękcza włókna i chroni tkaniny`

### 3. Usługa FAQ SEO/AEO (`google-suggest-faq.service.js`)
- W Filarze 3 i 4 dla kategorii `fabric_softener` i `laundry_perfume`:
  - Przebudowano szablony pytań i odpowiedzi, aby skupiały się na:
    - Zmiękczaniu włókien, ułatwianiu prasowania i redukcji ładunków elektrostatycznych
    - Wydajności wyrażonej w cyklach płukania (`Na ile cykli płukania wystarcza opakowanie...`)

### 4. Walidator Merytoryczny (`validators/index.js`) – Reguła 15
- Dodano regułę 15 w `validate_domain_and_chemical_logic`:
  - Sprawdza, czy w tekście czystego płynu do płukania nie pozostały frazy: `\b\d+\s*prań\b`, `cykl[a-ząćęłńóśźż]* prania`, `po każdym praniu`, `środ(ek|ka|kiem) piorąc(ym|ego)`.
  - W razie wykrycia zgłasza błąd: `[Błąd pojęciowo-technologiczny] Płyn do płukania tkanin (ammorbidente) nie jest detergentem piorącym.`

### 5. Swarm Agentów LLM (Prompty Agenta 6, 10 i 11)
- **Agent 6 (Copywriter):** Dodano regułę domenową zakazującą używania słów „prań” dla płynów do płukania.
- **Agent 11 (Domain & Technical Fact-Checker):** Wprowadzono test ontologiczny płynu do płukania w punkcie audytu chemicznego.
- **Agent 10 (Senior QA Auditor):** Dodano bramkę walidacyjną blokującą zatwierdzenie opisu zawierającego błędy pojęciowe płukania vs prania.

## Konsekwencje
- Wyeliminowano ryzyko wprowadzania konsumentów w błąd na marketplace Allegro.
- Zapewniono pełną zgodność ze sztuką technologiczną chemii gospodarczej oraz słownikiem branżowym.
- Płyny 2w1 zachowują poprawną specyfikację detergentu.

