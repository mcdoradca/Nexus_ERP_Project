# ADR-0192: Architektura Multi-Workspace, Zunifikowany Skarbiec Kluczy AES-256-GCM+AAD i Izolacja Kanałów Sprzedaży

**Status:** Zaakceptowane i wdrożone  
**Data:** 2026-11-22  
**Zakres:** PIM, Offer Optimizer V2, BaseLinker, Allegro REST API, InPost Von Halsky API, RMA, Analityka i Telemetria AI

---

## 1. Kontekst i Problem Biznesowy
System Nexus ERP działał dotychczas w modelu pojedynczego tenanta (`SystemSetting` z globalnymi kluczami `BASELINKER_TOKEN`, `ALLEGRO_ACCOUNTS_VAULT`, `VONHALSKY_CONFIG_VAULT` oraz globalnymi indeksami `Product.ean`, `Product.sku`, `Product.subiektId`, `Product.baselinkerId`, `CustomerRiskProfile.allegroLogin`, `ReturnRecord.baselinkerId`). Obsługa do ~10 niezależnych klientów przez jednego operatora `ADMIN` wymagała pełnej izolacji danych produktowych (ten sam kod EAN lub SKU może występować równolegle u wielu klientów), zwrotów RMA oraz poświadczeń API kanałów zewnętrznych (**BaseLinker**, **Allegro**, **InPost Von Halsky**) bez ryzyka cichego fallbacku lub przypadkowego eksportu na konto innego klienta.

## 2. Podjęta Decyzja Architektoniczna

### 2.1. Warstwa Danych i Migracja Zero-Data-Loss (`prisma/schema.prisma`, `prisma/scripts/migrate-multi-workspace.js`)
- Dodano modele:
  - `Workspace` (`id`, `slug` `@unique`, `name`, `badgeColor`, `isDefault`, `isActive`, `settings`).
  - `IntegrationAccount` (`id`, `workspaceId`, `provider` `'BASELINKER'|'ALLEGRO'|'VONHALSKY'`, `label`, `externalAccountId`, `environment`, `isDefault`, `isActive`, `credentialsEnc`, `metadata`, `lastVerifiedAt`).
  - `SecurityAuditLog` (`id`, `workspaceId`, `userId`, `action`, `provider`, `integrationAccountId`, `entityId`, `status`, `details`, `createdAt`).
- Dodano kolumnę `workspaceId` wraz ze złożonymi kluczami unikalnymi:
  - `Product`: `[workspaceId, ean]`, `[workspaceId, sku]`, `[workspaceId, subiektId]`, `[workspaceId, baselinkerId]`.
  - `CustomerRiskProfile`: `[workspaceId, allegroLogin]`.
  - `ReturnRecord`: `[workspaceId, baselinkerId]` oraz złożony klucz obcy `[workspaceId, customerLogin] -> [workspaceId, allegroLogin]`.
  - `AgentMetric` i `AgentQueue`: opcjonalny `workspaceId` dla telemetrii i kolejek AI.
- Przeprowadzono transakcyjną migrację `migrate-multi-workspace.js` bez utraty danych i z zachowaniem wpisów legacy w `SystemSetting`. Katalogi globalne (`Brand`, `MarketplaceCategory`, `KnowledgeDocument`) oraz moduły ERP (`kanban`, `crm`, `campaigns`, `chat`) pozostały współdzielone.

### 2.2. Szyfrowanie AES-256-GCM z AAD i Zasada Fail-Closed (`src/utils/secretVault.js`, `src/services/workspace.service.js`)
- Wprowadzono format szyfrogramu `enc:v2:k1:` (`encryptSecretWithAad`, `decryptSecretWithAad`) wiążący każdy sekret z kontekstem AAD `workspaceId:PROVIDER:integrationAccountId` (`buildIntegrationAad`). Przeniesienie lub próba odszyfrowania szyfrogramu w kontekście innego klienta, kanału lub konta kończy się błędem kryptograficznym (`VAULT_AAD_DECRYPT_FAILED`).
- Klienci niedomyślni oraz żądania z jawnym `accountId` działają w trybie **Fail-Closed**: brak skonfigurowanego `IntegrationAccount` dla aktywnego klienta blokuje operację bez cichego sięgania po `process.env.BASELINKER_TOKEN`, `SystemSetting` ani konta innych klientów.

### 2.3. Izolacja Backendowych Usług, Lookupów, WebSocketów i Zadań CRON
- **Kontekst HTTP i WebSocket (`src/middlewares/workspace.middleware.js`, `src/core/socket.js`):** `resolveWorkspaceContext` odczytuje `X-Workspace-Id` / `query.workspaceId` / `body.workspaceId`, odrzuca nieistniejący/nieaktywny identyfikator (`404`) oraz dopina domyślną przestrzeń przy braku nagłówka. Pokoje WebSocket `workspace:${workspaceId}` przez zdarzenie `join_workspace` oraz `socketService.emitToWorkspace`.
- **Wspólne wyszukiwanie i ochrona przed IDOR (`src/utils/productLookup.js`):** `resolveProductByIdOrEan` wymusza `workspaceId` dla wyszukiwań po `id`, `ean` oraz dopasowaniach częściowych (usunięto pojedyncze `findUnique({ where: { ean } })`).
- **Kanały zewnętrzne i Cache:**
  - `baselinker.service.js` & `baselinker.export.service.js`: partycjonowanie rate limitera, cache `extraFieldsCacheByKey` oraz `inventoryParametersCache` kluczem `${workspaceId}:${accountId}:${inventoryId}`; w `clearInventoryParametersCache(workspaceId, accountId)` izolowane czyszczenie cache.
  - `allegro.service.js` & `allegro-auth.routes.js`: przechowywanie tokenów OAuth2 i opcjonalnych własnych `customClientId` / `customClientSecret` w `IntegrationAccount`, partycjonowanie cache tokenów (`workspaceId:accountId`), izolacja `activeDeviceFlows` i blokada międzyklienckiego fallbacku (`allowCrossAccountFallback` działa wyłącznie w obrębie jednego `workspaceId`).
  - `vonhalsky.service.js`, `vonhalsky.routes.js`, `vonhalsky.controller.js`: wielokontowy skarbiec Von Halsky z cache tokenów OAuth 2.1 i konfiguracji per `workspaceId:accountId`.
- **RMA, Analityka, Orkiestrator i CRON (`rma.service.js`, `analytics.service.js`, `orchestrator.js`, `cron.js`, `server.js`):** Oddzielne watermarks RMA per `workspaceId` (`rma_last_return_date:${wsId}`), iteracja pętli CRON niezależnie po aktywnych przestrzeniach roboczych oraz przekazanie `this.workspaceId` do aktualizacji produktów (`updateMany`) i emisji WebSocket orkiestratora.

### 2.4. Bezpieczeństwo Eksportów Ręcznych i Interfejs Operatora
- **Twardy strażnik jednorazowych tokenów (`src/utils/exportTokenGuard.js`):** `signScopedExportToken` i `verifyAndConsumeScopedExportToken` wiążą jednorazowy nonce + podpis HMAC-SHA256 + 5-minutowy TTL z krotką `(workspaceId, userId, provider, integrationAccountId, targetId, ean, payloadHash)`.
- **Podwójne ręczne potwierdzenie eksportów (`UnifiedProductPipelineView.jsx`, `VonHalskyExportModal.jsx`, kontrolery):** Każdy eksport (BaseLinker, Allegro Parametry, Allegro Opis/Zdjęcia, InPost Von Halsky) wymaga kliknięcia Pre-flight na frontendzie, wyświetlenia wysokokontrastowego banera **`KLIENT: <nazwa> -> KONTO: <etykieta>`** w kolorze klienta (`badgeColor`), przejścia Kroku 1/2 -> Kroku 2/2 (`confirmedTwice === true`) oraz wpisu do `SecurityAuditLog`. Brak eksportów automatycznych z CRON, pipeline'u ani `save-draft`.
- **Frontend Multi-Workspace (`App.jsx`, `AdminPanelView.jsx`):**
  - Synchronizacja `nexus_workspace_id` w `localStorage`, interceptorze Axios oraz API-scoped wrapperze `window.fetch()` dla ścieżek `/api/*` i `API_URL`, przełącznik klienta w nagłówku z podsumowaniem integracji i produktów, czyszczenie `editingProduct` oraz remount widoków (`key={activeWorkspaceId}`).
  - Rozbudowany `AdminPanelView.jsx` (*Integracje API*): CRUD przestrzeni klientów z wyborem `badgeColor`, wielokontowy menedżer BaseLinker, per-kliencki Allegro Device Flow (z opcjonalną własną aplikacją OAuth klienta), wielokontowy menedżer InPost Von Halsky oraz zwijany podgląd `SecurityAuditLog`.

## 3. Weryfikacja Produkcyjna
- **Testy backendowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`330/330 PASS`** (`0` fail, `0` skipped), w tym nowa suita `multi_workspace.isolation.test.js` weryfikująca na żywej bazie PostgreSQL m.in. równoległe EAN/SKU i RMA w 2 przestrzeniach, blokadę IDOR, odmowę deszyfracji AES-256-GCM po zmianie AAD, tryb fail-closed w BaseLinker/Allegro/Von Halsky, odporność `exportTokenGuard` na podmiany i replay oraz partycjonowanie cache schematów BaseLinker (z automatycznym czyszczeniem rekordów testowych w `after()`).
- **Smoke check modułów Node.js (`node -e`):** `workspace.middleware.js`, `workspaces.routes.js`, `allegro-auth.routes.js`, `vonhalsky.routes.js`, `offer-optimizer.controller.js`, `vonhalsky.controller.js`, `rma.service.js`, `analytics.service.js` załadowane bez błędów.
- **Linter ESLint frontendu:** `AdminPanelView.jsx` (`0` błędów), `VonHalskyExportModal.jsx` (`0` błędów), `UnifiedProductPipelineView.jsx` (`0` nowych błędów / 18 starych), `App.jsx` (`0` nowych błędów / 34 stare).
- **Build produkcyjny frontendu (`npm --prefix frontend run build`):** `vite build` PASS (`6.91s`, `dist/index.html` i bundle wygenerowane czysto).
- **Stan żywej bazy PostgreSQL po testach:** `workspaceCount = 1` (`default` — *Domyślny Klient*), `integrationCount = 2` (`BASELINKER`, `ALLEGRO`), `defaultProductCount = 459`, `totalProducts = 459`, `auditLogsCount = 0` (brak pozostałości testowych).
