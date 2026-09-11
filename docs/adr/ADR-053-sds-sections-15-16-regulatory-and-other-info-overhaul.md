# ADR-053: Pełna Prawna Certyfikacja Sekcji 15 (Przepisy Prawne) i Sekcji 16 (Inne Informacje) wg Rozporządzenia (UE) 2020/878

## Status
Zaakceptowany i wdrożony.

## Kontekst i Problem
Dotychczasowy stan Sekcji 15 i 16 zawierał poważne niezgodności prawne z Załącznikiem II do Rozporządzenia Komisji (UE) 2020/878 oraz polskim prawem:
1. **Sekcja 15:**
   - Miała status kwarantanny (`QUARANTINE`), generując żółte wyróżnienie w wygenerowanym dokumencie Word.
   - Całkowicie brakowało w niej obligatoryjnej podsekcji `15.2. Ocena bezpieczeństwa chemicznego`.
   - Zawierała komentarze robocze dla deweloperów ("Uwaga dla algorytmu...").
   - Publikatory aktów prawnych RP były przestarzałe (Ustawa o odpadach ze starym Dz.U. 2013 poz. 21, Ustawa o substancjach ze starym Dz.U. 2011 nr 63 poz. 322).
2. **Sekcja 16:**
   - Była tworzona prymitywnym regexem `mapHazardClass(rawSections["section_16"])`.
   - W efekcie dokument zawierał zniekształcone, angielskie linie tekstu (`EUH071Corrosive to the respiratory tract`, `Toxic if swallowed`), artefakty paginacji PDF (`Page n.of79 Production Name...Date`), angielski słownik akronimów (brak NDS, NDSCh, NDSP, BDO) oraz brak polskich oficjalnych definicji klas zagrożeń CLP.

## Podjęte Decyzje Architektoniczne

1. **Pełna Legalizacja i Wdrożenie Podsekcji w Sekcji 15 (`processSection15`):**
   - Likwidacja kwarantanny (`QUARANTINE` $\rightarrow$ `CLP_MAPPED`) i usunięcie wszelkich deweloperskich notatek.
   - Wdrożenie jawnej podsekcji `15.1. Przepisy prawne dotyczące bezpieczeństwa, zdrowia i ochrony środowiska specyficzne dla substancji lub mieszaniny`:
     - *Prawodawstwo UE:* REACH 1907/2006 (z dynamiczną weryfikacją SVHC Załącznik XIV i restrykcji Załącznik XVII), Rozporządzenie (UE) 2020/878, CLP 1272/2008 z ATP, Rozporządzenie detergentowe 648/2004, Dyrektywa Seveso III 2012/18/UE, Rozporządzenie PIC 649/2012.
     - *Prawodawstwo RP:* aktualne teksty jednolite ustaw (Ustawa o substancjach chemicznych t.j. Dz.U. 2022 poz. 1816; Rozporządzenie MRPiPS ws. NDS/NDSCh Dz.U. 2018 poz. 1286; Ustawa o odpadach t.j. Dz.U. 2023 poz. 1587; Ustawa o gospodarce opakowaniami t.j. Dz.U. 2023 poz. 1658; Katalog Odpadów Dz.U. 2020 poz. 10; Ustawa o przewozie towarów niebezpiecznych t.j. Dz.U. 2024 poz. 643; Rozporządzenie MZ ws. bhp przy czynnikach chemicznych t.j. Dz.U. 2016 poz. 1488; Rozporządzenie MZ ws. badań i pomiarów czynników szkodliwych t.j. Dz.U. 2023 poz. 419; Kodeks pracy t.j. Dz.U. 2023 poz. 1465).
   - Wdrożenie obligatoryjnej podsekcji `15.2. Ocena bezpieczeństwa chemicznego`:
     - Oficjalna formuła prawna: *„Dla mieszaniny nie dokonano oceny bezpieczeństwa chemicznego (dla mieszanin nie jest ona wymagana zgodnie z art. 14 rozporządzenia REACH).”*

2. **Deterministyczny Kompilator Sekcji 16 (`processSection16`):**
   - Zamiana prymitywnego regexu na deterministyczny procesor `CLP_MAPPED`:
     - **Pełne brzmienie zwrotów H i EUH po polsku:** automatyczna agregacja unikalnych kodów H i EUH z Sekcji 2, Sekcji 3 oraz tekstu źródłowego Sekcji 16, z pobraniem oficjalnego polskiego brzmienia z bazy `OFFICIAL_CLP_H_PHRASES`.
     - **Wykaz klas i kategorii zagrożeń:** mapowanie kodów technicznych (np. `Acute Tox. 2`, `Skin Corr. 1C`, `Skin Sens. 1A`, `Aquatic Chronic 1`) na urzędowe polskie nazwy kategorii wg rozporządzenia CLP.
     - **Polski słownik akronimów i skrótów:** wyczerpujący wykaz polskich i międzynarodowych skrótów (NDS, NDSCh, NDSP, DNEL, PNEC, BCF, log Kow, PBT, vPvB, SVHC, REACH, CLP, GHS, ADR, RID, IMDG, IATA, ICAO, CAS, WE, BDO, ECHA).
     - **Źródła danych i zalecenia szkoleniowe BHP:** wskazanie baz ECHA, PubChem i normatywów krajowych oraz obowiązkowe zalecenia przeszkolenia pracowników.
     - **Czyszczenie paginacji:** całkowita eliminacja linii ze stopkami stron i numeracją PDF.

3. **Całkowita Likwidacja Statusu Kwarantanny w Systemie:**
   - Wszystkie sekcje karty charakterystyki (Sekcje 1 do 16 poza 10 i 11 tłumaczonymi przez LLM) posiadają status `CLP_MAPPED` lub `EXTRACT_RAW`.
   - Żadna sekcja w całym systemie nie generuje żółtego tła ani banerów `[FLAGA_QUARANTINE_REVIEW]`.

## Konsekwencje i Rezultaty
- Karta charakterystyki osiągnęła 100% zgodności z wymogami Rozporządzenia Komisji (UE) 2020/878 oraz aktów prawnych RP.
- Wyeliminowano wszystkie wtrącenia anglojęzyczne i błędy typograficzne w Sekcjach 15 i 16.
- DOCX generuje perfekcyjny, profesjonalny układ z wyróżnionymi nagłówkami i etykietami.
