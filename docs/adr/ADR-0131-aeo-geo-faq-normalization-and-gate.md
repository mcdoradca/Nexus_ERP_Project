# ADR 0131: Harmonizacja Sekcji 2 (FAQ SEO/GEO), normalizacja etykiet i bramka aeo_faq_check

## Data
2026-10-06

## Kontekst
Sekcja 2 opisu oferty (mapowana na `description_extra1` w BaseLinkerze) ma kluczowe znaczenie strategiczne pod kątem AEO (Answer Engine Optimization) i GEO (Generative Engine Optimization). Jej celem jest przyciąganie ruchu organicznego z Google oraz asystentów AI (ChatGPT, Claude, Perplexity, Gemini), gdy użytkownicy wpisują naturalne zapytania konsumenckie (np. *"Jaki płyn do podłóg nie zostawia smug?"*, *"Co zrobić, gdy płyn zostawia smugi?"*).

W dotychczasowej implementacji zidentyfikowano krytyczne rozbieżności:
1. **Sprzeczne dyrektywy w promptach:** Prompt Agenta 6 zawierał równolegle wzorce `❓/💡`, PATCH narzucający `🔴 Problem: / 🟢 Odpowiedź:`, a sekcja §C narzucała `❌ Problem: / ✔️ Odpowiedź:`. Skutkowało to generowaniem skarg i problemów konsumenckich zamiast naturalnych pytań SEO.
2. **Utrata danych z Agenta 5:** Schemat JSON dla Agenta 5 w `orchestrator.js` nie uwzględniał pól `safe_aeo_questions` oraz `safe_aeo_answers`, przez co były one usuwane jako nieobsługiwane (`A5_FIELD_REJECTED`), a Agent 6 zmuszony był wymyślać pytania samodzielnie na bazie negatywnych opinii.
3. **Wypieranie pytań przez mechanizm Pratfall (Agent 7):** Dyrektywa M1 PRATFALL nakazywała Agentowi 7 wstrzykiwanie wad produktu zarówno do sekcji 2, jak i sekcji 4, co zniekształcało intencję SEO na rzecz eksponowania mankamentów (np. wiotkości opakowania).
4. **Brak egzekucji walidacyjnej w potoku:** Funkcja `emoji_structure_check` nie była podpięta pod orkiestrator, dopuszczając niespójne etykiety i brak znaku zapytania w parach Q&A.

## Decyzja
1. **Ujednolicenie kanonicznego wzorca par (SOT 01 §4):**
   - Wzorzec par w Sekcji 2 został zunifikowany we wszystkich promptach (A4, A5, A6, A7), regułach współdzielonych (`SHARED_RULES_v4.1.md`) oraz bazach wiedzy (SOT 01, SOT 03, SOT 09) do formatu:
     `<li>❓ <b>Pytanie:</b> …?</li><li>✔️ <b>Odpowiedź:</b> …</li>`
   - Zastosowano emoji z białej listy Allegro (`❓` oraz `✔️`), eliminując ryzyko odrzucenia ofert przez marketplace.
2. **Odblokowanie przepływu AEO z Agenta 5:**
   - Rozszerzono `a5Schema` w `orchestrator.js` o tablice `safe_aeo_questions` oraz `safe_aeo_answers`.
   - Wdrożono defensywną tarczę: w przypadku braku par lub rozbieżnej długości, kod przycina tablice do wspólnego minimum 1:1 lub przekazuje sterowanie do Agenta 6 z odpowiednim wpisem ostrzegawczym.
3. **Ochrona Sekcji 2 przed mechanizmem Pratfall w Agencie 7:**
   - W prompcie Agenta 7 ograniczono M1 PRATFALL wyłącznie do Sekcji 4. Sekcja 2 została oznaczona jako nienaruszalna merytorycznie (dozwolony jedynie szlif stylistyczny bez modyfikacji pytań i etykiet).
4. **Bramka walidacyjna i auto-remediacja (V12):**
   - `normalize_aeo_faq_labels`: deterministyczna funkcja naprawiająca etykiety (zamiana `Problem:` na `Pytanie:`, `Answer:`/`Rozwiązanie:` na `Odpowiedź:` oraz normalizacja emoji).
   - `aeo_faq_check`: ścisły walidator sprawdzający parzystość 1:1, obecność pytajnika `?` na końcu każdego pytania, brak pustych odpowiedzi oraz brak etykiet typu `Problem:`.
   - Podpięto bramkę pod potok orkiestratora po wykonaniu węzłów A6, A7 i A10, kierując błędy strukturalne do zatrzymania HITL.

## Konsekwencje i weryfikacja
- **Zgodność SEO/GEO:** Sekcja 2 stabilnie generuje naturalne pytania long-tail z bezpośrednią odpowiedzią wskazującą produkt (Answer-First).
- **Stabilność testów:** Zaktualizowano fixtures testowe oraz dodano dedykowane asercje w `tests/validators.test.js` i `tests/orchestrator.test.js`. Wszystkie testy potoku (152/152) przechodzą bez błędów.
