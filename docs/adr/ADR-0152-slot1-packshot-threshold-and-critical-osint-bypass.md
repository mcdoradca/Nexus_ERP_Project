# ADR-0152: Reguła Progowa 5 Zdjęć dla Slotu 1, Ochrona Przed Pętlą Agenta 1 (Bypass OSINT) oraz Serwerowy Build Frontendu CI/CD

## Data
2026-10-19

## Status
Zaakceptowany i Wdrożony

## Kontekst
1. **Slot 1 (Packshot główny z BaseLinkera):**
   - Miniaturki produktów importowane automatycznie z BaseLinkera cechują się niską rozdzielczością i słabą jakością kompresji. W efekcie operator i tak musiał ręcznie podmieniać zdjęcie w Slocie 1 przed wygenerowaniem scenerii AI.
   - Nowa reguła biznesowa: Podczas interpolacji EAN (`handleAutofillEAN`) oraz ładowania z bazy nie przekazujemy pierwszego zdjęcia z BaseLinkera do Slotu 1, **chyba że** z BaseLinkera pobrano **więcej niż 5 zdjęć** (`images.length > 5`). Pobranie powyżej 5 zdjęć jednoznacznie identyfikuje ofertę wcześniej poprawioną i wzbogaconą w Nexusie.
   - Wymóg integralności: Uruchomienie generowania i potoku EAN Pipeline (`handleTriggerPipeline`) wymaga obecności packshotu wysokiej jakości w Slocie 1; brak zdjęcia blokuje start z czytelnym alertem.
2. **Pętla i zawieszanie się Agenta 1 (OSINT) przy znanych danych INCI / GPSR:**
   - W produktach takich jak Sweet Home (EAN `8059602247483`) skład INCI był w 100% zdefiniowany w PIM, a podmiot odpowiedzialny (Suarez Company S.r.l.) został poprawnie zidentyfikowany z rejestru `brand.responsible.registry.json`.
   - Mimo to orkiestrator uruchamiał Agenta 1 na 4 minuty (z timeoutem 60s/180s) z powodu obecności pobocznych, marketingowych parametrów w `missingFields` (np. brak cechy `line` - "Linia").
   - Dodatkowo w prompcie Agenta 1 sekcja 3 (GPSR) nakazywała przeszukiwanie Google pod kątem siedziby firmy, marnując tokeny i czas na zbędne kwerendy dla podmiotu już zapisanego w bazie.
3. **Dezaktualizacja frontendu na serwerze produkcyjnym OVH:**
   - W pliku `.github/workflows/deploy.yml` krok `git clean -fd` na serwerze OVH usuwał katalog `frontend/dist` (ignorowany przez git), przez co Nginx serwował stary build lub brakowało najnowszego kodu generowania równoległego slotów.

## Decyzje Architektoniczne
1. **Reguła progowa 5 zdjęć w `UnifiedProductPipelineView.jsx`:**
   - W `handleAutofillEAN` oraz `useEffect` inicjalizacji sprawdzany jest warunek `isModifiedCard = blImages.length > 5`.
   - Gdy `blImages.length <= 5`: Slot 1 otrzymuje bilet `{ originalUrl: '', alerts: ["Wymagany nowy packshot wysokiej jakości"], isCompliant: false, replacedUrl: null }`, a `newProductForm.imageUrl` jest czyszczone.
   - Gdy `blImages.length > 5`: pierwsze zdjęcie z BL trafia do Slotu 1 jako `originalUrl`.
   - W `handleTriggerPipeline`: zaimplementowano twardą walidację `hasValidPrimaryImg`. Jeśli Slot 1 jest pusty, proces zatrzymuje się przed zapisem i odpaleniem potoku.
2. **Rozdzielenie parametrów krytycznych od opcjonalnych w `orchestrator.js`:**
   - Wprowadzono `criticalMissing`:
     - `inci`: brak poprawnego składu INCI
     - `eu_responsible_person`: brak podmiotu odpowiedzialnego w PIM oraz w rejestrze `brand.responsible.registry.json`
     - `brand`: brak marki
     - `product_name`: brak nazwy
   - Parametry marketingowe (`line`, `country_of_origin`) oraz opcjonalne parametry Allegro nie trafiają do `criticalMissing`.
   - Jeśli `criticalMissing.length === 0`:
     - OSINT pre-scraper (`osintScraper.searchAndExtract`) NIE jest uruchamiany.
     - Agent 1 zostaje oznaczony jako `SKIPPED`, a potok natychmiast przechodzi do `RUN_A2`.
3. **Sterylizacja promptu Agenta 1 w przypadku znanego podmiotu odpowiedzialnego:**
   - Jeśli Agent 1 musi wystartować (np. brak INCI), a `hasResponsible` jest prawdą, sekcja 3 promptu jest dynamicznie zastępowana twardym zakazem kwerend GPSR w Google Search i poleceniem przepisania podmiotu z rejestru.
4. **Kompilacja produkcyjna frontendu na serwerze OVH (`deploy.yml`):**
   - Usunięto zwodniczy krok transferu SCP.
   - Dodano budowanie frontendu (`npm install && npm run build`) bezpośrednio na serwerze produkcyjnym wewnątrz katalogu `/var/www/nexus/frontend` zaraz po `git clean -fd`.

## Konsekwencje
- Wyeliminowano zacięcia i timeouty Agenta 1 na znanych markach i produktach z wypełnionym INCI.
- Bezpieczny, natychmiastowy przeskok potoku do Agenta 2 (0 tokenów, 0s opóźnienia dla znanych produktów).
- Zagwarantowano wysoką jakość packshotu w Slocie 1 poprzez wymuszenie uploadu lub inteligentną detekcję karty już poprawionej (> 5 zdjęć).
- CI/CD na serwerze OVH gwarantuje 100% spójność wdrożonego frontendu z kodem w gałęzi `main`.
