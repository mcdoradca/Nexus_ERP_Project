# ADR 022: Telemetria i Izolacja Swarm Agentów (EU AI Act & Koszty)

**Data:** 2026-07-23  
**Status:** Zaakceptowane  

## Kontekst i Problemy
Głównym problemem architektury agentów z wczesnej fazy było asynchroniczne masowe spalanie tokenów (`Promise.all`) połączone z niekontrolowanym odpytywaniem przez narzędzie `googleSearch` zasobów, które często znajdowały się już po stronie PIM/Bazy Danych. Skutkowało to ogromnymi rachunkami za API Gemini i problemami wydajnościowymi oraz wyścigami w `ean.pipeline.service.js`.
Drugim problemem był brak wglądu w metryki wydajności poszczególnych modułów na poziomie mikroarchitektury bazy danych. Brak kontroli uniemożliwiał wycenę ROI.

## Rozwiązanie

1. **Hybrydowe Caching Promptów AI i Sentymentu**
   Aby zachować nienaruszony schemat tabel w Prisma (bez nadmiarowych relacji), wdrożono buforowanie parametrów takich jak Sentyment konsumentów (`customerSentiment`) czy Prompty dla Photoroom poprzez kolumny JSONowe (`features`, `offerDraft`).
   Agenci tacy jak Agent Badawczy (1), Agent Sentimentu (2), Prompter Photoroom (9) mają teraz wytyczną bezwzględną: *Jeśli dane są w PIM, nie uruchamiaj wyszukiwania Google*. Wyszukiwanie jest Fallbackiem, w przeciwieństwie do Agenta SEO (7), który aktualizuje Google Trends zawsze w czasie rzeczywistym.

2. **Sequential EAN Pipeline (Ograniczenie Promise.all)**
   Architektura potoku EAN została zrefaktoryzowana z równoległego uruchamiania żądań do systemu *Linear Flow*:
   * Faza 1: Ssanie Danych (BaseLinker -> DB)
   * Faza 2: Autofill do PIM (Tylko po ustalonych źródłach producent/dystrybutor/sklep)
   * Faza 3: Ustrukturyzowane szukanie Sentymentów i Informacji (OSINT)
   * Faza 4: Generacja Opisów (AEO, GEO, Tytuł) wyłącznie na bazie Tarczy Danych z Fazy 3.
   * Mutex: Wdrożenie Local Lock (`activePipelines` w pamięci) blokujące kilkukrotne wykonanie potoku dla jednego EAN.

3. **Autofill (Agent 11) Hierarchia Zapytań**
   Zrezygnowano ze sztywnego wymuszania szukania w `.pl` na rzecz globalnej, oficjalnej strony producenta (w zależności od domeny .com/.de/.fr).

4. **Telemetria Zużycia Tokenów (Moduł Prisma AgentMetric)**
   Powołano nowy model `AgentMetric` w bazie relacyjnej Prisma, przechwytujący wywołania per `AgentID`. Interceptor znajduje się centralnie w rdzennej procedurze wzywającej `generateWithRetry` w systemie bazowym `ai.service.js`. Serwis operuje w strukturze *fire-and-forget* po pomyślnym odebraniu generacji.

5. **Wyeliminowanie Claid.AI Liquid Variables (Agent 8)**
   Usunięcie nieużywanych, archiwalnych agentów, zapobiegające spowalnianiu interpretera V8 na poziomie parsowania dużych obiektów AI i zużyciu CPU.

## Konsekwencje
- Drastyczne zmniejszenie ilości odpytań `googleSearch`.
- Telemetria umożliwiająca precyzyjną analitykę FinOps dla zarządu.
- Usprawnienie zgodności logiki z wytycznymi bezpieczeństwa danych.
