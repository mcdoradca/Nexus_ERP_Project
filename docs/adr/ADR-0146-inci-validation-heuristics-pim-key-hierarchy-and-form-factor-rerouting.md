# ADR-0146: Heurystyka Walidacji Składu INCI, Hierarchia Kluczy PIM i Przekierowanie Formy Fizycznej w Ekstraktorze BaseLinkera i Potoku EAN V2

## Status
**ACCEPTED & PRODUCTION-READY** (Data: 2026-10-16)

## Kontekst i Problem Biznesowo-Techniczny
Podczas procesowania produktów w potoku `offer-optimizer-v2` (np. dla EAN `8059602243195` – Sweet Home Koncentrat do płukania), w widoku „Karta Techniczna i Skład (Parametry PIM)” doszło do krytycznego zniknięcia i podmiany składu produktu:
1. Operator wprowadził poprawny, pełny skład detergentowy w dedykowane pole formularza PIM: `"Skład/INCI"` (`5%-15% Cationic surfactants...`).
2. W zewnętrznej kartotece BaseLinker (lub zanieczyszczonym imporcie) istniał historyczny parametr o nazwie `"Skład"` z wartością `"Koncentrat"`. Dla płynów do płukania słowo to oznacza postać/formułę fizyczną wyrobu (`Postać`), a nie skład chemiczny.
3. W `baselinker.extract.js`:
   - Lista synonimów INCI w `baselinker.extract.config.json` zawierała frazę `"sklad"`.
   - Pętla ekstraktora pobierała pierwszy napotkany klucz z obiektu `features`. Klucz `"Skład"` został dopasowany jako pierwszy, po czym nastąpiło przerwanie pętli (`break`), całkowicie ignorując dokładniejsze, edytowane przez człowieka pole `"Skład/INCI"`.
   - Ekstraktor nie posiadał żadnej walidacji struktury wartości, bezkrytycznie przyjmując pojedyncze słowo `"Koncentrat"` jako pełnoprawny skład INCI.
4. W `orchestrator.js`:
   - Zgodnie z ADR-0141 flaga `hasPimInci` została oznaczona jako `true` na bazie wartości `"Koncentrat"`, co zablokowało poszukiwania badawcze Agenta 1 w internecie.
5. W `offer-optimizer.controller.js` i `UnifiedProductPipelineView.jsx`:
   - Po zakończeniu potoku kontroler wykonywał:
     `updatedFeatures['Skład/INCI'] = orch.state.extracted_data.inci.value;` (czyli `"Koncentrat"`).
   - W rezultacie poprawny skład wprowadzony przez operatora został trwale wykasowany z bazy danych `Product.features` i zastąpiony słowem `"Koncentrat"`.

## Zastosowane Rozwiązanie Architektoniczne

1. **Heurystyka Walidacji `isValidInciValue` w `baselinker.extract.js`:**
   - Wdrożono walidator odrzucający pseudowartości i pojedyncze słowa reprezentujące postać fizyczną wyrobu:
     `koncentrat`, `płyn`, `żel`, `proszek`, `kapsułki`, `tabletki`, `pianka`, `spray`, `balsam`, `krem`, `kostka`, `chusteczki`, `mleczko`, `zawiesina`, `emulsja`, `mydło`, `szampon`, `nowy`, `oryginalne`, `tak`, `nie`, `brak`, `zestaw`, `standard`, `uniwersalny`.
   - Wymóg struktury składu: obecność przecinków/średników z min. 2 członami, obecność stężeń procentowych wg Rozporządzenia Detergentowego 648/2004 (np. `5%-15%`, `< 5%`), obecność słów kluczowych chemicznych/kosmetycznych (`aqua`, `extract`, `oil`, `acid`, `sulfate`, `chloride`, `alcohol`, `parfum`, `surfactants`, `tenside`, `środki powierzchniowo czynne`, `substancje zapachowe`, `konserwanty`) lub wieloczłonowych nazw łacińskich.

2. **Hierarchia Priorytetów Kluczy i Rerouting Formy Fizycznej:**
   - Zamiast iteracji w przypadkowej kolejności kluczy, ekstraktor ocenia dopasowane synonimy wg ich specyficzności: klucze wieloczłonowe (`"sklad inci"`, `"ingredients inci"`, `"skladniki inci"`) mają wyższy priorytet niż pojedynczy, generyczny `"sklad"`.
   - Każdy kandydat musi przejść `isValidInciValue`.
   - Jeśli parametr `"Skład"` zawiera wartość postaci fizycznej (np. `"Koncentrat"`), zostaje odrzucony jako INCI i bezpiecznie przekierowany do `result.postac` (jeśli pole to jest puste), eliminując utratę informacji o formule.

3. **Ochrona Integralności PIM w Kontrolerze i Frontendzie:**
   - W `offer-optimizer.controller.js`: przed przypisaniem wartości potoku do `updatedFeatures['Skład/INCI']` weryfikowana jest jej poprawność przez `isValidInciValue`. Jeśli potok nie posiada poprawnego składu, a w PIM istniał już zweryfikowany skład operatora, skład PIM jest ściśle chroniony przed degradacją.
   - W `UnifiedProductPipelineView.jsx`: w handlerze socketu `PIPELINE_STATUS` zsynchronizowano bezpośrednio klucz `"Skład/INCI"` i usunięto rozszczepienie na `"INCI"` i `"Skład"`.
   - W `server.js`: w endpointach autofillu ujednolicono zapis do formatu `"Skład/INCI"`.

4. **Defensywna Flaga `hasPimInci` w `orchestrator.js`:**
   - `hasPimInci` weryfikuje `baselinkerExtract.isValidInciValue(extracted.inci.value)`, dzięki czemu fałszywe wartości nie zablokują mechanizmów badawczych Agenta 1.

5. **Sanacja Bazy Danych i Pokrycie Testami Regresyjnymi:**
   - Przywrócono autentyczny skład chemiczny dla produktu `8059602243195` w bazie Prisma z ocalonej migawki `offerDraft.features`.
   - Rozbudowano `baselinker.extract.test.js` o testy jednostkowe odrzucenia "Koncentratu", priorytetyzacji "Skład/INCI" oraz walidacji `isValidInciValue`. Cały zestaw 160 testów v2 przeszedł pomyślnie.

## Skutki i Korzyści
- **Bezpieczeństwo Danych Operatora:** Ręcznie wprowadzony skład produktu nie może zostać skasowany ani nadpisany przez generyczne atrybuty hurtowni/BaseLinkera.
- **Precyzja Klasyfikacji:** Słowa określające formę (koncentrat, płyn, żel) trafiają do cechy `Postać`, a nie do `Skład/INCI`.
- **Zgodność z Rozporządzeniem 648/2004 i INCI:** Poprawne rozpoznawanie zarówno kosmetycznych list INCI, jak i detergentowych deklaracji składników ze stężeniami procentowymi.
