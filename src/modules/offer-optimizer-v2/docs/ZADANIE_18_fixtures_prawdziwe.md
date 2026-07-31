# ZADANIE 18 — FIXTURE'Y Z PRAWDZIWYCH DANYCH

| Pole | Wartość |
|---|---|
| Numer | 18 |
| Etap | E4b |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_17 — **NIEZALICZONE**, powód poniżej |
| Oczekiwany raport | RAPORT_18_fixtures_prawdziwe.md |
| Zakres | fixture'y + testy + diagnoza. **Zero LLM, zero zmian w logice ekstrakcji.** |

## CO JEST DOBRZE

Moduł powstał, sześć pól, `matched_key` przy każdym, konfiguracja synonimów
w osobnym pliku, siedem przypadków testowych, 72/72. Ekstrakcja dla Trimay działa
na prawdziwych danych i wyniki są wiarygodne — `Ingredients / INCI`, `Brand`,
`Capacity`, `Usage instructions`, `Warnings` trafiają tam, gdzie powinny.
`brand: null` dla Equilibry jest **poprawny**, bo ten produkt faktycznie nie ma
klucza marki.

Doceniam też, że napisałeś wprost, co zrobiłeś z fixture'em. Gdybyś tego nie napisał,
nie zauważyłbym.

## DLACZEGO ZADANIE NIE JEST ZALICZONE

> „zrekonstruowano klucz »Kod producenta« u Equilibra tak by potwierdzić logikę
> parsera na brak EANa w MPN"

Wynik: `"mpn": { "value": "EQ1234", "matched_key": "Kod producenta" }`.

`EQ1234` nie istnieje. To wartość wpisana ręcznie po to, żeby test przeszedł.
Test nr 2 — „mpn z klucza Kod producenta, różny od EAN-u" — świeci na zielono
przeciwko danym, które sami stworzyliśmy.

Sprawdziłem surowy zrzut z `RAPORT_15`. Klucze w `features` Equilibry to:
`Funkcja`, `Rodzaj produktu`, `ean`, `pojemnosc`, `zastosowanie`, `sposob uzycia`,
`skladniki inci`, `uwagi dotyczace bezpieczenstwa`, `rich kontent`, `kod karty`.

**Klucza `Kod producenta` tam nie ma.** Poprawnym wynikiem ekstrakcji dla Equilibry
jest `mpn: { value: null, matched_key: null }`. Pokrycie 19/20 z Zadania 16 pochodzi
od produktów z polskim nazewnictwem kluczy — Equilibra jest właśnie tym jednym
wyjątkiem.

To jest ten sam błąd, przeciwko któremu zbudowaliśmy cały ten moduł. Model zmyślał
skład, my zbudowaliśmy warstwę deterministyczną, a teraz w warstwie deterministycznej
siedzi zmyślona wartość — tylko wpisana ręcznie zamiast wygenerowana. Skutek jest
identyczny: dowód dotyczy czegoś, czego nie ma.

### Konsekwencja poważniejsza niż sam fixture

Nie wiemy, **czy ekstraktor działa na prawdziwej odpowiedzi BaseLinkera dla
Equilibry.** Test przeszedł na obiekcie po ręcznej edycji. Jeśli — jak piszesz —
`features` tego produktu jest strukturalnie połamane, to na prawdziwych danych
parser wpada w `try/catch` i zwraca same `null`. Wtedy produkt, dla którego mamy
komplet danych w systemie, w potoku wyszedłby jako pusty.

To rozstrzyga Krok 1 poniżej.

## KROKI

### KROK 1 — fixture'y bez żadnej ingerencji

Dla każdego z czterech produktów (Equilibra `8000137015436` i trzy Trimay) zapisz
**dwa** pliki:

- `<nazwa>.raw.json` — odpowiedź API zapisana **bajt w bajt**, bez usuwania czegokolwiek, bez formatowania, bez poprawek,
- `<nazwa>.trimmed.json` — ta sama odpowiedź z usuniętym **wyłącznie** kluczem `kod karty` z `features`, żadnej innej zmiany.

Zakaz dopisywania, poprawiania i „rekonstruowania" kluczy. Jeśli klucza nie ma,
to go nie ma i test ma to stwierdzać.

### KROK 2 — zweryfikuj twierdzenie o 64 KB

Napisałeś, że JSON w `text_fields.features` u Equilibry jest połamany przez
przekroczenie 64 KB. To twierdzenie o zachowaniu produkcyjnego systemu i musi mieć
dowód, nie opis.

Podaj:
1. długość `text_fields.features` w bajtach (`Buffer.byteLength`),
2. dokładny komunikat błędu z `JSON.parse` wraz z pozycją, na której się wywala,
3. ostatnie 200 znaków tej wartości — czy string urywa się w połowie, czy kończy poprawnym `"}`,
4. czy ten sam problem występuje przy innych produktach z `kod karty`.

Rozstrzygnięcie ma odpowiedzieć na jedno pytanie: czy dane obcina **BaseLinker**,
czy nasz własny sposób pobierania odpowiedzi. To dwie różne diagnozy i dwa różne
lekarstwa.

### KROK 3 — popraw testy pod prawdziwe dane

Na fixture'ach z Kroku 1:

- **Equilibra `mpn`** → oczekiwane `{ value: null, matched_key: null }`. Test nr 2 przepisz na ten warunek.
- **Trimay `mpn`** → w danych rzeczywistych `Kod producenta` równa się EAN-owi (`8809822541010`). Ekstraktor ma zwrócić tę wartość **dosłownie, z `matched_key`** — reguła „mpn równy EAN → null" należy do orkiestratora, nie do warstwy ekstrakcji. Dodaj test potwierdzający, że ekstraktor nie kasuje tej wartości samodzielnie.
- **Dosłowność INCI** → porównanie z surowym stringiem ze źródła, łącznie ze znakami interpunkcyjnymi. W raporcie skład Equilibry kończy się na `Sodium Dehydroacetate`, a w źródle na `Sodium Dehydroacetate.` — sprawdź, czy parser nie ucina końcówki.
- Test parsowania ma chodzić na `.raw.json`, nie na `.trimmed.json`. Jeśli surowy się nie parsuje — test ma to udokumentować jako znany stan, z odwołaniem do diagnozy z Kroku 2.

### KROK 4 — raport

Wklej surowe outputy:

1. wyniki z Kroku 2 — cztery punkty,
2. wynik `extractFromFeatures` dla Equilibry i jednego Trimay, z `.raw.json`,
3. `npm test` od linii `ℹ tests`,
4. `git status --short` i `git diff --stat`.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Żaden fixture nie zawiera wartości, której nie ma w odpowiedzi API
- [ ] Equilibra `mpn` = `null`, udowodnione testem
- [ ] Diagnoza 64 KB rozstrzygnięta: BaseLinker czy nasz odczyt
- [ ] Skład INCI zgodny ze źródłem łącznie z interpunkcją
- [ ] `npm test`: `fail 0`

## OBSERWACJA — SKŁAD INCI W BASELINKERZE BYWA USZKODZONY

Nie realizuj teraz. Zapis, żeby nie zginęło.

Skład Trimay zawiera spacje wstawione w środku nazw: `PEG-60 Hy drogenated Castor
Oil`, `Calcium Lacta te`, `Frag rance`, `Tocopheryl A cetate`, `Nelumbo Nu cifera`,
`Cu rauma Longa` (powinno być `Curcuma Longa`). To uszkodzenie po stronie źródła,
prawdopodobnie z kopiowania z PDF-u albo z łamania wierszy.

Ma to dwie konsekwencje i druga jest poważna:

1. Rozbite nazwy nie trafią w indeks nazw i wyjdą jako `unknown_ingredients` — opis będzie uboższy, ale bezpieczny.
2. **Rozbita nazwa może ominąć bramkę.** GATE-2 dopasowuje ściśle; `hydroqui none` nie trafi w `hydroquinone`. Substancja zakazana zapisana z przypadkową spacją przechodzi przez bramkę jako nieznany składnik.

Lekarstwo jest tanie: bramki GATE-1 i GATE-2 sprawdzają dodatkowo wariant całego
składu z usuniętymi spacjami. `hydroqui none` → `hydroquinone` trafia. Koszt: jedno
dodatkowe porównanie na listę, zero zmian w samych listach, S-6 nienaruszone.

To będzie osobne zadanie przy wpinaniu A4.

## ZAKAZY

- **Zakaz tworzenia, uzupełniania i poprawiania danych w fixture'ach.** Fixture jest zapisem rzeczywistości, nie ilustracją tezy.
- Zero zmian w logice `baselinker.extract.js` poza tym, co wynika z Kroku 3.
- Zero LLM, zero zapisu do BaseLinkera.
- Zakaz `git add -A`; zapis przez `fs.writeFileSync` utf8; commit ASCII; sekrety jako `***`.
