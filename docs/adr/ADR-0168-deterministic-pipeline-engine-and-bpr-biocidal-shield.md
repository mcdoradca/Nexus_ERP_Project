# ADR-0168: Silnik Deterministyczny Potoku EAN Pipeline V2, Samoucząca Baza Mechanizmów INCI oraz Tarcza Prawna BPR 528/2012 (Biobójcze) / WE 655/2013 (Kosmetyczne) / Allegro 2026

## Status
Accepted (2026-11-01)

## Context
Potok generowania ofert e-commerce (`src/modules/offer-optimizer-v2`) wykonywał dotychczas od 9 do 14 wywołań modeli LLM (w tym wielokrotne wywołania `gemini-2.5-flash` z Google Search Grounding oraz `gemini-3.1-pro-preview` w węźle A10), zużywając średnio ~55 000+ tokenów na jeden produkt (koszt ~4,00 PLN / opis). Analiza wykazała, że:
1. Wiele zadań w potoku ma charakter czysto deterministyczny i algorytmiczny (czyszczenie 35 KB szablonów HTML/SVG `"kod karty"` z PIM, wykluczenia segmentowe Pratfall/VoC przy braku recenzji w A2, tłumaczenie znanych składników INCI na korzyści konsumenckie w A4, kompilacja ostrzeżeń GPSR/CLP i ziaren AEO FAQ w A5, budowa tabeli parametrów technicznych w Sekcji 5 oraz sekcji bezpieczeństwa GPSR/CLP w Sekcji 6, a także formatowanie emoji i pogrubień).
2. Agent 0 (`vision-extractor.service.js`) musi pozostać aktywny na zdjęciu frontowym, a jego ekstrakcja wymaga rozszerzenia o **Składniki Wiodące z Frontu Opakowania (`kluczowe_skladniki_front` -> `Składniki wiodące (Front)`)**, które stanowią główny wyróżnik sprzedażowy w Sekcjach 1, 3, 4 i 5. Jednocześnie Back-of-Pack INCI OCR nie powinien powtórnie skanować frontowego packshotu, gdy w galerii dostępne są zdjęcia tylnej etykiety.
3. Żaden z oferowanych produktów nie posiada statusu prawnego produktu biobójczego w rozumieniu Rozporządzenia Parlamentu Europejskiego i Rady (UE) nr 528/2012 (BPR) ani polskiej Ustawy o produktach biobójczych. W konsekwencji **zarówno tytuły ofert (`title` / `product_name`), jak i wszystkie sekcje opisu HTML** muszą być w 100% wolne od roszczeń biobójczych, antybakteryjnych, przeciwwirusowych, grzybobójczych oraz dezynfekujących (w tym kalek z włoskich etykiet typu *Igienizzante*, *Antibatterico*, *Disinfettante*), a także zgodne z Rozp. 655/2013, Rozp. 1223/2009 oraz regulaminem Allegro 2026 (§A Stop-words).

## Decision
1. **Rozszerzenie Agenta 0 Vision (`vision-extractor.service.js`):**
   - Dodano pole `kluczowe_skladniki_front` do `FRONT_VISION_PROMPT` oraz `frontVisionSchema`, mapowane do `pimFeatures['Składniki wiodące (Front)']`.
   - Dodano funkcję `sanitizeVisionFrontText(str)`, która już na etapie OCR neutralizuje obce i polskie zwroty biobójcze z frontu opakowania (*Antibatterico*, *Igienizzante*, *Disinfettante*, *Antybakteryjny*, *Dezynfekujący*, *99,9% bakterii*) na bezpieczne prawnie określenia higieniczno-czyszczące (*higieniczna czystość*, *higienicznie oczyszczający*).
   - W `extractInciFromBackPack` dodano parametr `skipFrontUrl`, eliminujący zbędne powtórne wywołanie Vision AI na zdjęciu frontowym, gdy produkt posiada dedykowane zdjęcia tylnej etykiety.

2. **Twarda Tarcza Prawna BPR 528/2012, WE 655/2013 i Allegro 2026 (`validators/index.js` & `services/deterministic-pipeline.engine.js`):**
   - W `validators/index.js` wdrożono walidator `scan_biocidal_claims_lexical(html)` oraz rozszerzono `scan_medical_claims_lexical(html)` o pełne spektrum polskich i obcojęzycznych określeń biobójczych (`antybakteryjn*`, `przeciwbakteryjn*`, `przeciwwirusow*`, `antywirusow*`, `biobójcz*`, `bakteriobójcz*`, `wirusobójcz*`, `grzybobójcz*`, `pleśniobójcz*`, `przeciwgrzybicz*`, `dezynfekuj*`, `dezynfekcj*`, `odkażaj*`, `odkaża*`, `sterylizuj*`, `antibatteric*`, `igienizzant*`, `disinfettant*`, `99,9% bakterii/wirusów/zarazków/drobnoustrojów`).
   - Wdrożono deterministyczny sanitizer tytułów ofert `sanitizeOfferTitle(rawTitle)` oraz sanitizer sekcji HTML `sanitizeHtmlClaimsAndStopwords(htmlStr)`, które automatycznie przekształcają zakazane roszczenia w bezpieczne prawnie sformułowania kosmetyczne i czyszczące.

3. **Rozwijalny Silnik Deterministyczny (`services/deterministic-pipeline.engine.js`) i Samoucząca Baza Składników (`data/reference/inci_mechanisms_pl.json`):**
   - `cleanFeaturesForPrompt(featuresObj)`: wycina z payloadów przesyłanych do LLM wielokilobajtowe szablony HTML/SVG (`"kod karty"`, `base64`), oszczędzając ~8 000–12 000 tokenów wejściowych na każdym wywołaniu.
   - `buildDeterministicA2Result(ctx)`: zastępuje puste wywołanie LLM Agenta 2 deterministycznym wykluczeniem segmentowym Pratfall (`0 tokenów`).
   - `tryBuildDeterministicSection3(ctx)` + `learnFromAgent4Output(a4Result, isChemical)`: buduje Sekcję 3 (`⚙️/⚡`) oraz `a4_result` w `0 ms` (`0 tokenów`) na podstawie lokalnej bazy `inci_mechanisms_pl.json` i wyróżników z frontu opakowania (`Składniki wiodące (Front)`). W przypadku napotkania rzadkich składników wymagających wywołania Agenta 4, funkcja `learnFromAgent4Output` automatycznie dopisuje nowe mechanizmy do sekcji `auto_learned` w `inci_mechanisms_pl.json`.
   - `buildDeterministicA5Result(ctx)`: generuje w `0 ms` (`0 tokenów`) zestaw ostrzeżeń GPSR/CLP oraz matrycę pytań i odpowiedzi AEO FAQ.
   - `buildDeterministicSection5(ctx)` oraz `buildDeterministicSection6(ctx)`: kompilują w 100% zgodne ze standardem Allegro i GPSR/CLP Sekcję 5 (`⚖️`) oraz Sekcję 6 (`⚠️`).
   - Zunifikowano wytyczne sensoryczne, Efekt Pratfall, Kotwicę Rutyny i mobilne skanowanie F-pattern (`<b>`) bezpośrednio w prompcie Agenta 6 (`docs/Agent_6_prompt_v4.md` + `docs/SHARED_RULES_v4.1.md`), co pozwoliło wyeliminować osobne wywołanie LLM w węźle A7 oraz uruchomić warunkowy `FAST-PASS` w węźle A10, gdy wszystkie 9 bramek walidacyjnych zwraca 0 błędów.

## Consequences
- Redukcja kosztu tokenowego z ~55 000+ tokenów (~4,00 PLN) do ~4 500–9 000 tokenów (~0,10–0,25 PLN / opis) przy wyższej czytelności mobilnej (F-pattern) i pełnym bezpieczeństwie prawnym (BPR 528/2012, WE 655/2013, GPSR, Allegro 2026).
- Automatyczny rozwój lokalnej bazy wiedzy (`inci_mechanisms_pl.json`) z każdym kolejnym produktem posiadającym nowe składniki aktywne.

