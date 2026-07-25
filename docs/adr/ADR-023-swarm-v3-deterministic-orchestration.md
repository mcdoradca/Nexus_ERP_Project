# ADR 023: Swarm V3 Deterministic Orchestration (Node 0)

## Status
Zatwierdzony (2026-07-25)

## Kontekst
Dotychczasowa implementacja Supervisor Agenta w \supervisor.service.js\ bazowała na modelu językowym zgadującym, który krok potoku uruchomić w następnej kolejności. Prowadziło to do zbędnego zużycia tokenów, losowości wykonania oraz braku gwarancji zachowania rygorystycznej kolejności przy dodaniu 10 węzłów architektury V3 (Nexus ERP).

## Decyzja
1. Całkowicie wyłączono model zgadujący LLM z poziomu Agenta 0.
2. Wprowadzono sztywną maszynę stanową podzieloną na 4 Fazy (Grounding, Legal Shield, Creation, Audit) oraz 10 wyspecjalizowanych agentów w \i.service.js\.
3. Model HITL (Human In The Loop) oparto na rzucaniu błędów (throw new Error), np. na żądanie Agenta Vision lub Sentinela, co natychmiast przerywa pętlę i wysyła status HALTED na front-end za pomocą WebSocket.

## Konsekwencje
- Zwiększenie przewidywalności i determinizmu tworzenia ofert (brak halucynacji ścieżki).
- Drastyczny spadek zużycia tokenów dla Węzła 0 (brak zapytań o routing LLM).
- Pełna integracja z wytycznymi modelu Master Prompts (JSON-only).