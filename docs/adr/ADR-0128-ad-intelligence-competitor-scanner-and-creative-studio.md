# ADR-0128: Moduł Ad Intelligence & Creative Studio w MTool (Skaner Reklam Konkurencji & Swarm)

## Status
Przyjęty i wdrożony (100% Produkcja) - 2026-10-02

## Kontekst i Problem Biznesowy
Użytkownik zgłosił zapotrzebowanie na automatyzację procesu monitorowania rynku reklamowego (benchmark konkurencji) oraz generowania własnych wysokokonwertujących kreacji graficznych i krótkich form wideo (Reels/TikTok) w oparciu o modele Gemini, wzorując się na koncepcji:
- Skanowanie setek reklam konkurencji (np. z Meta Ad Library).
- Ocena przekazów, dowodów, pilności i czasu ciągłej emisji (indeks żywotności / time-decay).
- Synteza psychologicznych kątów marketingowych i matrycy 28 haczyków (hooks).
- Produkcja gotowych kreacji reklamowych (statyki + Reels) w cenie zaledwie kilku dolarów (lub poniżej) za kampanię.
- Wymóg: realizacja jako zintegrowany moduł w platformie MTool zasilający istniejący Harmonogram Postów SMI bez dokładania manualnej pracy.

## Podjęte Decyzje Architektoniczne

1. **Separacja Odpowiedzialności (Analityk vs Wydawca):**
   - Zgodnie ze Złotymi Zasadami Nexus ERP wyodrębniono podmoduł `AD_INTELLIGENCE` w `MToolView.jsx`.
   - Moduł ten działa jako autonomiczny generator Swarm, który nie modyfikuje bezpośrednio harmonogramu produkcyjnego przed akceptacją operatora. Gotowe kreacje są eksportowane jednym kliknięciem do tabeli `SmiPost` w statusie `Do Akceptacji`.

2. **Zero Nowych Zależności i Zero Zmian w Bazie (Czerwone Linie 1 i 2):**
   - Wykorzystano wyłącznie istniejące pakiety: `@google/genai` (v2.14.0), `sharp`, `fluent-ffmpeg`, `ffmpeg-static`, `puppeteer-extra-plugin-stealth`.
   - Wykorzystano istniejący model Prisma `SmiPost` (pola: `mediaUrls`, `mediaTypes`, `postType`, `adBudgetInfo`, `content`, `hashtags`, `notes`, `status`).

3. **Dwuetapowy Potok LLM (Gemini 3.8 Flash & Gemini 3.1 Pro):**
   - **Węzeł 1 (Scorer - `gemini-3.8-flash`):** Błyskawiczny audyt setek reklam pod kątem typu haczyka (PAIN_POINT, CURIOSITY, CONTRARIAN, CASE_STUDY, SOCIAL_PROOF, TRANSFORMATION), siły dowodów, jasności oferty oraz wyliczenie ważonego wskaźnika `overallWinningScore` z wagą 40% dla `longevityScore` (czas ciągłej emisji na rynku).
   - **Węzeł 2 (Strateg - `gemini-3.1-pro-preview`):** Głęboka synteza 4 kątów psychologicznych, generowanie 28 chwytliwych haczyków (po 7 na kąt), briefów statycznych oraz scenopisów Reels. Wdrożono defensywny fallback na `gemini-3.8-flash` oraz generator deterministyczny w razie ograniczeń uprawnień klucza API.

4. **Wielowarstwowy Silnik Kreacji Multimedialnych (`CreativeStudioService`):**
   - **Statyki (1080x1080):** Próba wywołania `imagen-3.0-generate-002` z `@google/genai` dla tła produktowego. W razie braku aktywnego modelu/uprawnień – automatyczna aktywacja silnika wektorowego `Sharp` składającego tło gradientowe Dark-Mode, wyrazistą typografię nagłówków, badge zaufania (`⭐ 4.9/5 | 100% Czyste INCI`), buttony CTA i stopkę marki.
   - **Reels (Pionowe wideo 9:16 - 1080x1920):** Programistyczny montaż 4 kluczowych scen (Hook alert, Błąd #1 / Agitacja bólu, Rozwiązanie / Produkt, CTA) za pomocą `Sharp` + `fluent-ffmpeg` i `ffmpeg-static`. Generowany plik MP4 (H.264 / AAC / yuv420p) jest gotowy do natywnego odtwarzania w przeglądarce i publikacji na Instagramie / TikToku.

5. **Interfejs MTool (`AdIntelligenceTool.jsx`):**
   - Wizualizacja Top Winners konkurencji z licznikami dni ciągłej emisji.
   - Zakładki 4 kątów i interaktywna matryca 28 hooków z funkcją kopiowania do schowka.
   - Podgląd wygenerowanych kreacji (wbudowany odtwarzacz wideo Reels i podgląd grafik).
   - Przycisk zasilania Harmonogramu SMI z wyborem kampanii.

## Weryfikacja i Testy
- Utworzono suitę testów `src/modules/ad-intelligence/tests/ad-intelligence.test.js` (6 testów: normalizacja, scoring time-decay, synteza 28 hooków, render PNG Sharp, montaż MP4 FFmpeg, walidacja eksportu SMI).
- Wynik suity Ad Intelligence: **6/6 testów PASSED**.
- Suita regresyjna `offer-optimizer-v2`: **138/138 testów PASSED** (0 błędów, 0 regresji).
- Kompilacja produkcyjna Vite: **`built in 4.84s`** bez błędów.
