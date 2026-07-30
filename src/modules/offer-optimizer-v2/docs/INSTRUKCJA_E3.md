# INSTRUKCJA_E3 — WARSTWA RAG V2
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E3.md
# Jedna sesja = ten etap (OP-8). Wynik: docs/RAPORT_E3.md + commit(y).
# Źródła: MASTER_HANDOFF §6/E3 + OP-6, RAG_ORCHESTRATION_v4.1 (całość),
# knowledge.rag.service.v2.js (wzorzec), PATCH v4.1 pkt 9–11 dla Node 0.
# Zakaz pracy nad E4 (orkiestrator, potok, wywołania agentów).

## 0. BRAMKA STARTOWA — INWENTARZ PLIKÓW SOT (blokująca)
Pakiet w docs/ zawiera 18 plików — BEZ RAG_SOT_01…10, INCI_i_ich_dzialanie.md
i BASELINE_TELEMETRIA.md. Bez SOT nie ma czego ingestować.
a) Przeszukaj repo: `git ls-files | grep -i "SOT"` + wyszukanie na dysku
   (RAG_SOT*, INCI*). Wypisz znalezione ścieżki.
b) Pliki znalezione → operator przenosi/potwierdza lokalizację docelową
   docs/ (nie przenoś sam — zasada z DECISION_LOG: lokalizacje zmienia
   operator). Pliki NIEZNALEZIONE → STOP, raport częściowy, HITL: operator
   dostarcza pliki. Bez kompletu SOT wykonujesz z tego etapu wyłącznie §1–§2.

## 1. ADAPTACJA SERWISU RAG NA @google/genai (jedyna dozwolona adaptacja)
Wzorzec knowledge.rag.service.v2.js używa EOL-owego @google/generative-ai
i modelu 'gemini-embedding-2'. Logika (chunking, metadane, wersjonowanie,
getKnowledgeForIngredients, progi, budżety) = kopiowana 1:1. Adaptujesz
WYŁĄCZNIE warstwę wywołań embeddingu:
a) Zweryfikuj w LISTMODELS_SNAPSHOT.md + dokumentacji @google/genai:
   dostępny model embeddingowy i składnię wywołania (ai.models.embedContent
   lub równoważna w SDK 2.14.0) + parametr wymiarowości. Empirycznie:
   jedno wywołanie testowe, surowy fragment odpowiedzi (długość wektora)
   do raportu.
b) WYMIAR WEKTORA: odczytaj z schema.prisma / bazy wymiar kolumny embedding
   w KnowledgeDocument (oczekiwane vector(768) — wzorzec używa
   outputDimensionality 768). Wymiar embeddingu MUSI się równać wymiarowi
   kolumny. Rozjazd → STOP, DECISION_LOG, decyzja Architekta.
c) Telemetria embeddingu: logUsage z agentId '<węzeł zlecający>/embedding'
   (PATCH pkt 11); przy ingest: 'Node0_Ingest/embedding'.
d) DECISION_LOG: wpis o adaptacji SDK (format żelaznej zasady 2).
Serwis zapisz jako src/modules/offer-optimizer-v2/knowledge.rag.service.js
(moduł v2; nie modyfikuj starego serwisu w starym module — OP-2).

## 2. MIGRACJA BAZY (OP-6 — rygor pełny)
a) Backup bazy PRZED migracją. Jeśli nie masz narzędzia/uprawnień do
   backupu (pg_dump lub równoważne) — STOP, HITL: backup wykonuje operator,
   dopiero potem migracja. Zakaz migracji bez potwierdzonego backupu.
b) Migracja WYŁĄCZNIE addytywna, dokładnie wg nagłówka wzorca:
   ADD COLUMN IF NOT EXISTS sotModule text, targetAgents text[],
   chunkType text DEFAULT 'DICTIONARY_ENTRY' + indeks idx_kd_module.
   Wykonanie: `npx prisma migrate dev --name rag_v2_metadata` (NIE db push).
   Zaktualizuj schema.prisma o te pola (nullable/default — zero zmian
   w istniejących kolumnach).
c) Dowód: SQL wygenerowanej migracji + `\d "KnowledgeDocument"` (lub
   odpowiednik Prisma) po migracji — do raportu.

## 3. INGEST SOT (deterministyczny — ZERO transformacji treści przez LLM)
Wykonaj tylko przy komplecie plików z §0.
a) Skrypt ingest_sot.js: dla każdego pliku SOT wywołuje ingestDocument
   z metadanymi wg RAG_ORCHESTRATION §1 (macierz routingu: sotModule,
   targetAgents[], chunkType) i wersją (SOT_XX@v2026.07). Mapowanie
   moduł→typ chunków: bloki bramek/prawa wskazane w §0 RAG_ORCHESTRATION
   (SOT 01 §3–4, SOT 02 §3/§1C, SOT 03 §1–2, SOT 04 §1, SOT 06 §2,
   SOT 08 §0+§3, SOT 09 §1–2) = chunkType GATE lub RULE; słowniki
   (SOT 05, SOT 06 §3, SOT 07 §2, SOT 10, INCI_i_ich_dzialanie) =
   DICTIONARY_ENTRY; reszta = CONTEXT.
b) Treść chunków = tekst źródłowy 1:1 (chunking semantyczny robi serwis;
   zakaz streszczania, poprawiania, tłumaczenia).
c) Dowód ingestu: output getGroupedDocuments() — tytuły wersjonowane,
   liczby chunków per dokument.

## 4. TESTY RETRIEVAL (DoD etapu — node:test, jak w E2)
T1 Zapytanie testowe per moduł słownikowy (np. 'Niacinamide' → SOT 06/INCI;
   składnik chemii domowej → SOT 10/07): zwraca chunki z poprawnymi
   sotModule/chunkType, similarity ≥ 0.72.
T2 Filtr modułów działa: zapytanie z sotModules=['SOT_06'] nie zwraca
   chunków innych modułów.
T3 Chunki GATE/RULE: wyszukiwanie ogólne NIE serwuje ich jako wyniku dla
   agentów słownikowych, a serwis loguje ostrzeżenie, gdy jednak trafią
   do wyników (mechanizm wzorca). Test potwierdza obecność ostrzeżenia.
T4 getKnowledgeForIngredients: lista testowa [znany składnik, nieznany
   składnik 'Xyzabc Extract'] → znany dostaje wpisy, nieznany ląduje
   w unknownIngredients (bramka GATE-3, kod statusu z E2).
T5 Budżet znakowy respektowany (charBudget przycina blok).
Surowy output runnera do raportu.

## 5. WERYFIKACJA KOMPLETNOŚCI LIST BRAMKOWYCH (bezpieczeństwo, S-2/S-6)
Po ingest SOT 04 §1 i SOT 06 §2: porównaj listy substancji z SOT z listami
zaszytymi w validators/index.js (GATE-1: 6, GATE-2: 12 z SHARED_RULES §I).
SOT zawiera substancje nieobecne w walidatorze → NIE dopisuj ich sam (S-6);
wypisz różnice w raporcie jako HITL — listę rozszerza decyzja Architekta
po odczycie SOT. To kontrola, czy §I ("m.in.") nie jest podzbiorem
przemilczającym substancje z SOT.

## 6. ZAMKNIĘCIE
Commity: (1) `feat(offer-optimizer-v2): E3 serwis RAG v2 + migracja addytywna`,
(2) `feat(offer-optimizer-v2): E3 ingest SOT + testy retrieval` (drugi tylko
przy komplecie SOT). RAPORT_E3.md: outputy §0–§5, wpisy DECISION_LOG,
TODO/HITL, czego nie zweryfikowano, git log --oneline -6, git diff --stat.
STOP — akceptacja Architekta przed E4.
