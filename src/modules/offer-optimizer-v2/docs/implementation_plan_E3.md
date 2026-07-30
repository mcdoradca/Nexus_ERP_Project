# Ostateczne Domknięcie E3 (FIX3)

Celem tej iteracji jest przebudowa mechanizmu zabezpieczenia (GATE-3) ze wskaźników prawdopodobieństwa (similarity) na deterministyczny indeks nazw, poprawa idempotencji i atomizacji wgrywania słowników oraz organizacja skryptów operacyjnych.

## User Review Required

> [!IMPORTANT]  
> Proszę o akceptację poniższego planu przed rozpoczęciem implementacji kodowej i migracji bazy. Zmiany dotkną schematu bazy danych i fundamentalnego działania serwisu RAG.

## Open Questions

> [!WARNING]  
> Pytanie dotyczące Prisma: Czy dodanie kolumny `entryName` ma zostać wykonane tylko komendą `$executeRaw` (w sposób addytywny, niefizjologiczny dla Prisma schema), czy zaktualizować również plik `schema.prisma` aby aplikacja TypeScript/Prisma Client widziała tę kolumnę podczas ew. zapytań obiektowych (jeśli takowe istnieją)? Zgodnie z wytycznymi w "2a" wykonam to skryptem SQL / Prisma Execute, aby nie inicjować procesu migracji (jak to miało miejsce wcześniej). 

## Proposed Changes

---

### Baza Danych (KnowledgeDocument)

#### [MODIFY] schema.prisma (lub raw SQL)
Wykonanie dodania kolumny:
```sql
ALTER TABLE "KnowledgeDocument" ADD COLUMN IF NOT EXISTS "entryName" text;
CREATE INDEX IF NOT EXISTS idx_kd_entryname ON "KnowledgeDocument"("entryName");
```

---

### Serwis RAG i Ingest

#### [MODIFY] knowledge.rag.service.js
- Zmiana `_chunkMarkdown` na wyłączenie `CHUNK_MIN` (scalania) dla modułów słownikowych. Jeden nagłówek/wpis = jeden chunk.
- Zmodyfikowanie `ingestDocument` na idempotentne. Usunięcie starych wpisów dla pliku *przed* dokonaniem INSERTA, z zabezpieczeniem transakcyjnym/logicznym.
- Ekstrakcja zdefiniowanego pierwszego wiersza/nagłówka na `entryName` z normalizacją.
- Wdrożenie symetrycznego prefiksu np. `Składnik INCI: {nazwa}`.
- Przebudowanie `getKnowledgeForIngredients`, aby w pierwszej kolejności sprawdzał, czy wyciąg po znormalizowanej nazwie jest obecny w bazie po `entryName`.

#### [MODIFY] ingest.js
- Dostosowanie wywołań i upewnienie się, że prawidłowo wrzuca metadane, na bazie których `_chunkMarkdown` zadecyduje o dzieleniu (np. dodatkowy parametr określający czy moduł to słownik).

---

### Testy i Skrypty Narzędziowe

#### [MODIFY] tests/test_retrieval.js (i testy powiązane)
- Uaktualnienie asercji na deterministyczne GATE-3.
- Test charBudget.
- Skrypt weryfikujący pokrycie (`entryName` vs. ilość wpisów w SOT).
- Skrypt weryfikujący idempotencję.

#### [DELETE/MOVE] Skrypty w root dir
- Przeniesienie skryptów: `run_update.js`, `run_hygiene.js`, `run_inventory.js`, `run_measurement.js`, `run_headers.js` do katalogu `src/modules/offer-optimizer-v2/scripts/`.

---

### Dokumentacja i Raport

#### [MODIFY] RAPORT_E3_FIX2.md
- Usunięcie fałszywych placeholderów.

#### [MODIFY] DECISION_LOG.md
- Dopisanie wpisów o deterministycznym GATE-3 (po indeksie nazw) oraz polityce commitów (tylko ASCII).

#### [NEW] RAPORT_E3_FIX3.md
- Surowe wyjścia testów i skryptów zgodne z sekcjami 4 i 5 instrukcji.

## Verification Plan

### Automated Tests
1. Uruchomienie skryptów testujących pokrycie indeksu (oczekiwane >95%).
2. Test podwójnego uruchomienia `ingest.js` dla idempotencji.
3. Test retrievala udowadniający deterministyczne odsianie nieznanych składników (z oboma progami: 0.60 i 0.72) przy pomocy `getKnowledgeForIngredients`.

### Manual Verification
Oczekuję manualnej akceptacji raportu i testów w ramach raportu weryfikującego Etap E3 przez Architekta.
