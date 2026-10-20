# ADR-0160: Bezwzględny zakaz znaku CE w kosmetykach oraz integralność fizykochemiczna parametru pH

## Status
ZAAKCEPTOWANY / WDROŻONY PRODUKCYJNIE

## Kontekst i Identyfikacja Problemu
W audycie potoku EAN Pipeline (Offer Optimizer v2) zidentyfikowano dwa kardynalne błędy w generowaniu Sekcji 5 (`<h2>⚖️ Parametry Techniczne</h2><ul>...</ul>`):
1. **🚨 Kardynalny błąd formalno-prawny w parametrach:** Model wpisywał `Certyfikaty: CE`. Kosmetyki podlegają pod unijne Rozporządzenie (WE) nr 1223/2009 i **bezwzględnie NIE posiadają oznakowania CE**. Oznakowanie CE jest zastrzeżone wyłącznie dla produktów objętych dyrektywami Nowego Podejścia (m.in. wyrobów medycznych MDR 2017/745, zabawek 2009/48/WE, sprzętu elektrycznego EMC/LVD, maszyn czy ŚOI 2016/425). Umieszczenie znaku CE na kosmetyku lub w jego parametrach stanowi rażący błąd formalno-prawny, naruszenie art. 30 ust. 2 Rozporządzenia 765/2008, art. 20 Rozporządzenia 1223/2009 oraz bezprawne wprowadzanie konsumenta w błąd (art. 6 Ustawy o przeciwdziałaniu nieuczciwym praktykom rynkowym) poprzez fałszywe sugerowanie certyfikacji medycznej/państwowej.
2. **🚨 Bzdura fizykochemiczna w parametrach:** Model wpisywał `pH: Zbilansowane` dla suchego pudru mineralnego (talk w proszku). Odczyn pH z definicji fizykochemicznej ($pH = -\log_{10}[H_3O^+]$) mierzy się i określa **wyłącznie w obecności wolnej fazy wodnej**. Czysty puder mineralny, talk, cienie, proszki bezwodne czy czyste oleje nie tworzą środowiska wodnego i fizykochemicznie **nie posiadają parametru pH**. Podawanie „zbilansowanego pH” lub wartości liczbowej dla proszku to bezmyślna halucynacja marketingowa.

## Podjęte Decyzje Architektoniczne

### 1. Rozszerzenie Single Source of Truth (SOT-02)
W `src/modules/offer-optimizer-v2/docs/RAG_SOT_02_Prawo_Kosmetyczne_i_Chemiczne_UE.md` utworzono Rozdział 5:
- **Zakaz oznakowania CE dla kosmetyków i chemii:** Formalny zakaz umieszczania `Certyfikaty: CE` dla kosmetyków i chemii gospodarczej. Zezwolenie na parametr `Certyfikaty:` wyłącznie dla poświadczonych certyfikatów eko/jakościowych (ECOCERT, COSMOS, Vegan Society, Leaping Bunny) lub autentycznych wyrobów medycznych MDR.
- **Rygor fizykochemiczny pH:** Wyjaśnienie mechanizmu dysocjacji elektrolitycznej i zakaz przypisywania parametru pH oraz zwrotów „Zbilansowane/Neutralne” produktom bezwodnym (pudry, talki, artykuły, oleje). Zezwolenie na pH wyłącznie dla roztworów z fazą wodną z twardą wartością liczbową z PIM.

### 2. Kognitywna Rekompilacja Promptów Agenta 6
W `Agent_6_prompt_v4.md` oraz `Agent_6_compiled.md` usunięto generyczne narzucanie parametrów `Certyfikaty, pH` w Sekcji 5. Zastąpiono je kognitywnym rygorem:
- Zakaz znaku CE w kosmetykach.
- Rygor fizykochemiczny parametru pH (analiza postaci: faza wodna vs talk/puder bezwodny vs artykuł).
- Zasada ZERO NULL: brak potwierdzonej liczby z PIM lub brak fazy wodnej = całkowite pominięcie punktu `<li>`.

### 3. Deterministyczna Tarcza Sanitizująca `sanitizeSection5Html`
W `src/modules/offer-optimizer-v2/orchestrator.js` zaimplementowano funkcję `sanitizeSection5Html(htmlStr, pimData)` uruchamianą bezpośrednio po wygenerowaniu Sekcji 5 przez Agenta 6, przed zamrożeniem hashem SHA-256:
- Wykrywa i usuwa `<li>Certyfikaty: CE</li>` dla wyrobów niemedycznych. W listach łączonych (np. `ECOCERT, CE`) wycina token `CE`, pozostawiając legalne certyfikaty.
- Wykrywa postać bezwodną (puder, talk, cień, artykuł, olej) i bezwzględnie wycina jakikolwiek parametr `<li>pH:...</li>`.
- Wykrywa niemiarodajne frazy marketingowe (`Zbilansowane`, `Neutralne`, `Fizjologiczne`, `Brak danych`, `null`) dla pozostałych produktów i usuwa zanieczyszczone punkty `<li>`.

### 4. Walidator Jakościowy `validate_section5_compliance`
W `src/modules/offer-optimizer-v2/validators/index.js` dodano i wyeksportowano funkcję `validate_section5_compliance(html, options)`, która formalnie weryfikuje brak nielegalnego CE i poprawność fizykochemiczną pH.

### 5. Ochrona Modułu SDS
Potwierdzono brak jakichkolwiek modyfikacji w `src/modules/sds/**`. Moduł tłumaczenia kart charakterystyki pozostał w 100% nienaruszony.

## Weryfikacja i Testy
Wdrożono zestaw testów jednostkowych w `src/modules/offer-optimizer-v2/tests/section5.sanitizer.test.js`:
- Sprawdzenie wycinania CE z kosmetyków oraz zachowania CE dla wyrobów medycznych MDR.
- Sprawdzenie wycinania CE z list łączonych (`ECOCERT, CE`).
- Sprawdzenie wycinania pH dla talku mineralnego i pudrów oraz wycinania fraz `pH: Zbilansowane`.
- Sprawdzenie zachowania prawidłowych wartości liczbowych pH (np. `5.5`) dla kremów/roztworów wodnych.
- Wynik pełnej suity testów integracyjnych: 226/226 testów pass (`0 fail`).
