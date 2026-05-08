# @Always On - Zabezpieczenia API i Rate Limiting External API

## 1. Ochrona Zewnętrznych Endpointów (Apify & RapidAPI)
- Każdorazowo przy tworzeniu instancji modułu parsującego należy stosować mechanikę opóźnienia i kontroli błędu (Timeout and Catch). 
- Moduły scrapujące **NIE MOGĄ** znajdować się bezpośrednio na pierwszej linii front-endu (odpytywanie przez komponent UI - zakazane). Cały ruch przechodzi przez backendowy Endpoint serwera (Next.js API Route) by ochronić klucze API.

## 2. Pule zapytań (Token Bucket)
W module `ApifyScrapingController` obiekty do weryfikacji mają być zliczane w tablicach kontrolnych. Jeżeli jednorazowy strzał obejmuje > 10 zapytań, aplikacja wymusza interwał (np. 1-sekundowy delay) względem darmowych endpointów zapobiegając HTTP 429 Too Many Requests.

## 3. Fallback "Graceful Degradation"
W przypadku wystąpienia awarii darmowego API (timeout dostawcy chmurowego, pay-wall), system AI Matchmaking nie może "zablokować" klienta w pętli błędu ładującego. Wywołaj log awaryjny i przekazuj wbudowany komunikat do szkieletu `EmbedWidget`, sygnalizując brak szerszych danych profilu z możliwością manualnego weryfikowania po URL.
