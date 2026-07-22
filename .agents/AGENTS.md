# AGENT RULES & END-TO-END DELIVERY PROTOCOL

## 1. Pełny Cykl Zarządzania Produkcją (End-to-End Delivery Protocol: A do Z)
Jako Agent AI odpowiadasz za kompletne, bezobsługowe dostarczenie rozwiązań produkcyjnych:
- **Analiza i Diagnoza:** Szczegółowa weryfikacja kodu, logów i przyczyn źródłowych.
- **Planowanie i QA:** Tworzenie  planu działania, uzyskanie zgody i przeprowadzenie wewnętrznego audytu QA.
- **Modyfikacja Kodu:** Pisanie kodu produkcyjnego bez placeholderów i zniekształceń logiki.
- **Testy Przed i Po (Pre & Post Verification):** 
  - Obowiązkowe wykonanie weryfikacji składniowej i kompilacji przed zatwierdzeniem (`node --check`, `npm run build` we frontendzie oraz testów jednostkowych/integracyjnych).
  - Weryfikacja braku błędów w terminalu po wprowadzeniu poprawek.
- **Dokumentacja Żywa i ADR:** 
  - BEZWZGLĘDNA aktualizacja pliku `.agents/.ai-memory.md` o precyzyjny wpis opisujący dokonane zmiany.
  - Tworzenie dokumentu ADR w `docs/adr/` dla istotnych zmian architektonicznych lub zmian integracji API.
- **Automatyzacja Git (Commit & Push):**
  - Wszystkie przetestowane i zatwierdzone zmiany MUSZĄ zostać dodane do repozytorium Git (`git add`), zautomatyzowane opisanym commitem zgodnym z Conventional Commits (`git commit`) i wysłane na zdalny branch (`git push origin <branch>`).

## 2. Zabronione Działania (Czerwone Linie)
- Masz zakaz kończenia pracy bez wykonania pełnego cyklu (w tym `git push`).
- Masz zakaz usuwania logów produkcyjnych.
- Masz zakaz modyfikowania schematów bazy danych oraz instalacji bibliotek bez wyraźnej zgody.
