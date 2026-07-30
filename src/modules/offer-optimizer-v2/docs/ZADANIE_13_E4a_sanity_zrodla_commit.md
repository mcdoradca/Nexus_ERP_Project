# ZADANIE 13 — E4a: SANITY PODMIOTU ODPOWIEDZIALNEGO, FILTR ŹRÓDEŁ, DOMKNIĘCIE COMMITU

| Pole | Wartość |
|---|---|
| Numer | 13 |
| Etap | E4a (domknięcie — ostatnie zadanie podetapu) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_12 — **ZALICZONE**, z trzema następstwami do obsłużenia |
| Oczekiwany raport | RAPORT_13_E4a_sanity_zrodla_commit.md |
| SKU testowe | EAN **8000137015436** (bez zmian) |

## ZALICZENIE ZADANIA 12

Hard fail zadziałał i zadziałał na prawdziwym przypadku. `node_status.A1` =
`HALTED_HITL_REQUIRED`, `current_phase` = `PHASE_1_GROUNDING`, `pipeline_id` zgodny
ze stanem, `missing_critical_data_reason` = `null`, bateria 61/61, commit istnieje.

Warto nazwać to wprost: **model zadeklarował `missing_critical_data: false`, a mimo to
potok się zatrzymał.** Dokładnie o to chodziło. Kod przestał wierzyć modelowi na słowo.

## CO POKAZAŁ TEN PRZEBIEG

Odpowiedź A1 zawiera w polu `eu_responsible_person.name` blok tekstu długości ok.
4 000 znaków — powtarzalny, sam siebie zapewniający o zgodności („This guarantees
GPSR/CLP compliant identification records…", „Exactly as registered for GPSR
compliance safety checks"), z wymieszanymi dwoma podmiotami: Equilibra S.r.l.
z Turynu i APS Import-Export Sp. z o.o. z Lublina.

W tym bloku pada też twierdzenie, że Equilibra to **„Unilever Group Office/Affiliate
Branch"** — powtórzone dwa razy. To jest zmyślona przynależność korporacyjna wpisana
w pole danych prawnych. Gdyby taki tekst poszedł dalej, w ofercie stanęłaby nieprawdziwa
informacja o podmiocie odpowiedzialnym.

`candidatesTokenCount` skoczył z 588 do 1768 — ten jeden blok kosztował trzykrotnie
więcej niż cała poprawna odpowiedź z poprzedniego przebiegu.

### Dlaczego to jest problem mimo zadziałania bramki

Bramka zatrzymała potok, bo zabrakło kluczy `address_eu` i `contact`. Sprawdza
**obecność pól, nie ich sensowność**. Gdyby model rozlał ten sam blok na wszystkie
trzy pola, każde byłoby niepuste i bramka by go **przepuściła**.

To jest do naprawy teraz, a nie przed E5.

## KROKI

### KROK 1 — walidacja sensowności `eu_responsible_person`

Nowa funkcja walidacyjna w `validators/index.js` (razem z testem jednostkowym),
wywoływana przez orkiestrator po A1:

- `name` — niepusty, **maks. 200 znaków**, bez znaków nowej linii, bez `@`, bez `http`,
- `address_eu` — niepusty, **maks. 250 znaków**, bez znaków nowej linii, zawiera co najmniej jedną cyfrę (numer budynku lub kod pocztowy),
- `contact` — niepusty, **maks. 250 znaków**, zawiera `@` albo `http`,
- żadne z pól nie może zawierać treści drugiego (np. adresu w `name`).

Niespełnienie któregokolwiek warunku → `HALTED_HITL_REQUIRED`, powód
`MALFORMED_EU_RESPONSIBLE_PERSON`. Surowa odpowiedź modelu zostaje w stanie maszyny
do wglądu HITL — nie obcinaj jej, operator ma zobaczyć, co model wyprodukował.

Test jednostkowy ma obejmować dwa przypadki: pole puste (już pokryte) oraz pole
z blokiem tekstu przekraczającym limit.

### KROK 2 — filtr źródeł zakazanych, egzekwowany kodem

W tym przebiegu `research_sources_used` zaczyna się od `allegro.pl`, są też `empik.com`
i `leki.pl`. `Agent_1_prompt_v4.md`, DYREKTYWY TWARDE pkt 2, klasyfikuje aukcje
i marketplace'y konkurencji jako **źródła P3 = zakazane**.

To nie jest jednorazowa wpadka: `allegro.pl` pojawiło się w przebiegu z Zadania 11,
zniknęło w 11-DOK2, wróciło teraz. Prompt tego nie utrzyma — potrzebny jest kod.

- Lista domen zakazanych w konfiguracji (nie w kodzie wywołania): `allegro.pl`, `allegrolokalnie.pl`, `olx.pl`, `empik.com`, `ebay.*`, `amazon.*`, `aliexpress.*`, `ceneo.pl`.
- Orkiestrator odfiltrowuje je z `research_sources_used` i dopisuje ostrzeżenie do stanu z listą odrzuconych domen.
- Jeśli po odfiltrowaniu **nie zostaje ani jedno źródło P1** (strona producenta lub marki), dopisz ostrzeżenie `NO_P1_SOURCE` — na razie tylko ostrzeżenie, bez zatrzymania.

### KROK 3 — domknięcie commitu

`git status --short` po commicie pokazuje pięć plików z niezacommitowanymi zmianami:

```
M .agents/.ai-memory.md
M src/modules/offer-optimizer-v2/ai.wrapper.js
M src/modules/offer-optimizer-v2/config/nodes.config.js
M src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md
M src/modules/offer-optimizer-v2/prompts/Agent_1_compiled.md
```

Wśród nich jest prompt A1 z dyrektywą o literale `null` i z bramką GATE-1. **Stan
w repozytorium nie odtwarza zachowania, które właśnie zaraportowałeś** — ktoś, kto
sklonuje repo z commitu `1808997`, dostanie inny prompt niż ten, na którym robiłeś
przebieg. To rozjazd raport ↔ git (Z-7).

Do tego w `git log` widnieją **dwa commity z identycznym komunikatem** (`1808997`
i `0654291`). Wyjaśnij w raporcie jednym zdaniem, co zawiera każdy z nich.

Zacommituj brakujące pliki (po nazwie, **bez `git add -A`**) razem z dorobkiem tego
zadania:

```
git commit -m "E4a close: responsible person sanity checks, forbidden source filter, prompt sync"
```

Pliki `docs/*.md` z zadaniami i raportami też mają wejść do gita — to ślad procesu.

### KROK 4 — przebieg kontrolny

Uruchom potok dla EAN `8000137015436` i wklej:

1. surowy JSON odpowiedzi A1 — pełny,
2. surowe `usageMetadata`,
3. cały JSON stanu maszyny po FAZIE 1,
4. `npm test` od linii `ℹ tests`,
5. `git log --oneline -3`,
6. `git status --short` i `git diff --stat` — surowe.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Blok tekstu ponad limit w `eu_responsible_person` → `MALFORMED_EU_RESPONSIBLE_PERSON`, udowodnione testem jednostkowym
- [ ] `research_sources_used` bez domen z listy zakazanej, odrzucone domeny w ostrzeżeniach stanu
- [ ] `git status --short` po commicie: **żadnego pliku ze statusem `M`** w `src/modules/offer-optimizer-v2/`
- [ ] `npm test`: `fail 0`, `tests` ≥ 63
- [ ] Wyjaśnienie dwóch commitów o tym samym komunikacie

## OBSERWACJA ODŁOŻONA

Pole `mpn` przyjęło trzy różne wartości w trzech przebiegach tego samego SKU:
`8000137015436` (EAN), `984206045`, `MAGAP-24-15436`. Ostatnia zawiera pięć końcowych
cyfr EAN-u. Model nie znajduje tego pola i za każdym razem konstruuje coś w jego
miejsce. Do rozstrzygnięcia w E4b — prawdopodobnie `mpn` powinien pochodzić wyłącznie
z BaseLinkera, a nie z OSINT.

## ZAKAZY

- Zero implementacji A2, A4, A5, A6, A7, A10 — to E4b i dalej.
- Zero A8 i A9 (D11).
- Zakaz osłabiania bramek, żeby przebieg „przeszedł". Zatrzymanie potoku jest wynikiem poprawnym.
- Zakaz `git add -A`; zapis plików przez `fs.writeFileSync` utf8; commit ASCII; sekrety jako `***`.
