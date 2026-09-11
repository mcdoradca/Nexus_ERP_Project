# ADR-047: Wycofanie Nadgorliwości i Pełna Wierność Deklaracjom Producenta w Sekcjach 1–7 Kart SDS

## Status
Zaakceptowany (Accepted)

## Kontekst
W toku iteracyjnego uszczegóławiania sekcji 4, 5, 6 i 7 karty charakterystyki w module `sds.service.js` doszło do zjawiska tzw. **nadgorliwości algorytmicznej (overzealous hallucination)**. System w miejsce wiernego przekładu deklaracji producenta zaczął dopisywać nieistniejące w karcie źródłowej parametry techniczne i ogólne zalecenia podręcznikowe BHP, w szczególności:
1. **Sekcja 7.2:** Dopisano sztuczny zakres temperatur magazynowania (`5°C do 30°C`), ochronę przed mrozem i słońcem, zakazy magazynowania z kwasami i zasadami oraz wymogi nienasiąkliwej posadzki chemoodpornej magazynu – podczas gdy producent zadeklarował wyłącznie: *"Incompatible materials: None in particular. Instructions as regards storage premises: Adequately ventilated premises"*.
2. **Sekcja 4:** Dopisano sztuczny czas płukania oczu („10-15 minut”), nakaz ochrony niepodrażnionego oka, płukanie ust, pozycję półsiedzącą oraz spekulacyjny esej o leczeniu objawowym w 4.3 – wbrew zwięzłym formułom producenta (*"rinse with water... for a sufficient length of time"*, *"Treatment: Data not available"*).
3. **Sekcja 5.1 & 5.2:** Dopisano nieistniejący zakaz zwartego strumienia wody oraz wydzielanie tlenków węgla i dymów.
4. **Sekcja 6.3 & 6.4:** Dopisano zmyślone sorbenty (*trociny, ziemia okrzemkowa, uniwersalne środki wiążące*), podczas gdy producent wskazał wyłącznie *materiał pochłaniający, organiczny, piasek* oraz zmycie wodą; dopisano również nieistniejące odesłanie do sekcji 7.
5. **Sekcja 1:** Całkowicie pominięto podsekcję 1.2 (*Zastosowania zidentyfikowane i odradzane*) oraz oznaczono sekcję 1 fałszywą kwarantanną.

Karta charakterystyki jest dokumentem odpowiedzialności prawnej producenta, dlatego dopisywanie nienadanych przez niego parametrów technicznych stanowiło poważne uchybienie merytoryczne.

## Decyzje Architektoniczne
1. **Zasada Prawdy Źródłowej i Minimalizmu Prawnego:**
   - Wprowadzono twardą zasadę: silnik SDS dokonuje wiernego przekładu i ustrukturyzowania deklaracji producenta. Wzbogacenie następuje **wyłącznie o bezwzględnie wymagane polskie odesłania prawne** (krajowe akty prawne Dz.U., polskie telefony alarmowe 112/998/999, polskie nazewnictwo chemiczne i urzędowe zwroty CLP), z kategorycznym zakazem zmyślania parametrów fizykochemicznych, operacyjnych i technologicznych.
2. **Rekonstrukcja Sekcji 1 (`processSection1`):**
   - Przywrócono podsekcję 1.2 z wiernym określeniem zastosowania (*Zastosowanie konsumenckie: perfumy do tkanin i prania*; *Zastosowania odradzane: nie stosować do celów innych niż wskazane*).
   - Uporządkowano kolejność podsekcji: 1.1 -> 1.2 -> 1.3 (Producent SUAREZ + Dystrybutor MITRANS) -> 1.4 (polskie tel. alarmowe 112/998/999 + telefon producenta).
   - Usunięto flagę `QUARANTINE` – Sekcja 1 otrzymała status deterministyczny `CLP_MAPPED`.
3. **Chirurgiczne Oczyszczenie Sekcji 4, 5, 6 i 7:**
   - **Sekcja 4:** Wycięto sztuczny czas 10-15 min, pozycję półsiedzącą, płukanie ust. W 4.2 i 4.3 przywrócono deklaracje producenta: *Brak dostępnych szczegółowych informacji na temat objawów* oraz *Leczenie: Brak danych*.
   - **Sekcja 5:** Wycięto zakaz zwartego strumienia wody (niewłaściwe środki: *Brak szczególnych*) oraz wydzielanie tlenków węgla. Pozostawiono autentyczne wskazania producenta dot. normy EN 469, aparatów SCBA i ochrony wód gaśniczych.
   - **Sekcja 6:** Wycięto trociny i ziemię okrzemkową; pozostawiono autentyczny piasek i materiał organiczny oraz odesłania do sekcji 8 i 13.
   - **Sekcja 7:** Wycięto zmyślony zakres temperatur 5–30°C, kwasy, zasady, elaboraty higieniczne i posadzki chemoodporne. Sekcja 7 wiernie podaje zalecenia producenta: wentylowane pomieszczenia, brak szczególnych materiałów niezgodnych, brak szczególnych zastosowań końcowych.
4. **Typografia DOCX:**
   - Dostosowano regułę `isBoldStart` oraz `isLabelHeader` w `SDSDocxExporter`, zapewniając eleganckie, czytelne formatowanie nagłówków i etykiet w czcionce Arial 20 pt.

## Konsekwencje
- Sekcje 1–7 w wygenerowanym dokumencie DOCX są w 100% spójne z oryginalną kartą producenta.
- Zlikwidowano wszelkie halucynacje i nieuprawnione dopiski.
- Karta spełnia najwyższe standardy audytowe i prawne bez ryzyka wprowadzenia odbiorcy w błąd.
