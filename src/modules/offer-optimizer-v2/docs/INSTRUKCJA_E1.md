INSTRUKCJA_E1 — SZKIELET V2 (jedna sesja = ten etap, OP-8)
0. PROTOKÓŁ KOMUNIKACJI (obowiązuje od teraz)

Wynik pracy raportujesz WYŁĄCZNIE plikiem docs/RAPORT_E1.md (commitowanym razem z kodem etapu). W czacie podajesz tylko: "RAPORT_E1.md gotowy, commit <hash>". Raport zawiera: zakres z referencjami plik:linia, surowe git diff --stat + git log --oneline -3, wpisy DECISION_LOG, TODO/HITL, czego nie zweryfikowano. Zakaz przeklejania treści handoffu i instrukcji do raportu.

1. PORZĄDKI (przed kodem)

a) Usuń src/modules/offer-optimizer/files (2).zip i katalog files (2)/ (duplikaty — decyzja operatora §9).
b) git add src/modules/offer-optimizer/files/MASTER_HANDOFF_OFFER_OPTIMIZER_V2.md (dokument kanoniczny pod kontrolę wersji).
c) Do docs/DECISION_LOG.md wpisz decyzje architekta: (1) /regenerate-title → endpoint kompatybilnościowy z tytułem derywowanym z h1/s1+PIM, bez Agenta 3, implementacja E4; (2) string modelu Pro = adaptacja wg pkt 2 poniżej.

2. BRAMKA API (blokująca — bez jej zaliczenia ZAKAZ pisania kodu)

Uzupełnij WERYFIKACJA_API_V2.md o: (a) konkretną wersję @google/genai (numer z npm/registry, z linkiem); (b) poprawny link do oficjalnego repozytorium SDK — poprzedni link był błędny; (c) rozstrzygnięcie stringów modeli z linkami do oficjalnej listy: czy istnieje gemini-3.1-pro (pakiet v4.1) czy aktualny jest inny string klasy Pro; wynik mapowania wpisz do DECISION_LOG w formacie z żelaznej zasady 2. Inwariant S-4 nienaruszalny: A5 = klasa Pro, thinkingLevel HIGH, niezależnie od stringa.

3. SZKIELET (zakres dokładnie wg MASTER_HANDOFF §6/E1)

a) Struktura src/modules/offer-optimizer-v2/ (bez dotykania starego modułu — OP-2).
b) Klient @google/genai (OP-3: zero kopiowania ze starego ai.service.js).
c) Konfiguracja per węzeł: model + thinkingLevel wg §3A handoffu (A1/A2/A4/A9→MINIMAL, A6/A7→LOW, A5→HIGH, A8/A10→LOW).
d) Wrapper wywołań: obowiązkowa telemetria ai.metrics.service z jawnym agentId (S-7 — wywołanie bez logowania = błąd blokujący), responseSchema + responseMimeType, odczyt pełnego usageMetadata (promptTokenCount, candidatesTokenCount, thoughtsTokenCount, totalTokenCount).
e) Składanie promptów: [blok stały wg MAPY DYSTRYBUCJI SHARED_RULES v4.1] + [dane SKU na końcu]. ŻADNEGO mechanizmu cache (OP-1).
f) Ładowanie promptów z files/ jako v4 + PATCH v4.1 — deterministyczny skrypt kompilacji z weryfikacją bajtową i licznikiem polskich diakrytyków (awaria kodowania w sesji 1). Wynik kompilacji per agent zapisany do plików, licznik diakrytyków w raporcie.

4. DoD ETAPU

Jedno wywołanie testowe węzła flash (MINIMAL) i jedno Pro (HIGH) z surowym zrzutem usageMetadata w RAPORT_E1.md — dowód thoughtsTokenCount≈0 dla MINIMAL. Commit całości. STOP — czekasz na akceptację.

5. ZAKAZY

Zakaz wykonywania E2+ (walidatorów, RAG, potoku). Zakaz zmian we frontendzie i starym module. Brak danych (klucz API, nazwa env) = // HITL: + wpis w raporcie, nie zgadywanie.   Po otrzymaniu RAPORT_E1.md wklej mi sam plik — audytuję i wydam INSTRUKCJA_E2.md.
