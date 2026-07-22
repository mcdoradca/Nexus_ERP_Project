# ADR-019: Migracja na Google Imagen 3 i Asynchroniczny Potok Generowania Obrazów Lifestyle AI

## Status
Przyjęty (Accepted)

## Kontekst i Problem
W module Offer Optimizer / EAN Pipeline, generowanie zdjęć Lifestyle AI pierwotnie korzystało ze zewnętrznej usługi Claid.AI. Rozwiązanie to charakteryzowało się:
1. Bardzo długim czasem generowania (45–120 sekund), co przy synchronicznym zapytaniu HTTP POST prowadziło do błędów `HTTP 504 Gateway Time-out` i zrywania połączeń w przeglądarkach.
2. Wysokim kosztem eksploatacji ($0.12–$0.25 USD per zdjęcie) oraz wymogiem utrzymywania osobnego abonamentu u dostawcy zewnętrznego.
3. Ryzykiem naruszenia wymogów prawnych UOKiK / regulaminów e-commerce przy regeneracji napisów/etykiet na opakowaniach produktów.

## Podjęte Decyzje Architektoniczne

1. **Migracja na Google Imagen 3 API (`imagen-3.0-generate-002`):**
   - Zastąpiono Claid.AI bezpośrednią integracją z oficjalnym modelem Google Imagen 3.
   - Szybkość generowania scenerii została skrócona z 60s do **3–5 sekund**.
   - Koszt wygenerowania 1 zdjęcia spadł o ponad 75% — do około **$0.030 USD (~0.12 PLN)** w ramach istniejącego klucza `GEMINI_API_KEY`.

2. **100% Prawna Nienaruszalność Produktu (Pixel-Perfect Compositing):**
   - Model generatywny Google Imagen 3 tworzy **wyłącznie tło i scenerię fotograficzną**.
   - Oryginalne zdjęcie produktu (wraz ze wszystkimi etykietami, kodami i opisami) jest kompozytowane w 100% z oryginalnych pikseli warstwą wierzchnią za pomocą silnika Sharp Node.js.
   - Wyeliminowano ryzyko halucynacji tekstu na produktach, zapewniając pełną zgodność prawną.

3. **Wzorzec Asynchronous Task & Polling dla Lifestyle AI:**
   - **Backend (`POST /api/offer-optimizer/generate-lifestyle`):** Zwraca natychmiast status `HTTP 202 Accepted` z identyfikatorem zlecenia `jobId`.
   - **Endpoint Statusowy (`GET /api/offer-optimizer/generate-lifestyle/status/:jobId`):** Umożliwia frontendowi odpytywanie stanu (`PROCESSING`, `COMPLETED` z Base64 i raportem trendów wizualnych, lub `ERROR`).
   - **TTL w Pamięci RAM:** 15-minutowy czas życia zadań zabezpiecza RAM serwera Node.js (PM2).

## Konsekwencje
- **Dostępność i Bezpieczeństwo Prawne:** Całkowite wyeliminowanie błędów HTTP 504, 100% gwarancja nienaruszalności etykiet handlowych.
- **Redukcja Kosztów:** Obniżenie kosztu generowania zdjęć do ok. 0.12 PLN / zdjęcie.
- **Ekosystem:** Ujednolicenie stosu AI wokół oficjalnego Google AI API.
