# ZADANIE 40 — dane produktu przestają pochodzić z modelu

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_40_dane_prawne.md`, w `docs/`
- **Gałąź:** ta sama

## Ocena Zadania 39: przebieg prawdziwy, wynik nie do użycia

Potok wyprodukował opis, w którym stoi:

- **150 ml** — a w `extracted_data.capacity` jest `75 ml`
- **marka MyCli** — a `extracted_data.brand` jest `null`
- **„Podmiot odpowiedzialny w UE: MyCli S.r.l., Włochy"** — a w stanie jest
  `Equilibra srl, Via Plava 74, Torino 10135, cosmetica@equilibra.it`
  razem z `raw_fragment`

Do tego w opisie **nie ma listy składników INCI**, mimo że skład jest w stanie
w całości, oraz cztery twierdzenia o produkcie bez źródła („nie barwi armatury
ani fug", „nie zalecany do skóry skrajnie odwodnionej", „ok. 60 dni",
„2,5 ml na mycie").

Kluczowa obserwacja: **dwa z trzech zmyślonych pól miały źródło w stanie.**
Pojemność i podmiot odpowiedzialny były wyekstrahowane poprawnie. Model dostał
prawdę i napisał nieprawdę. To nie jest brak danych — to brak przymusu ich użycia.

Drugi wniosek, architektoniczny: zamrażanie sekcji 3, 5 i 6 chroni je przed
edycją przez A7 i A10, ale **nie chroni przed tym, że A6 zmyśli je przy
tworzeniu**. Hash policzony z fałszywej treści zabezpiecza fałsz. Zamykamy to
tym zadaniem.

Braki formalne z Raportu 39 (brak wydruków `git`, pusta sekcja 8, rozbicie
testów sumujące się do 64 przy liczniku 122) odnotowuję i wracam do nich w
Zadaniu 42. Teraz liczy się wyłącznie to, co niżej.

---

## KROK 1 — jedno pytanie kontrolne, nie dochodzenie

Z przebiegu, który dał opis z Raportu 39:

- **`state.extracted_data` w całości**, bez skrótów
- **odpowiedź jednym zdaniem: czy `Equilibra srl` i `75 ml` znajdowały się
  w danych wejściowych wysłanych do A6?** TAK albo NIE

Jeśli NIE — dane giną między `EXTRACT` a `A6` i wskazujesz `plik:linia`, gdzie.
Jeśli TAK — idziesz dalej, bo naprawa jest w Kroku 2.

Nic więcej w tym kroku. Nie zrzucaj promptów ani surowych odpowiedzi.

## KROK 2 — sekcje faktograficzne składa kod, nie model

Trzy sekcje przestają być pisane przez model i są budowane szablonem
z `state.extracted_data`:

- **skład (sekcja 5)** — `extracted_data.inci.value` przepisane **znak w znak**
  (D21): bez parafrazy, bez skracania, bez zmiany kolejności
- **dane prawne (sekcja 6)** — `name`, `address_eu`, `contact`
  z `extracted_data.eu_responsible_person.data`, znak w znak
- **parametry produktu** — nazwa, pojemność, marka, kraj pochodzenia wyłącznie
  z `extracted_data` i z `a1_result.country_of_origin`

**Pole puste zostaje puste.** `brand` jest dziś `null` i ma się nie pojawić
w opisie w ogóle — bez „marka: brak", bez domysłu z nazwy produktu.
Pozyskiwanie marki i linii z etykiety to Zadanie 41, nie to.

Jeśli `eu_responsible_person` jest `null` — sekcja 6 nie powstaje, potok idzie
na `MISSING_EU_RESPONSIBLE_PERSON` i HITL, jak dotąd.

A6 dostaje polecenie napisania **wyłącznie sekcji narracyjnych**. Sekcji
faktograficznych nie pisze i nie ma ich w schemacie odpowiedzi.
`sha256` liczysz jak dotąd — teraz zamraża treść pochodzącą z artefaktu.

## KROK 3 — `validate_grounded_facts`

Nowy walidator na gotowym `description_html`, po A10. Sprawdza **obecność
ciągu w stanie**, nie podobieństwo — zakaz progów i fuzzy match obowiązuje.

1. każda liczba z jednostką (`\d+([.,]\d+)?\s?(ml|l|g|kg)`) musi występować
   w `extracted_data.capacity` albo w `extracted_data.product_name` →
   inaczej `UNGROUNDED_QUANTITY: <wartość>`
2. nazwa podmiotu odpowiedzialnego w opisie, po kanonizacji
   (`toLowerCase` + usunięcie znaków niealfanumerycznych), musi być identyczna
   z tą ze stanu → inaczej `FABRICATED_RESPONSIBLE_PERSON`
3. `extracted_data.brand.value === null`, a w opisie występuje etykieta marki
   z wartością → `UNGROUNDED_BRAND: <wartość>`

Każde z tych trzech **zatrzymuje potok**. Przechodzi się je wyłącznie przez
`resolveHitl`.

## KROK 4 — testy

- sekcja 5 zawiera `inci` znak w znak (porównanie ścisłe, nie zawieranie)
- sekcja 6 zawiera `name`, `address_eu`, `contact` znak w znak
- podmiana nazwy podmiotu w gotowym opisie → `FABRICATED_RESPONSIBLE_PERSON`
- `150 ml` w opisie przy `capacity = "75 ml"` → `UNGROUNDED_QUANTITY`
- `brand = null` plus etykieta marki w opisie → `UNGROUNDED_BRAND`
- `eu_responsible_person = null` → HITL, nie wymyślona treść

## KROK 5 — przebieg Equilibry, na żywo, bez atrap

Ten sam produkt `8000137015436`, dane z fixture'a, każdy węzeł prawdziwym
modelem. W raporcie:

- **pełna treść `description_html`**
- **pełna zawartość `out/offer_8000137015436.json`** — w Zadaniu 39 ta sekcja
  była pusta i tym razem jej brak unieważnia rundę
- `token_usage_per_node` zrzucony z `usageMetadata` jako JSON
- **tabela weryfikacyjna**, cztery wiersze, obie kolumny wypełnione:

| pole | wartość w `extracted_data` | wartość w `description_html` |
|---|---|---|
| pojemność | | |
| marka | | |
| podmiot odpowiedzialny | | |
| pierwsze 5 pozycji INCI | | |

Jeśli walidator z Kroku 3 zatrzyma przebieg — **to jest wynik poprawny**.
Raportujesz, co go wywaliło, i nie obchodzisz go.

## KROK 6 — testy

Pełny wydruk `npm test` z linią `ℹ tests`, bez `(...)`, `fail 0`. Rozbicie na
pliki z osobnym wierszem dla testów generowanych w pętli — suma ma się zgadzać
z licznikiem. W Raporcie 39 zgadzała się do 64 przy liczniku 122.

---

## SZABLON RAPORTU

```
## 1. extracted_data z przebiegu 39 — w całości
## 2. Czy Equilibra srl i 75 ml były na wejściu A6 — TAK/NIE (+ plik:linia jeśli NIE)
## 3. Sekcje faktograficzne — plik:linia szablonu, pełny kod funkcji
## 4. Schemat A6 po zmianie — pełny wydruk, widoczny brak sekcji faktograficznych
## 5. validate_grounded_facts — plik:linia, pełne ciało funkcji
## 6. Testy nowej logiki — plik:linia każdej z sześciu asercji
## 7. Equilibra — PEŁNA treść description_html
## 8. Equilibra — pełna zawartość out/offer_8000137015436.json
## 9. Tabela weryfikacyjna
## 10. token_usage_per_node zrzucony z usageMetadata jako JSON
## 11. Testy — pełny wydruk npm test, rozbicie zgadzające się z licznikiem
## 12. git diff --stat całego modułu v2
```

## KRYTERIUM UKOŃCZENIA — binarne

- w sekcji 2 pada TAK albo NIE
- sekcja 5 opisu zawiera skład INCI znak w znak z `extracted_data`
- sekcja 6 opisu zawiera `Equilibra srl` i adres ze stanu; ciąg `MyCli`
  nie występuje w opisie ani razu
- w opisie nie występuje żadna liczba z jednostką spoza `extracted_data`
- w opisie nie występuje etykieta marki
- sekcja 8 raportu jest wypełniona treścią pliku
- tabela z Kroku 5 ma cztery wiersze i obie kolumny
- rozbicie testów sumuje się do liczby z `ℹ tests`, `fail 0`

## ZAKAZY

- **zakaz uzupełniania brakujących pól produktu treścią z modelu**; pole puste
  zostaje puste albo idzie do HITL
- zakaz parafrazowania i skracania składu INCI, danych podmiotu odpowiedzialnego
  i ostrzeżeń
- zakaz osłabiania walidatora z Kroku 3, żeby przebieg przeszedł
- zakaz atrap między węzłami w przebiegu z Kroku 5
- zero wywołań zapisujących do BaseLinkera
- zakaz `push` na `main` i `staging`, zakaz uruchamiania deploya
- zakaz `reset --hard`, `amend`, `rebase`, `push --force`
- w wydrukach żadna wartość nie kończy się wielokropkiem
- statusu zadania nie ustalasz

## JEDYNE WARUNKI PRZERWANIA

1. w Kroku 1 wychodzi NIE — dane giną przed A6; wskazujesz `plik:linia`,
   naprawiasz przepływ i dopiero wtedy idziesz do Kroku 2
2. kompilator nie działa
3. walidator z Kroku 3 zatrzymuje przebieg — raportujesz i kończysz sekcję

W każdym innym przypadku dowozisz całość.
