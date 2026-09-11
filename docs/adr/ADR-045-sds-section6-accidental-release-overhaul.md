# ADR-045: Strukturyzacja i Polonizacja Sekcji 6 Kart SDS (Postępowanie w przypadku niezamierzonego uwolnienia do środowiska, Rozporządzenie UE 2020/878 & Wzorzec EKOS)

## Status
Zaakceptowany (Accepted)

## Kontekst
W pierwotnej implementacji modułu SDS (`sds.service.js`):
1. Sekcja 6 była przekazywana do bloku translacyjnego `toTranslate`, co stwarzało ryzyko zaburzenia struktury 4 obowiązkowych podsekcji wymaganych przez Rozporządzenie Komisji (UE) 2020/878 (Załącznik II, Sekcja 6).
2. Tekst wyekstrahowany z PDF zawierał powtórzenia zdań oraz śmieci paginacji (`Page n.of...`, `Production Name...`), które groziły przeniknięciem do ostatecznego dokumentu.
3. Brakowało wyraźnego podziału podsekcji 6.1 na personel nieinterweniujący i interweniujący oraz jawnego odesłania w 6.4 do Sekcji 7, 8 i 13.

## Decyzje Architektoniczne
1. **Dedykowany Procesor Sekcji 6 (`SDSProcessorEngine.processSection6`):**
   - Zaimplementowano metodę przetwarzającą treść Sekcji 6 na poziomie silnika Node.js i przypisano jej status deterministyczny `CLP_MAPPED` (usunięto klucz `section_6` z pętli `toTranslate`).
   - Wprowadzono sanifikację tekstu ze stopek i nagłówków stron PDF oraz deduplikację powtarzających się zdań.
2. **Struktura Podsekcji Zgodna z Rozporządzeniem 2020/878 i Wzorcem EKOS:**
   - `6.1. Indywidualne środki ostrożności, wyposażenie ochronne i procedury w sytuacjach awaryjnych`:
     - *Dla osób nienależących do personelu udzielającego pomocy:* ewakuacja ze strefy zagrożenia, unikanie kontaktu z produktem, wentylacja, eliminacja źródeł zapłonu w przypadku produktów łatwopalnych.
     - *Dla osób udzielających pomocy:* kompletne wyposażenie ochronne (odniesienie do sekcji 8), ochrona dróg oddechowych.
   - `6.2. Środki ostrożności w zakresie ochrony środowiska`: ochrona wód gruntowych, powierzchniowych, gleby i kanalizacji; zatrzymanie wód popłucznych; obowiązek powiadomienia władz i służb ratowniczych w przypadku skażenia.
   - `6.3. Metody i materiały zapobiegające rozprzestrzenianiu się skażenia i służące do usuwania skażenia`: tamowanie wycieku, obwałowanie, stosowanie niepalnych absorbentów (piasek, ziemia okrzemkowa, sorbent uniwersalny), zmywanie powierzchni wodą.
   - `6.4. Odniesienia do innych sekcji`: jawne odesłania do Sekcji 7 (magazynowanie i bezpieczne postępowanie), Sekcji 8 (środki ochrony indywidualnej) oraz Sekcji 13 (gospodarka odpadami).
3. **Formatowanie Typograficzne DOCX (`SDSDocxExporter`):**
   - Rozszerzono wyrażenie `isBoldStart` o nagłówki grup personelu (`Dla osób nienależących do personelu udzielającego pomocy:`, `Dla osób udzielających pomocy:`), co zapewnia automatyczne pogrubienie etykiet w czcionce Arial 20 pt.

## Konsekwencje
- Sekcja 6 w wygenerowanych kartach DOCX posiada w 100% poprawną, 4-elementową strukturę prawną, zgodną ze standardem EKOS Gdańsk.
- Wyeliminowano ryzyko halucynacji translatorskich i zanieczyszczenia dokumentu artefaktami paginacji.
