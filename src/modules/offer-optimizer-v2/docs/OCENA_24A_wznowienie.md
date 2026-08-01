# OCENA RAPORTU 24A (wznowienie)

> **ODBIORCA: DOKUMENTACJA.** Tylko do `docs/`. Wykonawcy nie wklejasz.

- **Zadanie:** 24A wznowione
- **Raport:** `RAPORT_24A_kontrakt_A1_v2.md`
- **Data oceny:** 2026-07-31
- **Werdykt: NIEZALICZONE**

Cztery z siedmiu kryteriów bez dowodu, jedna zmiana poza zakresem zadania,
jeden zrzut, który nie jest zrzutem.

---

## 1. Bilans

| Kryterium | Wynik |
|---|---|
| output z kroku 0 w całości, każde trafienie skomentowane | **NIEWYKONANE** — patrz sekcja 2 |
| `git diff` `docs/Agent_1_prompt_v4.md` w całości | **BRAK** |
| `grep` po `Agent_1_compiled.md` pusty | spełnione (exit code 1) |
| `a1Schema`: `plik:linia` + pełny wydruk | **BRAK** — opis prozą |
| stan z kroku 3: trzy rzeczy naraz + lista wstrzyknięć | **częściowo** — patrz sekcja 4 |
| `npm test` pełny wydruk, `fail 0`, ≥ 78 | **BRAK** — „PASS 79" prozą |
| lista asercji `plik:linia` | spełnione |

Trzeci raz z rzędu kryterium „pełny wydruk" zostało odesłane jako liczba w zdaniu.
To już nie jest przeoczenie, tylko wzorzec.

---

## 2. Krok 0 nie został wykonany

Krok 0 kazał zgrepować **kod `.js`** modułu v2 po jedenastu nazwach pól
usuwanych z promptu: `compliance_gpsr_clp`, `verified_certificates`,
`clp_signal_word`, `clp_h_phrases`, `clp_p_phrases`, `ufi_code`,
`biocidal_or_medical_permit`, `ph_value`, `net_capacity_or_weight`,
`gross_weight_kg`, `dimensions_cm`.

W raporcie stoi zdanie o braku zależności, a pod nim wklejony **inny grep** —
ten z kryterium zaliczenia, po pliku `Agent_1_compiled.md`, na inną listę pól.
To są dwa różne sprawdzenia i podstawiono jedno pod drugie.

**Wiem na pewno, że tego grepa nie uruchomiono**, bo jego wynik nie mógł być
pusty: `clp_signal_word` stoi w `validators/index.js:38` — mamy to wklejone
w `RAPORT_25_zaleznosci.md`, z ciałem funkcji `route_chemical`. Trafienie było
gwarantowane.

Krok 0 istniał dokładnie dlatego, że poprzedni taki grep wyłapał martwy warunek
w `orchestrator.js:216`, który zapaliłby się na całym katalogu. Pominięcie go
w rundzie, która usuwa z kontraktu jedenaście pól naraz, jest tym samym ryzykiem,
tylko większym.

---

## 3. Zmiana poza zakresem: `prompt-compiler.js`

Wykonawca wyłączył doczepianie `PATCH_v4_1_prompty.md` do A1, modyfikując
**kompilator** — przez listę pomijanych agentów.

**Cel był słuszny, mechanizm jest zły.**

Sekcja `## Agent_1_prompt_v4.md` w PATCH v4.1 dokłada A1 dwie rzeczy: regułę
GATE-1 z `missing_critical_data=true` i wytyczną pozyskiwania GPSR/CLP dla chemii
domowej. Obie są dziś bezprzedmiotowe — flaga zniknęła z kontraktu, GATE-1 działa
deterministycznie w kodzie przed A1, a GPSR/CLP nie jest zadaniem A1 od D18.
Wynik jest więc poprawny.

Ale kompilator jest wspólną infrastrukturą dziesięciu promptów, a PATCH v4.1
niesie treści bezpieczeństwa dla pozostałych: GATE-2 i `INGREDIENT_NOT_COSMETIC`
dla A4, limity CMR i okresy przejściowe dla A5, kalendarz AI Act dla A9,
eskalacja `BLOCKED_CRITICAL_HITL_ESCALATION` dla A10. **Lista pomijanych agentów
wpisana do kompilatora jest miejscem, w którym te treści mogą kiedyś zniknąć
po cichu** — wystarczy, że ktoś dopisze do niej literę.

Obowiązuje ta sama zasada co w D23: poprawiamy źródło, nie maszynę. Sekcja A1
wypada z `PATCH_v4_1_prompty.md`, kompilator wraca do stanu poprzedniego.
Wtedy „skompilowany = funkcja źródeł" pozostaje prawdą, a ślad zmiany jest
w gicie, w pliku pakietu, a nie w skrypcie.

Osobno: to była decyzja architektoniczna podjęta przez wykonawcę bez pytania.
Zadanie zakazywało refaktoryzacji poza krokami 2 i 3.

---

## 4. „Zrzut stanu", który nie jest zrzutem stanu

Obiekt w kroku 3 zawiera klucz `extracted_data_line`. **Takiego klucza nie ma
w maszynie stanowej** — ścieżka to `extracted_data.line`. To jest streszczenie
złożone ręcznie i podane jako zrzut. Brakuje `pipeline_id`, `node_status`,
`current_phase`, `token_usage_per_node` i całej reszty `extracted_data`.

Wymóg pełnego zrzutu nie jest formalnością. Przy takim streszczeniu nie umiem
sprawdzić, czy pozostałe pola nie ucierpiały, ani czy przebieg w ogóle przeszedł
przez maszynę.

Na plus: wartość wstrzyknięta (`line: "Aloes"`) została wymieniona nad zrzutem,
zgodnie z zasadą wprowadzoną w `AKCEPTACJA_PLANU_24.md`. Tego wcześniej nie było.

---

## 5. Luka merytoryczna: `allowedKeys` nadal zawiera `line`

Z raportu: lista pól dopuszczanych z odpowiedzi A1 wciąż zawiera `line` i `brand`,
a odrzucenie zachodzi **tylko wtedy, gdy pole ma źródło P1 w `extracted_data`**.

Equilibra nie ma klucza `Linia` w BaseLinkerze — sprawdziliśmy to grepem po
surowym fixturze w 23-DOK. Dla niej warunek „istnieje źródło P1" jest fałszywy,
więc mechanizm P1-first nie zadziała i wartość z modelu przejdzie. To jest
dokładnie ta ścieżka, która wyprodukowała `Purifying Black Carbon`
i `Purifying Active Charcoal`.

D23 pkt 4 mówi, że `line` znika z kontraktu A1 **całkowicie**. Odrzucenie nie
może być warunkowe.

---

## 6. Co było dobre

- mechanizm P1-first istnieje i działa na ścieżce z obecnym źródłem — asercje
  to pokazują, z `plik:linia`
- wartość wstrzyknięta ręcznie została ujawniona nad zrzutem
- rozpoznanie, że PATCH v4.1 dokleja A1 treści sprzeczne z nowym kontraktem,
  było trafne. Zła była tylko droga

---

## 7. Uwaga procesowa

W raporcie stoi „STATUS ZADANIA: SUKCES (100% DONE)". Werdykt wydaje architekt.
Wykonawca opisuje, co zrobił, i pokazuje dowody.
