# ZADANIE 31 — normalizacja INCI i szczelność bramek

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_31.md`, ściśle wg SZABLONU

HITL działa i to jest dobra robota. Ale przebieg na żywo pokazał coś, co jest
ważniejsze niż wszystko, co robiliśmy przez ostatnie dziesięć rund.

**23 składniki z 30 wyszły jako `UNKNOWN_INGREDIENT_NEEDS_LOOKUP`** — w tym
`aqua water`, `cetyl alcohol`, `stearic acid`, `parfum fragrance`,
`sodium benzoate`. To są najpospolitsze INCI świata. RAG ich nie znalazł nie
dlatego, że ich nie ma w bazie wiedzy, tylko dlatego, że **normalizacja podaje
mu nazwy, których nikt nie zapisał**: nawias zamieniony na spację
(`Aqua (Water)` → `aqua water`), ukośnik zjedzony
(`coco caprylate/caprate`), myślnik w numeracji (`c10 18 triglyceride`),
kropka końcowa zostawiona (`sodium dehydroacetate.`).

To nie jest problem jakości opisu. **Tymi samymi znormalizowanymi nazwami
karmione są GATE-1 i GATE-2** — bramki substancji zakazanych i niekosmetycznych.
Jeżeli normalizacja gubi `sodium dehydroacetate.` przez kropkę na końcu listy,
to zgubi też `hydroquinone.` w tym samym miejscu.

**Nie zakładam, że tak jest. Masz to sprawdzić i pokazać wynik, jaki wyjdzie.**

---

## KROK 1 — diagnoza, bez poprawiania

Tabela dla **wszystkich 30 składników** Equilibry, trzy kolumny:

`nazwa surowa z INCI` | `wynik normalizeIngredientName` | `trafienie w RAG TAK/NIE`

Surowy wydruk, wszystkie wiersze, bez skracania.

## KROK 2 — test szczelności bramek

Asercje sprawdzające, czy GATE-1 i GATE-2 trafiają w substancję zakazaną
ustawioną w czterech pozycjach:

- (a) na końcu listy, z kropką: `..., Hydroquinone.`
- (b) w nawiasie: `Titanium Dioxide (nano)`
- (c) z rozbitą spacją, jak w prawdziwych danych Trimay: `Hydro quinone`
- (d) z ukośnikiem w sąsiedztwie: `Coco-Caprylate/Caprate, Hydroquinone`

**Jeżeli któraś przechodzi bez wykrycia — nie łatasz normalizatora na wyczucie.**
Wklejasz wynik i to jest treść raportu. Poprawkę zaprojektuję po Twoich liczbach.

## KROK 3 — poprawka normalizacji, wyłącznie deterministyczna

Dopuszczam dokładnie cztery reguły, nic ponadto:

1. obcięcie kropki i przecinka na końcu nazwy
2. nawias traktowany jako **dodatkowy wariant nazwy**, nie jako spacja:
   `Aqua (Water)` daje warianty `aqua` i `water`, a nie `aqua water`
3. ukośnik rozdziela na dwa warianty: `coco-caprylate/caprate` daje
   `coco-caprylate` i `caprate`
4. myślnik i cyfry zachowane bez zmian: `c10-18 triglyceride` zostaje

**Zakaz podobieństwa, fuzzy match i progów.** D5 i S-5 obowiązują — dopasowanie
jest ścisłe, zmienia się tylko to, co podajemy do dopasowania.

Wariant, który po normalizacji **nie trafia dokładnie**, ale różni się od wpisu
z listy zakazanej wyłącznie spacjami lub myślnikami, idzie na HITL jako
`INGREDIENT_NEAR_MATCH_HITL: <nazwa>`. Nie przepuszczasz go po cichu.

## KROK 4 — walidatory A4 do końca

W przebiegu na żywo A4 dostał `node_status: OK`, mimo że jego tekst zawiera
`<h2>` i `<b>`, a specyfikacja mówi `<ul><li>` i `<strong>`. W sekcji 4 raportu
piszesz, że walidatory są wpięte. Te dwie rzeczy się wykluczają.

- `plik:linia` wpięcia walidatorów **na ścieżce live**, nie w teście
- wynik **wszystkich trzech** (`validate_html_whitelist`,
  `scan_medical_claims_lexical`, `scan_stopwords`) na odpowiedzi A4 z przebiegu
  na żywo, każdy osobno
- jedno zdanie: dlaczego `<h2>` i `<b>` przeszły

`scan_medical_claims_lexical` nie pojawił się w raporcie ani razu. Ma się pojawić.

---

## WARUNKI STOP — jedyne

1. GATE-1 lub GATE-2 przepuszcza substancję zakazaną w którymkolwiek z czterech
   wariantów z kroku 2 — kończysz po kroku 2, wklejasz wyniki, nie idziesz dalej

---

## SZABLON RAPORTU

```
## 1. Tabela normalizacji — 30 wierszy
## 2. Szczelność bramek — cztery warianty, wynik każdego
## 3. Poprawka normalizacji — git diff + tabela z kroku 1 po poprawce
## 4. Walidatory A4 — plik:linia + wynik trzech walidatorów + wyjaśnienie
## 5. Przebieg na żywo — PEŁNY orch.state, token_usage_per_node
## 6. Testy — PEŁNY wydruk npm test z licznikiem, fail 0, nie mniej niż 98
## 7. git diff --stat całego modułu v2
```

W sekcji 6 ostatnie trzy razy dostałem liczbę w zdaniu albo pięć linijek
wydruku. Ma być cały wydruk z `ℹ tests` na końcu.

---

## NIE RUSZASZ W TEJ RUNDZIE

A2 zwrócił w opiniach `„Zapach jest dość mocno ziołowo-炭owy"` — chiński znak
w środku polskiego słowa. Żadna recenzja z wizaz.pl tak nie wygląda, więc te
cytaty są generowane, a nie cytowane. To jest osobna sprawa i osobne zadanie.
**Nie dotykasz A2 ani jego promptu.**

## ZAKAZY

- zakaz omijania, wyłączania i mockowania bramek w jakimkolwiek celu
- zakaz similarity, fuzzy match i progów w dopasowaniu składników
- zero wywołań API BaseLinkera
- zakaz zmian w `tests/fixtures/`, `prompt-compiler.js`, promptach agentów
- zakaz naprawiania testów pod kod; **zakaz rozszerzania mocków, żeby ominąć
  błąd w kodzie** — jeśli mock musi urosnąć, żeby coś przeszło, to znaczy,
  że kod wywala się na prawdziwych danych i zgłaszasz to
- w zrzutach żadna wartość nie kończy się wielokropkiem
- statusu zadania nie ustalasz
