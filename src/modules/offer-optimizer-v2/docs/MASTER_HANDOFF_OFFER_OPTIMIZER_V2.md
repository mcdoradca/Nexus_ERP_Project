# MASTER HANDOFF — PROJEKT OFFER-OPTIMIZER-V2 (NEXUS ERP)

# Dokument samowystarczalny: nowa sesja agenta NIE potrzebuje żadnej historii

# rozmów. Zastępuje i rozszerza HANDOFF\_SESJA\_2.md. W razie sprzeczności między

# tym dokumentem a kodem/gitem — GIT MA RACJĘ. W razie sprzeczności z raportami

# poprzednich sesji — TEN DOKUMENT MA RACJĘ (raporty sesji 1 były niewiarygodne).

═══════════════════════════════════════════════════════════════════

## 1\. KONTEKST BIZNESOWY (niezmienne tło)

═══════════════════════════════════════════════════════════════════

* Nexus ERP: duży system (ok. 32 agentów AI w wielu modułach). PROGRAM JEST
W PRODUKCJI — sprzedaż działa z niego na żywo.
* Zakres prac: WYŁĄCZNIE moduł `src/modules/offer-optimizer/` (potok ofert
EAN → Allegro) i jego następca `offer-optimizer-v2`. Pozostałe moduły
(portfolio-manager, influencers, logistics, communication, allegro-ads itd.)
= ZAKAZ ANALIZY I ZMIAN.
* Asortyment: chemia domowa, kosmetyki, biocydy. BEZPIECZEŃSTWO LUDZI I
ZGODNOŚĆ PRAWNA (GPSR, CLP, Omnibus, AI Act, 1223/2009, BPR) MAJĄ PRIORYTET
NAD KAŻDĄ OSZCZĘDNOŚCIĄ. Wątpliwość = STOP + pytanie do operatora.
* Cel projektu: potok 10 agentów (A1–A10) generujący oferty Allegro — tani
w tokenach, w pełni zgodny prawnie, z twardą telemetrią kosztów.

═══════════════════════════════════════════════════════════════════

## 2\. HISTORIA W PIGUŁCE (dlaczego jesteśmy tu, gdzie jesteśmy)

═══════════════════════════════════════════════════════════════════

1. Prompty v3.1 (10 węzłów) przepalały tokeny: brak kontroli myślenia modeli,
schematy Draft-07 w treści promptów, tranzyt całego HTML przez węzły
generatywne, martwe referencje do usuniętego Agenta 3, duplikacja reguł.
2. Powstał pakiet refaktoryzacyjny v4/v4.1 (pliki w repo: files/) — patrz
indeks w §8.
3. Sesja wdrożeniowa nr 1 (agent w Antigravity) ZDRYFOWAŁA: raportowała
wykonanie prac, których git nie potwierdza. Raporty sesji 1 są
NIEWIARYGODNE jako całość.
4. Git freeze (commit c49c3ea) ujawnił stan faktyczny — patrz §3.
5. DECYZJA OPERATORA (ostateczna): stary moduł = KWARANTANNA (code freeze,
produkcja z niego żyje do przełączenia). Nowy moduł offer-optimizer-v2
= budowa OD ZERA wg pakietu v4.1. Frontend bez zmian do cutovera.
Stary moduł zostanie USUNIĘTY W CAŁOŚCI po przepięciu — dlatego NIE
naprawiamy w nim niczego.

═══════════════════════════════════════════════════════════════════

## 3\. FAKTY ZWERYFIKOWANE vs NIEZWERYFIKOWANE (fundament epistemiczny)

═══════════════════════════════════════════════════════════════════

### 3A. ZWERYFIKOWANE (git / oficjalna dokumentacja / telemetria) — buduj na tym:

* GIT, commit c49c3ea "freeze: stan przed resetem...", gałąź
freeze/legacy-offer-optimizer. Statystyka: 35 plików, +2107/−10, w tym
JEDYNE zmienione pliki kodu: ai.service.js i compile\_sot.js (drobne zmiany);
offer-optimizer.controller.js NIETKNIĘTY. Wniosek: z prac sesji 1 w kodzie
istnieje co najwyżej ułamek — szczegóły w plikach diff (jeśli operator je
wygenerował: audyt\_sesja1\_ai\_service.diff, audyt\_sesja1\_compile\_sot.diff).
* SDK: @google/generative-ai (JS) = END-OF-LIFE. Nowy moduł WYŁĄCZNIE na
@google/genai. Przed pierwszą linią kodu: weryfikacja bieżącej wersji
i składni w dokumentacji sieciowej.
* Sterowanie myśleniem Gemini 3.x: parametr thinkingLevel (enum), NIE
thinkingBudget (ten jest legacy i miesza się z levelem → błędy/nieprzewidywalność;
oba naraz = HTTP 400). Flash 3.x: minimal/low/medium/high (domyślnie medium).
Pro 3.x: TYLKO low/high (domyślnie high). Pełne wyłączenie myślenia w 3.x
NIE ISTNIEJE. Zweryfikowany dowód telemetryczny: Pro na "low" ≈ 76 tokenów
myślenia vs \~10 000 na domyślnym high.
* Baseline telemetrii (kokpit, przed zmianami) — plik BASELINE\_TELEMETRIA.md.
Kluczowe: \~40% kosztu potoku to były tokeny myślenia na domyślnych
poziomach; A4 miał wzorzec 4708 promptu → 52 odpowiedzi (passthrough
produktów niechemicznych za pełną stawkę).
* Reguły HTML Allegro wg RAG\_SOT\_01 (jedyne źródło prawdy): dozwolone TYLKO
h1,h2,p,ul,ol,li,b. ZAKAZ <br> (akapity przez osobne <p>), ZAKAZ <strong>,
ZAKAZ  **wewnątrz nagłówków. SHARED\_RULES\_v4.1 jest z tym zgodny;
SHARED\_RULES\_v4.md (bez .1) jest BŁĘDNY i nieobowiązujący.**
* Decyzja operatora: CAŁKOWITY ZAKAZ jawnego context cache (CachedContent/
caches.create/TTL) — program pracuje nieregularnie, opłaty za utrzymanie
cache w postoju > zyski. Implicit cache po stronie Google jest poza naszą
kontrolą i bez opłat postojowych — ignorować, nie zarządzać.
* W bazie telemetrii istnieją agentId spoza kanonicznej listy (m.in.
Agent\_3\_SEOTitle, Agent\_Title, Agent\_AEO, Test\_Agent...) — dowód, że stary
moduł wykonywał wywołania LLM poza architekturą kanoniczną.

### 3B. NIEZWERYFIKOWANE (raporty sesji 1 — traktuj jako HIPOTEZY):

* Tabela audytu 22 wywołań LLM (AUDYT\_LLM\_OFFER\_OPTIMIZER.md), TRACE ścieżki
analyzeSingle → generateNativeAnalysis, klasyfikacje reliktów, stringi
modeli per węzeł, twierdzenie o wdrożonych logowaniach Legacy\_\*.
Raporty zawierały udokumentowane sprzeczności wewnętrzne.
* HIPOTEZA O WYSOKIM PRIORYTECIE (prawdopodobna, niepotwierdzona w kodzie):
stary moduł ma ścieżkę/ścieżki generujące treść ofert Z POMINIĘCIEM
sanityzacji prawnej (A5/A10), chronione jedynie filtrem regex. NIE naprawiamy
tego (kwarantanna) — ale przy inwentaryzacji kontraktów (Etap E0) należy
ustalić, KTÓRE endpointy konsumowane przez frontend serwują treść ofertową,
bo to one wyznaczają zakres cutovera i priorytet bezpiecznika chemii (§5).
Zasada: żadnej hipotezy z 3B nie wolno użyć jako podstawy decyzji bez
potwierdzenia odczytem kodu plik:linia.

═══════════════════════════════════════════════════════════════════

## 4\. OBOWIĄZUJĄCE DECYZJE OPERATORA (nie podlegają dyskusji)

═══════════════════════════════════════════════════════════════════
OP-1: Zakaz jawnego cache (szczegóły w 3A).
OP-2: Stary moduł offer-optimizer = kwarantanna/code freeze. Jedyny
dopuszczalny wyjątek NA OSOBNĄ KOMENDĘ: flaga env FAST\_PATH\_CHEMISTRY\_GUARD
(produkty sds\_required==true lub kategorie chemiczne/biobójcze na starych
ścieżkach → HTTP 409 "użyj pełnego potoku"). Domyślnie: nieaktywna.
OP-3: v2 = greenfield na @google/genai. Zakaz kopiowania kodu ze starego
modułu. Stary kod wolno CZYTAĆ wyłącznie dla kontraktów zewnętrznych.
OP-4: Frontend nietykalny do cutovera; przepięcia endpoint po endpoincie
za zgodą operatora; usunięcie starego modułu = ostatni etap.
OP-5: Relikty w innych modułach Nexusa — poza zakresem, nietykalne.
OP-6: Migracja bazy (RAG v2): wyłącznie addytywna (ADD COLUMN nullable/
default), backup przed, `npx prisma migrate dev --name rag\\\_v2\\\_metadata`
(nie db push), dopiero w etapie E3.
OP-7: C2PA: bez instalowania bibliotek — stub zwracający
C2PA\_CHECK\_UNAVAILABLE traktowany jako OSTRZEŻENIE, nigdy jako "metadane OK".
Podmiana na bibliotekę = decyzja operatora.
OP-8: Jedna sesja agenta = jeden etap planu (§6). Po etapie: raport, commit,
koniec sesji. Kontynuacja w świeżej sesji z tym dokumentem + jednozdaniową
aktualizacją stanu w §9.

═══════════════════════════════════════════════════════════════════

## 5\. INWARIANTY BEZPIECZEŃSTWA (złamanie = STOP + raport, bez wyjątków)

═══════════════════════════════════════════════════════════════════
S-1: Zwroty H/P, hasła ostrzegawcze (NIEBEZPIECZEŃSTWO/UWAGA), kod UFI,
podmiot odpowiedzialny GPSR — nigdy nie usuwane, nie łagodzone, nie
parafrazowane. Po wygenerowaniu przez A6 sekcje 3/5/6 są zamrażane hashem
SHA-256 i NIE przechodzą przez żaden model generatywny; verify\_frozen przed
eksportem; mismatch = twarda blokada.
S-2: Bramki składnikowe zatrzymują potok (nie ostrzegają): GATE-1 substancje
zakazane/CMR (SOT 04 §1), GATE-2 substancje lecznicze w "kosmetyku" =
INGREDIENT\_NOT\_COSMETIC (SOT 06 §2 — ketokonazol, hydrochinon, tretinoina,
antybiotyki, kortykosteroidy, EGF/FGF; firma NIE handluje lekami),
GATE-3 składnik nieznany = UNKNOWN\_INGREDIENT\_NEEDS\_LOOKUP → pomiń w opisie,
zakaz zgadywania.
S-3: Brak karty SDS przy sds\_required==true = twarde zatrzymanie potoku.
S-4: Agent 5 (LegalSanitizer) zawsze na modelu klasy Pro z thinkingLevel
"high". Zakaz "optymalizowania" tego węzła.
S-5: Reguły prawne i czarne listy NIGDY przez similarity search — wyłącznie
deterministyczne prefiksy statyczne (RAG\_ORCHESTRATION §0). RAG służy
tylko słownikom składnikowym.
S-6: Listy zakazanych słów/substancji kopiowane 1:1 z SHARED\_RULES\_v4.1 —
nie rozszerzane, nie skracane "z własnej wiedzy".
S-7: Każde wywołanie LLM loguje się do ai.metrics.service z jawnym agentId;
wywołanie bez logowania = błąd blokujący merge.
S-8: Zakaz dark patterns (fałszywa pilność, profilowanie lękowe); Pratfall
tylko na prawdziwym ograniczeniu z PIM/opinii; liczby surowcowe z SOT 05/06
nie są claimami o produkcie bez dowodu w PIM (SHARED\_RULES §J).

═══════════════════════════════════════════════════════════════════

## 6\. PLAN OD POCZĄTKU DO KOŃCA (etapy = sesje; DoD = definition of done)

═══════════════════════════════════════════════════════════════════
E0 — KONTRAKTY + WERYFIKACJA API (read-only)
Zadania: (1) `git log` + `git diff freeze/legacy-offer-optimizer --stat` —
potwierdź czysty punkt startu; (2) KONTRAKTY\_V2.md: endpointy HTTP
konsumowane przez frontend (routing + kształt request/response z kodu),
pola bazy używane przez stary moduł (schema.prisma), format eksportu
BaseLinker — plus oznaczenie, które endpointy serwują TREŚĆ OFERTOWĄ
(wejście do decyzji o OP-2/bezpieczniku); (3) WERYFIKACJA\_API\_V2.md:
z aktualnej dokumentacji sieciowej — wersja @google/genai, składnia
thinkingConfig/thinkingLevel, responseSchema, dostępne stringi modeli,
sposób odczytu usageMetadata.
DoD: oba pliki + akceptacja operatora. ZERO kodu w tym etapie.
E1 — SZKIELET V2
Zadania: struktura modułu offer-optimizer-v2; klient @google/genai;
konfiguracja per węzeł (model + thinkingLevel wg 3A: A1/A2/A4/A9→minimal,
A6/A7→low, A5→high, A8/A10→low); wrapper wywołań z OBOWIĄZKOWĄ telemetrią
(S-7) i responseSchema; składanie promptów \[blok stały wg MAPY DYSTRYBUCJI
SHARED\_RULES v4.1]+\[dane SKU na końcu], bez cache (OP-1); prompty ładowane
z files/ jako v4+PATCH v4.1 (kompilacja deterministycznym skryptem
z weryfikacją bajtową i licznikiem polskich diakrytyków — sesja 1 miała
awarię kodowania na polskich znakach).
DoD: wywołanie testowe 1 węzła flash i 1 pro z dowodem usageMetadata
(thoughts≈0 dla minimal); git diff w raporcie.
E2 — WALIDATORY KODOWE I BRAMKI (zero LLM)
Zadania wg 00\_PLAN §2 + SHARED\_RULES v4.1: ean\_checksum, route\_chemical
(A4 wywoływany TYLKO dla chemii), scan\_stopwords (§A), leksykon medyczny
(§D), validate\_html\_whitelist (§B: tylko h1,h2,p,ul,ol,li,b; bez br/strong;
bez b w nagłówkach), diff\_numeric PIM↔HTML, emoji\_structure\_check (§C),
bramki GATE-1/2/3 (§I), c2pa stub (OP-7), freeze/verify\_frozen (S-1).
DoD: testy jednostkowe każdego walidatora (przypadki z dokumentacji) zielone.
E3 — WARSTWA RAG V2
Zadania: migracja addytywna (OP-6); wdrożenie knowledge.rag.service.v2.js;
ingest SOT deterministyczny (bez transformacji treści przez LLM!) z
metadanymi wg RAG\_ORCHESTRATION §1; getKnowledgeForIngredients w
orkiestratorze (top-8 INCI + 100% substancji bramkowych); prefiksy
statyczne per węzeł wg mapy dystrybucji.
DoD: zapytanie testowe per moduł SOT zwraca chunki z poprawnymi metadanymi;
chunki typu GATE/RULE nieobecne w puli retrieval.
E4 — PEŁNY POTOK A1–A10
Zadania: orkiestrator-kod (maszyna stanowa wg Agent\_0\_prompt\_v4.md);
sekwencja faz; A7 w trybie diff (wejście/wyjście tylko s1/s2/s4);
A10 w trybie semantycznym z repair\_patches; pętla rewizyjna per sekcja,
max 2 iteracje; eskalacje HITL.
DoD: 1 SKU testowy (chemiczny, z CLP) przechodzi cały potok end-to-end
z kompletem artefaktów i logów telemetrii.
E5 — TEST A/B 50 SKU
Skład próby obowiązkowo: ≥5 produktów z klasyfikacją CLP, ≥1 biocyd
z pozwoleniem, ≥1 produkt niechemiczny, ≥1 bez opinii w sieci (cold start).
Pełny przegląd HITL każdej oferty. Porównanie kosztów z BASELINE.
DoD: raport rozbieżności + akceptacja operatora treści i kosztów.
E6 — CUTOVER
Przepięcie frontendu endpoint po endpoincie (każde za osobną zgodą
operatora), zaczynając od ścieżek serwujących treść ofertową dla chemii.
Nowy baseline telemetrii po pełnym przełączeniu.
DoD: 100% ruchu ofertowego na v2; stary moduł bez wywołań przez ≥ okres
ustalony z operatorem.
E7 — ROZBIÓRKA
Usunięcie starego modułu w całości (kod, routing, relikty, croni) +
czyszczenie martwych agentId w dashboardzie (filtr, nie kasowanie
historycznych rekordów). Retrospektywa: koszt/SKU v2 vs BASELINE.
DoD: repo bez src/modules/offer-optimizer/ (stara wersja żyje już tylko
na gałęzi freeze), raport końcowy.

═══════════════════════════════════════════════════════════════════

## 7\. ZASADY PROCESOWE (wnioski z dryfu sesji 1 — bezwzględne)

═══════════════════════════════════════════════════════════════════
Z-1: Raport bez `git diff --stat` (i pełnego diffa plików krytycznych) NIE
PODLEGA OCENIE. Diff to fakt, raport to opinia.
Z-2: Jedna wiadomość = jedno zadanie; jedna sesja = jeden etap (OP-8).
Zakaz pracy wyprzedzającej.
Z-3: Każde twierdzenie o kodzie ma referencję plik:linia z AKTUALNEGO
odczytu. Zakaz raportowania z pamięci.
Z-4: Parametry API — decyzja wyłącznie po weryfikacji w bieżącej
dokumentacji sieciowej (precedens: thinkingBudget vs thinkingLevel).
Z-5: Zero własnej inwencji; jedyny wyjątek = adaptacja do struktury repo,
obowiązkowo wpisana do DECISION\_LOG.md w formacie:
\[data] | dokumentacja: X | repo wymaga: Y | decyzja: Z | ryzyko: ...
Z-6: Brak danych ≠ zgadywanie: TODO z komentarzem //HITL: + wpis w raporcie.
Z-7: Rozjazd raport↔git wykryty przez operatora lub agenta = natychmiastowy
STOP i korekta, nie "dokończenie najpierw zadania".

═══════════════════════════════════════════════════════════════════

## 8\. INDEKS PLIKÓW PAKIETU (kanoniczna lokalizacja: src/modules/offer-optimizer/files/)

═══════════════════════════════════════════════════════════════════

* PROMPT\_WDROZENIOWY\_ANTIGRAVITY.md — protokół faz i żelazne zasady (nadal
obowiązuje; fazy 1-4 protokołu mapują się na etapy E1-E4 greenfieldu).
* 00\_PLAN\_REFAKTORYZACJI\_v4.md — architektura docelowa. UWAGA: sekcje o cache
NIEWAŻNE (OP-1); tabela §3 podaje thinkingBudget — obowiązuje mapowanie na
thinkingLevel z §3A tego dokumentu.
* SHARED\_RULES\_v4.1.md — wspólne reguły (§A–§J) + MAPA DYSTRYBUCJI per węzeł.
SHARED\_RULES\_v4.md (bez .1) = NIEWAŻNY, do usunięcia z files/.
* Agent\_0…10\_prompt\_v4.md + PATCH\_v4.1\_prompty.md — prompt węzła = v4 + patch
nakładany DOSŁOWNIE. Agent 3 nie istnieje (usunięty z architektury).
* RAG\_ORCHESTRATION\_v4.1.md — podział wiedzy statyczna/dynamiczna, macierz
routingu SOT→węzły, protokół pobrania, rozstrzygnięte konflikty K1–K7.
* knowledge.rag.service.v2.js — wzorzec serwisu RAG (chunking semantyczny,
metadane, getKnowledgeForIngredients) + migracja SQL w nagłówku.
* RAG\_SOT\_01…10 + INCI\_i\_ich\_dzialanie.md — wiedza merytoryczna (prawo,
słowniki INCI/chemii, psychologia). SOT = źródło prawdy merytorycznej;
ingest bez transformacji przez LLM.
* BASELINE\_TELEMETRIA.md — pomiar sprzed zmian (ważny). DECISION\_LOG\_legacy.md
— archiwum sesji 1 (kontekst historyczny, nie źródło faktów).

═══════════════════════════════════════════════════════════════════

## 9\. STAN BIEŻĄCY (operator aktualizuje 1-2 zdaniami przed każdą nową sesją)

═══════════════════════════════════════════════════════════════════
\[2026-07-31] E2 zamknięty (commity 2b270da, 1ce0632; walidatory V1–V10

\+ testy zielone; pakiet wsadowy zalegalizowany w offer-optimizer-v2/docs/

jako lokalizacja kanoniczna). Model Pro = gemini-3.1-pro-preview

(ratyfikacja Architekta, re-weryfikacja ListModels przed E5 i E6).

Etap bieżący: E3 wg INSTRUKCJA\_E3.md — bramka startowa: komplet plików

RAG\_SOT\_01…10 + INCI\_i\_ich\_dzialanie.md w docs/ (dostarcza operator).

