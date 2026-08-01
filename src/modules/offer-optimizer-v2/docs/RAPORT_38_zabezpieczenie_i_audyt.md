# RAPORT 38: Zabezpieczenie i audyt

## 1. Co zostało zrobione

### 1.1. Przeniesienie blokady zapisu na origin/main
- Pobrano aktualny kod gałęzi `origin/main`. Zgodnie z przewidywaniami, nie znajdowała się na niej poprawka `WRITE_BACK_ENABLED = false`.
- Przeniesiono funkcję `writeBackToBaseLinker` wraz ze stałą zabezpieczającą z commita wypracowanego w zadaniu 37 przy pomocy polecenia cherry-pick (po uprzednim schowaniu obecnych zmian na gałęzi).
- Upewniono się, że stała `WRITE_BACK_ENABLED` jest ustawiona na `false` i umieszczona w zakresie pliku (w `orchestrator.js`).
- Zweryfikowano bezwarunkowy rzut wyjątkiem na samym początku metody `writeBackToBaseLinker`.

### 1.1b. Weryfikacja commita zadania 37
- W zadaniu 37 naprawiono mechanizm rzucania wyjątku i ustawiono stałą modułową, ale odbyło się to na wyizolowanej gałęzi `fix/zadanie-37`, a nie na `origin/main`.
- Cherry-pick commita był kluczowy, by odblokować pipeline i przywrócić testy dla nowego zadania na gałęzi wychodzącej od `origin/main`.

### 1.1c. Analiza środowisk w kontekście wdrożeń testowych
- Sprawdzono za pomocą `git ls-remote` zdalne gałęzie pod kątem środowiska Stage. Zauważono brak fizycznej gałęzi `origin/staging` (występuje jedynie branch wdrażany na środowisko stagingowe co wynika z pliku CI `staging-deploy.yml`).
- Wprowadzono prewencyjną bramkę na etapie CI, by żadne ze środowisk nie mogło pomyłkowo zmienić `WRITE_BACK_ENABLED = true`.

### 1.2. Uzupełnienie zabezpieczeń metody zapisującej
- Zweryfikowano, że `WRITE_BACK_ENABLED` zostało zadeklarowane jako stała na poziomie modułu (`const WRITE_BACK_ENABLED = false;`). Usunięto zdublowaną deklarację.
- Metoda `writeBackToBaseLinker` rzuca bezwarunkowo wyjątek `WRITE_BACK_DISABLED_BY_OPERATOR`.

### 1.3. Wdrożenie bramki CI w workflow GitHub Actions
- W plikach `.github/workflows/deploy.yml` oraz `.github/workflows/staging-deploy.yml` dodano krok weryfikacyjny blokujący wdrożenie w przypadku znalezienia `WRITE_BACK_ENABLED = true`.

---

## 2. Diagnoza (Zadanie 38 - Audyt stanu bieżącego)

### 2.1. Testy jednostkowe
- Wszystkie 122 testy przechodzą pomyślnie (`npm test`). Zakończono pełną passę bez błędów.

### 2.2. Węzły na żywo - usageMetadata

Dane statystyczne z pliku stanu potoku (`logs/state_PL-8809822541010-1785568222543.json`):

| Node | promptTokenCount | candidatesTokenCount | thoughtsTokenCount | totalTokenCount |
|---|---|---|---|---|
| A1  | 860  | 61   | 0    | 921  |
| A2  | 756  | 482  | 0    | 1238 |
| A4  | 3199 | 641  | 0    | 3840 |
| A5  | 3016 | 120  | 1052 | 4188 |
| A6  | 3365 | 1537 | 0    | 4902 |
| A7  | 2831 | 923  | 0    | 3754 |
| A10 | 3221 | 9    | 0    | 3230 |

### 2.3. Inwentaryzacja odczytów z BaseLinkera

| URL Odczytu | Metoda API | Funkcja wywołująca | Uwagi |
|---|---|---|---|
| `https://api.baselinker.com/connector.php` | `getInventoryProductsList` | `scripts/sonda_katalogi_20.js` -> `BaseLinkerService.rawCall` | Wyłącznie z jednorazowego skryptu developerskiego do sondowania bazy. |
| `https://api.baselinker.com/connector.php` | `getInventoryProductsData` | `scripts/sonda_katalogi_20.js` -> `BaseLinkerService.rawCall` | Wyłącznie z jednorazowego skryptu. |

**Wniosek:** Główne skrypty modułowe (w tym `orchestrator.js` oraz `baselinker.extract.js`) nie wykonują **żadnego fizycznego** żądania odczytu (`HTTP GET/POST`) do serwerów BaseLinkera podczas działania potoku. Całość opiera się na dostarczanych obiektach `product` pochodzących na przykład ze zrzutów z plików (fixtures) lub payloadów webhooków nałożonych z zewnątrz.

### 2.4. Diagnoza zepsutego składania oferty (Krok 3)
Problem z raportowanym w Zadaniu 37 artefaktem w postaci wyjścia `description_html` jako `<p>B</p>\n\nFROZEN\n\n\n` został w pełni zdiagnozowany.

- **Winny:** `zła atrapa testowa` (z mockowanego testu A10 w module)
- **Wyjaśnienie:** Poprzedni proces zaniepokoił się wynikiem z pliku `out/offer_8000137015436.json`. Jednakże plik ten to bezpośredni rzut wygenerowany pod koniec wykonywania środowiska testowego (plik testowy `tests/orchestrator.test.js`). W teście o nazwie `"Zadanie 36-DOK: A10 waliduje brak target_section w patchu"` celowo wstrzykiwany jest mock w postaci `orch.state.a6_result = { section_1_html: '<p>B</p>', section_3_html: 'FROZEN' };`. Ponieważ łatka jest zła (nie ma `target_section`), odrzuca się ją, a moduł przechodzi do kroku `FINISH`, gdzie po prostu skleja dostarczone wartości ze zmiennych i zrzuca je do `/out/`. Błąd nie istnieje w środowisku aplikacji, tylko w "brudnym" śladzie pozostawianym przez zestaw testów, który został błędnie potraktowany jako realne, zepsute wyjście produkcyjne potoku. Nie wymaga naprawy w kodzie aplikacji. 
