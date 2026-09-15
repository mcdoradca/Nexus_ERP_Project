# ADR-075: Eliminacja Zafałszowania Daty Producenta, Naprawa Ekstrakcji Nagłówków RTF i Determinizm Metryki SDS

## Status
Zaakceptowany i wdrożony produkcyjnie.

## Data
2026-09-15

## Kontekst i Zgłoszony Błąd Krytyczny
W wygenerowanych kartach charakterystyki SDS w formacie DOCX zidentyfikowano błąd krytyczny w metryce nagłówkowej na stronie 1 oraz w Sekcji 16:
- Zamiast autentycznej daty wydania karty przez producenta (`14.02.2025 r.`), w dokumencie pojawiła się data bieżącego uruchomienia systemu (`15.09.2026 r.`):  
  `Wersja: 1.0 PL`  
  `Zastępuje wersję: Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta z dnia 15.09.2026 r.)`.
- Taki stan rzeczy stanowił zafałszowanie historii rewizji i metadanych karty charakterystyki, co w systemie podlegającym rygorowi prawnemu REACH (Rozporządzenie UE 2020/878) i odpowiedzialności za bezpieczeństwo chemiczne jest absolutnie niedopuszczalne.

## Przyczyna Źródłowa (Root Cause Analysis)
1. **Błąd parsera RTF (`SDSRTFParser.IGNORABLE_GROUPS`):**
   W pliku `src/modules/sds/sds.rtf.parser.js` zestaw `IGNORABLE_GROUPS` zawierał tokeny `header`, `headerr`, `headerl`, `headerf`. W efekcie parser RTF traktował nagłówki dokumentu jako zbędne metadane techniczne i bezpowrotnie wycinał ich zawartość tekstową. Ponieważ w plikach RTF producenta (np. Suarez Company) numer rewizji i data (`Revision nr. 2`, `Dated 14/02/2025`, `Replaced revision:1 (Dated: 01/09/2023)`) znajdowały się w bloku `\headerr`, tekst przekazywany do silnika nie zawierał tych informacji.
2. **Niebezpieczny fallback na datę bieżącą (`new Date()`) w silniku:**
   W `src/modules/sds/sds.service.js` w metodzie `prepareAgentPayload` zaimplementowano fallback:  
   `${originalDate || new Date().toLocaleDateString('pl-PL')}`.  
   W przypadku braku wyekstrahowania daty przez parser, silnik podstawiał bieżącą datę systemową (`15.09.2026 r.`), fałszując datę karty producenta.
3. **Brak twardych asercji XML w testach:**
   Testy jednostkowe weryfikowały jedynie obecność szablonowej frazy, nie sprawdzając w warstwie XML (`word/document.xml`), czy data producenta nie została zafałszowana datą dzisiejszą.

## Podjęte Decyzje Architektoniczne

1. **Odblokowanie Ekstrakcji Nagłówków w Parserze RTF (`src/modules/sds/sds.rtf.parser.js`):**
   - Usunięto tokeny `header`, `headerr`, `headerl`, `headerf` z tablicy `IGNORABLE_GROUPS`.
   - Zapewniono pełną ekstrakcję geometrii i zawartości bloków nagłówkowych RTF, co gwarantuje natychmiastowy dostęp do fraz `Revision nr. 2`, `Dated 14/02/2025` oraz `Replaced revision:1 (Dated: 01/09/2023)` bez zaburzania segmentacji 16 sekcji.

2. **Wieloetapowa Ekstrakcja i Bezwzględny Zakaz Używania `new Date()` jako Daty Producenta (`src/modules/sds/sds.service.js`):**
   - Rozbudowano silnik ekstrakcji daty w `prepareAgentPayload` o wielojęzyczne wzorce (`Dated`, `Data revisione`, `Data compilazione`, `Revisione del`, `Emessa il`, a także kontekstowe wyszukiwanie w bloku nagłówka rewizji).
   - Całkowicie wyeliminowano fallback `new Date()` z formuły `replacedRevision`. W przypadku braku wykrycia daty silnik nie generuje zmyślonej daty bieżącej.
   - W przypadku pierwszej wersji w języku polskim formuła przyjmuje ścisłą postać:  
     `Brak (wydanie pierwsze w języku polskim, opracowane na podstawie SDS producenta z dnia 14.02.2025 r.)`.
   - W Sekcji 16 dostosowano interpunkcję, gwarantując poprawną polską typografię (pojedyncza kropka po skrócie „r.” kończącym zdanie).

3. **Propagacja do Eksporera DOCX i Twarde Asercje XML w Testach:**
   - Obiekt `finalExportData` w testach i pipeline asemblacji explicite przekazuje `replacedRevision`, `compilationDate` oraz `revisionDate`.
   - W `tests/sds.8_points_audit.test.js` oraz `tests/sds.rtf.test.js` dodano twarde asercje weryfikujące `word/document.xml`, które rzucają błąd krytyczny, jeśli data producenta nie wynosi `14.02.2025 r.` lub jeśli w klauzuli pojawi się data dzisiejsza (`new Date().toLocaleDateString('pl-PL')`).
   - Zsynchronizowano binarnie pliki `docs/SDS/Karta_Charakterystyki_8034055535448_SDS_ORCHIDEA_E_VANIGLIA (9).docx` oraz `_V2_PL.docx`.

## Wyniki Weryfikacji
- `tests/sds.8_points_audit.test.js`: 12/12 testów audytowych PASSED (w tym bezpośrednia asercja XML na obecność `14.02.2025 r.` i brak daty dzisiejszej w klauzuli producenta).
- `tests/sds.rtf.test.js`: 6/6 testów RTF PASSED (w tym pełne przetworzenie karty produkcyjnej RTF z weryfikacją XML DOCX).
- `tests/sds.compliance.test.js`: 7/7 testów PASSED.
- `npm test`: 122/122 testów systemowych PASSED (0 błędów).
