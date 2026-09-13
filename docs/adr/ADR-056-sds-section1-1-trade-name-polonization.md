# ADR-056: Polonizacja Nazwy Handlowej, Przywrócenie SSOT w Podsekcji 1.1 oraz Zachowanie Nazewnictwa Plików

## Status
Zaakceptowany i wdrożony.

## Kontekst i Problem
W podsekcji 1.1 karty SDS wyjściowa nazwa handlowa produktu nie była polonizowana lub ulegała zanieczyszczeniu technicznymi nazwami plików przesyłanymi z frontendu (np. `Nazwa handlowa: 8051944811049_SDS_LULWA`).
W pliku źródłowym PDF sekcja 1.1 jednoznacznie określała identyfikator mieszaniny:
`1.1. Product identifier`
`Mixture identification:`
`Trade name: SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE LULWA`

### Wymagania biznesowe i regulacyjne:
1. **Nazewnictwo zapisanego pliku DOCX na dysku:** Pobrany plik musi bezwzględnie zachować swój unikalny identyfikator plikowy bazujący na wgrywanym dokumencie (np. `Karta_Charakterystyki_8051944811049_SDS_LULWA.docx`), aby zachować pełną kompatybilność z systemem ERP i kodami EAN.
2. **Treść podsekcji 1.1 wewnątrz karty:** Wewnątrz wygenerowanego dokumentu w sekcji 1.1 nazwa handlowa musi być spolonizowana na:
   `Nazwa handlowa: SWEET HOME LAYALI - LULWA PERFUMY DO TKANIN I POMIESZCZEŃ`.
3. Słowa `Trade name:` / `Nome commerciale:` muszą być przetłumaczone na `Nazwa handlowa:`.
4. Pierwszy człon przed myślnikiem `-` (marka, linia handlowa, np. `SWEET HOME LAYALI`) musi pozostać **w 100% w oryginale** bez tłumaczenia.
5. Człon po myślniku `-` (kategoria i opis produktu wraz z wariantem zapachowym, np. `PROFUMA TESSUTI E AMBIENTE LULWA`) musi zostać przetłumaczony na język polski z zachowaniem wariantu i poprawnym szykiem (np. `LULWA PERFUMY DO TKANIN I POMIESZCZEŃ`).
6. Karta charakterystyki (PDF) producenta jest nadrzędnym źródłem prawdy (SSOT). Żadna techniczna nazwa pliku ani placeholder nie mogą nadpisać danych wyekstrahowanych z sekcji 1.1 karty PDF wewnątrz dokumentu.

## Podjęte Decyzje Architektoniczne
1. **Warstwa UI (`frontend/src/components/SdsGeneratorTool.jsx`):**
   - Zachowano automatyczne przypisywanie nazwy pliku źródłowego do stanu `productName` w `handleFileSelect`, dzięki czemu pobierany plik zachowuje oryginalną nazwę na dysku (`Karta_Charakterystyki_${productName || file.name.replace(/\.pdf$/i, '')}.docx`).
   - Odblokowano przycisk "Generuj DOCX": atrybut `disabled={!file || isProcessing}` gwarantuje, że przycisk jest aktywny natychmiast po wybraniu pliku.
   - Usunięto błędy ESLint (nieużywana zmienna w bloku `catch`).
2. **Warstwa Silnika SDS (`src/modules/sds/sds.service.js`):**
   - **Przywrócenie SSOT w `processSection1`:** Nawet gdy z UI przesyłana jest nazwa pliku (`8051944811049_SDS_LULWA`), silnik priorytetyzuje autentyczną etykietę `Trade name:` wyekstrahowaną bezpośrednio z karty PDF.
   - **Tarcza anty-plikowa (`isTechnicalFilename`):** Wykrywanie i odrzucanie nazw plików (kody EAN, `_SDS_`, `temp_sds_`, `.pdf`, `PRODUKT CHEMICZNY`) jako nazwy handlowej wewnątrz dokumentu.
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
- Nazwa zapisanego pliku DOCX na dysku pozostaje spójna z nazwą pliku wejściowego (`Karta_Charakterystyki_8051944811049_SDS_LULWA.docx`).
- Podsekcja 1.1 wewnątrz dokumentu generuje idealnie sformatowaną linię: `Nazwa handlowa: SWEET HOME LAYALI - LULWA PERFUMY DO TKANIN I POMIESZCZEŃ`.
- Przycisk „Generuj DOCX” działa natychmiast po wybraniu pliku.
- Pełna zgodność z testami regresyjnymi (122 testy przeszły pomyślnie).
