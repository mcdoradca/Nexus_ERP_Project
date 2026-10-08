# ADR-0134: DQS Category Cache, Memory Resilience & AI Wrapper Recitation Shield

## Status
Zaakceptowany i Wdrożony (Status: PRODUCTION-READY)

## Kontekst i Diagnoza Problemu
W dniu 08.10.2026 potok EAN Pipeline oraz moduł PIM zaczęły notorycznie zawieszać się i zwracać błędy `502 Bad Gateway` (Nginx reverse proxy do Node.js/PM2). Jednocześnie agenci potoku doświadczali niespodziewanych awarii.

Dogłębna analiza empiryczna logów systemowych (`pm2 logs nexus`) oraz telemetrii V8 wykazała dwie współistniejące przyczyny źródłowe:

1. **V8 Heap Out-of-Memory (502 Bad Gateway):**
   - Endpoint `GET /api/products` (wywoływany automatycznie przed i po uruchomieniu optymalizacji produktu) pobierał 245 produktów wraz z relacją `allegroCategory: true`.
   - Każda kategoria zawierała w bazie danych Supabase pełny słownik `parameters: Json` (średnio 141 KB na kategorię).
   - W połączeniu ze 198 produktami ze zarchiwizowanymi obrazami Base64 w polu `imageUrl`, zapytanie generowało **264 MB surowego JSON-a** i alokowało jednorazowo **1388 MB pamięci sterty V8** (czas trwania: 18–26s).
   - Przy dwóch równoległych żądaniach pamięć sterty przekraczała limit 2 GB, co powodowało awarię Node.js: `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` i wygenerowanie błędu `502 Bad Gateway` przez Nginx.
   - Dodatkowo middleware diagnostyczny w `src/server.js` przetrzymywał `res.locals.body = body` w pamięci RAM i używał blokującego `fs.appendFileSync`.

2. **Nieobsługiwany FinishReason: RECITATION w Agencie 5:**
   - W `src/modules/offer-optimizer-v2/ai.wrapper.js` (linia 357) bezwarunkowy wyjątek `throw new Error('BLOKADA RECITATION...')` ubijał potok na Agencie 5, gdy model cytował przepisy CLP/GPSR, mimo że poprawnie wygenerowany JSON znajdował się w strukturze `candidate.content.parts`.

## Wdrożone Rozwiązania Architektoniczne

### 1. Optymalizacja Selekcji Danych w `GET /api/products` (`src/server.js`)
- Zmieniono pobieranie relacji kategorii z `allegroCategory: true` na:
  ```javascript
  allegroCategoryId: true,
  allegroCategory: {
      select: { id: true, name: true }
  }
  ```
- Wyeliminowano przesyłanie 35+ MB definicji formularzy kategorii, których widok listy produktów w frontendzie nie używa (edycja parametrów kategorii pobiera schemat na żądanie przez `/api/categories/:id`).

### 2. In-Memory Cache z In-Flight Coalescing dla DQS (`src/modules/mdm/mdm.service.js`)
- Funkcja `calculateProductDQS` weryfikuje wymagane parametry Allegro.
- Wdrożono dedykowany `categoryRequiredParamsCache` (TTL: 1h) przechowujący wyłącznie zminimalizowaną listę `{ id, name }` wymaganych parametrów dla 46 unikalnych kategorii zamiast gigantycznych surowych obiektów API Allegro.
- Zaimplementowano **In-Flight Promise Coalescing** (`categoryInFlightPromises`), który zapobiega efektowi *Thundering Herd* podczas pierwszego startu serwera (zamiast 245 zapytań SQL do bazy w ułamku sekundy, wykonywane jest dokładnie 1 zapytanie per unikalna kategoria).
- Po rozgrzaniu cache czas ewaluacji DQS dla całego katalogu wynosi **2–8 ms** (poprawa o 99.9%).

### 3. Asynchroniczny Logger Bezwypływowy (`src/server.js`)
- Zastąpiono synchroniczny `fs.appendFileSync` nieblokującym `fs.appendFile`.
- Usunięto buforowanie pełnego ciała odpowiedzi (`res.locals.body = body`), pozostawiając jedynie bezpieczny substring (max 1000 znaków) dla odpowiedzi o kodzie błędu `>= 400`.

### 4. Tarcza Defensywna RECITATION w AI Wrapper (`src/modules/offer-optimizer-v2/ai.wrapper.js`)
- W Standard Path wdrożono kaskadowe odzyskiwanie tekstu za pomocą `extractGroundedTextFromResponse(response, agentId)`.
- Gdy model zwraca `finishReason: 'RECITATION'`, system w pierwszej kolejności penetruje `candidate.content.parts`. Jeśli wygenerowana treść jest poprawna i kompletna (np. deklaracje składników, kody CLP), potok kontynuuje pracę bez awarii z ostrzeżeniem w logach i poprawną telemetrią.

## Weryfikacja Empiryczna i Pomiary
- **Pamięć sterty V8 (Heap):** spadek z **1403.1 MB** do **308–436 MB** podczas pełnego cyklu zimnego startu katalogu.
- **Czas wykonania pobrania i ewaluacji DQS (245 produktów):**
  - Przed zmianą: 18 000 – 26 000 ms (ryzyko OOM crash).
  - Po zmianie (zimny start): 2 841 ms (baza) + 396 ms (DQS) = ~3 200 ms.
  - Po zmianie (ciepły cache): ewaluacja DQS trwa **2 ms**.
- **Wielkość payloadu JSON:** redukcja o **162 MB**.
- **Testy regresyjne:** 155/155 testów zdanych w 100% (`node --test src/modules/offer-optimizer-v2/tests/*.test.js`).
