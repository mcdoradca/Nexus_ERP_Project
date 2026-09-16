# ADR-079: Usunięcie desynchronizacji stanu UI i dynamiczne wyznaczanie nazwy pobieranego pliku DOCX (SSOT)

## Status
Zaakceptowany i wdrożony (Production-Ready)

## Kontekst i Problem Biznesowy
Użytkownik zgłosił błąd krytyczny: po przetłumaczeniu pierwszej karty charakterystyki (`ORCHIDEA_E_VANIGLIA`) i wgraniu zupełnie innego pliku (`8034055535448_SDS_TALCO (1).rtf`), wygenerowany plik Word (.docx) został zapisany na dysku użytkownika pod starą nazwą (`Karta_Charakterystyki_8034055535448_SDS_ORCHIDEA_E_VANIGLIA (1).docx`), a pole tekstowe "Nazwa Handlowa Produktu" w interfejsie użytkownika nadal wskazywało nazwę poprzedniego produktu.

Dogłębna inspekcja kodu wykazała brak jakichkolwiek "zaszytych" nazw produktów w silniku produkcyjnym, natomiast ujawniła 3 błędy synchronizacji stanu i kontraktu HTTP:
1. **Frontend (`SdsGeneratorTool.jsx`):**
   Warunek `if (!productName) setProductName(selected.name...)` uniemożliwiał nadpisanie pola przy wgraniu kolejnego pliku, gdy w stanie komponentu znajdowała się już niepusta wartość po poprzedniej konwersji. Dodatkowo selektor `<input type="file" />` nie czyścił właściwości `value`, uniemożliwiając ponowne wybranie tego samego pliku po ewentualnym błędzie.
2. **Kontroler Backendowy (`sds.controller.js`):**
   Funkcja `res.download(...)` korzystała na sztywno z `req.body.productName` z ciała żądania, zamiast z nazwy handlowej faktycznie wyekstrahowanej przez silnik SDS (`SDSProcessorEngine`) z Sekcji 1.1 dokumentu źródłowego (SSOT).
3. **Detekcja nazw technicznych (`sds.service.js`):**
   Wzorzec `isTechnicalFilename` był zduplikowany w dwóch miejscach i nie uwzględniał rozszerzenia `.rtf`.

## Podjęte Decyzje Architektoniczne

1. **Bezwzględna synchronizacja stanu we frontendzie (`SdsGeneratorTool.jsx`):**
   - Każde zdarzenie wyboru nowego pliku (`handleFileSelect`) bezwarunkowo resetuje i synchronizuje `productName` z nazwą bazową wgranego pliku (usunięty warunek `if (!productName)`).
   - Czyści stany poprzedniej operacji (`error`, `success`, `anomalies`, `investigatorResult`).
   - Przed wywołaniem kliknięcia na ukryty element input następuje reset `fileInputRef.current.value = ''`.
   - Nazwa pobieranego pliku DOCX pobierana jest dynamicznie z nagłówka `Content-Disposition` lub nagłówka `X-Resolved-Product-Name`, z bezpiecznym fallbackiem.
   - Pobrany URL obiektu Blob jest natychmiast unieważniany przez `window.URL.revokeObjectURL(url)`.

2. **Zwracanie SSOT z Agenta do Kontrolera (`sds.agent.js` & `sds.controller.js`):**
   - `processSdsWithAgent` zwraca obiekt `{ docxPath, resolvedProductName }`.
   - `sds.controller.js` odczytuje wyznaczoną przez silnik SDS nazwę handlową (`resolvedProductName`) i sanityzuje ją pod kątem niedozwolonych znaków systemów plików (`[\\/:*?"<>|]+`).
   - Kontroler wystawia nagłówki CORS: `Access-Control-Expose-Headers: Content-Disposition, X-Resolved-Product-Name` oraz ustawia poprawną nazwę pliku w `res.download`.

3. **Konsolidacja metody `isTechnicalFilename` (`sds.service.js`):**
   - Wdrożono statyczną metodę `SDSProcessorEngine.isTechnicalFilename(name)` uwzględniającą prefiksy EAN (`\d{8,14}(?:_SDS.*)?`), `temp_sds_.*`, rozszerzenia `.pdf` i `.rtf` oraz nazwy generyczne (`PRODUKT CHEMICZNY`, `Mieszanina chemiczna`).
   - Zarówno `processSection1`, jak i `prepareAgentPayload` korzystają z jednolitej metody SSOT.

4. **Testy regresyjne i automatyczne:**
   - Rozszerzono `tests/sds.zero_hardcodes.test.js` o TEST 5 weryfikujący izolację nazw technicznych oraz nadrzędność nazwy handlowej zawartej w karcie (SSOT) nad zastałymi parametrami z UI.

## Konsekwencje
- Wyeliminowano ryzyko zapisu kart pod nazwami poprzednio przetwarzanych produktów.
- Interfejs użytkownika w sposób transparentny i natychmiastowy odzwierciedla wgrany plik.
- Pełna zgodność ze standardem Zero-Bypass i REACH UE 2020/878.
