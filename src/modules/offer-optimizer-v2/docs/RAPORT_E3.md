# RAPORT E3 (CZĘŚCIOWY) — WARSTWA RAG V2

## Status
Etap E3 został WSTRZYMANY w kroku 2 z powodu rozbieżności schematu bazy danych z historią migracji Prisma (Prisma Drift). Następuje eskalacja HITL.

## §0 Bramka Startowa
- Potwierdzono obecność kompletu 11 plików źródłowych SOT (`RAG_SOT_01...10` oraz `INCI_i_ich_dzialanie.md`) w kanonicznej lokalizacji `src/modules/offer-optimizer-v2/docs/`.

## §1 Adaptacja Serwisu RAG na @google/genai
- **Zrealizowano**: Skrypt `knowledge.rag.service.js` utworzono w nowym module ze zaktualizowaną składnią `@google/genai`.
- Użyto modelu `gemini-embedding-2` z konfiguracją parametru `outputDimensionality: 768`.
- Wektor sprawdzono empirycznie - długość wygenerowanego wektora to 768.

## §2 Migracja Bazy (ZABLOKOWANA)
- **INCIDENT LOG (Rozjazd Raport ↔ Rzeczywistość - Reguła Z-7)**: W pierwszej wersji raportu zgłoszono "backup OK, 14.8 MB". Stan faktyczny: plik został utworzony poprzez strumień PowerShell (`>`), co mogło uszkodzić kodowanie i skutkowało brakiem dostępu / użyteczności dla operatora. Zgodnie z wytycznymi, zakwalifikowano to jako naruszenie zasady Z-7. 
  - **Korekta**: Wykonano backup od nowa za pomocą twardego montowania wolumenu hosta. Komenda: `docker run --rm -v Z:\Nexus_ERP_Project:/backup postgres:17-alpine pg_dump 'postgresql://***:***@aws-1-eu-west-1.pooler.supabase.com:5432/postgres' -f /backup/db_backup_pre_e3.sql`.
  - **Dowody poprawności zrzutu**:
    - **(a) Rozmiar i data na hoście**:
      ```text
      Mode                 LastWriteTime         Length Name
      ----                 -------------         ------ ----
      -a----        30.07.2026     11:57       26338132 db_backup_pre_e3.sql
      ```
    - **(b) Pierwsze 10 linii pliku**:
      ```text
      --
      -- PostgreSQL database dump
      --

      \restrict lvkQgO0a0hxoRz5Lo5YFmqd1ysBxzbyvMMvcIxrv3LoRGrxP6ZevLmfd3C1fhl9

      -- Dumped from database version 17.6
      -- Dumped by pg_dump version 17.10

      SET statement_timeout = 0;
      ```
    - **(c) Dowód obecności KnowledgeDocument (pierwsze 3 linie)**:
      ```text
      db_backup_pre_e3.sql:3912:-- Name: KnowledgeDocument; Type: TABLE; Schema: public; Owner: postgres
      db_backup_pre_e3.sql:3915:CREATE TABLE public."KnowledgeDocument" (
      db_backup_pre_e3.sql:3925:ALTER TABLE public."KnowledgeDocument" OWNER TO postgres;
      ```
- Aktualizacja pliku `schema.prisma` włączająca w trybie nullable/default nowo wymagane pola do modelu `KnowledgeDocument` została pomyślnie nałożona.
- **[HITL / BLOKADA]**: Polecenie `npx prisma migrate dev --name rag_v2_metadata` zakończyło się błędem *Drift detected*. Prisma odmawia wygenerowania nowej migracji w trybie dev bez operacji resetowania instancji bazy danych (co wiązałoby się z utratą danych produkcyjnych/stanowych z pozostałych tabel w użyciu). Instrukcja Z-7 jednoznacznie zakazuje naprawiania bazy bez weryfikacji i zabrania użycia komendy `db push`. 
  - Log Prisma CLI: `Drift detected: Your database schema is not in sync with your migration history.`
  - Wymagana autoryzacja operatora, jak postąpić w obliczu dryftu (np. wykonanie naprawy przez `prisma migrate resolve` lub zezwolenie na `--accept-data-loss` / wygenerowanie SQL-a poza Prisma).

## Stan przed wznowieniem (Tabela Statusu Odtworzenia)
| Punkt | Instrukcja | Status | Dowód / Wynik |
|---|---|---|---|
| 1. | Redakcja connection stringa w RAPORT_E3.md | NIEZROBIONE | Hasło było obecne w pliku w linii 16. |
| 2. | Grep historii gita po sekrecie | ZROBIONE | Sekretu nie ma w commitach. |
| 3. | Czyszczenie .agents/.ai-memory.md i plików temp | NIEZROBIONE | .ai-memory.md czysty, ale db_backup_pre_e3.sql posiada wpisy URL. |
| 4. | git check-ignore -v db_backup_pre_e3.sql | ZROBIONE | Output: False (nie ignorowany). |
| 5. | Wpis ZASADY STAŁEJ o sekretach do DECISION_LOG | NIEZROBIONE | Brak wpisu. |
| 6. | Czy plik sql/rag_v2_metadata.sql istnieje? | ZROBIONE | NIE ISTNIEJE. |
| 7. | Czy prisma db execute został JUŻ wykonany? | ZROBIONE | NIE. Baza jest absolutnie nietknięta. |
| 8. | Czy npx prisma generate był uruchomiony? | ZROBIONE | NIE. |
| 9. | §3 ingest SOT | NIEZROBIONE | Zgodnie z przewidywaniami. |
| 10. | §4 testy retrieval | NIEZROBIONE | Brak wykonania. |
| 11. | §5 porównanie list bramkowych SOT↔walidatory | NIEZROBIONE | Brak wykonania. |
| 12. | git status + git log --oneline -3 | ZROBIONE | Odtworzono surowy zrzut z niezacommitowanymi zmianami.

## §2 Porządki Repo (ZATRZYMANO)
- **Analiza diff kompilatów**: Wykonano komendę `git diff src/modules/offer-optimizer-v2/prompts/Agent_5_compiled.md src/modules/offer-optimizer-v2/prompts/Agent_10_compiled.md`.
  - **Wynik**: Wykryto zmianę stringa wywołania z `gemini-3.1-pro-preview` NA `gemini-3.1-pro`.
  - **Wyjaśnienie**: Zmiana ta polega na usunięciu dopisku `-preview` ze skompilowanych plików. Najpewniej operator/skrypt kompilacyjny użył starszych źródeł promptów (bez poprawki) nadpisując ratyfikowaną wersję z E1.
  - **Akcja [HITL]**: Zgodnie z wytyczną: *"Jeśli zmiana jest zgodna z decyzją E1 (gemini-3.1-pro-preview) — commituj. Jeśli cokolwiek innego — STOP i raport."* - **ZATRZYMUJĘ POTOK**. Zmiana nie jest zgodna z decyzją E1 (przywraca niedostępny w API model Pro).

## §3, §4, §5
Prace uzależnione od wykonania prawidłowej migracji (§2). Uruchomienie skryptu ingestyjnego możliwe dopiero po modyfikacji tabeli bazodanowej (inaczej SQL insert zwróci błąd istnienia kolumn `sotModule`, itd.).

## DECISION LOG (Nowe wpisy)
5. **Adaptacja SDK dla serwisu RAG**: Migracja wywołania `_getEmbeddings` do `ai.models.embedContent` (`gemini-embedding-2`, `outputDimensionality: 768`).
6. **Blokada migracji bazy przez Prisma Drift**: Wstrzymanie (STOP) z uwagi na konieczność zachowania danych bazy i instrukcję w Z-7 nakazującą odłożenie działania.

## git log --oneline -6
```text
3654457 feat(offer-optimizer-v2): E3 serwis RAG v2 (oczekuje na migracje po usunieciu drifty)
1ce0632 fix(offer-optimizer-v2): E2 fix — UTF-8 snapshot, testy uzupelnione, wyjasnienia
2b270da chore(offer-optimizer-v2): legalizacja przeniesienia pakietu wsadowego do v2/docs (decyzja operatora, ratyfikacja architekta)
879b193 feat(offer-optimizer-v2): E2 walidatory kodowe + bramki + testy
2a19c00 fix(offer-optimizer-v2): E1 final — model Pro wg ListModels, dowod diakrytykow zrodlo-kompilat
e7fcf96 fix(offer-optimizer-v2): E1 domknięcie — SDK, kompilaty A2/A8, dowody
```

## git show --stat (ostatni commit)
```text
commit 365445720eb0a911768d5263fcc698f375da3986
Author: Antigravity AI <ai@antigravity.dev>
Date:   Thu Jul 30 11:47:18 2026 +0200

    feat(offer-optimizer-v2): E3 serwis RAG v2 (oczekuje na migracje po usunieciu drifty)

 prisma/schema.prisma                               |   5 +
 .../offer-optimizer-v2/docs/DECISION_LOG.md        |   6 +
 .../offer-optimizer-v2/knowledge.rag.service.js    | 252 +++++++++++++++++++++
 3 files changed, 263 insertions(+)
```
