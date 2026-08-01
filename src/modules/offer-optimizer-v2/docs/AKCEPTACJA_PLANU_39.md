# AKCEPTACJA PLANU 39 — z czterema korektami

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

Plan przyjmuję. Rozumiesz, co poszło nie tak w poprzedniej rundzie, i to widać.
Cztery korekty poniżej, wszystkie dotyczą Kroków 4–6.

---

## U1 — skrypt uruchomieniowy woła ten sam orkiestrator co produkcja

Napisałeś: *„Przygotuję dedykowany skrypt uruchomieniowy dla węzłów AI"*.
Skrypt pomocniczy to miejsce, w którym najłatwiej niechcący ominąć potok —
poprzednik trafił tam z `run_37.js`.

- skrypt wywołuje **to samo wejście orkiestratora**, którego użyłby przebieg
  produkcyjny; żadnego przepisywania kolejności węzłów ani logiki bramek do
  skryptu
- dane produktu **wyłącznie z fixture'ów na dysku**, zero wywołań API
  BaseLinkera, także odczytu
- **pełna treść skryptu w raporcie**, jako osobny blok

## U2 — wznowienie Trimaya ma kontynuować, a nie zaczynać od nowa

Poprzedni skrypt po `resolveHitl` wołał `orch.run()` drugi raz na tym samym
obiekcie. Jeżeli wznowienie przechodzi potok od początku, to węzły wykonują się
podwójnie, tokeny liczą się dwa razy, a `node_status` może zostać nadpisany.
To prawdopodobnie tłumaczy tabelę z Raportu 38, w której Trimay ma zużycie dla
wszystkich siedmiu węzłów mimo zatrzymania na `EXTRACT`.

W raporcie, w sekcji 9, pokaż trzy stany po kolei:

1. `orch.state` **w momencie zatrzymania** — przed jakąkolwiek ingerencją
2. `hitl_log` bezpośrednio po `resolveHitl`
3. `orch.state` końcowy

Do tego jedno zdanie: czy po wznowieniu węzły wykonane przed zatrzymaniem
zostały wykonane ponownie. Dowodem jest `token_usage_per_node` — jeśli A1 ma
jeden wpis, kontynuacja działa; jeśli wartości się zsumowały albo nadpisały,
to jest defekt i chcę o nim wiedzieć.

## U3 — `usageMetadata` zrzucasz surowo, nie przepisujesz do tabeli

Dla każdego węzła zrzut **obiektu zwróconego przez API**, jako JSON, cztery pola.
Nie przepisujesz liczb ręcznie do tabeli markdown. Powód jest konkretny: dwa
raporty wstecz pojawiły się rozbicia, które sumowały się do wartości
z wcześniejszego przebiegu.

Jeśli któryś węzeł nie zwrócił telemetrii — wpisujesz **BRAK** i nic nie liczysz.

## U4 — liczby testów nie naginasz do 122

Napisałeś, że udowodnisz „bezwzględne `ℹ tests 122`". Nie o to chodzi. Po
Kroku 3 liczba może się zmienić i to jest w porządku. Podajesz **liczbę, która
wyszła**, pełny wydruk, rozbicie na pliki i sumę, która się zgadza z licznikiem.
Jeżeli jakiś test zniknął — nazwa testu i powód. `fail 0` jest wymagane, sama
liczba nie.

**Zakaz zmieniania testu po to, żeby przeszedł.** W Kroku 3 zmieniasz wyłącznie
ścieżkę zapisu artefaktu, nie asercje.

---

## Uzupełnienie: sekcji 11 nie ma w Twoim planie

Szablon ma trzynaście sekcji, Twój plan pokrywa dwanaście. Brakuje:

```
## 11. Walidatory — wynik każdego na wyjściu A6, A7 i po patchach A10
```

To ma być wynik z przebiegu — nazwa walidatora, `valid: true/false`, przy
`false` fraza, która go wywaliła. Nie opis prozą, że „działają poprawnie".

## Doprecyzowanie warunku przerwania

Walidator odrzuca wyjście węzła → **jedno ponowienie**. Odrzuca ponownie →
raportujesz który walidator i na jakiej frazie, przechodzisz do następnego kroku
zadania. Bez mocka, bez łagodzenia walidatora, bez ręcznej poprawki treści od
modelu. Zatrzymanie opisane jest wynikiem.

Reszta planu przyjęta bez zmian. Kryteria i zakazy z Zadania 39 obowiązują.
Wykonuj.
