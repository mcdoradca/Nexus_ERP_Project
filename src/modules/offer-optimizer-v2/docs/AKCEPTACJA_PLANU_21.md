# AKCEPTACJA PLANU 21

| Pole | Wartość |
|---|---|
| Numer | 21 |
| Dotyczy | PLAN_21_wpiecie_ekstrakcji.md |
| Wydał | Architekt |
| Data | 2026-07-30 |
| Werdykt | **AKCEPTACJA WARUNKOWA** — cztery uzupełnienia, start bez kolejnej wymiany |

## OCENA

Trzy punkty planu pokrywają kroki 1–4 zadania poprawnie i w prawidłowej kolejności.
Sekcja „ZROZUM" z wypisanymi założeniami krytycznymi jest dobrym nawykiem — zostaw ją
w kolejnych planach.

## UZUPEŁNIENIE 1 — brakuje kroków 5 i 6 (blokujące)

Plan kończy się na zmianach w kodzie. Zadanie ma jeszcze dwa kroki i bez nich nie
podlega ocenie:

**Przebiegi kontrolne na dwóch fixture'ach:**

- Equilibra `8000137015436` z pliku **`.raw.json`** (wariant z uciętym JSON-em) — oczekiwane: skład odzyskany, `truncated: true`, podmiot odpowiedzialny z opisu, `mpn` i `brand` puste,
- Trimay `8809822541010` — oczekiwane **zatrzymanie** na `MISSING_EU_RESPONSIBLE_PERSON`.

Drugi przebieg ma stanąć i **to jest wynik prawidłowy**. Nie obchodź go, nie osłabiaj
bramki, nie uzupełniaj danych.

**Raport:** pełny stan maszyny dla obu przebiegów, `usageMetadata` albo informacja
o pominięciu A1, pełny wydruk `npm test` z nazwami przypadków, `git status --short`
i `git diff --stat`, oraz **jawne zdanie: ile wywołań do API BaseLinkera wykonało to
zadanie.**

## UZUPEŁNIENIE 2 — schemat nie wystarczy, potrzebna biała lista przy scalaniu

Plan usuwa pola prawne z `a1Schema`. To konieczne, ale niewystarczające.

Jeśli model mimo zawężonego schematu zwróci pole spoza listy — a to się w tym
projekcie zdarzało — orkiestrator nie może go przyjąć „bo przyszło".

Scalanie odpowiedzi A1 ze stanem ma działać na **zamkniętej białej liście**:
`line`, `country_of_origin`, `product_name`, `research_sources_used`. Wszystko poza
nią jest **odrzucane i zapisywane jako ostrzeżenie w stanie maszyny**.

Schemat ogranicza to, o co prosimy. Biała lista przy scalaniu decyduje o tym, co
przyjmujemy. To dwie różne bariery i potrzebne są obie.

## UZUPEŁNIENIE 3 — `product_name` mamy w BaseLinkerze

Plan wymienia `product_name` wśród pól, dla których wywołuje A1. Niepotrzebnie.

Nazwa produktu leży w `text_fields.name` — to pole nadrzędne wobec `features`,
niezależne od mapy synonimów i obecne u wszystkich produktów. Dla Equilibry brzmi
„Oczyszczający krem-żel do twarzy z aktywnym węglem 75ml".

Pobieraj je bezpośrednio z `text_fields.name`. Do listy braków, które uruchamiają A1,
`product_name` trafia **wyłącznie wtedy, gdy to pole jest puste**.

Każde pole zdjęte z listy braków to jedno wywołanie modelu mniej.

## UZUPEŁNIENIE 4 — pochodzenie każdej wartości w stanie

Plan mówi, że wartości odzyskane trafiają do maszyny stanowej. Doprecyzowuję, bo to
jest kryterium zaliczenia zadania.

Razem z wartościami do stanu wchodzą: `matched_key` przy każdym polu z `features`,
`truncated`, `recovered_keys`, oraz źródło dla podmiotu odpowiedzialnego
(`description` albo brak).

Po zakończeniu FAZY 1 musi dać się odpowiedzieć na pytanie „skąd wzięła się ta
wartość" dla **każdego** pola, bez zaglądania do kodu.

## DROBIAZG, BEZ ZMIANY W PLANIE

`DATA_SOURCE_MODE` w `config/nodes.config.js` — akceptuję, ale odnotowuję, że ten
plik zbiera już rzeczy niezwiązane z parametrami wywołania węzłów (D2). Przy
najbliższej okazji porządkowej rozdzielimy konfigurację węzłów od konfiguracji
źródeł danych. Nie teraz, nie w tym zadaniu.

## DECYZJA

Po naniesieniu czterech uzupełnień **startuj bez czekania na kolejną akceptację**.
Następny kontakt: `RAPORT_21_wpiecie_ekstrakcji.md`.

Przypomnienie: **zero wywołań do API BaseLinkera**. Tryb `api` ma pozostać
zablokowaną ścieżką, nie wolno go uruchomić nawet raz „dla sprawdzenia".
