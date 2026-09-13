# ADR-056: Polonizacja Nazwy Handlowej i Przywrócenie SSOT w Podsekcji 1.1 Karty SDS

## Status
Zaakceptowany i wdrożony.

## Kontekst i Problem
W podsekcji 1.1 karty SDS wyjściowa nazwa handlowa produktu nie była polonizowana lub ulegała zanieczyszczeniu technicznymi nazwami plików przesyłanymi z frontendu (np. `Nazwa handlowa: 8051944811049_SDS_LULWA`).
W pliku źródłowym PDF sekcja 1.1 jednoznacznie określała identyfikator mieszaniny:
`1.1. Product identifier`
`Mixture identification:`
`Trade name: SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE LULWA`

### Przyczyny źródłowe:
1. **Zanieczyszczenie stanu w UI (`SdsGeneratorTool.jsx`):**
   Komponent w `handleFileSelect` automatycznie wykonywał `setProductName(selected.name.replace('.pdf', ''))`. W rezultacie pole formularza było wstępnie wypełniane techniczną nazwą pliku (np. `8051944811049_SDS_LULWA`) i bezwiednie przesyłane do backendu.
2. **Naruszenie zasady Single Source of Truth (SSOT) w backendzie (`sds.service.js`):**
   Metoda `processSection1` priorytetyzowała parametr `productName` nad autentyczną etykietą `Trade name:` wyekstrahowaną bezpośrednio z karty PDF producenta. W efekcie silnik odrzucał dane z karty i polonizował techniczną nazwę pliku.

### Wymagania biznesowe i regulacyjne:
1. Słowa `Trade name:` / `Nome commerciale:` muszą być przetłumaczone na `Nazwa handlowa:`.
2. Pierwszy człon przed myślnikiem `-` (marka, seria, linia handlowa, np. `SWEET HOME LAYALI`) musi pozostać **w 100% w oryginale** bez tłumaczenia.
3. Człon po myślniku `-` (kategoria i opis produktu wraz z wariantem zapachowym, np. `PROFUMA TESSUTI E AMBIENTE LULWA`) musi zostać przetłumaczony na język polski z zachowaniem wariantu i poprawnym szykiem (np. `LULWA PERFUMY DO TKANIN I POMIESZCZEŃ`).
4. Format docelowy:
   `Nazwa handlowa: SWEET HOME LAYALI - LULWA PERFUMY DO TKANIN I POMIESZCZEŃ`.
5. Karta charakterystyki (PDF) producenta jest nadrzędnym źródłem prawdy (SSOT). Żadna techniczna nazwa pliku ani placeholder nie mogą nadpisać danych wyekstrahowanych z sekcji 1.1 karty PDF.

## Podjęte Decyzje Architektoniczne
1. **Warstwa UI (`frontend/src/components/SdsGeneratorTool.jsx`):**
   - Usunięto automatyczne przypisywanie nazwy pliku do stanu `productName` po wybraniu PDF.
   - Zaktualizowano placeholder na `Automatycznie z karty PDF (lub wpisz własną nazwę)`.
2. **Warstwa Silnika SDS (`src/modules/sds/sds.service.js`):**
   - **Przywrócenie SSOT w `processSection1`:** Jeśli w pliku PDF w sekcji 1.1 występuje `Trade name:` / `Nome commerciale:` / `Nazwa handlowa:` / `Product name:`, system bezwzględnie pobiera ten ciąg jako bazę identyfikatora produktu.
   - **Tarcza anty-plikowa (`isTechnicalFilename`):** Wykrywanie i odrzucanie nazw plików (kody EAN, `_SDS_`, `temp_sds_`, `.pdf`, `PRODUKT CHEMICZNY`).
   - **Obsługa ręcznego nadpisania (HITL):** `manualOverrides.productName` zachowuje pełną moc w procedurze wznowienia/interwencji człowieka.
   - **Dedykowana metoda `polonizeTradeName(rawName)`:**
     - Sanityzacja: usuwanie nagłówków `1.1. Product identifier`, `Mixture identification:`, `Trade name:`, `Nome commerciale:` itp.
     - Detekcja separatora myślnika (` - `, ` – `, ` — `) dzielącego markę od opisu.
     - Słownik mapowań fraz rodzajowych chemii gospodarczej i kosmetycznej:
       - `PROFUMA TESSUTI E AMBIENTE` -> `PERFUMY DO TKANIN I POMIESZCZEŃ`
       - `PROFUMATORE PER BUCATO` / `PROFUMA BUCATO` -> `PERFUMY DO PRANIA`
       - `PROFUMA TESSUTI` -> `PERFUMY DO TKANIN`
       - `DEODORANTE AMBIENTE` -> `ODŚWIEŻACZ POWIETRZA`
       - `DETERGENTE SUPERFICI` -> `ŚRODEK DO MYCIA POWIERZCHNI`
       - `DETERSIVO LAVATRICE` / `DETERSIVO BUCATO` -> `PŁYN DO PRANIA`
       - `AMMORBIDENTE` -> `PŁYN DO PŁUKANIA TKANIN`
       - `SGRASSATORE` -> `ODTŁUSZCZACZ UNIWERSALNY`
       - `LAVAPAVIMENTI` -> `PŁYN DO MYCIA PODŁÓG`
       - `DISINCROSTANTE` -> `ŚRODEK ODKAMIENIAJĄCY`
       - `GEL WC` -> `ŻEL DO WC`
       - `SAPONE LIQUIDO` -> `MYDŁO W PŁYNIE`
       - `DETERGENTE PIATTI` -> `PŁYN DO NACZYŃ`
       - `DETERGENTE` -> `ŚRODEK CZYSZCZĄCY / DETERGENT`
     - Wyodrębnienie wariantu zapachowego / nazwy własnej (np. `LULWA`, `NAJMA`) i złożenie polskiego szyku: `[MARKA] - [WARIANT] [POLSKA KATEGORIA]`.
     - Bezpieczny fallback: jeśli człon po myślniku nie zawiera znanej frazy lub brak myślnika, zachowanie oryginalnego brzmienia bez ucinania tekstu.
3. **Synchronizacja metadanych nagłówka DOCX:**
   - Wyznaczona spolonizowana nazwa handlowa trafia do `metadata.productName` i nagłówka stron dokumentu Word.

## Rezultaty
- Wyeliminowano podstawianie technicznej nazwy pliku (`8051944811049_SDS_LULWA`) do sekcji 1.1.
- Podsekcja 1.1 generuje idealnie sformatowaną linię: `Nazwa handlowa: SWEET HOME LAYALI - LULWA PERFUMY DO TKANIN I POMIESZCZEŃ`.
- Pełna zgodność z testami regresyjnymi (122 testy przeszły pomyślnie).
