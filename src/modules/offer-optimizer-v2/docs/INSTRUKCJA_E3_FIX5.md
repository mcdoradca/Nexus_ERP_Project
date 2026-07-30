# INSTRUKCJA_E3_FIX5 — DOMKNIĘCIE E3 (wyciek GATE-2 + automat dowodowy)
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E3_FIX5.md
# PRZYJĘTE: naprawa kodowania raportów, ANY(string_to_array), filtry tokenów,
# zasada zapisu plików przez Node/-Encoding utf8.
# NIEODEBRANE: wyciek substancji GATE-2 do indeksu nazw (dowód w Twojej
# próbce §4), brak pomiaru similarity i decyzji o progu, brak dowodów gita,
# praca niezacommitowana. Wynik: docs/RAPORT_E3_FIX5.md + docs/E3_EVIDENCE.md
# + commity. Zakaz pracy nad E4.

## 1. WYCIEK SUBSTANCJI BRAMKOWYCH DO INDEKSU — PRIORYTET BEZPIECZEŃSTWA
W próbce SOT_06 z Twojego raportu w kolumnie entryName znajdują się:
ketoconazole, climbazole, clotrimazole, miconazole, hydroquinone, tretinoin,
adapalene, isotretinoin, antybiotyki, erythromycin, clindamycin, neomycin,
corticosteroids, hydrocortisone — czyli KOMPLETNA lista GATE-2. Indeks
"znanych składników" nie może zawierać substancji, których wykrycie
zatrzymuje potok (S-2, SOT 06 §2).
a) DIAGNOZA — wykonaj i wklej surowy output:
   `SELECT id, title, "sotModule", "chunkType", "entryName"
    FROM "KnowledgeDocument" WHERE "entryName" IS NOT NULL
    AND ("entryName" LIKE '%ketoconazole%' OR ... )` — dla WSZYSTKICH
   substancji z list GATE-1 i GATE-2 (wygeneruj warunek programowo z list
   w validators/index.js, nie przepisuj ręcznie).
b) Podaj chunkType tych rekordów. Jeśli jest DICTIONARY_ENTRY — to znaczy,
   że sekcja SOT 06 §2 nie została oznaczona jako GATE (UPDATE z FIX2 objął
   tylko 2 chunki, a lista leków najpewniej rozciąga się na więcej).
   Popraw oznaczenie: WSZYSTKIE chunki zawierające listę bramkową
   z SOT 06 §2 i SOT 04 §1 = chunkType 'GATE'.
c) entryName = NULL dla każdego rekordu o chunkType różnym od
   DICTIONARY_ENTRY (UPDATE). Potwierdź zapytaniem, że nie ma wyjątków.
d) TWARDY BEZPIECZNIK (niezależny od chunkType): po każdym ingeście skrypt
   usuwa z entryName każdą nazwę występującą na listach GATE-1/GATE-2.
   Implementacja w kodzie ingestu, nie jako jednorazowy UPDATE.
e) TEST (obowiązkowy, w tests/): iteracja po PEŁNYCH listach GATE-1 i GATE-2 —
   dla każdej substancji assert: lookup w indeksie zwraca BRAK (nie jest
   "znanym składnikiem") ORAZ validators V8 zwraca status blokujący.
   Ten test jest odtąd stałym elementem baterii.

## 2. OCZYSZCZENIE INDEKSU ZE ŚMIECI
W próbkach są nagłówki i fragmenty opisów: 'mechanizm działania:',
'kategoria: anionowy środek powierzchniowo czynny.', 'kryterium
skuteczności:', 'związki polimerowe', 'funkcja główna: konserwant biocide
for in', 'climbazole jako substancja lecznicza'.
a) Dodaj filtry odrzucające token, jeśli: zawiera dwukropek; kończy się
   kropką; zawiera polski kwalifikator opisowy ('jako ', 'funkcja',
   'kategoria', 'mechanizm', 'kryterium'); jest wyłącznie polskim wyrażeniem
   opisowym bez odpowiednika w pozycji nazwy wpisu.
b) 'climbazole jako substancja lecznicza' → po filtrze zostaje sama nazwa
   (obetnij kwalifikator, nie odrzucaj całego tokenu).
c) Podaj liczbę wpisów w indeksie PRZED i PO czyszczeniu oraz ponownie
   po 20 próbek z każdego modułu składnikowego (SOT_06, SOT_10, INCI_DICT).

## 3. AUTOMAT DOWODOWY (zmiana procesowa — obowiązuje do końca projektu)
Dowody przestają być prozą w raporcie. Utwórz
scripts/collect_e3_evidence.js, który JEDNYM uruchomieniem zapisuje
docs/E3_EVIDENCE.md (UTF-8 przez fs.writeFileSync) zawierający po kolei:
 1. inwentarz kodowania wszystkich plików tekstowych modułu +
    prisma/schema.prisma (plik → kodowanie → BOM → liczba U+FFFD → OK/PODEJRZANY),
 2. zestawienie DWUKOLUMNOWE list bezpieczeństwa: [wpis w validators/index.js]
    | [wpis w docs/SHARED_RULES_v4.1.md §A/§D] | ZGODNY/RÓŻNY,
 3. rozkład moduł × chunkType (dowód braku duplikatów),
 4. wynik zapytania o wyciek GATE-1/GATE-2 do entryName (z §1a),
 5. pokrycie INDEKSU per plik składnikowy: [wpisy w źródle] → [unikalne nazwy
    w entryName] → [%] (to NIE jest pokrycie znaków — pokrycie znaków możesz
    podać osobno i tak je nazwać),
 6. po 20 próbek nazw z każdego modułu składnikowego,
 7. tabelę pomiaru similarity: 10 składników obecnych + 5 negatywów bez
    nazw realnych składników, kolumny [zapytanie] → [indeks: ZNALEZIONY/BRAK]
    → [moduł] → [similarity]; na końcu min(obecne) i max(negatywy),
 8. pełny output `node --test` całego katalogu tests/,
 9. `git log --oneline -8` i `git diff --stat` per commit etapu.
RAPORT_E3_FIX5.md zawiera wyłącznie interpretację i decyzje, z odwołaniami
do numerów sekcji E3_EVIDENCE.md. Fakty w E3_EVIDENCE, opinie w raporcie.

## 4. PRÓG SIMILARITY — DOMKNIĘCIE (nadal nierozstrzygnięte)
Na podstawie tabeli z §3 pkt 7 ustaw DEFAULT_MIN_SIMILARITY wg reguły
z INSTRUKCJA_E3_FIX3 §4d: 0.60, jeśli min(obecne) ≥ 0.65; w przeciwnym razie
0.72 dla zapytań opisowych. Podaj w raporcie WARTOŚĆ FINALNĄ i plik:linię,
gdzie jest ustawiona. Przypomnienie: GATE-3 nie zależy już od tej liczby —
ona reguluje tylko jakość doboru opisu, więc wybór jest bezpieczny w obie
strony. Testy: GATE-3 daje identyczny wynik przy 0.60 i 0.72.

## 5. COMMIT (praca jest niezacommitowana — to ryzyko)
Commity ASCII, w tej kolejności:
(1) `fix(security): entryName bez substancji bramkowych GATE-1/GATE-2 + test`
(2) `fix(rag): filtry indeksu nazw — usuniecie naglowkow i opisow`
(3) `test(rag): automat dowodowy E3 + pomiar similarity + prog koncowy`
Zakaz `git push`.

## 6. ZAMKNIĘCIE
STOP po RAPORT_E3_FIX5.md + E3_EVIDENCE.md. To ostatnia runda E3: jeśli
komplet z §3 będzie na miejscu i test z §1e zielony, zamykam etap i wydaję
INSTRUKCJA_E4. Jeśli któregokolwiek dowodu zabraknie — nie oceniam raportu
(Z-1) i wracasz do brakującej pozycji, bez nowych prac.
