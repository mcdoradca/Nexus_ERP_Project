# Zadania oczekujące (Technical Debt)

## Moduł: Offer Optimizer V2 (photoroom.service.js)

1. **[KRYTYCZNE] Błąd zewnętrznego API (Photoroom V2)**
   - **Opis:** Moduł rzuca wyjątek na wczesnym etapie API: `paddingLeft must be between 0 and 0.49, got 0.58`.
   - **Do zrobienia:** Wyszukać i poprawić przypisanie pola `paddingLeft` (surgical edit), tak aby jego maksymalna losowa (lub zadeklarowana) wartość nie przekraczała progu `0.49`, wymaganego przez zaktualizowany kontrakt API.

2. **[ZALECANE] Brak gwarancji limitu wielkości (<2MB)**
   - **Opis:** Funkcja kompresji `sharp` (linia ok. 577) ustala `jpeg({ quality: 95 })` na gotowym kompozycie, co nie chroni przez plikami z wysokim detalem (np. w generowanych teksturach), mogącymi incydentalnie przekroczyć wielkość 2MB akceptowaną przez BaseLinker API.
   - **Do zrobienia:** Dodać zabezpieczenie - po pierwszym zrzuceniu do bufora, skrypt powinien badać właściwość `.length` obiektu `Buffer`. Jeśli próg zostaje przebity, aplikacja powinna wejść w pętlę warunkową obniżając `quality` (np. co 5) aż waga pliku zmieści się w narzuconym limicie przed pchnięciem go w dół rurociągu (do BaseLinkera).
