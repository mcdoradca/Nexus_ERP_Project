# DECYZJA — AKCEPTACJA PLANU E3_FIX4 (z uzupełnieniami)
# Lokalizacja: src/modules/offer-optimizer-v2/docs/DECYZJA_E3_FIX4_plan.md
# Plan AKCEPTOWANY. Wykonuj wg INSTRUKCJA_E3_FIX4 + uzupełnienia poniżej.
# Zakaz pracy nad E4.

## OSZCZĘDNOŚĆ: BEZ PONOWNEGO LICZENIA EMBEDDINGÓW
entryName jest metadaną wyliczaną z treści chunku, która już jest w bazie.
Filtry ekstrakcji zastosuj przez PRZELICZENIE entryName na istniejących
rekordach (odczyt content → parse → UPDATE), bez ponownego ingestu
i bez nowych wektorów. Ponowny ingest tylko wtedy, gdy zmieniłbyś granice
chunków — a tego nie robimy w tej rundzie.

## UZUPEŁNIENIE 1 — INWENTARZ KODOWANIA MUSI BYĆ PEŁNY
Nie tylko pliki podejrzane: tabela w raporcie obejmuje WSZYSTKIE pliki
tekstowe w src/modules/offer-optimizer-v2/ (js, md, sql, json) plus
prisma/schema.prisma. Kolumny: plik → wykryte kodowanie → BOM tak/nie →
liczba znaków U+FFFD → OK/PODEJRZANY. Twoja teza "korupcja tylko w .md
dopisywanych przez echo >>" musi wynikać z tej tabeli, nie ją poprzedzać.

## UZUPEŁNIENIE 2 — LISTY BEZPIECZEŃSTWA: PORÓWNANIE, NIE ZRZUT
Zrzut zawartości tablic z validators/index.js to połowa dowodu. Wymagane
zestawienie DWUKOLUMNOWE, pozycja po pozycji: [wpis w kodzie] |
[odpowiadający wpis w docs/SHARED_RULES_v4.1.md §A / §D] | [ZGODNY/RÓŻNY].
Dotyczy: §A marketingowe, §A overpromising, §D leksykon blokujący.
Jakakolwiek różnica w polskich znakach → STOP.

## UZUPEŁNIENIE 3 — WYCIEK SUBSTANCJI BRAMKOWYCH DO INDEKSU (bezpieczeństwo)
Osobne, jawne zapytanie: czy którakolwiek substancja z list GATE-1 (SOT 04
§1) i GATE-2 (SOT 06 §2) występuje w kolumnie entryName. Wynik wklej
w całości. Trafienia usuń z indeksu (UPDATE) i wypisz je w raporcie.
Uzasadnienie: substancja lecznicza w indeksie "znanych składników
kosmetycznych" to sygnał, że A4 mógłby dostać jej opis zamiast zatrzymania
potoku. Bramki w kodzie zatrzymają produkt niezależnie, ale indeks nie może
im zaprzeczać.

## UZUPEŁNIENIE 4 — PRÓBKA NAZW DO KONTROLI WZROKOWEJ
Po 20 wyekstrahowanych nazw z każdego modułu składnikowego (SOT_06, SOT_10,
INCI_DICT) w raporcie. To jedyny sposób, żebym wychwycił, czy parser nie
wciąga fragmentów opisów albo polskich fraz zamiast nazw INCI.

## UZUPEŁNIENIE 5 — DWIE METRYKI, KTÓRYCH NIE WOLNO MIESZAĆ
a) POKRYCIE INDEKSU (nowe, wymagane): per plik składnikowy [liczba wpisów
   składnikowych w źródle] → [liczba unikalnych nazw w entryName] →
   [pokrycie %]. Assert ≥95% w teście node:test.
b) Pokrycie znaków po chunkingu (99,33% z FIX2) to INNA metryka — możesz
   ją podać, ale nie wolno jej przedstawiać jako pokrycia indeksu.

## UZUPEŁNIENIE 6 — DOWODY, KTÓRYCH PLAN NIE WYMIENIA
Do raportu obowiązkowo:
a) rozkład moduł × chunkType po ostatnim ingeście — dowód braku duplikatów
   (porównanie z tabelą z RAPORT_E3_FIX2 §1a);
b) tabela pomiaru similarity: 10 składników obecnych + 5 negatywów
   NIEzawierających nazw realnych składników, kolumny [zapytanie] →
   [indeks: ZNALEZIONY/BRAK] → [moduł] → [similarity]; plus min(obecne)
   i max(negatywy); próg wg INSTRUKCJA_E3_FIX3 §4d;
c) test odporności lookupu na znaki wieloznaczne: nazwa z "_" i z "%"
   nie daje fałszywego trafienia;
d) test idempotencji ingestu (assert: dwa przebiegi = identyczna liczba
   rekordów);
e) GATE-3 identyczny przy progu 0.60 i 0.72;
f) `git log --oneline -8` + `git diff --stat` per commit.

## UZUPEŁNIENIE 7 — MIEJSCE TESTÓW
Testy leksykonów walidatorów należą do tests/validators.test.js (bateria
z E2), nie do tests/rag.service.test.js. Testy RAG (pokrycie, idempotencja,
GATE-3, T2/T3/T5) do tests/rag.service.test.js. W raporcie uruchom CAŁĄ
baterię (`node --test` na katalogu tests/) i wklej pełny output —
nie pojedyncze pliki.

## POZOSTAŁE
Reszta planu bez zmian: naprawa RAPORT_E3_FIX3.md i DECISION_LOG.md w UTF-8,
ZASADA STAŁA o zapisie plików, ANY(string_to_array) z jedną funkcją
normalizacji, filtry ekstrakcji, entryName tylko dla DICTIONARY_ENTRY
z modułów składnikowych. Commity ASCII. Zakaz `git push`.
STOP po RAPORT_E3_FIX4.md — akceptacja Architekta zamyka E3.
