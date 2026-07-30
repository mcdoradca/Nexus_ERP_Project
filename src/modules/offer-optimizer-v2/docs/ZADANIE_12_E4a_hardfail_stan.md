# ZADANIE 12 — E4a ZAMKNIĘCIE: HARD FAIL, SPÓJNOŚĆ STANU, REJESTR DECYZJI

| Pole | Wartość |
|---|---|
| Numer | 12 |
| Etap | E4a (domknięcie podetapu) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_11-DOK2 — **ZALICZONE** |
| Oczekiwany raport | RAPORT_12_E4a_hardfail_stan.md |
| SKU testowe | EAN **8000137015436** (bez zmian) |

## ZALICZENIE ZADANIA 11-DOK2

Wszystkie trzy defekty usunięte i udowodnione:

- literały `null` są natywne, `normalization_warnings` rejestruje cztery pola, których dotyczyła podmiana,
- `mpn` już nie powiela `gtin_ean`,
- `git status --short` i `git diff --stat` są surowe i wzajemnie zgodne — `test_orchestrator.js` widnieje jako `??`, tak jak powinien,
- skompilowany prompt A1 zawiera bramkę GATE-1, z referencją `prompts/Agent_1_compiled.md:46-49`.

Warstwa A1 działa i zwraca dane zgodne z kontraktem. To pierwszy węzeł potoku v2
z udowodnionym wyjściem.

## KROKI

### KROK 1 — HARD FAIL egzekwowany kodem

Dziś `missing_critical_data` pochodzi wyłącznie z deklaracji modelu. Orkiestrator ma
rozstrzygać samodzielnie, po odebraniu odpowiedzi A1, niezależnie od tego, co model
zadeklarował:

- `compliance_gpsr_clp.eu_responsible_person.name`, `.address_eu` lub `.contact` puste albo `null` → status `HALTED_HITL_REQUIRED`, powód `MISSING_EU_RESPONSIBLE_PERSON`,
- `compliance_gpsr_clp.sds_required === true` przy pustym `clp_h_phrases` → `HALTED_HITL_REQUIRED`, powód `MISSING_SDS`,
- `missing_critical_data_reason === 'BANNED_SUBSTANCE_DETECTED'` → `HALTED_HITL_REQUIRED` bez względu na resztę.

Wynik zapisywany w `hitl_alert` w stanie maszyny. Potok się zatrzymuje — bez prób
kontynuacji.

Podstawa: `Agent_0_prompt_v4.md` OBOWIĄZKI KODOWE pkt 8. Zasada ogólna: model
deklaruje, kod rozstrzyga. Ta sama, która wycięła `html_validation_passed` z A6 —
model nie audytuje sam siebie.

### KROK 2 — spójność stanu maszyny

**a) `pipeline_id`.** Nadaje go orkiestrator i wstrzykuje do bloku dynamicznego
promptu. Model nie generuje własnego. Jeśli w odpowiedzi wróci inna wartość
(dotąd były trzy różne: `a8f9b2c4-1234-…`, `PIM-RESEARCHER-OSINT-v4.0`,
`PIM-8000137015436-001`), orkiestrator nadpisuje ją własną i dopisuje ostrzeżenie
do `normalization_warnings`.

**b) Faza.** Po zakończeniu samego A1 `current_phase` ma pozostać
`PHASE_1_GROUNDING`. FAZA 1 to A1 **i** A2, uruchamiane równolegle
(`Agent_0_prompt_v4.md`, sekcja FAZY). Obecny stan — `current_phase: PHASE_2_LEGAL`
przy `next_action: RUN_A2` — jest sprzecznością wewnętrzną: potok deklaruje fazę
prawną, a jako następny krok podaje węzeł z fazy groundingu.

**c) Pusty string.** Rozszerz `deepNormalize` o mapowanie `''` → `null`.
W ostatnim przebiegu `missing_critical_data_reason` wrócił jako `""` — ten sam defekt
klasy co `"null"`, tylko mniej widoczny.

### KROK 3 — dwa wpisy do `DECISION_LOG.md`

Format Z-5: `[data] | dokumentacja: X | repo wymaga: Y | decyzja: Z | ryzyko: …`
Zapis przez `fs.writeFileSync` utf8, bez escapowania markdownu.

**D15 — filtrowanie payloadu PIM przed A1.** Wprowadzone w poprzedniej sesji z powodu
przekroczenia limitu tokenów wejścia. Wpis ma zawierać: jawną regułę filtra (co
konkretnie jest wycinane, nie opis słowny), powód, oraz **listę pól, których wyciąć
nie wolno pod żadnym warunkiem** — dane GPSR/CLP i skład INCI.

**D16 — rzutowanie `agentId` na `String` w `ai.wrapper.js`.** Wpis ma odpowiadać na
jedno pytanie: czy przyczyna błędu typu w Prismie została usunięta, czy jest to
obejście. Jeśli obejście — jakie ryzyko zostaje.

### KROK 4 — przebieg kontrolny i commit

Uruchom potok dla EAN `8000137015436`, następnie zacommituj dorobek E4a.

```
git add <pliki po nazwie>
git commit -m "E4a: orchestrator state machine, node A1 contract, hard fail on GPSR data"
```

Zakaz `git add -A`. Commit message ASCII.

Wklej do raportu:

1. surowy JSON odpowiedzi A1,
2. surowe `usageMetadata`,
3. **cały** JSON stanu maszyny po FAZIE 1,
4. `npm test` od linii `ℹ tests`,
5. `git log --oneline -2`,
6. `git status --short` i `git diff --stat` — surowe.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] `HALTED_HITL_REQUIRED` rozstrzygany kodem — udowodnij testem jednostkowym na sztucznym obiekcie A1 z pustym `eu_responsible_person`
- [ ] `pipeline_id` w `a1_result` identyczny z `pipeline_id` stanu maszyny
- [ ] `current_phase` po samym A1 = `PHASE_1_GROUNDING`
- [ ] `missing_critical_data_reason` = `null`, nie `""`
- [ ] D15 i D16 obecne w `DECISION_LOG.md`
- [ ] `npm test`: `fail 0`, `tests` ≥ 61 (nowy test z pierwszego punktu)
- [ ] Commit widoczny w `git log`

## OBSERWACJE ODŁOŻONE (nie realizuj — zapis dla porządku)

1. **Pochodzenie `mpn`.** Wartość `984206045` wygląda na kod z serwisu aptecznego, nie na numer katalogowy producenta. Wzorzec się powtarza: gdy model nie znajduje pola, wstawia najbliższą podobną wartość zamiast `null` — najpierw EAN, teraz kod sprzedawcy. Objaw usunięty, przyczyna nie.
2. **Brak proweniencji per pole.** `research_sources_used` to płaska lista ośmiu domen, z czego sześć to sklepy (P2). `Agent_1_prompt_v4.md` DYREKTYWY pkt 2 dopuszcza dla **danych prawnych wyłącznie źródła P1**. Dziś nie da się sprawdzić, z którego źródła pochodzi podmiot odpowiedzialny. Do rozstrzygnięcia przed E5.

## ZAKAZY

- Zero implementacji A2, A4, A5, A6, A7, A10 — to E4b i dalej.
- Zero A8 i A9 (D11).
- Zakaz osłabiania HARD FAIL, żeby przebieg „przeszedł".
- Nie ruszaj walidatorów, warstwy RAG ani istniejących 60 testów.
- Zakaz `git add -A`; zapis plików przez `fs.writeFileSync` utf8; sekrety jako `***`.
