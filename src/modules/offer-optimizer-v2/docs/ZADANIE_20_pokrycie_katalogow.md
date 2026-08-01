> # ZADANIE WYCOFANE — NIE REALIZOWAC
>
> **2026-07-30:** wykonanie tego zadania doprowadzilo do zablokowania klucza API
> BaseLinkera w godzinach pracy firmy. Blokada objela wszystkie integracje naraz:
> statusy zamowien i stany magazynowe przestaly sie synchronizowac.
>
> **Numer 20 pozostaje niewykorzystany.** Nie wydajemy pod nim nowego zadania,
> zeby nie powstaly dwa dokumenty o tym samym numerze.
>
> Zakres — skan katalogu 30754 i domkniecie mapy synonimow — wraca w osobnym
> zadaniu przed E5: z kopii na dysku tam, gdzie sie da, z policzonym budzetem
> wywolan i przelotem poza godzinami pracy firmy.
>
> Ponizsza tresc zostaje wylacznie jako slad procesu. **Nie realizowac.**

---

# ZADANIE 20 — DRUGI KATALOG I POKRYCIE EKSTRAKCJI

| Pole | Wartość |
|---|---|
| Numer | 20 |
| Etap | E4b |
| Wydał | Architekt |
| Data wydania | 2026-07-30 |
| Poprzednie zadanie | ZADANIE_19C — **ZALICZONE** |
| Oczekiwany raport | RAPORT_20_pokrycie_katalogow.md |
| Zakres | pomiar + uzupełnienie konfiguracji. **Zero LLM, zero zmian w logice ekstraktora.** |

## ZALICZENIE ZADANIA 19C

Sprawa liczby testów wyjaśniona i wyjaśnienie się broni: sześć wymaganych asercji
zostało wpiętych do bloków 4 i 5, a nie dopisanych jako osobne bloki. Widać to
w samym wydruku — blok 4 nazywa się teraz „test odzysku (64KB bug w BaseLinker)",
podczas gdy w Zadaniu 18 nazywał się „test fallback na zepsutym JSON". Plik
rzeczywiście był edytowany.

**Próg `tests ≥ 78` był moim błędem.** Założyłem, że nowe przypadki powstaną jako
osobne bloki, i uczyniłem z tego kryterium binarne. Liczba bloków testowych nie jest
miarą pokrycia — asercja wewnątrz istniejącego bloku chroni tak samo. Następnym razem
poproszę o listę asercji, nie o liczbę testów.

Jedna uwaga na przyszłość, bez zadania: przy sześciu asercjach w jednym bloku
pierwsza, która padnie, zatrzyma pozostałe i raport pokaże jedną awarię zamiast
sześciu. Przy rozbudowie tego pliku warto je rozdzielić.

## USTALENIE Z KROKU 4 — SĄ DWA KATALOGI

```
Katalogów: 2
ID: 23757, 30754
```

Wszystkie dotychczasowe pomiary — Zadanie 16, 19A i 19B — objęły **wyłącznie katalog
23757**. Drugi katalog nie został dotknięty ani razu.

To znaczy, że nie wiemy o nim nic:

- ilu jest w nim produktów,
- czy ma produkty z uciętym `features`,
- **jakich nazw kluczy używa** — a mapa synonimów w `baselinker.extract.config.json` powstała z próby dwudziestu produktów jednego katalogu.

Ostatni punkt jest istotny. Jeśli drugi katalog nazywa skład inaczej niż
`Ingredients / INCI` i `skladniki inci`, to ekstraktor zwróci dla całego tego katalogu
same `null` — czyli dokładnie ta awaria, którą właśnie naprawialiśmy przez cztery
rundy, tylko na większą skalę i po cichu.

Zanim wepniemy ekstrakcję do orkiestratora, musimy wiedzieć, co ma obsłużyć.

## KROKI

### KROK 1 — oba katalogi, pełny przelot

Rozbuduj `scripts/check_64kb_limit.js` (albo napisz obok, jak wygodniej) tak, żeby
iterował po **wszystkich** katalogach z `getInventories`, nie po `inventories[0]`.

Dla każdego katalogu osobno podaj:

- `inventory_id` i nazwę,
- liczbę produktów,
- liczbę produktów z `features` jako string,
- liczbę produktów, dla których `JSON.parse(features)` się nie udaje,
- liczbę produktów bez EAN-u.

### KROK 2 — tabela częstości kluczy, per katalog

Dla każdego katalogu zbuduj tabelę: **nazwa klucza → w ilu produktach występuje →
w ilu jest niepusty.** Tak jak w Zadaniu 16, ale na całości, nie na dwudziestu
produktach.

Wypisz pełną listę unikalnych nazw kluczy z obu katalogów.

### KROK 3 — czego mapa synonimów nie łapie

Zestaw klucze z Kroku 2 z mapą z `baselinker.extract.config.json` i wypisz:

1. klucze, które **nie trafiają** w żaden synonim,
2. z nich osobno te, które wyglądają na wariant jednego z naszych sześciu pól (`inci`, `mpn`, `brand`, `capacity`, `usage`, `warnings`).

Punkt 2 rozstrzygaj sam, ale **nie dopisuj niczego do mapy na tym etapie** — najpierw
pokaż listę.

### KROK 4 — uzupełnienie mapy

Dopisz do `baselinker.extract.config.json` warianty z punktu 2 Kroku 3.

Zasady:
- tylko warianty nazw **tych samych sześciu pól**, żadnych nowych pól,
- klucz niejednoznaczny → **nie dopisuj**, wypisz go w raporcie jako wątpliwy i zostaw mnie z decyzją,
- zero zmian w logice `baselinker.extract.js`.

### KROK 5 — pokrycie ekstrakcji, liczba dla E5

Uruchom ekstraktor na **wszystkich produktach obu katalogów** i podaj, dla ilu z nich
każde z sześciu pól jest niepuste:

| Pole | Katalog 23757 | Katalog 30754 | Razem | % całości |
|---|---|---|---|---|
| inci | | | | |
| mpn | | | | |
| brand | | | | |
| capacity | | | | |
| usage | | | | |
| warnings | | | | |

Osobno: **dla ilu produktów `inci` jest niepuste** — to jest liczba, która mówi,
ile produktów potok jest dziś w stanie przetworzyć bez zatrzymania. Będzie mi
potrzebna do doboru próby przy E5.

### KROK 6 — raport i commit

1. wszystkie tabele z kroków 1–5,
2. surowy output skryptu,
3. `npm test` — pełny wydruk z nazwami,
4. `git log --oneline -1` i `git status --short`.

Commit po nazwie, bez `git add -A`:
```
git commit -m "E4b: full catalog scan both inventories, synonym map extension"
```

## KRYTERIUM ZALICZENIA (binarne)

- [ ] Statystyki osobno dla obu katalogów
- [ ] Pełna lista unikalnych kluczy z obu katalogów
- [ ] Lista kluczy nietrafiających w mapę, z wyróżnieniem wariantów naszych sześciu pól
- [ ] Tabela pokrycia sześciu pól
- [ ] Liczba produktów z niepustym `inci`
- [ ] `npm test`: `fail 0`

## ZAKAZY

- Zero zmian w logice `baselinker.extract.js` — zmieniamy wyłącznie konfigurację.
- Zakaz dopisywania do mapy kluczy niejednoznacznych. Wątpliwość → raport, nie decyzja.
- Zero LLM, zero zapisu do BaseLinkera, zero implementacji A2/A4.
- Zakaz `git add -A`; zapis przez `fs.writeFileSync` utf8; commit ASCII; sekrety jako `***`.
