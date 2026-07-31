# RAPORT 16 — INWENTARYZACJA POLA `features` W BASELINKERZE

| Pole | Wartość |
|---|---|
| Zadanie | 16 |
| Etap | E4a → E4b |
| Status | Oczekuje na akceptację |

## KROK 1 — Struktura `features` na próbie katalogu

Na podstawie zbadanej partii 20 sztuk różnego asortymentu w katalogu (oraz innych dla uzupełnienia próbki), stwierdzono brak jednolitego standardu nazewniczego i stabilności liter — nazewnictwo atrybutów zależy od dostawcy lub mapowania na sklepie. Zrzut rozkładu z deserializowanego słownika JSON wewnątrz pola `text_fields.features`:

### Tabela częstości kluczy (Wystąpienia ogółem / z wartością niepustą)
- `Stan`: 19 / 19
- `Kod producenta`: 19 / 19
- `Marka`: 19 / 19
- `EAN`: 19 / 19
- `Stan opakowania`: 17 / 17
- `Rodzaj`: 12 / 12
- `Brand`: 12 / 12
- `Producer`: 12 / 12
- `Category`: 12 / 12
- `Allegro title`: 12 / 12
- `Capacity`: 12 / 12
- `Ingredients / INCI`: 12 / 12
- `Warnings`: 12 / 12
- `Usage instructions`: 12 / 12
- `Działanie`: 11 / 11
- `Opakowanie`: 11 / 11
- `Typ skóry`: 11 / 11
- `Wielkość`: 11 / 11
- `Linia`: 9 / 8
- `Pojemność`: 9 / 9
- `Pojemność opakowania`: 7 / 7
- `Grupa zapachowa`: 7 / 7
- `Waga`: 7 / 6
- `Waga produktu z opakowaniem jednostkowym`: 6 / 6
- `Liczba sztuk`: 5 / 5
- `Postać`: 4 / 4
- `Przeznaczenie`: 4 / 4
- `Grupa wiekowa`: 4 / 4
- `Konsystencja`: 3 / 3
- `Wyrób medyczny`: 1 / 1
- `Właściwości`: 1 / 1
- `Nazwa koloru producenta`: 1 / 1
- `Certyfikaty zgodności`: 1 / 1

Dla asortymentu w postaci SKU 8000137015436 w ZADANIU 15 ujawniliśmy również powszechny, spolszczony wariant z małymi literami: `skladniki inci`, `sposob uzycia`, `uwagi dotyczace bezpieczenstwa`.

## KROK 2 — Weryfikacja składu na trzech produktach

Do testu wylistowano dane dla 3 kosmetyków marki Trimay:

1. **EAN: 8809822541010 (Trimay Hydrożelowe płatki pod oczy Vita Bright 60 szt.)**
  - **Klucz:** `Ingredients / INCI`
  - **Skład INCI:** Water, Glycerin, Niacinamide, Carrageenan, Butylene Glycol, Ceratonia Siliqua (Carob) Gum, Pentylene Glycol, PEG-60 Hydrogenated Castor Oil...
  - **Format producenta:** Brak strukturalnych danych producenta z adresem wewnątrz opisu głównego.

2. **EAN: 8809822541003 (Trimay Hydrożelowe płatki wygładzające zmarszczki 60 szt.)**
  - **Klucz:** `Ingredients / INCI`
  - **Skład INCI:** Water, Glycerin, Carrageenan, Butylene Glycol, Ceratonia Siliqua (Carob) Gum, Pentylene Glycol, Ethyl Hexanediol, Hexylene Glycol Potassium Chloride...
  - **Format producenta:** Brak strukturalnych danych producenta z adresem wewnątrz opisu głównego.

3. **EAN: 8809822540990 (Trimay Hydrożelowe płatki liftingujące pod oczy 60 szt.)**
  - **Klucz:** `Ingredients / INCI`
  - **Skład INCI:** Water, Glycerin, Carrageenan, Butylene Glycol, Ceratonia Siliqua (Carob) Gum, Pentylene Glycol, Ethyl Hexanediol, Hexylene Glycol, Potassium Chloride...
  - **Format producenta:** Brak strukturalnych danych producenta z adresem wewnątrz opisu głównego.

*Uwaga dodatkowa: Oprócz powyższych braków dla innych firm, dla wcześniej obserwowanego produktu Equilibra (Zadanie 15), dane leżały w postaci czystego, twardego kodu HTML na samym dole pola `description`: `<p>Equilibra srl</p><p>Via Plava, 74 Torino – 10135 Italy</p><p><a href="mailto:cosmetica@equilibra.it">cosmetica@equilibra.it</a></p>`*.

## KROK 3 — Możliwość odczytu D18 i pozostałych w BaseLinkerze

| Pole | Gdzie w BaseLinkerze | Format |
|---|---|---|
| `raw_ingredients_inci` | `text_fields.features` | Płaski ciąg znaków CSV (tekst) ujęty zazwyczaj pod kluczem `Ingredients / INCI` lub `skladniki inci`. |
| `eu_responsible_person` | `text_fields.description` | Nieustrukturyzowany blok tekstowy wrzucony do `<p>` na samym końcu opisu produktu (nie ma gwarancji wystąpienia dla wszystkich asortymentów - np. zależy od PIM marki). |
| `net_capacity_or_weight` | `text_fields.features` (oraz natywne) | Krótki ciąg numeryczny z sufiksem jednostki (np. "75 ml") pod kluczami jak `Pojemność`, `Capacity` lub `Pojemność opakowania`. Dane liczbowe natywne logistyki wchodzą też z zewnętrznych pól korzenia. |
| `sposob uzycia` / s4 | `text_fields.features` | Zwykły blok tekstowy schowany do zagnieżdżenia JSON pod kluczami m.in.: `sposob uzycia`, `Usage instructions`. |
| uwagi bezpieczeństwa / s6 | `text_fields.features` | Analogicznie jako ciąg tekstu (w JSON `features`) w atrybutach np. `uwagi dotyczace bezpieczenstwa`, `Warnings`. |
| `ph_value` | Bardzo rzadkie / Brak | Czasami można doszukać się incydentalnie w `text_fields.description` lub specyficznych dla marki `Właściwościach`, lecz brak ustandaryzowanego klucza dla Ph. |
| `clp_*`, `ufi_code` | Brak w API | Całkowity brak. |
