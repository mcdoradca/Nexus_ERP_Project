# ADR-016: Strategia Stagingu i Bezpieczeństwa CI/CD (Testy, Backupy, Branching)

## Kontekst
Modyfikacje na żywym kodzie (np. podczas dodawania nowych modułów) niosły ryzyko uszkodzenia działającej aplikacji produkcyjnej `n-e-s.it`, która jest użytkowana przez klientów. Błąd składniowy wyłapywany był przez wcześniejszy workflow GitHub Actions, ale błędy logiczne i uszkodzenia bazy danych mogły przedostać się na produkcję ze względu na wprowadzanie zmian wprost do gałęzi `main`.

## Decyzja
W celu zapobiegania awariom wprowadzono trzy-warstwowy system bezpieczeństwa (Standard Produkcyjny):
1. **Rozdzielenie Środowisk (Staging i Production)**
   - Wprowadzono nową subdomenę `staging.n-e-s.it` obsługiwaną przez instancję PM2 `nexus-staging` operującą na osobnym katalogu i porcie `3002`.
   - Zmiany są początkowo publikowane na gałęzi `dev`, z której akcja `staging-deploy.yml` rzuca kod na instancję Staging.
2. **Kopie Zapasowe Przed Migracją**
   - Dodano w workflow krok, który automatycznie eksportuje bieżącą bazę danych bezpośrednio przed uruchomieniem jakichkolwiek modyfikacji struktury bazy (`npx prisma db push`), aby zabezpieczyć się na wypadek korupcji danych.
3. **Automatyczne Testy (Continuous Integration)**
   - Wdrożono ramy testowe za pomocą narzędzi testowych (np. Jest), które są odpalane automatycznie. Jeśli testy lub kompilacja (build) weryfikacyjna frontendu/backendu się nie powiodą, GitHub Actions odrzuci wdrożenie. 
   - Restrykcja: Brak bezpośrednich commitów do `main`. Główna gałąź musi odzwierciedlać jedynie stabilny, poprawnie przetestowany kod.

## Status
Zaakceptowane. W trakcie wdrożenia.

## Konsekwencje
### Pozytywne
- Niemalże wyeliminowanie ryzyka wysypania produkcji przez tzw. czeski błąd.
- Posiadanie gotowego środowiska testowego, na którym można eksperymentować bez zaburzania procesów sprzedażowych/biznesowych.
- Spokój zespołu; proces decyzyjny przed przejściem na główną domenę wymaga celowego potwierdzenia i weryfikacji.

### Negatywne / Trudności
- Spowolnienie wprowadzania "drobnych, szybkich fixów".
- Konieczność dbania o synchronizację gałęzi `main` i `dev`.
- Konieczność systematycznego dopisywania testów do nowych modułów.
