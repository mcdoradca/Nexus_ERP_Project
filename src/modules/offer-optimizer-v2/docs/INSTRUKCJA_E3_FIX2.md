# INSTRUKCJA_E3_FIX2 — OSTATECZNE DOMKNIĘCIE E3
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E3_FIX2.md
# STATUS: przyjęte — normalizacja L2, taskType, pełne listy GATE-1/GATE-2 wg SOT.
# WSTRZYMANE — decyzja o progu similarity: pomiar wykonany na zanieczyszczonej
# puli i bez filtra modułów. Kolejność: czysta pula → filtr → pomiar → próg.
# Wynik: docs/RAPORT_E3_FIX2.md + commity. Zakaz pracy nad E4.

## 1. INWENTARYZACJA PULI (diagnoza, zero kasowania)
Wykonaj i wklej surowe outputy:
a) `SELECT "sotModule", "chunkType", COUNT(*), MIN("createdAt"),
   MAX("createdAt") FROM "KnowledgeDocument" GROUP BY 1,2 ORDER BY 1,2;`
b) `SELECT COUNT(*) FROM "KnowledgeDocument" WHERE "sotModule" IS NULL;`
c) Lista DISTINCT tytułów dla rekordów z sotModule IS NULL (max 20) —
   ustal ich pochodzenie (ingest starego modułu vs nasz).
d) Czy istnieją jednocześnie rekordy 'SOT_06_LEGACY' i 'INCI_DICT'
   (dowód z pkt a). Jeśli tak — podmiana wersji nie usunęła starych,
   bo zmianie uległ identyfikator modułu, a nie tytuł dokumentu.

## 2. HIGIENA PULI — ZASADY TWARDE
a) **ZAKAZ KASOWANIA rekordów z sotModule IS NULL.** To najpewniej wsad
   starego modułu, który PRACUJE NA PRODUKCJI (OP-2: kwarantanna, nie
   dotykamy). Ich neutralizacja = FILTROWANIE, nie DELETE.
b) Usuń WYŁĄCZNIE własne duplikaty z v2: rekordy pod identyfikatorem
   'SOT_06_LEGACY' powstałe z naszego ingestu (rozpoznasz po tytule
   wersjonowanym `...@v2026.07` i dacie z tej sesji). Przed DELETE wklej
   do raportu SELECT pokazujący dokładnie te wiersze (id, title,
   sotModule, createdAt) — kasujesz tylko to, co pokazałeś.
c) searchKnowledge: dodaj do zapytania SQL twardy warunek
   `AND "sotModule" IS NOT NULL` — pula v2 nigdy nie zawiera rekordów bez
   metadanych. Dodatkowo napraw martwy fragment kodu z wzorca: zmienna
   `moduleFilter` jest tworzona i nieużywana, a filtr modułów wstawiany
   jest inline — usuń martwą zmienną i potwierdź, że filtr faktycznie
   działa (test T2 na to jest).
d) getKnowledgeForIngredients: WYMAGA przekazania sotModules. Dla A4 wg
   macierzy §1: ['SOT_06','SOT_10','SOT_07','SOT_05','SOT_04','INCI_DICT'].
   Wywołanie bez sotModules → rzuć błąd (zapytania globalne są zakazane
   w potoku produkcyjnym; brak filtra = losowa wiedza).

## 3. chunkType PER SEKCJA (poprawka bez ponownego liczenia embeddingów)
Obecne przypisanie jest per plik — sekcje bramkowe zginęły w typach
słownikowych. Popraw metadane UPDATE-em (embeddingi zostają, nie licz
ich ponownie):
a) Chunker prefiksuje każdy chunk nagłówkiem `[nazwa sekcji]` — użyj tego
   do dopasowania. Ustaw chunkType = 'GATE' dla sekcji: SOT 04 §1
   (HARD BANS / substancje zakazane), SOT 06 §2 (bramka leków /
   INGREDIENT_NOT_COSMETIC), SOT 02 §3 (czarna lista BPR art. 72).
   Ustaw 'RULE' dla: SOT 01 §3–4, SOT 02 §1C, SOT 03 §1–2, SOT 08 §0 i §3,
   SOT 09 §1–2.
b) Jeśli nagłówki w plikach SOT nie odpowiadają dokładnie tym oznaczeniom
   (§ vs inne numerowanie) — NIE zgaduj: wklej do raportu listę
   faktycznych nagłówków tych plików i zaproponuj mapowanie jako HITL.
c) Po UPDATE wklej ponownie zestawienie z §1a (rozkład moduł × typ).

## 4. RZETELNY POMIAR (na czystej puli, z filtrem modułów)
Zestaw walidacyjny, wykonany przez getKnowledgeForIngredients z filtrem
dla A4:
a) ≥10 składników FAKTYCZNIE obecnych w słownikach (wybierz je ODCZYTEM
   z SOT 06 / SOT 10 / INCI_i_ich_dzialanie — nie z pamięci): m.in.
   Niacinamide, Aqua, Sodium Lauryl Sulfate, Limonene + 6 kolejnych,
   w tym min. 3 z chemii domowej (SOT 10).
b) ≥5 pozycji, których w słownikach NIE MA: 'Xyzabc Extract' + 4 inne
   ciągi bezsensowne lub składniki nieopisane.
c) Tabela: [zapytanie] → [oczekiwanie: TRAFIENIE/BRAK] → [moduł trafienia]
   → [similarity] → [wynik przy progu 0.72] → [wynik przy 0.60].
d) Podaj dwie liczby: MINIMUM similarity dla pozycji obecnych oraz
   MAKSIMUM dla nieobecnych. To one rozstrzygają próg.

## 5. PRÓG — DECYZJA WARUNKOWA ARCHITEKTA
Ratyfikuję odstępstwo od RAG_ORCHESTRATION §2 (0.72) TYLKO na danych z §4,
ponieważ 0.72 pochodzi z założeń innego modelu embeddingowego niż
faktycznie użyty:
a) JEŚLI min(obecne) ≥ 0.62 i max(nieobecne) ≤ 0.56 → ustaw
   DEFAULT_MIN_SIMILARITY = 0.60. Wpis do DECISION_LOG: [data] |
   RAG_ORCHESTRATION §2: 0.72 | pomiar na gemini-embedding-2 po
   normalizacji L2 i taskType: min TP = X, max FP = Y | decyzja Architekta:
   0.60 z marginesem separacji | ryzyko: przy zmianie modelu embeddingowego
   próg wymaga ponownej kalibracji — wchodzi do checklisty E5.
b) JEŚLI warunek z pkt a NIE jest spełniony (marginesy się nakładają) →
   STOP, wklej dane i CZEKAJ na decyzję. Zakaz ustawiania progu "na oko".
c) Niezależnie od progu: składnik poniżej progu MUSI trafić do
   unknownIngredients (GATE-3). Test end-to-end: lista mieszana
   [3 obecne + 2 nieobecne] → dokładnie 2 pozycje w unknownIngredients.
   Surowy output do raportu.

## 6. T5 — TEST BUDŻETU MUSI COŚ TESTOWAĆ
Poprzedni przebieg zwrócił 0 chunków i 0 znaków — test był pusty.
Po naprawie: zapytanie o ≥5 składników obecnych z charBudget ustawionym
NIŻEJ niż suma ich chunków. Asercja: charsUsed ≤ charBudget ORAZ
liczba zwróconych chunków mniejsza niż liczba dostępnych trafień
(dowód faktycznego przycięcia). Surowy output.

## 7. ZAMKNIĘCIE
Commity: (1) `fix(offer-optimizer-v2): higiena puli RAG — filtr metadanych,
usuniecie duplikatow v2`, (2) `fix(offer-optimizer-v2): chunkType per sekcja
(GATE/RULE)`, (3) `fix(offer-optimizer-v2): kalibracja progu similarity
+ testy GATE-3 i budzetu`.
RAPORT_E3_FIX2.md: outputy §1–§6, wpisy DECISION_LOG, HITL, czego nie
zweryfikowano, `git log --oneline -6`, `git diff --stat` per commit
(pełny, nie jedna linia na commit). Zakaz `git push`.
STOP — akceptacja Architekta zamyka E3.
