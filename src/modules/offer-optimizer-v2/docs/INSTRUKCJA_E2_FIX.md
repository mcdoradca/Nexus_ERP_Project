# INSTRUKCJA_E2_FIX — NAPRAWA NARUSZEŃ PRZED ODBIOREM E2
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E2_FIX.md
# STATUS: RAPORT_E2 odrzucony. Walidatory NIE są ocenione merytorycznie —
# najpierw przywrócenie stanu zgodnego z OP-2 i żelazną zasadą 3.
# Wynik: docs/RAPORT_E2_FIX.md + commity wg §5. Zakaz pracy nad E3.

## 0. ZASADA NA CZAS TEGO ZADANIA
Każdą operację na plikach i gicie wykonujesz DOKŁADNIE jak niżej, w podanej
kolejności, i wklejasz surowe outputy. Zakaz jakichkolwiek operacji
niezleconych — w szczególności: amend, rebase, filter-branch, force-push,
kasowania i przenoszenia plików poza zakresem.

## 1. WYJAŚNIENIA (fakty, nie interpretacje — do RAPORT_E2_FIX.md §1)
a) Kto/co i dlaczego usunęło katalog src/modules/offer-optimizer/files/
   (18 plików, −1539 linii w commicie 879b193)? Jeśli była to Twoja operacja
   "porządkowa" — napisz to wprost. Jeśli pliki przeniesiono — podaj dokąd
   (w diffie nie ma addycji, więc ta hipoteza wymaga dowodu).
b) Dlaczego hash commita "E1 final" zmienił się z 4daa23e (RAPORT_E1_FIX2)
   na 2a19c00 (RAPORT_E2)? Podaj operację, która to spowodowała (amend?
   rebase?), i co dokładnie zmieniła: `git show 2a19c00 --stat` do raportu.
c) Czym jest `.agents/.ai-memory.md`, gdzie leży (ścieżka bezwzględna),
   i dlaczego zapis do niego nie figuruje w diffie. Wklej jego treść do
   raportu. Decyzja Architekta: plik NIE jest źródłem prawdy projektu —
   źródłami są wyłącznie git + docs/ (Z-3); jeśli leży poza repo, nie
   wolno na nim opierać żadnych przyszłych twierdzeń.

## 2. PRZYWRÓCENIE PAKIETU (naprawa naruszenia OP-2 / żelaznej zasady 3)
a) `git restore --source=879b193~1 -- "src/modules/offer-optimizer/files/"`
   (przywrócenie WSZYSTKICH 18 plików w niezmienionej treści).
b) Weryfikacja kompletności: `ls src/modules/offer-optimizer/files/` +
   `git diff 879b193~1 --stat -- src/modules/offer-optimizer/files/`
   → oczekiwany PUSTY diff względem stanu sprzed kasacji. Oba outputy
   do raportu.
c) Weryfikacja funkcjonalna: uruchom ponownie prompt-compiler.js
   i audit_diacritics.js — potwierdź, że kompilacja ze źródeł nadal działa
   i wyniki diakrytyków są identyczne z RAPORT_E1_FIX2 (tabela porównawcza
   skrócona: plik → wynik poprzedni → wynik obecny → zgodność).
d) ZASADA STAŁA do DECISION_LOG: katalog files/ = kanoniczny pakiet wsadowy
   (MASTER_HANDOFF §8), read-only dla agenta do końca projektu; jedyny
   wyjątek: aktualizacja §9 MASTER_HANDOFF na polecenie operatora.
   Usunięcie files/ nastąpi dopiero w E7 razem ze starym modułem.

## 3. KONWERSJA UTF-8 — TYM RAZEM Z PRAWDZIWYM DOWODEM
a) Zdiagnozuj, czemu LISTMODELS_SNAPSHOT.md nadal jest binarny:
   `file docs/LISTMODELS_SNAPSHOT.md` (lub `Format-Hex` pierwszych 64 bajtów
   w PowerShell) — wklej output. Typowa przyczyna: pozostałe bajty NUL /
   niepełna konwersja / BOM.
b) Napraw (pełna rekonwersja przez convert_utf8.js po poprawce albo
   regeneracja snapshotu przez list_models.js z zapisem UTF-8 wprost
   z Node: fs.writeFileSync z kodowaniem 'utf8').
c) Dowód końcowy — WSZYSTKIE trzy, wklejone surowo:
   (1) `file docs/LISTMODELS_SNAPSHOT.md` → "UTF-8 text" (lub hex bez FF FE
   i bez bajtów 00),
   (2) `git diff --stat` commita naprawczego pokazuje plik jako TEKST
   (liczba linii, nie "Bin"),
   (3) pierwsze 5 linii pliku wklejone w raporcie (czytelny tekst).

## 4. DOWÓD GŁĘBOKOŚCI TESTÓW
a) Wklej do raportu PEŁNĄ treść tests/validators.test.js.
b) Jeśli którykolwiek walidator ma mniej niż 3 przypadki (pozytywny/
   negatywny/brzegowy) — uzupełnij testy do wymogu INSTRUKCJA_E2 §2.
c) V8: pokaż, że test iteruje po PEŁNYCH listach GATE-1 i GATE-2 (fragment
   kodu iteracji + liczba substancji przetestowanych w output runnera,
   np. przez osobny subtest per lista z licznikiem asercji).
d) Ponowny run: pełny output `node --test` do raportu.

## 5. ZAMKNIĘCIE (dwa osobne commity — czytelna historia naprawy)
Commit 1: `revert(offer-optimizer): przywrocenie pakietu files/ (naruszenie
OP-2 w 879b193)` — wyłącznie przywrócone pliki.
Commit 2: `fix(offer-optimizer-v2): E2 fix — UTF-8 snapshot, testy uzupelnione,
wyjasnienia` — reszta.
RAPORT_E2_FIX.md: §1 wyjaśnienia, outputy §2–§4, git log --oneline -6,
git diff --stat obu commitów, sekcja "czego nie zweryfikowano" (w RAPORT_E2
jej brakowało — wymagana w każdym raporcie). STOP — akceptacja Architekta.

## 6. PRZYPOMNIENIE PROCESOWE (Z-7)
Rozjazd raport↔git wykrywa się i zgłasza SAMEMU, natychmiast — nie czeka,
aż wykryje go audyt. Niezadeklarowana operacja na repo, nawet "porządkowa",
= dryf. Trzeci taki incydent będzie oznaczał wniosek Architekta do operatora
o restart sesji z czystym kontekstem.
