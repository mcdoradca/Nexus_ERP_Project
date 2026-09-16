# ADR-079: Zachowanie tożsamości nazwy pliku 1:1, eliminacja desynchronizacji stanu UI i rozdzielenie nazwy pliku od nazwy handlowej

## Status
Zaakceptowany i wdrożony (Production-Ready)

## Kontekst i Problem Biznesowy
Użytkownik zgłosił krytyczną uwagę dotyczącą tożsamości plików w obrocie handlowym:
Wgranie pliku posiadającego określoną nazwę handlową lub indeks katalogowy (np. `8034055535448_SDS_TALCO (1).rtf` lub `dupa 1234.pdf`) musi skutkować otrzymaniem wyjściowego pliku Word o **dokładnie tej samej nazwie bazowej z rozszerzeniem .docx** (`8034055535448_SDS_TALCO (1).docx`, `dupa 1234.docx`).

Przekombinowanie polegało na:
1. Utożsamieniu nazwy handlowej produktu wewnątrz treści dokumentu (Sekcja 1.1) z fizyczną nazwą pliku na dysku. Silnik SDS nadawał plikowi pobieranemu przetłumaczoną nazwę chemiczną z sekcji 1.1 (`SWEET_HOME_-_ESSENZA_TALCO.docx`), wycinając numer EAN, indeks partii oraz indywidualną nazwę katalogową użytkownika.
2. Automatycznym wpisywaniu nazwy pliku do pola "Nazwa Handlowa Produktu" w formularzu, przez co nazwa pliku wisiała w stanie React jako manualny parametr produktu i zniekształcała sekcję 1.1.

## Podjęte Decyzje Architektoniczne

1. **Bezwzględne zachowanie tożsamości nazwy pliku 1:1:**
   - Zarówno w kontrolerze backendowym (`sds.controller.js`), jak i w komponencie frontendowym (`SdsGeneratorTool.jsx`), nazwa generowanego i pobieranego pliku DOCX jest wyznaczana jako `basename(input) + .docx` (z zachowaniem spacji, nawiasów, numerów EAN i unikalnych identyfikatorów handlowych).
   - Usunięto narzucanie prefiksów typu `Karta_Charakterystyki_PL_` oraz zakazano podmieniania nazwy pliku na przetłumaczoną nazwę z Sekcji 1.1.

2. **Czyste rozdzielenie nazwy pliku od nazwy handlowej w treści karty:**
   - **Plik na dysku:** Odpowiada 1:1 plikowi wejściowemu użytkownika.
   - **Treść w Sekcji 1.1:** Jest wyekstrahowana i polonizowana w sposób w 100% autonomiczny i deterministyczny przez silnik SDS (SSOT) na podstawie treści karty producenta.
   - **Pole tekstowe w UI:** Pełni wyłącznie rolę opcjonalnego nadpisania (*"Nazwa Handlowa Produktu (Opcjonalnie - nadpisanie w Sekcji 1.1)"*). Przy wgraniu nowego pliku pole to jest czyszczone (resetowane), a placeholder informuje o automatycznej detekcji. Jeśli pole pozostaje puste, karta sama pobiera autentyczną nazwę handlową ze swojego tekstu.

3. **Testy jednostkowe i weryfikacja (TEST 6 w `tests/sds.zero_hardcodes.test.js`):**
   - Zweryfikowano zachowanie tożsamości plików dla próbek: `8034055535448_SDS_TALCO (1).rtf` $\rightarrow$ `8034055535448_SDS_TALCO (1).docx`, `dupa 1234.pdf` $\rightarrow$ `dupa 1234.docx`.

## Konsekwencje
- Zachowano pełen porządek w katalogowaniu plików i archiwizacji dokumentów magazynowych/handlowych użytkownika.
- Wyeliminowano przypadki wycinania kodów EAN i numerów partii z nazw plików.
- Pełna separacja fizycznej nazwy pliku od chemicznej tożsamości wewnątrz Sekcji 1.1.
