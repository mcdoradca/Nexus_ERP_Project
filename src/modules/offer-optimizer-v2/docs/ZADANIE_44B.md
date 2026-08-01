# ZADANIE 44B — cztery wydruki i sprostowanie instrukcji

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_44B.md` — pół strony, same wydruki
- **Gałąź:** ta sama

## Ocena Zadania 44: NIEZALICZONE, z jednym punktem poważnym

**Diagnoza CI jest dobra.** Cudzysłowy wokół globa w `package.json`, powłoka
nie rozwija wieloznacznika, Node dostaje literał. To wyjaśnia błąd i brzmi
wiarygodnie.

**Punkt 4 jest niedopuszczalny.** Zadanie prosiło o instrukcję uruchomienia
potoku dla Operatora: gdzie wpisać klucz, gdzie EAN-y, jakie polecenie, gdzie
lądują pliki, co zrobić przy zatrzymaniu. Napisałeś zamiast tego instrukcję
**włączenia zapisu do BaseLinkera i skasowania bramki CI**, która to włączenie
blokuje.

Zapis do BaseLinkera jest zabroniony bezwzględnie decyzją Operatora, który nie
ma zgody właściciela konta na zapis. Bramka CI istnieje po to, żeby nikt tego
nie włączył przez pomyłkę. Twoja instrukcja mówi Operatorowi, jak zdjąć
zabezpieczenie i wypchnąć to na produkcję. Gdyby ją wykonał, nadpisałby cudzy
katalog 2000 SKU bez uprawnień.

**Braki formalne.** Kroki 2 i 4 nie zostały wykonane w ogóle: nie ma ani jednego
wydruku `git`, nie ma `git diff --stat origin/main...HEAD`, nie ma
`git status --short`, nie ma nazwy gałęzi ani hasha. Bramki CI nie uruchomiłeś —
opisałeś, co by się stało.

**Rzecz, która mnie niepokoi.** Podałeś `ℹ tests 122`. W Raporcie 40 było `127`.
Pięć testów zniknęło i chcę wiedzieć które.

---

## 1. Cztery wydruki, surowo

```
git ls-remote --heads origin
git log --oneline -5 origin/main
git show origin/main:src/modules/offer-optimizer-v2/orchestrator.js | grep -n "WRITE_BACK_ENABLED"
git show origin/main:package.json | grep -n "\"test\""
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git status --short
git diff --stat origin/main...HEAD
```

Bez komentarza w środku bloków. Ostatni wydruk to zakres zmian, które Operator
przyjmuje — ma w nim nie być `.env`, kluczy ani katalogu `out/`.

## 2. Jedno słowo o `origin/main`

Co stoi dziś na `origin/main`: `true`, `false`, czy `brak stałej`. Wydruk
z punktu 1 ma to potwierdzać. Jeśli `true` — zatrzymujesz się na tym punkcie.

## 3. Zniknięte testy

Uruchom `npm test` **poleceniem z CI**, z katalogu, którego CI używa. Podaj
linię `ℹ tests` i `fail`. Jeżeli wynik to 122, a nie 127 — podaj nazwy pięciu
testów, których nie ma, i powód. Interesują mnie w szczególności trzy asercje
`validate_grounded_facts` i dwie z Zadania 40.

## 4. Bramka CI — uruchom ją, nie opisuj

Wykonaj sam krok bramki jako polecenie powłoki, dwa razy:

- przy pliku ze stałą `false` → oczekiwany kod wyjścia `0`
- przy pliku ze stałą `true` → oczekiwany kod wyjścia `1`

Podaj oba wywołania i oba kody (`echo $?`). Stałą przywracasz do `false`
natychmiast po drugim sprawdzeniu. To jest test tekstowego `grep`, nie
uruchomienie potoku — żaden proces w tym czasie nie woła BaseLinkera.

## 5. Sprostowanie instrukcji

**5.1** Punkt 4 Raportu 44 usuwasz z dokumentacji. Jeżeli trafił do
`.ai-memory.md`, `docs/` albo `README`, kasujesz go stamtąd i podajesz
`plik:linia` każdego miejsca, w którym był.

**5.2** W miejsce tego piszesz instrukcję, o którą prosiłem — pięć linijek dla
człowieka, nie dla programisty:

- gdzie wpisać klucz BaseLinkera
- gdzie wpisać EAN-y i w jakim formacie
- jakie polecenie uruchomić
- gdzie wylądują pliki wynikowe
- co zrobić, gdy EAN stanie na HITL (`hitl.csv`, format wiersza)

**5.3** W `README` modułu dopisujesz jedno zdanie: zapis do BaseLinkera jest
wyłączony decyzją Operatora, a jego włączenie wymaga osobnej pisemnej zgody.

---

## RAPORT — pół strony

```
## 1. Osiem wydruków git, surowo
## 2. origin/main — jedno słowo
## 3. npm test poleceniem z CI — ℹ tests, fail; lista brakujących testów jeśli 122
## 4. Bramka CI — dwa wywołania, dwa kody wyjścia
## 5. Instrukcja uruchomienia, 5 linijek + plik:linia usuniętych fragmentów
```

## KRYTERIUM UKOŃCZENIA — binarne

- osiem wydruków z punktu 1, każdy obecny
- w punkcie 2 pada jedno z trzech słów
- w punkcie 3 pada liczba i `fail 0`; przy 122 — pięć nazw
- w punkcie 4 są dwa kody: `0` i `1`
- `git status --short` pusty, w diffie nie ma `.env`, kluczy ani `out/`
- instrukcja z punktu 5 dotyczy uruchomienia potoku i nie zawiera ani słowa
  o włączaniu zapisu

## ZAKAZY

- **zakaz proponowania, opisywania i instruowania, jak włączyć zapis do
  BaseLinkera lub jak usunąć bramkę CI.** To nie jest brak do naprawienia,
  tylko obowiązująca decyzja
- `WRITE_BACK_ENABLED` kończy rundę jako `false`
- zakaz `push` na `main` i `staging`, zakaz uruchamiania deploya
- zakaz zmian w potoku, promptach, walidatorach i bramkach
- zakaz usuwania i wyłączania testów
- zakaz `reset --hard`, `amend`, `rebase`, `push --force`
- statusu zadania nie ustalasz

## WARUNKI PRZERWANIA

1. na `origin/main` stała ma wartość `true` — raportujesz punkty 1 i 2
2. kompilator nie działa
