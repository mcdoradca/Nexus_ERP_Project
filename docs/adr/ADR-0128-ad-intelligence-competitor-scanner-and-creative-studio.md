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
   - **Konektory Rynkowe:** Wprowadzono obsługę Apify Dataset ID / Actor Token, Meta Graph API (`ads_archive`) oraz Live Web Search Grounding przez Gemini z Google Search.
   - **Polityka Zero-Fake Data:** Całkowite usunięcie hardcoded atrap ("Skin Care Korea", mocków kosmetycznych). Jeśli biblioteka reklam nie zwróci wyników dla podanej frazy, system uczciwie wyświetla Empty State z instrukcją poszerzenia zapytania lub podłączenia ID datasetu Apify, zamiast halucynować nieistniejące reklamy.
   - **Dynamiczne Uziemienie w PIM:** Automatyczne mapowanie dowolnego produktu z bazy Nexus ERP (np. chemia gospodarcza, kosmetyki, odświeżacze, narzędzia) do matrycy perswazyjnej.

5. **Wielowarstwowy Silnik Kreacji Multimedialnych (`CreativeStudioService`):**
   - **Statyki (1080x1080) z Shadow Baking:** Kompozycja fizycznego packshotu z PIM na nowoczesnym tle gradientowym. Pod packshotem wypalany jest wektorowy cień kontaktowy (SVG `feGaussianBlur`), eliminujący efekt zawieszenia w próżni. Typografia po lewej stronie uwzględnia wyliczone pole tekstowe bez kolizji z produktem.
   - **Reels (9:16 - 1080x1920) z Klatkami Produktowymi:** Montaż 4 scen (Hook, Agitacja bólu, Rozwiązanie / Packshot z PIM, CTA) za pomocą `Sharp` + `fluent-ffmpeg`. Podkład audio z natywnego bufora PCM WAV eliminuje błędy `-f lavfi`.
   - **Odporność Produkcyjna (Supabase CDN + Base64):** Wygenerowane bufory są automatycznie wgrywane do bucketu `nexus-files` w Supabase Storage, zwracając globalny adres URL (`publicUrl`). Jednocześnie asset zwraca inline `base64DataUrl` i ścieżkę lokalną, co gwarantuje 100% niezawodności wyświetlania na produkcji `https://n-e-s.it`.

6. **Studio Korekty HITL (Human-In-The-Loop) w `AdIntelligenceTool.jsx`:**
   - Przycisk "Edytuj / HITL" na każdej kreacji otwiera modal edycyjny.
   - Użytkownik ma pełną swobodę korekty nagłówka, podtytułu, treści posta, CTA, budżetu, wyboru zdjęcia z galerii produktu PIM oraz napisów ekranowych każdej sceny Reels.
   - Dedykowany endpoint `POST /api/ad-intelligence/re-render-asset` pozwala na ponowne zrekomponowanie i wyrenderowanie grafiki lub wideo w locie.

## Weryfikacja i Testy
- Zaktualizowano suitę testów `src/modules/ad-intelligence/tests/ad-intelligence.test.js`:
  - 6/6 testów jednostkowych PASSED (w tym Shadow Baking, PIM integration, time-decay scoring, URL resolution, deterministic fixtures).
- Suita regresyjna projektu `npm test`: **138/138 testów PASSED** (0 błędów, 0 regresji).
- Kompilacja produkcyjna Vite: **`built in 4.24s`** bez błędów.

