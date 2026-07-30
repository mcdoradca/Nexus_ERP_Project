# DECYZJA — AKCEPTACJA PLANU E3 KONSOLIDACJA (z uzupełnieniami)
# Lokalizacja: src/modules/offer-optimizer-v2/docs/DECYZJA_E3_KONS_plan.md
# Plan AKCEPTOWANY. Wykonuj wg INSTRUKCJA_E3_KONSOLIDACJA + poniższe.

## ZATWIERDZENIE PYTANIA Z "USER REVIEW REQUIRED"
TAK — similarity zostaje CAŁKOWICIE usunięte ze ścieżki składnikowej.
Wiedza o składniku: nazwa → entryName (exact match po normalizacji) →
treść chunku. Brak nazwy w indeksie → unknownIngredients (GATE-3).
Similarity wyłącznie dla zapytań opisowych (SOT 05 synergie), próg 0.72,
źródło opcjonalne — brak wyniku nie blokuje potoku.
Podstawa: pomiar wykazał inwersję (min HIT 0.647 < max MISS 0.662),
więc warstwa wektorowa nie ma zdolności rozróżniania na krótkich wpisach.

## UZUPEŁNIENIE 1 — PRZYCZYNA ZEROWEGO PRZEBIEGU TESTÓW (obowiązkowa diagnoza)
Plan przywraca testy, ale nie ustala, DLACZEGO runner wykonał 0 testów.
Bez przyczyny problem wróci. Najbardziej prawdopodobne: wzorzec
`tests/*.test.js` nie jest rozwijany przez PowerShell/cmd i Node dostaje
literalną ścieżkę. Sprawdź i podaj przyczynę wprost. Komendą kanoniczną
w projekcie jest forma katalogowa:
`node --test src/modules/offer-optimizer-v2/tests/`
Wpisz ją do DECISION_LOG jako ZASADĘ STAŁĄ i używaj wyłącznie jej.

## UZUPEŁNIENIE 2 — POKRYCIE INDEKSU (proszę o to czwarty raz)
Wymagana metryka, w E3_EVIDENCE jako tabela + assert w teście:
[plik składnikowy] → [liczba wpisów składnikowych w ŹRÓDLE, policzona
po nagłówkach/pogrubieniach] → [liczba unikalnych nazw w entryName] →
[pokrycie %]. Assert ≥95%.
To NIE jest pokrycie znaków po chunkingu (99,3%) — tamtej liczby nie
wolno podawać jako pokrycia indeksu. Możesz podać obie, nazwane osobno.

## UZUPEŁNIENIE 3 — DOWÓD BRAKU FALLBACKU
Po usunięciu similarity ze ścieżki składnikowej podaj plik:linię funkcji
getKnowledgeForIngredients i wklej jej treść do raportu. Ma nie zawierać
ŻADNEGO dopasowania rozmytego, podciągowego, "najbliższego" ani wywołania
_getEmbeddings/searchKnowledge. W poprzednich raportach dwukrotnie pojawiło
się sformułowanie "exact match + fallback" — chcę zobaczyć kod, nie opis.

## UZUPEŁNIENIE 4 — TESTY METADANYCH CHUNKÓW
Po zmianie ingestu dodaj asercje: (a) każdy z modułów SOT_01, SOT_02,
SOT_03, SOT_04, SOT_06, SOT_08, SOT_09 ma ≥1 chunk typu GATE lub RULE;
(b) każdy chunk o chunkType GATE lub RULE ma entryName IS NULL;
(c) żadna substancja z list GATE-1/GATE-2 nie występuje w entryName
(iteracja po pełnych listach).

## UZUPEŁNIENIE 5 — PEŁNA LISTA FILTRÓW EKSTRAKCJI
Plan wymienia trzy kwalifikatory; komplet do odrzucenia: tokeny zawierające
dwukropek, kończące się kropką, krótsze niż 4 znaki, oraz zawierające
"jako ", "często", "funkcja", "kategoria", "mechanizm", "kryterium".
Skróty (ipa, coco, apg) dopuszczalne WYŁĄCZNIE jako alias przy pełnej
nazwie w tym samym wpisie, nigdy jako samodzielna pozycja indeksu.

## UZUPEŁNIENIE 6 — PEŁNY RE-INGEST NA KOŃCU
chunkType przypisywany w ingeście i nowe filtry entryName zadziałają
dopiero po ponownym wgraniu. Po wszystkich zmianach kodu wykonaj JEDEN
pełny, czysty re-ingest 11 plików, a następnie:
(a) rozkład moduł × chunkType do E3_EVIDENCE (bez duplikatów),
(b) test idempotencji: drugi przebieg tego samego ingestu daje identyczną
    liczbę rekordów (assert).
Koszt embeddingów marginalny (~91 tys. znaków).

## UZUPEŁNIENIE 7 — ZESTAWIENIE LIST BEZPIECZEŃSTWA POZYCJA PO POZYCJI
W E3_EVIDENCE §2 dwukrotnie pojawiło się zbiorcze "ZGODNE". Wymagana
tabela wierszowa: [wpis w validators/index.js] | [odpowiadający wpis
w docs/SHARED_RULES_v4.1.md §A/§D lub SOT] | [ZGODNY/RÓŻNY] — dla
wszystkich pozycji obu list (GATE-1 i GATE-2) oraz leksykonów §A i §D.
Wyjaśnij też rozjazd liczności: w RAPORT_E3_FIX2 GATE-1 miał 16 pozycji,
w E3_EVIDENCE 18. Skąd dwie dodatkowe.

## DROBIAZG
`docs/implementation_plan do E3` — nie usuwaj, to ślad decyzyjny.
Zmień nazwę na `implementation_plan_E3.md` (bez spacji) i zostaw w docs/.
Reszta higieny repo wg planu.
