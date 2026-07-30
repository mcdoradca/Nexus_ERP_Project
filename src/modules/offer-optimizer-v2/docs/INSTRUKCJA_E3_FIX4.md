# INSTRUKCJA_E3_FIX4 — DOMKNIĘCIE E3 (audyt kodowania + dowody)
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E3_FIX4.md
# RATYFIKOWANE: reguła ekstrakcji nazw z Warunku 1 (grupy z backtickami dla
# SOT_06, nagłówki ze slashami dla SOT_10, pogrubienia dla INCI_DICT) —
# z filtrami z §3 poniżej.
# NIEODEBRANE: RAPORT_E3_FIX3 — plik uszkodzony kodowaniem, brak wszystkich
# wymaganych dowodów. Wynik: docs/RAPORT_E3_FIX4.md + commity.
# Zakaz pracy nad E4.

## 1. AUDYT KODOWANIA — PRIORYTET BEZWZGLĘDNY (bramka blokująca)
Końcówka RAPORT_E3_FIX3.md jest uszkodzona: "WDRO{ENIA", "ZakoDczono",
"Wdro|ono" — polskie znaki zniszczone przez zapis w złej stronie kodowej
(ą, ę, ł→B, ń→D, ż→|, ź→{, ó→�). To awaria, która położyła sesję 1.
NAJWIĘKSZE RYZYKO: te same metody zapisu mogły uszkodzić POLSKIE LISTY
BEZPIECZEŃSTWA w kodzie walidatorów (§A stop-words, §D leksykon medyczny).
Uszkodzony wzorzec = walidator, który cicho przestaje łapać roszczenia
medyczne, przy zielonych testach (uszkodzony wzorzec vs uszkodzony przypadek
testowy dają fałszywy PASS).
a) Zinwentaryzuj kodowanie WSZYSTKICH plików tekstowych w
   src/modules/offer-optimizer-v2/ + prisma/schema.prisma:
   dla każdego pliku output `file` (lub detekcja BOM/bajtów w PowerShell).
   Tabela: plik → kodowanie → OK / PODEJRZANY.
b) Wyszukaj markery korupcji w całym module (poza plikami .sql i binarnymi):
   znaki U+FFFD (�) oraz sekwencje typowe dla CP852/1250 w kontekście
   polskim. Wypisz każdy plik i linię z trafieniem.
c) KONTROLA LISTY BEZPIECZEŃSTWA (najważniejsze): wypisz do raportu
   DOSŁOWNIE, bajt w bajt, zawartość tablic z validators/index.js dla:
   §A stop-words (marketingowe + overpromising), §D leksykon medyczny
   blokujący. Obok wklej odpowiadające fragmenty z docs/SHARED_RULES_v4.1.md.
   Porównanie 1:1, pozycja po pozycji. Jakakolwiek różnica w polskich
   znakach → STOP, raport, brak dalszych prac.
d) Dowód funkcjonalny (nie tylko wizualny): test jednostkowy podający
   walidatorowi frazy z polskimi znakami zapisane W PLIKU TESTOWYM
   niezależnie od listy w kodzie — np. "produkt leczy łuszczycę",
   "gwarancja skuteczności", "terapia przeciwzmarszczkowa". Każda musi
   zostać wykryta. Jeśli test przechodził wcześniej, a te frazy nie są
   wykrywane — mamy dowód korupcji list.
e) Przelicz diakrytyki w prompts/ (audit_diacritics.js) i porównaj z ostatnim
   znanym stanem (suma 935 wg RAPORT_E3). Rozjazd → raport i STOP.
f) USTAL ŹRÓDŁO: jakim narzędziem/komendą dopisywana była uszkodzona sekcja
   raportu (Add-Content? echo? >>?). Do DECISION_LOG wpisz ZASADĘ STAŁĄ:
   pliki tekstowe zapisujemy WYŁĄCZNIE przez Node (fs.writeFileSync(...,
   'utf8')) albo PowerShell z jawnym `-Encoding utf8`; zakaz `>>`, `echo`
   i Add-Content bez jawnego kodowania.
g) Napraw RAPORT_E3_FIX3.md — przepisz uszkodzoną sekcję poprawnie w UTF-8.

## 2. LOOKUP GATE-3 — ZGODNIE Z ZATWIERDZONYM PLANEM
Wdrożyłeś `LIKE '%|nazwa|%'`, a plan (i moja akceptacja) mówił
`= ANY(string_to_array("entryName", '|'))`. Wersja z LIKE nie korzysta
z indeksu i jest wrażliwa na znaki wieloznaczne (% i _) w nazwach składników.
a) Zmień zapytanie na dokładne dopasowanie elementu tablicy:
   `WHERE $1 = ANY(string_to_array("entryName", '|'))`.
b) Potwierdź testem, że nazwa zawierająca znak podkreślenia lub procentu
   nie powoduje fałszywego trafienia.
c) Normalizacja: jedna funkcja (normalization.js) używana przy ingeście
   i przy lookupie — potwierdź odczytem plik:linia, że lookup wywołuje
   TĘ SAMĄ funkcję (nie kopię logiki).

## 3. INDEKS NAZW — TYLKO SŁOWNIKI, Z FILTRAMI
a) entryName wypełniany WYŁĄCZNIE dla chunków typu DICTIONARY_ENTRY
   z modułów składnikowych (SOT_06, SOT_10, INCI_DICT). Chunki GATE/RULE/
   CONTEXT: entryName = NULL. Uzasadnienie bezpieczeństwa: substancje
   z bramek (SOT 06 §2 — ketokonazol, hydrochinon, kortykosteroidy) NIE MOGĄ
   figurować w indeksie "znanych składników kosmetycznych". Sprawdź
   zapytaniem, czy któraś substancja z listy GATE-2 nie wylądowała
   w entryName — jeśli tak, usuń ją z indeksu (UPDATE) i wyjaśnij w raporcie.
b) Filtry ekstrakcji (zapobiegają zaśmieceniu indeksu):
   - odrzuć tokeny pasujące do /^[A-Z0-9_]{3,}$/ (kody statusów typu
     UNKNOWN_INGREDIENT_NEEDS_LOOKUP, INGREDIENT_NOT_COSMETIC),
   - odrzuć tokeny dłuższe niż 6 wyrazów i krótsze niż 3 znaki,
   - odrzuć tokeny zawierające cyfry procentowe/limity (np. "0,3%"),
   - polskie synonimy z nawiasów zachowaj jako aliasy (są nieszkodliwe
     i pomagają, gdy PIM podaje nazwę po polsku).
c) Do raportu: po 20 przykładowych nazw wyekstrahowanych z każdego modułu
   składnikowego (SOT_06, SOT_10, INCI_DICT) — do kontroli wzrokowej.

## 4. DOWODY — KOMPLET (Z-1; w RAPORT_E3_FIX3 brakowało wszystkich)
a) Rozkład moduł × chunkType po czystym re-ingeście — dowód, że duplikaty
   zniknęły (porównaj z tabelą z RAPORT_E3_FIX2 §1a).
b) POKRYCIE INDEKSU (to NIE jest pokrycie znaków z FIX2 — nie przeklejaj
   99,33%): per plik składnikowy [liczba wpisów składnikowych w źródle,
   policzona po nagłówkach/pogrubieniach] → [liczba unikalnych nazw
   w entryName] → [pokrycie %]. Assert ≥95% jako test, nie wydruk.
c) Pomiar similarity po atomizacji: tabela [zapytanie] → [indeks nazw:
   ZNALEZIONY/BRAK] → [moduł] → [similarity], 10 składników obecnych
   + 5 negatywów NIE zawierających nazw realnych składników.
   Podaj min(obecne) i max(negatywy). Próg wg INSTRUKCJA_E3_FIX3 §4d.
d) Testy (surowe, pełne outputy `node --test`): GATE-3 przy progu 0.60
   i 0.72 z identycznym wynikiem, pokrycie indeksu (assert), idempotencja
   ingestu (assert: dwa przebiegi = identyczna liczba rekordów),
   T2 filtr modułów, T3 GATE/RULE nieserwowane, T5 charBudget przycina,
   pełna bateria walidatorów z E2 + test z §1d.
e) `git log --oneline -8` + `git diff --stat` dla KAŻDEGO commita etapu.

## 5. ZAMKNIĘCIE
Commity (ASCII): (1) `fix(security): audyt kodowania modulu + naprawa list
walidatorow`, (2) `fix(rag): exact match GATE-3 + indeks tylko ze slownikow`,
(3) `test(rag): komplet dowodow E3 — pokrycie, idempotencja, pomiar`.
RAPORT_E3_FIX4.md: outputy §1–§4 w całości, wpisy DECISION_LOG, HITL,
czego nie zweryfikowano. Zakaz `git push`. Zakaz raportów bez outputów —
raport opisowy bez surowych wyników nie podlega ocenie.
STOP — akceptacja Architekta zamyka E3.
