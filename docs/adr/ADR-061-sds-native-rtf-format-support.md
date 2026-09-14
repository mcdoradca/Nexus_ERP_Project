# ADR-061: Natywna, bezstratna obsługa kart charakterystyki SDS w formacie RTF (.rtf)

## Status
**PRZYJĘTY / WDROŻONY** (2026-09-14)

## Kontekst biznesowy i techniczny
Karty charakterystyki substancji i mieszanin chemicznych (SDS / MSDS) są dystrybuowane nie tylko w formacie PDF, lecz również w formacie Rich Text Format (`.rtf`) generowanym przez systemy LIMS/ERP producentów zagranicznych (m.in. Włochy, Niemcy, Francja, Wielka Brytania).

W formacie PDF dane tabelaryczne (stężenia, substancje, SCL, klasyfikacja CLP w Sekcji 3.2) ulegają często deformacjom geometrycznym (łamanie wierszy stężeń w połowie liczb, utrata kolumn, osierocone nagłówki przez paginację). Format RTF ze swej natury jest formatem logiczno-tokenowym – przechowuje jawną strukturę komórek (`\cell`) i wierszy (`\row`) tabel, akapitów (`\par`), encji Unicode (`\uN?`) oraz stron kodowych (`\'xx`).

Wymogiem projektu była bezstratna obsługa kart w formacie `.rtf` z gwarancją 100% spójności treści, braku halucynacji oraz bez instalowania nowych bibliotek zewnętrznych (zgodnie z czerwoną linią protokołu Antigravity).

## Podjęte decyzje architektoniczne

1. **W 100% natywna implementacja parsera RTF (`SDSRTFParser`):**
   - Utworzono moduł `src/modules/sds/sds.rtf.parser.js` w czystym Node.js bez zewnętrznych zależności npm.
   - Zaimplementowano maszynę stanów tokenów RTF ze stosem zagnieżdżenia grup `{...}`:
     - Automatyczne ignorowanie niesemantycznych grup metadanych (`{\fonttbl...}`, `{\colortbl...}`, `{\stylesheet...}`, `{\info...}`, grupy opcjonalne `{\*...}`).
     - Dekodowanie encji Unicode `\uN` z obsługą 16-bitowych liczb ze znakiem oraz pomijaniem bajtów zastępczych (`\ucN`).
     - Pełna obsługa stron kodowych Windows-1250 (język polski, znaki `0x80–0xFF`: ą, ć, ę, ł, ń, ó, ś, ź, ż) oraz Windows-1252 (włoski, francuski, niemiecki: à, è, é, ì, ò, ù, ä, ö, ü, ß).
     - Zachowanie operatorów relacyjnych chemii (`≤`, `≥`, `%`, `mg/m³`, `°C`).

2. **Bezstratna rekonstrukcja geometrii tabel:**
   - Token `\cell` mapowany jest na tabulator (`\t`), reprezentując fizyczną granicę kolumny tabeli.
   - Token `\row` mapowany jest na koniec wiersza (`\n`).
   - Wewnętrzne znaczniki akapitowe `\par` występujące wewnątrz komórek tabeli są normalizowane do spacji, co zapobiega połamaniu wiersza składników na wiele linii.

3. **Ujednolicona fasada ekstrakcji dokumentów (`SDSDocumentParser`):**
   - Wprowadzono klasę fasadową `SDSDocumentParser` w `src/modules/sds/sds.service.js`.
   - Automatyczna detekcja formatu pliku:
     - Po rozszerzeniu (`.rtf` vs `.pdf`).
     - Po sygnaturze binarnej nagłówka (`{\rtf1`).
   - Zachowano 100% kompatybilności wstecznej dla `SDSPDFParser` i istniejących wywołań w API.

4. **Uelastycznienie parsera Sekcji 3.2 (`SDSchemicalExtractor.parseSection3Components`):**
   - Rozbudowano ekstraktor składników tak, aby obsługiwał jednocześnie format streamingowy PDF (`[stężenie] [nazwa] CAS:[nr] [klasyfikacja]`) oraz format tabelaryczny RTF/Word z kolumnami (`[nazwa]\t[CAS]\t[stężenie]\t[klasyfikacja]`).
   - Wprowadzono detekcję numerów CAS bez sztywnego wymogu prefiksu `CAS:`, z tarczą antykolizyjną zabezpieczającą przed myleniem CAS z numerami EC/Index.

5. **Integralność potoku Zero-Bypass:**
   - Wyekstrahowany z RTF tekst trafia bezpośrednio do certyfikowanego silnika deterministycznego 14 sekcji, translacji LLM sekcji 10 i 11 oraz audytu jakości `SDSVerifierAgent` (9 reguł prawnych) i eksportera DOCX.

## Konsekwencje i weryfikacja
- Pełne wsparcie dla plików `.rtf` dostarczanych przez laboratoria chemiczne i dostawców zagranicznych.
- Zero nowych podatności (CVE) – brak nowych paczek w `package.json`.
- Zestaw dedykowanych testów `tests/sds.rtf.test.js`: 5/5 PASSED.
- Testy regulacyjne `tests/sds.compliance.test.js`: 7/7 PASSED.
- Pełny pakiet testów systemowych `npm test`: 122/122 PASSED.
