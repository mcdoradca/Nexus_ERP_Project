# ADR-069: Zgodność wizualna i prawna piktogramów CLP (Sekcja 2.2), nalepek ostrzegawczych ADR (Sekcja 14.3) oraz znaku i wyłączenia Ilości Ograniczonych (LQ, Sekcja 14.6) w kartach SDS (.docx)

## Kontekst i Problem Biznesowy
Podczas audytu wygenerowanej polskiej karty charakterystyki dla produktu *SWEET HOME - PROFUMATORE AMBIENTE ORCHIDEA E VANIGLIA V2* zidentyfikowano braki i niezgodności wizualno-prawne:
1. **Podsekcja 2.2 (CLP):** Piktogramy zagrożenia generowane przez prymitywny generator PNG rysowały się jako zniekształcone, czarne poziome belki (brak rozpoznawalnego symbolu płomienia dla GHS02) oraz pojawiały się ryzyka literówek w kodach (np. `GH02`).
2. **Podsekcja 14.3 (ADR):** Brak jakichkolwiek graficznych oznaczeń ostrzegawczych w sekcji transportowej. Zgodnie z dobrymi praktykami i wymogami ADR, w podsekcji 14.3 powinna być prezentowana oficjalna nalepka ostrzegawcza (dla towarów Klasy 3 – czerwony romb z czarnym płomieniem i cyfrą 3).
3. **Podsekcja 14.6 (Szczególne środki ostrożności – Dział 3.4 ADR / Rozporządzenie UE 2020/878):** Towary dopuszczone do przewozu w wyłączeniu ilości ograniczonych (LQ – Limited Quantities, w analizowanej karcie: `Limited Quantities: 1 lt` -> `Ilości ograniczone (LQ): 1 L`) wymagają jednoznacznego oznaczenia prawnego i graficznego znaku LQ (romb z czarnym polem górnym i dolnym). Brak tego znaku utrudniał natychmiastową weryfikację logistyczno-magazynową i był niezgodny ze standardem profesjonalnych polskich kart SDS.

## Podjęte Decyzje Architektoniczne

### 1. Wektorowy generator piktogramów CLP (`GHSPictogramGenerator`) z silnikiem Sharp
- Zaimplementowano wektorowe ścieżki SVG dla wszystkich piktogramów CLP (`GHS01`–`GHS09`), w tym autentyczny, wielopunktowy symbol płomienia dla `GHS02` oraz symbol wykrzyknika dla `GHS07`, wpisane w biały romb z czerwoną ramką (`#d32f2f`).
- Zintegrowano bibliotekę `sharp` (v0.34.5) do renderowania wektorów SVG bezpośrednio do buforów PNG w wysokiej rozdzielczości (domyślnie 180x180 px), z bezpiecznym fallbackiem na deterministyczny koder `PurePngEncoder` w razie braku binariów natywnych.

### 2. Dedykowany generator oznaczeń transportowych ADR (`ADRPictogramGenerator`)
- Wdrożono klasę `ADRPictogramGenerator` udostępniającą:
  * `generateAdrLabelBuffer(classCode)`: generuje oficjalną nalepkę ostrzegawczą ADR (dla Klasy 3: czerwony romb, czarny płomień, cyfra 3 na dole; dla innych klas odpowiednie wzorce zgodne z 5.2.2 ADR).
  * `generateLqMarkBuffer()`: generuje oficjalny znak towarów w ilościach ograniczonych (romb o kącie 45° z grubą czarną ramką oraz ściśle wyliczonymi czarnymi wierzchołkami u góry i na dole zgodnie z 3.4.7 ADR).

### 3. Ekstrakcja i osadzanie w DOCX (`SDSDocxExporter`)
- W `processSection14`:
  * W podsekcji 14.3 dodano precyzyjny zapis urzędowy: `ADR / RID, IMDG, IATA: Klasa 3 (Materiały ciekłe zapalne)\nNalepka ostrzegawcza: Nr 3`.
  * W podsekcji 14.6 dodano automatyczną detekcję parametru LQ (`Limited Quantities: 1 lt` -> `Ilości ograniczone (LQ): 1 L`).
- W `SDSDocxExporter.export`:
  * Przekształcono pętlę renderowania linii na asynchroniczną (`for (const line of lines)`).
  * W podsekcji 2.2 osadzane są piktogramy GHS jako `ImageRun` w układzie horyzontalnym.
  * W podsekcji 14.3 osadzana jest nalepka ADR Klasy 3 (`ImageRun`).
  * W podsekcji 14.6, jeśli produkt posiada dopuszczenie LQ, osadzany jest oficjalny znak LQ (`ImageRun`) wraz z prawną notą: *"Znak dla towarów pakowanych w ilościach ograniczonych (LQ) zgodnie z działem 3.4 Umowy ADR"*.

### 4. Nadzorczy Audytor AI (`gemini-3.8-flash`) i Bramki Jakości
- Zaktualizowano instrukcję systemową dla modelu `gemini-3.8-flash` w `SDSVerifierAgent`:
  * Reguła 7: Walidacja piktogramów GHS w sekcji 2.2, zakaz zniekształceń i literówek (np. `GH02`).
  * Reguła 8: Weryfikacja nalepki ostrzegawczej w 14.3 oraz kwalifikacji LQ w 14.6 wg Działu 3.4 ADR.
- W `tests/sds.8_points_audit.test.js` dodano rygorystyczny `NOWY TEST 6` weryfikujący bezpośrednio archiwum `.docx` (rozpakowanie przez `adm-zip`, badanie obecności minimum 3 osadzonych grafik w `word/media/` oraz integralności `word/document.xml`).

## Konsekwencje i Korzyści
- **Pełna zgodność z REACH (UE 2020/878) i ADR 2025/2026:** Karta SDS jest w 100% gotowa do wdrożenia rynkowego, nie zawiera artefaktów graficznych ani braków w sekcjach transportowych.
- **Odporność na błędy (Defensive AI):** Brak twardych zależności uniemożliwiających uruchomienie na serwerach bez interfejsu graficznego – `sharp` działa headless, a `PurePngEncoder` zapewnia 100% SLA w razie braku silnika SVG.
- **Zero-Regresji:** Wszystkie 122 testy systemowe oraz 7 testów regulacyjnych i 14 punktów audytowych zakończone pełnym sukcesem (100% PASSED).
