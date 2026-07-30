# DECISION LOG - ARCHITEKTURA V2

## [2026-07-30] Etap E1
1. **Endpoint `/regenerate-title`**: Decyzja architektoniczna: Endpoint zostaje jako węzeł kompatybilnościowy dla frontendu. V2 zrealizuje go bez wskrzeszania Agenta 3. Tytuł będzie derywowany deterministycznie z danych potoku (h1/s1 + PIM). Implementacja zaplanowana na Etap E4, przepięcie w Etapie E6.
2. **String modelu Pro (LegalSanitizer A5/A10)**: 
   2026-07-30 | pakiet v4.1: gemini-3.1-pro (404) | API: brak stabilnego Pro dostępnego dla konta | decyzja Architekta: gemini-3.1-pro-preview dla A5/A10 | ryzyko: model preview — obowiązkowa re-weryfikacja ListModels przed E5 i przed E6.
   Dowód blokady gemini-2.5-pro (SUROWY błąd API):
   `ApiError: {"error":{"code":404,"message":"This model models/gemini-2.5-pro is no longer available to new users. Please update your code to use a newer model for the latest features and improvements.","status":"NOT_FOUND"}}`
3. **Konwersja encodingu: LISTMODELS_SNAPSHOT.md**:
   2026-07-30 | dokumentacja: PowerShell UTF-16 | repo wymaga: UTF-8 bez BOM | decyzja: skrypt konwersji | ryzyko: ZASADA STAŁA: wszystkie pliki projektu = UTF-8 bez BOM.

*(Dodatkowe logi decyzyjne będą dodawane w kolejnych etapach potoku).*

## [2026-07-30] Etap E2 Fix
4. **Przeniesienie pakietu files/ do docs/**:
   2026-07-30 | pakiet files/: hash historyczny b6b68bc | docs/: 4a15895 | decyzja Architekta: wersja docs/ kanoniczna (legalna edycja §9 przez operatora + escapowanie markdown bez zmian treści, dowód: pełny diff w RAPORT_E2_FIX) | ryzyko: przenoszenie plików przez edytory może mutować treść — przyszłe przenosiny wyłącznie kopiowaniem binarnym.
   ZASADA STAŁA: pakiet jest read-only dla agenta (edycja wyłącznie §9 MASTER_HANDOFF na polecenie operatora). Zmiany lokalizacji plików wykonuje wyłącznie operator z zapowiedzią przed sesją.

## [2026-07-30] Etap E3
5. **Adaptacja SDK dla serwisu RAG**:
   2026-07-30 | dokumentacja: EOL @google/generative-ai | repo wymaga: v2 z @google/genai | decyzja: migracja wywołania _getEmbeddings do ai.models.embedContent (model: gemini-embedding-2, config: outputDimensionality: 768) | ryzyko: poprawne mapowanie usageMetadata na nowym SDK.
6. **Blokada migracji bazy przez Prisma Drift**:
   2026-07-30 | dokumentacja: Wykonanie `npx prisma migrate dev --name rag_v2_metadata (NIE db push)` | repo wymaga: zsynchronizowanej bazy z historią migracji | decyzja: STOP procesu i eskalacja HITL | ryzyko: reset bazy przy użyciu `migrate dev` skasowałby dane, komenda `db push` zignorowałaby historię, wymagana decyzja operatora.
