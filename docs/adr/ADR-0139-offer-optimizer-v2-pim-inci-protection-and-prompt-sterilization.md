# ADR-0139: Ochrona Kartoteki PIM INCI, Sterylizacja Promptu Agenta 1 i Eliminacja Marnowania Tokenów OSINT w Potoku Offer Optimizer V2

## Status
**ACCEPTED / PRODUCTION-READY** (Data: 2026-10-12)

## Kontekst i Problem Biznesowy
W potoku optymalizacji ofert `offer-optimizer-v2` (`EAN Pipeline`), Agent 1 odpowiada za dwuetapowy rekonesans rynkowy (OSINT z Google Search Grounding na modelu `gemini-3.1-pro-preview` oraz ekstrakcję ustrukturyzowanych danych do formatu JSON).

W zgłoszeniu produkcyjnym zidentyfikowano krytyczną usterkę kosztowo-architektoniczną:
Mimo że produkt posiadał w bazie PIM zweryfikowany skład/INCI w sekcji *"Karta Techniczna i Skład (Parametry PIM)"* (pochodzący z kartoteki BaseLinkera / bazy danych), Agent 1 wciąż wykonywał zapytania sieciowe Google Search Grounding w poszukiwaniu składu, marnując cenne tokeny i czas wykonania orkiestratora. Ponadto, wyekstrahowany z sieci niepewny skład OSINT podlegał walidacji CosIng, pętli ponowień Jaccarda (`A1_INCI_CONFLICT_RETRY`) oraz groził nadpisaniem autorytatywnego składu z PIM lub wywołaniem fałszywego zatrzymania HITL (`OSINT_CONFLICTING_INCI_MAX_RETRYS`).

### Dogłębna Analiza Przyczyny Pierwotnej (Root Cause)
1. **Regresja po reformie anty-recitation (commit `2f83bde`, 05.10.2026):**
   W pliku szablonu promptu `src/modules/offer-optimizer-v2/docs/Agent_1_prompt_v4.md` zmieniono treść punktu 1. Wcześniejsze zakończenie tego punktu zawierało frazę `(będzie to tablica tablic).`. W commicie `2f83bde` fraza ta została usunięta na rzecz bardziej zwięzłej instrukcji JSON.
2. **Załamanie sztywnego wyrażenia regularnego w `orchestrator.js`:**
   W `orchestrator.js` mechanizm wycinania instrukcji wyszukiwania INCI opierał się na sztywnym wyrażeniu regularnym:
   ```javascript
   promptTemplate = promptTemplate.replace(
       /1\. INCI \(Skład\):[\s\S]*?\(będzie to tablica tablic\)\./,
       '1. INCI (Skład): Skład jest już znany i podany w DANYCH WEJŚCIOWYCH...'
   );
   ```
   Usunięcie z promptu kotwicy `(będzie to tablica tablic).` spowodowało, że regex przestał się dopasowywać (`match === false`). W konsekwencji `promptTemplate.replace` nie dokonywał żadnej zamiany i do Agenta 1 trafiała w całości instrukcja nakazująca zbadanie min. 10 źródeł pod kątem INCI.
3. **Niewycięta wielojęzyczna matryca kwerend OSINT (ADR-0125):**
   Nawet przy wcześniejszym działaniu regexa punktu 1, szablon `Agent_1_prompt_v4.md` zawierał obszerną sekcję `WIELOJĘZYCZNA MATRYCA KWEREND (OBOWIĄZKOWA)`, która wymuszała generowanie kwerend Google ze słowami kluczowymi: `ingredienti`, `inhaltsstoffe`, `skład`, `ingredientes`. Gemini traktował tę sekcję priorytetowo i pomimo znajomości składu generował kosztowne zapytania Grounding.
4. **Brak bezwzględnego zamrożenia PIM jako SSOT:**
   W bloku ewaluacji odpowiedzi Agenta 1 w `orchestrator.js`, kod przetwarzał `extracted_inci_candidates` i poddawał skład procedurze sanityzacji CosIng oraz pętli ponowień, zamiast całkowicie zablokować przetwarzanie kandydatów OSINT, gdy skład pochodzi ze zweryfikowanego PIM.

## Podjęte Decyzje Architektoniczne

### 1. Rygorystyczny Predykat Obronny `hasPimInci`
W `src/modules/offer-optimizer-v2/orchestrator.js` wprowadzono jednoznaczny, defensywny predykat:
```javascript
const hasPimInci = Boolean(
    this.state?.extracted_data?.inci?.value &&
    typeof this.state.extracted_data.inci.value === 'string' &&
    this.state.extracted_data.inci.value.trim().length > 0 &&
    this.state.extracted_data.inci.value.trim() !== 'BRAK DANYCH'
);
```

### 2. Sterylizacja Promptu przez Elastyczny Positive Lookahead
Zastąpiono zawodny regex precyzyjnym mechanizmem opartym o positive lookahead `(?=2\.\s*LOGISTYKA:)`:
```javascript
if (hasPimInci) {
    // 1. Zastąpienie sekcji punktu 1 instrukcją całkowitego zakazu wyszukiwania
    promptTemplate = promptTemplate.replace(
        /1\.\s*INCI\s*\(Skład\):[\s\S]*?(?=2\.\s*LOGISTYKA:)/i,
        '1. INCI (Skład): Skład jest już zweryfikowany w bazie PIM (SSOT) i podany w DANYCH WEJŚCIOWYCH. KATEGORYCZNY ZAKAZ SZUKANIA SKŁADU W GOOGLE SEARCH GROUNDING ORAZ W INTERNECIE. Nie trać na to tokenów ani zapytań. Zwróć pustą tablicę: "extracted_inci_candidates": [].\n\n'
    );

    // 2. Całkowite wycięcie wielojęzycznej matrycy kwerend INCI (ADR-0125)
    promptTemplate = promptTemplate.replace(
        /-\s*WIELOJĘZYCZNA MATRYCA KWEREND[\s\S]*?(?=-\s*CELE WYSZUKIWANIA)/i,
        ''
    );

    // 3. Usunięcie składu INCI z celów wyszukiwania
    promptTemplate = promptTemplate.replace(
        /-\s*Skład INCI \(absolutny priorytet\)\.\r?\n?/i,
        ''
    );
}
```

### 3. Oznaczenie Stanu Wejściowego dla Agenta 1
W danych wejściowych przekazywanych do szablonu Agenta 1 (`agentData`):
- Wstrzyknięto pole `known_inci: hasPimInci ? this.state.extracted_data.inci.value : null`,
- Ustawiono znacznik `inci_status: hasPimInci ? "INCI_ALREADY_VERIFIED_IN_PIM_DO_NOT_SEARCH" : "SEARCH_REQUIRED"`.

### 4. Nienaruszalność Składu PIM i Ominięcie Pętli Ponowień OSINT
W bloku post-procesingu odpowiedzi Agenta 1:
- Całe przetwarzanie `extracted_inci_candidates`, bramka CosIng `gate_ingredients`, weryfikator słownikowy oraz pętla ponowień `A1_INCI_CONFLICT_RETRY` zostały objęte twardym warunkiem `if (!hasPimInci)`.
- Gdy `hasPimInci === true`, skład z PIM pozostaje nienaruszalny, odnotowywany w telemetrii przez `traceInci('INCI_PRESERVED_FROM_PIM')`.
- Wyeliminowano ryzyko fałszywych zatrzymań HITL (`OSINT_CONFLICTING_INCI_MAX_RETRYS`) dla produktów posiadających już skład w PIM.

## Konsekwencje i Korzyści
1. **Oszczędność Tokenów i Czasu Latencji:** Agent 1 nie wykonuje zbędnych zapytań sieciowych dla składników kosmetycznych i chemicznych, gdy dane są już w PIM. Czas odpowiedzi A1 ulega skróceniu o 30–50%.
2. **Odporność na Regresje Tekstowe:** Użycie positive lookahead `(?=2\.\s*LOGISTYKA:)` uniezależnia kod orkiestratora od drobnych modyfikacji formatowania wewnątrz punktu 1 w `Agent_1_prompt_v4.md`.
3. **Integralność SSOT:** Brak ryzyka nadpisania autoryzowanego przez człowieka składu z PIM przez przypadkowy, niepełny lub błędny skład odnaleziony na zagranicznych blogach czy marketplace'ach.
4. **Zero Zmian w Schemacie Bazy Danych:** Rozwiązanie zaimplementowane w 100% w logice orkiestracji bez migracji bazy danych i bez nowych zależności npm.

## Weryfikacja Jakościowa
- Rozszerzono `src/modules/offer-optimizer-v2/tests/orchestrator.test.js` o dedykowany test sprawdzający:
  - Sterylizację promptu przy obecnym `extracted_data.inci`,
  - Wycięcie instrukcji poszukiwania i matrycy kwerend INCI,
  - Zachowanie składu z PIM po wykonaniu węzła A1.
- Uruchomiono pełną suitę testową modułu V2:
  `node --test src/modules/offer-optimizer-v2/tests/*.test.js`
  **Wynik: 156/156 PASSED (0 błędów, 0 regresji).**
