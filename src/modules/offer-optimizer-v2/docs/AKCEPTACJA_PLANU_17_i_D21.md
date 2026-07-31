# AKCEPTACJA PLANU 17 + DECYZJA D21

| Pole | Wartość |
|---|---|
| Numer | 17 |
| Dotyczy | PLAN_17_ekstrakcja_baselinker.md |
| Wydał | Architekt |
| Data | 2026-07-30 |
| Werdykt | **AKCEPTACJA WARUNKOWA** — dwie korekty, start bez kolejnej wymiany |

## OCENA PLANU

Plan pokrywa zadanie poprawnie. Sekcja `<WERYFIKACJA_QA>` jest dobrym nawykiem —
wykonawca sam sprawdził trzy najbardziej ryzykowne miejsca, zanim je napisał.
Ma zostać w kolejnych planach.

## USTALENIE Z SONDY — ROZSTRZYGA WCZEŚNIEJSZE PYTANIE

`getInventoryManufacturers` **ma pola adresowe i kontaktowe** (`manufacturer_street`,
`manufacturer_city`, `manufacturer_phone`), tylko są u dostawcy puste. Encja istnieje
i działa — potwierdza to producent `Lalachuu`, u którego są wypełnione.

To zamyka otwartą kwestię, gdzie operator ma ręcznie wprowadzać podmiot
odpowiedzialny. **Nie budujemy osobnej tabeli marek w Nexusie.** Miejsce już jest,
w BaseLinkerze, po stronie producenta — czyli dokładnie tam, gdzie i tak zmierza
produktyzacja katalogu. Jeden wpis na markę obsługuje wszystkie jej SKU.

Hierarchia dla podmiotu odpowiedzialnego (uzupełnienie D19):

```
1. rekord producenta w BaseLinkerze (manufacturer_*)
2. text_fields.description — ekstrakcja z tekstu, jak u Equilibry
3. HALTED_HITL_REQUIRED
```

Odczyt rekordu producenta wchodzi do Zadania 18, nie do 17 — zakres 17 zostaje bez zmian.

## KOREKTA 1 — sześć pól, nie jedno

Plan mówi o ekstrakcji „np. składu INCI, producenta, pojemności". Mapa synonimów
z zadania obejmuje **sześć** pól i wszystkie mają być zaimplementowane w tej rundzie:

`inci`, `mpn`, `brand`, `capacity`, `usage`, `warnings`

Szczególnie `mpn` z klucza `Kod producenta` — pokrycie **19 na 20 produktów**,
najwyższe z wszystkich. To jedyne pole, które A1 zmyślał w czterech przebiegach
z rzędu, mając prawdziwą wartość dwa wywołania API dalej.

## KOREKTA 2 — `matched_key` przy każdym polu, bez wyjątku

Plan wspomina `raw_fragment` dla podmiotu odpowiedzialnego, ale pomija `matched_key`.
To pole nie jest udogodnieniem audytowym — jest nośne dla eksportu.

Zgodnie z D20 eksport do BaseLinkera pisze **pod ten sam klucz, z którego czytał**.
Bez `matched_key` przy każdej wartości nie da się tego zrobić, a jakiekolwiek
mapowanie parametrów operator ma skonfigurowane w BaseLinkerze, zostanie rozbite
przy pierwszym eksporcie.

Struktura wyniku dla każdego pola: `{ value, matched_key }`, przy braku trafienia
`{ value: null, matched_key: null }`.

## POZOSTAŁE BEZ ZMIAN

Regexp po `<p>` w sąsiedztwie `mailto:` — akceptuję. Siedem przypadków testowych,
fixture'y z prawdziwych odpowiedzi API, `kod karty` usunięty — bez zmian.

**Startuj bez czekania na kolejną akceptację.** Następny kontakt: `RAPORT_17`.

---

# D21 — ŹRÓDŁA SKŁADU INCI I ZMIENNOŚĆ MIĘDZY PARTIAMI

**Podstawa: uwaga operatora z 2026-07-30. Do wpisania do `DECISION_LOG.md` przy E4b.**

## Problem

Skład produktu nie jest stały. Prawo się zmienia, receptury się zmieniają, a czasy
dostaw i stany magazynowe powodują, że w obrocie bywają jednocześnie partie
o różnych składach. Skład w BaseLinkerze może być odbiciem partii sprzed dwóch lat.

Do tego BaseLinker ma skład tylko dla **12 z 20** produktów w próbie.

## Rozstrzygnięcie

### Hierarchia

```
1. BaseLinker — text_fields.features
2. zamknięta lista zaufanych źródeł (domyślnie: strona producenta;
   pozostałe domeny operator dopisze przy E4b)
3. HALTED_HITL_REQUIRED
```

### Warunek konieczny dla źródła 2: dosłowny fragment

Wartość pobrana z sieci wchodzi do potoku **tylko wtedy**, gdy model zwróci razem
z nią adres źródła i dosłowny fragment tekstu, w którym ta wartość stoi. Kod
sprawdza mechanicznie, czy ciąg występuje w pobranej treści. Nie występuje —
wartość odpada.

To nie jest obciążenie dla operatora. Sprawdzenie jest automatyczne, po stronie kodu,
zero kliknięć. Operator zaznaczył, że nie chce weryfikować danych z zaufanych źródeł —
i nie będzie. Weryfikowany jest model, nie źródło.

Powód, dla którego sama lista domen nie wystarcza, jest empiryczny: w przebiegu
z `RAPORT_16` model zmyślił skład, **cytując przy tym `equilibra.it`** — źródło
najbardziej zaufane z możliwych. Zaufanie do domeny nie chroni przed zmyśleniem,
bo zmyślenie nie następuje w źródle, tylko po drodze.

Ta sama reguła obejmuje dane operacyjne (gabaryty, waga) — z tą różnicą, że tam
brak wartości nie zatrzymuje potoku, tylko zostawia puste pole.

### Kolejność składników jest częścią danych

Rozporządzenie 1223/2009 wymaga podania składników **w porządku malejącym według
masy**, przy czym te poniżej 1% mogą stać w dowolnej kolejności. Kolejność niesie
więc informację o stężeniu.

Skład zapisujemy i publikujemy **znak w znak, w kolejności źródłowej**. Zakaz
sortowania alfabetycznego, zakaz przestawiania, zakaz „porządkowania" na etapie
A4 i A6. To jest już w zadaniu 17 jako wymóg dosłowności — tu dostaje uzasadnienie
prawne.

### Metryka pochodzenia przy składzie

Przy każdym zapisanym składzie przechowujemy: źródło (`baselinker` / adres URL)
oraz datę pozyskania. Bez tego przy zmianie receptury nie będzie wiadomo, czy nasz
skład jest stary, czy tylko inny.

### Klauzula o partiach

Do sekcji ostrzeżeń (s6) wchodzi **stały, zamrożony tekst** informujący, że skład
może różnić się między partiami i że wiążący jest wykaz na opakowaniu.

Wymogi wobec tej klauzuli:
- tekst statyczny, z konfiguracji, **nie generowany przez model**,
- objęty freezem sekcji, żeby A7 i A10 nie mogły go zmienić ani usunąć,
- jednakowy dla wszystkich ofert kosmetycznych.

**Czego ta klauzula nie robi:** nie zwalnia z obowiązku podania rzeczywistego składu.
Art. 19 rozporządzenia 1223/2009 wymaga wykazu składników w oznakowaniu, a przy
sprzedaży internetowej konsument ma otrzymać tę samą informację co w sklepie
stacjonarnym — <cite index="23-1">w praktyce większość informacji wymaganych art. 19 powinna znaleźć się również na karcie produktu</cite>. Klauzula jest uczciwym ostrzeżeniem
o zmienności partii, nie substytutem danych i nie tarczą przed niekompletnym składem.
