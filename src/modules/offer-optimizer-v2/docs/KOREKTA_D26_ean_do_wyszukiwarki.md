# KOREKTA D26 — pozyskiwanie składu: EAN w wyszukiwarkę

> **ODBIORCA: WYKONAWCA + DOKUMENTACJA.** Zastępuje punkt 3 decyzji D26.

## Mechanizm

1. EAN idzie do wyszukiwarki jako zapytanie
2. wyniki bierzemy po kolei, od pierwszego
3. każdą stronę pobieramy i wycinamy z niej kandydata na listę składników
4. kandydat przechodzi test z punktu 4 D26 — **≥ 80 % pozycji musi być
   oficjalnymi nazwami z `INCI_NAMES`**
5. pierwsza strona, która przejdzie test, wygrywa; zapisujemy `source_url`,
   `raw_fragment` w oryginale i `retrieved_at`
6. żadna nie przeszła po sprawdzeniu wyników z pierwszej strony wyników →
   `COMPOSITION_NOT_FOUND` w ostrzeżeniach, potok idzie dalej bez składu

**Bez OCR. Bez hierarchii źródeł. Bez zgadywania, która strona jest lepsza** —
decyduje test glosariuszem, a nie ocena wiarygodności domeny.

## Rola modelu

Model może co najwyżej wskazać, który fragment pobranej strony jest listą
składników. **Treść pochodzi wyłącznie z pobranego HTML-a** i musi występować
w nim dosłownie — sprawdzasz to porównaniem znak w znak z `raw_fragment`.
Fragment, którego nie ma na stronie, jest odrzucany.

## Reszta bez zmian

Punkty 1, 2, 4, 5 i 6 decyzji D26 obowiązują: skład pozyskany przechodzi te same
bramki, wraca do BaseLinkera z zapisanym źródłem, a lista publikowana na ofercie
jest kopią przyjętego artefaktu.
