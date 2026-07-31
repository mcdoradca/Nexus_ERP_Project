# DECYZJA D20 — MODEL EKSPORTU NEXUS PIM → BASELINKER

| Pole | Wartość |
|---|---|
| Numer decyzji | D20 |
| Wydał | Architekt |
| Data | 2026-07-30 |
| Podstawa | ustalenia operatora z 2026-07-30 |
| Wdrożenie | E6 (przedefiniowane) — **nie realizujemy teraz** |
| Do wpisania | `DECISION_LOG.md` przy starcie E5 |
| Nie dotyczy | ZADANIE_17 — realizuj bez zmian |

## 1. PODZIAŁ RÓL — KOREKTA WOBEC PLANU

Dotychczasowy plan zakładał, że v2 przepina frontend Nexusa endpoint po endpoincie
i na tym kończy. Ustalenie operatora zmienia to zasadniczo:

```
BaseLinker  →  źródło wsadowe (odczyt)
Nexus PIM   →  system autorski: tu powstaje i mieszka oferta,
               tu wiszą adsy, BDO i EPR, tu jest widok pod Allegro
BaseLinker  →  kanał dystrybucji (zapis, po jawnym kliknięciu operatora)
              →  Allegro i pozostałe marketplace'y
```

Kluczowe: **Nexus jest PIM-em autorskim, nie klientem BaseLinkera.** Oferta powstaje
w potoku, po zatwierdzeniu ląduje w katalogu PIM Nexusa i tam żyje dalej. Eksport do
BaseLinkera jest osobnym, świadomym aktem operatora — nie automatycznym następstwem
zatwierdzenia.

Konsekwencja dla planu: **E6 przestaje być „przepięciem frontendu", a staje się
budową eksportu.** Do zapisania przy starcie E5.

## 2. BIAŁA LISTA PÓL EKSPORTU

Eksport wysyła w żądaniu **wyłącznie** pola z listy A. Pola z listy B nie są
wysyłane w ogóle — nie „wysyłane bez zmian", tylko fizycznie nieobecne w payloadzie.
Różnica jest istotna: pole wysłane z niewłaściwą wartością nadpisuje, pole nieobecne
nie może nadpisać niczego.

### Lista A — potok pisze

- tytuł / nazwa produktu
- opis
- opis dodatkowy
- parametry (`features`)
- zdjęcia
- logistyka i gabaryty: waga, długość, szerokość, wysokość

### Lista B — potok nie dotyka nigdy

- cena, cena zakupu netto, cena sprzedaży detalicznej
- stawka VAT
- stan magazynowy, rezerwacje, progi, dostawy w drodze
- koszty pakowania
- logistyka out (koszt wysyłki do klienta)
- transport in (cła, koszt transportu do magazynu)
- BDO / EPR
- powiązania ze sklepami, lokalizacje magazynowe

Implementacja: lista A jest zamkniętym zbiorem w konfiguracji. Budowniczy payloadu
składa żądanie **wyłącznie z niej**, a nie z obiektu produktu z odjętymi polami.
Nowe pole w BaseLinkerze nie może w ten sposób przypadkiem wejść do eksportu.

## 3. LUKA: GABARYTY NIE MAJĄ ŹRÓDŁA

Gabaryty są na liście A, ale dziś nie mamy skąd ich wziąć.

- BaseLinker dla `8000137015436` zwraca `weight: 0, height: 0, width: 0, length: 0`.
- A1 zwracał `0.09 kg` i `15.0/5.0/3.5 cm` — wartości zmyślone, stabilnie powtarzane przez cztery przebiegi (`RAPORT_16`).

To nie jest kosmetyczny problem. Gabaryty wchodzą do wyliczeń kosztu wysyłki i do
progów gabarytowych przewoźników. Zmyślone wymiary to zmyślony koszt logistyki na
każdej sprzedaży.

Do rozstrzygnięcia przed E6 — możliwości: pomiar własny przy przyjęciu towaru,
dane od dostawcy, albo pozostawienie pola pustego i wyłączenie go z eksportu do
czasu uzupełnienia. **Model nie jest tu źródłem** (D19).

## 4. MIGAWKI — KOSZT PRZY 2000 SKU

Operator zgłosił wątpliwość co do kosztu przechowywania. Liczby:

Migawka obejmuje **tylko pola z listy A**, bez klucza `kod karty` (blok HTML
szablonu marketingowego, którego potok nie dotyka — u Equilibry to zdecydowana
większość objętości `features`).

| Pozycja | Rozmiar |
|---|---|
| tytuł | ~0,1 KB |
| opis | ~3 KB |
| opis dodatkowy | ~1 KB |
| `features` bez `kod karty` | ~2 KB |
| adresy zdjęć | ~0,5 KB |
| gabaryty | ~0,05 KB |
| **razem na SKU** | **~7 KB** |

- 2000 SKU × 7 KB ≈ **14 MB** przy jednej migawce na produkt
- trzy zachowane wersje ≈ **42 MB**
- po kompresji tekstu (typowo 3–5×) ≈ **10–15 MB**
- hash SHA-256 na kartę: 32 bajty, czyli 64 KB na cały katalog

To jest pomijalne dla Postgresa. Koszt nie jest argumentem przeciwko migawkom.

**Polityka retencji:** trzy ostatnie wersje na SKU, starsze kasowane przy zapisie
czwartej. Bez limitu czasowego — liczba wersji wystarczy.

Operator zaznaczył, że rozjazdów po stronie BaseLinkera się nie spodziewa, bo nikt
nie zmienia kart bez jego wiedzy. Migawka zostaje mimo to, ale w roli głównej **cofki
po własnym błędzie**, nie detektora cudzych zmian. Porównanie hashy zostaje jako
tani dodatek — kosztuje 32 bajty i zero wysiłku.

## 5. ODPOWIEDŹ NA NIEPEWNOŚĆ CO DO MAPOWANIA PARAMETRÓW

Operator nie wie, czy w BaseLinkerze są skonfigurowane reguły mapowania parametrów
na Allegro, i zaznacza, że dziś obsługuje firmę A, a jutro może obsługiwać firmę B
z zupełnie inną konfiguracją.

**Zasada rozstrzygająca: eksport pisze pod ten sam klucz, z którego czytał.**

Moduł ekstrakcji z Zadania 17 zapisuje przy każdym polu `matched_key` — dokładną
nazwę klucza w `features`, z której dana pochodzi. Eksport używa tej nazwy. Jeśli
produkt miał `Ingredients / INCI`, wraca do `Ingredients / INCI`. Jeśli miał
`skladniki inci`, wraca tam.

Skutek: jakiekolwiek mapowanie istnieje w BaseLinkerze, zostaje nienaruszone.
Nie musimy wiedzieć, czy jest — działamy poprawnie w obu przypadkach.

Nazwa kanoniczna jest używana **wyłącznie dla pól, których w karcie wcześniej nie
było**. Nowy klucz może nie mieć mapowania i wtedy parametr po prostu nie pojawi się
na Allegro — brak parametru, nie zepsute mapowanie.

**Wycofuję wcześniejszą sugestię kanonizacji trzydziestu trzech kluczy przy okazji
eksportu.** Przy nieznanej konfiguracji mapowań byłaby to zmiana, która psuje coś,
czego nie widzimy. Kanonizację robi się razem z przebudową mapowań, świadomie,
osobnym zadaniem.

**Wielodostępność:** mapa synonimów z Zadania 17 jest konfiguracją, nie kodem,
i ma być wiązana z katalogiem BaseLinkera (`inventory_id`). Firma B dostaje własną
mapę bez ruszania kodu.

## 6. PONOWNE URUCHOMIENIE POTOKU NA TYM SAMYM PRODUKCIE

Decyzja operatora: nowy przebieg **zastępuje** zawartość karty w katalogu PIM Nexusa.
Bez wersji równoległych do porównywania.

Przyjmuję, z jednym zastrzeżeniem do rozstrzygnięcia przy implementacji: jeśli
operator poprawi ręcznie opis w katalogu PIM, a potem uruchomi potok ponownie, ta
poprawka przepadnie bez śladu. Mitygacja tania i wystarczająca: **jedna wersja
wstecz**, zachowywana przy każdym nadpisaniu, z możliwością przywrócenia. To nie jest
system wersjonowania — to jest jeden krok cofki, ten sam mechanizm co migawka przed
eksportem.

## 7. CO Z TEGO WYNIKA DLA HARMONOGRAMU

Nic w E4b i E4c się nie zmienia. Zapis zwrotny to E6, po testach A/B na treści.

Jedna rzecz przesuwa się w górę: **białą listę pól eksportu trzeba zapisać
w konfiguracji już przy E4b**, razem z mapą synonimów. Nie po to, żeby jej używać —
po to, żeby lista powstała, gdy pamiętamy powody, a nie w pośpiechu przy wdrożeniu.
