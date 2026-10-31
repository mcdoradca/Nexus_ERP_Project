# ADR-0168: Naprawa Przywracania Szkicu AI (`offerDraft`) w Widoku Karty PIM oraz Sanityzacja URLi Obrazów przy Eksporcie do BaseLinker

* **Status:** Zaakceptowane / Wdrożone
* **Data:** 2026-10-31
* **Kontekst:** Moduły `offer-optimizer`, `offer-optimizer-v2`, `frontend/src/views/OfferOptimizer` (Incydent produkcyjny dla EAN `8004120083808` — `FIGARO PIANKA DO GOLENIA 100 ML`)

## 1. Problem i Diagnoza Przyczyny Źródłowej (Root Cause Analysis)

Po wygenerowaniu 4 zdjęć Lifestyle AI (Base64 ~8–12 MB) oraz 6-modułowego opisu AI, kliknięciu przycisku **„Zapisz Szkic AI”**, wyjściu z widoku Karty PIM do Katalogu Głównego i ponownym wejściu w ten sam produkt (`EAN 8004120083808`):
1. Widok Karty PIM nie ładował zapisanych zdjęć ani modułów opisu (`0 / 6 POPRAWNE`, puste edytory `Moduł 1..6`).
2. W konsoli przeglądarki pojawiał się komunikat `Przywrócono niezapisaną wersję roboczą z LocalStorage!`.
3. Próba eksportu do BaseLinkera kończyła się błędem `HTTP 500` (`BaseLinker API Error: Nie można zapisać zdjęć produktu. Podano nieprawidłowy URL zdjęcia.`), ponieważ w logach PM2 `BaselinkerExportService` próbował pobrać i wysłać placeholder tekstowy `"Wymagane nowe zdjęcie (nr 2)"` jako `url:Wymagane nowe zdjęcie (nr 2)`.
4. Obrazy z `upload.cdn.baselinker.com` w kafelku symulatora i galerii PIM rzucały błędy `net::ERR_CONNECTION_RESET` przy bezpośrednim ładowaniu z przeglądarki.

### Zidentyfikowany łańcuch błędów:
* **Zatrucie `localStorage` przez `QuotaExceededError`:** Efekt `Autosave` w `UnifiedProductPipelineView.jsx` próbował zapisać pełny stan `visionTickets` (4 obrazy Base64) oraz pełny obiekt `newProductForm` (zawierający zagnieżdżony `offerDraft`). Po przekroczeniu limitu 5 MB przeglądarki blok `catch (err)` zapisywał w `localStorage` okrojony obiekt `fallbackDraft` **pozbawiony klucza `visionTickets`**.
* **Brak czyszczenia `localStorage` po zapisie do bazy:** Funkcje `handleSaveDraft` („Zapisz Szkic AI”) oraz `handleConfirmExport` zapisywały dane w PostgreSQL (`product.offerDraft`), ale nie usuwały klucza `nexus_pim_draft_${editingProduct}` z `localStorage`.
* **Blokada odczytu z bazy (`if (!hasDraft)`):** Przy ponownym wejściu w produkt z katalogu, `useEffect` wykrywał obecność okrojonego `fallbackDraft` w `localStorage`, ustawiał `hasDraft = true` i **całkowicie pomijał załadowanie `p.offerDraft` z bazy PostgreSQL** (`GET /api/products/:id`).
* **Brak reaktywności TipTap (`StrictWysiwyg.jsx`):** W ścieżce `hasDraft` nie inkrementowano `editorKey`, a komponent `StrictWysiwyg.jsx` używał `useEditor({ content: initialContent })` bez `useEffect` nasłuchującego zmian `initialContent` po zamontowaniu, przez co edytory pozostawały puste.
* **Zatrucie `product.imageUrl` i `product.images` placeholderem tekstowym:** W `offer-optimizer.controller.js` (`saveDraft`), instrukcja `.map(img => img.replacedUrl || img.originalUrl).filter(Boolean)` traktowała string `"Wymagane nowe zdjęcie (nr 2)"` jako prawdziwy URL i nadpisywała nim `product.imageUrl` oraz `product.images`. Następnie `baselinker.export.service.js` w bloku `catch` dla `axios.get("Wymagane nowe zdjęcie (nr 2)")` zwracał `url:Wymagane nowe zdjęcie (nr 2)`, co powodowało odrzucenie całego ładunku przez API BaseLinkera (`HTTP 500`).

## 2. Decyzja Architektoniczna i Wprowadzone Zmiany

1. **Jedno Źródło Prawdy (PostgreSQL `offerDraft`) i Ochrona `localStorage` (`UnifiedProductPipelineView.jsx`):**
   * Dla istniejących produktów (`editingProduct`) `GET /api/products/${editingProduct}` jest zawsze wykonywany i stanowi nadrzędne źródło prawdy dla `p.offerDraft` (`visionTickets` / `images`, `htmlContent`, `title`). Ewentualny szkic z `localStorage` może jedynie uzupełnić pojedyncze sloty prawidłowymi URLami/Base64 (weryfikowanymi przez `isValidMediaUrl`), nigdy zaś zablokować odczytu z bazy danych.
   * Po każdym udanym zapisie (`handleSaveDraft`) oraz eksporcie (`handleConfirmExport`) wywoływane jest `localStorage.removeItem(DRAFT_KEY)` wraz z flagą `skipNextAutosaveRef.current = true`.
   * W efekcie `Autosave` z obiektu `newProductForm` wycinane są ciężkie pola (`offerDraft`, `images`, `data:image`), aby uniknąć `QuotaExceededError`.
2. **Synchronizacja Edytorów TipTap (`StrictWysiwyg.jsx`):**
   * Dodano `React.useEffect` reagujący na zmianę `initialContent`, który aktualizuje zawartość edytora (`editor.commands.setContent(incoming, false)`), gdy edytor nie posiada fokusu lub jest pusty.
   * Wymuszono odświeżenie `setEditorKey(prev => prev + 1)` przy każdym odtworzeniu szkicu oraz po zdarzeniu SSE `PIPELINE_COMPLETE`.
3. **Sanityzacja URLi Zdjęć w Backendzie (`offer-optimizer.controller.js` & `baselinker.export.service.js`):**
   * W `saveDraft` (`offer-optimizer.controller.js`) wdrożono walidator `isValidOfferImageUrl`, który bezwzględnie odrzuca teksty techniczne (`"Wymagane nowe zdjęcie..."`, `"Pusty slot..."`, itp.) przed aktualizacją `product.imageUrl` i `product.images`.
   * Dodano ochronne scalanie (`existingDraft`) w `saveDraft` oraz `triggerUltimatePipeline`, aby zapis częściowy nigdy nie wyzerował wcześniej wygenerowanych zdjęć ani sekcji HTML, oraz zsynchronizowano klucze `offerDraft.images` i `offerDraft.visionTickets`.
   * W `baselinker.export.service.js` dodano metodę `isValidExportImageUrl(url)`, która blokuje przekazywanie placeholderów tekstowych do `compressImage` oraz w bloku `catch` zwraca `url:${url}` wyłącznie dla adresów zaczynających się od `http`.
4. **Eliminacja `net::ERR_CONNECTION_RESET` (`UnifiedProductPipelineView.jsx` & `TileSimulator.jsx`):**
   * Wszystkie zewnętrzne obrazy `http/https` w Karcie PIM (Główna Miniatura, Galeria BaseLinker) oraz w `TileSimulator.jsx` są kierowane przez backendowy endpoint `/api/offer-optimizer/proxy-image`.

