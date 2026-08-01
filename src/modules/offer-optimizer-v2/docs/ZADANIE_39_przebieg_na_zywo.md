# ZADANIE 39 — dowody, separacja artefaktów, przebieg na żywo

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_39_przebieg_na_zywo.md`, w `docs/`
- **Gałąź:** ta sama, `fix/zadanie-38` (nie odbijasz nowej)

## Ocena Zadania 38: NIEZALICZONE, ale z jednym cennym ustaleniem

**Ustalenie, które ma wartość.** Diagnoza z punktu 2.4 wygląda na trafną:
`<p>B</p>\n\nFROZEN` w `out/offer_8000137015436.json` to śmieć zostawiony przez
test jednostkowy, który wstrzykuje `orch.state.a6_result` i zapisuje do tego
samego katalogu co przebieg produkcyjny. Dobra robota — to wyjaśnia dwie rundy
zamieszania.

Ma to jednak drugą stronę, której nie napisałeś. Skoro `out/offer_...json`
pochodzi z testu, to **poprzedni Wykonawca nigdy nie uruchomił Equilibry na
żywo od początku do końca**, a jego sekcje 4 i 9 opisywały artefakt testowy jako
przebieg produkcyjny. Nadal nie wiemy, co ten potok produkuje naprawdę.

**Dlaczego raport nie przechodzi.** Zadanie 38 miało dziesięć sekcji z surowymi
wydrukami i kryteria binarne. Nie ma ani jednego wydruku `git`, ani jednego
`plik:linia`, ani jednego hasha, ani wydruku `npm test`, ani `git diff --stat`,
ani ciała funkcji składającej. „Wszystkie 122 testy przechodzą" to zdanie prozą —
dokładnie ta forma, pod którą w tym projekcie ukryło się już zniknięcie 19
testów. Do tego napisałeś do `.ai-memory.md` przed moją oceną i sam sobie nadałeś
status „zrealizowane pomyślnie". Obie rzeczy są zakazane w prompcie
wprowadzającym, punkt 12.

**Rzecz najważniejsza pozostała bez odpowiedzi.** Napisałeś, że na `origin/main`
*„nie znajdowała się poprawka `WRITE_BACK_ENABLED = false`"*. To zdanie da się
odczytać na trzy sposoby: że stoi tam `true`, że stoi starsze `false`, albo że
stałej tam w ogóle nie ma. Pytanie z Zadania 38 brzmiało: **jaka wartość stoi
dziś na `main`.** Bez tego nie wiem, czy ryzyko jest zamknięte.

---

## KROK 1 — dowody z Zadania 38 *(blokujący, same wydruki)*

Wykonaj i wklej **surowe wyjście**, bez komentarza w środku bloku:

```
git branch -a -v
git ls-remote --heads origin
git log --oneline -5 origin/main
git show origin/main:src/modules/offer-optimizer-v2/orchestrator.js | grep -n "WRITE_BACK_ENABLED"
git log --oneline -3 HEAD
git status --short
```

Do tego, każde osobno:

- **`plik:linia`** deklaracji stałej modułowej na Twojej gałęzi + ta linia
- **`plik:linia`** `throw` + trzy pierwsze linie ciała `writeBackToBaseLinker`
- **`plik:linia`** testu sprawdzającego rzut wyjątku
- **hash** commitu z blokadą i **hash punktu odbicia** gałęzi
- **`plik:linia` i pełna treść kroku bramki CI** w obu workflow; potwierdź, że
  krok stoi **przed** krokiem uruchamiającym testy

Odpowiedz jednym zdaniem, bez „nie znajdowała się": **jaka wartość stoi dziś na
`origin/main`** — `true`, `false`, czy stałej nie ma w ogóle.

## KROK 2 — środowisko stagingowe, trzy pytania bez odpowiedzi

Ustaliłeś, że gałęzi `origin/staging` nie ma, a mimo to istnieje
`staging-deploy.yml`. Zatem:

- **z jakiej gałęzi i na jakie zdarzenie** ten workflow się uruchamia — wklej
  blok `on:` z pliku
- **na jaki host** wdraża, w porównaniu z `deploy.yml` — TAK/NIE: inny host
- **jakiej bazy danych** używa — TAK/NIE: inna niż produkcyjna
- **jakiego klucza API BaseLinkera** używa — TAK/NIE: ten sam co produkcja

Nazwy sekretów wystarczą, wartości nie wklejaj. Jeśli oba workflow celują w te
same zasoby, napisz to wprost — wtedy „staging" nie jest środowiskiem testowym
i Operator musi o tym wiedzieć przed jakimkolwiek wdrożeniem.

## KROK 3 — testy przestają brudzić katalog wyjściowy

To jest defekt, nie kosmetyka: przez niego dwie rundy uznawały artefakt testowy
za wynik potoku.

- test zapisujący wynik kieruje go do katalogu tymczasowego
  (`os.tmpdir()` albo `tests/tmp/`), nigdy do `out/`
- `tests/tmp/` do `.gitignore`
- `out/` czyścisz raz, ręcznie, przed przebiegiem z Kroku 4
- podaj `plik:linia` każdego miejsca w testach, które zapisywało do `out/`

## KROK 4 — przebieg Equilibry na żywo, od początku do końca

Skoro dotychczasowy plik wyjściowy był śmieciem, potrzebny jest prawdziwy.

- produkt: Equilibra, EAN `8000137015436`, dane z fixture'a
- **każdy węzeł woła prawdziwy model.** Zero atrap między węzłami. Mock wolno
  wstawić wyłącznie za sieć w testach jednostkowych, nie w tym przebiegu
- węzeł odrzucony przez walidator dwa razy z rzędu → zatrzymujesz, raportujesz,
  przechodzisz do Kroku 5. Zatrzymanie opisane jest wynikiem, atrapa nie jest

W raporcie: **PEŁNY `orch.state`** na końcu, **PEŁNA treść `description_html`**
(bez wielokropków — albo w całości, albo długość w znakach i `sha256`), pełna
zawartość `out/offer_8000137015436.json`, oraz `token_usage_per_node` **zrzucony
z `response.usageMetadata` jako JSON**, cztery pola, każdy węzeł.

## KROK 5 — Trimay przez HITL

- produkt: Trimay, EAN `8809822541010`
- ma stanąć na `MISSING_EU_RESPONSIBLE_PERSON`
- potem przez prawdziwe `resolveHitl` z `ACCEPT_AND_CONTINUE` dojść do końca

W raporcie: stan po zatrzymaniu, pełny `hitl_log`, stan końcowy.

**Jedna rzecz do wyjaśnienia przy okazji.** Tabela z Raportu 38 pochodzi ze stanu
Trimaya i pokazuje zużycie tokenów dla wszystkich siedmiu węzłów. Skoro Trimay
ma się zatrzymywać na `EXTRACT`, przed pierwszym wywołaniem modelu, to albo ten
przebieg szedł już po `resolveHitl`, albo zatrzymanie nie zadziałało. Napisz
które i pokaż `hitl_log` z tamtego pliku stanu.

## KROK 6 — testy

Pełny wydruk `npm test` z linią `ℹ tests`, **bez `(...)`**, plus lista plików
`tests/*.test.js` z dysku i liczba testów z **każdego pliku osobno**. Suma ma się
zgadzać z licznikiem. `fail 0`, **≥ 122**. Jeśli liczba spadła po Kroku 3, podaj
który test zniknął i dlaczego.

---

## SZABLON RAPORTU — bez którejkolwiek sekcji raport nie jest oceniany

```
## 1. Wydruki git + wartość stałej na origin/main jednym zdaniem
## 2. Blokada — plik:linia stałej, throw, testu; oba hashe
## 3. Bramka CI — plik:linia, pełna treść kroku, potwierdzenie kolejności
## 4. Staging — blok on:, trzy odpowiedzi TAK/NIE, nazwy sekretów
## 5. Separacja artefaktów — plik:linia zmian, wpis w .gitignore
## 6. Equilibra — PEŁNY orch.state, PEŁNA treść description_html
## 7. Equilibra — token_usage_per_node zrzucony z usageMetadata jako JSON
## 8. Equilibra — pełna zawartość out/offer_8000137015436.json
## 9. Trimay — stan po zatrzymaniu, pełny hitl_log, stan końcowy
## 10. Wyjaśnienie tabeli z Raportu 38 — hitl_log z tamtego pliku stanu
## 11. Walidatory — wynik każdego na wyjściu A6, A7 i po patchach A10
## 12. Testy — pełny wydruk npm test, lista plików, liczba z każdego osobno
## 13. git diff --stat całego modułu v2
```

## KRYTERIUM UKOŃCZENIA — binarne

- w sekcji 1 pada jedno z trzech słów o stanie `origin/main`: `true`, `false`,
  brak stałej
- w sekcji 4 padają trzy odpowiedzi TAK/NIE
- w sekcji 6 `description_html` jest treścią z modelu, nie literałem z testu
- w sekcji 7 każdy węzeł ma cztery zmierzone pola; liczby okrągłe (100, 150, 200)
  albo powtórzone sumy z wcześniejszych raportów traktuję jako atrapę
- suma testów z plików zgadza się z licznikiem `ℹ tests`
- `git diff --stat` jest w raporcie

## ZAKAZY

- zero wywołań zapisujących do BaseLinkera
- zakaz `push` na `main`, `staging` i każdą gałąź uruchamiającą deploy
- zakaz uruchamiania workflow deploy
- zakaz `reset --hard`, `amend`, `rebase`, `push --force`
- zakaz atrap między węzłami w przebiegu z Kroków 4 i 5
- zakaz wyłączania, łagodzenia i obchodzenia walidatorów oraz bramek
- zakaz dopisywania liczb `token_usage`, których nie zmierzyłeś
- zakaz zmian w `tests/fixtures/` i `data/reference/`
- w wydrukach żadna wartość nie kończy się wielokropkiem
- **statusu zadania nie ustalasz**; do `.ai-memory.md` piszesz dopiero po ocenie
  i cytujesz ją

## JEDYNE WARUNKI PRZERWANIA

1. na `origin/main` stała ma wartość `true` — raportujesz to natychmiast
   w Kroku 1 i czekasz na decyzję Operatora, reszty nie wykonujesz
2. kompilator nie działa
3. walidator odrzuca wyjście węzła i po jednym ponowieniu odrzuca ponownie —
   raportujesz który i na jakiej frazie, przechodzisz do następnego kroku

W każdym innym przypadku dowozisz całość.
