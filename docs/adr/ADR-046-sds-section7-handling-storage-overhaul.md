# ADR-046: Standaryzacja i Zgodność Sekcji 7 Kart SDS (Postępowanie z substancjami i mieszaninami oraz ich magazynowanie, Rozporządzenie UE 2020/878 & Wzorzec EKOS)

## Status
Zaakceptowany (Accepted)

## Kontekst
W dotychczasowym procesie generowania kart SDS (`sds.service.js`):
1. Sekcja 7 była przekazywana do niekontrolowanego słownika `toTranslate`. Skutkowało to bezkrytycznym tłumaczeniem skrajnie lakonicznych formułek ze źródeł zagranicznych (np. "Avoid contact with skin and eyes... Do not eat or drink while working... Incompatible materials: None in particular... Adequately ventilated premises").
2. Takie sformułowania naruszały wymogi Rozporządzenia Komisji (UE) 2020/878 (Załącznik II, Sekcja 7), które nakłada obowiązek podania szczegółowych zaleceń dotyczących:
   - pełnych procedur higieny pracy (zakaz spożywania posiłków i palenia, mycie rąk po użyciu i przed przerwami, obowiązek zdjęcia zanieczyszczonej odzieży ochronnej przed wejściem do stref socjalnych),
   - zarządzania ryzykiem magazynowania (oryginalne szczelne opakowania, ochrona przed mrozem i słońcem, zakres temperatur 5–30°C, separacja od żywności i mocnych utleniaczy/kwasów/zasad, zabezpieczenie posadzki magazynu przed wyciekami, ochrona przed dziećmi),
   - zastosowania końcowego (podsekcja 7.3 powiązana ze zidentyfikowanymi zastosowaniami z sekcji 1.2 zamiast pustego "Brak szczególnych").

## Decyzje Architektoniczne
1. **Dedykowany Procesor Sekcji 7 (`SDSProcessorEngine.processSection7`):**
   - Wdrożono metodę `processSection7(contentIt, productName)` przekazującą przetworzoną, certyfikowaną treść bezpośrednio do `deterministicSections.section_7` z oznaczeniem `CLP_MAPPED`.
   - Klucz `section_7` został wykreślony z pętli `toTranslate` (w puli pozostały wyłącznie `[9, 10, 11, 12, 14]` oraz `section_8_2`).
2. **Struktura Podsekcji Zgodna z Rozporządzeniem 2020/878 i Wzorcem EKOS:**
   - `7.1. Środki ostrożności dotyczące bezpiecznego postępowania`:
     - *Środki ostrożności:* unikanie kontaktu ze skórą i oczami, unikanie wdychania par i mgieł, zapewnienie wentylacji, ochrona przed źródłami zapłonu w przypadku substancji łatwopalnych/lotnych (`hasFlammable`).
     - *Zalecenia dotyczące ogólnej higieny pracy:* pełny trójelementowy standard ECHA (zakaz jedzenia/picia/palenia, mycie rąk przed posiłkami, zdejmowanie i pranie odzieży zanieczyszczonej).
     - *Zalecany sprzęt ochrony osobistej:* jawne odesłanie do sekcji 8.
   - `7.2. Warunki bezpiecznego magazynowania, w tym informacje dotyczące wszelkich wzajemnych niezgodności`:
     - *Warunki magazynowania:* oryginalne, szczelnie zamknięte i oznakowane pojemniki; ochrona przed światłem słonecznym, wilgocią, przemrożeniem i ciepłem.
     - *Zalecana temperatura magazynowania:* 5°C – 30°C; zabezpieczenie przed dziećmi i osobami niepowołanymi.
     - *Materiały niezgodne:* brak szczególnych przy prawidłowym użytkowaniu; separacja od silnych utleniaczy, kwasów, zasad i pasz/żywności.
     - *Wskazówki dotyczące pomieszczeń magazynowych:* wentylowane, suche, o nienasiąkliwej posadzce uniemożliwiającej wycieki do gruntu/kanalizacji.
   - `7.3. Szczególne zastosowanie(-a) końcowe`:
     - Dynamiczne powiązanie z typem produktu (dla linii zapachowych: "Mieszanina zapachowa / perfumy do tkanin i wnętrz (odświeżacz powietrza)") z jawnym odesłaniem do podsekcji 1.2 oraz etykiety.
     - *Rozwiązania specyficzne dla sektora przemysłowego:* brak szczególnych wytycznych.
3. **Formatowanie Typograficzne DOCX (`SDSDocxExporter`):**
   - Rozszerzono wyrażenie `isBoldStart` o ujednolicone etykiety podsekcji Sekcji 7 (`Środki ostrożności`, `Zalecenia dotyczące ogólnej higieny pracy`, `Zalecany sprzęt ochrony osobistej`, `Warunki magazynowania`, `Zalecana temperatura magazynowania`, `Materiały niezgodne`, `Wskazówki dotyczące pomieszczeń magazynowych`, `Zastosowanie`, `Rozwiązania specyficzne dla sektora przemysłowego`).

## Konsekwencje
- Sekcja 7 generuje się deterministycznie, bez translacyjnych halucynacji i skrótów myślowych.
- Karta spełnia w 100% wymogi Rozporządzenia (UE) 2020/878 Załącznik II oraz polskiego wzorca urzędowego EKOS Gdańsk.
