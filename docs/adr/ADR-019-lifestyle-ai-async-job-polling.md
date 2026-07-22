# ADR-019: Asynchroniczny Potok Generowania Obrazów Lifestyle AI (Eliminacja HTTP 504)

## Status
Przyjęty (Accepted)

## Kontekst i Problem
W module Offer Optimizer / EAN Pipeline, przycisk "✨ Wygeneruj Lifestyle AI" umożliwia tworzenie profesjonalnych scenerii 3D produktów z wykorzystaniem Claid API oraz autorskiego modułu wypalania cieni wektorowych (Sharp Node.js). 

Dotychczasowe wykonanie tego procesu odbywało się synchronicznie w ramach pojedynczego zapytania HTTP POST `/api/offer-optimizer/generate-lifestyle`. Całkowity czas obróbki (upload Base64 -> Gemini prompter -> Claid background removal -> Sharp shadow baking -> Claid scene creation -> EU AI Act metadata tagger) wynosił od 45 do 120 sekund.

Ze względu na sztywne limity czasowe w przeglądarkach, skryptach rozszerzeń (message channel timeout) oraz serwerach proxy/CDN (Cloudflare/Nginx), synchroniczne połączenie było zrywane błędem `HTTP 504 Gateway Time-out` lub `message channel closed before a response was received`. Wcześniejsze próby podniesienia limitu czasu odpowiedzi w Nginx (`proxy_read_timeout 600s`) nie rozwiązały problemu, ponieważ przeglądarki i CDN odrzucały połączenie niezależnie od konfiguracji backendu.

## Podjęte Decyzje Architektoniczne

1. **Wzorzec Asynchronous Task & Polling dla Lifestyle AI:**
   - **Backend (`POST /api/offer-optimizer/generate-lifestyle`):** Endpoint został przebudowany na asynchroniczny. Po weryfikacji parametrów wejściowych generowany jest unikalny identyfikator zlecenia `jobId` (`lifestyle_[timestamp]_[hash]`), rejestrowany w podręcznym magazynie pamięci RAM `lifestyleJobsMap`, po czym serwer natychmiast zwraca status `HTTP 202 Accepted` z identyfikatorem zlecenia.
   - **Wykonanie w tle:** Proces generowania obrazów (Claid API + Sharp) uruchamia się nieblokująco w tle procesera Node.js.
   - **Endpoint Statusowy (`GET /api/offer-optimizer/generate-lifestyle/status/:jobId`):** Służy do odpytywania o stan zlecenia (`PROCESSING`, `COMPLETED` z wynikiem Base64 i raportem trendów wizualnych, lub `ERROR` z opisem awarii).
   - **Zarządzanie Pamięcią i TTL:** Dla ochrony pamięci RAM serwera Node.js (PM2), zlecenia w magazynie `lifestyleJobsMap` posiadają 15-minutowy czas życia (TTL), po którym są automatycznie usuwane z pamięci przez wyzwalacz interwałowy.

2. **Obsługa Pollingu we Frontendzie (`PhotographicAuditorCard.jsx`):**
   - Po odebraniu odpowiedzi HTTP 202 z `jobId`, interfejs użytkownika rozpoczyna bezpieczne odpytywanie endpointu statusowego co 3 sekundy.
   - Maksymalny czas oczekiwania w pętli wynosi 180 sekund (60 prób).
   - W przypadku niepowodzenia lub błędu Claid API, komunikat o błędzie przekazywany jest bezpośrednio użytkownikowi bez wywracania interfejsu.

## Konsekwencje
- **Dostępność i Stabilność:** Całkowite wyeliminowanie błędów HTTP 504 Gateway Time-out oraz zrywania skryptów interfejsu przy generowaniu zdjęć Lifestyle AI.
- **Skalowalność:** Serwer nie przetrzymuje otwartych gniazd HTTP socket przez długie minuty, co redukuje zużycie zasobów sieciowych.
- **Lepszy UX:** Użytkownik widzi płynny wskaźnik generowania w czasie gdy zadanie liczy się w tle.
