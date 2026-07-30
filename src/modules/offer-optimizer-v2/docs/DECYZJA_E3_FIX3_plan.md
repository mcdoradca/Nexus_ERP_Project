# DECYZJA — AKCEPTACJA PLANU E3_FIX3 (z warunkami)
# Lokalizacja: src/modules/offer-optimizer-v2/docs/DECYZJA_E3_FIX3_plan.md
# Plan implementacyjny AKCEPTOWANY. Wykonuj wg INSTRUKCJA_E3_FIX3 + warunki
# poniżej. Zakaz pracy nad E4.

## ODPOWIEDŹ NA PYTANIE OTWARTE (Prisma)
Robisz OBA kroki:
a) `schema.prisma`: dodaj pole `entryName String?` do modelu KnowledgeDocument
   (nullable, bez default). Następnie `npx prisma generate`.
b) Kolumnę w bazie zakłada WYŁĄCZNIE SQL przez `prisma db execute`
   (jak dla sotModule/targetAgents/chunkType). ZAKAZ `migrate dev`,
   `migrate reset`, `db push`, `migrate resolve` — bez zmian.
Uzasadnienie: klient Prisma generuje się ze schematu, a schema musi
pozostać prawdą o strukturze bazy — po E7 ktoś wykona baseline historii
migracji i rozjazd schema↔baza byłby wtedy pułapką. Rozbieżność
"schema zna pole / historia migracji go nie zna" jest świadoma i już
udokumentowana w DECISION_LOG (odstępstwo od OP-6).

## WARUNEK 1 — STRUKTURA SŁOWNIKÓW PRZED IMPLEMENTACJĄ (bramka)
Zanim napiszesz ekstrakcję entryName: wklej do RAPORT_E3_FIX3.md po 10
faktycznych nagłówków wpisów z każdego z trzech plików: RAG_SOT_06,
RAG_SOT_10, INCI_i_ich_dzialanie.md. Rozstrzygnij i opisz:
- czy wpis = JEDEN składnik INCI (nagłówek to nazwa składnika), czy
- wpis = GRUPA składników (nagłówek to nazwa grupy, a nazwy składników są
  wyliczone w treści wpisu).
Jeśli wpisy są GRUPOWE: indeks nazw musi zawierać RÓWNIEŻ nazwy składników
wyliczone w treści wpisu (deterministyczny parse listy nazw wewnątrz wpisu,
bez LLM), a nie tylko nagłówek — inaczej GATE-3 będzie fałszywie zgłaszać
nieznane dla realnych składników. Regułę ekstrakcji opisz w raporcie PRZED
uruchomieniem ingestu. Wątpliwość co do formatu → STOP i pytanie, nie
zgadywanie.

## WARUNEK 2 — JEDNA FUNKCJA NORMALIZACJI
Normalizacja nazw (lowercase, trim, redukcja spacji, ujednolicenie łączników)
musi być JEDNĄ eksportowaną funkcją, używaną zarówno przy ingeście
(zapis do entryName), jak i przy lookupie. Zakaz dwóch implementacji —
rozjazd normalizacji = ciche fałszywe GATE-3. W entryName zapisujesz
wartość ZNORMALIZOWANĄ; nazwa w postaci oryginalnej zostaje w treści chunku.
Test jednostkowy normalizacji: min. 5 par wejście→oczekiwane.

## WARUNEK 3 — ZAKRES INDEKSU GATE-3
Indeks nazw dla GATE-3 budujesz z modułów SKŁADNIKOWYCH: SOT_06, SOT_10,
INCI_DICT. Moduły grupowo-kontekstowe (SOT_05 synergie, SOT_07 grupy
funkcjonalne) NIE zasilają indeksu identyfikacji składnika — służą doborowi
treści przez similarity. Jeśli w SOT_07 znajdziesz wpisy per składnik
(nie per grupa) — zgłoś jako HITL, nie dołączaj samodzielnie.

## WARUNEK 4 — DOPASOWANIE STRICT, KIERUNEK BEZPIECZNY
Lookup = dopasowanie DOKŁADNE po normalizacji. Zakaz dopasowań rozmytych,
podciągowych i "podobnych" (to właśnie one przepuściłyby 'Cybernetic
Hyaluronic Acid'). Brak dokładnego trafienia → unknownIngredients.
Fałszywe "nie znam" jest kosztem operacyjnym; fałszywe "znam" jest ryzykiem
prawnym — wybieramy pierwsze.

## WARUNEK 5 — TESTY, NIE SKRYPTY DRUKUJĄCE
Weryfikacja pokrycia indeksu i idempotencji ingestu musi mieć formę testów
node:test z ASERCJAMI (pokrycie ≥95% jako assert, identyczna liczba
rekordów po dwóch ingestach jako assert), w katalogu tests/, w tej samej
baterii co E2. Skrypty, które tylko drukują wynik, nie są dowodem — muszą
umieć zapalić się na czerwono. Skrypty operacyjne (run_*.js, ingest.js)
przenieś do scripts/ zgodnie z planem.

## POZOSTAŁE (bez zmian z INSTRUKCJA_E3_FIX3)
Idempotencja ingestu w transakcji, atomizacja wpisów słownikowych, symetria
zapytanie↔wpis, pełny re-ingest 11 plików, pomiar §4, testy §5, higiena
raportu i commitów ASCII §6, commity i raport §7. Zakaz `git push`.
STOP po raporcie — akceptacja Architekta zamyka E3.
