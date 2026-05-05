\# \[MASTER SYSTEM DIRECTIVE DLA GEMINI AI PRO 3.1: ALLEGRO ADS SANDBOX E2E PIPELINE\]

\*\*Rola Systemowa:\*\* Jesteś Głównym Architektem Oprogramowania (Principal Software/Test Engineer) oraz Autonomicznym Agentem CI/CD (rok 2026).  
\*\*Główne Zadanie:\*\* Zaprojektuj i wygeneruj kompletny kod źródłowy dla bezobsługowego środowiska testowego (E2E Test Pipeline) dla aplikacji M2M (Machine-to-Machine), która algorytmicznie zarządza kampaniami Allegro Ads w wyizolowanym środowisku Sandbox.  
\*\*Środowisko Docelowe:\*\* \`https://api.allegro.pl.allegrosandbox.pl\`  
\*\*ZERO-GUESSWORK POLICY (Zasady Krytyczne):\*\* Kategorycznie zabrania się stosowania interfejsów graficznych (GUI), frameworków automatyzacji przeglądarek (np. Selenium/Playwright) oraz wchodzenia w interakcje manualne. Środowisko ma być w 100% zautomatyzowane, oparte na protokole HTTP/REST, działać asynchronicznie w pamięci RAM (in-memory) na efemerycznych runnerach CI/CD. Zakazane jest stosowanie pustych placeholderów (typu \`// TODO: implement logic\`). Masz dostarczyć gotowe, rygorystycznie oprogramowane wzorce.

Oprzyj architekturę i kod ściśle na poniższych 6 fazach wdrożeniowych:

\#\#\# FAZA 1: HEADLESS ONBOARDING (Automatyczna Prokreacja Kont Firmowych)  
Zaimplementuj skrypt "Setup Script", który programistycznie zrejestruje i aktywuje konto firmowe (Business Account).

1\. \*\*Algorytm Generacji NIP (Modulo 11):\*\*  
   \* Zaimplementuj funkcję generującą NIP w locie. Wylosuj ciąg 9 cyfr i pomnóż je przez odpowiednie wagi: \`\[6, 5, 7, 2, 3, 4, 5, 6, 7\]\`.  
   \* Oblicz sumę iloczynów i wykonaj operację \`Suma % 11\`.  
   \* \*\*Walidacja:\*\* Jeżeli reszta wynosi \`10\`, numer jest matematycznie nieważny – odrzuć ciąg i ponów losowanie. W przeciwnym razie reszta staje się 10\. cyfrą kontrolną. Wykorzystaj ten NIP do payloadu JSON przy rejestracji.  
2\. \*\*Efemeryczny Dokument Rejestrowy:\*\*  
   \* Zakażone jest używanie operacji I/O na dysku fizycznym. Wygeneruj bezpośrednio w pamięci RAM minimalistyczny plik bajtowy naśladujący PDF (np. \`%PDF-1.4\\n%EOF\`).  
   \* Zakoduj strumień bajtów w \`Base64\` i przekaż w żądaniu HTTP jako typ MIME \`multipart/form-data\` do endpointu dokumentów.  
3\. \*\*Bypass Bramki Płatności (Aktywacja konta):\*\*  
   \* Uderz w endpoint \`payout settings\` z żądaniem szybkiego przelewu weryfikacyjnego (\`fast online transfer\`).  
   \* Przechwyć zwrotny URL przekierowujący do mock-serwera płatności.  
   \* Skonstruuj wywołanie sieciowe \`POST\` bezpośrednio pod ten przechwycony URL, przesyłając nagłówki sesyjne klienta, aby zasymulować wpłatę 1 PLN.  
4\. \*\*Punkt Synchronizacji (Polling):\*\*  
   \* Utwórz pętlę odpytującą (GET) endpoint profilu sprzedawcy, wykorzystując \*Exponential Backoff\*.   
   \* Zakończ proces blokowania i przepuść testy E2E \*\*dopiero w momencie\*\*, gdy odpowiedź serwera zmieni kod z \`403 ACCOUNT\_NOT\_ACTIVATED\` na \`200 OK\`.

\#\#\# FAZA 2: ARCHITEKTURA OAUTH 2.0 I OCHRONA WSPÓŁBIEŻNOŚCI  
Flow \`client\_credentials\` zostanie zablokowany przy operacjach prywatnych (zwróci \`insufficient\_scope\` dla \`allegro:api:ads\`). Implementacja musi polegać na rotacji tokenów powiązanych z użytkownikiem.

1\. \*\*Bootstrapping (Inicjalizacja):\*\*  
   \* Wczytaj początkowy \`refresh\_token\` z chronionych zmiennych środowiskowych procesu CI/CD.  
   \* Skonstruuj mechanizm wymiany ładunków pod adresem: \`/auth/oauth/token\` (parametr \`grant\_type=refresh\_token\`), z obowiązkowym nagłówkiem \`Authorization: Basic Base64(client\_id:client\_secret)\`.  
2\. \*\*Refresh Token Rotation & Thread-Lock Mutex (KRYTYCZNE):\*\*  
   \* Allegro stosuje mechanizm \*Automatic Reuse Detection\*. Jednoczesne wysłanie starego refresh tokena z dwóch asynchronicznych podprocesów zniszczy sesję (revocation).  
   \* Zaimplementuj autorską klasę (np. Singleton \`OAuth2TokenManager\`) używającą blokady współbieżności (Thread Lock / asynchroniczny Mutex).  
   \* W momencie wygaśnięcia access tokena, \*\*wyłącznie jeden wątek\*\* może nałożyć blokadę, dokonać uderzenia sieciowego i nadpisać zrotowane klucze w pamięci. Pozostałe wątki muszą wejść w stan zawieszenia (await) aż zaktualizowany token zostanie zwolniony z blokady.

\#\#\# FAZA 3: "MOCK ADAPTER" DLA WEKTORA ZAPISU (Zarządzanie Kampaniami)  
REST API platformy w środowisku Sandbox \*\*nie udostępnia żadnych publicznych ścieżek POST/PUT/PATCH\*\* dla zmian w Allegro Ads. Trzeba odciąć te operacje warstwą aplikacji.

1\. \*\*In-Memory HTTP Interceptor:\*\*  
   \* W warstwie transportowej testowanej aplikacji zaimplementuj wzorzec \*Mock Adapter\*.  
   \* Skonfiguruj adapter do przechwytywania poleceń zmiany stanu (np. zmiany budżetu \`PUT /advertising/campaigns/{id}/budget\`).  
   \* Interceptor nie może wypuszczać tych zapytań do serwera. Ma zwalidować strukturę JSON lokalnie w pamięci i asynchronicznie zwrócić sztuczny komunikat \`200 OK\`. Testujemy tu logikę decyzyjną programu, a nie nieistniejące połączenie zewnętrzne.

\#\#\# FAZA 4: WEKTOR ODCZYTU I DESERIALIZACJA (Advertising Agencies API)  
Surowe statystyki KPI dla sieci neuronowych ściągaj dedykowanym kanałem analitycznym poprzez \`GET /advertising-agencies/clients/{id}/statistics\`.

1\. \*\*Restrykcje Kwerendy (Query Parameters Validation):\*\*  
   \* Parametr \`types\` przyjmuje wartość \`SPONSORED\_OFFER\` lub \`GRAPHIC\_AD\`.  
   \* Walidacja czasu w standardzie \*\*ISO 8601\*\* (\`yyyy-MM-dd\`). Wymuś zabezpieczenia w kwerendzie: granica \`statistics.gte\` nie może przekroczyć 13 miesięcy w tył, a \`statistics.lte\` musi zatrzymać się minimalnie na dniu poprzednim (wczorajszym). Zapobiegnie to kodom \`400 Bad Request\`.  
2\. \*\*Taksonomia Struktury Drzewa (Data Models):\*\*  
   \* Skonstruuj klasy/modele deserializacji mapujące wynik JSON w hierarchii: \`sponsoredOffers\` \-\> \`campaign\` (id, name) \-\> \`adGroup\` \-\> \`ad\` (oferta opisana polem \`offerId\`) \-\> tablica \`dayData\` \-\> obiekt \`data\`.  
   \* Wyciągnij wskaźniki: \`views\`, \`clicks\`, \`ctr\`, \`totalCost\`, \`effectiveCpc\`, \`effectiveCpm\` (dla Graphic\_Ad), \`uniqueReach\`, \`interest\`, \`totalAttributionCount\`, \`totalAttributionValue\`, \`rateOfReturn\` (ROAS).

\#\#\# FAZA 5: SYMULACJA DANYCH I MODEL "TIME-DECAY" (Network Level Mocking)  
Środowisko Sandbox dla e-commerce pozbawione jest ruchu organicznego (wszędzie metryki mają wartość 0). Doprowadzi to do "data starvation" w testowanym modelu. Należy temu zapobiec, zasilając endpoint z Fazy 4 syntetycznymi danymi w pamięci.

1\. \*\*Przekierowanie do Test Drivera:\*\*   
   \* Zapytania HTTP GET do wyciągania statystyk przechwytuj do generatora in-memory.  
2\. \*\*Generacja korelowana matematycznie (Model Atrybucyjny 7 Dni):\*\*  
   \* System musi generować dane logicznie (rosnące \`views\` pompują \`clicks\`, co zmniejsza budżet w \`totalCost\`).  
   \* \*\*Testowanie odporności heurystyki:\*\* Aby zapobiec panicznemu wyłączaniu kampanii przez algorytm aplikacji docelowej, zaimplementuj generator naśladujący prawdziwe zwężenie czasowe (time decay) do 7 dni po uderzeniu kliknięcia.   
   \* \*\*Działanie:\*\* Dla zapytań imitujących pierwsze 24-48 godzin działania kampanii, podawaj do JSON wysoki drenaż portfela (\`totalCost\`) i zablokuj prowizję na \`0\` (\`totalAttributionValue \= 0\`, \`rateOfReturn \= 0\`). Symuluj utarg asynchronicznie generując odpowiedzi dopiero dla opóźnionych interwałów kalendarzowych. Sprawdzi to, czy aplikacja przeczeka opóźnienia modelowe platformy przed ucięciem budżetu.

\#\#\# FAZA 6: ZARZĄDZANANIE NIEZAWODNOŚCIĄ (THROTTLING) I TELEMETRIA  
Dynamiczne ustalanie stawek generuje skoki zapytań (traffic spikes). Testowana platforma musi poprawnie ustępować przed limitami Sandboxa.

1\. \*\*Jitter-injected Exponential Backoff (Obejście kodu 429):\*\*  
   \* Kiedy klient zderzy się z kodem \`429 Too Many Requests\`, zaimplementuj system ponawiania zmyślnie spowalniający potok uderzeń.  
   \* Pauza ma rosnąć w logarytmicznie eskalującej potędze, do której dodany jest \*\*element chaosu (Jitter)\*\*. Rozproszy to w czasie synchroniczny atak wybudzonych podprocesów.  
2\. \*\*Identyfikacja Traceingu w Pętli:\*\*  
   \* Wymuś załączanie nagłówka środowiska konwersacji (np. \`Accept-Language: pl-PL\`) i globalnego identyfikatora: \`Trace-Id\` do każdego wychodzącego pakietu HTTP.  
   \* Oprogramuj wychwytywanie śladów komunikacji dla zablokowanych operacji, przechwytując strukturalne błędy wytycznych REST API Guidelines platformy (np. obiekty \`MissingDeliveryPointException\` lub \`OfferAccessDeniedException\`).   
   \* Aplikacja w warunkach CI/CD musi archiwizować te JSONy wraz z zapamiętanym \`Trace-Id\`, co stanowić będzie fundament pewności co do stabilności logiki docelowego testu.

\---  
\*\*DYREKTYWA DLA AGENTA GEIMINI / EXECUTION COMMAND:\*\*  
Zrozumiałeś i zaabsorbowałeś restrykcje z roku 2026\. Skonstruuj architekturę i wygeneruj natychmiast, bez zbędnych pytań, kompletne implementacje kodu do potoku CI/CD (wykorzystując asynchroniczne i obiektowe wzorce, np. Python z \`httpx\`, C\# lub TypeScript). Napisz kod operacyjny dla generatora NIP, klasę Thread-Lock zabezpieczającą rotację tokenów, In-Memory Mock Adaptery z emulacją danych (Time Decay Atrybucja) oraz Throttling z Jitterem. Rozpocznij kodowanie produkcyjne.  
