# ADR-0150: Rejestr Podmiotów Odpowiedzialnych dla Marek (Pre-Flight Resolution) & Tarcza Anty-Kontaktowa Allegro w Sekcji 6

## Status
Zaakceptowany (Accepted)

## Kontekst
W potoku EAN Pipeline V2 zauważono poważny problem wydajnościowy i biznesowy:
1. **4-minutowe zawieszenia Agenta 1 (OSINT Timeout):**
   Opisy produktów w bazie PIM nie posiadały wyodrębnionego podmiotu odpowiedzialnego, przez co parametr `eu_responsible_person` bezwarunkowo trafiał do tablicy `missingFields`. Mimo że produkt posiadał w 100% poprawny skład INCI oraz parametry fizyczne z Packshotu (Agent 0), Orkiestrator bezwzględnie zmuszał Agenta 1 (`gemini-3.1-pro-preview` z Google Search) do szukania w sieci "osoby odpowiedzialnej". Zapytania Google zawieszały się na 180s, fallback na 60s również rzucał timeout, po czym potok po 4 minutach przechodził do Agenta 2.
2. **Absurd powtarzalnego wyszukiwania dla powtarzalnych marek:**
   Katalog produktów operuje wokół 50 powtarzalnych marek (m.in. Felce Azzurra, Mil Mil, Tesori d'Oriente, Chante Clair, Dual Power, Dermomed, L'Erboristica, Equilibra, Cif, Viakal, Sweet Home). Każda z nich posiada stały, urzędowy podmiot odpowiedzialny w UE (producenta korporacyjnego).
3. **Ryzyko zablokowania aukcji na Allegro:**
   Regulamin Allegro zabrania podawania jakichkolwiek danych kontaktowych (e-mail, numer telefonu, adres strony internetowej www) w treści opisu oferty (opisie HTML / Sekcji 6). Podanie takich danych skutkuje automatycznym banem aukcji przez boty Allegro.

## Decyzje Architektoniczne

### 1. Rejestr Podmiotów Odpowiedzialnych (`brand.responsible.service.js` & `brand.responsible.registry.json`)
- Wdrożono superszybką bazę referencyjną mapującą znane marki (oraz ich warianty/aliasy) na ich oficjalne, zweryfikowane podmioty odpowiedzialne w UE (Pełna nazwa prawna, fizyczny adres pocztowy z numerem domu, kodem i miastem, oraz kontakt e-mail/www do formularzy GPSR).
- Dodano algorytm fallbacku po tytule produktu w razie braku marki lub generycznego wpisu w PIM (np. "bez marki").
- Zaimplementowano bezdotykowy mechanizm samouczenia (`registerDiscoveredEntity`) zapisujący nowo odkryte przez Agenta 1 podmioty do lokalnego rejestru rozszerzeń (`brand.responsible.custom.json`).

### 2. Pre-Flight Resolution w Orkiestratorze & Pomijanie Agenta 1 (`SKIPPED`)
- W Krokach 0 i 1 Orkiestrator w pierwszej kolejności sprawdza markę produktu w `brandResponsibleService`.
- W przypadku trafienia podmiot jest natychmiast przypisywany do `this.state.extracted_data.eu_responsible_person` (`source: 'brand_registry'`) i **NIE JEST dodawany do `missingFields`**.
- Przeniesiono agregację obiektu `featuresObj` przed kalkulację `missingFields`, a pole `country_of_origin` oraz `line` są weryfikowane pod kątem obecności w `featuresObj`.
- **Rezultat:** Jeśli produkt ma już skład INCI (np. z PIM) i cechy z packshotu, `missingFields` wynosi dokładnie 0 – Agent 1 zostaje **natychmiast pominięty (`node_status['A1'] = 'SKIPPED'`)**, a potok przechodzi do Agenta 2 w ułamku sekundy, oszczędzając 4 minuty czasu operatora i tysiące tokenów.

### 3. Tarcza Anty-Kontaktowa Allegro w Sekcji 6 HTML
- Wdrożono rygorystyczne rozróżnienie:
  - **Poziom Metadanych JSON (`eu_responsible_person`):** zawiera pole `contact` (wymagane przez unijne formularze marketplace GPSR i walidator V11).
  - **Poziom Opisu HTML (`section_6_html` / `description_extra4`):** może zawierać **WYŁĄCZNIE I BEZWZGLĘDNIE**: `➡️ <b>Podmiot odpowiedzialny w UE:</b> Nazwa Podmiotu, Fizyczny Adres Pocztowy`.
- Wdrożono funkcję sanityzacyjną `stripContactInfo` oraz filtr w `sanitizeSection6Html`, który bezwzględnie wycina z kodu opisu oferty wszelkie adresy e-mail, linki i domeny www oraz numery telefonów.

## Konsekwencje
- Eliminacja 4-minutowych zawieszeń potoku przy znanych składach INCI.
- 100% ochrona ofert przed banami Allegro za dane kontaktowe w opisie.
- 191/191 testów jednostkowych potoku przechodzi z kodem 0.
