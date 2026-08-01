# [PLAN DZIAŁANIA] ZADANIE 36 — domknięcie potoku do publikowalnej oferty

## 1. Reguła sklejania & Infrastruktura (A5, A6)
- **Sklejanie (orchestrator.js / warianty):** Zmodyfikuję logikę scalania rozbitych ciągów INCI (jak w przypadku `Glyceryl Stereate` + `Aqua`), upewniając się, że sklejenie zapada (i nadpisuje węzeł) **wyłącznie**, gdy uzyskany, nowy element zgłasza trafienie "TAK" w glosariuszu. Jeśli jest to chybienie, ciągi pozostają osobne (lub wg ustaleń glosariusza).
- **A5 (Tarcza prawna):** Skompiluję odpowiedni prompt kompilatorem, narzucę zerową temperaturę i limity wycinane kodem. Dodam twardą asercję powodującą stan HALT w razie napotkania komunikatu `BLOCKED_CRITICAL_LEGAL_BREACH`. Ostrzeżenia prawne będę propagował znak-w-znak.
- **A6 (Copywriter):** Skompiluję prompt A6. Oprogramuję algorytm obróbki kodu HTML - odrzucający wszystkie z nieautoryzowanymi tagami poprzez pakiet baterii (walidatory `validate_html_whitelist`, stopwords itd.). Co najważniejsze, węzeł A6 przeliczy `sha256` dla wygenerowanych sekcji 3, 5, 6 i zapisze je do `state.frozen_hashes`.

## 2. Zaawansowane Węzły (A7, A10) & Write-Back
- **A7 (Psychologia):** Kod węzła zostanie odseparowany tak, by w ogóle nie wysyłał sekcji 3, 5, 6 do modelu LLM, a jedynie 1, 2, 4. Po zwróceniu odpowiedzi przeliczę ponownie hashe sekcji 3, 5, 6 — każda rozbieżność zwróci status zablokowany `FROZEN_SECTION_VIOLATION`. Wyjście tak samo zabezpieczone zestawem walidatorów.
- **A10 (Sentinel):** Kod A10 dostanie tylko raport z audytu kodu, nałoży precyzyjne patche (na inne sekcje niż zamrożone) na treść i podda wyjściowy HTML pełnej, końcowej walidacji.
- **Zapis do formatu docelowego i zabezpieczony BaseLinker API:** Opracuję generowanie końcowego, spiętego dokumentu (w tym pola `ingredients_inci` wprost z bazy bez modyfikacji, oraz `description_html` itd.) do pojedynczego obiektu zapisanego jako `out/offer_<EAN>.json`. Napiszę kompletną funkcję z żądaniem HTTP o sygnaturze do BL (`addInventoryProduct`/`updateInventoryProduct`), lecz zakoduję w skrypcie stałą, wymuszoną barierę: `const WRITE_BACK_ENABLED = false`.

## 3. Przebiegi testowe & Raportowanie (RAPORT_36.md)
- Zaimplementuję mechanizm obsługi ręcznego ułaskawienia w procesie HitL (odrzucenie np. Trimay z `MISSING_EU_RESPONSIBLE_PERSON` i podniesienie przez sztuczną interwencję operatora z flaga `ACCEPT_AND_CONTINUE`). 
- Zweryfikuję poprawne zakończenie 100% cyklu dla produktu Equilibra (kompletny zapis na zewnątrz w `out/offer_8000137015436.json`).
- Sporządzę i zapiszę w `docs/RAPORT_36.md` dokładny zrzut wymaganych materiałów, logów, wyników ze sklejania dla 30 wierszy, ścieżki i ostateczny wydruk 125 testów kończących proces.
