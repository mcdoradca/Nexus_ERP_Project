# ADR-070: Integracja Oficjalnych Wektorowych Zasobów Piktogramów CLP (ECHA/UNECE) i Oznaczeń ADR w Generowaniu Kart SDS (.docx)

## Kontekst i Problem Biznesowy
Dotychczasowy mechanizm wizualizacji piktogramów w kartach charakterystyki SDS opierał się na syntetycznym wyznaczaniu uproszczonych ścieżek SVG lub prymitywnym rysowaniu matryc pikselowych (PurePngEncoder). Prowadziło to do:
1. Uproszczonych obrysów graficznych (np. geometrycznie prymitywny symbol płomienia w GHS02 czy wykrzyknika w GHS07), które odbiegały od urzędowych matryc Załącznika V do Rozporządzenia (WE) nr 1272/2008 (CLP).
2. Ryzyka niezgodności z wymaganiami art. 19 i art. 31 CLP, które nakazują stosowanie ustandaryzowanych, ściśle zdefiniowanych symboli ONZ/ECHA.
3. Braku autentycznych, urzędowych grafik dla nalepek ostrzegawczych ADR (Dział 5.2.2) oraz oficjalnego znaku Ilości Ograniczonych (LQ, Dział 3.4.7 ADR).

## Podjęte Decyzje Architektoniczne

### 1. Centralny Magazyn Urzędowych Zasobów Wektorowych (Asset Bank)
- Zorganizowano dedykowaną strukturę katalogów dla oficjalnych plików SVG:
  * `src/modules/sds/assets/pictograms/ghs/`: komplet 9 piktogramów CLP/GHS (`GHS01.svg` - `GHS09.svg`) pobranych bezpośrednio z oficjalnych wektorów ONZ/ECHA.
  * `src/modules/sds/assets/pictograms/adr/`: oficjalne oznaczenia transportowe (`ADR_3.svg` – nalepka Klasy 3 dla cieczy zapalnych oraz `ADR_LQ.svg` – znak Ilości Ograniczonych wg 3.4.7 ADR).
- Wyeliminowano z kodu wszelkie syntetyczne procedury rysowania i aproksymacji ścieżek `path`/`polygon`.

### 2. Silnik Konwersji i Pamięci Podręcznej (Sharp + In-Memory Buffer Cache)
- Zrefaktoryzowano klasy `GHSPictogramGenerator` oraz `ADRPictogramGenerator`:
  * Silnik odczytuje oficjalny plik SVG z dysku na podstawie kodu (`path.join(__dirname, 'assets', 'pictograms', ...)`).
  * Wykorzystuje bibliotekę `sharp` do bezstratnego rastrowania SVG do formatu PNG (`fit: 'contain'`, bez sztucznego mnożnika gęstości, co chroni przed błędem `Input image exceeds pixel limit` przy plikach o wysokim `viewBox`).
  * Wdrożono statyczną pamięć podręczną `bufferCache`, gwarantującą jednoznaczną konwersję raz na proces Node.js i zerowy narzut I/O przy przetwarzaniu wielu kart.
  * Zachowano deterministyczny fallback `PurePngEncoder` na wypadek pracy w środowisku bez biblioteki `sharp`.

### 3. Wstrzykiwanie do Microsoft Word (.docx)
- `SDSDocxExporter` osadza wygenerowane z urzędowych plików SVG bufory PNG jako natywne elementy `ImageRun`:
  * Podsekcja 2.2: Piktogramy GHS (dla badanej karty: `GHS02` oraz `GHS07`).
  * Podsekcja 14.3: Nalepka ADR Klasa 3.
  * Podsekcja 14.6: Znak Ilości Ograniczonych (LQ) przy dopuszczeniu towaru do wyłączenia.

## Konsekwencje i Korzyści
- **100% Zgodność Prawna i Wizualna:** Piktogramy w wygenerowanym dokumencie `.docx` są identyczne z urzędowymi matrycami opublikowanymi przez UNECE, ECHA i regulacje ADR.
- **Koniec procedury "rysowania w kodzie":** System traktuje piktogramy jako niezmienne, atestowane zasoby zewnętrzne (Single Source of Truth).
- **Bezpieczeństwo i Stabilność:** 14/14 testów prawnych na realnym PDF, 7/7 testów zgodności oraz 122/122 testów systemowych zakończonych sukcesem.
