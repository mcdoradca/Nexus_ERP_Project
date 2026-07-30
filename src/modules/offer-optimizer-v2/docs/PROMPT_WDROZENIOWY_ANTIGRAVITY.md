# PROMPT WDROŻENIOWY DLA AGENTA (ANTIGRAVITY) — REFAKTORYZACJA NEXUS ERP v4.1
# Wklej całość jako zadanie/spec dla agenta. Pliki pakietu dołącz do workspace.

---

## TWOJA ROLA
Jesteś inżynierem wdrożeniowym. Wykonujesz refaktoryzację potoku Nexus ERP
(Allegro pipeline, węzły 0–10) ściśle według dostarczonej dokumentacji.
NIE jesteś architektem tego rozwiązania — architektura już istnieje i została
zatwierdzona. Twoja praca to przeniesienie jej do kodu i konfiguracji.

## ŻELAZNE ZASADY (obowiązują przez cały czas trwania zadania)
1. **ZERO WŁASNEJ INWENCJI:** nie dodajesz funkcji, reguł, pól, walidacji ani
   "ulepszeń", których nie ma w dokumentacji. Nie parafrazujesz treści promptów
   agentów — kopiujesz je 1:1 z plików.
2. **JEDYNY WYJĄTEK — ADAPTACJA DO STRUKTURY REPO:** jeśli dokumentacja zakłada
   coś, co w repo wygląda inaczej (inne ścieżki, nazwy serwisów, schemat Prisma,
   sposób wywoływania Gemini, format konfiguracji), wolno Ci dostosować SPOSÓB
   implementacji, ale nie TREŚĆ reguł. Każdą taką adaptację obowiązkowo wpisujesz
   do pliku `DECISION_LOG.md` w formacie:
   `[data] | dokumentacja mówi: X | repo wymaga: Y | decyzja: Z | ryzyko: ...`
   Jeśli adaptacja dotknęłaby czegokolwiek z sekcji INWARIANTY BEZPIECZEŃSTWA —
   STOP, nie implementuj, opisz problem w DECISION_LOG i zakończ turę raportem.
3. **ZAKAZ MODYFIKACJI PLIKÓW ŹRÓDŁOWYCH:** plików RAG_SOT_01…10,
   INCI_i_ich_dzialanie.md oraz plików pakietu v4/v4.1 nie edytujesz. To wsad.
4. **PRACA FAZAMI Z CHECKPOINTAMI:** po każdej fazie zatrzymujesz się, generujesz
   raport (co zrobione, co pominięte, wpisy DECISION_LOG) i czekasz na akceptację
   operatora przed kolejną fazą. Nie wykonujesz kilku faz w jednym rzucie.
5. **BRAK DANYCH ≠ ZGADYWANIE:** jeśli czegoś nie ma w dokumentacji ani w repo
   (np. klucz API, nazwa środowiska, wartość progu), zostawiasz TODO z komentarzem
   `// HITL:` i wpisujesz do raportu. Nie wymyślasz wartości.
6. **CAŁKOWITY ZAKAZ CACHE (DECYZJA OPERATORA — NADRZĘDNA WOBEC DOKUMENTACJI):**
   nie implementujesz ŻADNEJ formy context cachingu Gemini. W szczególności:
   zakaz tworzenia obiektów CachedContent / wywołań caches.create, zakaz
   parametru cachedContent w wywołaniach, zakaz ustawiania TTL. Jeśli w repo
   istnieje już jakiekolwiek użycie cache — USUŃ je w Fazie 1 i odnotuj w
   DECISION_LOG. Wszystkie wzmianki o cache'owaniu w dokumentacji pakietu
   (00_PLAN §1/§3/§5, nagłówki promptów Agent_1…10 "Cache prefiksu: TAK",
   RAG_ORCHESTRATION §0) są NIEWAŻNE i nie podlegają wdrożeniu — operator nie
   wyraził zgody (program pracuje nieregularnie, z długimi przerwami; opłaty
   za utrzymanie cache w czasie postoju przewyższyłyby oszczędności).
   Struktura promptu [prefiks statyczny] + [dane SKU na końcu] POZOSTAJE —
   porządkuje składanie promptów w kodzie — ale bez rejestrowania prefiksu
   w jakimkolwiek mechanizmie cache i bez wymogu identyczności bajt-w-bajt.

---

## FAZA 0 — REKONESANS (READ-ONLY, zero edycji)
Cel: zbudować mapę zgodności dokumentacja ↔ repo, ZANIM cokolwiek zmienisz.

**Tura 1 — przeczytaj w tej kolejności:**
1. `00_PLAN_REFAKTORYZACJI_v4.md` — architektura docelowa i kolejność wdrożenia.
   UWAGA: wszystkie fragmenty dotyczące cache'owania (wiersz tabeli §1 "Cache
   martwy", kolumna "Cache prefiksu" w §3, krok 2 w §5, metryka
   cachedContentTokenCount w §6) czytasz wyłącznie informacyjnie — NIE wdrażasz
   (żelazna zasada 6).
2. `SHARED_RULES_v4.1.md` — UWAGA: wersja v4.1 **zastępuje w całości**
   `SHARED_RULES_v4.md`. Plik v4.0 traktuj jako nieistniejący (zawiera błędne
   reguły HTML: dopuszczał `<br>` i `<strong>` — v4.1 je zakazuje wg SOT 01).
3. `Agent_0_prompt_v4.md` … `Agent_10_prompt_v4.md` (bez Agenta 3 — usunięty).

**Tura 2 — przeczytaj w tej kolejności:**
4. `RAG_ORCHESTRATION_v4.1.md` — warstwa wiedzy: podział statyczny/dynamiczny,
   macierz routingu modułów SOT, protokół pobrania, konflikty K1–K7.
5. `knowledge.rag.service.v2.js` — docelowy kod serwisu RAG (zastępuje
   `knowledge.rag.service.js` z repo).
6. `PATCH_v4.1_prompty.md` — poprawki nakładane NA prompty v4 z tury 1.
   Kolejność obowiązywania: **prompt v4 + patch v4.1 = wersja ostateczna.**
7. Pliki `RAG_SOT_01…10` + `INCI_i_ich_dzialanie.md` — czytasz do zrozumienia
   kontekstu i do ingest; NIE wdrażasz z nich reguł bezpośrednio (routing reguł
   określa RAG_ORCHESTRATION §1 i SHARED_RULES — nic ponadto).

**Hierarchia przy sprzecznościach:** SOT (prawo/reguły merytoryczne) >
RAG_ORCHESTRATION v4.1 > PATCH v4.1 > prompty v4 > plan v4.0. Wykrytą sprzeczność
nieopisaną w K1–K7 wpisujesz do DECISION_LOG i STOP dla tego fragmentu.

**Produkt Fazy 0 (bez zmian w kodzie):** plik `MAPA_WDROZENIA.md`:
- inwentarz repo: gdzie są wywołania Gemini per agent, gdzie prompty, gdzie
  orkiestrator, schemat tabeli KnowledgeDocument, miejsce logowania telemetrii
  (aiMetricsService),
- tabela: [element planu] → [plik/moduł w repo] → [istnieje / do utworzenia /
  konflikt],
- lista rozbieżności wymagających decyzji operatora.
⛔ CHECKPOINT: czekasz na akceptację mapy.

---

## FAZA 1 — QUICK WINS (konfiguracja, zero zmian logiki)
Zakres wyłącznie z `00_PLAN` §3 i §5 pkt 1:
a) `thinkingConfig.thinkingBudget` per węzeł wg tabeli §3 (A1/A2/A8/A9: 0;
   A4: 0–512; A6/A7: 512; A5: 1024–2048; A10: 1024). Tylko parametry wywołań.
b) Usunięcie WSZYSTKICH referencji do Agent_3_SEOTitle: enumy, schematy stanu,
   wejście `node_3_title` w A10, hard-faile w Node 0, routing. Wyszukaj w repo
   frazy: `Agent_3`, `SEOTitle`, `node_3_title`, `generated_title`,
   `character_count_with_spaces` — każde wystąpienie: usuń lub oznacz
   `// HITL:` jeśli usunięcie łamie kontrakt API, którego nie widzisz w całości.
c) Skan repo pod istniejące użycia cache Gemini (frazy: `cachedContent`,
   `caches.create`, `CachedContent`, `ttl`) — każde wystąpienie usuń wraz
   z kodem zarządzającym TTL; wpis do DECISION_LOG (żelazna zasada 6).
d) NIC więcej. Nie ruszasz promptów, RAG, walidatorów.
⛔ CHECKPOINT + raport (spodziewany efekt w telemetrii: thoughtsTokenCount
spada o rząd wielkości dla węzłów z budżetem 0; cachedContentTokenCount
trwale = 0).

## FAZA 2 — ODCHUDZENIE PROMPTÓW + STRUCTURED OUTPUT (BEZ CACHE)
a) Przebuduj składanie promptów w kodzie: [blok stały: rola + sekcje
   SHARED_RULES v4.1 wg MAPY DYSTRYBUCJI + instrukcje] + [dane SKU na końcu].
   To wyłącznie porządek składania w kodzie orkiestratora — ŻADNEGO mechanizmu
   cache (żelazna zasada 6). Prompt płacony pełną stawką przy każdym wywołaniu,
   dlatego blok stały ma być MINIMALNY: tylko sekcje SHARED_RULES faktycznie
   przypisane danemu węzłowi w MAPIE DYSTRYBUCJI, nic ponad to.
b) Podmień prompty agentów na wersje: v4 z zaaplikowanym PATCH v4.1. Patch
   nakładasz DOSŁOWNIE — punkt po punkcie z `PATCH_v4.1_prompty.md`, bez
   redagowania po swojemu. Z nagłówków promptów usuń linie "Cache prefiksu"
   i adnotacje o cache'owaniu (martwe dyrektywy po decyzji operatora).
c) Schematy wyjściowe przenieś do `responseSchema` (structured output) — pola
   wg sekcji WYJŚCIE każdego promptu. Usuń schematy Draft-07 z treści promptów.
   Przy zakazie cache to główna dźwignia redukcji promptTokens w tej fazie.
⛔ CHECKPOINT (metryka: promptTokens per węzeł spada vs baseline z dashboardu —
oczekiwane ok. 20–40% z usunięcia schematów i skrócenia promptów;
cachedContentTokenCount pozostaje = 0).

## FAZA 3 — WALIDATORY KODOWE + ROUTING CHEMII
Implementacja wg `00_PLAN` §2 + `Agent_0_prompt_v4.md`:
ean_checksum, route_chemical (A4 wywoływany TYLKO dla chemii),
scan_stopwords (§A), scan_medical_claims_lexical (§D), validate_html_whitelist
(§B v4.1: tylko h1,h2,p,ul,ol,li,b; bez br/strong; bez b w nagłówkach),
diff_numeric, emoji_structure_check (§C), c2pa_check, bramki GATE-1/2/3 (§I).
Listy słów/substancji kopiujesz 1:1 z SHARED_RULES v4.1 — nie uzupełniasz
o "podobne" słowa z własnej wiedzy.
⛔ CHECKPOINT + testy jednostkowe walidatorów (przypadki z dokumentacji).

## FAZA 4 — RAG v2 + FREEZE/DIFF
a) Wdróż `knowledge.rag.service.v2.js` (migracja SQL z nagłówka pliku),
   zaktualizuj wywołania w repo. Ingest wszystkich SOT z metadanymi wg
   RAG_ORCHESTRATION §1 (sotModule, targetAgents, chunkType; wersjonowanie @).
b) Node 0: getKnowledgeForIngredients przed FAZĄ 2 potoku (top-8 INCI + 100%
   substancji bramkowych), budżety wg §2.
c) freeze_sections (SHA-256 s3/s5/s6 po A6) + A7 na wejściu/wyjściu tylko
   s1/s2/s4 + merge w kodzie + verify_frozen przed eksportem.
d) A10: wejście bez s3/s5/s6, naprawy jako repair_patches, aplikacja patchy
   w kodzie.
⛔ CHECKPOINT KOŃCOWY: test A/B na 50 SKU (w tym obowiązkowo: ≥5 produktów
z klasyfikacją CLP, ≥1 biocyd z pozwoleniem, ≥1 produkt niechemiczny,
≥1 z pustym sentymentem) z pełnym przeglądem HITL przed przełączeniem produkcji.

---

## INWARIANTY BEZPIECZEŃSTWA (nienaruszalne — złamanie = STOP + raport)
1. Zwroty H/P, hasła ostrzegawcze, UFI, podmiot odpowiedzialny GPSR: żaden krok
   wdrożenia nie może ich usunąć, złagodzić ani przepuścić przez model generatywny
   po zamrożeniu (freeze s5/s6).
2. Bramki GATE-1 (substancje zakazane SOT 04 §1) i GATE-2 (leki SOT 06 §2)
   zatrzymują potok. Nie wolno ich zmiękczyć do ostrzeżenia.
3. Agent 5 pozostaje na modelu Pro z budżetem myślenia — zakaz "optymalizacji"
   tego węzła do flash/0.
4. Brak SDS przy sds_required=true = twarde zatrzymanie, bez wyjątków.
5. Reguły prawne i czarne listy NIGDY przez similarity search — wyłącznie
   deterministyczne prefiksy (RAG_ORCHESTRATION §0).
6. Listy zakazanych słów/substancji: kopiowane, nie rozszerzane i nie skracane.

## FORMAT RAPORTU PO KAŻDEJ FAZIE
1. Zakres wykonany (lista plików zmienionych, per plik: co i dlaczego — z
   referencją do punktu dokumentacji, np. "00_PLAN §2 / SHARED_RULES §B").
2. Wpisy DECISION_LOG z tej fazy.
3. Elementy pominięte / TODO HITL z powodem.
4. Proponowany test weryfikacyjny fazy.
Zakaz w raportach: twierdzeń o zgodności, której nie zweryfikowałeś testem
lub odczytem kodu ("powinno działać" → napisz, czego nie sprawdziłeś).
