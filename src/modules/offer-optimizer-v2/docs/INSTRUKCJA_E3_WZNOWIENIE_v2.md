# INSTRUKCJA_E3_WZNOWIENIE v2 — DOKOŃCZENIE ETAPU E3
# ZASTĘPUJE INSTRUKCJA_E3_WZNOWIENIE (v1) W CAŁOŚCI — v1 anulowana.
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E3_WZNOWIENIE.md
# PODSTAWA: Twoja tabela synchronizacji stanu — PRZYJĘTA i ratyfikowana.
# §1 (synchronizacja) uznaję za WYKONANE; wklej tę tabelę do RAPORT_E3.md
# jako sekcję "Stan przed wznowieniem" i nie powtarzaj jej.
# Hasło bazy ZROTOWANE przez operatora, .env zaktualizowany. Baza odblokowana.
# Wynik: docs/RAPORT_E3.md (FINALNY, zastępuje częściowy) + commity wg §7.

## 0. ZASADA STAŁA — REDAKCJA SEKRETÓW (od teraz bezwzględnie)
W raportach, DECISION_LOG, commit messages, .ai-memory i plikach tymczasowych
credentiale zapisujesz jako `***`: `postgresql://***:***@host:port/db`.
Sekret mieszka WYŁĄCZNIE w .env. Dowód komendy z sekretem = ta sama komenda
z `***`. Zakaz wklejania haseł/tokenów/kluczy jako "dowodu wykonania".

## 1. HIGIENA BEZPIECZEŃSTWA — NAJPIERW, PRZED CZYMKOLWIEK INNYM
Kolejność sztywna. Zakaz `git add .`, `git add -A` i `git push` do końca §1.
a) Redakcja: w RAPORT_E3.md (linia ~16) i wszędzie indziej zamień
   connection string na `postgresql://***:***@aws-1-eu-west-1.pooler.
   supabase.com:5432/postgres`. Potwierdź grepem po fragmencie hasła
   w całym drzewie roboczym (bez .env): oczekiwane 0 trafień poza .env.
b) .gitignore — dopisz (jeśli brak): `db_backup_pre_e3.sql`, `*.sql.gz`,
   `*_backup_*.sql`, `.env`, `.env.*`. Dowód: `git check-ignore -v
   db_backup_pre_e3.sql` → oczekiwane trafienie reguły (poprzednio: False).
   Sprawdź też, czy .env nie jest już śledzony: `git ls-files | findstr .env`.
c) Zrzut bazy zawiera dane produkcyjne — po zakończeniu E3 operator go
   przeniesie poza repo; do tego czasu chroni go .gitignore.
d) DECISION_LOG: wpis ZASADY STAŁEJ z §0 + odnotowanie incydentu wycieku
   (z redakcją!) i faktu, że sekret nigdy nie trafił do commita ani na
   origin (gałąź 9 commitów przed remote — potwierdzone).
e) Commit higieniczny: `chore(security): redakcja sekretu w raporcie
   + gitignore dla zrzutow bazy`. DOPIERO po tym commicie wolno robić
   kolejne `git add` w tym etapie.

## 2. PORZĄDKI REPO (wiszące zmiany z okresu przerwań)
a) `git diff src/modules/offer-optimizer-v2/prompts/Agent_5_compiled.md
   src/modules/offer-optimizer-v2/prompts/Agent_10_compiled.md` — pokaż,
   co się zmieniło, i wyjaśnij w raporcie (oczekiwane: string modelu Pro
   po rekompilacji ze zmienionych ścieżek). Jeśli zmiana jest zgodna
   z decyzją E1 (gemini-3.1-pro-preview) — commituj. Jeśli cokolwiek
   innego — STOP i raport.
b) MASTER_HANDOFF (modified) = edycja §9 przez operatora — commituj bez zmian
   treści, w komunikacie odnotuj "aktualizacja §9 przez operatora".
c) Skrypty pomocnicze: strip_bom.js i verify_hashes.js przenieś do
   src/modules/offer-optimizer-v2/tools/ i commituj (użyteczne narzędzia).
   append2.js — wyjaśnij jednym zdaniem, czym jest; jeśli to artefakt
   jednorazowy, usuń. Zakaz zostawiania nieopisanych skryptów w repo.
d) Untracked dokumentacja etapów (INSTRUKCJA_E2*, INSTRUKCJA_E3*,
   RAPORT_E2*, RAPORT_E3) — commituj do docs/ (to ślad decyzyjny projektu).

## 3. PLIKI POZA PAKIETEM KANONICZNYM — KLASYFIKACJA (HITL, nie ingestuj)
W docs/ pojawiły się dwa pliki nieobecne w indeksie pakietu i w macierzy
routingu RAG_ORCHESTRATION §1:
- "PLAYBOOK AGENTA 8 — SSOT 6.0"
- Wytyczne_AI_Opisy_Produktow_i_Allegro_2026_V2.md
Decyzja Architekta: NIE ingestujesz ich w tym etapie (brak przypisania
sotModule/targetAgents = brak podstawy routingu; S-5 zakazuje improwizacji
w warstwie wiedzy). Wypisz je w raporcie jako HITL do klasyfikacji przez
operatora/Architekta. Zakaz zgadywania ich roli.

## 4. MIGRACJA ADDYTYWNA (decyzja Architekta — odstępstwo od OP-6)
Stan potwierdzony: baza nietknięta, brak pliku SQL, brak prisma generate.
Zakaz: migrate dev, migrate reset, db push, --accept-data-loss,
migrate resolve, zmian historii migracji. Drift NIE jest naprawiany
ani diagnozowany (relikt starego modułu — kwarantanna).
a) Bramka: test połączenia po rotacji hasła — `npx prisma db execute
   --stdin --schema prisma/schema.prisma` z wejściem `SELECT 1;`.
   Błąd auth → odczekaj kilka minut (propagacja resetu) i powtórz;
   nadal błąd → STOP, HITL (możliwa druga linia z hasłem w .env,
   np. DIRECT_URL). Output (z redakcją) do raportu.
b) Utwórz sql/rag_v2_metadata.sql o treści DOKŁADNIE:
   ALTER TABLE "KnowledgeDocument"
     ADD COLUMN IF NOT EXISTS "sotModule"    text,
     ADD COLUMN IF NOT EXISTS "targetAgents" text[],
     ADD COLUMN IF NOT EXISTS "chunkType"    text DEFAULT 'DICTIONARY_ENTRY';
   CREATE INDEX IF NOT EXISTS idx_kd_module ON "KnowledgeDocument"("sotModule");
c) `npx prisma db execute --file sql/rag_v2_metadata.sql --schema
   prisma/schema.prisma`.
d) Weryfikacja: SELECT z information_schema.columns dla KnowledgeDocument —
   surowy output (3 nowe kolumny + typy). Potem `npx prisma generate`.
e) DECISION_LOG: [data] | OP-6 wymaga: migrate dev | rzeczywistość: drift
   produkcyjnej bazy (relikt db push starego modułu) | decyzja Architekta:
   addytywny idempotentny SQL przez db execute, historia migracji nietknięta
   | ryzyko: brak wpisu w historii Prisma — baseline historii = osobne
   zadanie po E7, poza potokiem.

## 5. INGEST SOT (deterministyczny, zero LLM na treści)
UWAGA TECHNICZNA: nazwy plików SOT zawierają SPACJE i polskie diakrytyki
(np. "RAG_SOT_10_Składniki Chemii Domowej i Przemysłowej.md"). ZAKAZ
wyznaczania sotModule przez parsowanie nazwy pliku — zbuduj w ingest_sot.js
JAWNĄ tabelę mapowania: ścieżka pliku → sotModule → targetAgents[] →
domyślny chunkType, wg macierzy RAG_ORCHESTRATION §1. Nie zmieniaj nazw
plików (własność operatora); obsłuż je poprawnie w kodzie (ścieżki
w cudzysłowach, odczyt jako UTF-8).
a) Mapowanie chunkType: bloki prawa/bramek wskazane w RAG_ORCHESTRATION §0
   (SOT 01 §3–4, SOT 02 §3 i §1C, SOT 03 §1–2, SOT 04 §1, SOT 06 §2,
   SOT 08 §0+§3, SOT 09 §1–2) = GATE lub RULE; słowniki (SOT 05,
   SOT 06 §3, SOT 07 §2, SOT 10, INCI_i_ich_dzialanie) = DICTIONARY_ENTRY;
   pozostałe sekcje = CONTEXT.
b) Treść chunków 1:1 ze źródła (chunking semantyczny robi serwis) — zakaz
   streszczania, poprawiania, tłumaczenia.
c) Wersjonowanie tytułów: SOT_XX@v2026.07.
d) Telemetria embeddingu: agentId 'Node0_Ingest/embedding'.
e) Dowód: output getGroupedDocuments() (tytuły wersjonowane + liczby
   chunków per dokument) + łączna liczba chunków i tokenów embeddingu
   z telemetrii.

## 6. TESTY RETRIEVAL (DoD etapu — node:test) + LISTY BRAMKOWE
T1 zapytanie per moduł słownikowy → chunki z poprawnymi sotModule/chunkType,
   similarity ≥ 0.72.
T2 filtr sotModules odcina inne moduły.
T3 chunki GATE/RULE nie są serwowane jako wynik agentom słownikowym; serwis
   loguje ostrzeżenie, gdy trafią do wyników — test potwierdza ostrzeżenie.
T4 getKnowledgeForIngredients: [znany składnik, 'Xyzabc Extract'] → nieznany
   w unknownIngredients (GATE-3).
T5 charBudget przycina blok RAG.
Surowy output runnera do raportu.
§6b BEZPIECZEŃSTWO: porównaj substancje z SOT 04 §1 i SOT 06 §2 z listami
w validators/index.js (GATE-1: 6, GATE-2: 12 wg SHARED_RULES §I). Różnice
WYPISZ jako HITL — zakaz samodzielnego rozszerzania list (S-6).

## 7. ZAMKNIĘCIE
Commity w tej kolejności:
(1) `chore(security): redakcja sekretu w raporcie + gitignore dla zrzutow bazy`
(2) `chore(offer-optimizer-v2): porzadki repo — kompilaty, narzedzia, docs`
(3) `feat(offer-optimizer-v2): E3 migracja addytywna RAG metadata`
(4) `feat(offer-optimizer-v2): E3 ingest SOT + testy retrieval`
RAPORT_E3.md FINALNY zawiera: tabelę stanu przed wznowieniem, outputy
§1–§6, INCIDENT LOG (backup + wyciek sekretu, z redakcją), wpisy
DECISION_LOG, HITL (pliki z §3 + różnice list z §6b), czego nie
zweryfikowano, `git log --oneline -8`, `git diff --stat` per commit.
ZAKAZ `git push` w tym etapie (decyzja Architekta — push po akceptacji).
Wykonuj §1–§6 bez przystanków; STOP przy nowej rozbieżności lub na końcu.
Zakaz pracy nad E4.
