# ZADANIE 28 — A2 wstaje w potoku + naprawa trasy

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_28.md`, **ściśle wg szablonu z sekcji SZABLON**

Koniec rund ustaleniowych. Ta runda ma skończyć się działającym `EXTRACT → A1 → A2`
na prawdziwym produkcie. Wszystkie decyzje, które mogłyby Cię zatrzymać, są już
podjęte poniżej — **nie wstrzymuj zadania, żeby pytać**, chyba że trafisz na
warunek STOP wypisany wprost.

---

## KROK 1 — trasa (D-26.1, D-26.2, D-26.3)

`route_chemical` zwraca obiekt, a orkiestrator wrzuca go do `state.chemical_route`
bez rozpakowania, więc pole jest obiektem, nie wartością logiczną. Każde
`if (state.chemical_route)` będzie zawsze prawdziwe. Naprawiasz to tak:

- w stanie mają być **dwa** pola: `chemical_route` (boolean) i
  `chemical_route_reasons` (tablica stringów). Nigdy obiekt w polu logicznym
- sygnały bierzesz z `extracted_data`, **nie** z `pimData`:
  - `extracted_data.inci.value` niepuste → reason `HAS_INCI`
  - jeśli w rekordzie `.raw` BaseLinkera istnieje pole kategorii (sprawdź
    `Object.keys` rekordu; szukaj `category`, `category_id`, `group`) i jego
    wartość wskazuje chemię/biocydy → reason `CATEGORY_CHEMICAL`. **Jeśli takiego
    pola w rekordzie nie ma — pomijasz ten sygnał** i piszesz o tym jedno zdanie
    w raporcie. Nie symulujesz go
  - `sds_required` nie jest w v2 przez nic ustawiane. Nie udawaj, że działa:
    zawsze dopisujesz reason `SDS_STATUS_UNKNOWN`. Brak wiedzy ma być widoczny
    w stanie, a nie milcząco liczony jako brak ryzyka
- `chemical_route = reasons.length > 0`

`route_chemical` w `validators/` zostaw jak jest — sygnały składasz po stronie
orkiestratora. Nie ruszasz walidatora.

## KROK 2 — `a2Schema` i wywołanie A2

- skompiluj `Agent_2_prompt_v4.md` istniejącym kompilatorem (ręczna edycja
  `*_compiled.md` zakazana)
- `a2Schema` = pola z sekcji WYJŚCIE promptu A2 **bez** `pipeline_id`
  i `gtin_ean`: `sentiment_available`, `total_reviews_analyzed`, `average_rating`,
  `social_proof_matrix`, `safety_signals_detected`, `scraped_sources`
- wywołanie A2 po A1, wynik do `state.a2_result`
- ta sama maszynka co przy A1: pola spoza `allowedKeys` odrzucane z wpisem
  `A2_FIELD_REJECTED: <pole>` w `normalization_warnings`, bez nadpisywania stanu
- limity z promptu egzekwuje kod, nie model: klastry 5/4/4/2, `scraped_sources`
  max 6, `safety_signals_detected` max 3. Nadmiar ucinasz i dopisujesz
  `A2_LIMIT_TRUNCATED: <pole>`

## KROK 3 — sygnały bezpieczeństwa zatrzymują potok

`safety_signals_detected` niepuste → `hitl_alert = 'SAFETY_SIGNAL_IN_REVIEWS'`,
`next_action = 'HALT'`, `node_status['A2'] = 'HALTED_HITL_REQUIRED'`.
Twarde zatrzymanie, bez wyjątków.

`sentiment_available === false` → potok idzie dalej z pustymi tablicami.
Zero syntetycznego sentymentu.

## KROK 4 — jeden przebieg na żywo

Jeden prawdziwy przebieg `EXTRACT → A1 → A2` na Equilibrze
(EAN 8000137015436), z fixture'a na dysku.

**Wywołania API BaseLinkera nadal zakazane** — dane produktu z fixture'a.
Wywołanie modelu dla A1 i A2 jest dozwolone i o nie właśnie chodzi.

## KROK 5 — testy

Nowe asercje: trasa (boolean + reasons), odrzucenie `pipeline_id`/`gtin_ean`
z A2, ucięcie limitów, HALT przy `safety_signals_detected`,
`sentiment_available=false` nie zatrzymuje potoku. `npm test` ma dać `fail 0`
i nie mniej niż 85.

---

## WARUNKI STOP — jedyne, przy których wolno przerwać

1. kompilator nie działa
2. usunięcie/zmiana czegokolwiek wywala istniejący test (nie naprawiasz testu
   pod kod — zgłaszasz nazwę testu i `plik:linia`)
3. A2 zwraca `safety_signals_detected` na produkcie testowym — wtedy przebieg
   z kroku 4 kończy się HALT-em i to jest wynik poprawny, nie awaria; opisujesz
   i kończysz

W każdym innym przypadku dowozisz całość.

---

## SZABLON RAPORTU — trzymaj się kolejności i nagłówków

```
## 1. Trasa
- git diff orchestrator.js (fragment trasy) — cały
- czy rekord .raw ma pole kategorii: TAK/NIE + Object.keys() rekordu najwyższego poziomu
- zrzut state.chemical_route i state.chemical_route_reasons z przebiegu

## 2. A2 — kontrakt
- plik:linia + pełny wydruk a2Schema
- grep -n "pipeline_id\|gtin_ean" na Agent_2_compiled.md — wynik
- plik:linia + wydruk allowedKeys dla A2

## 3. Przebieg na żywo
- lista wartości wstrzykniętych ręcznie (jeśli żadnych: "brak")
- PEŁNY orch.state po A2, bez wielokropków
- token_usage_per_node dla A1 i A2

## 4. Zachowania brzegowe
- zrzut stanu przy niepustym safety_signals_detected (mock)
- zrzut stanu przy sentiment_available=false (mock)
- lista wpisów A2_FIELD_REJECTED i A2_LIMIT_TRUNCATED z obu przebiegów

## 5. Testy
- pełny wydruk npm test
- lista nowych asercji: plik:linia + jedno zdanie każda

## 6. git diff --stat całego modułu v2
```

Raport bez którejkolwiek z tych sekcji nie jest oceniany.

---

## ZAKAZY

- zero wywołań API BaseLinkera
- zakaz zmian w `tests/fixtures/`, `validators/`, `prompt-compiler.js`
- zakaz ręcznej edycji `*_compiled.md`
- zakaz zmian w promptach innych niż wymagane do skompilowania A2
- w zrzutach żadna wartość nie kończy się wielokropkiem; wartość długa w całości
  albo długość w znakach i SHA-256
- brak danych ≠ zgadywanie: `//HITL:` + wpis w raporcie
- statusu zadania nie ustalasz
