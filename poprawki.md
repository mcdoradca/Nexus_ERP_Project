# Nexus Sentinel - Krytyczne Poprawki Architektoniczne

Niniejszy dokument stanowi zbiór wszystkich uwag i zidentyfikowanych wąskich gardeł systemu Nexus Sentinel wynikających z analizy trybu analitycznego (God-Tier, Temp: 0.0).

## 1. Zagrożenie Blokady Głównego Wątku (Node.js Event Loop)
- **Problem:** Wykonywanie obciążających zadań we/wy oraz CPU (puppeteer, ffmpeg, sharp, pdf-parse) oraz długich żądań sieciowych (odpytywanie API LLM trwające 20-45 sekund) wewnątrz głównego wątku serwera Express. 
- **Skutek:** Zawieszenie serwera dla wszystkich innych użytkowników podczas generowania prognoz AI czy eksportowania danych z EAN. Ryzyko wystąpienia błędów 504 Gateway Timeout oraz paraliżu interfejsu.
- **Zalecenie (Poprawka):** Bezwzględne przeniesienie operacji asynchronicznych i skomplikowanych operacji we/wy do oddzielnych procesów tła (Worker Threads) wspartych systemem kolejkowania zadań (Message Broker: Redis / BullMQ lub RabbitMQ). Zmiana logiki z synchronicznej na asynchroniczne aktualizacje front-endu poprzez wdrożone instancje `Socket.io` (WebSockets).

## 2. Podatność Roju AI na Awaryjność Kaskadową (Cascading Failures)
- **Problem:** Długie łańcuchy uderzeń do API (np. przy Ofertowaniu GEO: Scraper OSINT -> Agent Prawny -> Agent GEO Text -> Dyrektor Artystyczny -> Claid 3D), egzekwowane w ramach jednego cyklu.
- **Skutek:** Jeżeli zaledwie jeden wniosek do API AI w kroku "X" zawiedzie (np. Rate Limit `429 Too Many Requests` u Gemini), cała wielosekundowa praca ulega zniszczeniu, aplikacja zwraca błąd i marnowane są zapłacone tokeny i wygenerowane z pierwszych etapów pliki tymczasowe.
- **Zalecenie (Poprawka):** Wdrożenie elastycznych polityk ponawiania zadań (Retry Policies z użyciem Exponential Backoff) oraz bezwzględne trzymanie stanów i plików pośrednich w strukturach tymczasowych bazy. Umożliwi to mechanizm "Wznów po błędzie" zamiast ponownego rozpoczynania całego lejka.

## 3. Ryzyko Monolitu Bazodanowego (OLTP dla operacji analitycznych)
- **Problem:** Monolityczna struktura bazy (Prisma/Postgres) połączona w tzw. God Object (Tabela `Campaign` łączy de facto całą platformę z logami, projektami, postami, budżetami i taskami).
- **Skutek:** Obliczanie wielowymiarowych ułamków typu *True Net Margin* na żywo i modelowanie koszyków z setek zamówień obciąży system transakcyjny (OLTP). W godzinach pracy firmy zapytania Mózgu Ads i analityki mogą skutkować potężnymi lagami przy zapisach handlowców do bazy (Tablica Kanban).
- **Zalecenie (Poprawka):** Konieczne przejście na wyliczanie ciężkiej matematyki biznesowej asynchronicznie za pomocą Zmaterializowanych Widoków (Materialized Views) i mechaniki CRON-a. Skalowalne środowisko God-Mode analityki na dłuższą metę powinno korzystać z osobnej hurtowni danych (Data Warehouse / OLAP).

## 4. Uzależnienie Operacyjne (Brak zapadni bezpieczeństwa API)
- **Problem:** Architektura w dużym stopniu polega na "świeżości" i ciągłej dostępności danych zewnętrznych z BaseLinker i Allegro.
- **Skutek:** Jeśli BaseLinker opóźni się w wydaniu odświeżonych stanów magazynowych na ułamek minuty, bezwzględne algorytmy (Strażnik Smarta czy Mózg Ads w trybie RL) podejmą wrogie, automatyczne decyzje wobec rentownych kampanii (np. tnąc ich stawki do zera na podstawie "martwych", fałszywych w tym momencie wskaźników ROI).
- **Zalecenie (Poprawka):** Zaprojektowanie bezpieczników u algorytmów egzekucyjnych. Skrypt przed odcięciem CPC nie może sprawdzać tylko statusu marży, lecz również metadaną świeżości rekordu. Brak potwierdzonej łączności ze środowiskiem BaseLinker > N minut odrzuca wszystkie dyrektywy wyjścia.

## 5. Halucynacje Prawne (Agent Audytor UE 1223/2009)
- **Problem:** Poleganie na modelu językowym LLM w zapewnieniu zgodności twardej wiedzy prawnej.
- **Skutek:** Zastosowany Agent z RAG i wymuszoną zerową temperaturą (0.0) redukuje zagrożenie, niemniej żaden LLM na dzisiejszym etapie nie gwarantuje w 100% zablokowania oświadczenia medycznego (np. przepuszczenie sprytnego słowa, za które rynek wyciąga gigantyczne kary).
- **Zalecenie (Poprawka):** Mechanizm RAG i LLM powinno działać jak zaawansowany pre-filtr, ale generowane wyjście przed zapisaniem na zewnątrz musi obligatoryjnie przejść przez tradycyjny, twardo zakodowany słownik regex-a usuwający absolutne zakazane zwroty. Human-in-the-loop w postaci Handlowca musi potwierdzić to kliknięciem "Zatwierdzam Prawomocność".

## 6. Architektura Wywiadowcza "OSINT" (Podatność strukturalna)
- **Problem:** Agent Badawczy ładujący HTML aptek lub producentów jako surowiec dla dalszych modeli AI.
- **Skutek:** Dowolna zmiana layoutu (DOM) przez producentów na zewnątrz lub nałożenie systemu anty-botowego spowoduje bezużyteczność agenta ekstrakcyjnego PIM.
- **Zalecenie (Poprawka):** Przeniesienie ekstrakcji na wielopoziomowe parsowanie semantyczne stron w locie oraz podpięcie notyfikacji o błędach w scrape'ingu do głównego czatu @Nexus dla moderatora IT.
