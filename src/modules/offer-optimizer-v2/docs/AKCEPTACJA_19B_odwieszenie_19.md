# AKCEPTACJA 19B — WERYFIKACJA ZALICZONA, ZADANIE 19 ODWIESZONE

| Pole | Wartość |
|---|---|
| Numer | 19B |
| Dotyczy | RAPORT_19B_weryfikacja_pomiaru.md |
| Wydał | Architekt |
| Data | 2026-07-30 |
| Werdykt | **ZALICZONE** — pomiar z 19A potwierdzony |
| Skutek | `ZADANIE_19_odzysk_i_commit.md` odwieszone, realizuj bez zmian |

## OCENA

Weryfikacja spełnia swoją rolę: rozkład jest spójny wewnętrznie, rozliczenie wywołań
API się zgadza, a wartości kontrolne dla czterech znanych produktów odpowiadają temu,
co widziałem w surowych zrzutach z Zadań 15 i 17.

Najmocniejszy dowód to sam rozkład. Equilibra `65535`, drugi w kolejności `24062`,
dalej łagodnie opadająca krzywa. Ponad czterdzieści kilobajtów odstępu między
przypadkiem uszkodzonym a najbliższym mu produktem — to nie wygląda na liczby
dobrane do tezy, tylko na pomiar.

Dwa szczegóły, które podnoszą wiarygodność, choć nikt o nie nie prosił: `description`
Equilibry ma 1257 bajtów, co zgadza się z długością bloku, który czytałem w Zadaniu 15,
a `features` produktów Trimay mieszczą się w przedziale 1888–2045 bajtów, czyli tyle,
ile powinien ważyć ich skład INCI z resztą atrybutów.

**Zadanie 19 odwieszam. Realizuj wersję z pliku `ZADANIE_19_odzysk_i_commit.md`,
bez zmian.**

## TRZY OBSERWACJE — NIE BLOKUJĄ, ALE ZAPISUJĘ

### 1. Skrypt bada tylko pierwszy katalog

```javascript
const invId = invRes.inventories[0].inventory_id;
```

Skrypt bierze **pierwszy** katalog z listy i nie sprawdza, czy są kolejne. Jeśli
w BaseLinkerze jest więcej niż jeden, to „552 produkty" opisuje jeden z nich, a nie
całość.

Nie zmienia to decyzji — parser odzyskujący budujemy tak czy inaczej, bo bez niego
nasz własny SKU testowy nie przejdzie przez potok. Zmienia natomiast mianownik,
a ten będzie potrzebny przy doborze próby do E5.

**Do raportu z Zadania 19 dopisz jedno zdanie:** ile katalogów zwraca `getInventories`
i jakie mają identyfikatory. Masz to wywołanie w skrypcie, więc kosztuje jedną linię.

### 2. Skrypt zależy od starego modułu

```javascript
require('../../offer-optimizer/baselinker.service.js')
```

W skrypcie diagnostycznym to akceptowalne. W kodzie produkcyjnym v2 — nie: przy E7
stary moduł znika i taka zależność zabiera moduł v2 ze sobą.

Zasada na przyszłość: `offer-optimizer-v2` nie importuje niczego z `offer-optimizer`.
Jeśli potrzebny jest klient BaseLinkera po stronie v2, powstaje własny.

### 3. Identyfikatory produktów gubią się przy odczycie

Wszystkie rekordy mają `product_id: "N/A"`, i to jest ta sama przyczyna, co
`ID: undefined` w poprzednim raporcie:

```javascript
products = products.concat(Object.values(dataRes.products || {}));
```

`getInventoryProductsData` zwraca produkty jako obiekt **kluczowany identyfikatorem**.
`Object.values()` odrzuca klucze, czyli dokładnie te identyfikatory. Poprawnie byłoby
`Object.entries()` i przeniesienie klucza do rekordu.

Dla tego pomiaru bez znaczenia, bo wystarczał EAN. Ale warto o tym pamiętać przy
eksporcie z D20 — tam `product_id` będzie potrzebny do wskazania, którą kartę
nadpisujemy, a pomyłka oznacza nadpisanie cudzego produktu.

Przy okazji: jeden rekord w katalogu ma `ean: "BRAK"`, a inny `5012251014250` z zerową
zawartością obu pól tekstowych. Potok jest kluczowany EAN-em, więc produkty bez EAN-u
nie przejdą przez niego w ogóle. Do uwzględnienia przy doborze próby do E5, nie teraz.

## DROBNA UWAGA METODOLOGICZNA

Dla produktów typu `object` skrypt mierzy `Buffer.byteLength(JSON.stringify(feat))`,
czyli rozmiar **po ponownej serializacji**, nie rozmiar oryginalnego zapisu
w BaseLinkerze. Te wartości mogą się nieznacznie różnić — inne escapowanie, inne
białe znaki.

Przy odstępie 65535 wobec 24062 nie ma to żadnego znaczenia dla wniosku. Notuję,
żeby nikt później nie traktował tych liczb jako dokładnych rozmiarów w bazie.
