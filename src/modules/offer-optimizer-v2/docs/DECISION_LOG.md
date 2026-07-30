# DECISION LOG - ARCHITEKTURA V2

## [2026-07-30] Etap E1
1. **Endpoint `/regenerate-title`**: Decyzja architektoniczna: Endpoint zostaje jako wƒôze≈Ç kompatybilno≈õciowy dla frontendu. V2 zrealizuje go bez wskrzeszania Agenta 3. Tytu≈Ç bƒôdzie derywowany deterministycznie z danych potoku (h1/s1 + PIM). Implementacja zaplanowana na Etap E4, przepiƒôcie w Etapie E6.
2. **String modelu Pro (LegalSanitizer A5/A10)**: 
   2026-07-30 | pakiet v4.1: gemini-3.1-pro (404) | API: brak stabilnego Pro dostƒôpnego dla konta | decyzja Architekta: gemini-3.1-pro-preview dla A5/A10 | ryzyko: model preview ‚Äî obowiƒÖzkowa re-weryfikacja ListModels przed E5 i przed E6.
   Dow√≥d blokady gemini-2.5-pro (SUROWY b≈ÇƒÖd API):
   `ApiError: {"error":{"code":404,"message":"This model models/gemini-2.5-pro is no longer available to new users. Please update your code to use a newer model for the latest features and improvements.","status":"NOT_FOUND"}}`
3. **Konwersja encodingu: LISTMODELS_SNAPSHOT.md**:
   2026-07-30 | dokumentacja: PowerShell UTF-16 | repo wymaga: UTF-8 bez BOM | decyzja: skrypt konwersji | ryzyko: ZASADA STA≈ÅA: wszystkie pliki projektu = UTF-8 bez BOM.

*(Dodatkowe logi decyzyjne bƒôdƒÖ dodawane w kolejnych etapach potoku).*

## [2026-07-30] Etap E2 Fix
4. **Przeniesienie pakietu files/ do docs/**:
   2026-07-30 | pakiet files/: hash historyczny b6b68bc | docs/: 4a15895 | decyzja Architekta: wersja docs/ kanoniczna (legalna edycja ¬ß9 przez operatora + escapowanie markdown bez zmian tre≈õci, dow√≥d: pe≈Çny diff w RAPORT_E2_FIX) | ryzyko: przenoszenie plik√≥w przez edytory mo≈ºe mutowaƒá tre≈õƒá ‚Äî przysz≈Çe przenosiny wy≈ÇƒÖcznie kopiowaniem binarnym.
   ZASADA STA≈ÅA: pakiet jest read-only dla agenta (edycja wy≈ÇƒÖcznie ¬ß9 MASTER_HANDOFF na polecenie operatora). Zmiany lokalizacji plik√≥w wykonuje wy≈ÇƒÖcznie operator z zapowiedziƒÖ przed sesjƒÖ.

## [2026-07-30] Etap E3
5. **Adaptacja SDK dla serwisu RAG**:
   2026-07-30 | dokumentacja: EOL @google/generative-ai | repo wymaga: v2 z @google/genai | decyzja: migracja wywo≈Çania _getEmbeddings do ai.models.embedContent (model: gemini-embedding-2, config: outputDimensionality: 768) | ryzyko: poprawne mapowanie usageMetadata na nowym SDK.
6. **Blokada migracji bazy przez Prisma Drift**:
   2026-07-30 | dokumentacja: Wykonanie `npx prisma migrate dev --name rag_v2_metadata (NIE db push)` | repo wymaga: zsynchronizowanej bazy z historiƒÖ migracji | decyzja: STOP procesu i eskalacja HITL | ryzyko: reset bazy przy u≈ºyciu `migrate dev` skasowa≈Çby dane, komenda `db push` zignorowa≈Çaby historiƒô, wymagana decyzja operatora.

## ZASADA STA£A: Redakcja SekretÛw (Wprowadzona 2026-07-30)
- W raportach, DECISION_LOG, commit messages, .ai-memory i plikach tymczasowych credentiale muszπ byÊ zapisywane jako postgresql://***:***@host:port/db.
- DowÛd wykonania komendy z sekretem musi zawieraÊ ***.
- ZAKAZ wklejania hase≥/tokenÛw/kluczy jako 'dowodu wykonania'. Sekrety mieszkajπ WY£•CZNIE w .env.

## INCYDENT (2026-07-30)
- **Rozjazd Raport - RzeczywistoúÊ / Wyciek Sekretu**: Zlogowano jawnym tekstem has≥o do Supabase w RAPORT_E3.md i w promptach. Zosta≥o to poddane natychmiastowej redakcji.
- **Audyt po incydencie**: Ustalono ponad wszelkπ wπtpliwoúÊ, øe sekret NIGDY nie trafi≥ do øadnego commita ani na serwer origin (ga≥πü pozostawa≥a 9 commitÛw przed remote, plik RAPORT_E3.md pozostawa≥ w Untracked). Zrzuty bazy zosta≥y umieszczone w .gitignore.
