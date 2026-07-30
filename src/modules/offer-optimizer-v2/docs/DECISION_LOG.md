# DECISION LOG - ARCHITEKTURA V2

## [2026-07-30] Etap E1
1. **Endpoint `/regenerate-title`**: Decyzja architektoniczna: Endpoint zostaje jako węzeł kompatybilnościowy dla frontendu. V2 zrealizuje go bez wskrzeszania Agenta 3. Tytuł będzie derywowany deterministycznie z danych potoku (h1/s1 + PIM). Implementacja zaplanowana na Etap E4, przepięcie w Etapie E6.
2. **String modelu Pro (LegalSanitizer A5/A10)**: 
   2026-07-30 | dokumentacja/pakiet v4.1: gemini-3.1-pro | API zwraca: models/gemini-2.5-pro, models/gemini-3.1-pro-preview i inne | decyzja: gemini-3.1-pro-preview | ryzyko: model w fazie preview może cechować się nieprzewidywalnością struktury lub limitami rate-limit, jednak stabilny `gemini-2.5-pro` jest niedostępny dla nowych użyć, a wersja `gemini-3.1-pro` z pakietu v4.1 nie istnieje w API.

*(Dodatkowe logi decyzyjne będą dodawane w kolejnych etapach potoku).*
