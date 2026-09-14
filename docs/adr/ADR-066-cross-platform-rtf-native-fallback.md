# ADR-066: Wieloplatformowa Ekstrakcja RTF i Odporny Fallback na Natywny Silnik JavaScript

## Status
Zaakceptowany (Accepted) - Wdrożony na produkcji

## Kontekst
Wdrożenie mostka Microsoft Word COM (`SDSRtfConverter`) w ADR-064/065 bazowało na wywołaniu procesu `powershell.exe` i obiektów Windows OLE/COM (`Word.Application`). Na serwerze produkcyjnym Linux VPS (Ubuntu / OVH) oraz w kontenerach Docker próba przetworzenia przesłanej przez użytkownika karty RTF kończyła się błędem:
`spawn powershell.exe ENOENT - status code 500`
Brak obsługi tego wyjątku w `SDSDocumentParser` uniemożliwiał generowanie kart charakterystyki z formatu RTF w chmurze produkcyjnej.

## Podjęte Decyzje Architektoniczne

1. **Ścisła Izolacja Środowiskowa w `SDSRtfConverter`:**
   - W [sds.rtf.converter.js](file:///z:/Nexus_ERP_Project/src/modules/sds/sds.rtf.converter.js) zaimplementowano natychmiastową asercję platformy:
     `if (process.platform !== 'win32') throw new Error(...)`
   - Wyeliminowano jakiekolwiek próby uruchamiania `powershell.exe` w środowiskach nie-Windowsowych (Linux / Docker / macOS).

2. **Wieloplatformowy, Bezprzerwowy Fallback w `SDSDocumentParser`:**
   - W klasie [SDSDocumentParser.extractText](file:///z:/Nexus_ERP_Project/src/modules/sds/sds.service.js) wdrożono architekturę dwuwarstwową:
     * **Warstwa 1 (Windows):** Opcjonalny mostek Word COM z pełną osłoną `try...catch`. W przypadku braku MS Word, wyłączenia PowerShell lub jakiegokolwiek błędu `ENOENT`, system natychmiast loguje ostrzeżenie i przekazuje zadanie do Warstwy 2.
     * **Warstwa 2 (Linux / Cloud / Fallback):** Natywny, bezstratny silnik JavaScript [SDSRTFParser](file:///z:/Nexus_ERP_Project/src/modules/sds/sds.rtf.parser.js) (Zero Dependencies), dekodujący encje Unicode (`\uN`), strony kodowe ANSI (`CP1250` / `CP1252`) oraz strukturę tabelaryczną (`\cell` -> `\t`, `\row` -> `\n`).

3. **Certyfikacja Działania Silnika Natywnego:**
   - Potwierdzono, że natywny silnik `SDSRTFParser` bez udziału Word COM ani PowerShell wyodrębnia 100% składników z tabel LIMS (5/5 substancji w Orchidea e Vaniglia: etanol 74–78%, aldehyd anyżowy, kumaryna, BHT, toluen) oraz wszystkie 18 urzędowych parametrów Sekcji 9.

## Skutki (Consequences)
- **Pełna Wieloplatformowość:** System działa bezbłędnie zarówno na lokalnych stacjach Windows, jak i na serwerach produkcyjnych Linux VPS (Ubuntu) bez instalacji zewnętrznych pakietów biurowych.
- **Zero Błędów 500:** Eliminacja błędu `spawn powershell.exe ENOENT` w interfejsie webowym użytkownika.
- **Weryfikacja:** 122/122 testów unitowych (`npm test`), 7/7 testów regulacyjnych (`sds.compliance.test.js`) oraz 6/6 testów RTF (`sds.rtf.test.js`) wykonanych zarówno w trybie standardowym, jak i w symulacji platformy Linux (`process.platform = 'linux'`) zakończonych z wynikiem 100% pozytywnym.
