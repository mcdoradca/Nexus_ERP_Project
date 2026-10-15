# ADR-0144: Aktualizacja stałego promptu Photoroom AI o wierność etykiety i kompozycję e-commerce

## Kontekst
W module generowania zdjęć produktowych (`src/modules/offer-optimizer-v2/prompt-master.service.js`) dla silnika Photoroom v2 (`photoroom.service.js`) wywołanie dynamicznego Agenta 11 jest tymczasowo zastąpione zoptymalizowanym, stałym promptem sterującym.

Dotychczasowy prompt koncentrował się na umieszczeniu produktu w tle, jednak brakowało w nim jednoznacznych wytycznych dotyczących wierności etykiety z oryginałem, nowoczesnego doświetlenia kadru oraz rygorystycznego zakazu nanoszenia jakichkolwiek napisów tekstowych przez generator obrazu.

## Podjęte decyzje
Zaktualizowano stałą `hardcodedPrompt` w [src/modules/offer-optimizer-v2/prompt-master.service.js](file:///z:/Nexus_ERP_Project/src/modules/offer-optimizer-v2/prompt-master.service.js) do następującej treści:

> *"Odczytaj wszystkie informacje ze zdjęcia produktu zwłaszcza funkcje i zastosowanie. Następnie wygeneruj zdjęcie z produktem w tle nawiązujące do jego charakteru, cech i funkcji odczytanych ze zdjęcia. Bądź oryginalny i nie powtarzaj ujęć. Produkt nie może stać w centrum kadru. Produkt nie może stać na pierwszym planie. Produkt jest dodatkiem do zdjęcia a nie jego głównym elementem. Produkt musi posiadać w 100% zgodną etykietę z załączonym oryginałem. Stosuj jasne oświetlenie i nowoczesne ujęcia. Wykonujesz zdjęcia do e-commerce więc muszą zachęcać do zakupu. Nie wolno Ci nic pisać na zdjęciu."*

Kluczowe wzmocnienia semantyczne:
1. **Pełna zgodność etykiety (100% label fidelity):** Bezwzględny nakaz odwzorowania etykiety z załączonego oryginału bez halucynacji graficznych.
2. **Standardy fotografii e-commerce:** Wymóg jasnego oświetlenia, nowoczesnych ujęć i perswazyjnego charakteru zdjęcia.
3. **Zakaz generowania tekstu:** Jawna dyrektywa zakazująca silnikowi AI wpisywania jakichkolwiek napisów/słów na zdjęciu.

## Skutki architektoniczne
- Podwyższona konwersja wizualna generowanych ujęć lifestylowych.
- Eliminacja niepożądanych napisów zniekształcających zdjęcia produktowe na marketplace'ach.
- Zachowanie mechanizmu blokad wątkowych (`generationLocks`) i pełnej telemetrii logów.
