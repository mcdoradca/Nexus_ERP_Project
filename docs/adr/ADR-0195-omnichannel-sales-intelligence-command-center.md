# ADR-0195: Nexus Revenue & Inventory Command Center (BaseLinker + Allegro 2026 + InPost Von Halsky + Omnichannel CSV/XLSX)

- **Status:** Wdrożono (`2026-11-23`)
- **Kontekst:** Potrzeba budowy w pełni izolowanego per klient (`Workspace`) centrum decyzyjnego i analityki sprzedaży dla kanałów **Base.com (BaseLinker)**, **Allegro REST API (2026)** oraz **InPost Von Halsky OpenAPI v1.7.12**, zdolnego do łączenia danych na żywo z API z archiwalnymi i reklamowymi eksportami `.csv` / `.xlsx` / `.json`, bez podwójnego zliczania GMV i bez halucynowania marży.

---

## 1. Model danych i izolacja Multi-Workspace (PostgreSQL + Prisma)
Rozszerzono `prisma/schema.prisma` o relacje na `Workspace` i 6 dedykowanych modeli analitycznych z kaskadowym usuwaniem (`onDelete: Cascade`) i unikalnymi kluczami antyduplikacyjnymi:
- `AnalyticsImportBatch`: śledzenie sesji synchronizacji API i importów CSV/XLSX/JSON (`warnings`, `summary` m.in. otwarte PO i logi zmian stanów Base.com, możliwość bezpiecznego wycofania paczki przez `deleteImportBatch`).
- `AnalyticsOrder`: znormalizowane zamówienia z rozbiciem na kanały (`ALLEGRO`, `VONHALSKY`, `SHOP`, `OTHER`), `marketplaceOrderId`, kursy walut (`PLN`, `CZK`, `EUR`, `HUF`), flagę `isSmart`, dopłaty `discountPlatformPln` / `discountMerchantPln`, czasy SLA (`acceptedAt`, `shippedAt`) i pozycje `items` JSON.
- `AnalyticsDailyOfferSnapshot`: dzienne migawki ofertowe budowane przez synchronizację na żywo i nocny CRON (`stock`, `status`, `pricePln`, `promotionPricePln`, `visitsCount`, `watchersCount`, `sold30d`, `isPromoted`, `hasBadge`, `inPriceProgram`, `rejectionReasons`, `validationErrors`).
- `AnalyticsFinancialEntry`: wpisane po `externalEntryId` dokładne operacje bilingowe Allegro (prowizje, zwroty prowizji, Smart!, opłaty wyróżnień, Ads, abonamenty).
- `AnalyticsAdsMetric`: dane kampanii Allegro Ads z importów CSV/XLSX (`impressions`, `clicks`, `costNetPln`, `adRevenuePln`, `ctr`, `cpcPln`, `roas`, `sourceRowHash`).
- `AnalyticsQualitySnapshot`: migawki jakości sprzedaży (Allegro `/sale/quality`, `/sale/user-ratings`, `/sale/issues`, `/order/customer-returns`; InPost `/v2/returns|claims|refunds` wraz z `decisionDueDate`; BaseLinker zwroty + SLA paczek).

---

## 2. Kluczowe decyzje biznesowe i analityczne

### 2.1. Jednolita reguła braków w ofercie (`stock <= stockoutThreshold`)
- **Decyzja twarda (właściciel produktu):** Wszystkie stany `0..stockoutThreshold` (domyślnie `2`, konfigurowalne `0..50` w UI/API) stanowią **jeden jednolity stan `BRAK W OFERCIE`** (wyłączona sprzedaż, `sellableStock = Math.max(0, stock - stockoutThreshold)`).
- Świadomie **wykluczono** jakikolwiek podział dni niedostępności na `0 szt.` vs `1–2 szt.` lub etykietę „Zombie Stock” — w silniku analitycznym, UI i eksportach XLSX/CSV obowiązuje jednolity próg wyłączenia.

### 2.2. Aktualne standardy Allegro 2026 & InPost Von Halsky OpenAPI v1.7.12
- **Allegro REST API:** Przepisano `src/modules/offer-optimizer/allegro.analytics.service.js`, zastępując nieistniejące zdarzenia `OFFER_VIEWED`/`OFFER_CLICKED` i nieistniejące pole `product.cogs` realnym odczytem `GET /sale/offers` (`stats.visitsCount`, `stats.watchersCount`, `stock.available`, `stock.sold`) oraz `AnalyticsDailyOfferSnapshot` i `Product.basePrice`. Nowy konektor obsługuje również `/sale/offer-events`, `/order/checkout-forms` (do 60d), `/billing/billing-entries`, `/pricing/offer-quotes`, `/sale/badges`, `/sale/quality`, `/sale/issues` (zamiast wygaszonego 07.01.2026 `/sale/disputes`) i `/order/customer-returns` z izolacją HTTP `401/403` do `scopeWarnings`. Próg Smart! domyślnie wynosi **49,90 zł** (zmiana z 02.03.2026), a martwa strefa obejmuje przedział `[34,00; 49,89]` zł.
- **InPost Von Halsky:** Rozszerzono `src/modules/offer-optimizer/vonhalsky.service.js` o parametr `scopeOverride` bez naruszania domyślnych uprawnień eksportowych (`DEFAULT_SCOPES`), dodając metody odczytu ofert/odrzuceń, zdarzeń ofert (`SOLDOUT`, `REJECTED`, `CLOSED`, `REOPENED`), kampanii i deklaracji Programu Cenowego, zamówień (`programPrice.discountSplit`: `inpostShare` vs `merchantShare`, `deliveryMethod`, SLA akceptacji i nadania) oraz posprzedaży v2 (`/v2/returns`, `/v2/claims`, `/v2/refunds`). Przy błędzie `invalid_scope` dla `api:orders:read` konektor bezpiecznie cofa się do `api:categories:read api:offers:read` i zgłasza ostrzeżenie w `scopeWarnings`.

### 2.3. Omnichannel Deduplication & Zero Fake Data Policy
- Zamówienia z lustra BaseLinker (`originChannel: 'ALLEGRO' | 'VONHALSKY'`) i bezpośredniego API Allegro/VonHalsky mające ten sam `marketplaceOrderId` są scalane do jednego zamówienia kanonicznego (łączenie brakujących `sku`/`ean` z Base.com z metadanymi prowizji/Smart! z Allegro — **zero podwójnego GMV**).
- **Zero Fake COGS:** Zweryfikowany Zysk Netto, Marża Netto %, POAS, GMROI i Utracony Zysk Netto wyliczane są wyłącznie dla produktów posiadających rzeczywisty `Product.basePrice > 0` w PIM (plus `inboundTransportCost`, `packagingCost`, `bdoEprCost`, `outboundTransportCost` oraz `taxRate`). Zawsze prezentowany jest wskaźnik pokrycia `cogsCoveragePct`.

---

## 3. Architektura modułu

### Backend (`src/modules/sales-intelligence/`)
- `utils/currency.helpers.js` — przeliczniki FX, detekcja linii wysyłkowych, wnioskowanie walut zagranicznych z cen bazowych PLN.
- `connectors/baselinker.connector.js` — zamówienia (`getOrders`), stany (`getInventories`, `getInventoryProductsList`), otwarte dostawy PO (`getInventoryPurchaseOrders`), logi stanów i cen (`getInventoryProductLogs`), zwroty i opcjonalnie SLA paczek kurierskich.
- `connectors/allegro.connector.js` & `connectors/vonhalsky.connector.js` — synchronizatory Multi-Workspace z izolacją brakujących uprawnień OAuth.
- `importers/csv-importer.service.js` — parser obsługujący UTF-8 BOM, Windows-1250, CSV (`;` / `,` / `TAB`), XLSX/XLS i cache JSON dla archiwum zamówień Base.com (`> 90 dni`), raportów Allegro Ads oraz bilingów/ruchu Allegro Analytics.
- `engine/analytics.engine.js` — główny silnik decyzyjny: 3-częściowe straty przez braki (bezpośrednia + Cross-Sell + 14-dniowa Kara Trafności), dynamiczny kalkulator ROP Min-Max z odjęciem otwartych PO, klasyfikacja ABC-XYZ, role koszykowe (Kotwice / Dopełniacze / Soliści), Market Basket Analysis (Lift, Confidence, Smart! 49,90 zł), wykrywacz krwawiących promocji/Ads, leżaków magazynowych, przerwanej ciągłości ID aukcji, kanibalizacji, luk Cross-Channel Allegro ↔ Von Halsky oraz detektor root-cause skoków i spadków T/T.
- `export.service.js` — generator 8-zakładkowego pliku `.XLSX` i `.CSV` (UTF-8 BOM, `;`) ze 100% wykazem SKU i wierszem `SUMA KONTROLNA`.
- `sales-intelligence.service.js`, `sales-intelligence.controller.js`, `sales-intelligence.routes.js` — podpięte w `src/server.js` pod `/api/sales-intelligence` za `authenticateToken` + `resolveWorkspaceContext`, a także w `src/core/cron.js` (codziennie o `03:30` per aktywny `Workspace`).

### Frontend (`frontend/src/views/SalesIntelligence/`)
- `SalesIntelligenceView.jsx` (podpięty w `frontend/src/App.jsx` pod zakładką `sales-intelligence` i `ALL_MODULES`, z bezpośrednim przejściem `onOpenProduct` do Offer Optimizer V2).
- `OverviewTab.jsx`, `InventoryProcurementTab.jsx`, `BasketPortfolioTab.jsx`, `PlatformDetailsTab.jsx`, `DataSourcesTab.jsx`, `BoardReportTab.jsx` (z obsługą `@media print` A4 PDF), `SkuDeepDiveModal.jsx`, `formatters.js`.

---

## 4. Weryfikacja po wdrożeniu
- `node --check` dla wszystkich 12 zmodyfikowanych i nowych plików backendowych: **PASS**.
- `node --test --test-reporter=spec src/modules/sales-intelligence/tests/sales-intelligence.test.js`: **8/8 PASS** (m.in. jednolita reguła `stock <= 2`, deduplikacja Omnichannel, Basket Lift / Smart! 49.90 / Zero Fake COGS, importer CP1250/CSV/Ads/Billing, mocki konektorów z 403 i `invalid_scope` fallback, 8-arkuszowy `.XLSX`, oraz live test izolacji Multi-Workspace w PostgreSQL z wycofaniem paczki i sprzątaniem).
- Suita regresyjna `node --test src/modules/offer-optimizer-v2/tests/*.test.js`: **344/344 PASS**.
- `vite build` (`npm --prefix frontend run build`): **PASS**; `eslint` dla `frontend/src/views/SalesIntelligence/*.{js,jsx}`: **0 błędów, 0 ostrzeżeń**.
