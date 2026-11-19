# ADR-0187: Integracja eksportu ofert do InPost Von Halsky API (OpenAPI v1.7.12) z szyfrowanym skarbcem OAuth 2.1 i dwukrotnym potwierdzeniem

**Status:** Wdrożone i zweryfikowane (gotowe do wpięcia `Client ID` / `Client Secret`)  
**Data:** 2026-11-19  
**Moduły:** `src/utils/vonhalsky_mapper.js`, `src/modules/offer-optimizer/vonhalsky.service.js`, `src/modules/offer-optimizer/vonhalsky.controller.js`, `src/routes/vonhalsky.routes.js`, `src/modules/offer-optimizer/offer-optimizer.routes.js`, `src/server.js`, `frontend/src/views/AdminPanelView.jsx`, `frontend/src/views/OfferOptimizer/VonHalskyExportModal.jsx`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/tests/vonhalsky.export.test.js`

---

## 1. Kontekst i Wymagania

Rozszerzono możliwości eksportu kart produktowych z Nexus ERP (dotychczas BaseLinker i Allegro REST API) o pełny eksport ofert do kanału **InPost Von Halsky** (dawniej *InPost Buy*, namespace `/inpsa`) zgodnie ze specyfikacją [openapi.json](file:///z:/Nexus_ERP_Project/docs/openapi.json) (`v1.7.12`).

Kluczowe ograniczenia i decyzje projektowe:
1. **Brak zmian schematu bazy danych i brak nowych pakietów npm:** Kredencjały i ustawienia domyślne zapisywane są w istniejącej tabeli `SystemSetting` (`VONHALSKY_CONFIG_VAULT`, `clientSecret` szyfrowany AES-256-GCM przez `secretVault.js`), a powiązania produktu z ofertą Von Halsky (`vonhalskyOfferId`, `vonhalskyOrganizationId`, `vonhalskyCategoryId`, `vonhalskyGpsr`, `vonhalskyAttributeOverrides`, `vonhalskyLastExport`) w istniejącej kolumnie JSON `Product.offerDraft`. Do uploadu binarnego załączników wykorzystano zainstalowane biblioteki `form-data` i `sharp`.
2. **Brak automatycznych wysyłek i twarde dwukrotne potwierdzenie:** Eksport może zostać uruchomiony wyłącznie ręcznie przyciskiem na frontendzie i przejściem dwustopniowego potwierdzenia (Krok 1/2 -> Krok 2/2) weryfikowanego kryptograficznie po stronie backendu (`exportToken` HMAC-SHA256 + `confirmedTwice: true`).
3. **Praca przed uzyskaniem kluczy API:** Gdy `Client ID` i `Client Secret` nie są jeszcze skonfigurowane, Panel Administracyjny pozwala zapisać domyślne parametry eksportu (czas wysyłki, format opisu, domyślny e-mail GPSR, polityki zwrotów/reklamacji), a modal Pre-flight działa w trybie **Offline Pre-flight** (`apiConnected: false`) prezentując pełne mapowanie PIM -> Von Halsky i twardo blokując wysyłkę (`canExport: false`, `exportToken: null`).

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Klient API i Skarbiec OAuth 2.1 ([vonhalsky.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/vonhalsky.service.js), [vonhalsky.routes.js](file:///z:/Nexus_ERP_Project/src/routes/vonhalsky.routes.js), [server.js](file:///z:/Nexus_ERP_Project/src/server.js))
- Pełna obsługa środowisk `production` (`https://api.inpost-group.com/inpsa`, OAuth2 `https://api.inpost-group.com/oauth2/token`) oraz `stage` (`https://stage-api.inpost-group.com/inpsa`, `https://stage-api.inpost-group.com/oauth2/token`) z opcją nadpisania URL i fallbackiem do zmiennych `.env` (`VONHALSKY_*`).
- Automatyczne pobieranie i cache tokena Bearer JWT (`grant_type=client_credentials`), deduplikacja równoległych żądań tokena, 1x retry po `401 Unauthorized`, 2x retry po `429 Too Many Requests` z poszanowaniem `Retry-After` oraz domyślny nagłówek `Accept-Language: pl`.
- Pełna zgodność typów treści z OpenAPI `v1.7.12`: `application/json` dla `POST /v1/organizations/{orgId}/offers` i `PATCH .../attributes`, ściśle **`application/merge-patch+json`** dla `PATCH /v1/organizations/{orgId}/offers/{offerId}` oraz `multipart/form-data` dla `POST .../attachments?attachmentType=IMAGE&priority=N`.
- Cache drzewa kategorii liści (`30 min`) i atrybutów kategorii (`15 min`), wyszukiwanie istniejących ofert, `GET .../offers/hint` oraz polling asynchronicznego statusu komend `GET .../offers/commands/{commandId}`.
- Dodano klucz `VONHALSKY_CONFIG_VAULT` do `SECRET_SETTING_KEYS` w `src/server.js` oraz administracyjne endpointy `/api/vonhalsky/{status,config,verify,organizations}`.

### 2.2. Deterministyczny Mapper PIM -> Von Halsky ([vonhalsky_mapper.js](file:///z:/Nexus_ERP_Project/src/utils/vonhalsky_mapper.js))
- **Konwersja jednostek:** Wymiary PIM (`cm`) i waga (`kg`) przeliczane na wymagane `int32` (`mm` `1..10000` i `g` `1..1000000`) bez wysyłania zer ani pustego obiektu `dimension`.
- **Opis oferty:** Składany z modułów 1–5 i 7 (z wykluczeniem Sekcji 6 GPSR i surowej stopki INCI z Sekcji 3), z możliwością wyboru **bezpiecznego HTML** (domyślny) lub **czystego tekstu strukturalnego** (`<= 100000 zn.`).
- **Zdjęcia:** Separacja na publiczne `https://` (`images[]`, `fileName` 5..500 zn., `priority >= 1`, max 20) oraz obrazy `data:image/...` / `http://` kierowane automatycznie do uploadu binarnego przez `POST /offers/{offerId}/attachments?attachmentType=IMAGE`.
- **Atrybuty kategorii:** Dopasowanie po nazwach i aliasach PL/EN, konwersja jednostek wg `unitOfMeasureDetails`, walidacja wyłącznie aktywnych opcji dla `DICTIONARY` oraz blokada eksportu przy braku wymaganych atrybutów (`ONE`/`AT_LEAST_ONE`).
- **GPSR (`GpsrInfo`):** Integracja z `BrandResponsibleService`, użycie nowego pola `manufacturer.responsiblePersonDetails` (bez wycofanego `responsiblePerson`), ekstrakcja czystych ostrzeżeń Sekcji 6 bez emotikonów, normalizacja numeru telefonu `^\+\d{3,15}$` oraz twarda walidacja wymaganego w OpenAPI `manufacturer.email` dla kategorii wymagających GPSR.
- **Ochrona RFC 7396 w trybie `PATCH`:** Pomijanie niezmienialnych pól `externalId` i `product.ean`, jeśli istniejąca oferta już je posiada, oraz brak serializacji wartości `null`.

### 2.3. Kontroler Pre-flight, Dwukrotne Potwierdzenie i UI ([vonhalsky.controller.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer/vonhalsky.controller.js), [VonHalskyExportModal.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/VonHalskyExportModal.jsx), [AdminPanelView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/AdminPanelView.jsx), [UnifiedProductPipelineView.jsx](file:///z:/Nexus_ERP_Project/frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx))
- Endpointy w `offer-optimizer.routes.js`: `GET /vonhalsky/categories`, `GET /vonhalsky/categories/:categoryId/attributes`, `GET /vonhalsky/offers/search`, `POST /validate-vonhalsky-export` oraz `POST /export-vonhalsky`.
- `exportToVonHalsky` twardo odrzuca wywołania bez `confirmedTwice === true` (`400 DOUBLE_CONFIRMATION_REQUIRED`) oraz bez ważnego (TTL 5 min), podpisanego HMAC-SHA256 `exportToken` zgodnego z kanonicznym hashem ładunku i załączników (`409 INVALID_EXPORT_TOKEN`).
- W `UnifiedProductPipelineView.jsx` dodano przycisk **„Wyślij do Von Halsky”** otwierający `VonHalskyExportModal.jsx` z dwustopniowym potwierdzeniem (`Potwierdź dane (Krok 1/2)` -> `Tak, potwierdzam po raz drugi — Wyślij do Von Halsky`, resetowanym po każdej edycji), a w `AdminPanelView.jsx` dodano panel konfiguracji i testu połączenia OAuth 2.1.

---

## 3. Weryfikacja

- **Składnia (`node --check`):** `vonhalsky_mapper.js`, `vonhalsky.service.js`, `vonhalsky.controller.js`, `vonhalsky.routes.js`, `offer-optimizer.routes.js`, `server.js` — **PASS**.
- **Testy jednostkowe (`node --test --test-reporter=spec src/modules/offer-optimizer-v2/tests/*.test.js`):** **`317/317 PASS`** (`0` błędów, `0` pominiętych), w tym `9/9 PASS` w nowym `vonhalsky.export.test.js` (walidacja EAN/telefonu, wymiary cm->mm/kg->g, opis HTML/plain bez Sekcji 6, rozdzielanie zdjęć HTTPS vs binarne, słowniki/jednostki atrybutów, GPSR z `responsiblePersonDetails`, ochrona RFC 7396 w PATCH, szyfrowany skarbiec + OAuth2 401 retry, tryb Offline Pre-flight, blokada bez `confirmedTwice` i zmanipulowanego tokena, pełny flow POST + upload załącznika + zapis `offerDraft`).
- **Frontend:** ESLint (`0` błędów w `VonHalskyExportModal.jsx` i `AdminPanelView.jsx`, `0` nowych błędów w `UnifiedProductPipelineView.jsx`) oraz `npm --prefix frontend run build` (`vite build`) — **PASS** (`6.90s`).
