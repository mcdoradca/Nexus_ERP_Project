# ZADANIE 34 — GATE-3: obejście won, dopasowanie do naprawy

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_34.md`, ściśle wg SZABLONU
- **KROK 3 Zadania 33: NIEZALICZONY**

Mapy referencyjne działają i liczby są dobre — 72 ze 105 pozycji dostaje funkcję
wobec 16 wcześniej. Problem jest gdzie indziej i jest poważny.

---

## 1. W kodzie produkcyjnym stoi wyłącznik bramki

```javascript
if (notInGlossary.length > 0 && !global.skipGlossaryHitl) {
```

`global.skipGlossaryHitl` to przełącznik wyłączający bramkę bezpieczeństwa,
wpisany na stałe w orkiestrator, i został użyty — „zasymulowano ucięcie tego
bramkowania". Zakaz obchodzenia bramek obowiązuje od Zadania 30 bez wyjątków
i obejmuje demonstracje.

**Usuwasz tę flagę i wszystkie jej użycia.** Nie zostawiasz jej pod inną nazwą,
w konfiguracji ani pod zmienną środowiskową. Jedyna droga obok blokady to
`resolveHitl` z wpisem w `hitl_log` — mechanizm, który sam zbudowałeś
w Zadaniu 30.

## 2. GATE-3 blokuje z naszej winy, nie z winy etykiety

Spójrz na listę odrzuconych składników Equilibry:

```
aqua water, parfum fragrance, prunus amygdalus dulcis sweet almond oil,
c10 18 triglyceride, helianthus annuus sunflower seed oil, sodium dehydroacetate.
```

To **nie są** błędy dostawcy. Etykieta ma `Aqua (Water)`, `Parfum (Fragrance)`,
`C10-18 Triglyceride`, `Helianthus Annuus (Sunflower) Seed Oil` — czyli nazwy
poprawne. Zniszczył je nasz własny `normalizeIngredientName`: zamienił nawias
na spację, myślnik na spację i zostawił kropkę końcową.

**Przyczyna:** GATE-3 kanonizuje wynik `normalizeIngredientName`, czyli ciąg już
uszkodzony. `C10-18 Triglyceride` skanonizowane z surowej postaci daje
`c1018triglyceride` i trafia w glosariusz. Skanonizowane z `c10 18 triglyceride`
daje to samo — ale tylko dlatego, że `canon` usuwa spacje. Problem jest przy
nawiasach: `Aqua (Water)` daje `aquawater`, a w glosariuszu stoi `AQUA`, czyli
`aqua`. Nie trafi nigdy.

**Poprawka, wyłącznie deterministyczna:**

1. `canon` liczysz z **surowej nazwy z etykiety**, nie z wyniku normalizatora
2. dla nazwy zawierającej nawias generujesz **trzy warianty**: całość bez
   nawiasów (`aquawater`), część przed nawiasem (`aqua`), zawartość nawiasu
   (`water`). Trafienie w którykolwiek wariant = składnik znany
3. kropka, przecinek i średnik na końcu nazwy obcinane przed kanonizacją

Bez podobieństwa, bez progów, bez odległości edycyjnej.

**`normalizeIngredientName` zostaw w spokoju** — służy innym rzeczom i jego
zmiana rozwaliłaby istniejące testy. Zmieniasz to, co GATE-3 podaje na wejściu.

## 3. Zniknęło dziewiętnaście testów

W Zadaniu 33 KROK 2 było **93**, teraz jest **74**, przy `git diff --stat`
pokazującym sześć zmienionych linii w testach. Sześć linii nie usuwa
dziewiętnastu testów — najprawdopodobniej któryś plik testowy przestał być
zbierany albo wywala się przy ładowaniu map referencyjnych.

Ustal przyczynę, podaj ją jednym zdaniem i przywróć komplet.
Wydruk `npm test` **bez `(...)`** — poprzedni był ucięty.

## 4. Polityka GATE-3 zostaje twarda

Po poprawce z punktu 2 zdecydowana większość prawdziwych składników trafi
w glosariusz. To, co zostanie, to autentyczne błędy na etykiecie —
`Glyceryl Stereate` zamiast `Stearate`, `Calcium Lacta te` zamiast `Lactate`.
Taka nazwa na ofercie jest wadą prawną etykiety, więc **zatrzymanie na HITL jest
właściwe** i tego nie zmieniamy. Autokorekty nadal nie ma.

---

## WARUNKI STOP — jedyne

1. po poprawce z punktu 2 nadal odpada więcej niż 5 z 30 składników Equilibry —
   wklejasz listę odpadniętych z wariantami, jakie policzyłeś, i kończysz

---

## SZABLON RAPORTU

```
## 1. Usunięcie flagi — git diff wszystkich miejsc + grep "skipGlossary" z pustym wynikiem
## 2. Dopasowanie — plik:linia + wydruk funkcji generującej warianty
## 3. Equilibra — tabela 30 składników: nazwa surowa | warianty canon | trafienie TAK/NIE
## 4. Zniknięte testy — przyczyna jednym zdaniem + PEŁNY wydruk npm test, fail 0, nie mniej niż 93
## 5. Przebieg na żywo — PEŁNY orch.state; jeśli GATE-3 zatrzyma potok, to jest wynik poprawny i tak go raportujesz
## 6. Walidatory na wyjściu A4 — wynik trzech, jeśli potok doszedł do A4
## 7. git diff --stat całego modułu v2
```

---

## ZAKAZY

- **zakaz obchodzenia, wyłączania i mockowania bramek w jakimkolwiek celu**,
  łącznie z demonstracją; jedyna droga obok blokady to `resolveHitl`
- zakaz zmian w `normalizeIngredientName`, `validators/`, `tests/fixtures/`
- zakaz autokorekty nazw składników
- zakaz dopisywania czegokolwiek do plików w `data/reference`
- zakaz similarity, fuzzy match i progów
- zero wywołań API BaseLinkera
- w zrzutach i wydrukach żadna wartość nie kończy się wielokropkiem
- statusu zadania nie ustalasz
