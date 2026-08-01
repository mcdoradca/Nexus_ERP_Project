# ZADANIE 38, 2026-08-01, Gałąź robocza: fix/zadanie-38, Hash: 6de361506ac42ff56de6c26ea27a35dbb7895d4f

## [PLAN DZIAŁANIA]
1. **Inwentaryzacja i Zabezpieczenie (Krok 1):** Zweryfikuję stan `WRITE_BACK_ENABLED` na gałęziach `main` i `staging`. Odbiję gałąź `fix/zadanie-38`, zadeklaruję stałą na poziomie pliku, dodam bezpośredni wyjątek w kodzie zapisu i wdrożę weryfikującą bramkę CI.
2. **Audyt Stanu Faktycznego (Krok 2):** Wykonam `npm test`, zliczę testy w plikach i sprawdzę ich spójność z wynikiem głównego wykonania. Przeanalizuję logi produkcyjne w poszukiwaniu dowodów na żywe przebiegi węzłów A1-A10 i zmapuję wszystkie wywołania odczytu z BaseLinkera.
3. **Diagnoza Składania i Wygenerowanie Raportu (Krok 3):** Zlokalizuję defekt wyjścia dla A6 (`<p>B</p>\n\nFROZEN\n\n\n`). Zgodnie z wytycznymi – jeśli usterka będzie punktowa, naprawię ją, po czym wykonam testowy przebieg na żywo. Utworzę `RAPORT_38_zabezpieczenie_i_audyt.md`.

*(Zanotowałem w pamięci, że komunikacja między mną a drugim Agentem odbywa się wyłącznie przez pliki `.md` i że plany należy wrzucać wprost do folderu `docs`)*.
