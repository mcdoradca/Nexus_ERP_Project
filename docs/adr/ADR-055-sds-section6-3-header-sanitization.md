# ADR-055: Sanityzacja Nagłówka i Eliminacja Duplikatów w Podsekcji 6.3 Karty SDS

## Status
Zaakceptowany i wdrożony.

## Kontekst i Problem
W generowanym dokumencie podsekcja 6.3 zawierała powtórzony nagłówek w języku angielskim sklejony z właściwą treścią:
`"6.3. Metody i materiały zapobiegające rozprzestrzenianiu się skażenia i służące do usuwania skażenia`
`6.3. Methods and material for containment and cleaning up Odpowiedni materiał do zbierania: materiał pochłaniający, organiczny, piasek. Zmyć dużą ilością wody."`

### Przyczyna źródłowa:
1. **Dziura w regexie usuwającym nagłówek:** Dotychczasowe wyrażenie `/^(?:Methods and material...)/i` oczekiwało, że wyekstrahowany tekst zacznie się bezpośrednio od słowa `Methods`. W plikach PDF, w których nagłówek zaczynał się od numeru podsekcji (np. `6.3. Methods...`), warunek `^Methods` nie dopasowywał się, pozostawiając obcojęzyczny nagłówek w zmiennej `cleanRaw`.
2. **Brak odfiltrowania nagłówka z tablicy linii:** Pozostawiony nagłówek nie był tłumaczony przez słownik fraz i był bezkrytycznie łączony spacją (`parts.join(' ')`) z przetłumaczonymi instrukcjami usuwania skażenia, tworząc hybrydowy zlepek pod polskim tytułem podsekcji.

## Podjęte Decyzje Architektoniczne
W trybie chirurgicznym, z ograniczeniem wyłącznie do podsekcji 6.3:
1. **Wdrożenie wielowariantowego regexu w `cleanRaw`:**
   Rozszerzono usuwanie nagłówka o opcjonalny prefiks `(?:6\.3\b[.:\-]?\s*)?` przed nagłówkami angielskimi, włoskimi i polskimi.
2. **Dodanie filtra linii nagłówkowych w tablicy `parts`:**
   Wprowadzono filtr odrzucający linie będące samym numerem `6.3` lub obcojęzycznym nagłówkiem podsekcji 6.3 przed scaleniem tablicy `parts`.

## Rezultaty
- Podsekcja 6.3 generuje wyłącznie jeden oficjalny polski nagłówek oraz czystą, przetłumaczoną treść procedur usuwania skażenia.
- Całkowicie wyeliminowano powtórzenia i wtrącenia anglojęzyczne w podsekcji 6.3.
