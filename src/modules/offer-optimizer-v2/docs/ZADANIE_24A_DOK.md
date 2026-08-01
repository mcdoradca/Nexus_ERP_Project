# ZADANIE 24A-DOK — rewert kompilatora i brakujące dowody

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Od:** Architekt
- **Data:** 2026-07-31
- **Poprzednik:** `RAPORT_24A_kontrakt_A1_v2.md` — **niezaliczony**
- **Raport wyjściowy:** `RAPORT_24A_DOK.md`

---

## KONTEKST

Sam kontrakt A1 wygląda na zrobiony poprawnie. Nie zaliczam rundy z trzech
powodów: krok 0 nie został wykonany, cztery dowody nie zostały dostarczone,
a zmiana w `prompt-compiler.js` wykroczyła poza zadanie.

Nic z tego nie wymaga pisania nowej logiki poza punktem 4.

---

## KROK 1 — rewert kompilatora, poprawka źródła

`prompt-compiler.js` wraca do stanu z `HEAD`. Lista pomijanych agentów znika.

Zamiast tego usuwasz z `docs/PATCH_v4_1_prompty.md` **całą sekcję**
`## Agent_1_prompt_v4.md` (dwa punkty: reguła GATE-1 z `missing_critical_data`
i wytyczna GPSR/CLP dla chemii domowej). Pozostałych sekcji patcha
**nie dotykasz** — niosą treści bezpieczeństwa dla A4, A5, A9 i A10.

Powód, żebyś go znał: kompilator obsługuje dziesięć promptów. Lista wyjątków
w kodzie kompilatora to miejsce, w którym treść bezpieczeństwa może kiedyś
zniknąć bez śladu w diffie pakietu. Poprawiamy źródło, nie maszynę — ta sama
zasada, na której stoi D23.

Potem rekompilujesz **wszystkie** agenty.

**Dowód — tabela sum kontrolnych.** Dla każdego pliku `prompts/*_compiled.md`
podaj `sha256` wersji z `HEAD` (`git show HEAD:<ścieżka>`) i `sha256` po
rekompilacji. **Zmienić ma się dokładnie jeden wiersz: A1.** Jeśli zmieni się
którykolwiek inny — STOP i raport, nie poprawiasz.

---

## KROK 2 — brakujące dowody

Cztery rzeczy, każda surowym outputem:

**a)** Krok 0, dokładnie to polecenie, cały wynik, każde trafienie skomentowane
jednym zdaniem (odczyt z odpowiedzi A1 / pole wejściowe / asercja testowa /
walidator):

```
grep -rn "compliance_gpsr_clp\|verified_certificates\|clp_signal_word\|clp_h_phrases\|clp_p_phrases\|ufi_code\|biocidal_or_medical_permit\|ph_value\|net_capacity_or_weight\|gross_weight_kg\|dimensions_cm" src/modules/offer-optimizer-v2/ --include=*.js
```

Wynik **nie będzie pusty** — `clp_signal_word` stoi w `validators/index.js:38`.
Jeśli którekolwiek trafienie okaże się odczytem z odpowiedzi A1, STOP i raport.

**b)** `git diff -- src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md`
w całości.

**c)** `a1Schema`: `plik:linia` z aktualnego odczytu + pełny wydruk obiektu.

**d)** `npm test`: pełny wydruk ze wszystkimi nazwami, `fail 0`, licznik.
Nie liczba w zdaniu. Wydruk.

---

## KROK 3 — prawdziwy zrzut stanu

Powtórz przebieg z testu P1-first i wklej **cały obiekt `orch.state`**, tak jak
istnieje w pamięci: `pipeline_id`, `current_phase`, `node_status`,
`token_usage_per_node`, pełne `extracted_data`, `normalization_warnings`,
`a1_result`.

Obiekt, który wkleiłeś poprzednio, zawierał klucz `extracted_data_line`.
Takiego klucza w maszynie nie ma — to było streszczenie złożone ręcznie.

Nad zrzutem, tak jak poprzednio, lista wartości wstrzykniętych ręcznie:
nazwa pola i wartość.

---

## KROK 4 — `allowedKeys` bez `line`

Odrzucenie `line` z odpowiedzi A1 nie może zależeć od tego, czy istnieje źródło
P1. Equilibra nie ma klucza `Linia` w BaseLinkerze — sprawdziliśmy to grepem po
surowym fixturze — więc dla niej warunek „istnieje źródło P1" jest fałszywy
i wartość z modelu przeszłaby. To jest ścieżka, którą powstały
`Purifying Black Carbon` i `Purifying Active Charcoal`.

Usuń `line` i `product_name` z listy pól dopuszczanych z odpowiedzi A1.
Mają być odrzucane zawsze, z wpisem `A1_FIELD_REJECTED: <pole>`.

**Dowód:** `plik:linia` + wydruk listy po zmianie + asercja na produkcie
**bez** klucza `Linia` w źródle, pokazująca, że `line` z A1 i tak zostaje
odrzucone.

---

## KRYTERIUM ZALICZENIA (binarne)

- tabela sum kontrolnych obejmuje wszystkie skompilowane prompty, zmieniony
  dokładnie jeden wiersz
- `git diff -- prompt-compiler.js` pokazuje powrót do stanu z `HEAD`
- `git diff -- docs/PATCH_v4_1_prompty.md` pokazuje usunięcie wyłącznie sekcji A1
- cztery outputy z kroku 2, każdy surowy, trafienia z (a) skomentowane
- pełny `orch.state` z kroku 3, bez wielokropków, z listą wstrzyknięć
- `plik:linia` i wydruk listy z kroku 4 + asercja
- `npm test`: `fail 0`, liczba nie niższa niż 79

---

## ZAKAZY

- zero zmian w `validators/` — `clp_signal_word` z punktu 2a ma być
  **skomentowany, nie ruszony**
- zero wywołań API BaseLinkera i jakiegokolwiek API zewnętrznego
- zakaz zmian w `tests/fixtures/`
- zakaz ręcznej edycji plików `*_compiled.md`
- zakaz zmian w sekcjach `PATCH_v4_1_prompty.md` innych niż A1
- zakaz refaktoryzacji `orchestrator.js` poza krokiem 4
- w zrzucie stanu żadna wartość nie kończy się wielokropkiem; wartość długą
  wklejasz w całości albo podajesz długość w znakach i skrót SHA-256
- **statusu zadania nie ustalasz.** Opisujesz, co zrobiłeś, i pokazujesz dowody
