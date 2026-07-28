# ADR 030: Swarm V3 RAG Integration Fix and Agent Adjustments

## Kontekst
Podczas głębokiego audytu architektonicznego potoku EAN Pipeline zidentyfikowano błędy krytyczne w integracji wektorowej bazy wiedzy (SOT RAG). Mimo teoretycznych założeń i dokumentacji ADR-023, silnik `RagService.searchKnowledge` był wywoływany wyłącznie dla Węzła 4 (INCI) oraz Węzła 5 (Prawo). Agenci 3 (SEO Title), 6 (Copywriter) i 10 (Sentinel) operowali w próżni, bez dostępu do niezbędnych Single Source of Truth (SOT), takich jak "SOT_Allegro.md" czy "SOT_Kosmetyki_UE.md".

Zidentyfikowano również luki w logice wywołań:
1. Węzeł 5 używał narzędzia `googleSearch`, uciekając z bezpiecznej piaskownicy.
2. Węzeł 7 nie aplikował wystarczająco dużo perswazji psychologicznej.

## Decyzja

Zdecydowano się na natychmiastowe chirurgiczne modyfikacje w plikach `supervisor.service.js`, `ai.service.js` oraz w definicjach systemowych promptów:

1. **Integracja RAG dla Węzła 3, 6 i 10:**
   - Przed wywołaniem Węzła 3 pobierana jest wiedza `Trendy Allegro SEO E-commerce`.
   - Przed wywołaniem Węzła 6 pobierana jest wiedza `SOT Kosmetyki Chemia Copywriting`.
   - Przed wywołaniem Węzła 10 pobierana jest wiedza `SOT Allegro Regulamin i Zakazane`.
   Zaktualizowano sygnatury w `ai.service.js` do wstrzykiwania tych bloków bezpośrednio do kontekstu agentów.

2. **Bezpieczeństwo Danych (Węzeł 5):**
   - Odcięto całkowicie narzędzie `googleSearch` od `runNode5_LegalSanitizer`. Usunięto z promptu wszelkie wzmianki o szukaniu ostrzeżeń w internecie. Agent bazuje wyłącznie na SOT RAG.

3. **Wzmocnienie Psychologii (Węzeł 7):**
   - Zmodyfikowano `Agent_7_prompt.md`, aby agresywnie wymagać użycia dokładnie DWÓCH (2) Efektów Pratfall (radykalna szczerość) oraz DWÓCH (2) Kotwic Rutyny w generowanym opisie.

## Konsekwencje
- Drastyczna redukcja halucynacji w Węzłach 3, 6 i 10 (teraz działają na udokumentowanej prawdzie).
- Zwiększona izolacja i bezpieczeństwo (Węzeł 5 jest w 100% zablokowany przed zewnętrznymi modyfikacjami poprzez wyszukiwarkę).
- Bardziej rozbudowany i perswazyjny opis HTML po analizie psychologicznej (Węzeł 7).

**Data utworzenia:** 28 Lipca 2026
**Zatwierdzone przez:** Zespół Antigravity
