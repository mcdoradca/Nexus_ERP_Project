# ZADANIE 33 — oficjalne źródła w bazie wiedzy

> **ODBIORCA: WYKONAWCA.** Wydajesz **po** zamknięciu Zadania 32. Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_33.md`, ściśle wg SZABLONU
- **Podstawa:** `ZRODLA_DANYCH_INCI.md`

Baza wiedzy pokrywa dziś 16 ze 105 unikalnych składników z fixture'ów. To zadanie
zastępuje ją wyciągiem z dwóch oficjalnych źródeł i uczy potok, jak z nich
korzystać. Zaczyna się od domknięcia dwóch rzeczy z Zadania 32.

---

## KROK 0 — domknięcie Zadania 32

**(a) Powtarzalność do powtórzenia. Poprzedni dowód nie dotyczył A1.**

Wklejone „odpowiedzi A1" to proza marketingowa o aloesowym kremie Equilibry —
a `a1Schema` zwraca JSON z dwoma polami, `country_of_origin`
i `research_sources_used`. Produkt 8000137015436 to krem-żel z węglem aktywnym,
nie krem aloesowy. Ten test odpytał model własnym promptem, obok potoku.

Powtarzasz pomiar **przez prawdziwą ścieżkę**: `orchestrator.runPhase1` na
Equilibrze z fixture'a, dwa przebiegi, wklejone dwie surowe odpowiedzi A1 w
postaci, w jakiej wracają — czyli JSON zgodny z `a1Schema`. Do tego porównanie
znak w znak.

Jeżeli A1 wywołany przez potok zwróci prozę zamiast JSON-a — to jest ważniejsze
niż powtarzalność i wtedy wklejasz to i kończysz krok 0.

**(b) Test P1 — autoryzuję rozszerzenie mocka.**

Test `orchestrator.test.js:413` pada, bo po Twojej poprawce brak `inci` słusznie
zatrzymuje potok na EXTRACT, a test chce sprawdzić kontrolę P1, do której potok
już nie dochodzi. Mock reprezentuje produkt, który nie mógłby przejść — i to jest
wada mocka, nie kodu.

**Doprecyzowanie zasady, bo mój zakaz był za szeroki po raz kolejny:**
rozszerzenie mocka wolno zrobić wtedy, gdy służy **doprowadzeniu wykonania do
kodu, który test bada**. Nie wolno wtedy, gdy służy **przepchnięciu kodu, który
się wywala**. Tutaj jest ten pierwszy przypadek: mock ma dostać poprawny `inci`
i podmiot odpowiedzialny, żeby potok w ogóle dotarł do sekcji P1.

`npm test` ma dać **`fail 0`**.

---

## KROK 1 — pobranie źródeł

Ściągasz i zapisujesz na dysk, do `data/reference/`, w postaci surowej:

**(a) Glosariusz nazw** — załącznik do Implementing Decision (EU) 2025/1175,
EUR-Lex, CELEX `32025D1175`, **wersja polska i angielska**. Około 30 400 nazw.
Od 30 lipca 2026 to jest jedyny obowiązujący słownik nazw.

**(b) CosIng** — baza Komisji, `https://ec.europa.eu/growth/tools-databases/cosing/`.
Potrzebne pola: nazwa INCI, numer CAS, numer EC, **deklarowana funkcja
kosmetyczna**, odniesienie do załącznika.

Każdy plik zapisujesz razem z metadanymi: adres pobrania, data pobrania,
`sha256` pliku. Bez tego wpisy nie wejdą do bazy.

## KROK 2 — dwie tabele referencyjne

**`INCI_NAMES`** — z (a). Jeden wiersz na nazwę:
`name_en`, `name_pl`, `canon` (kanonizacja z Zadania 31B), `source_celex`,
`retrieved_at`.

**`INCI_FUNCTIONS`** — z (b). Jeden wiersz na składnik:
`inci_name`, `canon`, `functions[]`, `cas`, `ec`, `annex_ref`, `source`,
`retrieved_at`.

Ładowanie ma być **idempotentne** — powtórny import nie tworzy duplikatów.
Test na to już istnieje w repozytorium i ma dalej przechodzić.

## KROK 3 — jak potok z tego korzysta

**GATE-3 przestaje zgadywać.** Składnik jest znany, gdy jego `canon` stoi
w `INCI_NAMES`. Nieznany to nieznany na poziomie prawa UE, a nie „nie ma go
w naszym pliku".

**Literówki dostawcy stają się widoczne.** `Glyceryl Stereate` nie istnieje
w glosariuszu, `Glyceryl Stearate` istnieje. Pozycja, której nie ma w
`INCI_NAMES`, dostaje wpis `INGREDIENT_NOT_IN_GLOSSARY: <nazwa>` i idzie do HITL.
**Nie poprawiasz jej automatycznie** — podmiana nazwy składnika w składzie
kosmetyku to zmiana treści prawnej etykiety i decyzja należy do człowieka.

**A4 dostaje funkcje, nie prozę.** Blok RAG dla A4 buduje się z `INCI_FUNCTIONS`:
nazwa i funkcje urzędowe. Powód: „humektant" wolno napisać zawsze, a
„moduluje akwaporyny" wymaga dowodu naukowego wg 655/2013 — opis zbudowany
z pola funkcji z natury przechodzi przez walidator roszczeń.

## KROK 4 — pomiar

Powtarzasz tabelę 30 składników Equilibry z Zadania 31. Trzy kolumny jak
poprzednio, plus czwarta: `trafienie w INCI_NAMES TAK/NIE`.

Podajesz dwie liczby: ile pozycji trafia w nazwy, ile ma funkcję.

---

## WARUNKI STOP — jedyne

1. źródło jest niedostępne albo w formacie, którego nie da się sparsować —
   wklejasz adres, kod odpowiedzi i fragment tego, co przyszło, i kończysz
2. po imporcie mniej niż 25 z 30 składników Equilibry trafia w `INCI_NAMES` —
   wklejasz tabelę i kończysz, bo to znaczy, że import albo kanonizacja są złe

---

## SZABLON RAPORTU

```
## 0. Domknięcie 32 — dwie surowe odpowiedzi A1 z potoku + czy identyczne; git diff mocka P1
## 1. Pobranie — adresy, daty, sha256, rozmiary plików
## 2. Tabele — plik:linia schematu + liczba wierszy w każdej
## 3. Idempotencja — wynik dwukrotnego importu, liczba wierszy po pierwszym i drugim
## 4. Wpięcie — plik:linia GATE-3, plik:linia budowy bloku RAG dla A4
## 5. Pomiar — tabela 30 składników, cztery kolumny + dwie liczby; do tego liczby na pełnych 105 pozycjach z Zadania 32
## 6. Testy — PEŁNY wydruk npm test z licznikiem ℹ tests, fail 0
## 7. git diff --stat całego modułu v2
```

---

## ZAKAZY

- **zakaz generowania jakiejkolwiek treści bazy wiedzy przez model.** Wpisy
  pochodzą wyłącznie z pobranych plików. Baza jest dla A4 „jedynym źródłem
  prawdy" — treść wygenerowana wejdzie do potoku z pieczątką źródła i żadna
  bramka jej nie złapie
- **zakaz automatycznej korekty nazw składników** — tylko zgłoszenie do HITL
- zakaz nadpisywania list GATE-1 i GATE-2 danymi z CosIng. CosIng nie ma mocy
  prawnej i sama Komisja to zaznacza; zakazy pochodzą z załączników do 1223/2009
  i to jest osobne zadanie
- **zakaz zmian w sposobie dzielenia składu na pozycje.** Inwentaryzacja
  pokazała, że `1,2-Hexanediol` rozpada się dziś na `1` i `2 Hexanediol`, bo
  dzielimy po przecinku, a przecinek stoi w środku nazwy. Naprawiamy to
  **po** imporcie glosariusza, sprawdzając sklejenia wobec listy prawdziwych
  nazw — nie regułą wymyśloną na wyczucie
- zero wywołań API BaseLinkera
- zakaz zmian w `tests/fixtures/`, promptach agentów, `prompt-compiler.js`
- zakaz naprawiania testów pod kod i rozszerzania mocków
- w zrzutach żadna wartość nie kończy się wielokropkiem
- statusu zadania nie ustalasz
