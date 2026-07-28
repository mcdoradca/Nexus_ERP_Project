# ADR-031: Przejście Agenta 3 na architekturę narzędziową REST (Function Calling)

## Status
Zatwierdzony (2026-07-28)

## Kontekst
Agent 3 (SEO Title Architect) działał pasywnie na bazie ogromnego zasobu wstrzykiwanego przez Węzeł 0 (Supervisor), co powodowało halucynacje z powodu złego oszacowania wag przez LLM i braku twardych wytycznych Allegro (Słowniki, Katalog). Dodatkowo modele nie potrafią sprawnie i bezbłędnie liczyć znaków ze spacjami.

## Decyzja
1. Przeniesiono Agenta 3 (model `gemini-3.5-flash`) na pętlę narzędziową z wykorzystaniem Function Calling.
2. Udostępniono narzędzia:
   - `allegro_search_products` (Katalog Allegro - źródło prawdy nr 1)
   - `allegro_category_parameters` (Twardy Słownik)
   - `allegro_listing_competitors` (Sygnały Konkurencji)
   - `google_suggest` & `google_trends_compare` (Ruch poza-platformowy)
3. Wprowadzono twardą bramkę walidacyjną poza LLM: skrypt `title-validate.js`, który wymusza poprawną długość (12-75), brak stop-wordsów i caps locka przed zwróceniem końcowego JSON.

## Konsekwencje
- Zwiększona jakość nagłówków ofertowych – lepsze rankowanie.
- Agent zyskał pętlę sprzężenia zwrotnego (może samodzielnie sprawdzać swój wynik z walidatorem i go poprawiać do 3 iteracji).
- Wydłużony czas procesowania Agenta 3, jednak w architekturze Swarm V3 nacisk położony jest na dokładność, a nie na czas procesowania per węzeł.
