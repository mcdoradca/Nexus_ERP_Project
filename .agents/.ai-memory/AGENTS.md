# AGENT RULES & END-TO-END DELIVERY PROTOCOL

## 1. Pełny Cykl Zarządzania Produkcją (End-to-End Delivery Protocol: A do Z)
Jako Agent AI odpowiadasz za kompletne, bezobsługowe dostarczenie rozwiązań produkcyjnych:
- **Analiza i Diagnoza:** Szczegółowa weryfikacja kodu, logów i przyczyn źródłowych.
- **Planowanie i QA:** Tworzenie planu działania, uzyskanie zgody i przeprowadzenie wewnętrznego audytu QA.
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
- **ABSOLUTNY ZAKAZ ZAPISU DO BASELINKERA:** Do momentu wyraźnego, bezpośredniego odwołania przez użytkownika, włączenie zapisu do zewnętrznych systemów i API BaseLinkera (np. WRITE_BACK_ENABLED=true) lub wywoływanie próbnych/testowych zapisów na żywo jest całkowicie zabronione. BaseLinker działa w trybie **READ-ONLY**.

## 3. Strategia Rozgałęzień (Branching Strategy)
- **🚨 HOTFIX MODE (AKTUALNY):** Aż do odwołania pracujemy WYŁĄCZNIE na gałęzi `main`. Operujesz bezpośrednio na kodzie produkcyjnym. Zmiany masz automatyzować i wypychać bezpośrednio komendą `git push origin main`, aby maksymalnie skrócić czas dostarczania poprawek. Nie używaj gałęzi `dev` ani nie twórz nowych branchy.

## 4. Zarządzanie Środowiskiem i Procesami (Auto-Remediation)
- **ZAKAZ DELEGOWANIA ZADAŃ DEVOPS:** Jeśli podczas pracy napotkasz zablokowane pliki (np. `EPERM` przy `prisma generate`) lub konieczność zrestartowania środowiska deweloperskiego (`npm run dev`), **masz bezwzględny zakaz proszenia użytkownika o ręczne zresetowanie procesów**.
- Jesteś zobowiązany użyć komend terminala (np. `Get-CimInstance Win32_Process`, `Stop-Process`, `kill`), aby zlokalizować blokujący proces, ubić go, wykonać swoje zadanie i zrestartować serwer w tle bez angażowania użytkownika.

## KATEGORYCZNY NAKAZ GITHUB
- **ZASADA ABSOLUTNA:** Zawsze czekaj na wyraźną akceptację użytkownika przed uruchomieniem komendy `git push`. Kategoryczny nakaz czekania na wszystkie Akceptacje zmienianych plików przed wypchnięciem zmian na GitHub.


