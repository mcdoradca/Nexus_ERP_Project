# ADR-0177: Wielokontowy Vault OAuth2 Allegro oraz Dwuetapowy Eksport Opisu i Zdjęć Bezpośrednio przez REST API (`POST /sale/images` + `PATCH /sale/product-offers/{offerId}`)

**Status:** Wdrożone (zweryfikowane testami jednostkowymi, buildem frontendu, ESLintem oraz nie-mutującym Pre-flightem E2E przeciwko produkcyjnemu API Allegro)  
**Data:** 2026-11-18  
**Moduły:** `src/utils/allegro_mapper.js`, `src/modules/offer-optimizer-v2/baselinker.export.service.js`, `src/modules/offer-optimizer/allegro.service.js`, `src/routes/allegro-auth.routes.js`, `src/server.js`, `src/modules/offer-optimizer/offer-optimizer.routes.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `frontend/src/views/AdminPanelView.jsx`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/tests/allegro.content.export.test.js`

---

## 1. Kontekst i Problem

Po wdrożeniu eksportu parametrów (ADR-0176) brakowało analogicznego, bezpiecznego dwuetapowego mechanizmu wysyłki **gotowych opisów (`sekcja1`–`sekcja7`) oraz zdjęć (`visionTickets` / PIM)** bezpośrednio na wybrane konto i ofertę Allegro bez przechodzenia przez BaseLinkera:
1. W ramach jednego `ALLEGRO_CLIENT_ID` / `ALLEGRO_CLIENT_SECRET` system musiał obsłużyć **wiele kont sprzedawców Allegro** (dotychczas `allegro.service.js` i `allegro-auth.routes.js` utrzymywały wyłącznie jeden globalny token w `SystemSetting`).
2. Obrazy generowane w potoku (`PhotoroomServiceV2`, dropzone) przechowywane są jako `data:image/jpeg;base64,...` lub zewnętrzne adresy URL, natomiast REST API Allegro wymaga ich wcześniejszego zarejestrowania przez `POST https://upload.allegro.pl/sale/images` i przekazania w `PATCH /sale/product-offers/{offerId}` jako płaskiej tablicy URL-i `images: Array<string>` (a nie obiektów `{ url }`).
3. Wewnętrzny edytor TipTap oraz `orchestrator.js` normalizują pogrubienia do `<strong>`/`<em>`, tymczasem REST API Allegro dla `StandardizedDescription` (`description.sections`) akceptuje wyłącznie zbiór tagów `{h1, h2, p, ul, ol, li, b}` bez atrybutów i bez zagnieżdżonego `<b>` wewnątrz `<h1>`/`<h2>`, przy limicie `40 000` bajtów UTF-8.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Wielokontowy Vault OAuth2 AES-256-GCM (`allegro.service.js`, `allegro-auth.routes.js`, `server.js`)
- Wprowadzono klucz `ALLEGRO_ACCOUNTS_VAULT` w tabeli `SystemSetting` (dodany do `SECRET_SETTING_KEYS` w `src/server.js`), szyfrowany algorytmem `AES-256-GCM` poprzez `src/utils/secretVault.js` (zero zmian w schemacie bazy Prisma).
- `readAllegroAccountsVault` zachowuje bezstratny fallback wsteczny z pojedynczych kluczy `ALLEGRO_ACCESS_TOKEN` / `ALLEGRO_REFRESH_TOKEN` / `ALLEGRO_TOKEN_EXPIRY` (istniejące konto `50233197` działa automatycznie).
- Odświeżanie tokenów i obsługa błędu `401` w `apiClient` są izolowane per konto (`ALLEGRO_REFRESH_LOCK:{accountId}` oraz `_allegroAccountId` w konfiguracji żądania Axios).
- `saveAccountFromTokenData` identyfikuje konto na podstawie pola `user_name` w JWT (a `GET /me` wywołuje wyłącznie best-effort, gdy w `scope` obecne jest `allegro:api:profile:read` — unikając blokady 403 przy samym `sale:offers:*`).
- Rozbudowano `/api/allegro/auth`: `GET /accounts`, `PATCH /accounts/:accountId/default`, `PATCH /accounts/:accountId/label`, `DELETE /accounts/:accountId`, oraz wielosesyjny Device Flow (`POST /start` z `flowId` i `label`, `POST /poll`).

### 2.2. Cienki Adapter Transportowy bez Powielania Logiki Potoku (`allegro_mapper.js`, `allegro.service.js`)
- Współdzielono `isValidExportImageUrl` pomiędzy `allegro_mapper.js` a `baselinker.export.service.js` (DRY), zachowując dokładnie gotowe treści i gotowe zdjęcia z potoku EAN Pipeline.
- **`sanitizeHtmlForAllegroDescription`:** mechanicznie adaptuje gotowy HTML sekcji wyłącznie pod białą listę tagów Allegro (`<strong>` -> `<b>`, usunięcie atrybutów/`<em>`/`<br>`/niedozwolonych tagów oraz usunięcie `<b>` wewnątrz `<h1>`/`<h2>`), nie ingerując w treść ani dozwolone emotikony.
- **`buildAllegroDescriptionSections` & `buildAllegroContentPreflight`:** pakują gotowe sekcje `sekcja1`–`sekcja7` i zdjęcia w `StandardizedDescription` zgodnie z układem `TileSimulator`, kontrolują `trustedContent.paths` (`images`, `description`), limit `16` zdjęć i `40 000` bajtów UTF-8. W Pre-flight rozmiar opisu liczony jest z symulacją docelowego 68-bajtowego URL-a `a.allegroimg.com`, aby surowe ciągi `data:image/...;base64` nie zawyżały fałszywie rozmiaru przed uploadem.
- **`uploadImageToAllegro` (`POST https://upload.allegro.pl/sale/images`):** omija obrazy już hostowane na `a.allegroimg.com`, wysyła `data:image/...` binarnie z `Content-Type: image/jpeg|png|webp` (lub konwertuje `sharp`), a zewnętrzne URL-e wysyła przez JSON `{ url, isAiCoCreated }` z automatycznym fallbackiem binarnym przy blokadzie CDN.
- **`buildAllegroContentPatchBody`:** wysyła `images` (`string[]`), `description` oraz `aiCoCreatedContent: { images: [{ url }] }` — zawsze z pominięciem `productSet`. Naprawiono też `getOfferImages`/`getFullOfferData` do obsługi `images` jako tablicy stringów.

### 2.3. Dwuetapowy Przepływ `Pre-flight -> Zatwierdź i Wyślij` (`offer-optimizer.controller.js`, `AdminPanelView.jsx`, `UnifiedProductPipelineView.jsx`)
- **Backend:** Endpointy `POST /validate-allegro-content-export` i `POST /export-allegro-content` chronione tokenem `HMAC-SHA256` (TTL 5 min) wiążącym `ean`, `accountId`, `offerId` i kanoniczny skrót konfiguracji/treści; równoległe wyszukiwanie po koncie lub wszystkich kontach (`GET /allegro-offers/search?accountId=...`) oraz zapis `allegroAccountId`, `allegroOfferId` i `allegroLastContentExport` w `Product.offerDraft` (`...existingDraft`).
- **Frontend:** Zarządzanie wieloma kontami Allegro w `AdminPanelView.jsx` (Zakładka `Integracje API`), selektor konta i aukcji z przypisaniem `accountId` przy kandydatach w `UnifiedProductPipelineView.jsx`, przycisk `Wyślij Opis i Zdjęcia Allegro` oraz modal Pre-flight 2-stopniowej weryfikacji (`showAllegroContentModal`) z podglądem zdjęć, flagą AI Act, podglądem sekcji i blokadą `dirty`.

---

## 3. Weryfikacja (po ostatniej edycji kodu)

- **Kontrola składni (`node --check`):** wszystkie 7 zmodyfikowanych plików `.js` — `0` błędów.
- **Testy jednostkowe (`node --test src/modules/offer-optimizer-v2/tests/*.test.js`):** **`286/286 PASS`** (`0` fail, `0` skipped), w tym **`allegro.content.export.test.js` (`6/6 PASS`)** i **`allegro.params.export.test.js` (`8/8 PASS`)**.
- **Frontend ESLint & Vite Build:**
  - `npx eslint src/views/AdminPanelView.jsx src/views/OfferOptimizer/UnifiedProductPipelineView.jsx` (z folderu `frontend/`): `0` błędów w `AdminPanelView.jsx` oraz `0` nowych błędów/ostrzeżeń w `UnifiedProductPipelineView.jsx` (wyłącznie 18 zastanych na nienaruszonych liniach `<= 1600`).
  - `npm --prefix frontend run build` (`vite build`): **PASS** (`built in 2.17s`).
- **Nie-mutujący test E2E Pre-flight przeciwko żywemu API Allegro (bez uploadu i bez `PATCH`):**
  - Konto `50233197` (`hasWriteScope: true`): EAN `8004120910364` (oferta `17803378483`) -> `HTTP 200`, `totalBytes: 5500 / 40000`, `imagesNext: 6`, `sectionsNext: 7`, `errors: []`, `hasExportToken: true`; EAN `8059602247612` (oferta `18114732375`) -> `HTTP 200`, `totalBytes: 5945 / 40000`, `imagesNext: 6`, `sectionsNext: 7`, `errors: []`, `hasExportToken: true`.
