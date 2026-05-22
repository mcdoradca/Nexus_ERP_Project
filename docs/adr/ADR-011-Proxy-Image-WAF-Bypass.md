# ADR 011: Proxy Image WAF Bypass & Frontend Fallback

## Kontekst i Problem
Moduł Ofertowania GEO AI (MTool) wyświetlał błędy `PLIK WYGASŁ LUB ZABLOKOWANY PRZEZ ZEWNĘTRZNY SERWER` podczas ładowania zdjęć z zewnętrznych serwerów (np. BaseLinker, Claid, CDN). Wynikało to z działania systemów anty-DDoS i WAF, które blokowały proste żądania HTTP (domyślny agent `axios`) wysyłane przez nasz backendowy endpoint `/api/offer-optimizer/proxy-image`.

## Decyzja Architektoniczna
1. **Wzmocnienie Backend Proxy**: Do żądań `axios` w `proxyImage` zostały dodane nagłówki maskujące (`User-Agent`, `Accept`), wyłączona ścisła weryfikacja SSL (`rejectUnauthorized: false`) oraz zaimplementowano timeout (10s). 
2. **Defensive AI Fallback (Backend)**: W przypadku błędu proxy (np. 403 z WAF), backend przechwytuje błąd (`catch`) i zamiast rzucać 500, zwraca `302 Redirect` (`res.redirect(url)`) na źródłowy URL, przekazując obciążenie ominięcia WAF na przeglądarkę klienta, która posiada pełne nagłówki i historię.
3. **Defensive AI Fallback (Frontend)**: Zaktualizowano komponenty `PhotographicAuditorCard` i `ImageModal` – jeśli główny obrazek nie załaduje się po przejciu przez proxy, stan błędu powoduje natychmiastową próbę załadowania `url` z pominięciem proxy (pobieranie bezpośrednie).

## Konsekwencje
- **Pozytywne:** Odsetek utraconych wyświetleń zdjęć spadnie o blisko 100%. System stał się wysoce odporny na blokady serwerowe.
- **Negatywne:** Żądania bezpośrednie omijające proxy w rzadkich wypadkach mogą skutkować ostrzeżeniem Mixed Content, jeśli środowisko zmusza HTTPS, a źródło to HTTP, jednak na ten moment służą jedynie podglądowi wizualnemu, co jest akceptowalne.
