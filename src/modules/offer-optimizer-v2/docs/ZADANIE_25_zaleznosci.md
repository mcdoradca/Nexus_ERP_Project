# ZADANIE 25 — zależności kontraktu A1 (odblokowanie 24A)

> **ODBIORCA: WYKONAWCA.** Ten plik wklejasz agentowi. Kopia do `docs/`.

- **Od:** Architekt
- **Data:** 2026-07-31
- **Dotyczy:** wstrzymania zgłoszonego w `RAPORT_24A_kontrakt_A1.md`
- **Raport wyjściowy:** `RAPORT_25_zaleznosci.md`

---

## KONTEKST

Zatrzymałeś się prawidłowo. Grep był po to, żeby to wyłapać, i wyłapał.
Kolejka: **25 → wznowienie 24A → 24B.**

---

## ROZSTRZYGNIĘCIE: `orchestrator.js:216`

```javascript
216:  if (result.mpn === result.gtin_ean) {
```

To **nie jest** zależność do ochrony. `a1Schema` nie zawiera ani `mpn`, ani
`gtin_ean` — model zwracał te pola wyłącznie dlatego, że kazał mu przestarzały
prompt. Po poprawce promptu przestanie je zwracać i wtedy `result.mpn` oraz
`result.gtin_ean` będą **oba `undefined`**, a `undefined === undefined` zwraca
`true`. Warunek zapalałby się przy każdym przebiegu, na każdym produkcie.

To jest bomba z opóźnionym zapłonem, którą Twój grep rozbroił, zanim wybuchła.

Sama kontrola „mpn równe EAN" ma sens, ale nie na wyjściu modelu — na warstwie
ekstrakcji, gdzie `Kod producenta` z BaseLinkera bywa równy EAN-owi (Trimay).
To jest defekt **D-23.5** i tam ją przenosimy, w Zadaniu 24B. Nie teraz.

Drugie znalezisko, `validators/index.js:35`, jest innej klasy i rozstrzygnę je
po punkcie 2 poniżej.

---

## KROKI

**1. Usuń warunek z `orchestrator.js:216` wraz z jego blokiem.**

**Dowód:** `git diff` tego fragmentu w całości oraz:

```
grep -rn "gtin_ean" src/modules/offer-optimizer-v2/ --include=*.js
```

z pustym wynikiem, wklejonym nawet gdy pusty.

Jeśli usunięcie wywali któryś test — **nie naprawiasz testu pod kod.**
Zatrzymujesz się, podajesz nazwę testu i `plik:linia` asercji.

**2. Ustal fakty o `validators/index.js:35`. TYLKO ODCZYT, ZERO ZMIAN.**

Podaj cztery rzeczy:

- pełne ciało funkcji, w której stoi linia 35, z numerami linii
- `grep -rn "raw_ingredients_inci" src/modules/offer-optimizer-v2/` — wszystkie
  trafienia, bez filtrowania
- kto tę funkcję woła i jaki obiekt jej podaje — `plik:linia` każdego wywołania
- czy w module v2 istnieje **jakiekolwiek miejsce, które przypisuje wartość**
  do `raw_ingredients_inci`. Jeśli nie istnieje — napisz to jednym zdaniem wprost

Piszę wprost, czego się obawiam, żebyś wiedział, czego szukasz: jeśli żadne
miejsce w v2 tego pola nie wypełnia, a walidator sprawdza je warunkiem `if`,
to ta gałąź nigdy się nie wykonuje. Bramka, która nie widzi składu, przepuszcza
wszystko i nie mówi o tym ani słowa. **Ustalasz, nie naprawiasz.**

**3. `npm test`** — pełny wydruk, `fail 0`, liczba nie niższa niż 78.

---

## KRYTERIUM ZALICZENIA (binarne)

- `grep -n` po `gtin_ean` w `.js` modułu v2 daje pusty wynik, wklejony
- punkt 2 ma cztery odpowiedzi, każda z surowym outputem albo z jednym zdaniem
  rozstrzygającym
- `npm test`: pełny wydruk, `fail 0`, ≥ 78
- lista asercji zmienionych w tej rundzie, jeśli jakiekolwiek: `plik:linia`

---

## ZAKAZY

- **zero zmian w `validators/`** — punkt 2 jest wyłącznie odczytem
- zero zmian w `Agent_1_prompt_v4.md` i `Agent_1_compiled.md`; 24A wznowię osobno
- zero wywołań API BaseLinkera i jakiegokolwiek API zewnętrznego
- zakaz zmian w `tests/fixtures/`
- zakaz refaktoryzacji `orchestrator.js` poza usunięciem bloku z punktu 1
- w zrzutach żadna wartość nie kończy się wielokropkiem; wartość długa w całości
  albo długość w znakach i skrót SHA-256
- brak danych ≠ zgadywanie: `//HITL:` + wpis w raporcie
