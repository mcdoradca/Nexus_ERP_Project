# AKCEPTACJA PLANU 23

| Pole | Wartość |
|---|---|
| Numer | 23 |
| Dotyczy | PLAN_23_pochodzenie_line.md |
| Wydał | Architekt |
| Data | 2026-07-31 |
| Werdykt | **AKCEPTUJĘ** — z trzema doprecyzowaniami. Startuj po ich naniesieniu, bez kolejnej wymiany. |

## OCENA

Plan pokrywa wszystkie cztery kroki. Punkt 4 zawiera hipotezę, o którą nie prosiłem,
i jest trafna — wracam do niej niżej.

## DOPRECYZOWANIE 1 — test dla `line` bez dotykania fixture'ów

Nie wiem, czy któryś z czterech fixture'ów ma klucz `Linia`. Inwentaryzacja
z Zadania 16 mówi o dziewięciu produktach na dwadzieścia, ale nasza czwórka to inny
zbiór.

**Jeżeli żaden fixture nie ma tego klucza — nie dopisuj go.**

Zamiast tego napisz test jednostkowy `extractFromFeatures` na **obiekcie zbudowanym
w treści testu**, jawnie nazwanym jako dane syntetyczne. To jest dopuszczalne
i normalne: test double w teście to nie to samo co zmyślona wartość w fixturze
udającym odpowiedź API.

Granica jest ostra:
- obiekt utworzony w pliku testowym, widoczny w kodzie testu → **dozwolone**,
- dopisanie klucza do `equilibra_8000137015436.raw.json` albo któregokolwiek pliku w `tests/fixtures/` → **zakazane bezwzględnie**.

Fixture jest zapisem tego, co zwróciło API. Jedna wartość dopisana do niego kiedyś już
kosztowała nas rundę.

## DOPRECYZOWANIE 2 — wycofuję pole `verified`

W Zadaniu 23 napisałem `{ value, source, verified }`. **Pole `verified` wycofuję** —
to była moja nadmiarowa specyfikacja i nikt nie umiałby jednoznacznie powiedzieć,
co ono znaczy. Zweryfikowane przez kogo? Kiedy? Przez człowieka czy przez kod?

Zostaje struktura jednoznaczna:

```
z BaseLinkera:  { value, source: "baselinker", matched_key }
od modelu:      { value, source: "a1" }
brak danych:    { value: null, source: null }
```

`source` niesie całą potrzebną informację. Kiedy dojdzie potwierdzanie przez operatora
przy eksporcie (D20), dołożymy osobne pole z datą i tym, kto potwierdził — wtedy
będzie miało zdefiniowane znaczenie.

## DOPRECYZOWANIE 3 — `matched_key` ma przeżyć przebudowę

Plan zmienia kształt wszystkich pól w `extracted_data`. Przy takiej operacji
najłatwiej zgubić `matched_key`, a to on odpowiada na pytanie „z którego klucza
w BaseLinkerze wzięła się ta wartość" i będzie potrzebny przy eksporcie (D20 —
zapis pod ten sam klucz, z którego czytaliśmy).

Po przebudowie sprawdź, że istniejące testy nadal asercjonują `matched_key`,
i popraw je, jeśli zmienił się poziom zagnieżdżenia. **Liczba testów nie może spaść.**

## HIPOTEZA Z PUNKTU 4 — dobra, sprawdź ją

Napisałeś, że zbadasz `Agent_1_compiled.md`, bo skompilowany prompt mógł nadal prosić
model o pola z poprzedniej wersji, mimo zawężonego `responseSchema`. **To jest
najbardziej prawdopodobne wyjaśnienie** i sam bym tam zajrzał.

Warto pamiętać, jak zbudowany jest ten prompt: sekcja WYJŚCIE w `Agent_1_prompt_v4.md`
wymienia komplet pól z czasów, gdy A1 ustalał wszystko — łącznie z `gtin_ean`,
`mpn` i `missing_critical_data`. Jeśli kompilator nadal wciąga tę sekcję w całości,
to model dostaje pisemne polecenie zwrócenia pól, których schemat już nie przewiduje.

W raporcie podaj `plik:linia` fragmentu skompilowanego promptu, który wymienia pola
wyjścia. Jeśli hipoteza się potwierdzi — **nie poprawiaj promptu w tym zadaniu.**
Zgłoś, a ja rozstrzygnę, czy zmieniamy `Agent_1_prompt_v4.md` (plik źródłowy pakietu
v4.1), czy dokładamy krok w kompilatorze. To jest decyzja architektoniczna, bo dotyka
dokumentu, który jest źródłem prawdy dla wszystkich węzłów.

## DECYZJA

**Akceptuję. Startuj.** Następny kontakt: `RAPORT_23_pochodzenie_line.md`.

Przypomnienie: zero wywołań do API BaseLinkera, tryb `api` pozostaje zablokowany,
zakaz poprawiania wartości zwróconych przez model — jeśli znowu wymyśli linię
produktową, wklej i opisz.
