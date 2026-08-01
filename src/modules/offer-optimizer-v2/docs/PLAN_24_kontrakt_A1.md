# PLAN DZIAŁANIA ZADANIE 24 (Wdrożenie D23 - Kontrakt A1)

Plan wdrożenia został podzielony na następujące kroki, realizowane offline na plikach lokalnych:

## Krok 1: Poprawka pliku źródłowego `Agent_1_prompt_v4.md`
Zgodnie z poleceniem i hipotezą 4, dokonam edycji źródłowego promptu dla Agenta 1 (`src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md`). Z sekcji "ZAKRES POZYSKANIA" usunę `brand`, `line`, `mpn`, i inne zakazane, pozostawiając jedynie `country_of_origin` i `research_sources_used[]`. Z sekcji "WYJŚCIE" zredukuję listę do `country_of_origin` oraz `research_sources_used[]`. Zostanie całkowicie usunięta sekcja "FLAGA missing_critical_data". Następnie dokonam rekompilacji skryptu kompilatora lub ręcznie zaktualizuję plik docelowy `prompts/Agent_1_compiled.md`, tak by nie posiadał tych stringów. Zrzucę log z gita oraz treść jako dowód.

## Krok 2: Adaptacja `a1Schema` w `orchestrator.js`
Zaktualizuję statyczny zarys schematu `a1Schema` w linii 14, usuwając stamtąd obiekty `line` oraz `product_name`. Pozostawione i wymagane będa wyłącznie `country_of_origin` oraz `research_sources_used`. W raporcie dostarczę pełny nowy obiekt wraz ze wskazaniem modyfikowanych linii.

## Krok 3: Zasada P1-first w Orkiestratorze
W zmodyfikowanym `orchestrator.js` (od linii 165), zbuduję filtr eliminujący z `missingFields` każde pole, które w `extracted_data` miało niepustą wartość `.source`. Dodatkowo, podczas pakowania odpowiedzi od A1 i nadawania im `source: "a1"`, system nie pozwoli na nadpisanie zmiennych, które pochodzą już z bezpiecznych warstw P1 (np. baselinker/description) co będzie rzutowało je na listę ostrzeżeń `A1_FIELD_REJECTED`. Na koniec wygeneruję stan offline dla obiektu Equilibra z dodanym kluczem linia z A1 próbującym wymusić zapis, co udowodni blokadę.

## Krok 4: Eliminacja wartości w `extracted_data` bez `source`
Ustalono, dlaczego `brand` (Equilibra) zyskał wartość przy `source: null` (został on nadpisany "manualnie" podczas symulacji dowodowej Z-23 bez przekazania drugiego parametru), pomimo to - Orkiestrator otrzyma zabezpieczenie (sanitizację) na poziomie ładowania `extracted_data`. W ten sposób zagwarantujemy, że żadne pole wchodzące w cykl maszynowy bez poprawnie ustrukturyzowanego tagu `source` nie będzie miało przypisanej wartości, wymuszając jej sprowadzenie do literału `null`. 

## Krok 5: Aktualizacja ADR - `.agents/.ai-memory.md`
Zgodnie z regułą (wpis o zadaniu po werdykcie), zmodyfikuję dziennik pod kątem E4a(Z23) wskazując jego faktyczne zakończenie poprzez Z23-DOK, i urealnię opisy na temat halucynacji `line`, by w pełni odwzorować zastany i oceniony rezultat bez zakładania uprzednio sukcesu. Przedstawię diff.
