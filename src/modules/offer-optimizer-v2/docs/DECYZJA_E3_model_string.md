# DECYZJA_E3 — STRING MODELU W KOMPILATACH + WZNOWIENIE POTOKU
# Lokalizacja: src/modules/offer-optimizer-v2/docs/DECYZJA_E3_model_string.md
# Rozstrzyga STOP z INSTRUKCJA_E3_WZNOWIENIE v2 §2a. Po wykonaniu §1–§2
# poniżej WRACASZ do INSTRUKCJA_E3_WZNOWIENIE v2 §4–§7 i kończysz etap.

## 0. DIAGNOZA (przyczyna, nie objaw)
Twoja hipoteza ("operator użył starego narzędzia") jest NIEPRAWDZIWA.
Fakty: pliki prompts/Agent_*_compiled.md są ARTEFAKTEM GENEROWANYM ze źródeł
w docs/ (Agent_X_prompt_v4.md + PATCH v4.1). W E1_FIX2 string modelu został
wpisany RĘCZNIE do plików skompilowanych, a nie do źródła. W E2_FIX nastąpiła
rekompilacja (zmiana ścieżek) — kompilator odtworzył pliki ze źródła i ręczna
poprawka zniknęła. To nie regresja operatora, to skutek edytowania pliku
generowanego. Błąd projektowy po stronie Architekta (E1), nie Twój.

## 1. DECYZJA ARCHITEKTA — JEDNO ŹRÓDŁO PRAWDY DLA PARAMETRÓW WYWOŁANIA
Zasada: **model i poziom myślenia NIE występują w treści promptu.** To
parametry wywołania API, ich jedynym miejscem jest konfiguracja w kodzie.
Prompt zawiera wyłącznie treść merytoryczną (rola, dyrektywy, reguły, wyjście).

a) KOMPILATOR: dodaj do prompt-compiler.js usuwanie z nagłówków linii
   dotyczących parametrów wywołania — analogicznie do już usuwanych linii
   o cache. Wzorce do wycięcia (całe linie komentarza nagłówkowego):
   zawierające "Wywołanie:", "thinkingBudget", "thinkingLevel",
   "responseSchema poza promptem", "grounding: ON/OFF" — o ile występują
   w bloku komentarzy `#` na początku pliku źródłowego. Treść merytoryczna
   promptu (sekcje ROLA, DYREKTYWY, SKANERY, WYJŚCIE, bloki wejściowe)
   pozostaje NIETKNIĘTA — zakaz jakiejkolwiek innej ingerencji w treść.
b) PLIKI ŹRÓDŁOWE W docs/ POZOSTAJĄ BEZ ZMIAN (read-only, S-6/zasada 3).
   Nie poprawiaj w nich stringów modeli — kompilator je pomija.
c) REKOMPILACJA: przegeneruj WSZYSTKIE 9 kompilatów (A1, A2, A4, A5, A6,
   A7, A8, A9, A10) od zera. Zakaz ręcznej edycji plików w prompts/ —
   od teraz to katalog artefaktów generowanych.
d) WERYFIKACJA (obowiązkowa, surowe outputy do raportu):
   - `grep -ri "gemini" src/modules/offer-optimizer-v2/prompts/` → 0 trafień,
   - `grep -ri "thinking" src/modules/offer-optimizer-v2/prompts/` → 0 trafień,
   - `grep -ri "cache" src/modules/offer-optimizer-v2/prompts/` → 0 trafień.
e) KONFIGURACJA WĘZŁÓW = JEDYNE MIEJSCE STRINGÓW: potwierdź odczytem
   plik:linia, gdzie w szkielecie v2 (z E1) leży mapa węzeł → {model,
   thinkingLevel}, i że zawiera: A1/A2/A4/A9 → MINIMAL, A6/A7 → LOW,
   A5 → HIGH, A8/A10 → LOW oraz string Pro = gemini-3.1-pro-preview dla
   A5 i A10, flash dla pozostałych. Jeśli takiej pojedynczej mapy nie ma
   (stringi rozsiane po kodzie) — utwórz config/nodes.config.js jako jedyne
   źródło i podepnij go do wrappera. Zakaz duplikowania stringów gdziekolwiek.
f) ZABEZPIECZENIE PRZED REGRESJĄ: dodaj test jednostkowy (node:test):
   (1) żaden plik w prompts/ nie zawiera stringa "gemini" ani "thinking";
   (2) config zwraca dla A5 model klasy Pro i thinkingLevel HIGH (inwariant
   S-4). Test wpada do istniejącej baterii z E2.
g) DIAKRYTYKI: usunięcie linii nagłówkowych zmieni liczniki z RAPORT_E1_FIX2.
   Przelicz tabelę (audit_diacritics.js) i w raporcie podaj nowe wartości
   z adnotacją "różnica = wycięte linie parametrów wywołania" — to legalna
   zmiana, nie awaria kodowania.
h) DECISION_LOG: [data] | dokumentacja: nagłówki promptów v4 zawierają model
   i thinkingBudget | rzeczywistość: kompilat jest artefaktem generowanym,
   ręczna edycja ginie przy rekompilacji; thinkingBudget = legacy (obowiązuje
   thinkingLevel wg §3A) | decyzja Architekta: parametry wywołania wyłącznie
   w konfiguracji kodu, kompilator wycina je z nagłówków, prompts/ = katalog
   generowany (zakaz edycji ręcznej) | ryzyko: brak — test z pkt f pilnuje.

## 2. DOMKNIĘCIE PORZĄDKÓW REPO (reszta §2 z INSTRUKCJA_E3_WZNOWIENIE v2)
a) MASTER_HANDOFF (modified) = aktualizacja §9 przez operatora — commituj
   bez zmian treści.
b) strip_bom.js i verify_hashes.js → przenieś do
   src/modules/offer-optimizer-v2/tools/ i commituj. append2.js — wyjaśnij
   jednym zdaniem, czym jest; artefakt jednorazowy usuń.
c) Untracked dokumentacja etapów (INSTRUKCJA_E2*, INSTRUKCJA_E3*, RAPORT_E2*,
   RAPORT_E3, DECYZJA_E3) → commituj do docs/.
d) Pliki SOT (RAG_SOT_01…10 + INCI_i_ich_dzialanie.md) → commituj do docs/
   BEZ zmian treści i bez zmiany nazw (spacje i diakrytyki w nazwach
   pozostają — obsługa w kodzie, nie renaming).
e) Dwa pliki poza pakietem ("PLAYBOOK AGENTA 8 — SSOT 6.0",
   Wytyczne_AI_Opisy_Produktow_i_Allegro_2026_V2.md): commituj jako
   dokumentację, NIE ingestuj do RAG, nie klasyfikuj samodzielnie —
   klasyfikacja Architekta przyjdzie osobnym dokumentem przy starcie E4.
Commit: `chore(offer-optimizer-v2): porzadki repo + kompilaty bez parametrow
wywolania`.

## 3. WZNOWIENIE
Po §1–§2 wracasz do INSTRUKCJA_E3_WZNOWIENIE v2 i wykonujesz §4 (migracja
addytywna przez db execute), §5 (ingest SOT z jawną tabelą mapowania
plik→sotModule), §6 (testy retrieval + porównanie list bramkowych), §7
(zamknięcie). Bez przystanków; STOP tylko przy NOWEJ rozbieżności albo na
końcu etapu z finalnym RAPORT_E3.md. Zakaz `git push`. Zakaz pracy nad E4.
