# ADR-048: Standaryzacja i Likwidacja Zduplikowanych Nagłówków w Sekcji 8 Kart SDS (Kontrola narażenia / środki ochrony indywidualnej, Rozporządzenie UE 2020/878 & Wzorzec EKOS)

## Status
Zaakceptowany (Accepted)

## Kontekst
W pierwotnej architekturze generatora SDS (`sds.service.js`):
1. **Zduplikowane nagłówki:** Sekcja 8 była obsługiwana hybrydowo (`MIXED`) – podsekcja 8.1 generowana deterministycznie, a 8.2 tłumaczona przez LLM, co prowadziło do sklejenia powtórzonych nagłówków (`SEKCJA 8... 8.1... 8.2...`) w środku dokumentu DOCX.
2. **Fałszywa flaga kwarantanny:** W sekcji 8.1 wyświetlany był wewnętrzny baner deweloperski `[FLAGA_QUARANTINE_REVIEW] Algorytm zablokował zagraniczne limity OEL...`, który niepotrzebnie oznaczał całą sekcję ostrzegawczym żółtym tłem.
3. **Błędna lokalizacja zagranicznego limitu OEL:** Wartość dopuszczalna dla Austrii (0,05 mg/m³ dla CAS 55965-84-9) w oryginalnym pliku PDF znajdowała się na samym dole, po środkach ochrony indywidualnej. Zgodnie z Załącznikiem II do Rozporządzenia (UE) 2020/878 i wzorcem EKOS Gdańsk, wszelkie limity narażenia zawodowego (krajowe i zagraniczne) muszą bezwzględnie znajdować się w **Podsekcji 8.1**, a nie po podsekcji 8.2.

## Decyzje Architektoniczne
1. **Deterministyczny Procesor Sekcji 8 (`SDSProcessorEngine.processSection8`):**
   - Zintegrowano całą Sekcję 8 w jednolity procesor deterministyczny `CLP_MAPPED`, całkowicie eliminując rozbicie na `content81` i `content82` oraz wykreślając `section_8_2` z procesu translacji LLM.
   - Usunięto deweloperski baner kwarantanny `[FLAGA_QUARANTINE_REVIEW]`. W przypadku braku wartości w polskim wykazie wprowadzono precyzyjną klauzulę prawną: *„Dla składników mieszaniny wymienionych w sekcji 3 nie określono krajowych wartości najwyższych dopuszczalnych stężeń (NDS, NDSCh, NDSP) w środowisku pracy zgodnie z Dz.U. 2018 poz. 1286 z późn. zm.”*.
   - Przeniesiono zagraniczny limit OEL (Austria 0,05 mg/m³ dla C(M)IT/MIT) bezpośrednio do Podsekcji 8.1 pod nagłówek *Wspólnotowe i zagraniczne dopuszczalne wartości narażenia zawodowego (OEL)*.
   - Dodano urzędowe deklaracje dotyczące wartości DNEL i PNEC (*Dla mieszaniny i jej składników nie oznaczono wartości DNEL oraz PNEC*) oraz zalecanych procedur monitorowania powietrza na stanowiskach pracy.
2. **Pełna Wierność Deklaracjom Producenta w 8.2:**
   - W podsekcji 8.2 przetłumaczono wiernie i dosłownie oświadczenia producenta: ochrona oczu (brak szczególnych wymagań, dobre praktyki), ochrona skóry (nie są wymagane szczególne środki ostrożności), ochrona rąk (nie jest wymagana), ochrona dróg oddechowych (nie dotyczy), zagrożenia termiczne (nie dotyczy), ochrona środowiska (nie dotyczy), środki higieniczne i techniczne (nie dotyczy) – bez wymyślania zbędnych norm czy sztucznych rygorów.
3. **Uproszczenie Architektury Scalania (`mergeCompletedSds`):**
   - Wyeliminowano specjalny warunek `if (i === 8)` tworzący status `MIXED`. Wszystkie sekcje od 1 do 8 są teraz jednolicie deterministyczne (`CLP_MAPPED`).
4. **Typografia DOCX (`SDSDocxExporter`):**
   - Zaktualizowano `isBoldStart` i `isLabelHeader`, zapewniając automatyczne i estetyczne pogrubienie etykiet ŚOI w czcionce Arial 20 pt.

## Konsekwencje
- Sekcja 8 generuje się w 100% deterministycznie, bez translacyjnych anomalii, duplikatów nagłówków i fałszywych flag kwarantanny.
- Prawidłowa hierarchia unijna i krajowa: limity zawodowe w 8.1, środki ochrony w 8.2.
