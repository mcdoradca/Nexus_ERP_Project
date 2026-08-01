# ZADANIE 42 — potok ma dojść do końca na obu produktach

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_42.md` — jedna strona, szablon na końcu
- **Gałąź:** ta sama

## Ocena Zadania 41: ZALICZONE

Potok czyta z BaseLinkera po EAN, partia idzie z pliku, cztery pliki i
podsumowanie powstały, `raw_` mają 70 i 64 KB, czyli to prawdziwe dane. Partia
nie wywaliła się na pierwszym problemie. Punkt 4 opisany uczciwie.

Dwie rzeczy zgłosiłeś sam i są ważniejsze niż to, co zlecałem:
`validate_grounded_facts` od Zadania 40 leżał **niepodpięty** — dobrze, że
powiedziałeś, źle, że runda 40 wyglądała wtedy inaczej niż była. Oraz: zamrożenie
sekcji sposobu użycia i odebranie jej A6 i A7 to właściwa naprawa.

**Zostało jedno.** Oba produkty stanęły. Trimay na braku podmiotu
odpowiedzialnego — poprawnie, tak ma być. Equilibra na
`A6_OUTPUT_REJECTED: scan_stopwords (gwarantuje)` — walidator zadziałał
prawidłowo, ale nikt nie powiedział modelowi, że tego słowa nie wolno użyć.
To jest ostatnia rzecz między nami a działającym programem.

To piąta i ostatnia iteracja z terminu Operatora.

---

## KROK 1 — model ma wiedzieć, czego nie wolno napisać

**1.1** Do promptów A6, A7 i A10 dopisujesz listę zakazanego słownictwa —
tę samą, której używa `scan_stopwords`, oraz listę fraz z
`scan_medical_claims_lexical`. Nie opisujesz jej słowami, tylko wstawiasz
w prompt aktualną zawartość list, budowaną z tego samego źródła co walidator.
Jedna lista w dwóch miejscach ma być jedną listą, nie kopią.

**1.2 Ponowienie z konkretem.** Gdy walidator odrzuci wyjście węzła, kolejna
próba dostaje w promptcie **dokładną frazę, która go wywaliła**, i polecenie
napisania tego fragmentu bez niej. Dziś ponowienie wysyła to samo polecenie
i model powtarza ten sam błąd.

**1.3 Trzy próby, potem stop.** Po trzeciej odmowie potok zatrzymuje się
z `A<N>_OUTPUT_REJECTED` i nazwą frazy. Zatrzymanie zostaje, walidator zostaje.
**Nie usuwasz słów z list, nie łagodzisz walidatora, nie poprawiasz treści
modelu własną ręką.**

## KROK 2 — HITL z pliku, żeby dało się przejść zatrzymanie bez programisty

Operator ma dziś potok, który staje, i żadnego sposobu, żeby go puścić dalej.

- plik `hitl.csv` w katalogu roboczym, kolumny:
  `ean;wezel;decyzja;notatka`
- `run_offers.js` wczytuje go przed partią i dla każdego EAN-u z wpisem
  wywołuje **prawdziwe `resolveHitl`** z tą decyzją, gdy potok stanie na
  wskazanym węźle
- dopuszczalna decyzja: `ACCEPT_AND_CONTINUE`. Węzeł dostaje `HITL_OVERRIDDEN`,
  wpis ląduje w `hitl_log` i w pliku wyjściowym
- brak wpisu dla EAN-u, który stanął → status `HALT` jak dotąd
- wpis dla EAN-u, który nie stanął → ignorowany, odnotowany w podsumowaniu

To ma działać w tym samym przebiegu, nie wymagać drugiego uruchomienia.

## KROK 3 — plik wyjściowy przy zatrzymaniu ma być użyteczny

Zgłosiłeś to sam w punkcie 4. Gdy potok stanie, `out/offer_<EAN>.json` ma
zawierać:

- `status`, `powod_zatrzymania`, `wezel`
- wszystkie sekcje, które zdążyły powstać, każda pod swoim kluczem
- `ingredients_inci`, `eu_responsible_person` i `safety_warnings` ze stanu,
  jeśli już były wyekstrahowane

Bez sklejania niekompletnego HTML-a w `description_html` — przy zatrzymaniu
to pole zostaje puste, a sekcje leżą osobno. Operator ma zobaczyć, co jest
gotowe, a nie kadłubek udający opis.

## KROK 4 — przebieg obu produktów do końca

`eans.txt` z dwoma EAN-ami, `hitl.csv` z jednym wpisem:

```
8809822541010;EXTRACT;ACCEPT_AND_CONTINUE;Brak podmiotu potwierdzony przez operatora
```

Oczekiwany wynik: **oba `offer_` ze statusem `OK`**, oba z pełnym
`description_html`, `_podsumowanie.csv` z dwoma wierszami `OK`.

Jeśli Equilibra znów stanie po trzech próbach — raportujesz frazę i to jest
wynik rundy, nie porażka. Ale wtedy podaj też **pełną treść sekcji, która
została odrzucona**, żebym zobaczył, co model uparcie pisze.

---

## RAPORT — jedna strona

```
## 1. Zawartość out/_podsumowanie.csv — w całości
## 2. Lista plików w out/ (nazwy i rozmiary)
## 3. Ile prób potrzebował A6 na Equilibrze i na jakich frazach
## 4. hitl_log z pliku offer_8809822541010.json
## 5. Co nie działa — po jednym zdaniu
```

Nie wklejaj `description_html`, zrzutów stanu, ciał funkcji, wydruków `npm test`
ani `git diff`. Operator otwiera pliki sam.

## KRYTERIUM UKOŃCZENIA

- `_podsumowanie.csv` ma dwa wiersze ze statusem `OK`
- oba pliki `offer_` zawierają niepuste `description_html`
- `offer_8809822541010.json` zawiera `hitl_log` z `HITL_OVERRIDDEN`
- oba pliki zawierają niepuste `safety_warnings` znak w znak z BaseLinkera
- sekcja sposobu użycia w obu zawiera tekst producenta znak w znak
- żaden walidator ani bramka nie został wyłączony ani skrócony

## ZAKAZY

- **zakaz usuwania pozycji z list `scan_stopwords` i
  `scan_medical_claims_lexical`** oraz łagodzenia któregokolwiek walidatora
- zakaz ręcznego poprawiania treści zwróconej przez model
- zakaz atrap między węzłami
- zakaz uzupełniania brakujących pól produktu treścią z modelu
- zero metod zapisujących do BaseLinkera; `WRITE_BACK_ENABLED` zostaje `false`
- zakaz `push` na `main` i `staging`, zakaz uruchamiania deploya
- zakaz commitowania klucza API
- statusu zadania nie ustalasz

## WARUNKI PRZERWANIA

Jeden: kompilator nie działa. Wszystko inne jest wynikiem do zapisania
w podsumowaniu i w punkcie 5 raportu.
