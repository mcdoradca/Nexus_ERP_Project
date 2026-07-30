# INSTRUKCJA_E2_FIX v2 — NAPRAWY PRZED ODBIOREM E2
# ZASTĘPUJE INSTRUKCJA_E2_FIX (v1) W CAŁOŚCI — v1 anulowana, nie wykonuj z niej niczego.
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E2_FIX.md
# NOWY FAKT OD OPERATORA: katalog files/ przeniósł na dysku OPERATOR (do
# src/modules/offer-optimizer-v2/docs/), nie agent. Zarzut nieautoryzowanej
# kasacji wobec agenta ODWOŁANY. Pozostałe ustalenia audytu obowiązują.
# Wynik: docs/RAPORT_E2_FIX.md + commity wg §5. Zakaz pracy nad E3.

## 0. ZASADA NA CZAS ZADANIA
Operacje wykonujesz dokładnie jak niżej, w kolejności, z surowymi outputami.
Zakaz operacji niezleconych: amend, rebase, force-push, kasowanie/przenoszenie
plików poza zakresem.

## 1. LEGALIZACJA PRZENIESIENIA PAKIETU (decyzja Architekta — ratyfikacja)
Nowa kanoniczna lokalizacja pakietu wsadowego: src/modules/offer-optimizer-v2/docs/
(zastępuje zapis MASTER_HANDOFF §8; stary moduł zostanie w E7 usunięty w całości,
pakiet musi mieszkać poza nim).
a) `git status` — potwierdź, że przeniesione pliki pakietu widnieją jako
   untracked w offer-optimizer-v2/docs/ (lub wskaż ich faktyczny stan).
b) Weryfikacja kompletności i integralności bajtowej — dla KAŻDEGO z 18
   plików usuniętych w commicie 879b193 porównaj wersję historyczną z obecną:
   `git show 879b193~1:"src/modules/offer-optimizer/files/<plik>" > /tmp/ref`
   + porównanie hashy (np. `git hash-object`) z plikiem w nowej lokalizacji.
   Do raportu: tabela plik → hash historyczny → hash obecny → ZGODNY/RÓŻNY.
   Jakikolwiek RÓŻNY lub BRAK → STOP, raport, decyzja operatora (możliwa
   utrata treści przy przenoszeniu).
c) `git add` całego pakietu w nowej lokalizacji.
d) Zaktualizuj ścieżki źródeł w prompt-compiler.js i audit_diacritics.js
   (files/ → nowa lokalizacja). Uruchom oba — wyniki diakrytyków muszą być
   identyczne z RAPORT_E1_FIX2 (skrócona tabela: plik → poprzednio → teraz
   → zgodność).
e) DECISION_LOG, dwa wpisy: (1) przeniesienie pakietu przez operatora +
   ratyfikacja Architekta + nowa lokalizacja kanoniczna; (2) ZASADA STAŁA:
   pakiet read-only dla agenta (edycja wyłącznie §9 MASTER_HANDOFF na
   polecenie operatora); zmiany lokalizacji plików wykonuje wyłącznie
   operator z zapowiedzią przed sesją.

## 2. WYJAŚNIENIA (fakty do RAPORT_E2_FIX.md)
a) Hash commita "E1 final": w RAPORT_E1_FIX2 = 4daa23e, w RAPORT_E2 = 2a19c00.
   Podaj operację, która przepisała historię (amend? rebase?) i jej powód;
   `git show 2a19c00 --stat` do raportu. Jeśli to nie Twoja operacja —
   napisz to wprost.
b) `.agents/.ai-memory.md`: ścieżka bezwzględna, treść wklejona do raportu,
   czemu zapis nie figuruje w diffie. Decyzja Architekta: plik NIE jest
   źródłem prawdy (Z-3: git + docs/ wyłącznie); nie opieraj na nim twierdzeń.

## 3. KONWERSJA UTF-8 — Z PRAWDZIWYM DOWODEM
RAPORT_E2 przedstawił jako dowód diff pokazujący "Bin 54160 -> 26095" —
czyli plik NADAL binarny. Napraw:
a) Diagnoza: `file docs/LISTMODELS_SNAPSHOT.md` lub hex pierwszych 64 bajtów
   (PowerShell: Format-Hex) — wklej. Typowe: bajty NUL / BOM / niepełna
   konwersja.
b) Naprawa: rekonwersja albo regeneracja snapshotu przez list_models.js
   z zapisem wprost z Node: fs.writeFileSync(path, data, 'utf8').
c) Dowód — wszystkie trzy: (1) output `file` = UTF-8 text (hex bez FF FE
   i bez 00), (2) `git diff --stat` commita naprawczego pokazuje plik jako
   tekst (liczba linii, nie Bin), (3) pierwsze 5 linii pliku w raporcie.

## 4. DOWÓD GŁĘBOKOŚCI TESTÓW
a) Pełna treść tests/validators.test.js do raportu.
b) Braki względem INSTRUKCJA_E2 §2 (≥3 przypadki per walidator:
   pozytywny/negatywny/brzegowy) — uzupełnij.
c) V8: dowód iteracji po PEŁNYCH listach GATE-1 i GATE-2 (fragment kodu +
   liczniki przetestowanych substancji widoczne w outputcie runnera).
d) Ponowny pełny run `node --test` — surowy output do raportu.

## 5. ZAMKNIĘCIE (dwa commity — czytelna historia)
Commit 1: `chore(offer-optimizer-v2): legalizacja przeniesienia pakietu
wsadowego do v2/docs (decyzja operatora, ratyfikacja architekta)` —
wyłącznie pliki pakietu + ścieżki w kompilatorze/audycie.
Commit 2: `fix(offer-optimizer-v2): E2 fix — UTF-8 snapshot, testy
uzupelnione, wyjasnienia` — reszta.
RAPORT_E2_FIX.md: §1–§4 z outputami, git log --oneline -6, git diff --stat
obu commitów, sekcja "czego nie zweryfikowano" (obowiązkowa w każdym
raporcie — w RAPORT_E2 jej brakowało). STOP — akceptacja Architekta.

## 6. PRZYPOMNIENIE PROCESOWE (Z-7)
Rozjazd raport↔git zgłasza się samemu, natychmiast. W RAPORT_E2 pozostają
na Twoim koncie: niezadeklarowany amend historii oraz "dowód" UTF-8
sprzeczny z wklejonym outputem. Kolejny incydent tej klasy = wniosek
Architekta o restart sesji z czystym kontekstem.
