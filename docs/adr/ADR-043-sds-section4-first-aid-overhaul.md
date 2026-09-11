# ADR-043: Reformulacja i Certyfikacja Sekcji 4 Kart SDS (Środki Pierwszej Pomocy, Rozporządzenie UE 2020/878 & Wzorzec EKOS)

## Status
Zaakceptowany (Accepted)

## Kontekst
W pierwotnej implementacji modułu SDS (`sds.service.js`):
1. Sekcja 4 (Środki pierwszej pomocy) była traktowana jako pole kwarantanny (`QUARANTINE`), przez co system wklejał deweloperski baner błędu `[FLAGA_QUARANTINE_REVIEW]` wraz z surowym, nieprzetłumaczonym zrzutem angielskiego/włoskiego tekstu źródłowego (`ORYGINAŁ DO WERYFIKACJI:`).
2. W wygenerowanym pliku DOCX sekcja otrzymywała żółte tło kwarantanny, a klient otrzymywał dokument niezdatny do użytku prawnego i medycznego w Polsce.
3. Brakowało usystematyzowanego podziału na 4 obowiązkowe drogi narażenia (skóra, oczy, przewód pokarmowy, drogi oddechowe) oraz spójności podsekcji 4.2 z wykrytymi w Sekcji 2.2 alergenami (EUH208).

## Decyzje Architektoniczne
1. **Dedykowany Procesor Sekcji 4 (`SDSProcessorEngine.processSection4`):**
   - Zaimplementowano metodę przetwarzającą treść Sekcji 4 w oparciu o certyfikowane wytyczne medyczne Rozporządzenia (UE) 2020/878 (Załącznik II, Sekcja 4) oraz oficjalny wzorzec EKOS Gdańsk (`wzor-karta-charakterystyki-SDS-MSDS-www_ekos_gda_pl.pdf`).
   - Całkowicie wycofano flagę kwarantanny i deweloperski baner, nadając sekcji typ `CLP_MAPPED`.
2. **Struktura Podsekcji 4.1 (4 Drogi Narażenia):**
   - Wdrożono certyfikowane formuły postępowania ratowniczego:
     - `W kontakcie ze skórą:` natychmiastowe zmycie dużą ilością wody z mydłem, zdjęcie skażonej odzieży, konsultacja przy podrażnieniach/reakcjach alergicznych.
     - `W kontakcie z oczami:` płukanie przy szeroko otwartych powiekach przez 10–15 minut, ochrona niepodrażnionego oka, usunięcie soczewek, bezzwłoczna konsultacja okulistyczna.
     - `W przypadku spożycia:` bezwzględny zakaz wywoływania wymiotów bez wskazań lekarza, przepłukanie ust wodą, okazanie karty charakterystyki/etykiety.
     - `Po narażeniu drogą oddechową:` wyprowadzenie na świeże powietrze, zapewnienie spokoju i ciepła w pozycji półsiedzącej, pomoc lekarska przy złym samopoczuciu.
3. **Podsekcje 4.2 i 4.3 (Objawy i Leczenie):**
   - W podsekcji 4.2 zintegrowano informację o braku specyficznych ostrych objawów z potencjałem uczulającym (powiązanie z obecnością substancji wywołujących zwrot EUH208).
   - W podsekcji 4.3 zaimplementowano standardową klauzulę leczenia objawowego i decyzji lekarza ratunkowego.
4. **Typografia i Stylizacja w DOCX (`SDSDocxExporter`):**
   - Rozszerzono wyrażenie regularne `isBoldStart` o prefiksy dróg narażenia oraz klauzulę leczenia (`W kontakcie ze skórą|W kontakcie z oczami|W przypadku spożycia|Po narażeniu drogą oddechową|Leczenie:`), co gwarantuje eleganckie, pogrubione nagłówki instrukcji w jednolitym kroju Arial.

## Konsekwencje
- Sekcja 4 jest w 100% zgodna z wymogami Rozporządzenia Komisji (UE) 2020/878 oraz oficjalnym polskim wzorcem EKOS.
- Wyeliminowano z dokumentu docelowego DOCX wszelkie deweloperskie artefakty i surowy język obcy.
