# ADR-0156: Kanonizacja Włoskich Podmiotów Odpowiedzialnych GPSR oraz Tarcza Anty-Kontaktowa Allegro

## Status
ZAAKCEPTOWANY / WDROŻONY NA PRODUKCJI

## Kontekst i Problem Biznesowy
1. **Faktograficzne błędy podmiotów odpowiedzialnych GPSR dla towarów z importu:**
   W bazie referencyjnej `brand.responsible.registry.json` część marek globalnych i importowanych z rynku włoskiego (kody EAN 800–803) miała błędnie przypisane podmioty krajowe (polskie spółki zależne, np. Colgate-Palmolive (Poland) Sp. z o.o., Procter & Gamble DS Polska Sp. z o.o., Reckitt Benckiser (Poland) S.A., L'Oréal Polska Sp. z o.o.). Dla chemii gospodarczej kupowanej bezpośrednio we Włoszech, oficjalnym podmiotem odpowiedzialnym w UE jest jednostka włoska bądź europejska centrala producenta.
   Ponadto marka *Spuma di Sciampagna* nie była zmapowana na jej oficjalnego producenta (`REAL CHIMICA S.R.L.`, Via Monte Santo 37, 20831 Seregno MB, Włochy), co powodowało ucieczkę Agenta 1 do OSINT Google Search i przypisanie podmiotu handlowego *Italsilva Commerciale S.r.l.* wraz z jego adresem e-mail.

2. **Ryzyko zablokowania aukcji na Allegro z powodu danych kontaktowych:**
   Zgodnie z regulaminem Allegro, w treści opisu oferty (w tym w Sekcji 6 karty technicznej GPSR) obowiązuje bezwzględny zakaz umieszczania danych kontaktowych (adresów e-mail, stron WWW, numerów telefonów). Obecność adresu `info@spumadisciampagna.it` w wygenerowanym HTML narażała konto sprzedawcy na kary i blokady listingów.
   W dotychczasowym kodzie:
   - Obiekt `eu_responsible_person` w całości (wraz z polem `contact`) trafiał do promptu Agenta 6, prowokując model do wypisywania maila w HTML.
   - Warunek wstrzykiwania w Sekcji 6 sprawdzał `!content.includes(euData.address_eu)` – jeśli model wygenerował poprawny adres wraz z mailem, podmiana była omijana.
   - Naiwny filtr telefoniczny mógł uszkadzać 13-cyfrowe kody kreskowe EAN.

## Podjęte Decyzje Architektoniczne
1. **Kanonizacja rejestru marek (`brand.responsible.registry.json`):**
   - Przypisano markę *Spuma di Sciampagna* (wraz z wariantami `spuma di sciampagna`, `spumadisciampagna`, `sauber`) do oficjalnego producenta:
     `REAL CHIMICA S.R.L.`, Via Monte Santo 37, 20831 Seregno (MB), Włochy.
   - Zaktualizowano podmioty dla chemii importowanej do oficjalnych spółek we Włoszech:
     - Colgate / Palmolive / Ajax / Fabuloso $\rightarrow$ `Colgate-Palmolive Commerciale S.r.l.`, Viale Alexandre Gustave Eiffel 15, 00148 Roma (RM), Włochy.
     - Reckitt Benckiser (Sole / Calgon / Finish / Vanish / Woolite) $\rightarrow$ `Reckitt Benckiser Commercial (Italia) S.r.l.`, Via Spadolini 7, 20141 Milano (MI), Włochy.
     - P&G (Viakal / Dash / Fairy / Ariel / Lenor) $\rightarrow$ `Procter & Gamble S.r.l.`, Viale Giorgio Ribotta 11, 00144 Roma (RM), Włochy.
     - L'Oréal / Garnier $\rightarrow$ `L'Oréal Italia S.p.A.`, Via Primaticcio 155, 20147 Milano (MI), Włochy.
     - Dodano `Henkel Italia S.r.l.` (Bref, Dixan, Pril, Perlana, Bio Presto, Nelsen).

2. **Odcięcie pola `contact` od promptu Agenta 6 (`orchestrator.js`):**
   - W `agent6Data` pole `eu_responsible_person` przekazuje wyłącznie `{ name, address_eu }`. Agent 6 fizycznie nie otrzymuje adresu e-mail ani telefonu w danych wejściowych SKU.

3. **Deterministyczna i bezwarunkowa podmiana GPSR w Sekcji 6:**
   - Wzorzec `<li>➡️ <b>Podmiot odpowiedzialny w UE:</b> ...</li>` jest zawsze bezwarunkowo zastępowany kanonicznym ciągiem `brandResponsibleService.formatForHtmlDescription(euData)` (`${cleanName}, ${cleanAddress}`).

4. **Wzmocnienie tarczy `stripContactInfo` (`brand.responsible.service.js`):**
   - Usuwa e-maile, linki URL, domeny `www.`, numery telefonów z prefiksem międzynarodowym (`+39`, `+48`), numery poprzedzone etykietami (`tel`, `infolinia`, `kontakt`, `phone`) oraz numery z separatorami grup cyfr.
   - Zabezpieczono ciągłe 13-cyfrowe kody EAN oraz kody pocztowe UE przed przypadkową destrukcją.
   - Tarcza została wdrożona globalnie na wszystkich sekcjach oferty (Sekcje 1–6 i 7).

## Skutki i Weryfikacja
- Baza testowa powiększona do 207 testów (100% pass rate).
- Niemożliwe jest jakiekolwiek przeniknięcie adresu e-mail, strony www lub telefonu do opisu oferty.
- Produkty marek włoskich (m.in. Spuma di Sciampagna, Fabuloso, Sole, Viakal) otrzymują prawidłowe, zgodne z prawem i rzeczywistym stanem importu włoskie podmioty odpowiedzialne GPSR.
