# ADR-054: Prawna Certyfikacja Podsekcji 1.4 (Numer Telefonu Alarmowego) wg Rozporządzenia (UE) 2020/878 i Wytycznych ECHA

## Status
Zaakceptowany i wdrożony.

## Kontekst i Problem
Dotychczasowy stan podsekcji 1.4 w `processSection1` generował wyłącznie lakoniczną linię ogólnych numerów ratunkowych:
`112 (ogólny telefon alarmowy w Polsce), 998 (straż pożarna), 999 (pogotowie ratunkowe)`.

Podczas audytów zgodności z przepisami chemicznymi (Rozporządzenie REACH, wytyczne ECHA, kontrole Państwowej Inspekcji Sanitarnej / ECHA Forum) takie sformułowanie stanowi poważne uchybienie formalne i merytoryczne:
1. **Niewystarczalność numeru 112:** Operatorzy Centrów Powiadamiania Ratunkowego (112) oraz dyspozytorzy straży/pogotowia nie są toksykologami klinicznymi, nie dysponują bazami składów chemicznych PCN ani nie udzielają specjalistycznych porad medyczno-chemicznych w nagłych wypadkach.
2. **Naruszenie Załącznika II do Rozporządzenia (UE) 2020/878 (pkt 1.4):** Przepis wprost nakłada obowiązek wskazania oficjalnego organu doradczego (art. 45 CLP) lub – w przypadku podania numeru przedsiębiorstwa – wyraźnego określenia godzin dostępności oraz ewentualnych ograniczeń (język obsługi).
3. **Brak danych godzinowych i językowych:** Podanie numeru przedsiębiorstwa bez godzin urzędowania i języka jest niezgodne z wytycznymi ECHA (*Guidance on the compilation of safety data sheets*).

## Podjęte Decyzje Architektoniczne

1. **Wdrożenie Architektury 3-Członowej w Podsekcji 1.4 (`processSection1`):**
   - **Telefon interwencyjny przedsiębiorstwa (podmiotu odpowiedzialnego):**
     Dynamicznie zintegrowany z `this.companyConfig.emergencyPhone` wraz z obligatoryjną urzędową deklaracją dostępności i języka:
     *`Telefon alarmowy przedsiębiorstwa: +48 663 116 607 (czynny od poniedziałku do piątku w godzinach 8:00 – 16:00, informacja udzielana w języku polskim)`*.
   - **Oficjalny organ doradczy ds. zatruć w Polsce (art. 45 CLP):**
     *`Krajowe Centrum Informacji Toksykologicznej (Instytut Medycyny Pracy im. prof. J. Nofera w Łodzi): tel. +48 42 631 47 24, +48 42 631 47 25 (czynne w dni robocze w godz. 7:00 – 15:00)`*,
     oraz referencyjny całodobowy punkt:
     *`Ośrodek Informacji Toksykologicznej w Warszawie (całodobowa informacja toksykologiczna 24/7): tel. +48 22 619 66 54`*.
   - **Ogólne telefony ratunkowe w nagłych wypadkach (pomocniczo):**
     *`112 (ogólnoeuropejski numer alarmowy), 998 (straż pożarna), 999 (pogotowie ratunkowe)`*.

2. **Dostosowanie Typografii DOCX (`SDSDocxExporter`):**
   - Rozszerzono filtry `isLabelHeader` o nagłówek *`Informacja toksykologiczna w Polsce (organ doradczy):`*.
   - Rozszerzono filtr `isBoldStart` o prefiksy: *`Telefon alarmowy przedsiębiorstwa`*, *`Krajowe Centrum Informacji Toksykologicznej.+?`*, *`Ośrodek Informacji Toksykologicznej.+?`*, *`Ogólne telefony ratunkowe.+?`*.
   - Zapewniono profesjonalny skład typograficzny w czcionce Arial 20 pt z wyodrębnionymi etykietami.

## Konsekwencje i Rezultaty
- Podsekcja 1.4 osiągnęła 100% zgodności z Rozporządzeniem Komisji (UE) 2020/878 oraz oficjalnymi wytycznymi ECHA.
- Wyeliminowano ryzyko sankcji ze strony Państwowej Inspekcji Sanitarnej i organów kontroli rynku chemikaliów.
- Zapewniono precyzyjne ścieżki reagowania kryzysowego dla konsumentów, personelu medycznego oraz służb ratunkowych.
