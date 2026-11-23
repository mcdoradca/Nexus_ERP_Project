# ADR-0193: Różnicowanie Opisów, Układu Sekcji i Oprawy Zdjęć AI per Klient (Multi-Workspace)

**Status:** Zaakceptowane i wdrożone  
**Data:** 2026-11-23  
**Zakres:** Multi-Workspace Content & Visual Profiles, Offer Optimizer V2, Photoroom V2, Eksporty (BaseLinker, Allegro REST API, InPost Von Halsky), Frontend (`AdminPanelView.jsx`, `UnifiedProductPipelineView.jsx`)

---

## 1. Kontekst i Problem Biznesowy
Po wdrożeniu architektury Multi-Workspace (`ADR-0192`) wiele firm (klientów) może sprzedawać dokładnie ten sam asortyment (ten sam kod EAN). Dotychczasowy kod powodował duplikację treści oraz wizualny uniformizm:
1. W `offer-optimizer.controller.js` wznawianie stanu (`state_PL-<EAN>-*.json`) odbywało się bez prefiksu `workspaceId`, grożąc przejęciem opisu między kontami.
2. Brakowało per-klienckiego profilu stylistycznego (ton, układ, kolejność i widoczność sekcji, własna sekcja porad oraz treść Modułu 7) oraz straży antyduplikacyjnej dla tego samego EAN między kontami.
3. W `photoroom.service.js` każde konto otrzymywało włoską ramkę z pionową nazwą marki, występował ukryty błąd brakującego parametru `options` w `generatePhotoroomLifestyle`, a zapis plików debugowych oraz powiadomień nie był izolowany po `workspaceId`.
4. Równocześnie twarde fakty z przodu i tyłu opakowania (`Skład/INCI`, `Ostrzeżenia` CLP/GPSR, `Sposób użycia`, `Producent`, `Pojemność`, `Waga`, parametry Allegro) stanowią wspólną prawdę fizyczną produktu i muszą pozostać niezmienne (w szczególności Sekcja 6 ostrzeżeń).

---

## 2. Podjęta Decyzja Architektoniczna

### 2.1. Bez-migracyjny Serwis Profili Klienta (`src/services/workspaceContentProfile.service.js`, `workspace.service.js`, `workspaces.routes.js`)
- Wykorzystano istniejące pole JSON `Workspace.settings` bez jakichkolwiek zmian w schemacie bazy PostgreSQL ani instalacji nowych pakietów.
- Zdefiniowano 6 gotowych profili (`CONTENT_PROFILE_PRESETS`): `DEFAULT_CLASSIC` dla konta domyślnego oraz 5 zróżnicowanych presetów automatycznie przydzielanych kolejnym firmom (`EXPERT_TECHNICAL`, `PRACTICAL_HOME`, `SENSORY_PREMIUM`, `MINIMAL_SCANNER`, `ROUTINE_GUIDE`) różniących się:
  - tonem copywritera, schematem tytułu i nagłówków,
  - kolejnością sekcji (`sectionOrder`),
  - listą ukrytych sekcji (`hiddenSections`, np. ukrycie FAQ lub Modułu 7),
  - opcją własnej sekcji dodatkowej **„Porady i tipy”** (`includeTipsSection`, `tipsSectionTitle`, `sekcjaTips`),
  - układem kafelków (`imageTextLayout`: `'IMAGE_LEFT'`, `'ALTERNATING'`, `'TEXT_LEFT'`) oraz dozwolonym przez Allegro punktorem (§C: `✔️`, `✅`, `☑️`, `➡️`),
  - indywidualną treścią domyślną Modułu 7 (`defaultSekcja7`, każdorazowo wolną od naruszeń Załącznika nr 2 i stop-words §A).
- **Twarde blokady bezpieczeństwa:** `resolveWorkspaceContentProfile` nigdy nie pozwala ukryć `sekcja1` ani `sekcja6` i nigdy nie dopuszcza `sekcja6` do publicznego opisu.
- Udostępniono endpoint `GET /api/workspaces/content-presets` przed trasami parametryzowanymi w `workspaces.routes.js`.

### 2.2. Zdjęcia AI Klientów bez Ramki i Nazwy Marki (`photoroom.service.js`, `offer-optimizer.controller.js`)
- **Oryginalny prompt `prompt-master.service.js` pozostał w 100% nienaruszony** zgodnie z dyrektywą właściciela produktu.
- Naprawiono brakujący parametr `options = {}` w `generatePhotoroomLifestyle`, wyizolowano zapisy `debug_images` prefiksem `wsTag` oraz dopięto `workspaceId` do `resolveProductByIdOrEan` (naliczanie `aiImageCost`) i `socketService.emitToWorkspace`.
- Wydzielono helper `applyClientFrameAndWatermark`:
  - `DEFAULT_CLASSIC` / konto domyślne (`frameStyle: 'ITALIAN_TRICOLOR'`): zachowana klasyczna włoska ramka z nazwą marki.
  - Kolejni klienci (`frameStyle: 'CLEAN_NONE'`): całkowicie usunięta kolorowa ramka i pionowa nazwa marki (pozostaje opcjonalny subtelny znacznik AI).

### 2.3. Różnicowanie Opisów, Współdzielenie Faktów Opakowania i Straż Antyduplikacyjna (`orchestrator.js`, `Agent_6_compiled.md`, `ai.service.js`, `google-suggest-faq.service.js`, `deterministic-pipeline.engine.js`)
- **Współdzielenie wyłącznie zweryfikowanych faktów fizycznych opakowania:** `loadSiblingPackagingFactsForEan` uzupełnia puste pola z białej listy faktów etykiety (`PACKAGING_FACT_FEATURE_KEYS`: `Skład/INCI`, `Ostrzeżenia`, `Sposób użycia`, `Producent`, `Kraj pochodzenia`, `Pojemność`, `Waga`, `Postać`), nigdy nie kopiując opisów marketingowych ani zdjęć innych klientów.
- **Zanonimizowana straż antyduplikacyjna:** `loadSiblingCopyFingerprints` pobiera maksymalnie 10 ofert z innych kont o tym samym EAN (bez nazw klientów i bez zdjęć), przekazując `used_titles`, otwarcia S1/S4/Porady i pytania FAQ do danych wejściowych `{{SKU_DATA}}` (z zachowaniem bajt-do-bajtu identycznego prefiksu `Agent_6_compiled.md` pod Prefix Caching). Po wygenerowaniu `evaluateCrossWorkspaceDuplication` (shingle Jaccard ≥ 0.45) uruchamia maksymalnie 1 próbę przeformułowania wyłącznie dla sekcji marketingowych i FAQ — **Sekcja 6 (Ostrzeżenia CLP/GPSR) nigdy nie jest modyfikowana**.
- **Warianty deterministyczne i tytuły:** dodano `variantIndex` w `google-suggest-faq.service.js`, wariantowe nagłówki i punktory w `buildSection3FromA4Result` / `buildDeterministicSection5`, wsparcie `contentProfile` i `avoidTitles` w `AiService.generateTitleOnly` oraz pełną izolację plików stanu (`state_PL-${wsTag}-${EAN}`) i wyników (`offer_${wsTag}_${EAN}.json`).

### 2.4. Spójny Kolejnościowo Eksporter i Interfejs (`allegro_mapper.js`, `baselinker.export.service.js`, `vonhalsky_mapper.js`, `vonhalsky.controller.js`, `AdminPanelView.jsx`, `UnifiedProductPipelineView.jsx`)
- Wspólna funkcja `resolveOrderedVisibleDescriptionSections` steruje kolejnością, ukrywaniem, sekcją `sekcjaTips` oraz układem obraz/tekst w podglądzie `TileSimulator` oraz w eksportach **Allegro**, **BaseLinker** i **InPost Von Halsky** (przy zachowaniu 100% wstecznej kompatybilności wywołań bez `contentProfile` oraz twardym wykluczeniu Sekcji 6 z opisu publicznego).
- W `AdminPanelView.jsx` rozbudowano modal tworzenia/edycji klienta o wybór presetu, ramki AI (`Bez ramki i nazwy marki` vs `Włoska ramka`), układu kafelków, punktorów, konfigurację sekcji `Porady i tipy`, zmianę kolejności góra/dół, ukrywanie opcjonalnych sekcji oraz własną treść Modułu 7.

---

## 3. Weryfikacja Produkcyjna
- **Pełna suita testów (`node --test src/modules/offer-optimizer-v2/tests/*.test.js`):** **`335/335 PASS`** (`0` fail, `0` skipped), w tym nowa suita `workspace_content_differentiation.test.js` weryfikująca presety 3 klientów, ochronę Sekcji 6, nienaruszony `prompt-master.service.js`, brak pikseli ramki w `CLEAN_NONE`, współdzielenie wyłącznie białej listy faktów opakowania, detekcję Jaccard, układ i ukrywanie sekcji w Allegro/BaseLinker/Von Halsky oraz izolację `pipeline_id`.
- **Składnia Backend (`node --check`):** `0` błędów we wszystkich zmodyfikowanych plikach Node.js.
- **Linter ESLint + Build Frontendu:** `AdminPanelView.jsx` (`0` błędów), `UnifiedProductPipelineView.jsx` (`0` nowych błędów / `0` nowych ostrzeżeń), `npm --prefix frontend run build` **PASS** (`vite build`).
