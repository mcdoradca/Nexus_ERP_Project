# ADR-071: Aktualizacja Danych Podmiotu Odpowiedzialnego / Dostawcy Karty SDS na ITALLUX Sp. z o.o.

## Kontekst i Wymagania Biznesowe
Zgodnie z poleceniem aktualizacji danych podmiotu wprowadzającego do obrotu i dostawcy karty charakterystyki w Rzeczypospolitej Polskiej (Sekcja 1.3 wg Załącznika II do Rozporządzenia (UE) 2020/878 / REACH art. 31), należało zastąpić dotychczasowe dane `MITRANS Weronika Grzesiak` nowymi danymi spółki:
- **Nazwa pełna:** `ITALLUX Sp. z o.o.`
- **Adres:** `ul. Wesoła 16, 63-600 Kępno`
- **Strona www:** `www.prostozwloch.pl`
- **E-mail:** `kontakt@prostozwloch.pl` (zgodnie z domeną serwisu oraz art. 31 REACH nakazującym podanie adresu e-mail osoby odpowiedzialnej za kartę SDS)
- **Numer telefonu:** pozostawiony bez zmian (`+48 663116607`), obsługujący również telefon alarmowy przedsiębiorstwa w Sekcji 1.4 w dni robocze 8:00–16:00.

## Zrealizowane Zmiany Techniczne

### 1. Moduł Główny Silnika SDS (`src/modules/sds/sds.service.js`)
- W `PolishLegalTemplates.getSection1_3` zaktualizowano domyślne parametry obiektu `companyConfig`:
  * `companyName`: `ITALLUX Sp. z o.o.`
  * `address`: `ul. Wesoła 16`
  * `city`: `63-600 Kępno`
  * `website`: `www.prostozwloch.pl`
  * `email`: `kontakt@prostozwloch.pl`
  * Wprowadzono do szablonu wiersz `Strona www: ${compWebsite}`.
- W `processSection1` zaktualizowano fallbacki podsekcji 1.3 na `ITALLUX Sp. z o.o.` oraz dodano renderowanie `Strona www`.
- W `SDSDocxExporter` rozszerzono wyrażenie regularne `isBoldStart` o token `Strona www`, dzięki czemu nagłówek ten jest w dokumencie Word renderowany z wytłuszczoną etykietą, w pełnej harmonii z pozostałymi polami (Firma, Adres, E-mail, Telefon).

### 2. Moduł Orkiestracji Agenta (`src/modules/sds/sds.agent.js`)
- W obiekcie `companyConfig` zaktualizowano wartości domyślne zmiennych środowiskowych (`COMPANY_NAME`, `COMPANY_WEBSITE`, `COMPANY_EMAIL`, `COMPANY_CITY`).

### 3. Testy Regresyjne i Dokumentacja Handoff
- W `tests/sds.rtf.test.js` zaktualizowano mock konfiguracyjny silnika RTF na `ITALLUX Sp. z o.o.`.
- W `docs/SDS_MASTER_HANDOFF_2026.md` zaktualizowano opis domyślnego dostawcy w podsekcji 1.3.

## Weryfikacja i Walidacja
- Przeliczono dokument `.docx` dla *SWEET HOME - PROFUMATORE AMBIENTE ORCHIDEA E VANIGLIA V2*.
- Weryfikacja bezpośrednio w strukturze XML archiwum DOCX (`word/document.xml`) potwierdziła:
  * Obecność `ITALLUX Sp. z o.o.`: **TAK**
  * Obecność `www.prostozwloch.pl`: **TAK**
  * Obecność `kontakt@prostozwloch.pl`: **TAK**
  * Całkowity brak starego ciągu `MITRANS`: **TAK**
- Testy:
  * `node tests/sds.8_points_audit.test.js` (14/14 PASSED).
  * `node tests/sds.rtf.test.js` (6/6 PASSED).
  * `node tests/sds.compliance.test.js` (7/7 PASSED).
  * `npm test` (122/122 PASSED).
