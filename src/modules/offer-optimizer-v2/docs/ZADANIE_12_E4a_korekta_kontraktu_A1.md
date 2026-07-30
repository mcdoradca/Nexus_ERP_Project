# ZADANIE 12 — E4a KOREKTA: KONTRAKT WYJŚCIA AGENTA 1

| Pole | Wartość |
|---|---|
| Numer | 12 |
| Etap | E4a (korekta — podetap nie jest zamknięty) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_11 — **NIEZALICZONE**, powód poniżej |
| Oczekiwany raport | RAPORT_12_E4a_korekta_kontraktu_A1.md |
| SKU testowe | EAN **8000137015436** (bez zmian) |

## CO JEST DOBRZE (nie ruszaj tego)

Maszyna stanowa powstała, komplet pól ze `STAN MASZYNY` obecny, telemetria per węzeł
działa, `thoughtsTokenCount: 0` potwierdza, że `thinkingLevel: minimal` faktycznie
zadziałał, bateria 60/60 nie ucierpiała, `git diff --stat` na miejscu. Wywołanie A1
zwróciło prawdziwe dane prawdziwego produktu.

## DLACZEGO ZADANIE NIE JEST ZALICZONE

`responseSchema` dla A1 nie odpowiada kontraktowi z `Agent_1_prompt_v4.md`.
Braki dotyczą dokładnie tej części, która w tym projekcie ma priorytet nad wszystkim
innym — danych GPSR/CLP.

### Braki krytyczne w `compliance_gpsr_clp{}`

Zwrócono: `applicable_regulations`, `is_cosmetic`, `is_detergent`,
`is_general_product`, `requires_sds`. Żadne z tych pól nie występuje w specyfikacji
A1 — to pola routingu, nie pola zgodności.

Brakuje **wszystkich** pól z `Agent_1_prompt_v4.md`, ZAKRES POZYSKANIA pkt 3:

| Pole | Znaczenie |
|---|---|
| `eu_responsible_person` | nazwa + fizyczny adres w UE + e-mail/URL (GPSR Art. 16) |
| `clp_signal_word` | NIEBEZPIECZEŃSTWO / UWAGA / null |
| `clp_h_phrases[]` | kody dokładnie jak w SDS, bez parafraz |
| `clp_p_phrases[]` | jw. |
| `ufi_code` | 16 znaków |
| `biocidal_or_medical_permit` | URPL / ECHA / CE + jednostka |
| `ph_value` | z Sekcji 9 SDS |

### Konsekwencja: flaga `missing_critical_data` jest fałszywie ustawiona na `false`

Prompt A1 mówi wprost: `missing_critical_data = true`, gdy `eu_responsible_person`
jest niekompletny. Tutaj nie jest niekompletny — nie istnieje w ogóle, bo schemat go
nie przewiduje. Model nie miał gdzie zgłosić braku, więc zgłosił brak braków.

W efekcie potok przepuściłby do publikacji ofertę bez podmiotu odpowiedzialnego w UE.
To jest dokładnie ten warunek, który GPSR Art. 16 traktuje jako blokujący sprzedaż,
i dokładnie ten, dla którego istnieje HARD FAIL w `Agent_0_prompt_v4.md` pkt 8.

**Nie jest to błąd modelu.** Model wypełnił schemat, który dostał. To błąd budowy
schematu i on jest do naprawy.

### Braki pozostałe

- `logistics{}`: brak `net_capacity_or_weight` (choć z nazwy produktu wynika 75 ml); `weight_kg` zamiast `gross_weight_kg`; pole `hazardous_material` spoza specyfikacji.
- Brak `mpn` (ZAKRES POZYSKANIA pkt 1).
- `pipeline_id` z A1 (`a8f9b2c4-1234-4567-bcde-f9a8b7c6d5e4`) różni się od `pipeline_id` w stanie maszyny (`PL-8000137015436-1785437354890`). Model wymyślił własny identyfikator — wzorzec `1234-4567` w środku UUID-a wskazuje na wartość zmyśloną, nie wygenerowaną.
- `research_sources_used` zawiera `allegro.pl`. `Agent_1_prompt_v4.md`, DYREKTYWY TWARDE pkt 2, klasyfikuje aukcje konkurencji jako **źródło P3 = zakazane**. Dane mogły zostać pobrane z cudzej oferty.

### Niezalogowane decyzje własne (Z-5)

Dwie zmiany zostały wprowadzone i opisane dopiero w podsumowaniu raportu, bez wpisu
w `DECISION_LOG.md`:

1. usuwanie danych base64 ze zrzutu PIM przed wysłaniem do A1 (powód: limit tokenów),
2. rzutowanie `agentId` na `String` w `ai.wrapper.js` (powód: błąd typu w Prismie).

Obie są prawdopodobnie słuszne. Obie muszą mieć wpis, bo za rok nikt nie odtworzy,
dlaczego orkiestrator wycina część payloadu przed węzłem odpowiedzialnym za
kompletność danych.

## KROKI

### KROK 1 — przebuduj `responseSchema` dla A1 (blokujące)

Schemat ma odwzorowywać sekcję WYJŚCIE z `Agent_1_prompt_v4.md` **pole w pole**:

```
pipeline_id, gtin_ean, brand, line, mpn, product_name, country_of_origin,
logistics { net_capacity_or_weight, gross_weight_kg, dimensions_cm },
compliance_gpsr_clp {
  eu_responsible_person { name, address_eu, contact },
  clp_signal_word, clp_h_phrases[], clp_p_phrases[],
  ufi_code, biocidal_or_medical_permit, ph_value, sds_required
},
verified_certificates[], raw_ingredients_inci,
missing_critical_data, missing_critical_data_reason,
research_sources_used[]   // max 8 domen
```

Zasady:
- Wartość nieodnaleziona = `null`. Zakaz placeholderów i wartości domyślnych (DYREKTYWY TWARDE pkt 1).
- Pola routingu (`is_cosmetic`, `is_detergent`, `is_general_product`) **wypadają ze schematu A1** — kategoryzację ustala `route_chemical()` w kodzie, nie model. Jeśli orkiestrator ich potrzebuje, liczy je u siebie.
- `missing_critical_data_reason` przyjmuje m.in. `BANNED_SUBSTANCE_DETECTED` (PATCH v4.1 pkt 6), `MISSING_EU_RESPONSIBLE_PERSON`, `MISSING_SDS`.

### KROK 2 — egzekwuj HARD FAIL w kodzie, nie tylko w prompcie

Orkiestrator po odpowiedzi A1 sprawdza **kodem**, niezależnie od tego, co zadeklarował model:

- `eu_responsible_person.name`, `.address_eu` lub `.contact` puste/`null` → `HALTED_HITL_REQUIRED`, powód `MISSING_EU_RESPONSIBLE_PERSON`,
- `sds_required === true` i brak `clp_h_phrases` → `HALTED_HITL_REQUIRED`, powód `MISSING_SDS`.

Model deklaruje, kod rozstrzyga. Samoocena modelu nie jest dowodem (ta sama zasada,
która wycięła `html_validation_passed` z A6).

**Uwaga na wynik przebiegu:** po tej poprawce SKU testowy może zatrzymać się na
`HALTED_HITL_REQUIRED`, jeśli podmiot odpowiedzialny nie zostanie odnaleziony.
**To jest wynik POPRAWNY**, nie awaria. Nie osłabiaj flagi, nie dodawaj wyjątku,
nie „przepuszczaj na potrzeby testu". Zgłoś i zatrzymaj się.

### KROK 3 — poprawki drobne

- `pipeline_id` nadaje **orkiestrator** i wstrzykuje go do bloku dynamicznego. Model nie generuje własnego — jeśli zwróci inny, orkiestrator nadpisuje wartością własną i zapisuje ostrzeżenie w stanie.
- Faza po zakończeniu samego A1 to nadal `PHASE_1_GROUNDING` (FAZA 1 = A1 **i** A2, równolegle — `Agent_0_prompt_v4.md`, sekcja FAZY). `next_action: RUN_A2` przy `current_phase: PHASE_2_LEGAL` to sprzeczność wewnętrzna stanu.
- Filtr źródeł: domeny z listy zakazanej P3 (aukcje konkurencji — `allegro.pl`, `olx.pl`, `ebay.*`, `amazon.*`) odfiltrowywane z `research_sources_used`, a fakt odfiltrowania zapisywany w stanie jako ostrzeżenie.

### KROK 4 — wpisy do DECISION_LOG

Dopisz dwa wpisy w formacie Z-5 (`[data] | dokumentacja: X | repo wymaga: Y | decyzja: Z | ryzyko: …`), przez `fs.writeFileSync` utf8, bez escapowania markdownu:

- **D15** — filtrowanie payloadu PIM przed A1: co dokładnie jest wycinane (podaj regułę, nie opis), dlaczego, i jakie pola PIM **nigdy** nie mogą zostać wycięte (dane GPSR/CLP, INCI).
- **D16** — rzutowanie `agentId` na `String` w `ai.wrapper.js`: skąd brał się błąd Prismy i czy przyczyna została usunięta, czy tylko obejście.

### KROK 5 — przebieg kontrolny

Uruchom potok dla EAN **8000137015436** i wklej:

1. surowy JSON odpowiedzi A1 — pełny, nieskrócony,
2. surowe `usageMetadata`,
3. JSON stanu maszyny po FAZIE 1,
4. `npm test` — od linii `ℹ tests`,
5. `git diff --stat`.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] JSON z A1 zawiera **wszystkie** pola `compliance_gpsr_clp` z listy w KROKU 1
- [ ] `eu_responsible_person` ma wartość albo `null` — nigdy nie brakuje pola
- [ ] `missing_critical_data` rozstrzygane kodem orkiestratora, nie deklaracją modelu
- [ ] `pipeline_id` w odpowiedzi A1 zgodny z `pipeline_id` w stanie maszyny
- [ ] `current_phase` po samym A1 = `PHASE_1_GROUNDING`
- [ ] `research_sources_used` bez domen aukcyjnych
- [ ] D15 i D16 w `DECISION_LOG.md`
- [ ] `npm test`: `fail 0`, `tests` ≥ 60

## ZAKAZY

- Zero implementacji A2, A4, A5, A6, A7, A10 — to E4b/E4c/E4d.
- Zero implementacji A8 i A9 (D11).
- Zakaz osłabiania HARD FAIL, żeby „przebieg przeszedł".
- Zakaz cache (OP-1), zakaz kopiowania kodu ze starego modułu (OP-3).
- Zakaz `git add -A`; zakaz uruchamiania `clear_db.js` (D14).
- Zapis plików wyłącznie przez `fs.writeFileSync` utf8 (D9); commit message ASCII; sekrety jako `***`.
