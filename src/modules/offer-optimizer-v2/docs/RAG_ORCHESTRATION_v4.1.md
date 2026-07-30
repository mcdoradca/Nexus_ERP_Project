# RAG ORCHESTRATION v4.1 — WARSTWA WIEDZY SOT I AGENT EMBEDDING
# Brakujący moduł architektury v4: kto, co, kiedy i ile dostaje z bazy wiedzy.

## 0. ZASADA NADRZĘDNA: PRAWO ≠ RETRIEVAL
Reguły prawne i bezpieczeństwa (zakazy, czarne listy, bramki) NIGDY nie są serwowane
przez similarity search — wyszukiwanie wektorowe może ich nie zwrócić, a agent ma
zakaz korzystania z własnej wiedzy. Konsekwencja: **retrieval-dependent law = luka
bezpieczeństwa.** Podział twardy:

**WIEDZA STATYCZNA (deterministyczny prefiks, cache — zero RAG):**
małe, zawsze potrzebne, krytyczne bloki wklejane 1:1 do prefiksu węzła:
- SOT 01 §3–4 (HTML subset + blueprint 6 sekcji) → A6, A7, walidator kodowy
- SOT 02 §3 (czarna lista BPR art. 72 + disclaimer biobójczy) → A5
- SOT 02 §1C (słownictwo dozwolone/zakazane) → A4, A5
- SOT 03 §1–2 (6 kryteriów claims + twarde zakazy) → A5, A10
- SOT 04 §1 (HARD BANS: CMR, TPO, 4-MBC…) → A1, A4 (bramka)
- SOT 06 §2 (bramka leków: INGREDIENT_NOT_COSMETIC) → A4 (bramka)
- SOT 08 §0+§3 (kalendarz AI Act + reguły wizualne) → A8, A9
- SOT 09 §1–2 (mechanizmy psychologiczne + granica dark patterns) → A7
Łącznie ~1–2,5k tokenów na węzeł, płatne ułamkowo dzięki cache.

**WIEDZA DYNAMICZNA (RAG per-SKU, similarity search):**
duże słowniki, z których na raz potrzeba 3–8 wpisów:
- SOT 06 §3 (37 grup INCI) + INCI_i_ich_dzialanie.md → A4
- SOT 10 (składniki chemii domowej) + SOT 07 §2 (10 grup) → A4, A6
- SOT 05 §1 (synergie/antagonizmy dla wykrytych PAR składników) → A4
- SOT 04 §3–4 (limity stężeń — TYLKO dla substancji wykrytych w INCI) → A4, A5

## 1. MACIERZ ROUTINGU MODUŁÓW (z nagłówków SOT, po usunięciu Agenta 3)
| Moduł | Prefiks statyczny dla | RAG dynamiczny dla |
|---|---|---|
| SOT 01 Allegro | A6, A7, A9, A10*, kod | — |
| SOT 02 Prawo kosm./chem. | A4, A5 | A10 (kontekst Omnibus VIII przy eskalacji) |
| SOT 03 Claims 655/2013 | A5, A6, A10 | — |
| SOT 04 Stężenia/CMR | A1, A4 (sekcja HARD BANS) | A4, A5 (limity wykrytych substancji) |
| SOT 05 Synergie | — | A4 (pary składników) |
| SOT 06 Słownik INCI | A4 (sekcje 1–2: reguła+bramka) | A4 (wpisy słownikowe per składnik) |
| SOT 07 Chemia domowa | A5 (§1 guardrail) | A4, A6 (grupy per produkt) |
| SOT 08 AI Act | A8, A9 | — |
| SOT 09 Psychologia | A7 (§1, §2 z regułą "bez X") | — |
| SOT 10 Składniki chemii | — | A4 (wpisy per składnik) |
| INCI_i_ich_dzialanie | — | A4 |
(*A10: tylko reguły, których nie egzekwuje już walidator kodowy.)

## 2. PROTOKÓŁ POBRANIA (Agent_Embedding — wywoływany przez Node 0, nie przez agentów)
1. Node 0 po A1 zna: INCI, kategorię, pH, klasyfikację CLP.
2. Ekstrakcja składników aktywnych (kod, nie LLM): top N=8 pozycji INCI + wszystkie
   substancje z sekcji HARD BANS/bramek (te sprawdzane w 100%, nie top-N).
3. Zapytania per składnik (nie per produkt!): `getKnowledgeForIngredients()` —
   limit 2 chunki/składnik, minSimilarity 0.72, filtr metadanych sot_module wg
   macierzy §1, deduplikacja po id.
4. Budżet bloku RAG: max 2 500 tokenów dla A4, max 1 200 dla A5/A6. Nadmiar →
   priorytet: bramki > limity stężeń > słownik korzyści > synergie.
5. Składnik bez trafienia ≥0.72 → do listy `unknown_ingredients[]` w payloadzie A4
   → A4 oznacza `UNKNOWN_INGREDIENT_NEEDS_LOOKUP` (SOT 06 §2), NIE zgaduje.
6. Telemetria: każde wywołanie embeddingu logowane z agentId węzła ZLECAJĄCEGO
   (np. `Agent_4_INCIParser/embedding`), nie zbiorczo jako Agent_Vector_Embedding —
   dziś na dashboardzie nie widać, kto generuje koszt wektoryzacji.

## 3. WYMOGI DLA SERWISU (implementacja: knowledge.rag.service.v2.js)
- Chunking semantyczny po nagłówkach markdown (##/###) i wpisach słownikowych;
  NIGDY cięcie w środku reguły/tabeli/wpisu; zakres 400–3500 znaków; bez overlapu
  między regułami (reguła = atom).
- Metadane w tabeli: sot_module, target_agents[], chunk_type
  (RULE | DICTIONARY_ENTRY | GATE | CONTEXT). Chunki typu GATE i RULE oznaczone —
  ingest ostrzega, jeśli trafiają do puli RAG zamiast do prefiksów.
- searchKnowledge z filtrem modułu + progiem podobieństwa.
- Wersjonowanie: przy ingest nowej wersji SOT stary komplet usuwany atomowo
  (fix: deleteDocumentByTitle na startsWith może zahaczyć inny tytuł — dodać
  separator wersji `SOT_01@v2026.07`).

## 4. NAPRAWA DRYFU SOT↔PROMPTY (źródło pętli rewizyjnych — wykryte konflikty)
K1. HTML: SOT 01 dopuszcza TYLKO `<b>` (nie `<strong>`), ZAKAZUJE `<br>`,
    zakazuje `<b>` w nagłówkach. Prompty A4/A6/A7 i SHARED_RULES §B — poprawione
    w v4.1. Walidator kodowy egzekwuje wersję z SOT 01.
K2. Wzorzec sekcji 2: SOT 01 = `🔴 Problem / 🟢 Answer`. Prompt A6 używał
    `❓ Zapytanie / 💡 Rozwiązanie`. Ujednolicono do SOT 01.
K3. Bramki SOT 06 §2 (leki) i SOT 04 §1 (CMR) nie istniały w promptach —
    dodane do A4 i A1 (patch v4.1). To bramki BEZPIECZEŃSTWA: ketokonazol,
    hydrochinon, antybiotyki, kortykosteroidy w składzie = błędna kategoryzacja
    produktu = STOP potoku + HITL. Firma nie handluje lekami.
K4. Liczby z SOT 05/06 ("6000x", "+3000% penetracji") = dane surowcowe dostawców,
    NIE claimy o produkcie (SOT 03 kryt. 3–4). Dodano zakaz transferu 1:1 do A4/A6.
K5. SOT 08 §0: art. 50 AI Act w lipcu 2026 jeszcze NIE jest egzekwowany
    (od 2.08.2026; znakowanie maszynowe od 2.12.2026). Prompt A9 v3.1 twierdził
    inaczej. A9 wdraża proaktywnie, ale nie raportuje operatorowi "wymóg już
    egzekwowany". Skorygowano.
K6. SOT 02 §1B: przekroczenie limitów Omnibus VIII w produkcie wprowadzonym do
    obrotu przed 1.05.2026 ≠ automatyczna blokada (okres przejściowy do
    31.07.2028) → alert HITL zamiast twardej blokady. Dodano do A5/A10.
K7. SOT 09 §2: "bez silikonów/bez parafiny" jest legalne pod DWOMA warunkami
    (prawdziwość w PIM + brak demonizacji). Prompt A5 v3.1 wycinał wszystko
    hurtowo — doprecyzowano, żeby nie kasował legalnych deklaracji tekstury.
