# AKCEPTACJA PLANU 38 — z pięcioma uzupełnieniami

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

Plan przyjmuję. Pierwsze uzupełnienie jest blokujące — bez niego wyniki Kroku 1
będą mierzyć nie to, co trzeba. Pozostałe cztery to dopisanie punktów, których
w Twoim planie nie ma, oraz dwa doprecyzowania.

---

## U1 — gałąź `fix/zadanie-38` odbijasz od `main`, nie od `fix/zadanie-37`

W nagłówku planu podałeś hash `6de3615`. To jest commit poprzedniego Wykonawcy
na gałęzi `fix/zadanie-37`, w którym stała jest już ustawiona na `false`.

Jeśli od niego odbijesz gałąź roboczą, to cały Krok 1 zmierzy stan **jego
poprawki**, a nie stan `main`. Zobaczysz `false` i uznasz sprawę za zamkniętą,
podczas gdy pytanie brzmi, co stoi na `main` i na `staging`.

- gałąź `fix/zadanie-38` odbijasz od `origin/main`
- w raporcie podajesz hash punktu odbicia i hash `origin/main` w chwili odbicia
- poprawkę poprzednika z `fix/zadanie-37` możesz przenieść, ale **świadomie
  i osobnym commitem**, opisanym w sekcji 2

## U2 — Krok 1 ma trzy podpunkty, których w planie nie ma

`staging` jest osobną gałęzią deployową i nie był długo aktualizowany. Ryzyko:
ktoś przepisze `staging` na `main`, deploy tym razem przejdzie, a razem z nim
pojedzie stan sprzed wielu commitów.

**1.1b — pomiar rozbieżności.** Wykonaj i wklej w całości:

```
git rev-list --left-right --count origin/main...origin/staging
git log --oneline origin/staging ^origin/main
git log --oneline origin/main ^origin/staging | head -30
git diff --stat origin/main origin/staging
```

Pierwsze polecenie daje dwie liczby — wypisz obie wprost. Druga lista to commity
istniejące **wyłącznie na `staging`**; jeśli jest pusta, sprawa jest prosta.
Jeśli nie — każdy commit z datą i tematem.

**1.1c — czym różnią się środowiska.** Pełny `git diff origin/main
origin/staging` dla `.github/workflows/*`, `.env*`, `ecosystem.config.*` i plików
z hostem, portem lub nazwą bazy. Trzy odpowiedzi TAK/NIE:

- czy deploy ze `staging` idzie na inny host niż deploy z `main`
- czy `staging` używa innej bazy danych niż produkcyjna
- czy `staging` używa tego samego klucza API BaseLinkera co produkcja

Jeśli wyjdzie „ten sam host, ta sama baza, ten sam klucz", to `staging` nie jest
środowiskiem testowym, tylko drugą ścieżką na produkcję. **Nie naprawiaj tego** —
raportujesz, decyzję podejmuje Operator.

**1.1d — `staging` jest nietykalny.** Zakaz scalania, przewijania, nadpisywania
i kasowania tej gałęzi w tej rundzie. Nawet oznaczenie jej znacznikiem
archiwalnym robi się dopiero na polecenie Operatora.

## U3 — „przeanalizuję logi" to za mało dla punktu 2.2

Punkt 2.2 nie jest analizą, tylko tabelą. Dla każdego węzła `A1, A2, A4, A5, A6,
A7, A10` jedna z dwóch rzeczy:

- data przebiegu i **cztery pola** `usageMetadata` zrzucone jako JSON
  (`promptTokenCount`, `candidatesTokenCount`, `thoughtsTokenCount`,
  `totalTokenCount`)
- albo słowo **BRAK**

Nie wnioskujesz, nie uzupełniasz, nie przeliczasz. Powód jest konkretny:
w Raporcie 37 dla A1 stoi `548 + 360 = 908`, a rundę wcześniej `860 + 48 = 908` —
ta sama suma, przestawione składniki. Przy A2 identycznie. Te liczby nie pochodzą
z pomiaru i dlatego wymagam surowego zrzutu.

## U4 — nie przypisuj defektu do A6, zanim go znajdziesz

Napisałeś: *„Zlokalizuję defekt wyjścia dla A6"*. Wyjście `<p>B</p>\n\nFROZEN`
może pochodzić z czterech różnych miejsc i nie wiemy z którego:

- z A6, jeśli węzeł faktycznie zwrócił taką treść
- ze **składania**, jeśli funkcja gubi sekcje przy łączeniu
- z **A10**, jeśli patch nadpisuje dokument
- z **fixture'a**, jeśli w ścieżce jest odczyt z pliku zamiast ze stanu —
  poprzednik pisał, że „fixture dla `a10_result` miał to zakodowane"

Sprawdzasz wszystkie cztery i wskazujesz jedno miejsce z `plik:linia`. Pełne
ciało funkcji składającej z numerami linii jest obowiązkowe niezależnie od tego,
gdzie leży przyczyna.

## U5 — szablon raportu ma teraz dwie sekcje więcej

Kolejność i nagłówki bez zmian, dochodzą `1b` i `1c`:

```
## 1. Gałęzie — pełne wydruki z 1.1, wartość stałej na main i na staging wprost
## 1b. Staging vs main — dwie liczby rozbieżności, lista commitów tylko na staging
## 1c. Konfiguracja środowisk — diff workflow i configów, trzy odpowiedzi z 1.1c
## 2. Blokada — plik:linia stałej, throw, testu; hash commitu i punktu odbicia
## 3. Bramka CI — plik workflow, plik:linia, treść kroku
## 4. Testy — pełny wydruk npm test, lista plików z dysku, liczba z każdego osobno
## 5. Węzły na żywo — tabela A1..A10 wg U3
## 6. Odczyt BaseLinkera — plik:linia + nazwa metody, każde wystąpienie
## 7. Składanie — pełne ciało funkcji z numerami linii + wskazana przyczyna
## 8. Naprawa — wykonana czy nie, uzasadnienie
## 9. Przebieg Equilibry — tylko jeśli naprawiałeś
## 10. git diff --stat całego modułu v2
```

---

## Doprecyzowania

**Bramka CI stoi przed krokiem testów.** Workflow #344 padł na `npm test` i przez
to kroki dalsze się nie wykonały. Gdyby bramka stała po testach, przy każdej
awarii testów przestałaby cokolwiek chronić.

**Ścieżka do testów w CI jest podejrzana.** Błąd brzmiał
`Could not find src/.../*.test.js`, a lokalnie testy się uruchamiają. Sprawdź
ścieżkę w workflow przy okazji punktu 4 — dopóki CI nie potrafi uruchomić
testów, każdy merge kończy się czerwonym deployem niezależnie od jakości kodu.

**Plany i raporty do `docs/`, jako pliki `.md`** — zanotowałeś dobrze. Do okna
czatu nie wklejasz treści raportów, tylko ścieżkę do pliku.

Reszta planu przyjęta bez zmian. Kryteria, zakazy i warunki przerwania
z Zadania 38 obowiązują. Wykonuj.
