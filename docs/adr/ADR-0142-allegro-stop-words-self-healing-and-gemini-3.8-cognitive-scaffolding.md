# ADR-0142: Eliminacja słów zakazanych Allegro 2026, samonaprawa w orkiestratorze oraz scaffolding kognitywny dla Gemini 3.8 Flash bez thinkingLevel

**Data:** 2026-10-14  
**Status:** Zaakceptowany i Wdrożony (157/157 testów potoku *.test.js PASSED)

---

## 1. Kontekst i Identyfikacja Problemów

W potoku optymalizacji ofert EAN `offer-optimizer-v2` zidentyfikowano szereg incydentów jakościowych i regulacyjnych:

1. **Przenikanie słów zakazanych Allegro i UOKiK:**
   - W generowanych sekcjach ofertowych (moduły A6 i A7) oraz korzyściach technicznych (A4 i A5) pojawiały się zakazane przez regulamin Allegro 2026 i UOKiK określenia perswazyjne i overpromising (np. "gwarancja oryginalności", "100% zadowolenia", "najlepszy produkt", "hit", "promocja").
2. **Paraliż decyzyjny Agenta 10 (Arbiter Końcowy):**
   - Agent 10, zamiast dokonywać korekty zakazanych zwrotów, bezkrytycznie przepuszczał je do finalnego obiektu oferty.
   - *Przyczyna w prompcie:* Prompt Agenta 10 zawierał mylącą dyrektywę: *"Kontrole mechaniczne wykonał JUŻ kod (...) stop-words (...) NIE powtarzasz ich"*, co zwalniało model z audytu słów zakazanych.
   - *Przyczyna w walidatorze kodowym:* Funkcja `scan_stopwords` posiadała zdezaktualizowaną, 17-elementową listę słów i działała pasywnie (zgłaszała błąd HITL lub nie wykrywała współczesnych fraz zakazanych).
   - *Przyczyna w orkiestratorze:* Pętla poprawek `repair_patches` w `orchestrator.js` używała pojedynczego `targetText.replace(p.find_exact, p.replace_with)`, który przy wielokrotnym wystąpieniu frazy naprawiał jedynie pierwsze trafienie.
3. **Wycofanie parametru `thinkingLevel` dla `gemini-3.8-flash`:**
   - Oficjalna specyfikacja Google GenAI SDK wycofuje stosowanie parametru `thinkingLevel` dla modeli z rodziny Flash (`gemini-3.8-flash`). Podanie `thinkingLevel` na tych modelach powoduje błędy HTTP 400 (nieprawidłowy parametr żądania).
   - Jednocześnie usunięcie myślenia na modelach Flash stwarzało wysokie ryzyko degradacji kognitywnej, halucynacji i powrotu do generowania zakazanych fraz w warunkach ubogiego kontekstu.

---

## 2. Podjęte Decyzje Architektoniczne

### A. Precyzyjna Taksonomia Modeli i Bezpieczeństwo SDK
- W pliku `config/nodes.config.js` usunięto parametr `thinkingLevel` dla wszystkich węzłów opartych na `gemini-3.8-flash` (węzły 2, 4, 5, 6, 7, 9, 11).
- Zachowano `thinkingLevel: ThinkingLevel.HIGH` wyłącznie dla modeli klasy Pro (`gemini-3.1-pro-preview`) w węzłach 1 (OSINT & Ingestion) i 10 (Arbiter Końcowy i Strażnik Prawny).
- W `ai.wrapper.js` zabezpieczono Krok 2 (Two-Step JSON) przed sztucznym wymuszaniem `ThinkingLevel.LOW` na modelach Flash nieposiadających tej konfiguracji.

### B. Bezwzględna Eliminacja Słowa "Oryginalny" i Przywrócenie Kanonicznej Białej Listy Emoji
- **Eliminacja słowa "oryginalny":** W [services/gpsr.safety.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/services/gpsr.safety.service.js) usunięto z kodu źródłowego wstrzykiwanie zwrotu `"w oryginalnym opakowaniu"`, zastępując go neutralnym opisem fizycznym `"w szczelnie zamkniętym opakowaniu"`.
- **Walidator leksykalny:** W [validators/index.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/validators/index.js) wdrożono bezwzględne wzorce rdzenia `\borygina[łl][a-z]*\b` oraz `\boryginaln[a-z]*\b` – zakaz obejmuje KAŻDĄ formę gramatyczną (oryginalny, oryginalna, oryginalne, oryginalnym, oryginalnych, oryginalności itd.) bez żadnych wyjątków.
- **Kanoniczna biała lista emoji:** W [SHARED_RULES_v4.1.md](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/docs/SHARED_RULES_v4.1.md) i promptach przywrócono ściśle oficjalną białą listę Allegro: nagłówki `s1 ⭐`, `s2 ❓`, `s3 ⚙️`, `s4 ✍️`, `s5 ⚖️`, `s6 ⚠️` oraz punktory `⭐ ❓ ⚙️ ✍️ ⚖️ ⚠️ ✅ ✔️ ☑️ ❌ ➡️ ♻️ ☘ ☂️`. Wycięto wszystkie niezatwierdzone ikony (`🌟`, `📝`, `📊`, `🛡️`).

### C. Czysty Audyt Semantyczny Agenta 10 (Bez Sztucznego Betonowania i Regexów w Kodzie)
- Odrzucono koncepcję sztucznych regexów zastępczych w kodzie orkiestratora ("betonowania słów"), która niszczyła fleksję języka polskiego i kontekst innych zdań.
- Orkiestrator przekazuje wykryte słowa zakazane z pre-audytu kodowego bezpośrednio do `audit_report` Agenta 10 (Gemini 3.1 Pro z ThinkingLevel.HIGH).
- Agent 10 jako arbiter prawno-semantyczny ma obowiązek wygenerować w `patches` kontekstową, naturalną gramatycznie łatkę naprawczą (`find_exact` -> `replace_with`), która zachowuje płynność polszczyzny.
- Aplikowanie łatek odbywa się czysto i deterministycznie poprzez precyzyjną podmianę wskazanego przez model fragmentu.

### D. Scaffolding Kognitywny dla Modeli Flash (Doktryna Zamkniętego Świata)
W związku z brakiem mechanicznego parametru `thinkingLevel`, do promptów węzłów Flash wstrzyknięto dyrektywy kognitywne kompensujące brak myślenia wewnętrznego:
1. **Agent 4 (Chemical & AEO):** Zakaz wykraczania poza dostarczony blok RAG; sekwencyjna weryfikacja w pamięci roboczej przed emisją korzyści.
2. **Agent 5 (Legal Shield):** Zakaz zmyślania pytań/odpowiedzi AEO; eliminacja słów zakazanych z FAQ; dopasowanie ostrzeżeń GPSR ściśle do postaci fizycznej wyrobu.
3. **Agent 6 (Product Storyteller):** Rygorystyczny zakaz słów zakazanych (§A); sekwencyjne planowanie sekcji w pamięci roboczej; obowiązek operowania wyłącznie faktami z A1 i RAG.
4. **Agent 7 (Brand Experience):** Doktryna zamkniętego świata; zakaz obietnic bez pokrycia w sekcji 4.
5. **Agent 2 (Sentiment Analyzer):** Zakaz syntezy i fabrykowania recenzji; ścisły rygor trybu COLD START w razie braku opinii.
6. **Agent 9 (Vision & AI Act):** Architektura dwufazowa w pamięci roboczej (Faza 1: detekcja surowa OCR/pikseli, Faza 2: ocena regulaminowa Allegro/AI Act).
7. **Linter Regresji Promptów:** Zapewniono, że żaden skompilowany plik promptu w `prompts/*.md` nie zawiera zastrzeżonych słów "gemini" ani "thinking" (wymóg testu `tests/config.test.js`).

---

## 3. Skutki i Weryfikacja

- Pełna suita testów potoku `src/modules/offer-optimizer-v2/tests/*.test.js` (9 suit testowych, 157 asercji) przechodzi w 100% na zielono (157 PASS, 0 FAIL).
- Wyeliminowano ryzyko błędu HTTP 400 z Google API przy zapytaniach do `gemini-3.8-flash`.
- Wprowadzono zamkniętą pętlę samonaprawy (Closed Loop), która gwarantuje eliminację zakazanych słów na etapie generowania oraz bezstratną naprawę mechaniczną przez Agenta 10 i orkiestrator.
