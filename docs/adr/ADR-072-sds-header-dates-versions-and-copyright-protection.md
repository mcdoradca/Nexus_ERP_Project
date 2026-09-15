# ADR-072: Harmonizacja Nagłówka, Dat, Wersjonowania (UE 2020/878 Załącznik II Pkt 0.2.5) i Ochrony Autorskiej Kart SDS

## Kontekst i Ramy Prawne
Podczas audytu zgodności kart SDS z wymogami Rozporządzenia Komisji (UE) 2020/878 z dnia 18 czerwca 2020 r. zmieniającego załącznik II do rozporządzenia (WE) nr 1907/2006 (REACH) oraz oficjalnymi wytycznymi Europejskiej Agencji Chemikaliów (ECHA Guidance on the compilation of SDS), zidentyfikowano potrzebę dopracowania formy nagłówka oraz ustrukturyzowania informacji o wersjach i datach:

1. **Pkt 0.2.5 Załącznika II do REACH:**
   - Nakazuje podanie na pierwszej stronie daty sporządzenia karty.
   - W przypadku nowej wersji karty nakazuje wyraźne oznaczenie: `Aktualizacja: (data)` oraz umieszczenie informacji o numerze wersji, numerze aktualizacji i dacie zmiany/zastąpionej wersji.
2. **Pkt 0.3.2 Załącznika II do REACH i Wytyczne ECHA:**
   - Wymóg numeracji stron w formacie `Strona X z Y` oraz stała identyfikacja produktu i wersji w nagłówku każdej strony (`KARTA CHARAKTERYSTYKI | [Produkt] | Wersja: [X]`).
3. **Pkt 16 lit. a Załącznika II do REACH:**
   - W Sekcji 16 nakazuje zamieszczenie wyraźnych informacji, gdzie w porównaniu z poprzednią wersją wprowadzono zmiany, wraz z objaśnieniem.
4. **Ochrona przed kopiowaniem przez nieuczciwą konkurencję:**
   - Dane chemiczno-regulacyjne (CAS, kody H/P, limity NDS) stanowią fakty i normy urzędowe wyłączone z ochrony autorskiej (art. 4 pr. aut.).
   - Autorskie opracowanie tłumaczenia, formatowanie, szata typograficzna i kompozycja dokumentu podlegają ochronie na gruncie prawa autorskiego i ustawy o zwalczaniu nieuczciwej konkurencji.
   - Znak wodny w tle nie może ograniczać czytelności ani kontrastu (pkt 0.2.1 i 0.2.3 REACH nakazują jasną i natychmiastową czytelność danych ratunkowych). Wdrożono bezpieczną i elegancką ochronę w postaci powtarzającej się stopki dystrybutora na każdej stronie, nagłówka oraz oficjalnej klauzuli prawno-autorskiej w Sekcji 16.

## Wdrożone Zmiany Techniczne

### 1. Ekstrakcja Dat i Rewizji z PDF (`src/modules/sds/sds.service.js`)
- W `SDSProcessorEngine.prepareAgentPayload` zaimplementowano precyzyjną ekstrakcję z tekstu źródłowego:
  * Pierwotnego numeru rewizji/wersji (`revMatch`),
  * Daty sporządzenia / rewizji źródłowej (`dateMatch`),
  * Wersji i daty zastąpionej (`replMatch`),
  * Polonizację zapisu (np. `Dated: 01/09/2023` -> `z dnia 01.09.2023`).
- Wyliczone parametry trafiają do obiektu `metadata` oraz przekazywane są do `processSection16`.

### 2. Sekcja 16 – Informacje o Zmianach i Klauzula Prawna
- Zaktualizowano `processSection16`, dodając dedykowany rejestr wprowadzonych zmian:
  * Wskazanie wersji zastępowanej (`wersja 2.0 PL zastępuje wersję 1.0`),
  * Wyszczególnienie zmian w sekcjach 1.3, 8.1, 11.2, 12.6, 13 i 14,
  * Wstrzyknięcie klauzuli prawnej chroniącej autorskie prawa majątkowe ITALLUX Sp. z o.o. przed komercyjnym wykorzystaniem przez podmioty trzecie.

### 3. Nowy Układ DOCX (`SDSDocxExporter`)
- **Tytuł:** `KARTA CHARAKTERYSTYKI` (bold, 36pt, Arial, center).
- **Podstawa prawna:** `[Sporządzona zgodnie z Rozporządzeniem (WE) nr 1907/2006 (REACH), zmienionym Rozporządzeniem Komisji (UE) 2020/878]`.
- **Tabela Metadanych (Pkt 0.2.5):** Estetyczna tabela 2x2 z zielonym akcentem `00A651`, tłem `F9FAFB` i polami:
  * `Data sporządzenia: [data]` | `Wersja: [nr]`
  * `Aktualizacja: [data]` | `Zastępuje wersję: [nr/data]`
- **Header:** `KARTA CHARAKTERYSTYKI | [Nazwa Produktu] | Wersja: [Wersja]` z subtelną kreską dolną.
- **Footer:** `Dystrybutor: ITALLUX Sp. z o.o. (www.prostozwloch.pl) | Strona X z Y` z subtelną kreską górną.

## Weryfikacja
- `tests/sds.8_points_audit.test.js`: 14/14 testów PASSED.
- `tests/sds.rtf.test.js`: 6/6 testów PASSED.
- `tests/sds.compliance.test.js`: 7/7 testów PASSED.
- `npm test`: 122/122 testów systemowych PASSED.
- Wygenerowany plik `docs/SDS/Karta_Charakterystyki_8034055535448_SDS_ORCHIDEA_E_VANIGLIA_V2_PL.docx` zweryfikowano binarnie w strukturze XML (`word/document.xml`, `word/header1.xml`, `word/footer1.xml`).
