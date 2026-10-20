# ADR-0159: Rozdział Reżimów Prawnych (CLP vs GPSR), Eliminacja Zabetonowanego Zapachu i Rygor Biomechaniki w Potoku EAN

## Status
Zaakceptowany (Implemented)

## Kontekst
W toku weryfikacji produkcyjnej potoku EAN Pipeline dla produktów z kategorii artykułów higienicznych (np. manualne szczoteczki do zębów) zidentyfikowano trzy błędy merytoryczne i architektoniczne:
1. **Rażący błąd formalno-prawny (Oznaczenie ostrzeżeń jako `⚠️ Ostrzeżenie CLP/GPSR:`):**
   Manualna szczoteczka do zębów jest wyrobem gotowym / artykułem higienicznym (zgodnie z art. 3 pkt 3 Rozporządzenia REACH WE 1907/2006), a nie mieszaniną chemiczną. Rozporządzenie CLP (WE 1272/2008) dotyczy wyłącznie substancji i mieszanin chemicznych. Podciąganie artykułu higienicznego pod CLP to błąd prawny – wyrób podlega pod GPSR (Ogólne bezpieczeństwo produktów – UE 2023/988) oraz normy użytkowe (PN-EN ISO 20126). Ponadto w promptach Agenta 6 zabetonowana była hybrydowa etykieta `Ostrzeżenie CLP/GPSR:`, która wymuszała niezgodną z prawem nomenklaturę.
2. **Absurd w parametrach z dołu opisu (`➡️ Wariant zapachowy: MEDIUM`):**
   Szczoteczka manualna nie posiada zapachu – oznaczenie „Medium” to stopień twardości włosia wg PN-EN ISO 20126. Model wizyjny (Agent 0) bez ontologicznego rozeznania zapisał „Medium” w polu `zapach_wariant`, a orkiestrator (`orchestrator.js`) posiadał deterministyczny, zabetonowany skrypt wstrzykujący `Wariant zapachowy` bezpośrednio do listy w Sekcji 6 (Bezpieczeństwo GPSR), co skutkowało śmieciowymi i zdublowanymi tagami.
3. **Nielogiczny opis sensoryczny w instrukcji (Agent 7):**
   Agent 7 z powodu sztywnego przykładu w mechanizmie M2 Sensory Priming („czujesz pod palcami jedwabistą emulsję...”) wkleił w instrukcji mycia zębów: „poczuj sprężystą pracę włókien pod palcami”, ignorując fakt, że szczoteczkę trzyma się za uchwyt, a włókna pracują w jamie ustnej na powierzchni szkliwa i dziąseł.

## Podjęte Decyzje Architektoniczne

### 1. Rozdział Reżimów Prawnych i Likwidacja Hybrydy `CLP/GPSR`
- Wycofano z całego systemu hybrydową etykietę `Ostrzeżenie CLP/GPSR:`.
- Wprowadzono ścisły podział prawny oparty o kategorie towarowe:
  - **Artykuły i wyroby gotowe** (REACH art. 3 pkt 3, GPSR UE 2023/988, normy ISO): etykieta `⚠️ Wytyczne bezpieczeństwa (GPSR):` lub `⚠️ Ostrzeżenie (GPSR):`. Kategoryczny zakaz zwrotów CLP/H/P i piktogramów ostrzegawczych GHS.
  - **Mieszaniny chemiczne i detergenty** (Rozp. CLP WE 1272/2008, Rozp. Detergentowe WE 648/2004): etykieta `⚠️ Ostrzeżenie (CLP):` ze zwrotami H i P oraz kodem UFI.
  - **Kosmetyki** (Rozp. WE 1223/2009 / GPSR): etykieta `⚠️ Środki ostrożności (GPSR):`.
- W `gpsr.safety.service.js` rozdzielono szczoteczki manualne (`isToothbrush`) od nici dentystycznych (`isDentalFloss`). Dla szczoteczek manualnych zaimplementowano normatywne wytyczne bezpieczeństwa zgodne z PN-EN ISO 20126:
  - Wymiana co 2–3 miesiące (zużycie mechaniczne i namnażanie flory bakteryjnej).
  - Nadzór osoby dorosłej u dzieci poniżej 6 roku życia.
  - Zakaz gryzienia i połykania elementów szczoteczki.
  - Higieniczne suszenie w pozycji pionowej główką do góry.
- W `RAG_SOT_02_Prawo_Kosmetyczne_i_Chemiczne_UE.md` dodano Sekcję 4 normującą status wyrobów gotowych i artykułów.

### 2. Kognitywna Ontologia Fizyczna i Usunięcie Zabetonowanych Wstrzyknięć
- W `orchestrator.js` całkowicie usunięto deterministyczny blok skryptowy wstrzykujący `Wariant zapachowy` i parametry techniczne do Sekcji 6 (`result.section_6_html`). Sekcja 6 pozostaje czystą sekcją bezpieczeństwa i informacji GPSR.
- W `vision-extractor.service.js` (Agent 0):
  - Do promptu `FRONT_VISION_PROMPT` wprowadzono doktrynę ontologii przedmiotu: dla wyrobów bezwonnych/artykułów higienicznych kategoryczny zakaz przypisywania zapachu (`zapach_wariant: null`).
  - Oznaczenia „Medium”, „Soft”, „Hard”, „Ultra Soft” sklasyfikowano jako `twardosc_wlosia` (`Twardość włosia`).
  - Wprowadzono twardą taryfę obronną w mapowaniu cech, chroniącą przed pomyłkowym zaklasyfikowaniem stopni twardości jako nut zapachowych.
- W `Agent_6_prompt_v4.md` i `Agent_6_compiled.md` dodano `Twardość włosia` do listy dopuszczalnych parametrów Sekcji 5 oraz zakaz przypisywania zapachu wyrobom bezwonnym.

### 3. Rygor Biomechaniki i Eliminacja Szablonowości Sensorycznej (Agent 6 i 7)
- W promptach Agenta 6 i Agenta 7 zniesiono szablon „czujesz pod palcami” jako bezwzględny dogmat.
- Zdefiniowano wymóg analizy fizycznej funkcji i anatomii/biomechaniki przed wygenerowaniem treści:
  - Dla wyrobów operowanych w dłoni (szczoteczki do zębów): opis skupia się na ergonomii chwytu rękojeści, kącie 45° do linii dziąseł, ruchu wymiatająco-obrotowym od dziąsła do korony oraz umiarkowanym nacisku chroniącym szkliwo.
  - Wyeliminowano nielogiczne opisy dotykania włókien palcami w ustach.

### 4. Całkowita Nienaruszalność Modułu Tłumaczenia Kart SDS
- Wszystkie pliki modułu `src/modules/sds/**` pozostały w 100% nienaruszone (zero zmian, zero dotknięć).

## Konsekwencje
- Wyeliminowano ryzyko prawne zafałszowania statusu artykułów higienicznych w świetle rozporządzeń CLP i GPSR.
- Oferty Allegro i e-commerce dla wyrobów higienicznych generują poprawne normatywnie wytyczne bezpieczeństwa bez chemicznych kodów H/P.
- Wyeliminowano kompromitujące błędy typu „Wariant zapachowy: MEDIUM” oraz opisy mycia zębów palcami.
- Wszystkie testy jednostkowe i integracyjne modułu (215 testów) przechodzą bezbłędnie (100% pass).
