# [NODE 0 - SWARM SUPERVISOR v4.0] — OD v4 CZYSTY KOD, NIE LLM

## ZMIANA ARCHITEKTONICZNA
Node 0 nie jest już promptem LLM. Maszyna stanowa, routing, gatekeeping, cache i
walidatory to deterministyczny kod (spec poniżej). LLM w Node 0 wolno użyć wyłącznie
do generowania podsumowań HITL czytelnych dla operatora (flash, thinkingBudget=0).
Zysk: zero tokenów na orkiestrację + eliminacja halucynacji routingu z definicji.

## FAZY (Agent 3 USUNIĘTY — brak referencji w enumach, statusach i hard-failach)
FAZA 1 GROUNDING: A1 (Autofill), A2 (Sentiment) — równolegle.
FAZA 2 LEGAL: A4 (tylko gdy route_chemical()==true), A5.
FAZA 3 CREATION: A6 → freeze(s3,s5,s6) → A7 (tylko s1,s2,s4) → merge.
FAZA 4 AUDIT: pre-audyt kodowy → A8/A9 (wizja) → A10 (semantyka) → apply_patches
→ verify_frozen → eksport HITL.

## OBOWIĄZKI KODOWE (implementacja wg 00_PLAN §2)
1. ean_checksum przed startem; błąd → CRITICAL_INPUT_ERROR (bez wywołań LLM).
2. route_chemical(pim): decyzja o wywołaniu A4 PRZED wywołaniem (koniec z passthrough
   za 4 700 tokenów promptu i 52 tokeny odpowiedzi).
3. Składanie promptów: [prefiks statyczny cache'owany] + [dane SKU na końcu].
4. freeze_sections: SHA-256 sekcji 3, 5, 6 po A6; sekcje te NIE są przekazywane do
   żadnego kolejnego modelu generatywnego. verify_frozen przed eksportem — mismatch
   = BLOCKED_CRITICAL (twarda gwarancja nienaruszalności ostrzeżeń CLP/GPSR).
5. Post-walidatory: stop-words, leksykon medyczny, whitelist HTML, diff_numeric
   PIM↔HTML, struktura emotikon, c2pa_check. Trafienie leksykalne → kierowanie do
   winnego węzła BEZ angażowania A10.
6. Pętla rewizyjna: regeneracja WYŁĄCZNIE wadliwej sekcji (payload = wadliwa sekcja
   + instrukcja naprawcza + niezbędne minimum PIM), nie całego sześciopaka.
   max_revision_loops=2, potem HITL: CRITICAL_REVISION_LIMIT_EXCEEDED.
7. SOFT FAIL: A2 bez opinii → sentiment_available=false → A7 dostaje dyrektywę
   Wykluczenia Segmentowego zamiast Pratfall z opinii; potok kontynuuje.
8. HARD FAIL: missing_critical_data z A1 (GPSR/SDS/EAN) → HALTED_HITL_REQUIRED.
   Dla chemii z sds_required=true brak SDS ZAWSZE zatrzymuje potok — bez wyjątków.

## STAN MASZYNY (JSON emitowany przez kod do dashboardu/WebSockets)
Pola: pipeline_id, timestamp_utc, current_phase, node_status{}, revision_loop_count,
next_action, hitl_alert, frozen_hashes{s3,s5,s6}, token_usage_per_node{}.
(Pole token_usage_per_node — nowe: zasila dashboard z Twojego zrzutu.)
