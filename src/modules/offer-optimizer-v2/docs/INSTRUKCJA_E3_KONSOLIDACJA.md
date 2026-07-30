# INSTRUKCJA_E3_KONSOLIDACJA — DLA ŚWIEŻEJ SESJI AGENTA
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E3_KONSOLIDACJA.md
# Poprzednia sesja uległa degradacji kontekstu (cofanie własnych poprawek,
# deklarowanie niewykonanych commitów, zero uruchomionych testów przy
# raportowanym "PASS"). Zaczynasz z czystym kontekstem.
# CZYTASZ NAJPIERW: MASTER_HANDOFF_OFFER_OPTIMIZER_V2.md (§3–§7) oraz ten plik.
# Wynik: docs/RAPORT_E3_KONS.md + docs/E3_EVIDENCE.md (regenerowany) + commity.
# Zakaz pracy nad E4. Zakaz `git push`.

## 0. ZASADY (obowiązują bez wyjątku)
Z-1 raport bez surowych outputów i `git diff --stat` nie podlega ocenie.
Z-3 każde twierdzenie o kodzie ma referencję plik:linia z AKTUALNEGO odczytu.
Z-5 zero własnej inwencji; adaptacja tylko z wpisem do DECISION_LOG.
Z-7 rozjazd raport↔git zgłaszasz sam, natychmiast.
ZAPIS PLIKÓW: wyłącznie `fs.writeFileSync(path, data, 'utf8')` z Node.
BEZWZGLĘDNY ZAKAZ: `>>`, `echo`, `Add-Content`, `Out-File` bez `-Encoding utf8`,
oraz jakiegokolwiek narzędzia, które zapisuje UTF-16. Kontrola: plik widoczny
w `git diff --stat` jako "Bin" = awaria, natychmiastowa naprawa.
COMMIT MESSAGES: wyłącznie ASCII.

## 1. NAPRAWA REJESTRU DECYZJI (priorytet — to nasza pamięć projektu)
`docs/DECISION_LOG.md` jest binarny (UTF-16, git widzi "Bin 3879 -> 5592").
To samo dotyczy: RAPORT_E3_FIX2.md, RAPORT_E3_FIX3.md, INSTRUKCJA_E3_FIX3.md,
INSTRUKCJA_E3_FIX4.md.
a) Dla każdego z tych plików: odczytaj bajty, wykryj kodowanie, przekonwertuj
   na UTF-8 bez BOM przez Node, zapisz. NIE tracąc treści — jeśli konwersja
   daje krzaki (utracone znaki), odzysk z historii: `git show <commit>:<ścieżka>`
   dla ostatniej niebinarnej wersji; różnice opisz w raporcie.
b) Dowód per plik: `git diff --stat` pokazuje plik jako TEKST (liczba linii,
   nie "Bin") + pierwsze 5 linii wklejone do raportu.
c) Jeśli treść DECISION_LOG jest nieodwracalnie uszkodzona — odtwórz go
   z dokumentów decyzyjnych w docs/ (DECYZJA_*.md, INSTRUKCJA_*.md) jako
   listę wpisów z datami. Zaznacz w nagłówku "odtworzony po awarii kodowania".

## 2. WSKRZESZENIE BATERII TESTÓW (bez tego nic nie jest udowodnione)
Ostatni `node --test` wykonał ZERO testów, a `tests/validators.test.js`
stracił ~100 linii.
a) Porównaj obecny `tests/validators.test.js` z wersją z commita d9c1756
   (`git show d9c1756:src/modules/offer-optimizer-v2/tests/validators.test.js`).
   Wklej diff. Przywróć utracone przypadki: V1–V10 po ≥3 przypadki
   (pozytywny/negatywny/brzegowy) + iteracja po PEŁNYCH listach GATE-1
   i GATE-2 z licznikiem w nazwie subtestu.
b) Ustal, dlaczego runner wykonał 0 testów (zła ścieżka? wzorzec nazw plików?
   błąd importu wywalający plik w ciszy?). Podaj przyczynę i poprawną komendę.
c) Uruchom `node --test src/modules/offer-optimizer-v2/tests/` — output MUSI
   pokazać liczbę testów > 0 i wszystkie pliki: validators, normalization,
   rag.service. Pełny surowy output do E3_EVIDENCE.
d) Dopisz test odporności na korupcję kodowania: frazy z polskimi znakami
   zapisane na twardo w pliku testowym ("produkt leczy łuszczycę",
   "gwarancja skuteczności", "terapia") muszą być wykrywane przez
   scan_medical_claims_lexical i scan_stopwords.

## 3. METADANE CHUNKÓW — PRZYWRÓCENIE OZNACZEŃ SEKCYJNYCH
Re-ingest cofnął oznaczenia per sekcja: SOT_04 i SOT_06 mają obecnie
wyłącznie DICTIONARY_ENTRY, więc sekcje bramkowe (SOT 04 §1 HARD BANS,
SOT 06 §2 leki) nie są oznaczone jako GATE.
a) Zaimplementuj przypisanie chunkType W SKRYPCIE INGESTU (nie jako
   jednorazowy UPDATE po fakcie — dlatego regresja wróciła): reguła
   dopasowania po nagłówku chunku, wg RAG_ORCHESTRATION §0.
   GATE: SOT 04 §1, SOT 06 §2, SOT 02 §3. RULE: SOT 01 §3–4, SOT 02 §1C,
   SOT 03 §1–2, SOT 08 §0 i §3, SOT 09 §1–2. Pozostałe: DICTIONARY_ENTRY
   lub CONTEXT wg macierzy.
b) Test: po ingeście każdy z wymienionych modułów ma ≥1 chunk typu
   GATE/RULE (assert), a chunki GATE/RULE mają entryName IS NULL.
c) OP-2: rekordy starego modułu (sotModule IS NULL) zostały przez poprzednią
   sesję zmodyfikowane (2 rekordy dostały chunkType 'GATE'). Przywróć im
   chunkType na NULL i entryName na NULL. Zasada: v2 NIE MODYFIKUJE
   rekordów bez sotModule — tylko je filtruje.

## 4. ŚCIEŻKA SKŁADNIKOWA — UPROSZCZENIE ARCHITEKTURY (decyzja Architekta)
Pomiar wykazał INWERSJĘ: min(similarity dla prawdziwych składników) = 0.647,
max(dla bezsensownych zapytań) = 0.662. Warstwa semantyczna nie odróżnia
sensu od bezsensu na krótkich wpisach. Wniosek architektoniczny:
a) Wiedza o SKŁADNIKU pobierana jest WYŁĄCZNIE deterministycznie:
   nazwa → entryName (exact match po normalizacji) → treść chunku.
   Similarity NIE bierze udziału w ścieżce składnikowej — ani jako ranking,
   ani jako filtr. Brak nazwy w indeksie → unknownIngredients (GATE-3).
b) Similarity zostaje wyłącznie dla zapytań OPISOWYCH (np. synergie z SOT 05),
   z progiem 0.72, jako źródło opcjonalne: brak wyniku nie blokuje potoku.
c) Usuń z getKnowledgeForIngredients wszelkie ścieżki fallbackowe —
   w raportach poprzedniej sesji pojawiał się "exact match + fallback".
   Żadnego dopasowania rozmytego, podciągowego ani "najbliższego".
   Podaj plik:linię, w której to potwierdzasz.
d) DECISION_LOG: [data] | RAG_ORCHESTRATION §2: retrieval słownikowy przez
   similarity | pomiar: inwersja HIT/MISS (0.647 vs 0.662) | decyzja
   Architekta: ścieżka składnikowa deterministyczna, similarity tylko dla
   zapytań opisowych | ryzyko: jakość opisów zależy od kompletności indeksu —
   kontrola w E5 na 50 SKU.

## 5. INDEKS NAZW — METRYKA I CZYSTOŚĆ
a) POKRYCIE (trzeci raz proszę o tę metrykę — to NIE pokrycie znaków):
   tabela per plik składnikowy: [liczba wpisów składnikowych w źródle,
   policzona po nagłówkach/pogrubieniach] → [liczba unikalnych nazw
   w entryName] → [pokrycie %]. Assert ≥95% w teście.
b) Śmieci w indeksie nadal obecne — w próbkach: "gemini embedding 2",
   "climbazole jako substancja lecznicza", "środki powierzchniowo czynne",
   "związki kompleksujące i zmiękczające wodę chelatory", "dodecylbenzene
   sulfonic acid często", "coco", "ipa". Dołóż filtry: odrzuć tokeny
   zawierające dwukropek, kończące się kropką, zawierające kwalifikatory
   ("jako ", "często", "funkcja", "kategoria", "mechanizm", "kryterium"),
   krótsze niż 4 znaki (ucina "coco", "ipa" jako samodzielne wpisy —
   skróty zostają tylko jako alias przy pełnej nazwie), oraz frazy
   opisowe bez odpowiednika w pozycji nazwy wpisu.
c) Po 20 próbek per moduł ponownie do E3_EVIDENCE.

## 6. POMIAR — KOLUMNA MUSI MIERZYĆ TO, CO DEKLARUJE
W ostatnim pomiarze zapytania "cegła" i "słońce" miały status ZNALEZIONY —
bo kolumna pokazywała wynik progu similarity, nie wynik indeksu nazw.
Nowa tabela ma DWIE rozdzielne kolumny: [indeks nazw: ZNALEZIONY/BRAK]
(rozstrzygająca dla GATE-3) oraz [similarity najlepszego trafienia]
(informacyjna). 10 składników obecnych + 5 negatywów bez nazw realnych
składników. Oczekiwanie: wszystkie negatywy = BRAK w kolumnie indeksu,
niezależnie od similarity.

## 7. HIGIENA REPO
Do repo trafiły artefakty: `diff.txt` (binarny), `fix_db.js`,
dwa pliki `*-audit.json` w katalogu głównym, `docs/implementation_plan do E3`
(nazwa ze spacjami). Usuń lub przenieś do scripts/ z komentarzem
nagłówkowym; `diff.txt` i pliki audit.json dopisz do .gitignore.
Skrypty operacyjne wyłącznie w scripts/, testy wyłącznie w tests/.

## 8. DOWODY I ZAMKNIĘCIE
Regeneruj docs/E3_EVIDENCE.md przez scripts/collect_e3_evidence.js
(zapis przez Node w UTF-8), sekcje w kolejności: inwentarz kodowania
(wszystkie pliki, po naprawie ZERO PODEJRZANYCH), zestawienie
DWUKOLUMNOWE list bezpieczeństwa [kod | SHARED_RULES §A/§D | ZGODNY/RÓŻNY]
— pozycja po pozycji, nie zbiorcze "ZGODNE", rozkład moduł × chunkType,
wynik zapytania o wyciek GATE-1/GATE-2 do entryName, pokrycie indeksu (§5a),
próbki nazw, tabela pomiaru (§6), PEŁNY output `node --test` z liczbą
testów > 0, `git log --oneline -8`, `git diff --stat` per commit.
Commity ASCII: (1) `fix(encoding): naprawa DECISION_LOG i raportow do UTF-8`,
(2) `test(v2): przywrocenie baterii walidatorow + runner`,
(3) `fix(rag): deterministyczna sciezka skladnikowa + chunkType w ingescie`,
(4) `chore(repo): higiena artefaktow`.
RAPORT_E3_KONS.md = interpretacja + decyzje + odwołania do sekcji
E3_EVIDENCE. STOP — akceptacja Architekta zamyka E3.
