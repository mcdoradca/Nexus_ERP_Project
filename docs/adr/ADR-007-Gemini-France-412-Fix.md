# ADR 007: Rozwiązanie konfliktu parametrów Gemini API (412 FAILED_PRECONDITION) dla klastrów EU

## Kontekst
Agenci 1 (z `grounding: true`) oraz 11 (z `temperature: 0.8`) zaczęli rzucać błędy `412 FAILED_PRECONDITION` w wywołaniach Gemini API wyłącznie na środowisku produkcyjnym (VPS OVH, Francja). Zjawisko to nie występowało lokalnie. 

Analiza wykazała, że klastry regionalne Google mają różne polityki walidacji parametrów dla modeli serii Gemini 3. Starsze lub bardziej restrykcyjne węzły (np. `europe-west9` we Francji) rzucają "Precondition Failed", gdy:
1. Tryb "myślenia" (`thinkingLevel`) zostanie użyty jednocześnie z narzędziem wyszukiwarki (Grounding / `googleSearch`).
2. Tryb "myślenia" (`thinkingLevel`) zostanie użyty jednocześnie z parametrem `temperature > 0`.

## Decyzja
Aby zapewnić stabilność wywołań w regionach o wyższych restrykcjach API (jak Francja), zdecydowano o usunięciu spornych parametrów na poziomie konfiguracji agentów w pliku `nodes.config.js`:
- Dla Agenta 1 (Priorytet: Grounding): usunięto parametr `thinkingLevel`, zachowując niezbędne wyszukiwanie.
- Dla Agenta 11 (Priorytet: Myślenie): usunięto parametr `temperature` (wymuszając tym samym domyślną i bezpieczną wartość `0` dla modeli z rodziny Thinking).

## Konsekwencje
- **Pozytywne:** Odzyskano pełną stabilność potoku EAN na produkcji. Zapytania przechodzą bez błędu 412 na każdym klastrze regionalnym.
- **Negatywne:** Agent 1 (Optymalizator) utracił warstwę "myślenia" przed wygenerowaniem odpowiedzi, co potencjalnie w skomplikowanych zadaniach może marginalnie wpłynąć na jakość dedukcji. Zachowano jednak krytyczne, zewnętrzne uziemienie danych (Grounding).
