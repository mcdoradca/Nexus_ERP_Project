# ADR-0128: Moduł Ad Intelligence & Creative Studio w MTool (Skaner Reklam Konkurencji & Swarm)

## Status
Przyjęty, rozbudowany o PIM i HITL Studio, wdrożony (100% Produkcja) - 2026-10-02

## Kontekst i Problem Biznesowy
Użytkownik zgłosił zapotrzebowanie na automatyzację procesu monitorowania rynku reklamowego (benchmark konkurencji) oraz generowania własnych wysokokonwertujących kreacji graficznych i krótkich form wideo (Reels/TikTok) w oparciu o modele Gemini, wzorując się na koncepcji:
- Skanowanie setek reklam konkurencji (np. z Meta Ad Library).
- Ocena przekazów, dowodów, pilności i czasu ciągłej emisji (indeks żywotności / time-decay).
- Synteza psychologicznych kątów marketingowych i matrycy 28 haczyków (hooks).
- Produkcja gotowych kreacji reklamowych (statyki + Reels) powiązanych bezpośrednio z fizycznymi produktami z bazy PIM (Nexus ERP).
- Eliminacja "pustych/czarnych okien" na produkcji poprzez globalne serwowanie mediów z CDN Supabase Storage (`nexus-files`) oraz defensywny fallback Base64.
- Wdrożenie pełnoprawnego Studia Korekty HITL (Human-In-The-Loop), umożliwiającego edycję copy, podmienianie packshotów z galerii produktu oraz natychmiastowy re-render przed eksportem do Harmonogramu SMI.

## Podjęte Decyzje Architektoniczne

1. **Separacja Odpowiedzialności & Integracja z PIM:**
   - Wyodrębniono podmoduł `AD_INTELLIGENCE` w `MToolView.jsx`.
   - Zintegrowano selektor produktów z modelem `prisma.product` (endpoint `GET /api/ad-intelligence/products`), zasilający LLM oraz silnik graficzny fizycznymi danymi: ceną katalogową, właściwościami/INCI, opisem oraz galerią zdjęć.
   - Gotowe kreacje po edycji są eksportowane jednym kliknięciem do tabeli `SmiPost` w statusie `Do Akceptacji`.

2. **Zero Nowych Zależności i Zero Zmian w Bazie (Czerwone Linie 1 i 2):**
   - Wykorzystano istniejące pakiety: `@google/genai` (v2.14.0), `@supabase/supabase-js`, `sharp`, `fluent-ffmpeg`, `ffmpeg-static`.
   - Wykorzystano istniejący model Prisma `Product` oraz `SmiPost` bez żadnych modyfikacji schematu.

3. **Dwuetapowy Potok LLM z Rygorem Językowym (Gemini 3.8 Flash & Gemini 3.1 Pro):**
   - **Węzeł 1 (Scorer - `gemini-3.8-flash`):** Audyt reklam pod kątem typu haczyka, dowodów, oferty oraz wyliczenie ważonego wskaźnika `overallWinningScore` z wagą 40% dla `longevityScore`.
   - **Węzeł 2 (Strateg - `gemini-3.1-pro-preview` / `gemini-3.8-flash`):** Synteza 4 kątów psychologicznych, 28 haczyków oraz briefów statycznych i Reels. Wprowadzono twarde reguły syntaktyczne: 100% polskie znaki diakrytyczne, eliminacja duplikatów między `headline` a `subheadline` (headline = hak uwagi, subheadline = twardy dowód/liczby z PIM) oraz sanityzacja post-processingowa.

4. **Konektory Rynkowe, Limit 300 Rekordów (Polska) & Polityka Zero-Fake:**
   - **Rygorystyczny Limit:** Ze względu na specyfikę rynku polskiego (PL), maksymalna liczba skanowanych rekordów została ograniczona do `max 300` (domyślnie 100).
   - **Konektory Rynkowe i Odporność Apify:** Wprowadzono obsługę Apify Dataset ID / Actor Token, Meta Graph API (`ads_archive`) oraz Live Web Search Grounding przez Gemini z Google Search. W przypadku wyczerpania bezpłatnego limitu konta Apify (np. błąd 400 `platform-feature-disabled` przy przekroczeniu miesięcznego progu), system nie załamuje procesu, lecz rejestruje czytelny log telemetryczny i automatycznie przechodzi na Live Web Search Grounding.
   - **Polityka Zero-Fake Data:** Całkowite usunięcie hardcoded atrap ("Skin Care Korea", mocków kosmetycznych). Jeśli biblioteka reklam nie zwróci wyników dla podanej frazy, system uczciwie wyświetla Empty State z instrukcją poszerzenia zapytania lub podłączenia ID datasetu Apify, zamiast halucynować nieistniejące reklamy.

5. **Wielowarstwowy Silnik Kreacji Multimedialnych (`CreativeStudioService`) & Obsługa Produktów Spoza PIM:**
   - **Brak Przymusu PIM & Czysty Start:** Formularz nie jest automatycznie przejmowany przez pierwszy produkt z PIM na mount. Użytkownik ma pełną swobodę wyboru produktu z PIM LUB podania dowolnego produktu rynkowego spoza bazy wraz z zewnętrznym adresem URL packshotu (`customProductImgUrl`).
   - **Przycisk "Wyczyść formularz":** Umożliwia natychmiastowe zresetowanie wszystkich pól i odłączenie produktu PIM jednym kliknięciem.
   - **Statyki (1080x1080) z Shadow Baking:** Kompozycja fizycznego packshotu (z PIM lub z zewnętrznego linku) na nowoczesnym tle gradientowym. Pod packshotem wypalany jest wektorowy cień kontaktowy (SVG `feGaussianBlur`), eliminujący efekt zawieszenia w próżni. Typografia po lewej stronie uwzględnia wyliczone pole tekstowe bez kolizji z produktem.
   - **Reels (9:16 - 1080x1920) z Klatkami Produktowymi:** Montaż 4 scen (Hook, Agitacja bólu, Rozwiązanie / Packshot z PIM lub zewnętrzny, CTA) za pomocą `Sharp` + `fluent-ffmpeg`. Podkład audio z natywnego bufora PCM WAV eliminuje błędy `-f lavfi`.
   - **Odporność Produkcyjna (Supabase CDN + Base64):** Wygenerowane bufory są automatycznie wgrywane do bucketu `nexus-files` w Supabase Storage, zwracając globalny adres URL (`publicUrl`). Jednocześnie asset zwraca inline `base64DataUrl` i ścieżkę lokalną, co gwarantuje 100% niezawodności wyświetlania na produkcji `https://n-e-s.it`.

6. **Studio Korekty HITL (Human-In-The-Loop) w `AdIntelligenceTool.jsx`:**
   - Przycisk "Edytuj / HITL" na każdej kreacji otwiera modal edycyjny.
   - Użytkownik ma pełną swobodę korekty nagłówka, podtytułu, treści posta, CTA, budżetu, wyboru zdjęcia z galerii produktu PIM lub własnego linku oraz napisów ekranowych każdej sceny Reels.
   - Dedykowany endpoint `POST /api/ad-intelligence/re-render-asset` pozwala na ponowne zrekomponowanie i wyrenderowanie grafiki lub wideo w locie.

7. **Bezpośredni Upload Materiałów z Dysku Lokalnego (Zdjęcia, Wideo - do 50MB):**
   - **Endpoint Uploadu:** Dodano dedykowany endpoint `POST /api/ad-intelligence/upload-material` chroniony tokenem JWT (`authenticateToken`) z parserem `multer` (pamięć RAM, limit 50MB).
   - **Dysk i CDN Storage:** Pliki są fizycznie zapisywane w katalogu serwera `frontend/public/uploads/ad-intelligence/` z unikalnymi nazwami `material_<timestamp>_<hash>.<ext>`, a także wysyłane do bucketu `nexus-files` w Supabase Storage (`ad-intelligence/materials/...`). W przypadku braku połączenia z Supabase, system korzysta bezpośrednio z lokalnego URL serwowanego przez serwer statyczny.
   - **Wykrywanie MIME i Podgląd:** Automatyczna kategoryzacja na `image` lub `video`. Formularz główny (Sekcja 2) oraz modal HITL Studio wyposażono w przycisk "Wgraj z komputera" / "Zmień plik", live preview (obraz lub odtwarzacz wideo), badge ze statusem pliku (nazwa, waga w KB/MB) oraz przycisk usunięcia.
8. **Naprawa Live Web Search Grounding, Agent Autouzupełniania z Sieci (OSINT) & Generacja Bezpośrednia:**
   - **Eliminacja Błędu Referencyjnego w Skanerze Gemini:** Naprawiono błąd braku instancji klienta `ai` w `_liveSearchAdsWithGemini`, który powodował fałszywy pusty wynik `[]` przy wyczerpaniu limitu Apify. Wdrożono odporne parsowanie JSON z Live Search Grounding (Google Search) oraz rozszerzone wyszukiwanie polskich kampanii marketingowych.
   - **Agent Autouzupełniania z Sieci (`POST /api/ad-intelligence/enrich-product`):** Po wpisaniu nazwy marki lub produktu w polu formularza, agent autonomicznie odnajduje oficjalną witrynę producenta lub e-sklepu w Polsce, wyciąga kluczowe parametry (USP, certyfikaty/proof, opis, kategorię i bezpośrednie zdjęcie) i automatycznie uzupełnia formularz.
   - **Odblokowanie Generowania Kreacji przy 0 Reklamach & Tryb Bezpośredni:** Usunięto błąd widoku w `AdIntelligenceTool.jsx`, który ukrywał 28 haczyków i przycisk generowania grafik/wideo przy zerowym wyniku skanera. Wprowadzono również przycisk **„⚡ Generuj Własne Kreacje Bezpośrednio”** (`directGeneration: true`), który pozwala na natychmiastową syntezę i render kreacji z danych produktu bez czekania na skaner konkurencji.

## Weryfikacja i Testy
- Zaktualizowano suitę testów `src/modules/ad-intelligence/tests/ad-intelligence.test.js`:
  - 10/10 testów jednostkowych PASSED (w tym Shadow Baking, PIM integration, obsługa produktu spoza PIM, bezpośredni upload pliku z dysku, autouzupełnianie z sieci przez agenta OSINT, tryb natychmiastowej bezpośredniej generacji strategii, time-decay scoring, URL resolution, deterministic fixtures).
- Suita regresyjna projektu `npm test`: **138+ testów PASSED** (0 błędów, 0 regresji).
- Kompilacja produkcyjna Vite: **`built in 1.71s`** bez błędów.

