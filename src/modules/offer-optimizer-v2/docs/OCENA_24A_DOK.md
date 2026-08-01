# OCENA RAPORTU 24A-DOK

> **ODBIORCA: DOKUMENTACJA.** Tylko do `docs/`. Wykonawcy nie wklejasz.

- **Zadanie:** 24A-DOK
- **Raport:** `RAPORT_24A_DOK.md`
- **Data oceny:** 2026-07-31
- **Werdykt: NIEZALICZONE** — brakuje dwóch z siedmiu dowodów, oba dotyczą tego
  samego pliku pakietu v4.1

Zaznaczam od razu: merytorycznie ta runda jest najlepsza w całym ciągu 23–24.
Nie zaliczam jej z powodu dwóch nieprzeklejonych diffów i jednego zdania, które
one miały wyjaśnić.

---

## 1. Bilans

| Kryterium | Wynik |
|---|---|
| tabela sum kontrolnych, zmieniony dokładnie jeden wiersz | spełnione — dziewięć agentów (A3 nie istnieje), zmienił się wyłącznie A1 |
| `git diff -- prompt-compiler.js` | **BRAK** — opisane prozą |
| `git diff -- docs/PATCH_v4_1_prompty.md` | **BRAK** |
| cztery outputy z kroku 2 | spełnione, wszystkie surowe |
| pełny `orch.state`, bez wielokropków, z listą wstrzyknięć | **spełnione** |
| `plik:linia` + wydruk `allowedKeys` + asercja | spełnione |
| `npm test`, `fail 0`, ≥ 79 | spełnione — 79/79 |

---

## 2. Dlaczego brakujący diff patcha jest blokujący

W raporcie stoi zdanie:

> „W pliku `docs/PATCH_v4.1_prompty.md` z usuniętą w całości sekcją
> `## Agent_1_prompt_v4.md` znajduje się **nowa treść** ucinająca przemycane
> stare klucze dla pierwszego noda"

Zlecenie brzmiało: usuń sekcję A1, nie dotykaj reszty. **O nowej treści nie było
mowy.** Nie wiem, co w tym pliku teraz stoi ani co z tego trafia do
skompilowanego promptu A1.

Tabela sum kontrolnych ogranicza szkodę — zmienił się wyłącznie A1, więc
pozostałe dziewięć promptów nie straciło treści bezpieczeństwa (GATE-2 dla A4,
limity CMR dla A5, kalendarz AI Act dla A9, eskalacja dla A10). To jest dobra
wiadomość i dlatego nie traktuję sprawy jako awarii. Ale prompt A1 zawiera dziś
treść, której nie widziałem i nie zatwierdzałem, a grep sprawdzający zakazane
pola pochodzi sprzed tej zmiany.

Rozwiązanie jest tańsze niż spór: `Agent_1_compiled.md` ma 2114 bajtów.
Niech go wklei w całości. Przeczytam sam i sprawa jest zamknięta.

---

## 3. Co zostało zrobione dobrze

**Poprawka promptu jest dokładnie taka, jak wskazałem.** Z diffa widać, że
`## DYREKTYWY TWARDE` zostały nietknięte w komplecie — ZERO INFERENCJI,
hierarchia P1/P2/P3, nota o sumie kontrolnej EAN. Blok `--- DANE SKU ---`
i nagłówek z parametrami też. `## ZAKRES POZYSKANIA` zredukowany do jednego
punktu, `## FLAGA missing_critical_data` usunięta w całości, `## WYJŚCIE`
do dwóch pól z zachowanym limitem ośmiu domen.

**`a1Schema` — dwa pola w `properties`, dwa w `required`**, `orchestrator.js:14-24`.

**Zrzut stanu jest prawdziwym zrzutem.** Pełny obiekt, bez wielokropków,
z listą wartości wstrzykniętych nad nim. Pokazuje przypadek trudniejszy niż
poprzednio: Equilibra **bez** klucza `Linia` w źródle, `extracted_data.line`
zostaje `null`, `A1_FIELD_REJECTED: line` w ostrzeżeniach, `a1_result` bez
klucza `line`. To jest ta ścieżka, którą powstały obie zmyślone linie, i jest
zamknięta.

**Wydruk testów pełny, 79/79**, z nową pozycją `Orchestrator - Zasada P1-first
dla pola line`.

---

## 4. Luka, którą sam przeoczyłem

`allowedKeys` po zmianie:

```javascript
const allowedKeys = ['country_of_origin', 'research_sources_used', 'brand'];
```

Kazałem usunąć `line` i `product_name`. **Nie wymieniłem `brand`** — i to jest
moje przeoczenie, nie jego.

`brand` nie stoi już w `a1Schema`, ale dokładnie tak samo było z `line`, a model
i tak go zwracał. Equilibra nie ma marki w BaseLinkerze (`brand.value: null`,
`source: null` — widać w zrzucie), więc dla niej P1-first nie zadziała i wartość
z modelu przeszłaby na listę dopuszczonych. Marka trafia do tytułu oferty
i identyfikuje producenta; zmyślona jest błędem tej samej klasy co zmyślona
linia. D19 nie umieszcza modelu w hierarchii dla żadnego pola.

---

## 5. Uwaga do dokumentacji projektu

Kopia `Agent_1_prompt_v4.md` w wiedzy projektowej jest **starsza niż plik
w repozytorium** — brakuje w niej zdania o zakazie podstawiania `gtin_ean` pod
`mpn` i o literale `null`, dopisanego w Zadaniu 11-DOK2. Rozstrzygające jest
repozytorium. Warto odświeżyć kopię, bo czytam z niej, ustalając zakres zmian.

---

## 6. Kolejka

To jest **ostatnia runda dowodowa na 24A**. Po niej: **26** (`route_chemical`,
D-25.1) i **24B** (sanityzacja pól bez źródła, ADR, przeniesienie kontroli
`mpn == EAN`).
