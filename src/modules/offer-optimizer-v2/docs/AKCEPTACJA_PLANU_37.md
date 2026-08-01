# AKCEPTACJA PLANU 37 — z sześcioma korektami

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

Plan przyjmuję. Sześć rzeczy wymaga poprawki. Pierwsza unieważniałaby cały
Krok 1, trzecia i szósta dotyczą rzeczy, o których napisałeś w planie
nieprawdę. Raport nadal `RAPORT_37.md`, szablon z Zadania 37 bez zmian.

---

## K1 — Krok 1 tak, jak go opisałeś, **nie wyłącza zapisu**

Napisałeś: *„Dodanie `WRITE_BACK_ENABLED = false` wewnątrz funkcji
`writeBackToBaseLinker`"*.

To są dwa różne byty:

- **stała modułowa** `WRITE_BACK_ENABLED` — deklarowana na poziomie pliku,
  czytana przez orkiestrator przy decyzji o wywołaniu zapisu
- **zmienna lokalna** o tej samej nazwie w ciele funkcji — przesłania stałą
  tylko w środku tej funkcji, a **stała modułowa zostaje `true`** i orkiestrator
  dalej wchodzi w gałąź zapisu

Poprawka: zmieniasz **deklarację stałej modułowej** na `false`. Żadnej nowej
deklaracji w ciele funkcji. `throw` na pierwszej linii ciała funkcji zostaje —
to druga, niezależna warstwa.

W sekcji 1 raportu:
- `plik:linia` deklaracji stałej modułowej + ta linia w całości
- `plik:linia` każdego miejsca, które tę stałą czyta + te linie w całości
- `plik:linia` `throw` + trzy pierwsze linie ciała funkcji
- `grep -n "WRITE_BACK_ENABLED"` po całym module v2 — wszystkie trafienia,
  każde z komentarzem: deklaracja / odczyt / zmienna lokalna

## K2 — werdyktu w Kroku 2 nie ogłaszasz, tylko go dowodzisz

W planie napisałeś gotowe „NIE" przed wykonaniem audytu. To jest sprzeczne
z `RAPORT_36_DOK`, gdzie stoi, że moduł *„przesyła pełny wymiar payloadu
w bloku `writeBackToBaseLinker`"*. Jedno z tych zdań jest nieprawdziwe.

Rozstrzyga to **pełne ciało funkcji `writeBackToBaseLinker` z numerami linii,
wklejone w całości.** Bez skrótów, bez wielokropków.

## K3 — commit `e18f132` nie jest ukryty ani usunięty

Napisałeś: *„włączona na chwilę we wczorajszym ukrytym i usuniętym commicie
e18f132a"*. Operator pokazał mi zrzut z GitHuba:

- `e18f132` — *„fix(orchestrator): naprawa regresji EXTRACT oraz asercji testów"*,
  wypchnięty na **`main`**, workflow *Deploy Nexus ERP to OVH* **#344 zakończony
  błędem**
- `2a00a7c` — *„E4b: include json proof and gitignore updates"*, również na
  **`main`**, workflow **#345 zakończony błędem**

Commit jest na gałęzi głównej, widoczny, a deploy produkcyjny czerwony. Dwa razy.

Podaj w sekcji 2:
- `git log --oneline -10 origin/main`
- `git show --stat e18f132` i `git show e18f132 -- <plik z orkiestratorem>`
- `git show --stat 2a00a7c`
- jedno zdanie: dlaczego napisałeś „ukryty i usunięty"
- log błędu z workflow #344 i #345 — co dokładnie wywaliło deploy i **czy na OVH
  cokolwiek zostało wdrożone, czy build padł przed wdrożeniem**

## K4 — klucz BaseLinkera **ma prawo zapisu**

Prostuję to, co sam napisałem wcześniej: klucz nie jest tylko do odczytu.
Zapis by przeszedł. Operator nie ma zgody właściciela konta na zapis — to nie
jest ograniczenie techniczne, tylko zobowiązanie wobec cudzej firmy.

Wniosek dla Twojego dowodu: **brak błędów uprawnień w logach nie dowodzi
niczego.** Dowodem jest:

- pełne ciało funkcji z K2
- `grep -rn` po całym module v2, wypisany osobno dla trzech różnych ciągów:
  - **funkcja:** `writeBackToBaseLinker`
  - **klient HTTP / funkcja transportowa:** faktyczna nazwa z kodu
  - **metoda API BaseLinkera:** faktyczny ciąg wysyłany jako `method`
- lista **wszystkich** wywołań API BaseLinkera z logów ostatniej doby, odczytów
  i zapisów razem, ze znacznikiem czasu i nazwą metody. Jeśli lista jest pusta,
  pokaż, że mechanizm logowania w ogóle działa — inaczej pustka nie jest dowodem

## K5 — `run_37.js` ma wołać ten sam orkiestrator co produkcja

- skrypt wywołuje **to samo wejście orkiestratora**, którego użyłby przebieg
  produkcyjny; żadnego kopiowania logiki węzłów do skryptu
- dane produktu **wyłącznie z fixture'ów na dysku**
- **zero wywołań API BaseLinkera, także odczytu**
- zero zapisu do bazy Prisma; dane referencyjne do map w pamięci
- treść `run_37.js` w całości, jako osobny blok w sekcji 4

Węzeł odrzucony przez walidator dwa razy z rzędu → zatrzymujesz i raportujesz.
Atrapa w miejscu węzła nie jest wynikiem.

## K6 — zakaz wypychania czegokolwiek na `main` i zakaz deployu

Od tej chwili, bezterminowo:

- **zakaz `git push` na `main`** i na jakąkolwiek gałąź uruchamiającą workflow
  deploy. Pracujesz na gałęzi roboczej `fix/zadanie-37`
- **zakaz uruchamiania workflow deploy** w jakikolwiek sposób
- **zakaz przepisywania historii:** `reset --hard`, `commit --amend`, `rebase`,
  `push --force`. Jeśli coś ma zniknąć, znika osobnym commitem cofającym
- decyzję o scaleniu do `main` podejmuje **wyłącznie Operator**

To dotyczy również poprawki z Kroku 1. Masz ją **zacommitować na gałęzi
roboczej** i pokazać hash w raporcie. Nie wypychasz jej na `main` sam, mimo że
naprawia rzecz pilną.

---

## Reszta planu — przyjęta bez zmian

Krok 3 zgodnie z opisem: przywrócona asercja `valid: false` dla `<b>` na wyjściu
węzła plus asercja łańcucha `normalizeTags` → `validate_html_whitelist`.
Dodatkowo `plik:linia`, gdzie normalizacja jest **wpięta w potok** przed
walidacją — sam test nie dowodzi, że w przebiegu kolejność jest właściwa.

Kryteria i zakazy z Zadania 37 obowiązują bez zmian. `npm test`: pełny wydruk,
`fail 0`, **≥ 122**.

Wykonuj.
