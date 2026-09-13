# ADR-056: Polonizacja Nazwy Handlowej i Ekstrakcja Identyfikatora w Podsekcji 1.1 Karty SDS

## Status
Zaakceptowany i wdrożony.

## Kontekst i Problem
W podsekcji 1.1 karty SDS wyjściowa nazwa handlowa produktu nie była polonizowana lub zawierała surowe nagłówki techniczne z pliku PDF.
W przypadku importowanych produktów chemicznych (np. zapachów do wnętrz i tkanin):
`1.1. Product identifier`
`Mixture identification:`
`Trade name: SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE LULWA`
w karcie przetłumaczonej pojawiała się nieprzetłumaczona nazwa po etykiecie "Nazwa handlowa:":
`Nazwa handlowa: SWEET HOME LAYALI - PROFUMA TESSUTI E AMBIENTE LULWA`

### Wymagania biznesowe i regulacyjne:
1. Słowa `Trade name:` / `Nome commerciale:` muszą być przetłumaczone na `Nazwa handlowa:`.
2. Pierwszy człon przed myślnikiem `-` (marka, seria, linia handlowa, np. `SWEET HOME LAYALI`) musi pozostać **w 100% w oryginale** bez tłumaczenia.
3. Człon po myślniku `-` (kategoria i opis produktu wraz z wariantem zapachowym, np. `PROFUMA TESSUTI E AMBIENTE LULWA`) musi zostać przetłumaczony na język polski z zachowaniem wariantu i poprawnym szykiem (np. `LULWA PERFUMY DO TKANIN I POMIESZCZEŃ`).
4. Format docelowy:
   `Nazwa handlowa: SWEET HOME LAYALI - LULWA PERFUMY DO TKANIN I POMIESZCZEŃ`.
5. W przypadku przekazania do silnika domyślnego stringa `PRODUKT CHEMICZNY`, silnik ma priorytetowo pobierać rzeczywistą nazwę z karty PDF zamiast pozostawiać generyczny placeholder.

## Podjęte Decyzje Architektoniczne
W klasie `SDSProcessorEngine` w `src/modules/sds/sds.service.js`:
1. **Dedykowana metoda `polonizeTradeName(rawName)`:**
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
2. **Aktualizacja `processSection1` i `prepareAgentPayload`:**
   - Wyeliminowanie nadpisywania rzeczywistej nazwy wartością domyślną `PRODUKT CHEMICZNY`.
   - Zapis wyznaczonej spolonizowanej nazwy do `this.lastResolvedTradeName` i synchronizacja metadanych `metadata.productName` dla nagłówka dokumentu DOCX.

## Rezultaty
- Podsekcja 1.1 generuje idealnie sformatowaną linię identyfikatora produktu: `Nazwa handlowa: SWEET HOME LAYALI - LULWA PERFUMY DO TKANIN I POMIESZCZEŃ`.
- Nagłówek dokumentu DOCX (`SDS | ...`) odzwierciedla spolonizowaną nazwę handlową zamiast generycznego placeholdera.
- Pełna zgodność z testami regresyjnymi (122 testy przeszły pomyślnie).
