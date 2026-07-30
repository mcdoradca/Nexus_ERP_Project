# KONTRAKTY ZEWNĘTRZNE DLA MODUŁU OFFER-OPTIMIZER-V2

## A. ENDPOINTY HTTP KONSUMOWANE PRZEZ FRONTEND (Routing + Kształt)
*Z odczytu pliku `src/modules/offer-optimizer/offer-optimizer.routes.js` oraz `offer-optimizer.controller.js`*

1. **`POST /start`**
   - Routing: `offer-optimizer.routes.js:16`
   - Request: `offer-optimizer.controller.js:27` -> `{ inventoryId, productIds }`
   - Response: `offer-optimizer.controller.js:36-41` -> `{ message, jobId, status, total_items }`

2. **`POST /analyze-single` [SERWUJE TREŚĆ OFERTOWĄ]**
   - Routing: `offer-optimizer.routes.js:17`
   - Request: `offer-optimizer.controller.js:68` -> `{ ean, analysisMode, forceRegenerate }`
   - Response: `offer-optimizer.controller.js:207-221` (w przypadku draftu) lub `266-271` (w przypadku generacji AI). Zwraca obiekt z polami m.in.: `title`, `ean`, `htmlContent`, `images`, `isDraftRestored`.

3. **`GET /status/:jobId`**
   - Routing: `offer-optimizer.routes.js:18`
   - Request: `req.params.jobId` (`offer-optimizer.controller.js:51`)
   - Response: `offer-optimizer.controller.js:58` -> Zwraca wynik `OfferOptimizerService.getJobStatus(jobId)`.

4. **`POST /regenerate-title` [SERWUJE TREŚĆ OFERTOWĄ (Tytuł)]**
   - Routing: `offer-optimizer.routes.js:19`
   - Request: Wymaga EAN oraz opcjonalnie obecnego tytułu (`offer-optimizer.controller.js:281` -> `{ ean, currentTitle }`).
   - Response: `offer-optimizer.controller.js:291` -> `{ title: payload.title }` (lub obiekt z kluczem `error`).

5. **`GET /proxy-image`**
   - Routing: `offer-optimizer.routes.js:20`
   - Request: `offer-optimizer.controller.js:298` -> `req.query.url`
   - Response: Strumień binarny obrazu `res.status(200).send(buffer)` (`offer-optimizer.controller.js:310`).

6. **`POST /save-draft`**
   - Routing: `offer-optimizer.routes.js:21`
   - Request: `offer-optimizer.controller.js:333` -> `{ ean, draftData }`
   - Response: `offer-optimizer.controller.js:402` -> `{ message: "Zapisano kopię roboczą..." }`

7. **`POST /export-baselinker`**
   - Routing: `offer-optimizer.routes.js:22`
   - Request: `offer-optimizer.controller.js:410` -> `{ ean, draftData, inventoryId }`
   - Response: `offer-optimizer.controller.js:465` -> `{ message: "Zapisano AI w PIM. MDM aktualizuje BaseLinker w tle!" }`

8. **`POST /generate-lifestyle`**
   - Routing: `offer-optimizer.routes.js:23`
   - Request: Wymaga `imageBase64` lub `sourceImageUrl` (`offer-optimizer.controller.js:477`).
   - Response: `offer-optimizer.controller.js:490` -> `{ jobId, status: 'PROCESSING', message }`

9. **`GET /generate-lifestyle/status/:jobId`**
   - Routing: `offer-optimizer.routes.js:24`
   - Response: JSON ze statusem zadania lifestyle.

10. **`POST /pipeline/trigger`**
    - Routing: `offer-optimizer.routes.js:25`
    - Request: `offer-optimizer.controller.js:583` -> `{ ean, mode }`
    - Response: `offer-optimizer.controller.js:598` -> `{ status: "processing", ean, message }`

11. **`GET /pipeline/status/:ean` [SERWUJE TREŚĆ OFERTOWĄ]**
    - Routing: `offer-optimizer.routes.js:26`
    - Response: `offer-optimizer.controller.js:650-654` -> Jeśli `COMPLETE`, zwraca obiekt `{ status: 'COMPLETE', result: { ...product, finalDraft } }` zawierający ofertę z DB. W innych przypadkach status `PROCESSING` lub `ERROR`.

12. **Endpointy RAG / Supervisor** (`/knowledge/ingest`, `/knowledge/list`, `/knowledge/:title`) serwujące status operacji bazodanowych na wiedzy.

## B. TABELE I POLA BAZY (Prisma)
- **`AgentQueue`**: Używane do asynchronicznych masowych zadań optymalizacji. Pola: `id`, `status` ('PROCESSING', 'COMPLETED', 'ERROR'), `ean`, `payload`.
- **`Product`**: Kluczowa encja. Pola: `ean`, `sku`, `name`, `brandId`, `allegroCategoryId`, `offerDraft`, `isSynced`, `lastContentSource`, atrybuty techniczne (features, images, weight, etc.).
- **`Brand`**: Reprezentuje markę (szukanie po nazwie lub tworzenie domyślnej `PIM-IMPORT`).
- **`MarketplaceCategory`**: Tablica kategorii Allegro wiązana z produktem.
- **`SystemSetting`**: Tablica klucz-wartość na tokeny (np. `BASELINKER_TOKEN`, `ALLEGRO_ACCESS_TOKEN`).
- **`KnowledgeDocument`**: Baza wektorowa dokumentów.
- **`User`**: np. szukanie konta bota `'nexus.ai@system.local'`.
- *UWAGA:* Stary moduł używał tabeli `AgentCache`. Zgodnie z OP-1, v2 ma zakaz jej używania.

## C. FORMAT EKSPORTU BASELINKER
Zdefiniowany w `src/modules/offer-optimizer/baselinker.service.js:143-155`.
Używana metoda API: `addInventoryProduct`. Kształt payloadu:
```json
{
  "inventory_id": 123,
  "product_id": 456,
  "text_fields": {
    "name": "Czysty tytuł bez emoji",
    "description": "Zakodowany HTML (sekcja1)",
    "description_extra1": "Zakodowany HTML (sekcja2)",
    "description_extra2": "Zakodowany HTML (sekcja3)",
    "description_extra3": "Zakodowany HTML (sekcja4)",
    "description_extra4": "Zakodowany HTML (sekcja5 \n\n sekcja6)"
  },
  "images": {
    "0": "url:http://...",
    "1": "data:base64..."
  }
}
```
*Zabezpieczenia w module:* Blokada re-uploadu CDN BaseLinkera, omijanie limitów bazodanowych przez mapowanie 4-bajtowych emoji na encje HTML.

## D. OZNACZENIE ENDPOINTÓW Z TREŚCIĄ OFERTOWĄ (Dla Decyzji OP-2)
Endpointy, które mogą bezpośrednio serwować frontendowi ryzykowną prawnie treść, to:
- **`POST /analyze-single`**
- **`GET /pipeline/status/:ean`**
- **`POST /regenerate-title`** (Tytuł jest częścią treści ofertowej)
To te węzły będą głównym celem bramek bezpieczeństwa.

## E. KONFLIKTY
1. **Endpoint `/regenerate-title` vs architektura v2 (Brak Agenta 3 - SEOTitle)**
   - **Fakt 1:** Frontend konsumuje ten endpoint w pliku `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx:306`.
   - **Fakt 2:** Kształt requestu z frontendu: `{ ean: liveEan, currentTitle: liveTitle }`.
   - **Fakt 3:** Kształt response oczekiwany przez frontend (lub backend): `{ title: "nowy tytuł" }` w przypadku 200 OK.
   - **Konflikt:** Zgodnie z docelowym dokumentem konfiguracyjnym V2 (pakiet v4.1), Agent 3 (SEOTitle) został trwale usunięty z architektury (brak takiego promptu). Moduł backendowy V2 musi zachować kontrakt z frontendem (który wysyła żądanie pod `/regenerate-title`), jednak nie posiada dedykowanego węzła (Agenta 3) do wykonania tej logiki.
