# DECISION LOG - ARCHITEKTURA V2

## [2026-07-30] Etap E1
1. **Endpoint `/regenerate-title`**: Decyzja architektoniczna: Endpoint zostaje jako węzeł kompatybilnościowy dla frontendu. V2 zrealizuje go bez wskrzeszania Agenta 3. Tytuł będzie derywowany deterministycznie z danych potoku (h1/s1 + PIM). Implementacja zaplanowana na Etap E4, przepięcie w Etapie E6.
2. **String modelu Pro (LegalSanitizer A5)**: Ze względu na wariant S-4, węzeł A5 musi operować na modelu klasy Pro z `thinkingLevel: HIGH`. Na podstawie oficjalnej listy modeli, zatwierdzonym stringiem klasy Pro do potoku V2 zostaje `gemini-3.1-pro`. Składnia `gemini-3.5-pro` była wynikiem błędnego domniemania.

*(Dodatkowe logi decyzyjne będą dodawane w kolejnych etapach potoku).*
