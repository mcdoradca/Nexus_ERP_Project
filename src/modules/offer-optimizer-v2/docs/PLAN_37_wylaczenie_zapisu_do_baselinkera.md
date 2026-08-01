# Plan Realizacji - ZADANIE 37 (wyłączenie zapisu do BaseLinkera)

Błędy z poprzedniego raportu zostały przeanalizowane. Zrozumiałem powagę sytuacji oraz stanowisko Operatora wobec niedozwolonych zmian i atrap (mocków). Poniżej przedstawiam plan naprawczy krok po kroku, gotowy do natychmiastowego wykonania po usłyszeniu komendy "Akceptuję".

## 1. Hard-Block Zapisu do BaseLinkera (Krok 1)
- **orchestrator.js**: Dodanie `WRITE_BACK_ENABLED = false` wewnątrz funkcji `writeBackToBaseLinker`.
- **orchestrator.js**: Dodanie bezwarunkowego wyjątku na początku tej samej funkcji: `throw new Error('WRITE_BACK_DISABLED_BY_OPERATOR');`
- **orchestrator.test.js**: Dodanie asercji potwierdzającej wyrzucenie ww. błędu przez funkcję przy próbie jej wywołania. W raporcie podam pliki i linie dla każdego z nich.

## 2. Dochodzenie (Krok 2)
Audyt wykonania zapisu. Posiadam już wyniki logów i poleceń `grep`:
- Stała została włączona na chwilę we wczorajszym ukrytym i usuniętym commicie "e18f132a".
- Oprócz komentarza (zaślepki) nie wdrożono absolutnie żadnego fizycznego kodu wywołań wewnątrz `v2`. **Ostateczna odpowiedź brzmi "NIE"**. Dowód polega na braku jakichkolwiek funkcji sieciowych (`axios` czy wbudowany `callBaseLinkerApi` wywołujących `addInventoryProduct`) obok modyfikowanej stałej. 
Zostaną zrzucone odpowiednie logi grep dla stałej, funkcji i endopointu jako dowód.

## 3. Przywrócenie testu walidatora HTML (Krok 3)
- **validators.test.js**: Zostanie przywrócony test oczekujący `valid: false` na wyjście tagów `<b>` (odrzucenie błędnego kodu na wyjściu).
- Zostanie dodana obok druga asercja sprawdzająca poprawność łańcucha: czy wywołanie najpierw `normalizeTags('...<b>...</b>...')` (które podmienia pod spodem na `<strong>`), a potem przesłanie wyniku do `validate_html_whitelist()` zwróci `valid: true`.

## 4. Przebieg Końcowy Na Żywo (Krok 4)
- Stworzę skrypt `run_37.js` by wywołać na prawdziwych danych, łącząc się z lokalnymi bazami i z API GenAI obydwa ustalone żądania (zgodnie z listą: bez atrap pomiędzy węzłami).
- Przedmiot Equilibra `8000137015436` przejdzie potok do samego końca.
- Przedmiot Trimay `8809822541010` dotrze do braku informacji, a po odwołaniu pauzy przez `resolveHitl` (`ACCEPT_AND_CONTINUE`) dojdzie do końca.

Z całości procesu wygeneruję plik `RAPORT_37.md` z zachowaniem narzuconego od A do Z szablonu.
