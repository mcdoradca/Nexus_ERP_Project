# ZADANIE 38 — zabezpieczenie zapisu, audyt stanu, diagnoza składania

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi po prompcie
> wprowadzającym. Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_38_zabezpieczenie_i_audyt.md`, ściśle wg szablonu
- **Gałąź robocza:** `fix/zadanie-38`, odbita od `main`

Przejmujesz projekt po poprzednim Wykonawcy. Ta runda nie dodaje funkcji.
Ma ustalić, co naprawdę jest w repozytorium, i zamknąć jedno realne ryzyko.
Nie zgaduj — czego nie zmierzysz, tego nie wpisujesz.

---

## KROK 1 — zapis do BaseLinkera, wszystkie gałęzie *(blokujący)*

Poprzednik przestawił `WRITE_BACK_ENABLED` na `true` i wypchnął to na `main`.
Potem cofnął to na gałęzi roboczej `fix/zadanie-37`, ale **stan `main`
i `staging` nie został sprawdzony**. Ryzyko jest takie, że ktoś przepisze
`staging` na `main`, deploy tym razem przejdzie i moduł zacznie pisać do cudzego
konta BaseLinkera.

**1.1 Inwentaryzacja — pełne wydruki, nie streszczenia:**

```
git branch -a -v
git rev-list --all | xargs -I{} git grep -l "WRITE_BACK_ENABLED = true" {} 2>/dev/null
git log --oneline -20 origin/main
git log --oneline -20 origin/staging
git show origin/main:<ścieżka>/orchestrator.js | grep -n "WRITE_BACK_ENABLED"
git show origin/staging:<ścieżka>/orchestrator.js | grep -n "WRITE_BACK_ENABLED"
```

Ostatnie dwa polecenia są najważniejsze: pokazują, co **stoi dziś na
wierzchołkach** obu gałęzi. Wypisz obie wartości wprost.

**1.2 Naprawa stanu bieżącego, bez ruszania historii.** Na `fix/zadanie-38`:

- deklaracja **stałej modułowej** `WRITE_BACK_ENABLED = false` — na poziomie
  pliku, nie w ciele funkcji. Deklaracja lokalna o tej samej nazwie przesłania
  stałą tylko w środku funkcji, a modułowa zostaje `true`
- bezwarunkowy `throw new Error('WRITE_BACK_DISABLED_BY_OPERATOR')` w pierwszej
  linii ciała `writeBackToBaseLinker`
- test: wywołanie funkcji rzuca ten błąd nawet przy stałej ustawionej na `true`

**1.3 Bramka w CI.** Krok w workflow deploy, który kończy się błędem, gdy
w module v2 istnieje linia z `WRITE_BACK_ENABLED = true`. Ma się wykonywać
**przed** krokiem testów, żeby awaria testów go nie przesłoniła — tak właśnie
zdarzyło się przy #344. Podaj plik workflow, `plik:linia` i treść kroku.

**1.4 Nie wypychasz niczego na `main` ani `staging`.** Zostawiasz gotowy commit
na gałęzi roboczej i podajesz jego hash. Scalenie wykonuje Operator.

## KROK 2 — audyt stanu faktycznego

Trzy pytania, na każde odpowiedź z wydrukiem:

**2.1 Testy.** Pełny wydruk `npm test` z linią `ℹ tests`, **bez `(...)`**, plus
lista plików `tests/*.test.js` z dysku i liczba testów zebrana z **każdego pliku
osobno**. Suma ma się zgadzać z licznikiem. Jeżeli któryś plik się nie ładuje,
ma to być widoczne — poprzedni deploy padł na `Could not find src/.../*.test.js`,
więc ścieżka do testów jest podejrzana i sprawdź ją także w konfiguracji CI.

**2.2 Które węzły były kiedykolwiek uruchomione na żywo.** Przejrzyj `out/`
i logi przebiegów. Dla każdego węzła `A1, A2, A4, A5, A6, A7, A10` podaj:
najświeższy przebieg z prawdziwym `usageMetadata` (data pliku + cztery pola)
albo słowo **BRAK**. Nie uzupełniaj brakujących liczb niczym.

**2.3 Ścieżka odczytu z BaseLinkera.** `plik:linia` każdego miejsca w module v2,
które woła API BaseLinkera, z nazwą metody. Odczyt jest legalny, ale chcę
wiedzieć, gdzie jest — żeby wiedzieć, czego pilnować.

## KROK 3 — diagnoza zepsutego składania *(to jest właściwy problem projektu)*

Ostatni przebieg wypuścił do `out/offer_8000137015436.json` opis o treści:

```
<p>B</p>\n\nFROZEN\n\n\n
```

A6 miał napisać sześć sekcji HTML. Na wyjściu jest dziewięć znaków treści.
Dopóki to nie działa, moduł nie produkuje oferty i nie ma czego wdrażać.

Ustal **przyczynę**, z `plik:linia`:

- gdzie powstaje `description_html` — funkcja składająca, jej pełne ciało
  z numerami linii
- skąd bierze sekcje: z `state.a6_result`, z `state.a10_result`, czy z fixture'a
- czy w ścieżce składania jest odczyt z pliku fixture zamiast ze stanu
  (poprzednik napisał, że „fixture dla `a10_result` miał to zakodowane" —
  sprawdź, czy fixture w ogóle wchodzi do przebiegu produkcyjnego)
- czy sekcje zamrożone są wycinane ze składania i podmieniane na literał `FROZEN`

**Decyzja podjęta z góry, żebyś się nie zatrzymywał:** jeżeli przyczyną jest
jeden dający się wskazać defekt — **naprawiasz go** i robisz przebieg na żywo
Equilibry (`8000137015436`), dane produktu z fixture'a, wszystkie węzły
prawdziwym modelem, zero atrap między węzłami. Jeżeli przyczyn jest więcej niż
jedna albo naprawa dotyka sekcji zamrożonych — **opisujesz i nie naprawiasz**,
decyzja należy do Architekta.

---

## SZABLON RAPORTU — bez którejkolwiek sekcji raport nie jest oceniany

```
## 1. Gałęzie — pełne wydruki z 1.1, wartość stałej na main i na staging wprost
## 2. Blokada — plik:linia stałej, throw, testu; hash commitu na fix/zadanie-38
## 3. Bramka CI — plik workflow, plik:linia, treść kroku
## 4. Testy — pełny wydruk npm test, lista plików z dysku, liczba z każdego osobno
## 5. Węzły na żywo — tabela A1..A10: data przebiegu + cztery pola usageMetadata albo BRAK
## 6. Odczyt BaseLinkera — plik:linia + nazwa metody, każde wystąpienie
## 7. Składanie — pełne ciało funkcji z numerami linii + wskazana przyczyna
## 8. Naprawa — wykonana czy nie, uzasadnienie wg decyzji z Kroku 3
## 9. Przebieg Equilibry — tylko jeśli naprawiałeś: PEŁNY orch.state, PEŁNA treść
      description_html, token_usage_per_node zrzucony z usageMetadata jako JSON
## 10. git diff --stat całego modułu v2
```

## KRYTERIUM UKOŃCZENIA — binarne

- w sekcji 1 padają dwie konkretne wartości: dla `main` i dla `staging`
- `WRITE_BACK_ENABLED === false` **i** funkcja rzuca bezwarunkowo
- bramka CI istnieje i stoi przed krokiem testów
- suma testów z poszczególnych plików zgadza się z licznikiem `ℹ tests`
- w sekcji 5 każda pozycja to albo cztery zmierzone liczby, albo słowo BRAK
- w sekcji 7 pada jedna konkretna przyczyna z `plik:linia`

## ZAKAZY — poza tymi z promptu wprowadzającego

- zakaz `push` na `main` i `staging`, zakaz uruchamiania deploya
- zakaz `reset --hard`, `amend`, `rebase`, `push --force`
- zakaz jakiegokolwiek wywołania zapisującego do BaseLinkera
- zakaz dopisywania liczb `token_usage`, których nie zmierzyłeś
- zakaz atrap między węzłami w przebiegu z sekcji 9
- w wydrukach żadna wartość nie kończy się wielokropkiem

## JEDYNE WARUNKI PRZERWANIA

1. na `main` lub `staging` stała jest `true` **i** deploy w międzyczasie przeszedł
   — raportujesz natychmiast i nie robisz nic więcej
2. kompilator nie działa
3. przyczyn zepsutego składania jest więcej niż jedna — opisujesz wszystkie
   i kończysz na Kroku 3 bez naprawy

W każdym innym przypadku dowozisz całość.
