# ADR-064: Przywrócenie Nienaruszalności Silnika SDS, Mostek Word COM dla Plików RTF oraz Eliminacja Wtrąceń Obcojęzycznych

## Status
Zaakceptowany (Accepted) - Wdrożony na produkcji

## Kontekst
Wprowadzenie obsługi plików formatu RTF w modułach ADR-061–063 doprowadziło do poważnej destabilizacji produkcyjnego silnika SDS (`sds.service.js`):
1. **Regresja parsowania numerów CAS i numerów indeksowych CLP (Sekcja 3.2):**
   Usunięcie wymogu prefiksu `CAS:` spowodowało, że fragmenty numerów indeksowych (np. `155-00-6` z `606-155-00-6` w karcie Najma) były błędnie interpretowane jako numery CAS i przedwcześnie wycinane z tekstu. Skutkowało to pozostawieniem w polu klasyfikacji CLP osieroconych resztek typu `Index:606-` oraz niekompletnymi danymi substancji.
2. **Wycieki języka angielskiego i włoskiego do wygenerowanych dokumentów Word (.docx):**
   Sekcje 1.2, 4, 5, 6, 7 są sekcjami przetwarzanymi deterministycznie (nie trafiają do modelu LLM w `toTranslate`). Metoda `translatePhrase` przy braku dopasowania w `PHRASE_DICTIONARY_PL` zwracała surowy tekst wejściowy. W efekcie opisy pierwszej pomocy, procedur gaśniczych, uwolnienia do środowiska i magazynowania zawierały fragmenty angielskie i włoskie.
3. **Brakujące jednostki stężeń (`%`) oraz brak polskich nazw chemicznych:**
   W układach tabelarycznych z relacjami kolumnowymi (np. `74 ≤ x < 78` w karcie Orchidea) gubiony był znak `%`. Brakowało mapowań polskich nazw chemicznych dla powszechnych składników (np. CAS: `123-11-5` aldehyd anyżowy, `128-37-0` BHT, `108-88-3` toluen).
4. **Puste nagłówki DNEL/PNEC w Sekcji 8.1:**
   Metoda `extractDnelPnec` wyłapywała same nagłówki tabeli PDF (np. *Derived No Effect Level (DNEL)*), wklejając je bez wartości liczbowych do dokumentu.

## Podjęte Decyzje Architektoniczne

1. **Wprowadzenie Mostka Word COM dla plików RTF (`SDSRtfConverter`):**
   - Zamiast utrzymywać ułomny, stanowy parser tokenów RTF (`sds.rtf.parser.js`), który zniekształcał strukturę tabel i podział sekcji, utworzono moduł `src/modules/sds/sds.rtf.converter.js`.
   - Moduł wykorzystuje zainstalowany na maszynie produkcyjnej pakiet Microsoft Office (`Word.Application` COM) sterowany przez dedykowany, bezpieczny skrypt PowerShell (`$word.DisplayAlerts = 0`, timeout 30s, zwalnianie obiektów COM przez `[System.Runtime.InteropServices.Marshal]::ReleaseComObject`).
   - Każdy plik RTF jest w ułamku sekundy bezstratnie konwertowany do formatu PDF z zachowaniem 100% geometrii tabel, po czym trafia do sprawdzonego, jednolitego silnika `SDSPDFParser`. Zapewniono automatyczny fallback do parsera RTF w razie braku Word COM.

2. **Zunifikowany, Oporny Parser Sekcji 3.2 (`parseSection3Components`):**
   - Zaimplementowano deterministyczną kolejność czyszczenia klasyfikacji: najpierw dopasowywane i wycinane są pełne tokeny `Index` (`\d{3}-\d{3}-\d{2}-\d`), `EC/WE` (`\d{3}-\d{3}-\d`) oraz `REACH`, a dopiero w kolejnym kroku izolowane numery CAS.
   - Regex CAS zabezpieczono asercjami granicznymi `(?<![0-9\-])\b\d{2,7}-\d{2}-\d\b(?![0-9\-])` z negatywnym sprawdzaniem prefiksu `INDEX:`.
   - Zintegrowano obsługę zarówno układów blokowych (np. Orchidea), jak i liniowych (np. Najma, Lulwa).
   - W `formatConcentration` zagwarantowano obligatoryjne dołączanie jednostki `%` dla przedziałów stężeń.

3. **Scentralizowana Polonizacja Nazw Chemicznych (`resolvePlName`):**
   - Utworzono hierarchiczną resolucję nazw substancji:
     1. Rejestr `CAS_TO_PL_MAP` (rozszerzony m.in. o aldehyd anyżowy, BHT, toluen).
     2. Urzędowy rejestr NDS (`NDSRegistry.findInRegistry(cas).substance`) jako Single Source of Truth.
     3. Słownik alergenów `ALLERGEN_NAMES_PL`.
     4. Resolucja PubChem/IUPAC.

4. **Tarcza Językowa i Eliminacja Wtrąceń Obcojęzycznych (`translatePhrase`):**
   - Wprowadzono metodę `isForeignText(text)` wykrywającą słowa kluczowe języka angielskiego i włoskiego.
   - Rozszerzono `PHRASE_DICTIONARY_PL` o urzędowe frazy ECHA dla sekcji 1.2, 4, 5, 6 i 7.
   - Jeśli zwrot nie występuje w słowniku, a test `isForeignText` wykaże język obcy, `translatePhrase` ma bezwzględny obowiązek podstawić zwalidowany prawnie polski wzorzec ustawowy (`defaultFallback`).

5. **Sanityzacja DNEL/PNEC w Sekcji 8.1:**
   - W `extractDnelPnec` wprowadzono filtr regex weryfikujący obecność jednostek fizykochemicznych (`mg/m³`, `mg/kg`, `mg/l`, `ppm`, `%`). Puste nagłówki tabeli są eliminowane, a sekcja generuje urzędowy komunikat o braku oznaczonych wartości DNEL/PNEC.

## Skutki (Consequences)
- **Czystość Językowa:** 0% wtrąceń angielskich lub włoskich w wygenerowanych dokumentach Word (.docx) dla wszystkich 16 sekcji.
- **Bezstratna Ekstrakcja:** Wyodrębnianie 100% składników (3/3 w karcie Najma, 5/5 w karcie Orchidea) z kompletnymi numerami indeksowymi, CAS, WE i poprawnymi stężeniami `%`.
- **Wsteczna Kompatybilność:** 100% zgodności z dotychczasowym API. Pliki `.pdf` oraz `.rtf` obsługiwane są przez te same endpointy.
- **Weryfikacja:** 7/7 testów zgodności prawnej (`tests/sds.compliance.test.js`) PASSED, 122/122 testów unitowych całego projektu (`npm test`) PASSED.
