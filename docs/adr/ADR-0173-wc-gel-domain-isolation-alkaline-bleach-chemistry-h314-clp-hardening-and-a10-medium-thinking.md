# ADR-0173: Izolacja domenowa żeli do WC, chemia zasadowego wybielacza chlorowego (NaOCl/NaOH), rygor CLP dla H314 oraz kalibracja ThinkingLevel.MEDIUM dla Agenta 10

**Data:** 2026-11-10  
**Status:** Wdrożone i zweryfikowane testami regresyjnymi oraz E2E Live  
**Powiązane moduły:** `src/modules/offer-optimizer-v2/*`

---

## 1. Kontekst i Problematyka

Podczas audytu produkcyjnego wygenerowanego opisu dla **Dual Power żel do WC Candeggina 700 ml** (EAN `8050999570666`, kontretykieta `WE 648/2004` + klasyfikacja żrąca `H314` / `EUH206`) zidentyfikowano **9 powiązanych defektów merytorycznych, chemicznych, gramatycznych i regulacyjnych CLP/GPSR**, które przedostały się zarówno przez warstwę deterministyczną, jak i końcowego audytora AI (`Agent 10 – gemini-3.1-pro-preview`):

1. **Kalka międzykategorialna z płynu do fug i pleśni (`"ciemne naloty w fugach"`, `"tłuste osady"`):** Bazowy słownik `inci_mechanisms_pl.json` przypisywał podchlorynowi sodu (`sodium hypochlorite`) i tlenkowi kokaminy opis czyszczenia fug, a brak nadpisania wodorotlenku sodu (`sodium hydroxide`) dla WC przenosił wzmianki o tłuszczu z odtłuszczaczy kuchennych do żelu toaletowego. Ponadto `"środki wybielające na bazie chloru"` nie mapowało się na `sodium hypochlorite`, a kategoria `anionowe środki...` i `Sodium Laureth Sulfate` tworzyły zdublowany kafelek.
2. **Sprzeczność logiczno-chemiczna (`usuwa zacieki mineralne` / `kamień wapienny` przypisane do `NaOCl + NaOH`):** Zarówno generator FAQ (`google-suggest-faq.service.js` mieszający `wc_cleaner` z ogólną chemią łazienkową), jak i brak dedykowanej bramki walidacyjnej przypisywały zasadowemu wybielaczowi chlorowemu bez kwasu usuwanie osadów mineralnych (kamienia), które rozpuszczają wyłącznie kwasy.
3. **Błąd gramatyczny w Sekcji 1:** Kalka językowa `"butelka wykonana w częściowo z plastiku"`.
4. **Literówka omijająca Medical Whitelisting (`P303+P361+P353`):** Zapis `"W PRZYPADKU KONTATKU ZE SKÓRĄ"` omijał regułę zamiany `"KONTAKTU"` na allegrowe `"STYCZNOŚCI ZE SKÓRĄ"`.
5. **Rozbicie procedury `P303+P361+P353` na dwa punkty:** Splitowanie listy ostrzeżeń po kropce (`/\.\s+/`) odrywało drugie zdanie `"Spłukać skórę pod strumieniem wody lub prysznicem."` jako osobną linię.
6. **Wyciek surowego składnika chemicznego SDS jako ostrzeżenia CLP:** `"alkohole C12-14, etoksylowane, siarczanowane, sole sodowe."` pojawiało się jako punkt na liście CLP zamiast w stopce składu.
7. **Urwany fragment `P331` oraz błędna degradacja kodów przy `H314`:** Samodzielna linia `"NIE wywoływać wymiotów."` oraz współistnienie łagodnych kodów `P301+P312` i `P302+P352` zamiast żrących `P301+P330+P331` i `P303+P361+P353`, a także wycinanie ochrony oczu/twarzy z `P280` przy produktach `H314`/`H318`.
8. **Zdublowane ostrzeżenie o chlorze:** Wpis `EUH206` oraz osobny duplikat `"Może uwalniać niebezpieczne gazy (chlor)."`.
9. **Błędne umiejscowienie `"Nie połykać."`:** Wtrącenie pomiędzy procedury ratunkowe `P301` i `P303`.
10. **Zanik myślenia Agenta 10 na `ThinkingLevel.LOW`:** Weryfikacja telemetrii w bazie `AgentMetric` wykazała, że w 2 z 3 porannych uruchomień produkcyjnych `gemini-3.1-pro-preview` przy `ThinkingLevel.LOW` wykonywał `0` tokenów myślenia (`thoughtsTokenCount: 0`), przepuszczając oczywiste błędy pomimo poprawnych reguł w prompcie.

---

## 2. Podjęte Decyzje Architektoniczne i Naprawcze

1. **Warstwa referencyjna i deterministyczna Sekcja 3 (`inci_mechanisms_pl.json`, `deterministic-pipeline.engine.js`):**
   - Usunięto wzmianki `"w fugach"` z generycznych wpisów `sodium hypochlorite` i `cocamine oxide`, dodano `"środki wybielające na bazie chloru"` do aliasów `sodium hypochlorite` oraz zmapowano `"alcohols, c12-14, ethoxylated, sulfates, sodium salts"` na `sodium laureth sulfate`.
   - W `tryBuildDeterministicSection3` wprowadzono rozdzielne nadpisania dla `isToiletWc` vs `isMoldOrGrout` (w tym dedykowany wariant `sodium hydroxide` bez tłuszczu kuchennego oraz deduplikację `markIngredientUsed` zapobiegającą podwójnemu kafelkowi dla `Sodium Laureth Sulfate`).
   - W `sanitizeHtmlClaimsAndStopwords` (KROK K) dodano usuwanie wtrętów o fugach w produktach do WC oraz sprzecznych deklaracji usuwania kamienia/zacieków mineralnych dla mieszanin zasadowo-chlorowych bez kwasu (zachowując chelatację fosfonianową: *„zapobiegają odkładaniu się osadów mineralnych”*) i korektę gramatyczną `"w częściowo"` -> `"częściowo"`.

2. **Twarda higiena CLP/GPSR dla mieszanin żrących `H314` (`gpsr.safety.service.js`, `orchestrator.js`, `vision-extractor.service.js`, `deterministic-pipeline.engine.js`):**
   - Wprowadzono `normalizeClpPhraseText` (normalizacja `KONTAKTU` / `KONTATKU` -> `STYCZNOŚCI ZE SKÓRĄ`) oraz `isOrphanClpOrRawIngredientFragment` eliminujący sieroty po `P303`/`P331`/`EUH206` i surowe składniki typu `alkohole C12-14, etoksylowane, siarczanowane, sole sodowe` bez uszkadzania ostrzeżeń kosmetycznych (`"Zawiera witaminę A"`, `"Zawiera hydroksykwasy"`).
   - Poprawiono dzielenie ostrzeżeń w Kroku 11b w `gpsr.safety.service.js` na granice nowych linii i kodów CLP (koniec rozcinania zdań `P303+P361+P353` i `P301+P330+P331` po kropce).
   - Przy obecności `H314` / `P301+P330+P331` / `P303+P361+P353` automatycznie wycinane są łagodniejsze duplikaty `P301+P312` i `P302+P352`, zachowywana jest pełna ochrona oczu/twarzy w `P280` (dla `H314`/`H318`), a `"Nie połykać."` porządkowane jest bezpośrednio po `P102` przed kodami ratunkowymi `P301+`.
   - Rozbudowano `BACK_PACK_INCI_PROMPT` w `vision-extractor.service.js` o zakaz mieszania list składników z sekcją `warnings` oraz odcinanie list `"Zawiera..."`.

3. **Izolacja FAQ SEO/GEO (`google-suggest-faq.service.js`):**
   - Oddzielono kategorię `wc_cleaner` (`isWcSpecific`) od ogólnej łazienki (`isBathroomSpecific`) oraz wprowadzono detekcję kwasów (`hasAcid`). Żel chlorowy WC otrzymuje pytania o przebarwienia, zżółknięcia i osady organiczne pod obrzeżem muszli i linią wody — bez wanien, kabin, fug i kamienia wapiennego.

4. **Bramki walidacyjne i swarm AI (`validators/index.js`, `Agent_6/10/11_prompt_v4.md` -> `prompts/*_compiled.md`, `nodes.config.js`):**
   - Rozszerzono `validate_section6_compliance` oraz `validate_domain_and_chemical_logic` o **Regułę 18** (kalka fugowa w WC), **Regułę 19** (wybielacz zasadowy vs kamień/zacieki mineralne), **Regułę 20** (gramatyka `"w częściowo"`) oraz **Regułę 21** (spójność CLP Sekcji 6, w tym `KONTATKU`, urwane frazy, wyciek SDS, `P301+P312` vs `H314`). Przekazano pełny kontekst domenowy (`productName`, `inci`, `detergentComposition`) do wszystkich wywołań `sanitizeHtmlClaimsAndStopwords` w `orchestrator.js`.
   - W `nodes.config.js` przestawiono Agenta 10 z `ThinkingLevel.LOW` na `ThinkingLevel.MEDIUM` (wymusza stabilne rozumowanie prawno-logiczne bez ~12k-tokenowego narzutu i ryzyka timeoutu `HIGH`). Przekompilowano prompty przez `prompt-compiler.js`.

---

## 3. Weryfikacja i Rezultaty

- **Pełny pakiet testów jednostkowych (`offer-optimizer-v2/tests/*.test.js` — 14 plików):** `257/257` asercji **PASS** (`0` błędów, `0` pominiętych). Do `gpsr.safety.test.js` oraz `validators.test.js` dodano wrogie testy regresyjne odtwarzające dokładny brudny wejściowy HTML i dane z etykiety produkcyjnej (`ADR-0173`) wraz z testami kontrolnymi przeciwko fałszywym alarmom (kosmetyki z retinolem, preparaty na pleśń w fugach, chelatacja fosfonianami).
- **Weryfikacja Live E2E na zdjęciu `media_1794293797731_8f4b5cf0.jpg`:**
  - Multimodalny OCR + deterministyczna Sekcja 3 + Sekcja 6 + FAQ SEO przeszły walidację `validate_section6_compliance` (`valid: true`) oraz `validate_domain_and_chemical_logic` (`valid: true`).
  - Live `Agent 10` (`gemini-3.1-pro-preview`, `ThinkingLevel.MEDIUM`) na brudnym tekście wyjściowym użytkownika wykonał `4623` tokeny myślenia (`15452` total w `35.4s`) i wygenerował `7` precyzyjnych patchy naprawiających wszystkie zgłoszone usterki.
- **Pliki zmodyfikowane:** `nodes.config.js`, `gpsr.safety.service.js`, `vision-extractor.service.js`, `orchestrator.js`, `inci_mechanisms_pl.json`, `deterministic-pipeline.engine.js`, `google-suggest-faq.service.js`, `validators/index.js`, `Agent_6/10/11_prompt_v4.md`, `prompts/*_compiled.md`, `tests/config.test.js`, `tests/gpsr.safety.test.js`, `tests/validators.test.js`.

