# ADR-019: Migracja na Google Imagen 3 i Asynchroniczny Potok Generowania Obrazów Lifestyle AI

## Status
Przyjęty (Accepted)

## Kontekst i Problem
W module Offer Optimizer / EAN Pipeline, generowanie zdjęć Lifestyle AI pierwotnie korzystało ze zewnętrznej usługi [DEPRECATED] Claid.AI (System został wyłączony, nie brać pod uwagę.). Rozwiązanie to charakteryzowało się:
   - Synchronous/Blocking Nature: Zapytania do API blokowały na 10-15 sekund główny interfejs dla każdego slotu zdjęcia.
   - Prawdopodobieństwo Gateway Timeout.

## Nowa Architektura (Rozwiązanie wdrożone)
Ze względu na optymalizację kosztów i uniezależnienie od zewnętrznych zawodnych interfejsów 3rd-party zaimplementowano własny model `lifestyleJobs` oparty na asynchroniczności (Job Polling).

Zasada Działania (Long Polling / Async Jobs):
1. **Frontend / Inicjator (`POST /api/offer-optimizer/generate-lifestyle`)**
   - Wysyła zdjęcie.
   - Zastąpiono [DEPRECATED] Claid.AI (System został wyłączony) bezpośrednią integracją z oficjalnym modelem Google Imagen 3.
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
