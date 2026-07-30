# INSTRUKCJA_E3_FIX3 — DOMKNIĘCIE E3 (ostatnia runda)
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E3_FIX3.md
# PRZYJĘTE: higiena filtrów (sotModule IS NOT NULL), wymagany filtr modułów,
# chunkType per sekcja, wstrzymanie progu (zachowanie wzorcowe).
# UNIEWAŻNIONE: pomiar similarity — wykonany na puli z duplikatami i na
# chunkach, w których wpisy słownikowe są zlepione w bloki.
# Wynik: docs/RAPORT_E3_FIX3.md + commity. Zakaz pracy nad E4.

## 1. DIAGNOZA ARCHITEKTA (przyjmij do wiadomości, nie dyskutuj)
a) DUPLIKATY: w §1a Twojego raportu SOT_01 ma 7 DICTIONARY_ENTRY + 7 GATE,
   SOT_02 7 CONTEXT + 7 DICTIONARY_ENTRY, SOT_04 12 (było 6), SOT_05 8
   (było 4) — to ten sam materiał zaingestowany dwa razy. Przyczyna w kodzie
   wzorca: ingestDocument wstawia chunki, a DELETE usuwa tylko tytuły
   z INNEJ wersji (`NOT LIKE versionedTitle%`), więc powtórny ingest tej
   samej wersji mnoży rekordy.
b) ROZCIEŃCZENIE: słownik INCI zmieścił się w 8 chunkach (SOT_06) i 33
   (INCI_DICT) — w jednym chunku siedzi wiele wpisów składnikowych.
   Embedding bloku = średnia wielu składników, więc zapytanie o jeden
   składnik dostaje 0.51–0.60. RAG_ORCHESTRATION §3 wymaga, by WPIS SŁOWNIKA
   BYŁ ATOMEM — mechanizm scalania chunków < CHUNK_MIN (400) działa wbrew tej
   regule dla modułów słownikowych.
c) ZŁY NEGATYW: 'Cybernetic Hyaluronic Acid' zawiera nazwę prawdziwego
   składnika, więc trafienie 0.565 jest POPRAWNE semantycznie. Ten przypadek
   dowodzi, że similarity nie może być bramką bezpieczeństwa.

## 2. DECYZJA ARCHITEKTA — GATE-3 DETERMINISTYCZNY (zmiana architektury)
GATE-3 przestaje zależeć od progu similarity. Nowy podział odpowiedzialności:
- CZY znamy składnik → decyzja DETERMINISTYCZNA (indeks nazw wpisów).
- KTÓRY opis podać → similarity (jakość doboru treści).
a) Przy ingeście modułów słownikowych buduj INDEKS NAZW: dla każdego chunku
   typu DICTIONARY_ENTRY zapisz nazwę wpisu (nagłówek/pierwsza linia wpisu)
   w nowej kolumnie `entryName` (migracja addytywna, tym samym trybem co
   poprzednio: sql/ + `prisma db execute`, ADD COLUMN IF NOT EXISTS
   "entryName" text + indeks). Normalizacja do dopasowania: lowercase,
   trim, redukcja wielokrotnych spacji.
b) getKnowledgeForIngredients: dla każdego składnika najpierw LOOKUP po
   entryName (dopasowanie dokładne po normalizacji). Trafienie → pobierz
   ten chunk (similarity służy tylko do rankingu, gdy kandydatów jest kilku).
   Brak trafienia w indeksie → składnik idzie do `unknownIngredients`
   (GATE-3), NIEZALEŻNIE od jakiegokolwiek similarity.
c) Similarity pozostaje jako filtr jakości dla zapytań OPISOWYCH (np.
   'synergie kwasu hialuronowego'), nie dla identyfikacji składnika.
d) DECISION_LOG: [data] | RAG_ORCHESTRATION §2 pkt 5: GATE-3 na progu
   similarity 0.72 | pomiar: TP 0.51–0.68 vs FP do 0.57, brak separacji;
   nazwa prawdziwego składnika w ciągu bezsensownym daje wysokie similarity
   | decyzja Architekta: GATE-3 deterministyczny po indeksie nazw wpisów;
   similarity = filtr jakości opisu | ryzyko: skuteczność zależy od
   kompletności indeksu — kontrola pokrycia w §5.

## 3. NAPRAWA INGESTU (idempotencja + atomizacja wpisów)
a) IDEMPOTENCJA: ingestDocument musi przed insertem usuwać WSZYSTKIE chunki
   danego dokumentu, włącznie z tą samą wersją (`DELETE WHERE title LIKE
   'DOC@%'`), a insert i delete wykonać w jednej transakcji. Po zmianie:
   dwukrotne uruchomienie ingestu tego samego pliku daje identyczną liczbę
   rekordów (test to potwierdza — pkt 5c).
b) ATOMIZACJA: dla modułów słownikowych (SOT_05, SOT_06, SOT_07, SOT_10,
   INCI_DICT) wpis słownikowy = jeden chunk. Wyłącz scalanie chunków poniżej
   CHUNK_MIN dla tych modułów (dla modułów RULE/GATE/CONTEXT scalanie
   zostaje — tam kontekst reguły jest ważniejszy). Zakaz cięcia w środku
   wpisu (reguła bez zmian).
c) SYMETRIA ZAPYTANIA I DOKUMENTU: chunk słownikowy zachowuje w prefiksie
   nazwę wpisu; zapytanie o składnik formułuj szablonem spójnym z formatem
   wpisu (np. `Składnik INCI: {nazwa}` — dokładny szablon dobierz tak, by
   odzwierciedlał początek wpisu w SOT). Szablon opisz w raporcie.
d) PEŁNY, CZYSTY RE-INGEST wszystkich 11 plików po zmianach a–c.
   Embeddingi liczone ponownie — to ostatni raz w tym etapie (korpus ~91k
   znaków, koszt marginalny).

## 4. PONOWNY POMIAR (po czystym ingeście)
a) Zestaw walidacyjny: te same 10 składników obecnych co poprzednio
   + 5 negatywów, ale negatywy NIE MOGĄ zawierać nazwy prawdziwego
   składnika jako podciągu (usuń 'Cybernetic Hyaluronic Acid', wstaw ciąg
   bez odniesienia do realnych INCI).
b) Tabela: [zapytanie] → [oczekiwanie] → [wynik indeksu nazw:
   ZNALEZIONY/BRAK] → [moduł] → [similarity]. Kolumna indeksu jest
   teraz rozstrzygająca dla GATE-3.
c) Podaj min(similarity dla obecnych) i max(similarity dla negatywów) —
   jako informację o jakości doboru opisu, nie o bezpieczeństwie.
d) PRÓG: ustaw DEFAULT_MIN_SIMILARITY = 0.60 dla zapytań opisowych, jeśli
   min(obecne) po atomizacji ≥ 0.65. Jeśli nadal poniżej — pozostaw 0.72
   dla zapytań opisowych i opisz to w raporcie (bramka bezpieczeństwa nie
   zależy już od tej liczby, więc niższa czułość zapytań opisowych nie
   blokuje potoku). Zakaz progu poniżej 0.60.

## 5. TESTY (DoD etapu)
a) GATE-3 deterministyczny: lista [3 obecne + 2 nieobecne] → dokładnie
   2 pozycje w unknownIngredients, niezależnie od progu (uruchom test
   dwukrotnie: z progiem 0.60 i 0.72 — wynik GATE-3 identyczny).
b) Pokrycie indeksu: liczba wpisów w indeksie entryName vs liczba wpisów
   składnikowych w plikach źródłowych (policz nagłówki wpisów w SOT 06,
   SOT 10, INCI_i_ich_dzialanie). Tabela per plik + pokrycie %.
   Pokrycie < 95% → STOP i raport (indeks niekompletny = GATE-3 fałszywie
   zgłasza nieznane).
c) Idempotencja ingestu: dwa przebiegi tego samego pliku → identyczna
   liczba rekordów (surowy output COUNT przed i po).
d) T2 (filtr modułów), T3 (GATE/RULE nieserwowane), T5 (charBudget
   przycina) — przebieg ponownie na nowej puli. Surowe outputy wszystkich
   testów.
e) Rozkład moduł × chunkType po czystym ingeście — bez duplikatów
   (suma rekordów v2 = suma chunków z raportu ingestu).

## 6. HIGIENA RAPORTU I REPO
a) W RAPORT_E3_FIX2.md sekcja §7 zawiera placeholdery
   ("Zostanie wygenerowane...") obok faktycznych outputów — usuń
   placeholdery; raport nie może zawierać nieprawdziwych zapowiedzi.
b) Komunikaty commitów zawierają znaki spoza ASCII zamienione na
   krzaczki ("���"). ZASADA STAŁA do DECISION_LOG: komunikaty commitów
   wyłącznie ASCII (bez półpauz i polskich znaków).
c) Skrypty jednorazowe (run_update.js, run_measurement.js, ingest.js,
   append2.js jeśli został) — przenieś do tools/ albo scripts/ z krótkim
   komentarzem nagłówkowym, co robią. Zakaz nieopisanych skryptów w
   katalogu głównym modułu.

## 7. ZAMKNIĘCIE
Commity (ASCII): (1) `fix(rag): idempotentny ingest + atomizacja wpisow
slownikowych`, (2) `feat(rag): deterministyczny indeks nazw wpisow dla
GATE-3`, (3) `test(rag): pomiar po reingescie + testy GATE-3, pokrycia,
idempotencji`.
RAPORT_E3_FIX3.md: outputy §3–§6, wpisy DECISION_LOG, HITL, czego nie
zweryfikowano, `git log --oneline -6`, `git diff --stat` per commit.
Zakaz `git push`. STOP — akceptacja Architekta zamyka E3.
