# ADR-017: Kompleksowa stabilizacja produkcyjna po migracji GCP → OVH VPS & EAN Pipeline

## 1. Kontekst i Problematyka
Po przeniesieniu monolitu **Nexus ERP** z infrastruktury Google Cloud Platform (GCP) na dedykowany serwer VPS w OVH (domena produkcyjna `n-e-s.it`) zaobserwowano unieruchomienie kluczowych modułów produkcyjnych, ze szczególnym uwzględnieniem **Master Agenta EAN Pipeline**, mechanizmów WebSockets oraz procesów tła (CRON).

Głęboka analiza logów i kodu źródłowego ujawniła 5 głównych przyczyn awarii:

1. **Crash serwera Node.js (Uncaught ReferenceError):**
   W pliku `src/server.js` znajdował się harmonogram CRON (`cron.schedule('0 6 * * *')`) wywołujący `sentinelService.runSentinelOptimization()`, jednak moduł `sentinelService` nie został zaimportowany na górze pliku.

2. **Problem z komunikacją Socket.IO & Nginx (Błąd 404 w polling/websocket):**
   Frontend inicjalizował połączenie Socket.IO przekazując parametr `path: '/api/socket.io'`. Nginx kierował zapytania z prefiksem `/api/` do ogólnego proxy API, usuwając flagi nagłówków WebSocket i powodując zwroty `404 Not Found` dla transportu pollingowego oraz zapętlenie reconnectów w przeglądarce.

3. **Przedwczesne zakończenie EAN Pipeline (2 sekundy zamiast ~60 sekund):**
   Gdy użytkownik wywoływał analizę EAN, controller zwracał odpowiedź 202 (`processing`), jednak nie resetował flagi stanu w bazie. Jeśli produkt miał stary obiekt `offerDraft` z poprzednich uruchomień, mechanizm HTTP Polling (`checkPipelineStatus`) natychmiast wykrywał istniejący obiekt i zwracał `status: COMPLETE` po 1-2 sekundach, przerywając oczekiwanie na frontendzie przed zakończeniem prac agentów AI.

4. **Niezgodność struktury danych (Pusty interfejs PIM / Offer Optimizer):**
   Endpoint `checkPipelineStatus` zwracał spłaszczony obiekt `{ ...product.offerDraft, ean }`. Frontend (`OfferOptimizerView.jsx`) oczekiwał pełnego obiektu produktu zawierającego podpięte pole `finalDraft` (`{ ...product, finalDraft: product.offerDraft }`). W efekcie wszystkie zmienne stanowe (tytuł, sekcje opisu HTML `opis1`-`opis5`, parametry PIM, audyt prawny WE 1223/2009 i karty Vision AI) przyjmowały wartość `undefined`.

5. **Błąd Walidacji Prisma ORM (Argument `sku` is missing):**
   Model `Product` w `schema.prisma` definiuje pole `sku` jako wymagane (`sku String @unique`). W próbie wymuszenia flagi `status: 'PROCESSING'` użyto `prisma.product.upsert` z niepełną sekcją `create`, co wywoływało wyjątek HTTP 500 `PrismaClientValidationError`.

---

## 2. Podjęte Decyzje Architektoniczne i Naprawcze

### A. Poprawa Serwera Głównodowodzącego (`src/server.js`)
- **Importy & Tarcze Błędów:** Zaimportowano moduł `sentinelService` i owrapowano wywołanie CRON w blok `try-catch`.
- **Restrykcje CORS:** Zaktualizowano `allowedOrigins` na domeny produkcyjne (`https://n-e-s.it`, `http://n-e-s.it`, `https://www.n-e-s.it`) oraz usunięto dziką kartę bypassu (`callback(null, true)`).
- **Czyszczenie Route'ów:** Usunięto zduplikowany handler `/api/health` oraz zduplikowaną, niechronioną definicję `/api/allegro-sentinel/trigger`.

### B. Dedykowane Proxy Nginx dla WebSockets (`nginx-https.tpl`, `nginx.conf`)
- Dodano dedykowaną regułę dla ścieżki `/api/socket.io/`:
  ```nginx
  location /api/socket.io/ {
      proxy_pass http://backend:3001/api/socket.io/;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_read_timeout 86400s;
      proxy_send_timeout 86400s;
  }
  ```
- W backendzie (`src/core/socket.js`) ustawiono `path: '/api/socket.io'` oraz uelastyczniono pobieranie tokenu JWT z `handshake.auth.token` lub `handshake.query.token`.

### C. Zabezpieczenie Stanu i Śledzenia Potoku EAN Pipeline (`offer-optimizer.controller.js`)
- **Flagowanie Stanu Przetwarzania:** 
  W przypadku istniejącego produktu controller wykonuje `prisma.product.update` z flagą `offerDraft: { status: 'PROCESSING', startedAt: Date.now() }`.
- **Obsługa Nowych Produktów:** 
  Jeśli produkt nie istnieje jeszcze w bazie (tworzy go `EanPipelineService` pobierając dane z BaseLinkera), `checkPipelineStatus` zwraca status `PROCESSING` zamiast 404, co utrzymuje frontend w trybie oczekiwania.
- **Ujednolicenie Obiektu Wynikowego:** 
  Zarówno emisja WebSockets, jak i odpowiedź HTTP Polling zwracają pełny obiekt zsynchronizowany z frontendem:
  ```javascript
  const result = {
      ...product,
      finalDraft: product.offerDraft
  };
  ```

---

## 3. Instrukcja i Playbook Diagnostyczny dla Agentów (Troubleshooting Guide)

Jeśli w przyszłości wystąpią podobne objawy, kolejni agenci Swarm powinni postępować według poniższej procedury:

### 🚨 Scenariusz 1: Frontend pokazuje błędy 404 / polling reconnect dla Socket.IO
1. Sprawdź, jaka ścieżka (`path`) jest ustawiona przy tworzeniu klienta w React (`io(API_URL, { path: ... })`).
2. Upewnij się, że serwer Socket.IO w Node.js (`src/core/socket.js`) ma zdefiniowaną TĘ SAMĄ ścieżkę w opcji `new Server(server, { path: ... })`.
3. Sprawdź pliki konfiguracyjne Nginx (`/etc/nginx/sites-available/` lub szablony w repozytorium). Upewnij się, że istnieje bloki `location /api/socket.io/` zawierające `proxy_set_header Upgrade $http_upgrade;` oraz `proxy_set_header Connection "upgrade";`.

### 🚨 Scenariusz 2: EAN Pipeline kończy się po kilku sekundach lub wyświetla puste dane
1. Sprawdź logi backendu PM2 (`pm2 logs nexus --lines 100`).
2. Sprawdź, czy `checkPipelineStatus` w `offer-optimizer.controller.js` nie zwraca statusu `COMPLETE` dla produktów mających obiekty tymczasowe/przestarzałe. Upewnij się, że flaga `status: 'PROCESSING'` jest respektowana.
3. Zweryfikuj strukturę zwracaną do frontendu: `res` musi zawierać pola słownikowe (`features`, `weight`, `sku`, `brandId`) ORAZ podobiekt `finalDraft` zawierający `title`, `htmlContent` (`opis1`-`opis5`), `complianceReport` i `images`.

### 🚨 Scenariusz 3: Błędy Prisma 500 z komunikatem missing required fields
1. Pamiętaj, że model `Product` w `schema.prisma` wymaga pól `ean`, `sku` oraz `brandId` przy operacji `create`.
2. Nigdy nie stosuj `prisma.product.upsert` podając jedynie częściowe dane! Używaj `findUnique` + `update` dla istniejących rekordów, a tworzenie nowych powierzaj dedykowanemu serwisowi synchronizującemu z BaseLinkerem (`EanPipelineService`).

---

## 4. Status
**Zaakceptowane, wdrożone i zweryfikowane na środowisku produkcyjnym OVH VPS (`n-e-s.it`).**
