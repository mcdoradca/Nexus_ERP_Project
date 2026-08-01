# ZADANIE 31B — uszczelnienie bramek

> **ODBIORCA: WYKONAWCA.** Kopia do `docs/`.

- **Raport wyjściowy:** `RAPORT_31B.md`, ściśle wg SZABLONU

Zatrzymałeś się prawidłowo i diagnoza jest dokładnie tym, czego potrzebowałem.
Wariant (a) i (c) przepuszczają hydrochinon — a wariant (c) to nie jest przypadek
teoretyczny: w prawdziwym składzie Trimay z BaseLinkera stoi
`PEG-60 Hy drogenated Castor Oil`, `Frag rance` i `Calcium Lacta te`. Dostawca
rozbija nazwy spacjami na produkcji, więc bramka przepuszczałaby zakazaną
substancję na żywym towarze.

---

## KROK 1 — kanonizacja nazw

To **nie jest** dopasowanie rozmyte i nie narusza D5 ani S-5. Dopasowanie
zostaje ścisłe — zmienia się wyłącznie postać, w której porównujemy oba ciągi.
Żadnych progów, żadnej odległości edycyjnej, żadnego podobieństwa.

Wprowadzasz funkcję kanonizującą, stosowaną **tak samo** do składnika z INCI
i do wpisu z listy zakazanej:

```
canon(s) = s.toLowerCase() z usunięciem wszystkich znaków poza [a-z0-9]
```

Czyli spacje, myślniki, kropki, przecinki, nawiasy i ukośniki znikają po obu
stronach. `Hydro quinone` → `hydroquinone`. `Hydroquinone.` → `hydroquinone`.
`Titanium Dioxide (nano)` → `titaniumdioxidenano`.

## KROK 2 — reguła dopasowania

Skład dzielisz na pozycje po przecinku. Dla każdej pozycji liczysz `canon`.
Dla każdego wpisu listy zakazanej liczysz `canon`. Trafienie zachodzi gdy:

1. `canon(pozycja) === canon(wpis)` — zawsze, **albo**
2. `canon(pozycja).includes(canon(wpis))` — **wyłącznie gdy `canon(wpis)` ma co
   najmniej 8 znaków**

Warunek długości jest tam nie dla ozdoby. Na liście stoją krótkie kody: `tpo`,
`egf`, `fgf`, `bp-2`, `bp-5`, `4-mbc`. Po skanowaniu bez ograniczenia `tpo`
trafiłoby w środek niewinnej nazwy i dostalibyśmy blokady na czystych produktach.
Dla nich zostaje wyłącznie dopasowanie całej pozycji. Formy rozwinięte tych
kodów (`trimethylbenzoyl diphenylphosphine oxide`) są długie i łapią się regułą 2.

**Porównania robisz na pozycjach, nigdy na całym sklejonym składzie** — inaczej
dopasowanie przeskoczy przez przecinek i połączy końcówkę jednej nazwy z
początkiem następnej.

Regułę `INGREDIENT_NEAR_MATCH_HITL`, którą zapowiadałem w Zadaniu 31, **wycofuję**.
Kanonizacja załatwia spacje i myślniki na wejściu, więc osobny mechanizm
„prawie trafia" byłby już tylko furtką do podobieństwa.

## KROK 3 — asercje

Cztery warianty z Zadania 31, wszystkie mają blokować. Do tego trzy z prawdziwych
danych Trimay: `PEG-60 Hy drogenated Castor Oil`, `Frag rance`,
`Calcium Lacta te` — podmień w nich rdzeń na substancję z listy zakazanej i
sprawdź, że rozbicie spacją nie ratuje przed wykryciem.

Do tego **regresja: wszystkie 31 istniejących sprawdzeń GATE-1 i GATE-2 mają
dalej przechodzić**, a test `GATE-1 brak falszywych trafien` i `Safe ingredients`
mają dalej być zielone. Jeśli kanonizacja zapali blokadę na czystym składzie —
zgłaszasz to i przerywasz, nie rozluźniasz reguły.

## KROK 4 — sprzeczność w liczbach RAG

Twoja tabela mówi, że **wszystkie 30** składników nie trafiają w RAG. Przebieg
na żywo z Zadania 30 wypisał **23** wpisy `UNKNOWN_INGREDIENT_NEEDS_LOOKUP`, a A4
opisał glicerynę, tokoferol, gumę ksantanową, węgiel i alkohol cetearylowy —
czyli dokładnie te, których na tamtej liście brakowało.

Te dwie rzeczy nie mogą być jednocześnie prawdziwe. Ustal, którą ścieżką pytał
Twój skrypt diagnostyczny, a którą pyta orkiestrator, i podaj `plik:linia` obu.
Nie naprawiasz — ustalasz.

To jest ważne z jednego powodu: jeśli RAG naprawdę nie zwrócił nic, to A4 opisał
pięć składników **z własnej pamięci**, łamiąc dyrektywę „jedyne źródło prawdy =
blok RAG". Muszę wiedzieć, czy tak było.

---

## WARUNKI STOP — jedyne

1. kanonizacja psuje którekolwiek z 31 istniejących sprawdzeń GATE albo zapala
   blokadę na czystym składzie — wklejasz wynik i kończysz

---

## SZABLON RAPORTU

```
## 1. Kanonizacja — plik:linia + pełny wydruk funkcji i reguły dopasowania
## 2. Siedem wariantów z kroku 3 — wynik każdego osobno
## 3. Regresja — wynik 31 istniejących sprawdzeń GATE-1/GATE-2
## 4. Tabela normalizacji po zmianie — 30 wierszy, trzy kolumny jak poprzednio
## 5. Sprzeczność RAG — plik:linia obu ścieżek + jedno zdanie rozstrzygające
## 6. Testy — PEŁNY wydruk npm test z licznikiem ℹ tests, fail 0, nie mniej niż 98
## 7. git diff --stat całego modułu v2
```

---

## ZAKAZY

- **zakaz similarity, fuzzy match, odległości edycyjnej i progów** — kanonizacja
  jest jedyną dozwoloną zmianą po stronie dopasowania
- zakaz rozluźniania listy zakazanej i zakaz usuwania z niej pozycji
- zakaz omijania, wyłączania i mockowania bramek
- zero wywołań API BaseLinkera
- zakaz zmian w `tests/fixtures/`, promptach agentów, `prompt-compiler.js`
- zakaz naprawiania testów pod kod i zakaz rozszerzania mocków, żeby ominąć błąd
- w zrzutach żadna wartość nie kończy się wielokropkiem
- statusu zadania nie ustalasz
