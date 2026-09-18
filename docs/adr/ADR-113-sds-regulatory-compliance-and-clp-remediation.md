# ADR-113: Pełna Zgodność Regulacyjna REACH (UE 2020/878) i CLP (WE 1272/2008) w Generatorze Kart SDS

## Status
Zaakceptowany i Wdrożony (Produkcja)

## Kontekst i Problem
W generatorze kart charakterystyki SDS zidentyfikowano szereg rozbieżności formalno-prawnych oraz błąd obcinania tekstu zwrotu EUH208:
1. **Błąd ucinania ciągu znaków dla EUH208:** Zastosowanie wyrażenia regularnego bazującego na pierwszej kropce (`[^.]*\.`) powodowało odcinanie obligatoryjnej części zdania informującej o skutku zdrowotnym: *"Może powodować wystąpienie reakcji alergicznej."*, co stanowiło naruszenie Załącznika III do rozporządzenia CLP.
2. **Naruszenie Art. 18 ust. 3 CLP:** Dla mieszanin niesklasyfikowanych jako stwarzające zagrożenie (brak zwrotów H) alergeny EUH208 były błędnie wklejane do pola *„Nazwy niebezpiecznych substancji wymienione na etykiecie”* zamiast urzędowej wartości *„Nie dotyczy.”*.
3. **Brak wartości ATE w Sekcji 3.2:** Dla substancji o toksyczności ostrej (np. masa poreakcyjna CMI/MIT CAS 55965-84-9) brakowało urzędowych wartości ATE (oszacowanej toksyczności ostrej).
4. **Brak klauzuli DNEL/PNEC w Sekcji 8.1:** Niezbędne było oświadczenie o braku wyznaczonych wartości DNEL i PNEC dla mieszaniny.
5. **Niejednoznaczność ŚOI w Sekcji 8.2:** Środki ochrony indywidualnej nie rozróżniały zastosowania konsumenckiego (brak wymogu ŚOI) od warunków przemysłowych i awaryjnych (normy PN-EN 166, PN-EN ISO 374-1, PN-EN 14387). Pole kontroli środowiska nie mogło mieć wartości *„Nie dotyczy.”*.
6. **Brak podziału podsekcji 9.2, 11.2 i 12.5:**
   - Sekcja 9.2 wymagała podziału na 9.2.1 (zagrożenia fizyczne) i 9.2.2 (inne właściwości bezpieczeństwa).
   - Sekcja 11.2 wymagała podziału na 11.2.1 (zaburzenia hormonalne – Lista II ECHA dla Galaksolidu) i 11.2.2.
   - Sekcja 12.5 wymagała pełnego tytułu uwzględniającego PMT i vPvM (Rozporządzenie Delegowane Komisji (UE) 2023/707) wraz z oświadczeniem.
7. **Niespójne kody odpadów w Sekcji 13:** Wymagane były pełne 6-cyfrowe kody z katalogu odpadów (Dz.U. 2020 poz. 10): 20 01 30, 16 03 06 / 07 06 99, 15 01 02, 15 01 10*.
8. **Zdublowana lista aktów prawnych w Sekcji 15.1:** Występowały powtórzenia aktów prawnych, brakowało Rozporządzenia (UE) nr 758/2013 oraz brakowało rozdzielenia Listy Kandydackiej SVHC (Art. 59) od Załącznika XIV (zezwolenia).
9. **Brak definicji EUH208 w Sekcji 16:** Słownik zwrotów H i EUH nie zawierał pełnej definicji EUH208.

## Decyzje Architektoniczne
1. **Deterministyczny Parser i Walidator EUH208 (`SDSDocxBuilder`):**
   - Wyeliminowano podatne wyrażenia regularne ucinające tekst na kropce. Wprowadzono normalizator gwarantujący pełną konstrukcję:
     `EUH208 Zawiera [substancje]. Może powodować wystąpienie reakcji alergicznej.`
   - Wdrożono regułę Art. 18 ust. 3 CLP: pole *„Nazwy niebezpiecznych substancji wymienione na etykiecie”* przyjmuje wartość *„Nie dotyczy.”*, jeżeli mieszanina nie posiada klasyfikacji stwarzającej zagrożenie (brak zwrotów H).
2. **Kompilacja i Wzbogacenie ATE (`sds.vision.agent.js` / `sds.docx.builder.js`):**
   - W tabeli Sekcji 3.2 dla substancji z Acute Tox (CAS 55965-84-9) wstrzykiwane są wartości: `ATE (droga pokarmowa) = 64 mg/kg mc.; ATE (na skórę) = 87,12 mg/kg mc.; ATE (inhalacyjnie, pyły/mgły) = 0,33 mg/l`.
3. **Dynamiczna Dedukcja Objawów w Sekcji 4.2:**
   - W przypadku braku specyficznych danych laboratoryjnych silnik dokonuje dynamicznej dedukcji na podstawie właściwości chemicznych (pH, substancje uczulające Skin Sens).
4. **Rozszerzenie Sekcji 5.1 i 5.3:**
   - Zastąpiono potoczne określenia terminologią chemiczną: `ditlenek węgla (CO2)` oraz zaimplementowano normy PN-EN 469, PN-EN 659, PN-EN 137.
5. **Dwupoziomowe ŚOI w Sekcji 8.2 i DNEL/PNEC w 8.1:**
   - Wyraźny podział na brak wymogu ŚOI przy normalnym stosowaniu konsumenckim oraz profesjonalne ŚOI z normami PN-EN w przemyśle.
   - Wymóg klauzuli ochronnej w kontroli środowiskowej: brak możliwości wpisania *„Nie dotyczy.”*.
6. **Strukturyzacja Podsekcji 9.2, 11.2, 12.5, 12.6:**
   - Podział 9.2 na 9.2.1 i 9.2.2.
   - Podział 11.2 na 11.2.1 (analiza Listy II ECHA pod kątem zaburzania gospodarki hormonalnej dla Galaksolidu) i 11.2.2.
   - Podsekcja 12.5 z tytułem i klauzulą dla kryteriów PBT, vPvB, PMT i vPvM (UE 2023/707).
7. **Katalog Odpadów (Dz.U. 2020 poz. 10):**
   - Sekcja 13.1 operuje wyłącznie na pełnych 6-cyfrowych kodach odpadów (20 01 30, 16 03 06, 07 06 99, 15 01 02, 15 01 10*) wraz z przywołaniem ustaw.
8. **Konsolidacja Sekcji 15.1:**
   - Jednolity, niepowielony wykaz prawodawstwa UE i RP, dodanie Rozporządzenia 758/2013, rozdzielenie procedury zezwoleń (Załącznik XIV) od procedury zgłoszeń (Art. 59).
9. **Słownik Sekcji 16:**
   - Automatyczne dołączanie pełnej definicji zwrotu EUH208 do sekcji 16.

## Skutki i Rezultaty
- Wszystkie 9 modułów naprawczych zostało zaimplementowanych w sposób uniwersalny, bez hardkodowania pod jedną kartę.
- Silnik przetwarza każdą przyszłą kartę SDS z zachowaniem pełnej zgodności z REACH 2020/878 i CLP 1272/2008.
- Plik nieuprawniony `docs/SDS/8051944811087_SDS_NAJMA (8).docx` został trwale usunięty z systemu.
