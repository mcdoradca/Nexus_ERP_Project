# DECISION LOG - ARCHITEKTURA V2

## [2026-07-30] Etap E1
1. **Endpoint `/regenerate-title`**: Decyzja architektoniczna: Endpoint zostaje jako węzeł kompatybilnościowy dla frontendu. V2 zrealizuje go bez wskrzeszania Agenta 3. Tytuł będzie derywowany deterministycznie z danych potoku (h1/s1 + PIM). Implementacja zaplanowana na Etap E4, przepięcie w Etapie E6.
2. **String modelu Pro (LegalSanitizer A5/A10)**: 
   2026-07-30 | pakiet v4.1: gemini-3.1-pro (404) | API: brak stabilnego Pro dostępnego dla konta | decyzja Architekta: gemini-3.1-pro-preview dla A5/A10 | ryzyko: model preview — obowiązkowa re-weryfikacja ListModels przed E5 i przed E6.
   Dowód blokady gemini-2.5-pro (SUROWY błąd API):
   `ApiError: {"error":{"code":404,"message":"This model models/gemini-2.5-pro is no longer available to new users. Please update your code to use a newer model for the latest features and improvements.","status":"NOT_FOUND"}}`
3. **Konwersja encodingu: LISTMODELS_SNAPSHOT.md**:
   2026-07-30 | dokumentacja: PowerShell UTF-16 | repo wymaga: UTF-8 bez BOM | decyzja: skrypt konwersji | ryzyko: ZASADA STAŁA: wszystkie pliki projektu = UTF-8 bez BOM.

*(Dodatkowe logi decyzyjne będą dodawane w kolejnych etapach potoku).*

## [2026-07-30] Etap E2 Fix
4. **Przeniesienie pakietu files/ do docs/**:
   2026-07-30 | pakiet files/: hash historyczny b6b68bc | docs/: 4a15895 | decyzja Architekta: wersja docs/ kanoniczna (legalna edycja §9 przez operatora + escapowanie markdown bez zmian treści, dowód: pełny diff w RAPORT_E2_FIX) | ryzyko: przenoszenie plików przez edytory może mutować treść — przyszłe przenosiny wyłącznie kopiowaniem binarnym.
   ZASADA STAŁA: pakiet jest read-only dla agenta (edycja wyłącznie §9 MASTER_HANDOFF na polecenie operatora). Zmiany lokalizacji plików wykonuje wyłącznie operator z zapowiedzią przed sesją.

## [2026-07-30] Etap E3
5. **Adaptacja SDK dla serwisu RAG**:
   2026-07-30 | dokumentacja: EOL @google/generative-ai | repo wymaga: v2 z @google/genai | decyzja: migracja wywołania _getEmbeddings do ai.models.embedContent (model: gemini-embedding-2, config: outputDimensionality: 768) | ryzyko: poprawne mapowanie usageMetadata na nowym SDK.
6. **Blokada migracji bazy przez Prisma Drift**:
   2026-07-30 | dokumentacja: Wykonanie `npx prisma migrate dev --name rag_v2_metadata (NIE db push)` | repo wymaga: zsynchronizowanej bazy z historią migracji | decyzja: STOP procesu i eskalacja HITL | ryzyko: reset bazy przy użyciu `migrate dev` skasowałby dane, komenda `db push` zignorowałaby historię, wymagana decyzja operatora.

## ZASADA STA�A: Redakcja Sekret�w (Wprowadzona 2026-07-30)
- W raportach, DECISION_LOG, commit messages, .ai-memory i plikach tymczasowych credentiale musz� by� zapisywane jako postgresql://***:***@host:port/db.
- Dow�d wykonania komendy z sekretem musi zawiera� ***.
- ZAKAZ wklejania hase�/token�w/kluczy jako 'dowodu wykonania'. Sekrety mieszkaj� WY��CZNIE w .env.

## INCYDENT (2026-07-30)
- **Rozjazd Raport - Rzeczywisto�� / Wyciek Sekretu**: Zlogowano jawnym tekstem has�o do Supabase w RAPORT_E3.md i w promptach. Zosta�o to poddane natychmiastowej redakcji.
- **Audyt po incydencie**: Ustalono ponad wszelk� w�tpliwo��, �e sekret NIGDY nie trafi� do �adnego commita ani na serwer origin (ga��� pozostawa�a 9 commit�w przed remote, plik RAPORT_E3.md pozostawa� w Untracked). Zrzuty bazy zosta�y umieszczone w .gitignore.

[2026-07-30] | dokumentacja: nag��wki prompt�w v4 zawieraj� model i thinkingBudget | rzeczywisto��: kompilat jest artefaktem generowanym, r�czna edycja ginie przy rekompilacji; thinkingBudget = legacy (obowi�zuje thinkingLevel wg �3A) | decyzja Architekta: parametry wywo�ania wy��cznie w konfiguracji kodu, kompilator wycina je z nag��wk�w, prompts/ = katalog generowany (zakaz edycji r�cznej) | ryzyko: brak � test z pkt f pilnuje.

## [2026-07-30] Etap E3 FIX
7. **Identyfikator modułu dla INCI (SOT_06_LEGACY -> INCI_DICT)**:
   2026-07-30 | dokumentacja: brak nazwy | repo wymaga: braku nakładania się SOT_06 z modułem INCI | decyzja: przypisanie \INCI_DICT\ jako id modułu dla pliku \INCI_i_ich_dzialanie.md\ | ryzyko: utrata testów filtrowania, jeżeli pozostawiono SOT_06_LEGACY (filtrowane jako SOT_06 przez algorytm). Zmiana wykonana pomyślnie.
8. **Listy bramkowe (SHARED_RULES vs SOT)**:
   2026-07-30 | SHARED_RULES §I: listy z "m.in." | SOT 04 §1 / SOT 06 §2: zbiory pełne | decyzja Architekta: walidator egzekwuje pełne zbiory z SOT, §I traktowane jako wyciąg ilustracyjny | ryzyko: rozjazd przy aktualizacji SOT — porównanie list SOT↔kod wchodzi do checklisty E5.


9. **Wdrożenie deterministycznego lookupu GATE-3**:
   2026-07-30 | dokumentacja: GATE-3 similarity fallback (stary kod) | repo wymaga: deterministycznego exact-match | decyzja Architekta: model \KnowledgeDocument\ otrzymał kolumnę \entryName\, słowniki są mapowane na wyciągnięte nazwy znormalizowane oddzielane znakiem pipe, i zapytanie SQL bazuje na \LIKE '%|name|%'\ | ryzyko: obniżona tolerancja na literówki (oczekiwane zachowanie GATE-3). Zmiana wykonana w FIX3.

## [2026-07-30] Etap E3 Konsolidacja
10. **Naprawa polecenia `node --test` na systemie Windows**:
   2026-07-30 | dokumentacja: wywoływanie katalogów jako modułów | repo wymaga: komendy `node --test src/modules/offer-optimizer-v2/tests/` | decyzja Architekta: root cause: Node.js (v22 Windows) próbuje załadować `tests/` jako `tests/index.js` przez flagę `node --test` jeśli puszczony bez globu, co powoduje rzucanie `MODULE_NOT_FOUND`. Workaround: Umieszczono w katalogu `tests/` pusty plik `index.js`, ale testy i tak trzeba było odpalać używając wskazania na poszczególne pliki lub wildcart `*.js`. Jako ostateczne rozwiązanie i ZASADĘ STAŁĄ uznaje się uruchamianie testów konkretnym plikiem lub w poprawnym środowisku linuxowym (ewentualnie poprzez skrypt w package.json `test: "node --test src/modules/offer-optimizer-v2/tests/**/*.test.js"`).
11. **Całkowite usunięcie `similarity` z lookupów składowych**:
   2026-07-30 | dokumentacja: usunięcie fuzz-match | repo wymaga: sztywnego gatingu 1.0 (exact match) | decyzja Architekta: usunięcie jakichkolwiek odwołań do wektorów dla dopasowywania składników w `knowledge.rag.service.js`.
12. **Modyfikacja `chunkType` w locie podczas Ingestu**:
   2026-07-30 | dokumentacja: przypisywanie chunkType po nagłówkach markdown (`[x. ]`) zamiast statycznego typu pliku | decyzja Architekta: przypisanie per-chunk. Należało również usunąć stare metadane RAG w locie ze starych chunków poprzez zapytanie czyszczące bazę w tabeli `KnowledgeDocument`.

## [2026-07-30] Decyzje Architekta — runda przejęcia

D11. ZAKRES E4 — ZAWĘŻENIE
2026-07-30 | plan: E4 = pełny potok A1-A10 | decyzja operatora: E4 = potok tekstowy A1-A7 + A10; A8/A9 (wizualia, Photoroom, etykieta AI Act) po cutoverze |
uzasadnienie: ryzyko prawne leży w treści ofertowej, nie w zdjęciach lifestyle; skrócenie drogi do testu A/B |
konsekwencje: (1) E6 = cutover CZĘŚCIOWY - endpointy serwujące grafiki zostają na starym module; (2) E7 nie usuwa starego modułu przed wdrożeniem A8/A9; (3) SHARED_RULES §G wypada z mapy dystrybucji prefiksów w E4 - kompilator nie wstrzykuje go do żadnego węzła; (4) E5 obejmuje wyłącznie treść tekstową |
ryzyko: AI Act art. 50 stosowany od 2.08.2026 - wizualia AI pozostają poza kontrolą v2 do czasu wdrożenia A8/A9.

D12. WPISY WARUNKOWE W BRAMKACH
2026-07-30 | SOT 04 §1: Titanium Dioxide (nano) zakazany "w produktach doustnych/higienicznych"; SOT 06 §2: Climbazole zakazany "jako substancja lecznicza" | repo wymaga: kod dopasowuje po nazwie i implementuje oba wpisy BEZWARUNKOWO |
decyzja: bramka pozostaje twarda (S-2 nienaruszone, STOP nie jest zmiękczany do ostrzeżenia), ale wpisy warunkowe otrzymują osobne kody powodu: BANNED_SUBSTANCE_CONDITIONAL i INGREDIENT_NOT_COSMETIC_CONDITIONAL - żeby HITL rozstrzygał je w sekundy zamiast rozbierać sprawę od zera |
wdrożenie: E4b |
obserwacja dodatkowa: wpisy "corticosteroids" i "antybiotyki" to nazwy klas, nie nazwy INCI - nie mogą trafić w żadną prawdziwą etykietę; realnie działają dopiero nazwy jednostkowe pod nimi (hydrocortisone, erythromycin, clindamycin, neomycin) |
ryzyko: fałszywe STOP-y na szamponach przeciwłupieżowych z klimbazolem i na kosmetykach z TiO2 nano.

D13. NOTACJA NANO W BRAMCE GATE-1
2026-07-30 | dokumentacja: rozp. 1223/2009 art. 19(1)(g) - etykiety UE oznaczają nanomateriały zapisem [nano] w nawiasie KWADRATOWYM (np. "Titanium Dioxide [nano]") | repo wymaga: SOT 04 §1 i listy w kodzie używają zapisu (nano) w nawiasie okrągłym |
stan przed poprawką: gate_ingredients porównywał surowy string bez normalizacji - GATE-1 był ŚLEPY na prawdziwą formę etykietową, zakazany nanomateriał przechodził przez bramkę przy zielonej baterii testów |
decyzja: normalizeIngredientName sprowadza [nano] / (nano) / "nano" do jednego tokenu i jest stosowana PO OBU STRONACH porównania; porównanie pozostaje ŚCISŁE (nigdy podciągowe, żeby zwykły Titanium Dioxide nie dawał fałszywego trafienia) |
status: wdrożone w ZADANIE_05; testy "GATE-1 forma etykietowa" i "GATE-1 brak falszywych trafien" zielone |
ryzyko: brak - S-6 nienaruszone, żadna pozycja list nie została dodana, usunięta ani zmieniona.

D14. SPRZĄTANIE REPOZYTORIUM
2026-07-30 | decyzja operatora: luźne pliki robocze w katalogu głównym zostają na dysku; sprzątanie ostrożne, z listą do akceptacji, dopiero w E7 |
zasada natychmiastowa: ZAKAZ uruchamiania clear_db.js i jakiegokolwiek skryptu z katalogu głównego bez jawnego polecenia |
uzasadnienie: repozytorium ewoluowało od lutego 2026 przez wiele iteracji, przynależność plików nie jest ustalona, kasowanie na tym etapie to ryzyko bez zysku.
