# ADR-0176: Dwuetapowy eksport parametrów oferty, składu INCI (`composition`) oraz oczyszczonych ostrzeżeń GPSR/CLP (`safetyInformation`) bezpośrednio przez REST API Allegro (`PATCH /sale/product-offers/{offerId}`)

**Status:** Wdrożone (zweryfikowane testami jednostkowymi, buildem frontendu oraz nie-mutującym pre-flightem E2E przeciwko produkcyjnemu API Allegro)  
**Data:** 2026-11-18  
**Moduły:** `src/utils/allegro_mapper.js`, `src/modules/offer-optimizer/allegro.service.js`, `src/modules/offer-optimizer/offer-optimizer.routes.js`, `src/modules/offer-optimizer/offer-optimizer.controller.js`, `frontend/src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`, `src/modules/offer-optimizer-v2/tests/allegro.params.export.test.js`

---

## 1. Kontekst i Problem

Dotychczas potok `ean pipeline` w Nexus ERP kończył się generacją opisu HTML (Sekcje 1–7) oraz zapełnieniem słowników i cech lokalnego PIM (`features`) i/lub wypychaniem wybranych pól przez BaseLinkera. Brakowało bezpiecznego, atomowego mechanizmu zapisu **bezpośrednio do Allegro REST API**, który:
1. Aktualizuje zarówno parametry ofertowe (`describesProduct: false`, korzeń `parameters`), jak i produktowe (`describesProduct: true`, `productSet[0].product.parameters`) przy zachowaniu zgodności z semantyką **RFC 7396 JSON Merge Patch** (każde wysłanie tablicy `parameters` nadpisuje całą tablicę w Allegro, więc utrata niezmapowanych pól lub pól `trustedContent` groziła uszkodzeniem aukcji).
2. Wykorzystuje natywny parser składu Allegro (`POST /ingredients/parse`) do zasilenia strukturalnego pola `productSet[0].composition` dla kosmetyków (INCI), bez wywoływania błędów `422` dla chemii gospodarczej podlegającej Rozporządzeniu WE 648/2004.
3. Ekstrahuje ostrzeżenia GPSR/CLP z wygenerowanych sekcji opisu (`offerDraft.sekcja6`, fallback do `sekcja5`/`descriptionHtml`/`sekcja4` `WYKLUCZENIE ZASTOSOWANIA` lub `features['Ostrzeżenia']`), usuwa znaczniki HTML, wszystkie emotikony/piktogramy, nagłówki sekcji, zduplikowany blok podmiotu odpowiedzialnego w UE oraz dane kontaktowe (e-mail/URL), zasilając natywne pole `productSet[0].safetyInformation` (`{ type: "TEXT", description }`, limit `5000` znaków).
4. Chroni system przed przypadkowym nadpisaniem żywych ofert produkcyjnych (wymuszony dwuetapowy **Pre-flight Diff & Validation -> Token potwierdzenia -> Confirm & Export**) oraz nie wymaga zmian schematu bazy danych Prisma.

---

## 2. Podjęte Decyzje Architektoniczne

### 2.1. Kontrakty REST API Allegro (zweryfikowane na produkcji)
- **Aktualizacja pojedynczej oferty:** Wyłącznie `PATCH https://api.allegro.pl/sale/product-offers/{offerId}` (`Accept` / `Content-Type: application/vnd.allegro.public.v1+json`, `Accept-Language: pl-PL`), z obsługą asynchronicznej odpowiedzi `202 Accepted` i odpytywaniem operacji do stanu końcowego (`200`/`303`).
- **Inspekcja tokenu OAuth2 (`ensureSellerWriteToken` / `inspectTokenClaims`):** Weryfikacja po stronie serwera, że zapisany w `SystemSetting` (`ALLEGRO_ACCESS_TOKEN` / `ALLEGRO_REFRESH_TOKEN`) JWT jest tokenem użytkownika (`user_name` / `isUserToken === true`) oraz posiada wymaganą parę uprawnień `allegro:api:sale:offers:write` i `allegro:api:sale:offers:read`. Weryfikacja live potwierdziła aktywne scopes `["allegro:api:sale:offers:write", "allegro:api:sale:settings:read", "allegro:api:sale:offers:read"]` dla sprzedawcy `50233197`.
- **Natywny parser INCI (`POST /ingredients/parse`):** Przekazuje payload `{ categoryId, products: [{ id, name, ingredients }] }` po wstępnej normalizacji `normalizeInciToLegalEnglish` (`extractCleanInciForAllegro`). Dla kategorii kosmetycznych (`5363`, `93059`) zwraca `items[0].ingredients` (`supported: true`, `0` ostrzeżeń); dla chemii gospodarczej (np. `260253`, mieszaniny wg WE 648/2004) wykrywa ostrzeżenia `UNKNOWN_INGREDIENT` i bezpiecznie pomija pole `composition` z ostrzeżeniem diagnostycznym zamiast narażać ofertę na `422`.

### 2.2. Deterministyczne mapowanie i ochrona RFC 7396 (`src/utils/allegro_mapper.js`)
- **`buildAllegroParameterPatchPayload`:**
  - Rozdziela parametry na poziom oferty (`parameters`) oraz produktu (`productSet[0].product.parameters`) na podstawie `options.describesProduct`.
  - Dokonuje konwersji jednostek fizycznych (`convertValueToParameterUnit`: `ml <-> l`, `g <-> kg`, `mm <-> cm <-> m`, zaokrąglanie wg `restrictions.precision`, walidacja `min`/`max`).
  - Koduje słowniki (`valuesIds`, `multipleChoices`, `ambiguousValueId`), zakresy i typy liczbowo-tekstowe (`encodeParameterValue`), zachowując kompatybilność wsteczną `mapAllegroParameters`.
  - **Ochrona przed cichą utratą danych (RFC 7396):** Jeśli zmieniają się wyłącznie parametry ofertowe (`describesProduct: false`), całkowicie pomija klucz `productSet` w body `PATCH`. Scalając tablice, zachowuje wszystkie istniejące parametry Allegro (w tym pola `trustedContent` z `catalogProduct`), zachowuje istniejące pola GPSR (`responsibleProducer`, `responsiblePerson`, `marketedBeforeGPSRObligation`, `deposits`) oraz ostrzega, gdy aktualizacja `multipleChoices` redukuje liczbę zaznaczonych opcji względem Allegro.
  - **`areAllegroParamsEqual`:** Dla parametrów słownikowych porównuje zbiory `valuesIds` z pominięciem echa tekstowego `values` zwracanego przez `GET` Allegro, eliminując fałszywe raportowanie zmian na niezmienionych polach (`Stan`, `Marka`, itp.).
- **`extractSafetyInformationText` & `stripHtmlAndEmoticons`:**
  - Usuwa tagi HTML, dekoduje encje, wycina wszystkie piktogramy/emotikony Unicode, zbyteczne nagłówki (`Bezpieczeństwo...`, `Informacje o bezpieczeństwie`, `Informacje dotyczące bezpieczeństwa`), linie podmiotu UE, e-maile i adresy URL; zachowuje czystą treść ostrzeżeń CLP/GPSR oraz sekcję wykluczeń materiałowych w limicie `MAX_SAFETY_TEXT_LEN = 5000`.

### 2.3. Trwałość powiązania oferty bez zmian w bazie danych (JSON `Product.offerDraft`)
- Identyfikator `allegroOfferId` oraz historia ostatniego eksportu (`allegroLastParamsExport`) są zapisywane wewnątrz kolumny JSON `Product.offerDraft` (bez zmian w `prisma/schema.prisma`).
- Zabezpieczono punkty nadpisujące `offerDraft` (`exportToBaselinker` oraz ścieżki błędu/pauzy `HITL_PAUSED`/`ERROR` w `triggerUltimatePipeline` w `offer-optimizer.controller.js`) tak, aby zawsze rozpakowywały `...existingDraft` i nigdy nie wymazywały powiązanego `allegroOfferId`.

### 2.4. Dwuetapowy przepływ API i UI (`Pre-flight -> Confirm & Export`)
1. **`GET /allegro-offers/search`** (`searchAllegroOffers`): Wyszukiwanie aktywnych/powiązanych ofert sprzedawcy po SKU (`external.id`), EAN lub frazie.
2. **`POST /validate-allegro-params-export`** (`validateAllegroParamsExport`): Pobiera świeżą ofertę z Allegro, schemat kategorii i dane katalogu, uruchamia `parseIngredientsWithAllegro` oraz `extractSafetyInformationText`, buduje diff wiersz-po-wierszu (`ADD` / `UPDATE` / `UNCHANGED` / `BLOCKED_TRUSTED` / `VALIDATION_ERROR`) i podpisuje dokładny payload `patchBody` 5-minutowym tokenem HMAC-SHA256 (`signAllegroParamsToken`).
3. **`POST /export-allegro-params`** (`exportAllegroParams`): Weryfikuje token HMAC (`verifyAllegroParamsToken` — gwarantuje, że wysyłany JSON jest identyczny jak zatwierdzony w Pre-flight), wykonuje `PATCH /sale/product-offers/{offerId}` i utrwala wynik w `Product.offerDraft.allegroLastParamsExport`.
4. **UI (`UnifiedProductPipelineView.jsx`):** Przyciski `"Wyślij Parametry Allegro"` (pasek edytora) oraz `"Wyślij do Allegro API"` + wyszukiwarka Offer ID (sekcja parametrów), odznaki `[Produkt]`/`[Oferta]`, obsługa wielokrotnego wyboru `multipleChoices`, wartości własnej przy `ambiguousValueId` oraz modal Pre-flight (`showAllegroParamsModal`) z pełną tabelą zmian, podglądem/edycją `safetyInformation` (`allegroCustomSafetyText`), statusem INCI i przyciskiem finalnego potwierdzenia.

---

## 3. Weryfikacja (po ostatniej edycji kodu)

- **Kontrola składni (`node --check`):** `allegro_mapper.js`, `allegro.service.js`, `offer-optimizer.routes.js`, `offer-optimizer.controller.js` — `0` błędów.
- **Testy jednostkowe (`node --test src/modules/offer-optimizer-v2/tests/*.test.js`):** **`281/281 PASS`** (`0` fail, `0` skipped, czas całkowity `16918.27 ms`), w tym nowy pakiet **`allegro.params.export.test.js` (`10/10 PASS` w `30.09 ms`)** obejmujący ekstrakcję/czyszczenie ostrzeżeń, fallbacki, INCI, konwersję jednostek, kodowanie słowników/`multipleChoices`/`ambiguousValueId`, ochronę RFC 7396 / `trustedContent`, pomijanie `productSet` przy zmianach ofertowych, porównywanie słowników z echem `values` oraz ostrzeżenie przed redukcją opcji wielokrotnego wyboru.
- **Frontend ESLint & Vite Build:**
  - `npx eslint src/views/OfferOptimizer/UnifiedProductPipelineView.jsx`: `18` zastanych błędów wyłącznie na nienaruszonych liniach `21–1474`, **`0` błędów i `0` ostrzeżeń** w nowym/zmodyfikowanym kodzie.
  - `npm --prefix frontend run build` (`vite build`): **PASS** (`built in 1.87s`, bundle `dist/assets/index-4376YzlD.js`).
- **Nie-mutujący test E2E Pre-flight przeciwko żywemu API Allegro (bez `PATCH`):**
  - Kosmetyki EAN `8004120910364` (oferta `17803378483`, kat. `5363`) oraz EAN `8059602247612` (oferta `18114732375`, kat. `93059`): oba zwróciły `HTTP 200`, `hasExportToken: true`, poprawnie rozpoznały `14` niezmienionych parametrów jako `UNCHANGED`, wykryły brudne dane BaseLinkera (`Pojemność = "Produkt pełnowymiarowy"` jako `VALIDATION_ERROR`) i redukcję listy `Produkt nie zawiera` (`11 -> 1`), sparsowały INCI (`20` i `17` składników, `0` błędów/ostrzeżeń) oraz wyekstrahowały oczyszczony blok `safetyInformation` z `offerDraft.sekcja6` (`390` i `224` znaki).

