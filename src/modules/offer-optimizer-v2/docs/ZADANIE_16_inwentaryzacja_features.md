# ZADANIE 16 — INWENTARYZACJA POLA `features` W BASELINKERZE

| Pole | Wartość |
|---|---|
| Numer | 16 |
| Etap | E4a → E4b |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_15 — **ZALICZONE**, z ustaleniem o wadze krytycznej |
| Oczekiwany raport | RAPORT_16_inwentaryzacja_features.md |
| Zakres | **wyłącznie odczyt API** — zero zmian w kodzie |

## ZALICZENIE ZADANIA 15

Sonda wykonana poprawnie, commit domknięty, testy rozbite na trzy przypadki (64/64).
Rozstrzygnięcie „jest / nie ma" dla pól D18 prawidłowe: BaseLinker nie ma
strukturalnych pól GPSR.

Ale sonda pokazała coś, czego tabela nie objęła, i to jest najważniejsze ustalenie
w tym projekcie od jego początku.

## USTALENIE KRYTYCZNE — SKŁAD INCI Z A1 JEST ZMYŚLONY

BaseLinker ma skład produktu. Leży w `text_fields.features`, w kluczu
`"skladniki inci"`. Porównanie z tym, co przez cztery przebiegi zwracał A1:

**BaseLinker (30 składników):**
```
Aqua (Water), Glyceryl Stereate, Cetyl Alcohol, Ethylhexyl Stereate,
Coco-Caprylate/Caprate, Prunus Amygdalus Dulcis (Sweet Almond) Oil, Glycerin,
Hydrolyzed Eruca Sativa Leaf, Cetearyl Alcohol, C10-18 Triglyceride,
Aloe Barbadensis Leaf Juice, Vaccinium Myrtillus Fruit Extract,
Ribes Nigrum Fruit Extract, Charcoal Powder, Sodium Hyaluronate, Xanthan Gum,
Helianthus Annuus (Sunflower) Seed Oil, Tocopherol, Phenoxyethanol, Stearic Acid,
Parfum (Fragrance), Ethylexyglycerin, Dicaprylyl Ether, Sodium Lauroyl Glutamate,
Sodium Benzoate, Beta-Sitosterol, Potassium Sorbate, Squalene, Citric Acid,
Sodium Dehydroacetate.
```

**A1 (17 składników, identycznie we wszystkich czterech przebiegach):**
```
Aqua (Water), Aloe Barbadensis Leaf Juice, Ethylhexyl Palmitate, Coco-Caprylate,
Glycerin, Glyceryl Stearate, Methylpropanediol, Charcoal Powder,
Ammonium Acryloyldimethyltaurate/VP Copolymer, Phenoxyethanol, Parfum (Fragrance),
Ethylhexylglycerin, Sodium Stearoyl Glutamate, Lecithin, Tocopherol,
Ascorbyl Palmitate, Citric Acid.
```

To nie jest ten sam produkt. Sześć składników z listy A1 nie występuje w składzie
w ogóle (m.in. Methylpropanediol, Ammonium Acryloyldimethyltaurate/VP Copolymer,
Lecithin, Ascorbyl Palmitate). Trzynaście składników rzeczywistych zniknęło.

**Wśród zniknionych jest `Prunus Amygdalus Dulcis (Sweet Almond) Oil` — olej ze
słodkich migdałów.** Alergen orzechowy. Opis produktu w BaseLinkerze wymienia go
wprost po polsku, więc dane były na wyciągnięcie ręki. Osoba z alergią na orzechy,
czytająca ofertę zbudowaną z listy A1, nie zobaczyłaby tego składnika.

Zniknęło też `Hydrolyzed Eruca Sativa Leaf` — ekstrakt z rukoli, również wymieniony
w opisie z BaseLinkera.

### Dlaczego to jest najgroźniejsze ze wszystkiego, co znaleźliśmy

Stabilność tej listy przez cztery przebiegi wziąłem wcześniej za dowód, że model
ją odczytuje, a nie generuje. Myliłem się. Halucynacja była **powtarzalna**, co czyni
ją niewykrywalną metodą, którą stosowaliśmy dotąd — porównaniem kolejnych przebiegów.
Adres zmieniał się co przebieg i dlatego go złapaliśmy. Skład nie zmieniał się wcale.

Na tym polu pracują **GATE-1, GATE-2 i GATE-3**. Bramka sprawdzająca substancje
zakazane w składzie, którego produkt nie ma, nie jest zabezpieczeniem — jest atrapą.
Cała warstwa RAG, indeks nazw, pokrycie 99% — wszystko to operowałoby na wymyślonej
liście.

Przy okazji potwierdza się drugi zarzut: BaseLinker ma `weight`, `height`, `width`,
`length` równe zeru, a A1 zwracał `0.09 kg` i `15.0/5.0/3.5 cm`. Też zmyślone,
też stabilnie.

### Rozszerzenie D18

`raw_ingredients_inci` **dołącza do listy pól, których A1 nie ustala**. Źródło:
wyłącznie BaseLinker. Brak składu w BaseLinkerze → `HALTED_HITL_REQUIRED`, nigdy
uzupełnienie przez model. To samo dotyczy `logistics`.

Dobra wiadomość: dane, których szukaliśmy w sieci, w większości leżą w BaseLinkerze.
`text_fields.features` zawiera skład, pojemność, sposób użycia, zastosowanie i uwagi
bezpieczeństwa. `text_fields.description` zawiera dane producenta z prawidłowym
adresem: `Equilibra srl, Via Plava, 74 Torino – 10135 Italy, cosmetica@equilibra.it`.

Prawda była w systemie od początku. Nikt jej nie odczytywał.

## KROKI

### KROK 1 — struktura `features` na próbie katalogu

Zanim zbudujemy parser, musimy wiedzieć, czy klucze w `features` są stabilne, czy
zależą od dostawcy i importu.

1. Pobierz listę produktów z katalogu (`getInventoryProductsList`), weź **20 produktów** z możliwie różnych kategorii i marek.
2. Dla każdego pobierz `getInventoryProductsData` i wyciągnij samo `text_fields.features`.
3. Zbuduj tabelę: **nazwa klucza → w ilu z 20 produktów występuje → w ilu jest niepusty**.
4. Osobno wypisz pełną listę unikalnych nazw kluczy, jakie w ogóle wystąpiły.

Interesują mnie szczególnie warianty zapisu tego samego pojęcia — `skladniki inci`,
`sklad inci`, `INCI`, `składniki` i podobne. Wypisz je dokładnie tak, jak brzmią
w danych, ze spacjami i bez polskich znaków, jeśli tak są zapisane.

### KROK 2 — weryfikacja składu na trzech produktach

Dla trzech kosmetyków z próby (innych niż `8000137015436`) zestaw obok siebie:

- skład z `features["skladniki inci"]` (lub odpowiednika),
- czy `description` zawiera dane producenta i w jakim formacie.

Nie wywołuj A1. Nie porównuj z modelem. Chodzi wyłącznie o to, czy dane są w systemie
i jak wyglądają.

### KROK 3 — pola pozostałe

Wypisz, które pola z listy D18 dają się odczytać z BaseLinkera, choćby z tekstu:

| Pole | Gdzie w BaseLinkerze | Format |
|---|---|---|
| `raw_ingredients_inci` | | |
| `eu_responsible_person` | | |
| `net_capacity_or_weight` | | |
| `sposob uzycia` / s4 | | |
| uwagi bezpieczeństwa / s6 | | |
| `ph_value` | | |
| `clp_*`, `ufi_code` | | |

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Tabela częstości kluczy `features` z próby 20 produktów
- [ ] Pełna lista unikalnych nazw kluczy
- [ ] Skład i format danych producenta dla trzech produktów
- [ ] Tabela z KROKU 3 wypełniona

## ZAKAZY

- Zero zmian w kodzie, promptach, schematach i konfiguracji — implementacja w Zadaniu 17.
- Zero zapisu do BaseLinkera. Żadnych metod `add*`, `update*`, `delete*`.
- Zero wywołań A1 i pozostałych węzłów LLM — to zadanie nie zużywa tokenów modelu.
- Token API i klucze jako `***`.
- Jeśli w katalogu jest mniej niż 20 produktów — weź wszystkie i napisz ile.
