# ZADANIE 36 — domknięcie potoku do publikowalnej oferty

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_36.md`, jeden, na końcu całości
- **To jest zadanie zamykające fazę tekstową.** Nie dziel go na rundy, nie pytaj
  o zgodę na poszczególne punkty. Wszystkie decyzje są poniżej.

---

## A. ZAKRES — co wchodzi, a co świadomie zostaje poza

**Wchodzi:** pełny łańcuch tekstowy od danych z BaseLinkera do gotowej treści
oferty i zapisu wyniku:

```
EXTRACT → A1 → A2 → A4 → A5 → A6 → A7 → A10 → SKŁADANIE → WYJŚCIE
```

**Nie wchodzi i nie zaczynasz tego:**

- A8 i A9 — węzły obrazowe; oferta powstaje bez generowania zdjęć
- pozyskiwanie składu z sieci po EAN (D26) — produkty bez INCI idą na listę HITL
- chemia domowa — `chemical_route` liczysz i zapisujesz, ale ścieżki CLP nie budujesz
- tabela aliasów dla literówek dostawców
- zapis do API BaseLinkera — patrz punkt G

Powód zawężenia: do terminu zostaje jedna doba. Lepszy jest wąski potok, który
działa i jest sprawdzony na prawdziwych danych, niż szeroki, który nie został
uruchomiony ani razu.

---

## B. NAPRAWA ZALEGŁA — reguła sklejania

Jedna rzecz z poprzedniej rundy wymaga rozstrzygnięcia, bo dotyka bramek.

W liście zbiorczej nietrafionych stoją `Glyceryl Stereate` i `Ethylexyglycerin` —
oba są w składzie Equilibry — a lista odrzuceń Equilibry ma jedną pozycję.
To się wyklucza. Podejrzenie: sklejanie wchłania pozycję nietrafioną do sąsiada,
przez co przestaje być sprawdzana osobno.

**Do raportu:** tabela dla 30 pozycji Equilibry —
`nazwa surowa | warianty | sklejona z kim | trafienie TAK/NIE` — oraz lista
wszystkich sklejeń z całego zbioru w postaci `"A" + "B" → trafienie`.

**Reguła obowiązująca:** sklejenie zachodzi **wyłącznie** gdy wynik trafia
w glosariusz. Jeżeli Twój kod sklejał bez trafienia — popraw to od razu, tu nie
czekasz na osobne zadanie.

---

## C. WĘZŁY — kontrakt jednakowy dla wszystkich czterech nowych

Dla każdego z A5, A6, A7, A10 robisz dokładnie to, co już zrobiłeś dla A1, A2 i A4:

1. kompilujesz prompt istniejącym kompilatorem; ręczna edycja `*_compiled.md` zakazana
2. `responseSchema` = pola z sekcji WYJŚCIE promptu, **bez `pipeline_id`
   i `gtin_ean`**; jeśli stoją w prompcie źródłowym — usuwasz je tam i rekompilujesz
3. `allowedKeys` = te same pola; wszystko inne odrzucane z
   `A<N>_FIELD_REJECTED: <pole>`
4. limity z promptu egzekwuje **kod**, nie model; nadmiar ucinasz z
   `A<N>_LIMIT_TRUNCATED: <pole>`
5. `temperature: 0` dla A5 i A10 (węzły kontrolne). A6 i A7 zostają bez zmian —
   copywriter przy zerze pisze martwym tekstem, a jego wyjście i tak przechodzi
   przez walidatory
6. wynik do `state.a<N>_result`

### Specyfika poszczególnych węzłów

**A5 — tarcza prawna.** Wejście: `a1_result`, `a2_result`, `a4_result`.
- `sanitization_status = BLOCKED_CRITICAL_LEGAL_BREACH` → `hitl_alert`,
  `next_action = HALT`. Twarde, bez wyjątków
- `mandatory_safety_warnings` przekazujesz **bez żadnej zmiany znaku** dalej.
  Zakaz parafrazy, skracania i formatowania
- `preserved_minor_flaws_for_pratfall` przekazujesz dalej w całości

**A6 — copywriter.** Produkuje 6 sekcji HTML.
- po odpowiedzi liczysz `sha256` sekcji **3, 5 i 6** i zapisujesz w
  `state.frozen_hashes` (pola `s3`, `s5`, `s6` już istnieją w stanie)
- wyjście przechodzi przez `validate_html_whitelist`, `scan_stopwords`,
  `scan_medical_claims_lexical`, `emoji_structure_check` i `diff_numeric`
- naruszenie → `A6_OUTPUT_REJECTED: <walidator>`, `hitl_alert`, HALT.
  **Nie poprawiasz treści od modelu własną ręką**

**A7 — psychologia.** Dostaje i zwraca **wyłącznie sekcje 1, 2 i 4**.
- sekcji 3, 5, 6 fizycznie nie wysyłasz do modelu
- po odpowiedzi przeliczasz `sha256` sekcji 3, 5, 6 ze złożonego dokumentu
  i porównujesz z `frozen_hashes`. Różnica → `FROZEN_SECTION_VIOLATION`,
  `hitl_alert`, HALT
- te same walidatory co przy A6

**A10 — sentinel.** Dostaje złożony dokument **bez sekcji 3, 5, 6** oraz raport
pre-audytu z walidatorów kodowych.
- zwraca **listę patchy**, nie pełny HTML
- patch dotykający sekcji 3, 5 lub 6 → odrzucony z `A10_PATCH_ON_FROZEN_SECTION`
- po nałożeniu patchy dokument przechodzi cały zestaw walidatorów jeszcze raz

---

## D. SKŁADANIE OFERTY

Wynik końcowy to jeden obiekt `offer`:

| Pole | Źródło | Reguła |
|---|---|---|
| `title` | BaseLinker `text_fields.name` | bez zmian, dopóki nie ma węzła tytułu |
| `description_html` | A6 → A7 → patche A10 | 6 sekcji, w kolejności |
| `ingredients_inci` | `extracted_data.inci.value` | **kopia dosłowna**, znak w znak |
| `eu_responsible_person` | `extracted_data.eu_responsible_person` | bez zmian |
| `safety_warnings` | `a5_result.mandatory_safety_warnings` | bez zmian |
| `source_map` | stan | dla każdego pola: `source` i `matched_key` |

`ingredients_inci` **nigdy** nie jest parafrazowany, sklejany ani poprawiany.
Sklejanie i warianty służą wyłącznie dopasowaniu do glosariusza i bramkom.

---

## E. WARUNKI ZATRZYMANIA — pełna lista, nic ponadto

Potok zatrzymuje się z `HALTED_HITL_REQUIRED` wyłącznie gdy:

1. brak INCI w BaseLinkerze — `MISSING_INCI`
2. brak podmiotu odpowiedzialnego — `MISSING_EU_RESPONSIBLE_PERSON`
3. GATE-1 lub GATE-2 wykryje substancję — `BANNED_SUBSTANCE_DETECTED` /
   `INGREDIENT_NOT_COSMETIC`
4. A2 zwróci `safety_signals_detected` — `SAFETY_SIGNAL_IN_REVIEWS`
5. A5 zwróci `BLOCKED_CRITICAL_LEGAL_BREACH`
6. walidator odrzuci wyjście A6, A7 lub A10
7. naruszenie zamrożonych sekcji

Nieznany składnik **nie zatrzymuje** — ostrzeżenie i pomijamy go w opisie (D25).

Każde zatrzymanie da się przejść wyłącznie przez `resolveHitl` z wpisem
w `hitl_log`. Obejść, flag i mocków omijających bramki nie ma.

---

## F. PRZEBIEGI KOŃCOWE

Uruchamiasz pełny potok na **obu** fixture'ach:

- **Equilibra** (8000137015436) — komplet danych, ma dojść do końca
- **Trimay** (8809822541010) — brak podmiotu odpowiedzialnego, ma się zatrzymać
  na `MISSING_EU_RESPONSIBLE_PERSON`; następnie przez `resolveHitl` z decyzją
  `ACCEPT_AND_CONTINUE` ma dojść do końca

Drugi przebieg jest ważniejszy od pierwszego — pokazuje, że ścieżka ratunkowa
działa i że produkt niekompletny nie blokuje pracy operatora na stałe.

---

## G. WYJŚCIE I ZAPIS DO BASELINKERA

Wynik zapisujesz do pliku `out/offer_<EAN>.json` w kształcie z punktu D.

**Zapisu do API BaseLinkera nie wykonujesz.** Przygotowujesz funkcję
`writeBackToBaseLinker(offer)`, w pełni napisaną i przetestowaną na atrapie
transportu, **wyłączoną stałą `WRITE_BACK_ENABLED = false`**. Nadpisywanie danych
produkcyjnych to decyzja operatora i nie zapadnie w tym zadaniu.

W raporcie podajesz `plik:linia` tej funkcji i dokładny kształt żądania, które
by wysłała.

---

## H. CO MA BYĆ W RAPORCIE — jeden raport, na końcu

```
## 1. Sklejanie — tabela 30 wierszy dla Equilibry + lista wszystkich sklejeń
## 2. Cztery kontrakty — dla A5, A6, A7, A10: plik:linia + wydruk schematu i allowedKeys
## 3. Zamrożenie sekcji — plik:linia liczenia i sprawdzania hashy + wartości s3/s5/s6 z przebiegu
## 4. Equilibra — PEŁNY orch.state na końcu + PEŁNA treść description_html + token_usage_per_node
## 5. Trimay — stan po zatrzymaniu, wpis hitl_log, stan po ACCEPT_AND_CONTINUE, wynik końcowy
## 6. Walidatory — wynik każdego walidatora na wyjściu A6, A7 i po patchach A10
## 7. Odrzucenia i limity — pełna lista wpisów A<N>_FIELD_REJECTED i A<N>_LIMIT_TRUNCATED
## 8. Write-back — plik:linia funkcji + kształt żądania + dowód, że stała jest false
## 9. Pliki wyjściowe — zawartość out/offer_8000137015436.json w całości
## 10. Testy — PEŁNY wydruk npm test, ℹ tests, fail 0, nie mniej niż 125, rozbicie na pliki
## 11. git diff --stat całego modułu v2
```

---

## I. DEFINICJA UKOŃCZENIA

Zadanie jest skończone, gdy **jednocześnie**:

- oba przebiegi z punktu F zakończyły się zgodnie z opisem
- `out/offer_8000137015436.json` istnieje i ma komplet pól z punktu D
- `npm test` daje `fail 0` przy nie mniej niż 125 testach
- żaden walidator nie został wyłączony, złagodzony ani obejrzany mockiem

## J. ZAKAZY — obowiązują bez wyjątku

- zakaz obchodzenia, wyłączania i mockowania bramek i walidatorów
- zakaz podmieniania w testach usług, które test ma sprawdzać; mock wolno wstawić
  wyłącznie za wywołania modelu i sieć
- zakaz poprawiania własną ręką treści zwróconej przez model
- zakaz parafrazowania i modyfikowania: składu INCI, ostrzeżeń, zwrotów H/P,
  danych podmiotu odpowiedzialnego
- zakaz użycia modelu do kanonizacji, mapowania i korekty nazw składników
- zakaz zaszywania aliasów i wyjątków w kodzie
- zakaz zmian w `tests/fixtures/`, `data/reference`
- zakaz usuwania i wyłączania testów
- zero wywołań API BaseLinkera
- w zrzutach i wydrukach żadna wartość nie kończy się wielokropkiem;
  wartość długą wklejasz w całości albo podajesz jej długość i `sha256`
- brak danych ≠ zgadywanie: `//HITL:` i wpis w raporcie

## K. JEDYNE WARUNKI PRZERWANIA

1. kompilator nie działa
2. walidator odrzuca wyjście węzła i po jednym ponowieniu odrzuca ponownie —
   raportujesz który walidator, na jakiej frazie, i przechodzisz do następnego
   punktu zadania
3. A5 zwraca `BLOCKED_CRITICAL_LEGAL_BREACH` na Equilibrze — to jest wynik
   poprawny; raportujesz i idziesz dalej z Trimay

W każdym innym przypadku dowozisz całość i nie zatrzymujesz się na pytania.
