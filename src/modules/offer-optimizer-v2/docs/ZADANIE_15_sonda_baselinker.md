# ZADANIE 15 — SONDA BASELINKER API (D18)

| Pole | Wartość |
|---|---|
| Numer | 15 |
| Etap | E4a → E4b (zadanie pomostowe) |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_14 — **ZALICZONE** |
| Oczekiwany raport | RAPORT_15_sonda_baselinker.md |
| Zakres | odczyt API + dwa domknięcia — **zero zmian w logice potoku** |

## ZALICZENIE ZADANIA 14

Dowody kompletne, oba pytania odpowiedziane, `NO_P1_SOURCE` i listy źródeł przed/po
filtrowaniu podane. Ustalenie z tego przebiegu jest ważniejsze niż samo zaliczenie
i opisuję je poniżej.

## D18 — A1 PRZESTAJE USTALAĆ DANE PRAWNE

**Decyzja operatora z 2026-07-30. Do wpisania do `DECISION_LOG.md` w Zadaniu 16.**

### Podstawa faktyczna

Przebieg z Zadania 14 użył dwóch źródeł klasy P1: strony producenta `equilibra.it`
i bazy CosIng Komisji Europejskiej. Filtr źródeł nie miał czego wycinać,
`NO_P1_SOURCE` nie zostało podniesione. Mimo to:

| Pole | Wartość zwrócona | Stan faktyczny |
|---|---|---|
| `eu_responsible_person.address_eu` | Via Pavia 58, 10098 Rivoli (TO) | **błędny** — prawidłowy to Via Plava 74, 10135 Torino |
| `biocidal_or_medical_permit` | `Cosinus/CPNP-2746401` | **zmyślony** — CPNP to portal zgłoszeniowy kosmetyków, nie pozwolenie; „Cosinus" to przekręcone „CosIng" |
| `ph_value` | `5.5 - 6.5` | **zmyślony** — zakres zamiast wartości, przy `sds_required: false`, czyli bez źródła |
| `mpn` | `01543` | **zmyślony** — czwarta różna wartość w czwartym przebiegu, fragment EAN-u |

Adres wychodził błędnie w trzech kolejnych przebiegach, za każdym razem inaczej,
przy dobrych źródłach. Wniosek: model nie odczytuje źródła i nie ekstrahuje z niego
danych — generuje wiarygodnie wyglądającą treść i dokleja do niej wiarygodnie
wyglądające źródło. Dyrektywę „wartość nieodnaleziona = `null`" respektuje wybiórczo:
zastosował ją do `clp_signal_word` i `ufi_code`, a zignorował przy `mpn`, `ph_value`
i pozwoleniu.

Tego nie da się naprawić sformułowaniem promptu ani walidacją formatu. Walidacja
sanity przepuściła oba błędne adresy, bo oba wyglądały jak adres.

### Treść decyzji

**A1 nie ustala danych prawnych.** Poniższe pola pochodzą wyłącznie ze źródeł
strukturalnych — BaseLinker, docelowo katalog Allegro (`GET /sale/products`, pole
`productSafety` z `responsibleProducers`) — albo nie pochodzą znikąd:

```
compliance_gpsr_clp.eu_responsible_person { name, address_eu, contact }
compliance_gpsr_clp.clp_signal_word
compliance_gpsr_clp.clp_h_phrases[]
compliance_gpsr_clp.clp_p_phrases[]
compliance_gpsr_clp.ufi_code
compliance_gpsr_clp.biocidal_or_medical_permit
compliance_gpsr_clp.ph_value
compliance_gpsr_clp.sds_required
verified_certificates[]
mpn
```

Brak danych w źródle strukturalnym → `HALTED_HITL_REQUIRED`. **Nigdy podstawienie
przez model.** Ubogi opis jest akceptowalny, wymyślony nie jest — ta sama zasada,
która stoi za D5 i GATE-3.

A1 zachowuje: `brand`, `line`, `product_name`, `country_of_origin`, `logistics`,
`raw_ingredients_inci`, `research_sources_used` oraz bramkę GATE-1 z PATCH v4.1
(wykrycie substancji zakazanej w INCI → `BANNED_SUBSTANCE_DETECTED`).

### Do rozstrzygnięcia po sondzie

`raw_ingredients_inci` był identyczny znak w znak we wszystkich czterech przebiegach,
co sugeruje odczyt, a nie generowanie. Ale na tym polu pracują GATE-1 i GATE-2, więc
zmyślony skład byłby groźniejszy niż zmyślony adres. Jeśli BaseLinker zwraca skład —
bierzemy stamtąd. Rozstrzygnięcie po Kroku 1.

## KROK 1 — sonda BaseLinker API (odczyt, zero zapisu)

Nexus ma BaseLinkera wpiętego po API. Ustal **empirycznie**, nie z dokumentacji,
co ten interfejs zwraca dla naszego SKU.

1. Wywołaj metodę katalogową dla EAN `8000137015436` (`getInventoryProductsList` do odnalezienia `product_id`, następnie `getInventoryProductsData`).
2. Wklej **pełną, surową odpowiedź JSON** dla tego produktu.
3. Osobno wypisz **listę wszystkich nazw pól**, które wróciły — łącznie z polami dodatkowymi (`text_fields`, `extra_fields` lub jakkolwiek się w tej odpowiedzi nazywają), nawet gdy są puste.
4. Odpowiedz wprost, dla każdego pola z listy D18: **jest w odpowiedzi / nie ma go w odpowiedzi**.

Zasady:
- Token API i jakiekolwiek klucze zastępujesz `***`. Nie wklejaj connection stringa ani nagłówków autoryzacji.
- Zero zapisu do BaseLinkera. Żadnych metod `add*`, `update*`, `delete*`.
- Jeśli produktu nie ma w katalogu BaseLinkera — napisz to wprost i **zatrzymaj się**, nie szukaj obejścia.

## KROK 2 — domknięcie commitu

`git status --short` po commicie `325e5c2` nadal pokazuje `M ai.wrapper.js`.
Zacommituj ten plik (po nazwie, bez `git add -A`) razem z dokumentami procesu
z katalogu `docs/`.

```
git commit -m "E4a close: wrapper sync, process docs"
```

Do gita mają wejść również pliki `ZADANIE_*.md`, `RAPORT_*.md`, `PLAN_DZIALANIA_*.md`,
`AKCEPTACJA_*.md`. Katalog `.tmp.drivedownload/` — do `.gitignore`.

## KROK 3 — wyjaśnienie liczby testów

Kryterium Zadania 13 brzmiało `tests ≥ 63` (61 istniejących plus dwa nowe przypadki
z Twojego planu: pole puste oraz pole ponad limit). Wychodzi 62.

Podaj w raporcie, ile przypadków testowych faktycznie dodałeś do
`validate_eu_responsible_person` i jak się nazywają — z referencją `plik:linia`.
Jeśli brakuje przypadku „pole ponad limit", dopisz go i uruchom baterię ponownie.

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Pełna surowa odpowiedź BaseLinkera dla EAN 8000137015436
- [ ] Lista wszystkich nazw pól z tej odpowiedzi
- [ ] Rozstrzygnięcie „jest / nie ma" dla każdego pola z listy D18
- [ ] `git status --short` bez plików `M` w module v2
- [ ] `npm test` z liczbą testów i nazwami przypadków dla walidatora podmiotu

## ZAKAZY

- Zero zmian w logice potoku, promptach i schematach — D18 wdrażamy w Zadaniu 16, po sondzie.
- Zero zapisu do BaseLinkera.
- Zero implementacji A2, A4 i dalszych węzłów.
- Sekrety w outputach jako `***`. Commit ASCII. Zapis plików przez `fs.writeFileSync` utf8.
