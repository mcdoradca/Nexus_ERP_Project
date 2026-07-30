# INSTRUKCJA_E3_FIX — DOMKNIĘCIE ETAPU E3 (bez E4)
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E3_FIX.md
# STATUS: RAPORT_E3 nieodebrany. Cztery ustalenia audytu, dwa dotyczą
# bezpieczeństwa (GATE-3, prawo przez retrieval). Wynik: docs/RAPORT_E3_FIX.md
# + commity. Zakaz pracy nad E4.

## 0. KOREKTA PROCESOWA
Zmiana DEFAULT_MIN_SIMILARITY z 0.72 na 0.45 to modyfikacja parametru
bezpieczeństwa zapisanego w RAG_ORCHESTRATION §2 pkt 3 i 5, wykonana bez
decyzji Architekta (Z-5: zero własnej inwencji; parametry bramek nie są
polem optymalizacji). Zgłoszenie jej w raporcie zaliczam na plus —
ale sama zmiana zostaje cofnięta. Sprostowanie jednym zdaniem w raporcie.

## 1. PRÓG PODOBIEŃSTWA — LECZYMY PRZYCZYNĘ, NIE OBJAW
Skutek progu 0.45 jest wprost widoczny w Twoim T4: `unknown_ingredients = []`.
Bramka GATE-3 (S-2, SOT 06 nota antyhalucynacyjna) przestaje działać —
zamiast pominąć nieznany składnik, A4 dostanie słabo dopasowany wpis
i opisze składnik, którego nie zna. To niedopuszczalne.
a) PRZYWRÓĆ DEFAULT_MIN_SIMILARITY = 0.72 (wartość z RAG_ORCHESTRATION).
b) ZDIAGNOZUJ niskie similarity — sprawdź w BIEŻĄCEJ dokumentacji
   @google/genai / Gemini Embeddings (Z-4, z linkami do raportu):
   (1) czy model embeddingowy przyjmuje parametr typu zadania
       (taskType: RETRIEVAL_DOCUMENT dla ingestu vs RETRIEVAL_QUERY dla
       zapytań) — asymetria dokument/zapytanie jest typową przyczyną
       zaniżonych wyników cosine;
   (2) czy przy outputDimensionality < domyślnej wymagana jest NORMALIZACJA
       wektora po stronie klienta (przy obciętych wymiarach wektor traci
       długość jednostkową, co zniekształca <=> w pgvector);
   (3) jaka metryka jest użyta w zapytaniu SQL i czy odpowiada modelowi.
   Każde ustalenie = link + cytat parametru, nie pamięć.
c) NAPRAW zgodnie z ustaleniami (taskType per operacja, normalizacja jeśli
   wymagana) i PRZEGENERUJ EMBEDDINGI OD NOWA (ponowny ingest — wektory
   policzone starą metodą są niekompatybilne z nową; wersjonowanie @
   w ingestDocument obsłuży podmianę atomowo).
d) ZMIERZ PONOWNIE: tabela [zapytanie testowe] → [najlepsze trafienie] →
   [similarity przed naprawą] → [similarity po naprawie]. Minimum 6 zapytań,
   w tym: Niacinamide, Aqua, Limonene, składnik chemii domowej z SOT 10,
   zapytanie o synergię (SOT 05), zapytanie bezsensowne ('Xyzabc Extract').
e) DOPIERO gdy pkt b–d są wykonane, a similarity dla trafnych zapytań nadal
   nie osiąga 0.72 — przedstaw dane i propozycję progu jako HITL. Decyzję
   o progu podejmuje Architekt, z jawną analizą wpływu na GATE-3. Zakaz
   samodzielnej zmiany progu w kodzie.

## 2. BRAKUJĄCY SOT 10 (kompletność wsadu)
Pliki SOT to 11 pozycji (RAG_SOT_01…10 + INCI_i_ich_dzialanie.md). W Twoim
zestawieniu ingestu SOT_10 NIE WYSTĘPUJE — najpewniej skutek nazwy pliku ze
spacjami i diakrytykami ("RAG_SOT_10_Składniki Chemii Domowej
i Przemysłowej.md"), przed czym ostrzegała instrukcja §5.
a) Wklej do raportu JAWNĄ tabelę mapowania z ingest_sot.js: [ścieżka pliku]
   → [sotModule] → [targetAgents[]] → [domyślny chunkType]. Wszystkie 11
   pozycji muszą być obecne.
b) Zaingestuj SOT 10 (A4 wg macierzy §1: wpisy per składnik,
   DICTIONARY_ENTRY).
c) IDENTYFIKATOR MODUŁU DLA INCI: zastąp wymyślony 'SOT_06_LEGACY'
   identyfikatorem odrębnym od SOT 06 (macierz §1 traktuje
   INCI_i_ich_dzialanie jako osobną pozycję RAG dla A4) — proponowany
   'INCI_DICT'. Zakaz nazw sugerujących, że to część SOT 06 (psuje filtr
   modułów i testy T2). Wpis do DECISION_LOG.
d) DOWÓD KOMPLETNOŚCI TREŚCI: tabela per plik [rozmiar źródła w znakach] →
   [suma znaków zaingestowanych chunków] → [pokrycie %]. Pokrycie znacząco
   poniżej 100% = utrata treści przy chunkingu → STOP i raport (chunki
   liczone w jednostkach 7–33 przy dużych plikach SOT wymagają tego dowodu).

## 3. TEST T3 — ODWRÓCONA INTERPRETACJA (bezpieczeństwo, S-5)
T3 miał dowodzić, że chunki GATE/RULE NIE są serwowane przez retrieval,
a serwis loguje ostrzeżenie, gdy trafią do wyników. Zaraportowałeś jako
sukces zwrot chunku z SOT_09 — tymczasem SOT 09 jest w macierzy §1
WYŁĄCZNIE prefiksem statycznym dla A7 (kolumna "RAG dynamiczny" pusta).
To zdarzenie, które test miał wychwycić, nie potwierdzić.
a) Wklej do raportu rozkład chunków: [sotModule] × [chunkType] × [liczba].
b) Zweryfikuj oznaczenia wg RAG_ORCHESTRATION §0: GATE/RULE dla SOT 01 §3–4,
   SOT 02 §3 i §1C, SOT 03 §1–2, SOT 04 §1, SOT 06 §2, SOT 08 §0+§3,
   SOT 09 §1–2. Moduły wyłącznie prefiksowe (SOT 01, 03, 08, 09) nie mogą
   mieć chunków typu DICTIONARY_ENTRY/CONTEXT wpadających do puli
   słownikowej dla A4.
c) T3 na nowo: zapytanie słownikowe (np. o składnik) NIE zwraca chunków
   GATE/RULE; gdy zwróci — w logu pojawia się ostrzeżenie serwisu. Asercja
   na oba warunki. Surowy output do raportu.
d) T5 (charBudget) jako ODDZIELNY test, nie zdanie w prozie.

## 4. LISTY BRAMKOWE — DECYZJA ARCHITEKTA (rozszerzenie, nie deferral)
Twoje ustalenie (Climbazole, Hydrocortisone/kortykosteroidy poza listą w kodzie)
jest trafne i NIE odkładamy go do E4 — to bramka bezpieczeństwa (S-2).
Podstawa: hierarchia źródeł stawia SOT nad SHARED_RULES, a §I wylicza
substancje z zastrzeżeniem "m.in." — czyli lista w kodzie ma być PEŁNYM
zbiorem z SOT, nie podzbiorem.
a) Wyekstrahuj z RAG_SOT_04 §1 (GATE-1) i RAG_SOT_06 §2 (GATE-2) PEŁNE listy
   substancji — mechanicznie, 1:1 z treści SOT, bez dodawania niczego
   "z podobieństwa" ani własnej wiedzy (S-6 nadal obowiązuje wobec Twojej
   inwencji; źródłem jest SOT).
b) Zaktualizuj listy w validators/index.js. Dopasowanie case-insensitive,
   po nazwach INCI; uwzględnij warianty pisowni obecne w SOT.
c) Wklej do raportu OBIE finalne listy w całości + tabelę [substancja] →
   [źródło: SOT 04 §1 / SOT 06 §2 / SHARED_RULES §I].
d) Testy: iteracja po PEŁNYCH listach (jak w E2), licznik substancji
   w nazwie subtestu. Surowy output runnera.
e) DECISION_LOG: [data] | SHARED_RULES §I: listy z "m.in." | SOT 04 §1 /
   SOT 06 §2: zbiory pełne | decyzja Architekta: walidator egzekwuje pełne
   zbiory z SOT, §I traktowane jako wyciąg ilustracyjny | ryzyko: rozjazd
   przy aktualizacji SOT — porównanie list SOT↔kod wchodzi do checklisty E5.

## 5. DOWODY (Z-1 — brak w RAPORT_E3, blokada formalna)
Do RAPORT_E3_FIX.md obowiązkowo: `git log --oneline -10`, `git diff --stat`
dla każdego commita tego etapu, surowe outputy WSZYSTKICH testów
(node --test, pełny strumień, nie fragmenty), output weryfikacji
information_schema dla trzech kolumn, output getGroupedDocuments() po
ponownym ingeście. Bez tego raport nie podlega ocenie.

## 6. ZAMKNIĘCIE
Commity: (1) `fix(offer-optimizer-v2): E3 fix — prog 0.72, taskType/
normalizacja embeddingu, reingest`, (2) `fix(offer-optimizer-v2): E3 fix —
SOT 10 + mapowanie modulow`, (3) `fix(offer-optimizer-v2): pelne listy
bramkowe GATE-1/GATE-2 wg SOT + testy`.
RAPORT_E3_FIX.md: sprostowanie §0, outputy §1–§5, wpisy DECISION_LOG,
HITL, czego nie zweryfikowano. Zakaz `git push`. STOP — akceptacja
Architekta przed E4.
