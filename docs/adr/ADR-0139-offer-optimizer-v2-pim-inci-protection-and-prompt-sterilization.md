# ADR-0139: Przywrócenie Nienaruszonego Promptu Agenta 1 i Pełnych Mechanizmów Obronnych INCI w EAN Pipeline V2 (Rollback Sterylizacji)

## Status
**SUPERSEDED & REVERTED / STABLE GOLDEN MASTER RESTORED** (Data: 2026-10-12)

## Kontekst i Przyczyna Rollbacku
W commicie `7251d5a` podjęto próbę redukcji zapytań sieciowych w przypadku obecności składu w PIM poprzez dynamiczną sterylizację szablonu promptu Agenta 1 (`hasPimInci`) oraz bezwzględne zamrażanie wartości ze stanu PIM (`INCI_PRESERVED_FROM_PIM`).

Weryfikacja produkcyjna na kartotece EAN `8008970011158` (*Tesori żel pod prysznic białe piżmo 250ml*) wykazała krytyczną wadę tego podejścia:
1. Kartoteki importowane z zewnętrznych platform (np. BaseLinker) mogą zawierać błędy ludzkie lub omyłkowo skopiowane parametry z innego asortymentu (w przypadku EAN `8008970011158` w polu `Skład/INCI` znajdował się skład wariantu waniliowo-imbirowego z `MEL EXTRACT` i `ZINGIBER OFFICINALE`).
2. Bezkrytyczne potraktowanie danych PIM jako prawdy absolutnej (SSOT) i wycięcie Agentowi 1 instrukcji badania źródeł oraz skanowania zdjęć opakowań spowodowało przekazanie tego błędnego składu do dalszych węzłów copywriterskich (A3, A5, A6), skutkując wygenerowaniem opisów niezgodnych z fizycznym produktem.
3. Wcześniejsza niezawodność potoku na przestrzeni 300+ produktów opierała się na tym, że Agent 1 dzięki Google Search Grounding i multimodalnemu skanowaniu etykiet ze zdjęć weryfikował dane i korygował błędy PIM.

## Podjęte Działania (Pełny Rollback)
1. **Całkowite wycofanie modyfikacji orkiestratora (`orchestrator.js`):**
   - Przywrócono stan pliku `src/modules/offer-optimizer-v2/orchestrator.js` sprzed commita `7251d5a`.
   - Prompt `Agent_1_prompt_v4.md` jest przekazywany w 100% nienaruszony, z kompletną wielojęzyczną matrycą kwerend i instrukcją badania zdjęć tyłu opakowania.
   - Przywrócono nienaruszony łańcuch obronny: dopasowywanie kandydatów INCI, rygorystyczny próg podobieństwa Jaccarda (`sim >= 0.85`), eliminację polskich tłumaczeń, bramkę CosIng `gate_ingredients` oraz weryfikację słownikową `inciRefOSINT`.
2. **Ochrona tokenów:**
   - Wyeliminowano uruchamianie testów konsumujących tokeny live API. Weryfikację poprawności kodu ograniczono do statycznej analizy składni (`node -c`).
