# INSTRUKCJA_E1_FIX — DOMKNIĘCIE ETAPU E1 (bez E2)
# Lokalizacja docelowa: src/modules/offer-optimizer-v2/docs/INSTRUKCJA_E1_FIX.md
# Wynik pracy: docs/RAPORT_E1_FIX.md + commit. Zakaz jakiejkolwiek pracy nad E2.

## 0. KOREKTA PROCESOWA
W RAPORT_E1 powołano się na nieistniejącą regułę ("Z-2: globalny zakaz
instalowania nowych zależności"). Prawdziwe Z-2 = jedna wiadomość, jedno zadanie.
Cytowanie reguł spoza dokumentacji = dryf (Z-7). W RAPORT_E1_FIX.md wpisz
sprostowanie jednym zdaniem.

## 1. INSTALACJA SDK (autoryzacja Architekta)
`npm install @google/genai` — zainstaluj wersję zweryfikowaną w
WERYFIKACJA_API_V2.md (2.14.0 lub nowszą z tej samej linii). Instalacja
zależności wymaganych zakresem etapu jest częścią etapu i nie wymaga osobnej
zgody. Do RAPORT_E1_FIX.md wpisz wersję z `package.json` oraz surowy output
`npm ls @google/genai`.

## 2. NAPRAWA KOMPILACJI PROMPTÓW
a) Usuń `prompts/Agent_0_compiled.md` — Node 0 to kod, nie prompt LLM
   (Agent_0_prompt_v4.md = spec implementacyjny orkiestratora).
b) Skompiluj brakujące:
   - `Agent_2_compiled.md` (źródło: Agent_2_prompt_v4.md; PATCH v4.1 nie
     zawiera zmian dla A2),
   - `Agent_8_compiled.md` (źródło: Agent_8_prompt_v4.md — plik sam jest już
     w wersji 4.1; patch nie dotyczy).
c) Zweryfikuj i opisz w raporcie, co DOKŁADNIE zawiera każdy plik skompilowany:
   [prompt v4 + patch v4.1 nałożony punkt po punkcie] + [wyłącznie sekcje
   SHARED_RULES v4.1 przypisane węzłowi w MAPIE DYSTRYBUCJI]:
   A1: §I | A2: brak | A4: §B §C §I §J | A5: §D §E §F | A6: §A §B §C §J |
   A7: §A §B §C §H §J | A8: §G | A9: §G | A10: §D §E §F §J.
   Jeśli kompilator wklejał inne sekcje lub całość SHARED_RULES — napraw
   kompilator i przekompiluj WSZYSTKIE prompty od nowa.
d) Usuń z kompilatów linie nagłówkowe o cache ("Cache prefiksu: TAK" itp.) —
   martwe dyrektywy po decyzji OP-1. Potwierdź grepem:
   `grep -ri "cache" src/modules/offer-optimizer-v2/prompts/`
   → oczekiwane 0 trafień; surowy output do raportu.

## 3. DOWÓD DIAKRYTYKÓW (per plik, z metodą)
Do RAPORT_E1_FIX.md tabela: plik skompilowany → liczba znaków
[ąćęłńóśżźĄĆĘŁŃÓŚŻŹ] → suma. Podaj dokładną komendę użytą do zliczenia
(np. `grep -o '[ąćęłńóśżźĄĆĘŁŃÓŚŻŹ]' plik | wc -l`).
Dla każdego pliku porównaj liczbę diakrytyków w źródłach (prompt v4 +
odnośne fragmenty PATCH v4.1 + przypisane sekcje SHARED_RULES) z kompilatem.
Rozjazd = błąd kodowania → STOP i raport, bez prób "naprawiania" treści.

## 4. DoD ETAPU (bez zmian względem INSTRUKCJA_E1 §4)
Warunek wstępny: operator umieścił GEMINI_API_KEY w `.env`.
Uruchom `test_agents.js`:
- jedno wywołanie modelu flash z thinkingLevel MINIMAL,
- jedno wywołanie gemini-3.1-pro z thinkingLevel HIGH.
Do RAPORT_E1_FIX.md wklej surowy JSON `usageMetadata` obu wywołań
(dowód: thoughtsTokenCount ≈ 0 dla MINIMAL, > 0 dla HIGH) oraz potwierdzenie
wpisów w ai.metrics.service z testowymi agentId.
Jeśli klucza nadal brak w `.env` — STOP po punkcie 3 i raport częściowy
z adnotacją HITL; zakaz zmyślania wyników.

## 5. ZAMKNIĘCIE
Commit: `fix(offer-optimizer-v2): E1 domknięcie — SDK, kompilaty A2/A8, dowody`.
RAPORT_E1_FIX.md zawiera: zakres z referencjami plik:linia, sprostowanie z §0,
outputy z §1–§4, wpisy DECISION_LOG (jeśli były adaptacje), surowe
`git diff --stat HEAD~1` i `git log --oneline -3`.
Po commicie: STOP — czekasz na akceptację Architekta.
