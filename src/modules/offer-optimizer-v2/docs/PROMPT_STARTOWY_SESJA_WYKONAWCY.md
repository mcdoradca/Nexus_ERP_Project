# PROMPT STARTOWY — NOWA SESJA WYKONAWCY (OFFER-OPTIMIZER-V2)

> Wklej jako pierwszą wiadomość nowej sesji. Poprzednia sesja została zamknięta
> z powodu dryfu. NIE odtwarzaj jej historii — cały potrzebny stan masz poniżej,
> w plikach `docs/` i w gicie.

---

## 1. KIM JESTEŚ I CO ZASTAJESZ

Jesteś inżynierem wdrożeniowym w projekcie **Nexus ERP** — systemie, który **działa
na produkcji**. Sprzedaż firmy żyje z tego programu w tej chwili.

Pracujesz **wyłącznie** w module `src/modules/offer-optimizer-v2/`. Buduje on potok
10 agentów AI: operator wpisuje EAN, potok pobiera dane z BaseLinkera, uzupełnia braki
z sieci (strona producenta, marketplace'y) i produkuje gotową ofertę na Allegro.

Asortyment to kosmetyki i chemia domowa. **Bezpieczeństwo ludzi i zgodność prawna
(GPSR, CLP, 1223/2009, Omnibus, AI Act) mają priorytet nad każdą oszczędnością.**
Wątpliwość = STOP i pytanie do Architekta, nigdy własne rozstrzygnięcie.

**Poza modułem v2 nie ruszasz niczego.** Stary moduł `src/modules/offer-optimizer/`
jest w kwarantannie (produkcja z niego żyje do przełączenia). Pozostałe moduły Nexusa
— zakaz analizy i zmian.

## 2. ZASADY NIENARUSZALNE

| Kod | Zasada |
|---|---|
| Z-1 | Raport bez `git diff --stat` i surowych outputów **nie podlega ocenie**. Diff to fakt, raport to opinia. |
| Z-2 | Jedna wiadomość = jedno zadanie. Zakaz pracy wyprzedzającej. |
| Z-3 | Każde twierdzenie o kodzie ma referencję `plik:linia` z **aktualnego** odczytu. Zakaz raportowania z pamięci. |
| Z-4 | Parametry API ustalasz z bieżącej dokumentacji sieciowej, nigdy z pamięci treningowej. |
| Z-5 | Zero własnej inwencji. Jedyny wyjątek: adaptacja do struktury repo — obowiązkowo wpisana do `DECISION_LOG.md` w formacie `[data] \| dokumentacja: X \| repo wymaga: Y \| decyzja: Z \| ryzyko: …` |
| Z-6 | Brak danych ≠ zgadywanie. `//HITL:` w kodzie + wpis w raporcie. |
| Z-7 | Rozjazd raport ↔ git = natychmiastowy STOP i korekta. |

Zakazy techniczne:
- **Zakaz `git add -A`** — pliki dodajesz po nazwie.
- Zakaz cache Gemini w jakiejkolwiek postaci (`cachedContent`, `caches.create`, TTL).
- Zakaz kopiowania kodu ze starego modułu. Wolno go **czytać** wyłącznie dla kontraktów zewnętrznych.
- Pliki tekstowe zapisujesz **wyłącznie** przez Node (`fs.writeFileSync(path, tekst, 'utf8')`). Zakaz `>>`, `echo`, `Add-Content`. Zakaz escapowania markdownu (`\[`, `\_`, `\.`).
- Zakaz uruchamiania `clear_db.js` i jakiegokolwiek skryptu z katalogu głównego repo.
- Commit message wyłącznie ASCII. Sekrety w outputach zastępowane `***`.
- Migracje bazy: wyłącznie addytywne, przez `prisma db execute` + aktualizacja `schema.prisma`. **Bez** `migrate dev`, `reset`, `db push`.

Inwarianty bezpieczeństwa (złamanie = STOP + raport):
- **S-1** Zwroty H/P, hasła ostrzegawcze, UFI, podmiot odpowiedzialny GPSR — nigdy nie usuwane, nie łagodzone, nie parafrazowane.
- **S-2** Bramki GATE-1/2/3 **zatrzymują** potok, nie ostrzegają. Zakaz zmiękczania.
- **S-3** Brak SDS przy `sds_required == true` = twarde zatrzymanie.
- **S-4** Agent 5 zawsze na modelu klasy Pro z `thinkingLevel: high`.
- **S-5** Reguły prawne i czarne listy nigdy przez similarity search.
- **S-6** Listy zakazanych słów i substancji kopiowane 1:1, nie rozszerzane i nie skracane.
- **S-7** Każde wywołanie LLM loguje się do `ai.metrics.service` z jawnym `agentId`.

## 3. STAN PROJEKTU

| Etap | Status |
|---|---|
| E0 kontrakty + weryfikacja API | zamknięty |
| E1 szkielet v2 | zamknięty |
| E2 walidatory i bramki | zamknięty |
| E3 warstwa RAG v2 | zamknięty — commit `04e1494`, bateria 60/60, pokrycie indeksu nazw 98,89% / 100% / 100% |
| **E4a maszyna stanowa + A1** | **w toku — to Twoje zadanie** |
| E4b / E4c / E4d | nierozpoczęte, nie dotykaj |

**Zakres E4 jest zawężony decyzją operatora (D11): potok tekstowy A1–A7 + A10.**
Agenci **A8 i A9 (wizualia) są poza zakresem** — nie implementujesz ich, nie tworzysz
dla nich plików, nie wstrzykujesz `SHARED_RULES §G` do żadnego węzła.

Podział E4: **E4a** = maszyna stanowa + A1 (to zadanie) · E4b = A2 + A4 z bramkami ·
E4c = A5 + A6 + freeze + A7 · E4d = A10 + przebieg end-to-end.

W PIM są obecnie **wyłącznie kosmetyki**, brak produktów chemicznych. Dla SKU
testowego `route_chemical()` zwróci `false` — to stan oczekiwany, nie błąd.

**SKU testowe: EAN `8000137015436`** (Equilibra Carbone Attivo, krem-żel 75 ml).

## 4. CO JUŻ DZIAŁA — NIE RUSZAJ

Wrapper AI z telemetrią per `agentId`, konfiguracja węzłów (`config/nodes.config.js`),
kompilator promptów bez parametrów wywołania, walidatory V1–V10 z bramkami GATE-1/2/3,
warstwa RAG v2 z deterministycznym dopasowaniem składników, migracje addytywne,
`docs/` jako jedyne źródło prawdy o decyzjach.

Bateria testów: `npm test` → 60 testów, 60 pass. **Ta liczba nie może spaść.**

## 5. ŹRÓDŁA (hierarchia obowiązująca)

1. `docs/Agent_0_prompt_v4.md` — sekcje FAZY, OBOWIĄZKI KODOWE, STAN MASZYNY
2. `docs/Agent_1_prompt_v4.md` + `docs/PATCH_v4.1_prompty.md` (sekcja *Agent_1*)
3. `docs/SHARED_RULES_v4.1.md` — MAPA DYSTRYBUCJI; dla A1 obowiązuje **wyłącznie §I**
4. `docs/00_PLAN_REFAKTORYZACJI_v4.md` §2 i §4
5. `docs/MASTER_HANDOFF_OFFER_OPTIMIZER_V2.md` — kontekst całości

Sprzeczność między tymi plikami → **STOP i pytanie do Architekta.**

## 6. CO POWSTAŁO W ZADANIU 11 I CO POSZŁO ŹLE

Poprzednia sesja wykonała `orchestrator.js`: maszyna stanowa z kompletem pól,
pre-walidacja EAN, wywołanie A1, telemetria per węzeł. `thoughtsTokenCount: 0`
potwierdził, że `thinkingLevel: minimal` działa. Bateria nie ucierpiała. To zostaje.

**Zadanie nie zostało zaliczone z jednego powodu:** `responseSchema` dla A1 został
zbudowany po swojemu i **nie odpowiada kontraktowi** z `Agent_1_prompt_v4.md`.

Zwrócono `compliance_gpsr_clp` z polami `applicable_regulations`, `is_cosmetic`,
`is_detergent`, `is_general_product`, `requires_sds`. Żadnego z nich nie ma
w specyfikacji A1 — to pola routingu, nie pola zgodności.

Wypadły natomiast **wszystkie** pola z `Agent_1_prompt_v4.md`, ZAKRES POZYSKANIA
pkt 3: `eu_responsible_person`, `clp_signal_word`, `clp_h_phrases[]`,
`clp_p_phrases[]`, `ufi_code`, `biocidal_or_medical_permit`, `ph_value`.

Skutek: `missing_critical_data` wróciło jako `false`, bo model nie miał gdzie zgłosić
braku podmiotu odpowiedzialnego w UE. Potok przepuściłby ofertę bez danych, które
GPSR Art. 16 traktuje jako blokujące sprzedaż.

**To nie jest błąd modelu — model wypełnił schemat, który dostał. To błąd budowy schematu.**

---

## 7. ZADANIE 11-DOK — DOKOŃCZENIE E4a

Cel: doprowadzić wyjście A1 do zgodności z kontraktem i udowodnić to przebiegiem.

### KROK 1 — przebuduj `responseSchema` dla A1

Schemat odwzorowuje sekcję WYJŚCIE z `Agent_1_prompt_v4.md` **pole w pole**:

```
pipeline_id, gtin_ean, brand, line, mpn, product_name, country_of_origin,
logistics {
  net_capacity_or_weight, gross_weight_kg, dimensions_cm
},
compliance_gpsr_clp {
  eu_responsible_person { name, address_eu, contact },
  clp_signal_word, clp_h_phrases[], clp_p_phrases[],
  ufi_code, biocidal_or_medical_permit, ph_value, sds_required
},
verified_certificates[], raw_ingredients_inci,
missing_critical_data, missing_critical_data_reason,
research_sources_used[]
```

Zasady wiążące:
- Wartość nieodnaleziona = **`null`**. Zakaz placeholderów, zakaz wartości domyślnych, zakaz pomijania pola (DYREKTYWY TWARDE pkt 1).
- Pola routingu (`is_cosmetic`, `is_detergent`, `is_general_product`) **wypadają ze schematu A1**. Kategoryzację ustala `route_chemical()` w kodzie orkiestratora, nie model.
- `research_sources_used` — maksymalnie 8 domen.
- `missing_critical_data_reason` przyjmuje m.in.: `MISSING_EU_RESPONSIBLE_PERSON`, `MISSING_SDS`, `BANNED_SUBSTANCE_DETECTED`.
- PATCH v4.1 dla A1 nakładasz **dosłownie** — pkt 6 ZAKRESU POZYSKANIA (bramka GATE-1 → `missing_critical_data = true`, powód `BANNED_SUBSTANCE_DETECTED`) oraz dopisek do sekcji GPSR/CLP o potoku SOT 07 §3.
- Do bloku statycznego promptu wchodzi **tylko `SHARED_RULES §I`**. Nic więcej.
- Parametry wywołania (model, `thinkingLevel`, grounding) wyłącznie z `config/nodes.config.js`. Nie w kodzie wywołania, nie w nagłówku promptu.

### KROK 2 — przebieg kontrolny

Uruchom potok dla EAN `8000137015436` i wklej do raportu:

1. **surowy JSON odpowiedzi A1** — pełny, nieskrócony, bez komentarza,
2. **surowe `usageMetadata`**: `promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`, `totalTokenCount`,
3. **JSON stanu maszyny** po zakończeniu FAZY 1,
4. `npm test` — podsumowanie od linii `ℹ tests`,
5. `git diff --stat`.

### Kryterium zaliczenia (binarne)

- [ ] JSON z A1 zawiera **wszystkie** pola `compliance_gpsr_clp` z KROKU 1
- [ ] `eu_responsible_person` ma wartość albo `null` — pole nigdy nie znika ze struktury
- [ ] Brak pól routingu w wyjściu A1
- [ ] `thoughtsTokenCount` ≈ 0
- [ ] `npm test`: `fail 0`, `tests` ≥ 60

### Uwaga o możliwym wyniku

Jeśli po poprawce `missing_critical_data` wyjdzie `true`, a potok zatrzyma się na
`HALTED_HITL_REQUIRED` — **to jest wynik poprawny, nie awaria.** Nie osłabiaj flagi,
nie dodawaj wyjątku, nie przepuszczaj „na potrzeby testu". Zgłoś i zatrzymaj się.

### Zakazy w tej rundzie

Zero implementacji A2, A4, A5, A6, A7, A10 — to kolejne podetapy. Zero A8 i A9 w ogóle.
Nie modyfikuj walidatorów, warstwy RAG ani testów istniejących.

---

## 8. ZADANIE 12 — **NIE ZACZYNAJ**

> Poniższe jest wyłącznie do wiadomości, żebyś wiedział, dokąd to idzie.
> **Startujesz dopiero po akceptacji raportu z Zadania 11-DOK przez Architekta.**
> Rytm pracy: jedno zadanie → jeden raport → akceptacja → następne zadanie.

Zakres Zadania 12 (trzy punkty):

1. **HARD FAIL egzekwowany kodem, nie deklaracją modelu.** Orkiestrator po odpowiedzi A1 sprawdza samodzielnie: puste `eu_responsible_person.name` / `.address_eu` / `.contact` → `HALTED_HITL_REQUIRED` z powodem `MISSING_EU_RESPONSIBLE_PERSON`; `sds_required === true` bez `clp_h_phrases` → `HALTED_HITL_REQUIRED` z powodem `MISSING_SDS`. Model deklaruje, kod rozstrzyga.

2. **Spójność stanu maszyny.** `pipeline_id` nadaje orkiestrator i wstrzykuje do bloku dynamicznego — model nie generuje własnego. Faza po zakończeniu samego A1 to nadal `PHASE_1_GROUNDING` (FAZA 1 = A1 **i** A2 równolegle, wg `Agent_0_prompt_v4.md`).

3. **Dwa wpisy do `DECISION_LOG.md`** w formacie Z-5, za zmiany wprowadzone bez wpisu w poprzedniej sesji: filtrowanie danych base64 z payloadu PIM przed A1 (z jawną regułą i listą pól, których wycinać nie wolno) oraz rzutowanie `agentId` na `String` w `ai.wrapper.js`.

## 9. OBSERWACJE ODŁOŻONE (nie realizuj)

- `research_sources_used` w poprzednim przebiegu zawierało `allegro.pl`, a `Agent_1_prompt_v4.md` klasyfikuje aukcje konkurencji jako źródło P3 = zakazane. Do rozstrzygnięcia przez Architekta w osobnym zadaniu.
- `promptTokenCount` dla A1 wyniósł 6339 przy bloku statycznym, który ma być minimalny. Do przeglądu przy optymalizacji kosztów, nie teraz.

## 10. FORMAT RAPORTU

Nazwa pliku: `RAPORT_11_DOK_kontrakt_A1.md`

Zawartość:
1. Zakres wykonany — lista zmienionych plików, per plik: co i dlaczego, z referencją do punktu dokumentacji (np. „Agent_1_prompt_v4.md / WYJŚCIE").
2. Surowe outputy z KROKU 2 — wszystkie pięć pozycji.
3. Wpisy do `DECISION_LOG` z tej rundy, jeśli powstały.
4. Elementy pominięte i `//HITL:` z powodem.

Zakazane w raporcie: twierdzenia o zgodności, której nie zweryfikowałeś testem lub
odczytem kodu. Zamiast „powinno działać" napisz, czego nie sprawdziłeś.
