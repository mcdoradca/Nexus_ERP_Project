# INSTRUKCJA_E1_FIX2 — OSTATECZNE DOMKNIĘCIE E1 (bez E2)
# Lokalizacja: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E1_FIX2.md
# Wynik: docs/RAPORT_E1_FIX2.md + commit. Zakres: DOKŁADNIE §1–§4 poniżej.

## 0. KOREKTA PROCESOWA (do wpisania w raporcie, jedno zdanie każde)
a) RAPORT_E1 twierdził, że string `gemini-3.1-pro` został "potwierdzony
   w oficjalnej dokumentacji z linkami". API zwróciło 404 — tamta weryfikacja
   nie była weryfikacją. Sprostowanie do raportu.
b) Nowa zasada (decyzja Architekta, rozszerza Z-4): dostępność stringów modeli
   weryfikujemy WYŁĄCZNIE empirycznie przez ListModels na żywym API.
   Dokumentacja sieciowa służy do składni, nie do dostępności modeli.

## 1. ROZSTRZYGNIĘCIE STRINGA MODELU PRO (empirycznie)
a) Wykonaj wywołanie ListModels (`ai.models.list()` w @google/genai) i zapisz
   SUROWY output (pełna lista nazw + supportedActions/generationMethods)
   do docs/LISTMODELS_SNAPSHOT.md (z datą). To snapshot referencyjny środowiska.
b) Reguła wyboru (decyzja Architekta — stosujesz mechanicznie, bez inwencji):
   z listy wybierz modele pasujące do wzorca `gemini-*-pro*`, wspierające
   generateContent; odrzuć warianty preview/experimental, jeśli istnieje
   stabilny; wybierz NAJNOWSZĄ stabilną wersję klasy Pro.
c) Zweryfikuj empirycznie (jedno wywołanie): wybrany model przyjmuje
   thinkingConfig.thinkingLevel = HIGH bez błędu.
d) Wpis do DECISION_LOG w formacie żelaznej zasady 2:
   [data] | dokumentacja/pakiet v4.1: gemini-3.1-pro | API zwraca: <lista Pro
   z ListModels> | decyzja: <wybrany string> | ryzyko: ...
e) Zaktualizuj WERYFIKACJA_API_V2.md §2 (stringi modeli) — usuń twierdzenie
   o gemini-3.1-pro, wpisz stan faktyczny z ListModels + odnośnik do snapshotu.
f) Zaktualizuj konfigurację per węzeł w szkielecie: A5 i A10 na wybrany string
   klasy Pro. Inwariant S-4 bez zmian: A5 = klasa Pro + thinkingLevel HIGH.
   UWAGA: jeśli ListModels NIE zawiera ŻADNEGO modelu klasy Pro wspierającego
   generateContent — STOP, raport częściowy, decyzja operatora (S-4 nie
   pozwala zdegradować A5 do flash).

## 2. DoD — DRUGA POŁOWA (test Pro/HIGH)
Uruchom test_agents.js z wybranym stringiem Pro + thinkingLevel HIGH.
Do raportu: surowy JSON usageMetadata (oczekiwane thoughtsTokenCount > 0)
+ linia potwierdzenia telemetrii ai.metrics.service z agentId testowym.

## 3. DOWÓD DIAKRYTYKÓW — PORÓWNANIE ŹRÓDŁO↔KOMPILAT (brakujący element)
a) W raporcie wyjaśnij jednym zdaniem rozjazd 1800 (RAPORT_E1) vs 944
   (RAPORT_E1_FIX) — co dokładnie się zmieniło w metodzie/zawartości.
b) Tabela per plik: [suma diakrytyków ŹRÓDEŁ pliku: prompt v4 + odnośne
   punkty PATCH v4.1 + przypisane sekcje SHARED_RULES z MAPY] vs [diakrytyki
   KOMPILATU] vs [różnica]. Różnica ≠ 0 → wskaż przyczynę (np. usunięte
   linie cache zawierały diakrytyki — to legalna różnica, nazwij ją) albo
   STOP przy podejrzeniu awarii kodowania.
c) Zliczanie NIEZALEŻNYM narzędziem od kompilatora (grep/wc lub osobny
   skrypt), nie funkcją wewnątrz prompt-compiler.js — narzędzie nie może
   audytować samo siebie. Komenda + surowe outputy do raportu.

## 4. ZAMKNIĘCIE
a) Usuń z RAPORT_E1_FIX.md zdublowaną sekcję "Surowe zrzuty z Git"
   z placeholderem (higiena dokumentacji).
b) Commit: `fix(offer-optimizer-v2): E1 final — model Pro wg ListModels,
   dowod diakrytykow zrodlo-kompilat`.
c) RAPORT_E1_FIX2.md: sprostowania §0, outputy §1–§3, git diff --stat HEAD~1,
   git log --oneline -3. STOP — czekasz na akceptację Architekta.

## ZAKAZY
Zakaz pracy nad E2 (walidatory, RAG, orkiestrator). Zakaz zmian w promptach
skompilowanych poza zakresem §1f (konfiguracja, nie treść). Zakaz zmian
w starym module i frontendzie.
