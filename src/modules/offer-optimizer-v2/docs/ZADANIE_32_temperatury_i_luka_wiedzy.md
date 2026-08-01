# ZADANIE 32 — TypeError, temperatury, luka w bazie wiedzy

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_32.md`, ściśle wg SZABLONU

Bramki są uszczelnione i regresja przeszła — to jest zamknięte i dobre.
Sposób, w jaki pokazałeś warianty Trimay (czysta nazwa przechodzi, ta sama nazwa
z podmienionym rdzeniem blokuje), był właściwy i tak to ma wyglądać.

Rozstrzygam też Twoją uwagę z sekcji 4, żebyś nie szukał tam winy: **RAG nie
zawodzi z powodu normalizacji.** Sprawdziłem bazę wiedzy sam. Składników
`aqua`, `stearic acid`, `sodium benzoate`, `potassium sorbate`, `parfum`,
`squalene`, `cetyl alcohol` i `sodium dehydroacetate` **po prostu w niej nie ma**
— w żadnym zapisie, ani czystym, ani zabrudzonym. Trafia dokładnie te osiem,
które w bazie stoją. Normalizator nie jest tu problemem i **go nie ruszasz**.

---

## KROK 1 — TypeError w `orchestrator.js:166`

```
TypeError: Cannot read properties of undefined (reading 'value')
```

To nie jest niedostateczny mock. To jest kod, który sięga po `.value` na polu,
którego w obiekcie nie ma. Prawdziwy ekstraktor też nie zawsze zwróci komplet
kluczy, więc ten sam błąd wywali potok na produkcji.

Naprawiasz **kod**: bezpieczny dostęp do pól `extracted_data` w całej metodzie
`runPhase1`, brak pola traktowany jak wartość pusta. Mocka nie rozszerzasz.
`npm test` ma dać `fail 0`.

## KROK 2 — temperatury

W `config/nodes.config.js`:

- **A1, A2, A4 → `temperature: 0`**
- A5 i pozostałe węzły redakcyjne bez zmian

Uzasadnienie, żebyś rozumiał cel: zero nie sprawia, że model mówi prawdę —
sprawia, że powtarza się. Dzięki temu dwa przebiegi na tym samym wejściu muszą
dać identyczny wynik, a każda różnica jest sygnałem, że pole jest generowane,
nie odczytywane. To jest narzędzie pomiarowe.

**Dowód, że parametr naprawdę dolatuje do wywołania**, a nie tylko stoi
w konfiguracji: `plik:linia` miejsca, w którym `temperature` trafia do zapytania,
plus dwa przebiegi A1 na Equilibrze i porównanie obu odpowiedzi znak w znak.

## KROK 3 — inwentaryzacja luki w bazie wiedzy

Ze **wszystkich** fixture'ów, jakie masz na dysku:

- wyciągnij unikalne pozycje INCI ze wszystkich produktów
- dla każdej sprawdź trafienie w RAG
- podaj liczby: ile unikalnych pozycji, ile trafia, jaki procent
- wypisz **pełną listę nietrafionych**, alfabetycznie, bez skracania

To jest materiał wejściowy do uzupełnienia bazy wiedzy i nic poza tym.

**Zakaz dopisywania czegokolwiek do plików RAG.** Baza wiedzy dla A4 jest
„jedynym źródłem prawdy" — jeśli wypełnimy ją treścią wygenerowaną przez model,
halucynacje wejdą do potoku tylnymi drzwiami i żadna bramka ich już nie złapie.
Wpisy będą powstawać z CosIng i literatury, poza tym potokiem.

---

## WARUNKI STOP — jedyne

1. po ustawieniu `temperature: 0` dwa przebiegi A1 na tym samym wejściu dają
   **różne** odpowiedzi — wklejasz obie i kończysz, bo to znaczy, że parametr
   nie dolatuje albo model go ignoruje

---

## SZABLON RAPORTU

```
## 1. TypeError — git diff poprawki + plik:linia
## 2. Temperatury — git diff nodes.config.js + plik:linia przekazania do wywołania
## 3. Powtarzalność — dwie surowe odpowiedzi A1, w całości, + czy identyczne
## 4. Inwentaryzacja — liczby + pełna lista nietrafionych składników
## 5. Testy — PEŁNY wydruk npm test z licznikiem ℹ tests, fail 0, nie mniej niż 95
## 6. git diff --stat całego modułu v2
```

---

## ZAKAZY

- zakaz zmian w `normalizeIngredientName` i w bramkach — są zamknięte
- **zakaz dopisywania, edytowania i generowania wpisów w plikach RAG**
- zakaz naprawiania testów pod kod i rozszerzania mocków
- zero wywołań API BaseLinkera
- zakaz zmian w `tests/fixtures/`, promptach agentów, `prompt-compiler.js`
- w zrzutach żadna wartość nie kończy się wielokropkiem
- statusu zadania nie ustalasz
