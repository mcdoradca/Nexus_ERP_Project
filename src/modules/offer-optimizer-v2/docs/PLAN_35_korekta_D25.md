# [PLAN DZIAŁANIA] Zadanie 35 (Korekta wg D25)

1. **Odblokowanie GATE-3 i RAG:**
   - Zmodyfikuję `orchestrator.js`, tak by błąd `INGREDIENT_NOT_IN_GLOSSARY` (wynikający z braku w bazie np. przez literówki) nie rzucał statusu `HALTED_HITL_REQUIRED`. Zamiast tego dodam składnik do tabeli ostrzeżeń (`normalization_warnings`), pozwalając potokowi pójść dalej do RAG (w RAG odrzucony token sam zniknie na podstawie braku funkcji). 
   - Zaktualizuję lub wymienię asercję w `orchestrator.test.js` dla `INGREDIENT_NOT_IN_GLOSSARY`, aby zweryfikować brak blokady i 100% PASS rate na 74 testach.

2. **Czwarty Wariant Nawiasowy i Alias C10-18 (generateInciVariants):**
   - Dodam czwarty wariant zdejmujący cały nawias z INCI (np. `(Sweet Almond)` -> wycięte), co pozwoli uratować np. `Prunus Amygdalus Dulcis Oil`.
   - Zaimplementuję wyłapany, sztywny alias (czyli z pliku, ale jako hardkodowany wyjątek przed startem mechanizmu aliasów w kolejnych zadaniach) dla `C10-18 Triglyceride` aby przepuścił on bazę Equilibry jako `C10-18 Triglycerides`.

3. **Gromadzenie odrzuconych INCI i Raport:**
   - Napiszę izolowany skrypt `analyze_inci.js`, który przetworzy wszystkie pobrane dokumenty z `tests/fixtures/`, podda wyciągnięte składy nowemu procesowi GATE-3 i wyzbiera wszystkie unikalne składniki odrzucone przez brak dopasowania w glosariuszu.
   - Posortowana, alfabetyczna lista trafi do pliku `docs/RAPORT_35.md`, dokumentując prawdziwą skalę wymaganą do obsługi przyszłej bazy ujednoliconych aliasów i pomyłek rynkowych.
