# AKCEPTACJA PLANU 22

| Pole | Wartość |
|---|---|
| Numer | 22 |
| Dotyczy | PLAN_22_a1_prawdziwe_dane.md |
| Wydał | Architekt |
| Data | 2026-07-31 |
| Werdykt | **AKCEPTACJA WARUNKOWA** — trzy korekty, jedna z nich obowiązkowa ze względów bezpieczeństwa |

## OCENA

Plan pokrywa wszystkie siedem kroków zadania i jest najbardziej konkretny z dotychczasowych — podaje nazwy zmiennych i przybliżone linie, więc widać, że powstał po odczycie kodu, a nie z pamięci. Cztery przypadki testowe odpowiadają wymaganym jeden do jednego.

## KOREKTA 1 — NIE USUWAJ BRAMKI, PRZENIEŚ JĄ (obowiązkowa)

Plan usuwa warunek `if (result.missing_critical_data_reason === 'BANNED_SUBSTANCE_DETECTED')`.

Sam warunek istotnie musi zniknąć — A1 nie widzi już składu, więc nie ma jak wykryć substancji zakazanej i jego deklaracja nic nie znaczy. **Ale samo usunięcie go bez uzupełnienia zostawia potok bez bramki GATE-1 w całej FAZIE 1.**

Do tej pory jedyne sprawdzenie substancji zakazanych w tej fazie pochodziło z odpowiedzi modelu. Po zmianie nie będzie żadnego, a mamy w tym momencie coś, czego wcześniej nie mieliśmy: **prawdziwy skład INCI z BaseLinkera**.

Dołóż w `runPhase1`, bezpośrednio po ekstrakcji i przed sprawdzeniami kompletności:

```
gate_ingredients(lista składników z extracted_data.inci)
```

- `BANNED_SUBSTANCE_DETECTED` → `HALTED_HITL_REQUIRED`, powód `BANNED_SUBSTANCE_DETECTED`, w stanie zapisana wykryta substancja,
- `INGREDIENT_NOT_COSMETIC` → `HALTED_HITL_REQUIRED`, powód `INGREDIENT_NOT_COSMETIC`, jw.

Skład trzeba rozbić na listę po przecinkach i znormalizować przez `normalizeIngredientName` — funkcja `gate_ingredients` przyjmuje tablicę, nie ciąg.

Piąty przypadek testowy: sztuczny skład zawierający `hydroquinone` → potok zatrzymany, **A1 nie wołany**.

Uzasadnienie: bramka zatrzymująca ma zadziałać w najwcześniejszym możliwym momencie, czyli gdy tylko mamy skład. Jeśli w produkcie jest substancja zakazana, nie ma powodu płacić za wywołanie modelu ani wchodzić w kolejne fazy. S-2 mówi, że bramki zatrzymują — a bramka, która nie jest wołana, nie zatrzymuje niczego.

## KOREKTA 2 — nie podawaj A1 całego `extracted_data`

Plan przekazuje do modelu:

```javascript
const agentData = { gtin_ean, extracted_data: this.state.extracted_data, missingFields };
```

To wysyła A1 cały skład INCI, sposób użycia, ostrzeżenia i podmiot odpowiedzialny — dane, o które go nie pytamy i których nie wolno mu tknąć.

Dwa powody, by tego nie robić. Koszt: sam skład to grubo ponad sto tokenów przy każdym wywołaniu, przy dwóch tysiącach indeksów to realne pieniądze za nic. Ryzyko: model, który widzi skład, może go odesłać w dowolnym polu tekstowym i będziemy to wycinać białą listą zamiast nie wpuszczać w ogóle.

Podaj kontekst minimalny, wystarczający do identyfikacji produktu:

```
gtin_ean, product_name, brand (jeśli znana), capacity (jeśli znana), missingFields
```

Zasada ogólna: model dostaje tyle, ile potrzebuje do zadanego pytania, i ani pola więcej.

## KOREKTA 3 — pełny wydruk testów

Plan mówi „odpalenie całego pakietu, oczekiwany brak błędów". W raporcie ma być **pełny wydruk `npm test` z nazwami wszystkich przypadków**, od pierwszej linii do ostatniej, bez `(...)` i bez skracania.

Dwa ostatnie raporty przyszły ucięte i za każdym razem kosztowało to dodatkową rundę. Po dodaniu piątego przypadku z Korekty 1 oczekiwana liczba testów to **co najmniej 77**.

## POZOSTAŁE BEZ ZMIAN

Redukcja schematu, biała lista z `A1_FIELD_REJECTED`, cztery pierwsze przypadki testowe, tryb `fixture` — bez zastrzeżeń. Atrapy w testach jednostkowych są w porządku, o ile pozostaną w testach i nie wrócą do ścieżki produkcyjnej.

## DECYZJA

Po naniesieniu trzech korekt **startuj bez czekania na kolejną akceptację**. Następny kontakt: `RAPORT_22_a1_prawdziwe_dane.md`.

Przypomnienie: **zero wywołań do API BaseLinkera**, tryb `api` pozostaje zablokowany.
