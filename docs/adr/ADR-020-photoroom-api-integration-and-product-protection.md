# ADR-020: Integracja Photoroom API i Gwarancja 100% Nienaruszalności Produktu

## Status
Przyjęty (Accepted)

## Kontekst i Problem
W module Offer Optimizer / EAN Pipeline potrzebne jest niezawodne i szybkie narządzie do generowania zdjęć z kategorii Lifestyle AI (scenerie fotograficzne produktów). Dotychczasowe próby oparte na pełnych modelach generatywnych image-to-image wywoływały ryzyko zniekształceń etykiet handlowych i napisów na opakowaniach produktów, co narusza przepisy prawa konsumenckiego (UOKiK) oraz regulaminy platform e-commerce (Allegro, Amazon).

## Podjęte Decyzje Architektoniczne

1. **Wdrożenie Photoroom API (`/v2/edit`):**
   - Zastąpiono modele generatywne dedykowaną integracją z **Photoroom Image Editing API** (`POST https://image-api.photoroom.com/v2/edit`).
   - Autoryzacja odbywa się za pomocą klucza `PHOTOROOM_API_KEY` umieszczonego w nagłówku `x-api-key`.

2. **100% Prawna Nienaruszalność Produktu (Subject Preservation):**
   - Photoroom API dokonuje automatycznej segmentacji i izolacji pierwszego planu.
   - Oryginalny produkt (wraz z wszystkimi etykietami, kodami EAN, składem i opisami) jest kopiowany w 100% w niezmienionej formie z pliku źródłowego (**0% modyfikacji pikseli obiektu**).
   - Generatywne AI działa wyłącznie na obszarze tła (`background.prompt`), nakładając naturalny cień pod obiektem (`shadow.mode=ai.auto`).

3. **Architektura Zapytania i Logowanie:**
   - Zapytanie wysyłane jest w formacie `multipart/form-data`.
   - Zdarzenia, parametry, czasy odpowiedzi oraz ewentualne wyjątki są rejestrowane do pliku `logs/lifestyle-ai.log`.

## Konsekwencje
- **Pełne Bezpieczeństwo Prawne:** Etykieta, napisy i kody na produkcie pozostają w 100% oryginalne i autentyczne.
- **Brak Błędów HTTP 504:** Szybka obróbka w połączeniu z asynchronicznym potokiem Job Ticket / Polling eliminuje jakiekolwiek timeouty połączeń.
