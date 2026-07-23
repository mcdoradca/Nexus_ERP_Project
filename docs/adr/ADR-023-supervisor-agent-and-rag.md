# ADR 023: Architektura Supervisor Agenta i bazy RAG dla procesów PIM / EAN Pipeline

## Status
Zaakceptowany (2026-07-23)

## Kontekst
Początkowy projekt potoku EAN Pipeline (uruchamiającego sekwencję agentów: Autofill -> Sentiment -> OSINT -> AEO -> GEO -> Audyt) polegał na tradycyjnym, liniowym wywoływaniu kolejnych obietnic (`Promises`) w Node.js w pliku `ean.pipeline.service.js`. Ponadto, każdy agent miał zaszytą własną logikę odwoływania się do sieci, a w przypadku potrzeby weryfikacji prawa lub regulaminów sklepu, model każdorazowo próbował doczytywać ogólnodostępną wiedzę przez narzędzia wyszukiwania.

Problemy obecnego podejścia:
1. **Ograniczenia event loop Node.js**: Długotrwałe potoki zawieszały się lub zrywały przy ograniczeniach czasowych żądań HTTP (np. brak odpowiednio wczesnego zwrotu `200 OK` do klienta i trzymanie otwartego żądania webowego).
2. **Duplikacja zapytań**: Brak centralnego systemu zlecającego powodował wyścigi wywołań (częściowo łatane lokalnym `Mutexem` w pamięci serwera, co utrudniało skalowanie na klastry i instancje wielowątkowe).
3. **Brak wiedzy domkniętej**: Agenci prawni lub badawczy nie mieli dostępu do hermetycznej bazy ustaw, regulaminów platform e-commerce (np. Allegro) ani wewnętrznej dokumentacji (wytyczne dla opisów, claims UE), zmuszając projekt do wielokrotnego ładowania plików w prompcie.

## Decyzja
W celu ustabilizowania działania systemu i zmniejszenia obciążenia operacyjnego oraz kosztowego API Gemini, podjęliśmy następujące decyzje:

1. **Przejście na system kolejkowy z orkiestratorem (Supervisor Agent)**:
   - Zastąpienie bezpośredniego wywoływania API asynchroniczną kolejką zadań opartą na tabeli `AgentQueue` w bazie danych Prisma (PostgreSQL).
   - Nowy serwis `SupervisorService.js` (oparty na `gemini-3.1-pro-preview`) przejmuje funkcję orkiestratora. To on decyduje w jakiej kolejności uruchamiać odpowiednie zadania (PIM, AutoFill, AEO, OSINT, Compliance) na podstawie inteligentnej oceny stanu danych.

2. **Wdrożenie bazy wektorowej (RAG) z użyciem pgvector**:
   - Rozbudowa bazy Supabase PostgreSQL o rozszerzenie `pgvector`.
   - Wdrożenie modułu `KnowledgeRagService`, który wykorzystuje model `gemini-embedding-2` do generowania embeddingów (zamiany tekstu na wektory) nowo wgranych dokumentów prawnych i regulaminów.
   - Wprowadzenie komponentu front-endowego `KnowledgeBasePanel.jsx` do intuicyjnego zarządzania wiedzą Agenta (ładowanie formatów `.txt` oraz `.md`). Format PDF został pominięty na polecenie biznesu ze względu na nieoptymalne wykorzystanie tokenów przez analizatory obrazu.

3. **Mechanizm `AgentCache`**:
   - Centralna rejestracja wyników długotrwałych agentów badawczych po to, aby zapytania o takie same lub bardzo podobne produkty w krótkim czasie korzystały z już wygenerowanych odpowiedzi.

4. **Komunikacja Asynchroniczna i Real-Time Telemetry (UI)**:
   - Wdrożono szczegółowe logowanie błędów w `SupervisorService` zapisywane bezpośrednio do bazy PostgreSQL oraz emitowane po WebSocket (`PIPELINE_ERROR`).
   - Całkowite odseparowanie pętli HTTP (`202 Accepted` w kontrolerze) od powiadamiania o sukcesie i przebiegu prac.
   - Wprowadzenie zdarzenia `PIPELINE_PROGRESS` nadawanego przez Orkiestrator, na które reaguje nowy dynamiczny komponent frontendowy (`ImageUploadBox.jsx`), obrazujący na żywo przebieg prac (bez użycia przestarzałego pollingu czy sztucznych animacji "loading").

## Konsekwencje

### Pozytywne:
- Skalowanie asynchroniczne: serwer WWW jedynie dodaje zgłoszenie potoku, natychmiast uwalniając żądanie klienta.
- Ogromna redukcja kosztów (mniejsza powtarzalność wywołań dzięki Cache i RAG).
- Prawny agent opiera swoje werdykty na wgranych wewnętrznie aktach normatywnych i unika "halucynowania" zewnętrznych przepisów w trybie zerowego zaufania.
- `gemini-embedding-2` działa w relatywnie tanim paśmie cenowym, uodparniając mechanizm semantycznego podobieństwa.

### Negatywne / Ryzyka:
- Zwiększenie złożoności bazy danych (potrzeba zarządzania dodatkową migracją bazy dla `pgvector` i surowym wyszukiwaniem SQL `prisma.$queryRaw`).
- Wrażliwość na niestabilność połączenia WebSocket (konieczność utrzymania prostego HTTP Polling w `ImageUploadBox.jsx` jako warstwy rezerwowej/fallback).
