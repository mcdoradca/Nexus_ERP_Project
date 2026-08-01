# ZADANIE 44 — wejście na `main`

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_44.md` — jedna strona
- **Gałąź robocza:** ta sama, `fix/zadanie-38`

Potok działa: dwa produkty przeszły od EAN-u do pliku, bramki zatrzymują,
HITL z pliku działa. Operator nie może go jednak używać, bo leży na gałęzi
roboczej. Ta runda ma jeden cel: **doprowadzić kod do stanu, w którym Operator
scala go na `main` jednym kliknięciem i deploy przechodzi na zielono.**

Nie dodajesz funkcji. Nie poprawiasz treści opisów. Nie ruszasz potoku.

---

## KROK 1 — napraw CI, bo deploy pada od dwóch dni

Workflow `Deploy Nexus ERP to OVH` przebieg **#344** zakończył się błędem
`Could not find src/.../*.test.js`, a testy lokalnie działają. To znaczy, że
ścieżka albo katalog roboczy w workflow nie zgadza się z tym, co jest w repo.

- ustal przyczynę i napraw ją w pliku workflow
- w raporcie: `plik:linia` i treść kroku uruchamiającego testy, przed i po
- **uruchom testy dokładnie tym samym poleceniem, którego używa CI**, z tego
  samego katalogu roboczego, i podaj linię `ℹ tests` oraz `fail`

Jeśli w `package.json` skrypt `test` wskazuje inną ścieżkę niż workflow —
to jest właśnie przyczyna, napisz to wprost.

## KROK 2 — potwierdź stan `main` wydrukiem

Pytanie stoi od trzech rund bez wydruku. Wklej surowe wyjście:

```
git ls-remote --heads origin
git log --oneline -5 origin/main
git show origin/main:src/modules/offer-optimizer-v2/orchestrator.js | grep -n "WRITE_BACK_ENABLED"
```

Odpowiedz jednym słowem, co stoi dziś na `origin/main`: `true`, `false`,
albo `brak stałej`.

Jeśli `true` — **zatrzymujesz się i raportujesz tylko to.** Reszty nie robisz.

## KROK 3 — bramka CI ma zadziałać, gdy trzeba

Krok blokujący deploy przy `WRITE_BACK_ENABLED = true` istnieje od Zadania 38,
ale nigdy nie został sprawdzony w działaniu.

- na gałęzi roboczej ustaw stałą na `true`, uruchom **sam ten krok workflow
  lokalnie** (`act`, `bash` z treścią kroku — obojętne), pokaż, że kończy się
  kodem 1
- przywróć `false`
- w raporcie: wynik obu uruchomień, po dwie linijki

Zapisu do BaseLinkera nie włączasz ani na sekundę w działającym procesie —
to jest wyłącznie test tekstowego `grep` w skrypcie CI.

## KROK 4 — przygotuj gałąź do scalenia

- **squash lub uporządkowanie commitów nie jest wymagane**, historii nie ruszasz
- `git diff --stat origin/main...HEAD` — wklej w całości, to jest zakres zmian,
  które Operator przyjmuje
- lista plików, które **nie mają** trafić na `main`: klucze, `.env`, katalog
  `out/`, `tests/tmp/` — potwierdź, że są w `.gitignore` i nie ma ich w diffie
- `git status --short` ma być pusty

**Nie wypychasz na `main`.** Podajesz nazwę gałęzi i hash `HEAD`. Scala Operator.

## KROK 5 — instrukcja uruchomienia po scaleniu

Trzy do pięciu linijek, dla człowieka, nie dla programisty:

- gdzie wpisać klucz BaseLinkera
- gdzie wpisać EAN-y
- jakie polecenie uruchomić
- gdzie wylądują pliki
- co zrobić, gdy któryś EAN stanie (`hitl.csv`)

---

## RAPORT — jedna strona

```
## 1. CI — przyczyna błędu, plik:linia, treść kroku przed i po
## 2. Testy poleceniem z CI — linia ℹ tests i fail
## 3. Stan origin/main — trzy wydruki git + jedno słowo
## 4. Bramka CI — wynik przy true i przy false
## 5. git diff --stat origin/main...HEAD + git status --short
## 6. Nazwa gałęzi i hash HEAD do scalenia
## 7. Instrukcja uruchomienia, 3–5 linijek
```

## KRYTERIUM UKOŃCZENIA — binarne

- w punkcie 1 pada konkretna przyczyna, nie przypuszczenie
- w punkcie 2 jest `fail 0`
- w punkcie 3 pada jedno z trzech słów
- w punkcie 4 są dwa wyniki: kod 1 przy `true`, kod 0 przy `false`
- w punkcie 5 `git status --short` jest pusty, a w diffie nie ma `.env`,
  `out/` ani kluczy
- w punkcie 6 jest hash

## ZAKAZY

- zakaz `push` na `main` i `staging`, zakaz uruchamiania deploya
- zakaz zmian w potoku, w promptach, w walidatorach i w bramkach
- zakaz `reset --hard`, `amend`, `rebase`, `push --force`
- `WRITE_BACK_ENABLED` kończy rundę jako `false`; zapis do BaseLinkera pozostaje
  zabroniony i nie zgłaszasz tego jako braku
- zakaz commitowania kluczy i plików z `out/`
- statusu zadania nie ustalasz

## WARUNKI PRZERWANIA

1. na `origin/main` stała ma wartość `true` — raportujesz tylko Krok 2
2. kompilator nie działa

W każdym innym przypadku dowozisz całość.
