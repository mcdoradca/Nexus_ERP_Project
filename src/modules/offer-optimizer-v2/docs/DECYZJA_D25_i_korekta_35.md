# DECYZJA D25 + KOREKTA ZADANIA 35 — nieznany składnik nie zatrzymuje potoku

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`, wpis do `DECISION_LOG.md`.

Operator wskazał, że przy skali od 2 tysięcy do 2 milionów SKU człowiek nie może
zatwierdzać literówek. Ma rację, a polityka „nieznany składnik zatrzymuje potok"
była moim błędem. Zmieniam ją.

---

## 1. Rozdzielenie dwóch rzeczy, które sklejałem

Nazwa składnika jest nam potrzebna do **dwóch różnych celów** i tylko jeden z nich
wymaga pewności:

| Cel | Czego wymaga | Co robimy przy nazwie nieznanej |
|---|---|---|
| Lista INCI na ofercie | **niczego** — kopiujemy dosłownie z BaseLinkera (D21) | nic; obowiązek prawny spełnia kopia wierna |
| Opis od A4 | pewnego dopasowania do funkcji urzędowej | **pomijamy składnik w opisie** |
| Bramki substancji zakazanych | wykrycia mimo zniekształcenia | ekran, patrz punkt 3 |

Nigdy nie przepisujemy listy składników na ofercie. Skoro tak, to nieznana nazwa
nie jest wadą oferty — jest brakiem materiału do opisu. **A brak materiału to
powód do pominięcia, nie do zatrzymania.**

## 2. GATE-3 przestaje zatrzymywać

- składnik nieobecny w glosariuszu: `INGREDIENT_NOT_IN_GLOSSARY: <nazwa>`
  w `normalization_warnings`, **bez** `hitl_alert`, **bez** `HALT`
- taki składnik nie wchodzi do bloku RAG dla A4 i nie pojawia się w opisie
- potok idzie dalej

To skaluje się bez ograniczeń, bo nie wymaga człowieka ani razu.

## 3. Ekran odległości edycyjnej — wyłącznie na liście zakazanej

Zostaje jedno realne ryzyko: zniekształcona nazwa **substancji zakazanej**.
Kanonizacja z Zadania 31B radzi sobie ze spacjami i interpunkcją
(`Hydro quinone`), ale nie z przestawioną literą (`Hydroqinone`).

Dlatego dla **tokenów nieznanych** liczymy odległość edycyjną **wobec samej listy
zakazanej** (GATE-1 i GATE-2, około 31 pozycji). Odległość ≤ 1 → `hitl_alert`
i zatrzymanie.

**Sprostowanie do mojego wcześniejszego zakazu similarity.** Zakaz był słuszny
dla **identyfikacji** — decydowania, czym składnik jest. Był za szeroki dla
**ekranowania** — decydowania, czy coś wymaga spojrzenia człowieka. Różnica jest
w kierunku błędu: ekran może wyłącznie **zatrzymać**, nigdy przepuścić.
Fałszywy alarm kosztuje jedno spojrzenie, przeoczenie kosztuje substancję
zakazaną w ofercie. D5 i S-5 obowiązują nadal tam, gdzie chodzi o ustalanie
tożsamości składnika.

## 4. Tabela aliasów rośnie z danych, nie ze SKU

To jest odpowiedź na obawę o skalę. Praca człowieka jest proporcjonalna do liczby
**unikalnych zepsutych wariantów**, nie do liczby produktów. `Glyceryl Stereate`
zatwierdzone raz obsługuje wszystkie produkty tego dostawcy na zawsze.

- alias powstaje **wyłącznie** z decyzji człowieka przez `resolveHitl`,
  z wpisem w `hitl_log`
- alias działa **tylko** przy szukaniu funkcji i przy ekranie z punktu 3;
  **nigdy** nie zmienia listy INCI publikowanej na ofercie
- **model nie tworzy i nie proponuje aliasów** — zakaz z Zadania 35 obowiązuje

---

## KOREKTA ZADANIA 35 — co robisz w tej rundzie

Punkty 1, 2 i 3 z `ZADANIE_35` zostają bez zmian: wydruk testów jest nadal
blokujący, czwarty wariant nawiasowy wchodzi, `C10-18 Triglyceride` ustalasz.

Dochodzi:

**4.** GATE-3 zmienia się z zatrzymania na ostrzeżenie, zgodnie z punktem 2 tej
decyzji. Asercja: produkt z nieznanym składnikiem przechodzi dalej, ma wpis
`INGREDIENT_NOT_IN_GLOSSARY`, a ten składnik nie występuje w bloku RAG.

**5.** Policz i podaj: ile jest **unikalnych** nazw nietrafionych w glosariusz na
wszystkich fixture'ach. To jest liczba, która mówi, ile realnie kosztuje tabela
aliasów. Sama lista, alfabetycznie.

**Ekranu z punktu 3 nie budujesz w tej rundzie** — wydam go osobno, po wydruku
testów, bo dotyka bramek i nie ruszam ich w ciemno.

## ZAKAZY

- zakaz użycia modelu do kanonizacji, mapowania, korekty i proponowania nazw
- zakaz autokorekty nazw i zakaz zmiany listy INCI publikowanej na ofercie
- zakaz obchodzenia, wyłączania i mockowania bramek
- zakaz usuwania i wyłączania testów
- zakaz zmian w `normalizeIngredientName`, `validators/`, `tests/fixtures/`,
  `data/reference`
- zero wywołań API BaseLinkera
- w wydrukach żadna wartość nie kończy się wielokropkiem
