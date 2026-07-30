# [PLAN DZIAŁANIA] ZADANIE 13-E4a

## Krok 1 — walidacja sensowności `eu_responsible_person`
1. Zaimplementowanie w `validators/index.js` funkcji `validate_eu_responsible_person` do oceny poprawności teleadresowej podmiotu odpowiedzialnego (bez zawierzania deklaracji modelu LLM).
2. Egzekucja ograniczeń długości: `name` <= 200, `address_eu` <= 250, `contact` <= 250 znaków. 
3. Wdrożenie rygorów znakowych: brak znaku nowej linii w `name` oraz `address_eu`, wymóg przynajmniej jednej cyfry w `address_eu`, wymóg posiadania znaku `@` lub fragmentu `http` w `contact` i jednocześnie zakaz występowania `@` / `http` w `name`.
4. Sprawdzenie krzyżowe zduplikowanych uciętych stringów (wykrycie, gdy `name` w pełni duplikuje `address_eu` lub `contact`).
5. Dodanie wywołania tej funkcji w module `orchestrator.js`. Niespełnienie któregokolwiek warunku zatrzyma węzeł ze statusem `HALTED_HITL_REQUIRED` i błędem `MALFORMED_EU_RESPONSIBLE_PERSON` (zachowując jednocześnie sam wadliwy blok z odpowiedzią modelu jako dowód dla HITL).
6. Pokrycie zmian w `tests/validators.test.js` dla dwóch dodatkowych przypadków jednostkowych (puste pole oraz wpis przekraczający limit tekstu).

## Krok 2 — filtr źródeł zakazanych (P3)
1. Utworzenie wejściowej listy zakazanych domen (wraz z wildcardami `*`) w pliku konfiguracyjnym projektu (`config/nodes.config.js`).
2. Rozbudowa orkiestratora (`orchestrator.js`) na wyjściu z A1 o rutynę filtrującą i wycinającą niedozwolone strony (m.in. allegro, empik, ebay, amazon) ze zmiennej `research_sources_used`.
3. Dodanie ostrzeżeń do globalnej zmiennej maszyny stanu `normalization_warnings` wraz z wylistowaniem usuniętych domen, oraz dodatkowego ostrzeżenia w stanie maszyny `NO_P1_SOURCE`, jeśli finalny wektor źródeł po wyczyszczeniu okaże się całkowicie pusty.

## Krok 3 & 4 — Domknięcie Commit-u i Przebieg E4a dla EAN
1. Zbudowanie pakietu commita za pomocą terminala. Dodanie do Git ręcznie plików wymienionych z logów statusu, z uwzględnieniem poprawek z kroków powyższych. Uniknięcie dyrektywy `add -A`.
2. Przygotowanie ostatecznego Raportu i wyłuszczenie podwójnej historii tych samych tytułów w logach Gita, jako błędu narzędzia przy wywoływaniu złej ścieżki (co utworzyło podwójny snapshot, najpierw pusty, potem pełny).
3. Wykonanie przebiegu w środowisku node za pomocą `npm test`.
4. Uruchomienie potoku maszyny stanu (`node scripts/test_orchestrator.js`) dla obiektu kontrolnego (EAN: `8000137015436`) celem zgromadzenia tokenów oraz wyników odfiltrowanego wyjścia, co zakończy podetap E4a. Zapis rezultatu w `RAPORT_13_E4a_sanity_zrodla_commit.md`.
