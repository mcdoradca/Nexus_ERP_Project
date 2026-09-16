# ADR-082: Poprawki Audytu Sanepid / PIP dla Karty TALCO (DNEL Skóra, NOEC, Alergeny, Teleadresowe)

## Kontekst
Podczas audytu zgodności nowo wdrożonej karty charakterystyki TALCO (`8034055535431_SDS_TALCO (1).pdf`) wykryto 4 uchybienia regulacyjno-strukturalne oraz zaktualizowano wymagania teleadresowe:
1. **Sekcja 8.1 (DNEL Metanol - Droga skórna):** Pominięcie wiersza `Na skórę:` w karcie DOCX ze względu na sztywne ograniczenie parsera do tablic dwuelementowych. Metanol posiada 4-elementowy wektor (konsumenci ostre/przewlekłe = 4 mg/kg mc/d; pracownicy ostre/przewlekłe = 20 mg/kg mc/d) oraz polską notację "skóra" i klasyfikację Acute Tox. 3 (H311).
2. **Sekcja 12.1 (Ekotoksyczność - NOEC i organizmy testowe):** Ucięcie badań chronicznych NOEC dla salicylanu benzylu, kumaryny i metanolu, spowodowane podziałem wiersza w PDF (wskaźnik w jednej linii, wartość i gatunek w kolejnej) oraz ucinaniem bloku substancji na powtórzonym nagłówku strony `SECTION 12`.
3. **Sekcja 4.2 (Lista alergenów w reakcji alergicznej):** Użycie `.find()` zamiast `.filter()` powodowało listowanie tylko pierwszego alergenu, z pominięciem pozostałych substancji uczulających wykazanych w EUH208.
4. **Dane teleadresowe:** Błąd w domenie i adresie e-mail dystrybutora – przejście na `www.prostozwloch.com.pl` i `kontakt@prostozwloch.com.pl`.
5. **Polityka artefaktów:** Trwałe wycofanie z repozytorium 6 starych plików Orchidea e Vaniglia i zakaz ich odtwarzania.

## Podjęte Decyzje Architektoniczne

1. **Parser DNEL dla wektorów wielowartościowych (Sekcja 8.1):**
   - W `parseDnelBlock` zniesiono ograniczenie do 2 wartości.
   - Wprowadzono obsługę wektorów 4-wartościowych z precyzyjnym rozróżnieniem skutków ostrych układowych i przewlekłych układowych dla konsumentów i pracowników.
2. **Normalizacja i scalanie linii wieloliniowych w Ekotoksyczności (Sekcja 12.1):**
   - Zmodyfikowano `extractSubstanceBlock` usuwając `SECTION` z separatora końcowego, zapobiegając ucinaniu tabel przy podziale stron w 25-stronicowym dokumencie PDF.
   - Wprowadzono scalanie sąsiadujących linii w parserze (gdy wskaźnik badawczy występuje w linii $N$, a wartość z jednostką i gatunkiem w linii $N+1$).
   - Dodano obsługę kanoniczną organizmów `Danio rerio` oraz `Mytilus edulis (omułek)`.
3. **Wyczerpująca lista alergenów w Sekcji 4.2:**
   - Zastąpiono selektor pojedynczy `.find()` pełną iteracją `.filter()` po wszystkich komponentach ze statusem uczulającym (`Skin Sens` / `H317`).
   - Wszystkie wykryte alergeny poddawane są fleksji do biernika (`toAccusative`) i formatowane jako `zawiera: salicylan benzylu, kumarynę (2H-chromen-2-on), hydroksycytronellal`.
4. **SDSLinter Gatekeeper (Reguły 6, 7, 8):**
   - Reguła 6: Wymóg obecności `- Na skórę:` w Sekcji 8.1 dla substancji z notacją "skóra" posiadających DNEL.
   - Reguła 7: Blokada generowania pustych wskaźników badawczych w Sekcji 12.1 (`- LC50 (ryby):`).
   - Reguła 8: Wymóg spójności alergenów w Sekcji 4.2 z wykazem z Sekcji 2.2 / EUH208.
5. **Aktualizacja danych firmy:**
   - Ujednolicono adresy `www.prostozwloch.com.pl` oraz `kontakt@prostozwloch.com.pl` w serwisie, agentach, nagłówkach i stopkach DOCX.

## Konsekwencje i Walidacja
- Zapewniono pełną zgodność z Załącznikiem II do rozporządzenia REACH (UE 2020/878) oraz rozporządzeniem CLP (WE 1272/2008).
- Wszystkie testy jednostkowe, integracyjne i audytowe (`sds.talco_audit.test.js`, `sds.8_points_audit.test.js`, `sds.schema.validator.test.js`, `sds.zero_hardcodes.test.js`, `sds.rtf.test.js`, `sds.compliance.test.js`, `sds.compiler_engine.test.js`) zakończone z wynikiem 100% PASS na nowej karcie TALCO.
- Żadne ze skasowanych plików Orchidea nie zostały odtworzone.
