# ZADANIE 11 — E4a: MASZYNA STANOWA ORKIESTRATORA + AGENT 1

| Pole | Wartość |
|---|---|
| Numer | 11 |
| Etap | E4a (pierwszy z czterech podetapów E4) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_10 — rejestr decyzji (wykonane poprawnie) |
| Oczekiwany raport | RAPORT_11_E4a_orkiestrator_A1.md |
| SKU testowe | EAN **8000137015436** (kosmetyk, jest w PIM, pełne pokrycie danych) |

## KONTEKST (do przeczytania, nie do wykonania)

E3 zamknięty. Wchodzimy w E4, podzielony na cztery podetapy, żeby żadna runda nie
przekraczała realnej przepustowości:

| Podetap | Zakres |
|---|---|
| **E4a** | maszyna stanowa Node 0 + FAZA 1 częściowo (A1) ← **to zadanie** |
| E4b | A2 + A4 z bramkami GATE-1/2/3, kody warunkowe wg D12 |
| E4c | A5 + A6 + freeze(s3,s5,s6) + A7 w trybie diff + merge |
| E4d | A10 semantyczny + repair_patches + verify_frozen + przebieg end-to-end |

Zakres E4 jest zawężony decyzją D11: potok tekstowy **A1–A7 + A10**. Agenci A8 i A9
(wizualia) są poza zakresem — nie implementuj ich, nie twórz dla nich plików, nie
wstrzykuj SHARED_RULES §G do żadnego węzła.

W PIM nie ma jeszcze produktów chemicznych, wyłącznie kosmetyki. Oznacza to, że dla
SKU testowego `route_chemical()` zwróci `false`, a ścieżki `sds_required` i freeze
sekcji CLP nie zostaną w tym przebiegu uruchomione. To stan oczekiwany, nie błąd —
przetestuję je osobno na przypadku syntetycznym w E4c.

## ŹRÓDŁA (hierarchia obowiązująca w tym zadaniu)

1. `docs/Agent_0_prompt_v4.md` — sekcje FAZY, OBOWIĄZKI KODOWE, STAN MASZYNY
2. `docs/Agent_1_prompt_v4.md` + `docs/PATCH_v4.1_prompty.md` (sekcja *Agent_1*)
3. `docs/SHARED_RULES_v4.1.md` — MAPA DYSTRYBUCJI (dla A1 obowiązuje **wyłącznie §I**)
4. `docs/00_PLAN_REFAKTORYZACJI_v4.md` §2 i §4

Sprzeczność między tymi plikami → **STOP i pytanie**, nie własne rozstrzygnięcie.

## KROKI

### KROK 1 — szkielet maszyny stanowej

Utwórz `src/modules/offer-optimizer-v2/orchestrator.js`.

Obiekt stanu — dokładnie pola z `Agent_0_prompt_v4.md`, sekcja STAN MASZYNY:
```
pipeline_id, timestamp_utc, current_phase, node_status{}, revision_loop_count,
next_action, hitl_alert, frozen_hashes{s3,s5,s6}, token_usage_per_node{}
```

Fazy jako enum: `PHASE_1_GROUNDING`, `PHASE_2_LEGAL`, `PHASE_3_CREATION`,
`PHASE_4_AUDIT`. **Agent 3 nie istnieje** — zero referencji w enumach, statusach
i kodach błędów.

W tym zadaniu implementujesz wyłącznie FAZĘ 1 i tylko węzeł A1. Fazy 2–4 to funkcje
z `throw new Error('NOT_IMPLEMENTED_E4b')` — nie pisz ich logiki na zapas.

Stan emitowany jako JSON po każdej zmianie fazy (na razie do pliku i konsoli,
bez WebSocketów).

### KROK 2 — pre-walidator wejścia

Przed jakimkolwiek wywołaniem LLM:
- `ean_checksum(gtin)` z istniejącego `validators/index.js` (V1 — nie pisz drugiej implementacji),
- niepowodzenie → status `CRITICAL_INPUT_ERROR`, koniec potoku, **zero wywołań LLM**,
- `route_chemical(pim)` (V2) wywołany i jego wynik zapisany w stanie, mimo że A4 jest poza zakresem tego zadania.

### KROK 3 — węzeł A1

Kompilacja promptu (deterministyczna, przez istniejący kompilator):
```
[BLOK STATYCZNY: treść Agent_1_prompt_v4.md + PATCH v4.1 dla Agenta 1 + SHARED_RULES §I]
[BLOK DYNAMICZNY: dane SKU — ZAWSZE na końcu]
```

Wiążące szczegóły:
- PATCH v4.1 dla A1 nakładasz **dosłownie**: pkt 6 ZAKRESU POZYSKANIA (bramka GATE-1 → `missing_critical_data=true`, powód `BANNED_SUBSTANCE_DETECTED`) oraz dopisek do sekcji GPSR/CLP o potoku SOT 07 §3.
- Do bloku statycznego wchodzi **tylko §I** — żadnych innych sekcji SHARED_RULES.
- Parametry wywołania (model, `thinkingLevel`) wyłącznie z `config/nodes.config.js` (D2). Dla A1: klasa flash, `thinkingLevel: 'minimal'`, grounding **włączony**.
- `responseSchema` = pola z sekcji WYJŚCIE promptu A1: `pipeline_id, gtin_ean, brand, line, product_name, country_of_origin, logistics{}, compliance_gpsr_clp{}, verified_certificates[], raw_ingredients_inci, missing_critical_data, research_sources_used[]` (max 8 domen).
- **ZAKAZ cache** (OP-1) — żadnego `cachedContent`, `caches.create`, TTL.
- Telemetria obowiązkowa (S-7): wywołanie loguje się do `ai.metrics.service` z jawnym `agentId`. Wywołanie bez logowania = błąd blokujący.

### KROK 4 — obsługa HARD FAIL

`missing_critical_data === true` z A1 → status `HALTED_HITL_REQUIRED`, potok stop,
stan zapisany. Bez prób „dokończenia mimo wszystko".

### KROK 5 — przebieg na SKU testowym

Uruchom potok dla EAN **8000137015436** i wklej do raportu:

1. **surowy JSON odpowiedzi A1** (pełny, nieskrócony, bez komentarza),
2. **surowe `usageMetadata`** tego wywołania (promptTokenCount, candidatesTokenCount, thoughtsTokenCount, totalTokenCount),
3. **JSON stanu maszyny** po zakończeniu FAZY 1,
4. `npm test` — podsumowanie od linii `ℹ tests`,
5. `git diff --stat`.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Jest surowy JSON z A1 dla EAN 8000137015436
- [ ] `thoughtsTokenCount` ≈ 0 (potwierdzenie, że `thinkingLevel: minimal` zadziałał)
- [ ] Wpis telemetrii z `agentId` dla tego wywołania istnieje
- [ ] Stan maszyny zawiera komplet pól z Agent_0 §STAN MASZYNY
- [ ] `npm test`: `fail 0`, `tests` ≥ 60 (istniejąca bateria nie może się zepsuć)

## ZAKAZY

- Nie implementuj A2, A4, A5, A6, A7, A10 — to E4b/E4c/E4d.
- Nie implementuj A8 ani A9 w ogóle (D11).
- Zakaz kopiowania kodu ze starego modułu `offer-optimizer` (OP-3). Stary kod wolno czytać wyłącznie dla kontraktów zewnętrznych.
- Zakaz cache w jakiejkolwiek postaci (OP-1).
- Zakaz `git add -A` — dodawaj pliki po nazwie.
- Zakaz uruchamiania `clear_db.js` i skryptów z katalogu głównego (D14).
- Pliki tekstowe zapisywane wyłącznie przez Node (`fs.writeFileSync` utf8) — zakaz `>>`, `echo`, `Add-Content` (D9).
- Commit message ASCII. Sekrety w outputach zastępowane `***`.
- Brak danych ≠ zgadywanie: `//HITL:` + wpis w raporcie (Z-6).

## CZEGO NIE OCENIAM

Raportu bez surowego JSON-a z A1 i bez `git diff --stat` nie oceniam (Z-1).
Zdania typu „powinno działać" zastąp informacją, czego nie sprawdziłeś.
