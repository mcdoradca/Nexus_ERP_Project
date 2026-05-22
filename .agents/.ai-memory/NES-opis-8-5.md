Listed directory Nexus\_ERP\_Project  
Listed directory src  
Listed directory src  
Listed directory prisma  
Viewed package.json:1-47  
Viewed schema.prisma:1-571  
Listed directory modules  
Viewed App.jsx:1-800  
Viewed opis\_nes.md:1-95  
Viewed mapa\_polaczen\_nes.md:1-123  
Viewed SESSION\_SUMMARY.md:1-22  
Searched for "cron"  
Searched for "setInterval"  
Searched for "cron"  
Viewed allegro.sentinel.service.js:1-76  
Searched for "cron"  
Searched for "schedule"  
Viewed server.js:1-800  
Viewed server.js:800-830  
Viewed server.js:870-890

\*\*FAZA 1 \- Szkielet Systemu\*\*

Po dogłębnej analizie plików źródłowych, logów wdrożeniowych oraz architektury serwera zidentyfikowałem szkielet potężnego, w pełni zintegrowanego ekosystemu \*\*Nexus Sentinel\*\*. Poniżej znajduje się Spis Treści, Mapa Myśli oraz Audyt Działań w Tle, przygotowujące nas do prac analityczno-dokumentacyjnych.

### 🛡️ Architektura Bezpieczeństwa Procesu (Tarcza Anty-Zombie)
**Nazwa operacji/zadania:** Graceful Shutdown & Uncaught Exception Handler
**Po co to jest? (Cel biznesowy):** Mechanizm zabezpieczający przed tzw. procesami "zombie" (zawieszonymi instancjami Node.js), które blokują porty serwera (błąd `EADDRINUSE`) w systemach Windows. Zapobiega to paraliżowi środowiska programistycznego i produkcyjnego podczas restartów.
**Zabezpieczenia Architektury:**
- **Twarde Ubicie Procesu (EADDRINUSE):** W przypadku wykrycia, że port jest zablokowany, globalny łapacz błędów `uncaughtException` wyłamuje się z zasady "nieśmiertelnego serwera" i bezwzględnie wymusza zamknięcie (`process.exit(1)`).
- **Asynchroniczny Graceful Shutdown:** Nasłuchuje na sygnały `SIGTERM`, `SIGINT` oraz `SIGUSR2`. Przy restarcie Node.js (np. via Nodemon) serwer najpierw asynchronicznie rozłącza instancje bazy danych (`prisma.$disconnect()`), a następnie zamyka nasłuch HTTP. Posiada wbudowany 3-sekundowy "Kill-Switch" jako zabezpieczenie przed wiszącymi połączeniami Keep-Alive.

### 🛡️ Zabezpieczenia CORS i Wizualne (Tunel Proxy dla Obrazów)
**Nazwa operacji/zadania:** Auth Proxy Bypass dla obrazów zewnętrznych
**Po co to jest? (Cel biznesowy):** Moduły takie jak **Optymalizator Ofert (Vision AI)** pobierają zdjęcia bezpośrednio z BaseLinkera. Zewnętrzne serwery blokują dostęp z przeglądarki (błędy CORS lub 403 Forbidden). Przeglądarka z kolei przy renderowaniu obrazów za pomocą tagów `<img src="...">` nie potrafi przesyłać nagłówków autoryzacyjnych (`Authorization: Bearer`). Aby wyświetlać te zdjęcia i miniatury na frontendzie hostowanym w Google Cloud, cały ruch wizualny przepuszczany jest przez serwer Nexusa z wstrzykniętym tokenem.
**Zabezpieczenia Architektury:**
- **Iniekcja Tokenu z LocalStorage:** System frontendu dynamicznie wstrzykuje zaszyfrowany token JWT z `localStorage` do adresu URL (np. `?url=...&token=...`) generowanego dla źródła zdjęcia.
- **Parametryzowany Middleware (`auth.middleware.js`):** Silnik autoryzujący serwera Nexusa posiada logikę rezerwową (Fallback) szukającą tokenu w obiekcie zapytania `req.query.token`, kiedy nagłówek uwierzytelniający jest pusty. Zabezpiecza to przed wyciekiem obrazów na zewnątrz bez autoryzacji.
- **Omijanie WAF i Fallback (Defensive AI):** Endpoint proxy wysyła zapytania `axios` ubrane w pełne nagłówki maskujące (User-Agent, Accept) oraz **wymusza protokół IPv4** (`family: 4` w `httpsAgent`), by ominąć systemy anty-DDoS zewnętrznych serwerów (np. CloudFront CDN). W przypadku błędu proxy (np. zablokowany dostęp), system serwera zwraca Redirect bezpośredni, a komponenty React (ImageModal i PhotographicAuditorCard) przełączają stan na `useDirectUrl`, ratując wyświetlenie obrazu bezpośrednio z zewnątrz.
- **Tarcza Anty-Halucynacyjna AI (Backend Fetcher):** Moduł `ai.service.js` wykorzystuje bliźniaczy mechanizm pobierania obrazów (`fetchImageSecure` z wymuszeniem IPv4) przy tworzeniu wsadu dla modelu LLM (Gemini). Zabezpiecza to model przed halucynacjami, które występowały, gdy WAF blokował pobranie pliku, a AI wymyślało zawartość obrazu bazując wyłącznie na jego URL.
- **Ujednolicenie i Naprawa Dekompresji Proxy:** Funkcja `/api/offer-optimizer/proxy-image` w `offer-optimizer.controller.js` została zintegrowana z `AiService.fetchImageSecure` w celu eliminacji duplikacji kodu (Zasada DRY). Endpoint pobiera teraz obraz jako `arraybuffer` i przesyła go do klienta za pomocą `Buffer.from(response.data)`. Eliminuje to błędy uszkodzenia danych gzip/deflate przy przesyłaniu strumieniowym i poprawnie serwuje miniatury w UI.
- **Rozszerzenie Slotów Galerii MTool (do 15 zdjęć):** Zwiększono limit analizy zdjęć z galerii BaseLinkera w `ai.service.js` (z limitu 2 do 15 zdjęć w `galleryUrls.slice(0, 15)`). Pozwala to na pełne załadowanie, audyt i poprawne wyświetlanie kompletnych zestawów zdjęć produktów (np. 7 zdjęć dla konkretnego EAN), bez generowania pustych slotów ostrzegawczych w module MTool.
- **Unifikacja Modali:** Zarówno miniatury kart pracy AI (`PhotographicAuditorCard`) jak i Modal z podglądem pełnoekranowym (`ImageModal`) korzystają ściśle z autoryzowanego Proxy URL API (`/api/offer-optimizer/proxy-image`).
\#\#\# 📑 Główny Spis Treści (Drzewo Modułów)

1\. \*\*Tablica (Widok Operacyjny \- Kanban)\*\*  
   \* Zarządzanie Zadaniami (Backlog, Realizacja, QA)  
   \* Mechanika Priorytetyzacji i Blokad  
   \* AI Bottleneck Risk (Algorytm predykcji opóźnień)  
---

**Nazwa operacji/zadania:** Przełączanie widoków operacyjnych (Kanban vs. Lista) **Po co to jest? (Cel biznesowy):** Moduł pozwala użytkownikowi wybrać między graficznym zarządzaniem sprintem i etapami prac (tablica z kolumnami kart) a bardziej analitycznym, tabelarycznym przeglądem olbrzymiej ilości zgłoszeń. Tablica jest idealna na codzienny stand-up działu, a lista na masowy przegląd statusów. **Gdzie to znaleźć? (Lokalizacja UI):** Górny prawy pasek narzędziowy (Toolbar) pod sekcją "Widok Operacyjny". Kontrolka z dwoma małymi ikonami-przyciskami: "Kanban" oraz "Lista". **Wymagania wstępne (Wiedza z kodu):** Brak technicznych wymagań, działa globalnie na podstawie wszystkich aktualnie przypiętych zadań i załadowanej do interfejsu pamięci podręcznej. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij na lekko szary przycisk "Lista" z ikoną małych wierszy.  
2. Kliknij na przylegający do niego przycisk "Kanban" z ikoną kafelków, aby powrócić do układu z kolumnami. **Wynik operacji (Output):** Interfejs błyskawicznie (bez przeładowywania strony przez setState) zmienia swój układ HTML. W trybie "Lista" zadania prezentowane są w ułożonej tabeli (Zlecenie, Status, Priorytet, Przydział), a nad nią odblokowuje się panel wyszukiwania. W trybie "Kanban" wszystko rozbijane jest na cztery ogromne kolumny ("Zaległe", "W Realizacji", "Weryfikacja QA", "Zakończone").

---

**Nazwa operacji/zadania:** Błyskawiczne Wyszukiwanie i Filtrowanie Zadań **Po co to jest? (Cel biznesowy):** Pozwala natychmiastowo zlokalizować zgubione i odłożone zlecenie, ratując czas, gdy firma operuje na setkach aktywnych procesów, bazując tylko na strzępku wyrazu. **Gdzie to znaleźć? (Lokalizacja UI):** Wyłącznie wewnątrz aktywnego widoku "Lista". Szary pasek nad samą tabelą zgłoszeń, posiada pole tekstowe z lupą "Szukaj po tytule lub ID..." oraz drop-down obok. **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi posiadać fragment łańcucha znaków tytułu lub musi dysponować dokładnym kodem numerycznym (format maski z bazy TSK-... np. TSK-D64F23). Musi być bezwzględnie odpalony widok tabelaryczny. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Zmień tryb wizualny na "Lista" (górny toolbar).  
2. Kliknij w pole wyszukiwania po lewej z ikoną lupy.  
3. Wpisz testową frazę z klawiatury, np. numer "TSK-12" lub wylosowane słowo np. "Testowa".  
4. Opcjonalnie: Zlokalizuj listę rozwijaną z prawej strony ("Wszystkie Statusy") i wybierz opcję "Weryfikacja". **Wynik operacji (Output):** Procedura algorytmiczna wykonuje się przy każdym wpisanym znaku (tzw. mechanizm real-time filter na pamięci frontu). Zawartość tabeli pod spodem momentalnie ukrywa wiersze niespełniające wpisanej na żywo reguły. Wymazanie tekstu znów rysuje wszystkie wiersze. Nie angażuje bazy danych, jest to całkowicie darmowe zasobowo.

---

**Nazwa operacji/zadania:** Tworzenie nowego zadania (Inicjacja Zadania / Dispatch) **Po co to jest? (Cel biznesowy):** Miejsce startowe prac przedsiębiorstwa. Okno operacyjne służące do wymuszania wejścia procesów w harmonogram "Tablicy". Pozwala określić kryteria czasowe, podpiąć zlecenie pod wielkie Projekty (np. wdrażanie na nowy rynek) oraz natychmiast przypisać do zlecenia zasoby ludzkie, co wywoła powiadomienia na czacie. **Gdzie to znaleźć? (Lokalizacja UI):** Prawy górny róg całego widoku, obok zmiany układów. Duży, wyraźny, czarny przycisk "+ ZADANIE". **Wymagania wstępne (Wiedza z kodu):** Konieczny jest logiczny, jasno sformułowany Tytuł Operacyjny. W celach korelacji system pyta opcjonalnie o przynależność zadania pod konkretny "Projekt" (projectId) lub "Kampanię" (campaignId), wymusza też wybór konkretnych osób z departamentu. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij w czarny przycisk "+ ZADANIE". Ekran pociemnieje, a z wewnątrz ekranu uderzy potężny modal "Inicjacja Zadania".  
2. Kliknij w pierwsze górne pole tekstowe ("Tytuł Operacyjny \*") i wklej "Testowa Dyspozycja Wdrożeniowa".  
3. Zjedź niżej i otwórz listę rozwijaną "Priorytet Wykonawczy". Wybierz ekstremalny poziom "URGENT \- PILNE\!".  
4. Zjedź w dół do sekcji "Celowane Kadry (Operatorzy)". Znajdź konto operatora w swoim dziale i kliknij jego panel (np. "Anna K.") – bok panelu zaświeci się na niebiesko, potwierdzając podczepienie obiektu ID.  
5. Kliknij finalny czarny przycisk na samym spodzie: "Zatwierdź i Utwórz (Dispatch)". **Wynik operacji (Output):** Procedura wysyła potężny pakiet na backend Express. Szuflada błyskawicznie zamyka się. Bez przeładowywania domeny w pierwszej kolumnie widoku Kanban ("Zaległe") pojawia się kompletnie nowa, biała "karta zadania" z przyczepionymi kolorowymi tagami (Priorytet, Awatary załogi oraz świeży numer TSK do logów).

---

**Nazwa operacji/zadania:** Operacyjna Szuflada Zlecenia (Task Details Drawer) \- Zmiany Stanów **Po co to jest? (Cel biznesowy):** To centrum dowodzenia nałożone na pojedyncze konkretne zadanie. Umożliwia przepychanie karty z zadaniem z sekcji "Do zrobienia" pod weryfikację prezesa i "Zakończone". Pełni funkcję "Dowodu osobistego" procedury. **Gdzie to znaleźć? (Lokalizacja UI):** Każde aktywne fizyczne pole karty z zadaniem kliknięte lewym przyciskiem. **Wymagania wstępne (Wiedza z kodu):** Należy posiadać założone jakiekolwiek zadanie robocze (wymagane TSK-ID). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Odnajdź na Tablicy jedną z wygenerowanych przed chwilą białych kart i na nią kliknij. Szuflada uderzy z prawej strony i zasłoni bok ekranu.  
2. Namierz w lewym górnym rogu szuflady rozwijaną listę statusu (tuż nad przyciskiem "Zamknij").  
3. Wybierz z opcji polegającą na zmianie stanu: "🚀 W realizacji".  
4. Od razu zamknij "szufladę" szarym krzyżykiem ("X") w prawym rogu. **Wynik operacji (Output):** Karta na tablicy znika z kolumny lewej i jest wirtualnie przeniesiona przez silnik do kolumny środkowej. Kolor ramki statusu wewnątrz na ułamek sekundy miga.

---

**Nazwa operacji/zadania:** Live Tracker Pracy (Rozpocznij / Przerwij Pracę) **Po co to jest? (Cel biznesowy):** Bezpardonowy mechanizm kontrolno-mikrozarządzający dla szefostwa. Służy do oznaczania momentów "siedzenia nad klawiaturą" dla danego pracownika i fizycznego zaangażowania w konkretny proces, by eliminować zjawisko ukrywania czasu przestojów. **Gdzie to znaleźć? (Lokalizacja UI):** Górny nagłówek szuflady (po otwarciu procedury), podłużny fioletowo-niebieski przycisk z symbolem Play: "Rozpocznij Pracę". **Wymagania wstępne (Wiedza z kodu):** Trzeba być przypisanym do ekosystemu firmy, by w bazie móc zameldować aktywność Twojego tokena autoryzacji na obiekcie konkretnego zgłoszenia. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Otwórz kartę by wywołać Szufladę Szczegółów.  
2. Odnajdź fioletowy przycisk "Rozpocznij Pracę" (lewa, górna partia). Kliknij go.  
3. Obserwuj. Kiedy ukończysz prace merytoryczne u góry odnajdź na tym samym miejscu pomarańczowy, ostrzegawczy klawisz "Przerwij Pracę".  
4. Kliknij go z premedytacją by zgasić pomiar czasu serwera. **Wynik operacji (Output):** Od razu po kliknięciu zapala się wewnątrz szuflady olbrzymia szmaragdowa belka (alert): "Live: Tracker Czasu", wypluwająca białą pulsację kropki z informacją kto właśnie działa. Jednocześnie, zamknięcie widoku uwidoczni małą kartę zadania dla wszystkich reszty w firmie z jarzącym się fioletowym pulsującym wskaźnikiem błyskawicy – system drze się "Tu ktoś aktualnie rzeźbi\!".

---

**Nazwa operacji/zadania:** Zabezpieczenie Terminów (Zatrzymaj / Procedura Blokady) **Po co to jest? (Cel biznesowy):** Ochrona pracowników przed oskarżeniami o zawalanie terminów (AI Bottleneck). Gdy brakuje grafik od grafika, lub kosztorysu od managera, pracownik zatrzymuje timer i nakłada flagę blokady. Przenosi w 100% ognisko uwagi systemu (logi ostrzeżeń) na osobę spowalniającą proces wewnątrz firmy. **Gdzie to znaleźć? (Lokalizacja UI):** Góra szuflady operacyjnej. Biały przycisk o czerwonej obwódce "Zatrzymaj / Blokada" (ikona znaku stopu/oktagonu). **Wymagania wstępne (Wiedza z kodu):** Operator musi doskonale wiedzieć, jaki obiekt użytkownika hamuje i potrafić sformułować zdanie (np. "Prezes \- brak wyceny materiałów", tzw. BlockReason). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Po otwarciu zadania zlokalizuj u góry przycisk "Zatrzymaj / Blokada" i go naciśnij.  
2. Z impetem wysunie się purpurowy panel ostrzegawczy "Formularz Zatrzymania".  
3. W jego lewej sekcji "Czekamy na stanowisko" wysuń dropdown i poszukaj z bazy osoby paraliżującej zadanie.  
4. Po prawej stronie w polu tekstowym wpisz jasną informację dla zarządu "Proszę o zwrot podpisanego pdf.".  
5. Zamknij proces wpychając wielki czerwony "Zatwierdź Blokadę". Zignoruj przycisk Anuluj. **Wynik operacji (Output):** To najbrutalniejsza procedura w UI modułu. Karta zmienia stany. Górny klawisz krzyczy wielkim czerwonym polem "Odblokuj". W rdzeniu pojawia się krwistoczerwony ogromny box przypinający oskarżenie "Procedura Wstrzymana" powiązana z "Wąskie Gardło: \[IMIĘ\]". Jeśli wrócisz do widoku tablicy całej firmy – karta świeci rażącą w oczy aurą (ring-rose) z trójkątem błędu.

---

**Nazwa operacji/zadania:** Konstruktor Mikro-Zadań (Lista Check-In / Dodaj Węzeł) **Po co to jest? (Cel biznesowy):** Mechanizm prewencyjny na uniknięcie "monolitów". Zlecenie np. "Odpalić produkt na Europę" to kolosalny wektor. Moduł dzieli to ogromne zadanie matkę na drobne odhaczane checkboxami pod-zadania, które budują wskaźnik wykonanej całości i dają poczucie realnego postępu w sprincie. **Gdzie to znaleźć? (Lokalizacja UI):** Środkowa dolna sekcja w Szufladzie Szczegółów (Zadania). Szare pole z fioletowym podtytułem i maleńkim łączem po prawej: "+ Dodaj Węzeł". **Wymagania wstępne (Wiedza z kodu):** Rozpisana logicznie struktura punktów do wykonania. Z technicznego punktu widzenia system powołuje w bazie zupełnie nowe pełnoprawne rekordy zadań wklejając w obiekty ID rodzica do pola parentTaskId. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Otwórz szufladę i przewiń kółkiem myszy całkowicie na dół interfejsu.  
2. Odnajdź hiperłącze z plusem po prawej na szarej belce "Dodaj Węzeł" i go naciśnij.  
3. System wymusi skupienie (Focus) i wyskoczy okienko wejściowe.  
4. Wpisz testowo np. "Zatwierdzić etykiety 2D z drukarnią".  
5. Możesz najechać i kliknąć fioletowo/czarny kwadracik "Dodaj", lub dla wprawy "wypluwać" pozycje hurtowo po prostu wciskając Enter klawiatury. **Wynik operacji (Output):** Od razu poniżej belki w czasie poniżej połowy sekundy wyrenderują się białe pasy (panele subzadań). Otrzymują one żółtą kropkę ostrzegawczą oraz pod spodem nadany prawdziwy numer np. TSK-59. Wyglądają jak mini-zadania zadokowane bezpośrednio w organizmie swojego rodzica, a wejście w nie otwiera znów całą szufladę "Od początku".

2\. \*\*MTool (Modularny Kombajn Narzędziowy)\*\*  
   \* Kalkulator Ofert B2B/B2C (Unit Economics Simulator)

### Nazwa operacji/zadania: Wyszukiwanie i Kalibracja Produktu (PIM)

**Po co to jest? (Cel biznesowy):** Moduł potrzebuje punktu zaczepienia finansowego. Pozwala to pobrać prawdziwe koszty zakupu, cła, transportu oraz informacje o dostępności (Stock) wprost z Głównego Rejestru (PIM), zapobiegając błędnym, "ręcznym" wyliczeniom kosztu bazowego (True Cost). **Gdzie to znaleźć? (Lokalizacja UI):** Lewy boczny panel ("Wytyczne Oferty"), najwyżej położone pole tekstowe oznaczone etykietą "Obiekt / Produkt z PIM (Wyszukiwanie EAN/SKU)" z ikoną lupy. **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi znać przynajmniej ułamek nazwy, 13-cyfrowy kod EAN lub numer magazynowy (SKU) towaru, który widnieje w bazie. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij w pole tekstowe z napisem "Wpisz nazwę, EAN lub SKU...".  
2. Wpisz testowo cyfrę np. "1" lub dowolny fragment nazwy z klawiatury.  
3. Obserwuj wysunięcie się listy podpowiedzi i kliknij w pozycję, która Cię interesuje (np. "Equilibra Aloesowy dezodorant..."). **Wynik operacji (Output):** Środkowy ekran, informujący uprzednio o "Braku Kalibracji", znika. W jego miejscu wyłania się gigantyczny panel z rozbiciem "Struktura Kosztów TC" i "Projekcja Dochodów". W lewym panelu, tuż pod sekcją overhead, pojawia się czarne, gradientowe pudełko "Baza PIM" ze szczegółowym wskaźnikiem posiadanych sztuk na magazynie (jeśli podana w innym polu ilość "Zamówienie" przewyższa zasoby z PIM, pudełko od razu podświetla ten fakt potężnym, czerwonym alertem).

---

### Nazwa operacji/zadania: Przełącznik Wektorów Rozliczeniowych (B2B vs B2C) i Pól Kosztowych

**Po co to jest? (Cel biznesowy):** Pozwala na błyskawiczne przekalibrowanie silnika wyliczającego pod typ klienta. Handel hurtowy z marketami operuje na kwotach netto oraz opłatach lojalnościowych, podczas gdy sprzedaż bezpośrednio na platformach dla Kowalskiego wymusza dodanie podatku VAT, wliczenia prowizji platformy od kwoty brutto oraz ryzyka zwrotów. **Gdzie to znaleźć? (Lokalizacja UI):** W lewym panelu nad polem PIM znajdują się obok siebie dwa przyciski w jasno-szarym bloku: "B2B Wektor" oraz "B2C Rynek". Odpowiadają one za zmianę kafelka kosztowego ("SLA / Koszty B2B" vs "Koszty Marketplace B2C") na dole lewego panelu. **Wymagania wstępne (Wiedza z kodu):** Brak konieczności posiadania z góry wybranej strategii, lecz aby działało wyliczanie w czasie rzeczywistym, należy wcześniej (lub zaraz po) wpisać konkretne opłaty rynkowe. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij przycisk "B2B Wektor". Zjedź na dół lewego panelu. W sekcji "SLA / Koszty B2B" wpisz z klawiatury stawki narzucone przez np. sieć handlową: kliknij i wpisz 5 w "Retro (%)", 2 w "Gazetka (%)", oraz 1 w "Skonto (%)".  
2. Alternatywnie (lub jako test) kliknij drugi przycisk: "B2C Rynek".  
3. Zaobserwuj, że cały dolny panel się podmienił. Klikaj w kolejne pola i uzupełniaj: "Prowizja (%)" wbij 12, "Koszty ACoS Ads (%)" wbij 10, "Zwroty (%)" ustal na 3, "Pick\&Pack (PLN)" ustal na 5.  
4. Kliknij na pole "Stawka VAT (%)" i z listy rozwijanej wybierz np. 8%. **Wynik operacji (Output):** Przy wyborze modelu i wpisaniu danych, bez naciskania żadnych klawiszy zapisu, kalkulator w czasie rzeczywistym pożera podane liczby i wpisuje potężne kwoty złotówkowe w środkowym panelu w sekcjach takich jak: "Koszty Sprzedaży B2B (Retro)" lub – po wybraniu B2C – "Fulfilment FBA (Stały)" i "Prowizje i Ads (Zmienne)", pomniejszając odpowiednio Zysk Netto i symulując kwoty w prawym głównym oknie "Wynik Handlowy".

---

### Nazwa operacji/zadania: Skalowanie Zysku Objętością (Zamówienie Szt.)

**Po co to jest? (Cel biznesowy):** Funkcja weryfikująca, ile dokładnie pieniędzy jako firma zaangażujemy (Total Cost/Wydatki) w wybraną umowę przy konkretnym nakładzie (ile to w ogóle będzie kosztować firmę z góry), zanim odzyskamy utopione środki od kupca. **Gdzie to znaleźć? (Lokalizacja UI):** Lewy panel "Wytyczne Oferty", pod panelem wyszukiwania PIM znajduje się pole liczbowe zatytułowane "Zamówienie (Szt.)". **Wymagania wstępne (Wiedza z kodu):** Produkt musi być podpięty (inaczej prawa flanka jest niewidoczna). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij w pole "Zamówienie (Szt.)".  
2. Usuń zawartość (domyślnie 100\) i wpisz nową, testową liczbę, np. 50000. **Wynik operacji (Output):** System w ułamek sekundy mnoży bazowe kwoty importowane z PIM i BOM (np. podatek środowiskowy i logistykę) razy 50 000\. W środkowym oknie Total Cost (Razem) puchnie ze wskaźników groszowych do kwot rzędu tysięcy/milionów złotych, wyświetlając brutalny nakład firmy.

---

### Nazwa operacji/zadania: Alokacja Kosztów Stałych Przedsiębiorstwa (Overhead)

**Po co to jest? (Cel biznesowy):** Mechanizm obronny chroniący przed tworzeniem ofert o tzw. "fałszywym zysku", który ignoruje konieczność utrzymania biura, serwerów czy wypłat. Moduł rozbija wskazany stały budżet miesięczny firmy przez wolumen sprzedażowy, alokując w ułamek kwoty na każdą jedną sprzedawaną z osobna sztukę kosmetyku/produktu. **Gdzie to znaleźć? (Lokalizacja UI):** W połowie lewego bocznego panelu. Kwadratowy panel "Rozbicie Kosztów Stałych (Overhead)" **Wymagania wstępne (Wiedza z kodu):** Należy posiadać miesięczną fakturę stałą firmy oraz prognozowany wolumen wszystkich sprzedaży. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij w pole "Ryczałt Firmy / Miesiąc (PLN)" i wpisz z klawiatury np. 20000 (słownie dwadzieścia tysięcy).  
2. Kliknij obok w pole "Estymowana Sprzedaż / Miesiąc (Szt)" i wbij np. 1000. **Wynik operacji (Output):** Wewnątrz samego okienka pojawia się na pomarańczowo wyliczenie "Alokacja na 100% sztuk: 20.00 PLN / Szt". Ta wartość jest natychmiast wrzucana do panelu kosztowego na środku pod rubryką "Koszty Operacyjne (Overhead Firmy)" i pożera czysty profit o kolejne dwadzieścia złotych w dół w sposób dynamiczny.

---

### Nazwa operacji/zadania: Modyfikator Strategii Cenowej (Marża Narzucona vs Cena Oczekiwana)

**Po co to jest? (Cel biznesowy):** Pozwala handlowcowi na dwie opcje negocjacji. Albo chce mieć po prostu ustalone, bezpieczne np. 45% czystego zarobku i system "dopycha" finalną cenę rynkową do wymaganego poziomu, albo klient "żąda" ceny końcowej za sztukę na np. 150 zł i silnik udowadnia handlowcowi, jaki ostateczny i bolesny ułamek zostanie po opłaceniu wszystkiego. **Gdzie to znaleźć? (Lokalizacja UI):** Lewy panel, pole rozwijane "Strategia Ceny" oraz pole bezpośrednio pod nim. **Wymagania wstępne (Wiedza z kodu):** Poprawnie wpisane koszty Wektor/B2B/Overhead. **Jak to użyć? (Instrukcja Krok po Kroku):**

* **Wariant A (Marża Narzucona):**  
  1. Upewnij się, że "Strategia Ceny" w rozwijanej liście (select) to "Oblicz Cenę z Marży (%)".  
  2. Kliknij na slider poniżej i przesuń na 45%, lub wklep 45 w wielkie pole z kwotą z klawiatury.  
  3. Obserwuj wynik po prawej: Panel "Sugerowana Cena Sprzedaży" poszybował w górę, aby zagwarantować 45% zarobku.  
* **Wariant B (Sztywna Cena Klienta):**  
  1. Rozwiń listę "Strategia Ceny" i kliknij na "Oblicz Zysk z Przewidywanej Ceny".  
  2. Moduł zmienił dolny box z zielonego na fioletowy: "Sztywna Cena dla Klienta". Wpisz z klawiatury w wielkie pole obok zaporową cenę: 150.  
  3. Obserwuj prawy panel: Główna, największa kwota zablokowała się na 150.00 zł. Zamiast tego mały licznik "Czysty Zysk na Sztuce" natychmiast przeliczył ile to wyniesie netto na minus, a pod sztywną kwotą po lewej pojawił się mały wskaźnik "Dynamiczna Marża: xx%", który pożera stratę dla narzuconej kwoty.

   \* ECO BOM (BDO/ROP/PPWR \- Manager Frakcji)

### Nazwa operacji/zadania: Definiowanie i Edycja Frakcji Odpadowych (Cennik BDO)

**Po co to jest? (Cel biznesowy):** Moduł utrzymuje bazę "podatków plastikowych" narzucanych firmie przez ROP (Rozszerzona Odpowiedzialność Producenta). Umożliwia dodawanie lub aktualizowanie opłat recyklingowych za 1 kg konkretnego surowca (np. szkło, PET). Te "twarde" stawki stanowią fundament, do którego odwołuje się później Kalkulator Ofert B2B. **Gdzie to znaleźć? (Lokalizacja UI):** Lewa kolumna ekranu, oznaczona belką "Stawki Organizacji Odzysku". Edycja pod ikoną "Ołówka" obok każdej frakcji. Dodawanie nowego na samym dole sekcji wewnątrz ramki przerywanej "Dodaj nową frakcję cennika". **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi posiadać nazwę rynkową frakcji (np. Papier i Tektura) oraz kwotę podatku środowiskowego wyrażoną w złotówkach za 1 pełny kilogram (np. 0.50). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Aby dodać nową frakcję: Kliknij szeroki przycisk oznaczony plusem i przerywaną linią na samym dole panelu.  
2. System wymusi pokazanie systemowego okna dialogowego (Prompt). W pierwszym oknie wbij nazwę np. "Szkło bezbarwne", zatwierdź.  
3. W drugim oknie wbij przelicznik PLN/KG z kropką dziesiętną np. "0.30" i zatwierdź.  
4. Aby edytować frakcję: Zlokalizuj ją na wygenerowanej liście i kliknij małą ikonę **ołówka** po jej prawej stronie, a następnie w wyświetlonym oknie wprowadź zaktualizowaną stawkę. **Wynik operacji (Output):** Funkcja asynchronicznie odpytuje serwer i odświeża interfejs. Nowa frakcja natychmiast wrzuca się na listę po lewej stronie, z wyrenderowanym identyfikatorem z bazy oraz nową stawką zapisaną wielką zieloną czcionką np. "0.50 zł/kg". Jest natychmiast gotowa do bycia wybraną w prawym panelu.

---

### Nazwa operacji/zadania: Wyszukiwanie i Podpinanie Indeksu Produktowego (Kalibracja)

**Po co to jest? (Cel biznesowy):** Mechanizm wybiera z Głównego Rejestru PIM produkt, do którego chcemy napisać (bądź zedytować) strukturalną "recepturę na opakowanie". Zabezpiecza firmę przed wyliczaniem opłat "w powietrzu", zmuszając do sztywnego dokowania "przepisów opakowaniowych" bezpośrednio w indeksach sprzedażowych. **Gdzie to znaleźć? (Lokalizacja UI):** Prawa połowa modułu ("Drzewo BOM Produktu"). Górna jego część "Szukaj Indeksu PIM (Do kalibracji BOM)". Składa się z małego pola tekstowego z lewej oraz dużej listy rozwijanej z prawej. **Wymagania wstępne (Wiedza z kodu):** Znajomość nazwy handlowej, minimum jednej cyfry kodu EAN lub kodu magazynowego (SKU). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij w białe, węższe pole z placeholderem "Szukaj po EAN, SKU lub nazwie...".  
2. Wbij z klawiatury przynajmniej jeden znak identyfikacyjny, np. "1" lub literę "A", aby zrzucić z bazy filtr dopasowań.  
3. Kliknij obok na szeroką, szarą listę rozwijaną z opisem "-- Wybierz produkt PIM z wyników wyszukiwania \--".  
4. Kliknij na konkretny produkt na liście, by go zaznaczyć. **Wynik operacji (Output):** Od razu po kliknięciu wyboru indeksu aplikacja wyświetla loader tekstem "Pobieranie struktury z bazy PIM...", a po ułamku sekundy szare ostrzegawcze puste pudełko znika. W jego miejscu wyłania się albo żółty błąd, że produkt nie ma "sprecyzowanych żadnych materiałów pakowych", albo ładuje się lista aktualnie powiązanych surowców (Drzewo), odblokowując tym samym moduł dodawania komponentów na samym dole ekranu.

---

### Nazwa operacji/zadania: Konstruktor Struktury Opakowaniowej (Dodawanie Komponentów do BOM)

**Po co to jest? (Cel biznesowy):** Procedura powiązywania frakcji śmieciowych z konkretnym towarem na sztuki. Buduje się tym "drzewo BOM" (Bill of Materials). Moduł wylicza, ile dany "śmieć" zawarty wokół kremu/sprzętu (np. 15.5g plastiku PET) będzie kosztował firmę realnie przy sprzedaży (ułamek grosza podpinany potem na stałe do kalkulatorów zyskowności handlowej). **Gdzie to znaleźć? (Lokalizacja UI):** Prawe, fioletowe okienko na samym dole interfejsu (dostępne tylko po zrealizowaniu procedury Wyszukiwania Produktu w kroku wyżej). Okienko "Dodaj Komponent Odpadowy do Drzewa". **Wymagania wstępne (Wiedza z kodu):** Poprawnie wybrany produkt wyżej oraz znajomość wagi w *gramach* materiału pakowego. Frakcja musi istnieć na lewym panelu. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. W rozwijanej liście "-- Wybierz Frakcję z Listy Celnej \--" odnajdź i kliknij stworzony wcześniej surowiec (np. "PET" lub "Testowa Frakcja").  
2. W centralne pole tekstowe "Waga (Gramy)" wpisz dokładną wagę pustego śmiecia dla jednej sztuki z użyciem kropki, np. 15.5.  
3. Kliknij fioletowy, solidny przycisk z prawej strony: "Powiąż". **Wynik operacji (Output):** Po zaledwie ułamku sekundy, ponad fioletowym panelem w "Strukturze opakowaniowej" wylistowuje się nowy, siwy pas. Widnieje na nim zielony listek, nazwa frakcji oraz potężny systemowy przelicznik finansowy: wylistowana waga z dopiskiem "gram" i wyliczona przez silnik "waga dzielona na 1000 razy opłata z lewego panelu" ukazana wielką, czerwoną czcionką jako np. "+ 0.0403 PLN (do haraczu)". Zapis jest błyskawiczny i permanentny na bazie PIM.

---

### Nazwa operacji/zadania: Optymalizacja Drzewa BOM (Usuwanie Komponentów)

**Po co to jest? (Cel biznesowy):** Mechanizm sprzątający. Jeśli producent zmienił koncepcję i pozbył się kartonika dla produktu na rzecz celofanu, to manager ekologii usuwa stare zapisy, by obniżyć firmie wydatek stały na haracze ROP/BDO przy każdej sprzedanej sztuce. **Gdzie to znaleźć? (Lokalizacja UI):** Ikona małego kosza na śmieci po całkowicie prawej stronie na pasie każdego dodanego wcześniej komponentu odpadowego (Lista "Struktura opakowaniowa"). **Wymagania wstępne (Wiedza z kodu):** Towar musi mieć podczepiony do swojego organizmu minimum 1 surowiec z procedury "Konstruktora". **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Na przypiętym elemencie (pasku frakcji) odnajdź skrajnie z prawej ikonę **kosza na śmieci** (uruchamia ona bez pytania o potwierdzenie trigger handleRemoveBom).  
2. Kliknij ikonę uderzając lewym przyciskiem myszy. **Wynik operacji (Output):** Wiersz komponentu momentalnie znika z "Receptury", relacja bazy danych jest niszczona (Delete), a całkowity "haracz ekologiczny" indeksu jest automatycznie korygowany w dół. Usunięcie ostatniego (bądź wszystkich) pasków wywoła powrót żółtego ostrzegawczego paska informującego, że indeks jest całkowicie pusty i pozbawiony ekologii.

   \* Harmonogram SMI (AI Orchestrator)

### Nazwa operacji/zadania: AI Auto-Orchestrator z mechanizmem Deep Research i Swarm

**Po co to jest? (Cel biznesowy):** Narzędzie rozwiązuje problem "Pustej kartki" oraz halucynacji AI u copywriterów. Zamiast ręcznie wymyślać posty lub polegać na generycznym ChatGPT, który zmyśla cechy produktów, moduł samodzielnie bada produkt w bazie i deleguje paczkę postów do odpowiednich "ekspertów", dostosowując slang i format do specyfiki każdej platformy osobno. **Gdzie to znaleźć? (Lokalizacja UI):** Górny, szary pasek narzędzi. Należy kliknąć przycisk \[AI\], by rozwinąć ukryty interfejs wprowadzania poleceń naturalnych. **Wymagania wstępne (Wiedza z kodu):** Rygorystyczny wymóg\! Aby uruchomić potężny moduł **Deep Research**, w wpisywanym tekście (prompcie) musi bezwzględnie znaleźć się ciąg cyfr od 8 do 14 znaków, który system potraktuje jako **EAN** (np. Rozpisz 5 postów dla 8809632880012). Użytkownik musi też przypisać to do instniejącej Kampanii PIM. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij przycisk "AI", aby otworzyć interfejs Orkiestratora.  
2. W białym polu z lupą ("Opisz kampanię...") wbij z klawiatury polecenie z kodem EAN, np.: *Rozpisz szybką kampanię dla EAN 5901234567890 skupioną na promocji.*  
3. W liście obok wybierz docelową kampanię.  
4. Kliknij fioletowy przycisk "Generuj Automatycznie" i zaczekaj na zakończenie ładowania (spinner). **Wynik operacji (Output \- Kaskada AI na serwerze):** Interfejs zamraża się, podczas gdy pod spodem (Backend) dzieje się niesamowita sekwencja zdefiniowana w campaigns.controller.js i ai.service.js:  
5. **Deep Research:** System wykrywa EAN Regexem (/\\b\\d{8,14}\\b/), uderza do bazy PIM Prisma. Jeśli produktu tam nie ma, awaryjnie odpala BaseLinkerService, pobiera pełny opis (HTML) oraz parametry cech od producenta, budując twardy kontekst bez halucynacji (np. "Nie zmyślaj cech, to jest prawdziwy skład...").  
6. **Agent Dyspozytor (Router):** Pierwszy model AI (gemini-3.1-pro-preview) czyta Twoją intencję i dzieli ją, zwracając matematyczny JSON (np. "Dałem 2 posty na FB, bo target jest starszy, i 1 na TikToka").  
7. **Agenci Platform (Równolegle):** Dyspozytor odpala 3 kolejne modele AI jednocześnie (Promise.all):  
   * **Agent Facebook:** Pisze dłuższe copy z pogrubieniami, targetuje na osoby 30+, dorzuca linki.  
   * **Agent Instagram:** Formatuje zgrabne "hooki", używa 10-15 sztywnych hashtagów i dopasowuje wizualia pod format *Karuzeli/Reels*.  
   * **Agent TikTok:** Ignoruje copy (zostawia bardzo krótkie), ale za to w ukrytej kolumnie Notes (Uwagi) pisze gotowy *Scenariusz Wideo* dla montażysty z dokładnymi wytycznymi mowy ciała i *Trending Audio*. *Finalny efekt w przeglądarce:* Tabela na froncie automatycznie się przeładowuje zrzucając 5 gotowych, perfekcyjnie sformatowanych pod kątem algorytmów rzutów wpisów, oznaczonych statusem "Szkic", z prawidłowo zaciągniętymi i podzielonymi na kolumny informacjami.

---

### Nazwa operacji/zadania: Ręczny Edytor i Strukturyzacja "Zębów" (Dodawanie Rzutu)

**Po co to jest? (Cel biznesowy):** Kontrola jakości. Jeśli model wygenerował scenariusz na TikToka, ale Head of Marketing chce go zmienić, edytor pozwala to zrobić, wymuszając jednak podział na twarde zęby formatki (Copy osobno, Hashtagi osobno, Uwagi osobno), co ratuje grafików przed bałaganem w Excelach. **Gdzie to znaleźć? (Lokalizacja UI):** Niebieski przycisk "Dodaj Rzut" (prawy górny róg) lub ikonka Edycji (ołówek) w kolumnie "Akcja" w głównej tabeli przy gotowym już rzucie. **Wymagania wstępne (Wiedza z kodu):** Pola ostateczne: Kampania, Data Emisji (narzuca układ w kalendarzu) oraz Typ/Format (ograniczony słownikiem: 'Zdjęcie', 'Rozbudowana Karuzela', 'Rolka', 'Insta Story', 'Infografika'). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij "Dodaj Rzut". Wysunie się lewy panel "Nowy Wpis Rozpiski".  
2. Wypełnij pola i zjedź na dół, klikając "Zapisz wpis".  
3. Aby wejść w modyfikację narzuconą przez AI – znajdź post w tabeli, najedź na skrajnie prawą stronę wiersza (by odsłonić ikony) i kliknij ołówek. Następnie nadpisz treść i zatwierdź "Zapisz wpis". **Wynik operacji (Output):** Operacja chowa panel i natychmiast wrzuca nowy wiersz w układzie Zebra-Striping do szerokiej tabeli pośrodku. Treści są ładnie poporcjowane. Hashtagi wpadają do granatowego boksu, copy do białego (do ucinanego na 140px wysokości kontenera), a komentarze do różowego. Status ma osobną flagę (Szkic \= wyszarzony wiersz).

---

### Nazwa operacji/zadania: Moduł Wrzutni Mediów (Pojemnik na assety)

**Po co to jest? (Cel biznesowy):** Pozwala grafikowi bezpośrednio "przybić" gotowy render wideo / grafiki z Photoshopa do zaplanowanego w kalendarzu terminu emisji. Eliminuje to pomyłki, gdzie handlowiec publikuje zły materiał w złym dniu. **Gdzie to znaleźć? (Lokalizacja UI):** W głównej tabeli, w skrajnie lewej kolumnie zatytułowanej "Dodatek Media". Widoczna jako pole "Wgraj Zasób" (jeśli puste) lub ikonka plusika \+ (do podpinania kolejnych plików). **Wymagania wstępne (Wiedza z kodu):** Rzut musi fizycznie istnieć w bazie (nie da się wgrać do "Nowego Wpisu", który jest w trakcie edycji i nie ma ID). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. W tabeli kliknij na wiersz w obszarze pola z ikoną chmurki "Wgraj Zasób".  
2. Po otwarciu systemowego okna eksploratora (Windows/Mac) wskaż plik JPG, PNG lub MP4.  
3. Gdy zdjęcie się pojawi w tabelce na miniaturowym kaflu, najedź na nie myszką. Wyłoni się czarna powłoka (overlay) z dwiema małymi białymi ikonkami:  
   * Kliknij "Maximize" (ikona lupy), by powiększyć.  
   * Kliknij "Kosz", aby usunąć powiązany plik z chmury. **Wynik operacji (Output):** Przekazanie pliku uruchamia ukryty input. Tabela zastępuje przycisk kręcącym się niebieskim kółkiem loadera. W tym czasie plik kompresowany do 50MB (limit kontrolera) leci do zewnętrznego *Supabase Storage*, a w interfejsie po chwili renderuje się fizyczna miniatura lub odtwarzacz wideo <video src="..."> pobrany bezpośrednio z chmury Nexus-Files.

---

### Nazwa operacji/zadania: Live Filtering (Ręczne ścinanie tabeli)

**Po co to jest? (Cel biznesowy):** Pozwala w gąszczu np. 400 zablokowanych postów z 10 kampanii odsiać tylko i wyłącznie "Szkice" do zatwierdzenia przez szefa marketingu na dany miesiąc. **Gdzie to znaleźć? (Lokalizacja UI):** Przycisk "Filtry" na górnym pasku, odsłaniający pas z 6 inputami poniżej. **Wymagania wstępne (Wiedza z kodu):** Tabela musi zawierać chociaż 1 post. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Odbezpiecz pas filtrów uderzając w przycisk "Filtry".  
2. Skieruj się do ostatniego pola po prawej "Szukaj w treści..." i wpisuj powoli ułamek słowa, np. testowa. **Wynik operacji (Output):** To w pełni frontendowy silnik React-a (bez odpytywania API w tle). Przy każdej naciskanej literce na klawiaturze, z tabeli błyskawicznie znikają wiersze niespełniające wymogu. Jeśli skasujesz wszystko guzikiem Backspace – tabela powraca w pełnym formacie w ułamku sekundy.

---

### Nazwa operacji/zadania: Eksterminacja Rzutu i Wymóg Autoryzacyjny

**Po co to jest? (Cel biznesowy):** Usuwanie trwale błędnych zapisków lub postów "zdjętych z anteny". Posiada jednak twardą śluzę kontrolną. **Gdzie to znaleźć? (Lokalizacja UI):** Ikonka śmietnika w kolumnie "Akcja" z prawej strony (pojawia się jedynie po najechaniu myszą – hover na konkretny wiersz). **Wymagania wstępne (Wiedza z kodu):** Kontroler backendu posiad2. **Agent Badawczy (INCI Intelligence):** (Temp 0.2) Wyszukuje twardych danych INCI wpierw w BaseLinker, a przy brakach ratując się OSINTem internetowym.
3. **Agent Audytor Wizualny:** Moduł operujący na Vision AI nakierowany na surową ewaluację zdjęć pod kątem wymogów Allegro. Agent korzysta z rygorystycznego `VISION_AUDIT_PROMPT`, który wymusza czyste, białe tło (RGB 255) dla miniatury głównej (Slot 1) oraz bada interakcje modelek z produktem i zakazane logotypy tekstowe w pozostałej galerii.
4. **Agent Auto-Fill (Faza 2.5) & Category Sync:** Automatycznie wyszukuje kategorię Allegro (po EAN lub nazwie), pobiera słownik `Schema` i używa go w tandemie z BaseLinkerem oraz Agentem AI do wypełnienia luk w cechach produktu (PIM OSINT). Zapisuje komplet do Prisma bez interakcji człowieka.
5. **Agent AEO (Analityk Strukturalny):** (Temp 0.4) Konstruuje modułową strukturę P&A dopasowaną pod SGE / LLM'y na bazie starych opisów archiwalnych.
6. **Agent GEO Text (Copywriter):** (Temp 0.6) Używa wyselekcjonowanego INCI oraz surowego AEO do wygenerowania optymalnego kodu HTML Allegro ograniczonego zaledwie do 7 autoryzowanych tagów, zwracając JSON poddany na koniec rygorowi Auto-Repair.
7. **Agent Audytor Prawny (Compliance):** (Temp 0.0) Strażnik unijnych dyrektyw WE 1223/2009. Zmiękcza zjawisko greenwashingu i blokuje oświadczenia medyczne w wygenerowanym wcześniej HTML'u.
8. **Agent Tytułów (Google Trends):** (Temp 0.8) Niezależny moduł rygorystycznie optymalizujący i generujący hasła główne w limicie 75 znaków.

---

### Nazwa operacji/zadania: Inicjalizacja EAN (Single-Action Pipeline)

**Po co to jest? (Cel biznesowy):** Mechanizm realizujący paradygmat "Zero Kliknięć". Zrekonstruowany na pełnoprawny **"Unified Product View" (Kokpit PIM)**. Moduł po otrzymaniu pojedynczego sygnału (EAN) asynchronicznie odpala potok na backendzie. Silnik sam synchronizuje kategorie Allegro, odpytuje OSINT/BaseLinker o parametry (Auto-Fill PIM), pobiera dane logistyczne i uruchamia równolegle agentów AI (Vision, Copy, Compliance). **Gdzie to znaleźć? (Lokalizacja UI):** Początkowo jest to w 100% ciemny ekran z inputem tekstowym "ImageUploadBox". Następnie przekształca się w kaskadowy układ (architektura pełnoszerokościowa) "UltimateProductDashboard". **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi posiadać 13-cyfrowy kod EAN (np. 8809822540631). EAN to twardy klucz całego potoku. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Wbij w główne, centralne pole na ciemnym tle kod EAN: 8809822540631.
2. Naciśnij Enter lub kliknij przycisk "Start".
3. *UWAGA:* Rozpocznie się asynchroniczna sekwencja backendowa (ok 5-20 sekund). **Wynik operacji (Output):** Środowisko się przeładowuje z widoku "Inicjatora" w "Centrum Dowodzenia" o nowym układzie kaskadowym. Na samej górze ląduje potężny Walidator Tytułu. Poniżej widok dzieli się 50/50 na Audytor Wizyjny AI oraz wygenerowane sekcje sprzedażowe (GEO/AEO) sprzężone z Symulatorem. Na samym dole ekranu w pełnej szerokości ładują się panele PIM (OSINT, Identyfikacja PIM, Logistyka, Unit Economics i Architektura Zapasów). W sekcji **Identyfikacja PIM** system sprawdza czy zdefiniowano producenta. Jeśli zmienna 'manufacturer' jest pusta, potok skanuje w głębi obiekt `features['Marka']` lub `features['Producent']`. Jeżeli i tam brakuje danych, silnik AI (Agent Auto-Fill) na podstawie nazwy odgaduje markę i twardo nadpisuje nią pole "PIM-IMPORT". Interfejs jest w 100% ciemny i "gotowy" natychmiast po załadowaniu.

 pobiera surowe dane, odsyła je do chmury Agentów AI i przygotowuje w ułamek minuty pięć gotowych sekcji tekstowych. **Gdzie to znaleźć? (Lokalizacja UI):** Środkowy ekran na górze. Główny formularz wejściowy z sekcją "Wybierz Tryb Pracy Wymuszany na AI". **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi posiadać na biurku rzeczywisty, poprawny 13-cyfrowy kod EAN (np. 8809822540631). EAN pełni w kodzie backendu funkcję potężnego klucza (Regex ^\\d{8,14}$), bez którego proces w ogóle nie ruszy. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Z listy rozwijanej "Tryb Pracy" wybierz pożądaną architekturę bezpieczeństwa. Na kosmetyki wybierz "Audytor Rozporządzenia Kosmetycznego (UE 1223/2009)".  
2. Wbij w główne pole testowy kod: 8809822540631.  
3. Kliknij niebieski przycisk z ikoną "Pobierz z API".  
4. *UWAGA:* Następuje blokada przycisku ("Transfer..."). Operacja jest bardzo obciążająca pamięciowo po stronie chmury i trwa nawet 20 sekund. **Wynik operacji (Output):** Środowisko się przeładowuje. Interfejs zrzuca alert o pobraniu kopii z AI. Z lewej strony ładuje się pole z 5-sekcjami gotowego kodu (od "Mocnych Stron" po twarde, zweryfikowane przez AI "Składy INCI"). W dolnej części ładują się zaciągnięte miniatury "Audytora Multimodalnego".

---

### Nazwa operacji/zadania: Walidacja i Odświeżanie Tytułu Aukcji (HitL)

**Po co to jest? (Cel biznesowy):** Mechanizm Human-In-The-Loop. AI nie zawsze ułoży układ słów pod kątem sprzedażowym (np. algorytmy pozycjonujące lubią gdy słowo "Krem" stoi blisko marki). Handlowiec (Człowiek) ma ostateczny głos kontrolny nad nagłówkiem oferty. **Gdzie to znaleźć? (Lokalizacja UI):** Lewy pas roboczy interfejsu. Białe pole nad oknami kodu: "Weryfikacja HitL Rekordu". **Wymagania wstępne (Wiedza z kodu):** Musi być aktywne pobranie z API (widoczne pola Edycji HTML). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Zlokalizuj pole tytułu z wypisanym przez AI tekstem (np. "Krem Nawilżający Trimay").  
2. Dodaj słowo z palca i obserwuj niewidzialny włącznik licznika długości – tytuł musi mieścić się w przedziale 12-75 znaków.  
3. Jeśli zaproponowany temat jest słaby, kliknij niebieski, mały przycisk ponad polem: **"Odśwież Tytuł"**. **Wynik operacji (Output):** Odpalenie przycisku "Odśwież Tytuł" to tak naprawdę wywołanie serwerowej funkcji generateTitleOnly(), która odpala kreatywne Gemini (temperatura 0.8) z zakazem używania brzydkich haseł marketingowych typu "HIT". Do pola wpada nowy zestaw słów.

---

### Nazwa operacji/zadania: Wywołanie Audytu Wizualnego / Wypalanie Zdjęć (Claid Lifestyle)

**Po co to jest? (Cel biznesowy):** Moduł analityczno-operacyjny do zarządzania zasobami graficznymi (Audyt Multimodalny Vision AI) i tworzenia bezpiecznych zdjęć lifestylowych przez Claid (omijanie de-duplikacji Allegro). Zabezpiecza przed odrzuceniem oferty wymuszając poprawne tło i blokując "brudne" miniatury. **Gdzie to znaleźć? (Lokalizacja UI):** Druga połowa ekranu roboczego na dole. Okno z siatką komponentów `PhotographicAuditorCard`. Karty zawierają przeniesione w dół czerwone alerty błędów wizyjnych oraz ukrywają popękane ikony zewnętrznych API dzięki mechanizmowi `onError`. **Wymagania wstępne (Wiedza z kodu):** Rzut produktu wczytany z API PIM. Użytkownik ma środki API w chmurze. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Zlokalizuj ramkę karty dla danego zdjęcia.  
2. Zwróć uwagę na Slot 1 (Miniatura) – z uwagi na bezwzględny regulamin (Białe Tło RGB 255), AI blokuje na tym slocie przyciski "Wygeneruj Lifestyle AI".  
3. Na pustych lub zepsutych kafelkach galerii (Sloty 2+) wciśnij akcję "Wygeneruj Lifestyle AI". **Wynik operacji (Output):** System wyśle komendę do Claid i odbije odpicowaną fotografię na slot "ReplacedUrl" dla handlowca jako base64. Wizualne ostrzeżenia z Agenta (np. błąd obecności modelki bez produktu) są elegancko wyświetlane pod zdjęciami, zachowując 100% widoczności samego towaru.

---

### Nazwa operacji/zadania: Zapis Kopii Roboczej (Draft) i Eksport Produkcyjny (BaseLinker Push)

**Po co to jest? (Cel biznesowy):** Narzędzie pozwala porzucić pracę w połowie dnia, zapisując całą logikę wygenerowanych zdjęć i 7-tagowych opisów (Ochrona pracy AI). Drugi guzik omija interfejs Allegro – po odpaleniu pcha skompresowane paczki od razu na serwery BaseLinkera podpinając gotowy szkielet sprzedażowy do połączonych w nim kont rynkowych. 
**NOWOŚĆ (Single Source of Truth):** Zapis kopii roboczej od teraz wymusza także twardy zapis zmienionych atrybutów "Unit Economics", gabarytów (Długość, Szerokość, dodana nowa Wysokość), wagi oraz ID PIM (Koszty bazowe, transport, BDO, podatek, stany magazynowe WMS/ERP, SKU, przypisanie marki). Moduł Ofertowania działa jako de facto edytor kartoteki PIM, zabezpieczając wyciek marży.
**Gdzie to znaleźć? (Lokalizacja UI):** Zabezpieczony "Sticky Bar" pływający bezwzględnie przyczepiony do spodu krawędzi ekranu. W Kolumnie 1 znajdują się zintegrowane kontrolki "Identyfikacja PIM" oraz "Unit Economics".
**Wymagania wstępne (Wiedza z kodu):** Rozpoczęta i przeliczona sesja produktu (wczytany EAN).
**Jak to użyć? (Instrukcja Krok po Kroku):**

1. Zmodyfikuj dowolne wartości kosztowe w sekcji "Unit Economics" (np. Koszty pakowania lub BDO).
2. Kliknij lewy przycisk na dole paska: **"Zapisz Kopię Roboczą"**.  
3. Opcjonalnie, gdy handlowiec uznaje, że jest gotowy do publikacji handlowej uderza w fioletowy przycisk: **"Eksportuj do BaseLinker"**. **Wynik operacji (Output):** Przycisk z dyskietką pakuje stany pamięci masowej Reacta do paczki compileDraftData() (wraz z pełnym zestawem pól finansowych i logistycznych) i pcha patchem do rekordu PIM jako główna referencja SSoT. Eksport do BaseLinkera uruchamia handleExportToBaselinker, który przerzuca skompilowane, zoptymalizowane HTML'e wprost do inwentarza zew. systemu.

   \* Resi Studio  AI Engine (Kompozycja i generowanie obrazów AI)  
   \* Baza Influencerów NLP (Pipeline "Od kontaktu do zapłaty")

### ARCHITEKTURA KOGNITYWNA (Identyfikacja Agentów AI)

Zgodnie z poleceniem, zlokalizowałem trzech twardych agentów napędzających ten moduł:

1. **Agent Łowca (Hunt Agent):**  
   * *Zadanie:* Gdy rzucisz mu wyzwanie tekstowe (np. "10 makijażystek z Polski do barteru"), Agent korzystając z funkcji World-Knowledge wymyśla i wyszukuje realne, publiczne konta twórców. Od razu zamienia je na "wektory" i wgrywa do firmowej bazy PostgreSQL bez Twojego udziału.  
   * *Zabezpieczenie:* Limitowany przez logikę serwera do 10 profili per paczka (ochrona przed przeładowaniem pamięci).  
2. **Agent Badań Semantycznych (Semantic Discovery NLP):**  
   * *Zadanie:* Klasyczna wyszukiwarka szuka po słowach "Krem". Ten agent (wykorzystujący Tensorowe Osadzanie Wektorów) szuka po ZNACZENIU. Po wciśnięciu czarnego przycisku i wpisaniu "vegan makeup", Agent analizuje matematyczne dystanse (Cosine Similarity) pomiędzy Twoją intencją a estetyką każdego influencera w bazie, odrzucając tych o niskim dopasowaniu.  
3. **Agent PR (Outreach Agent):**  
   * *Zadanie:* Gdy zapinasz influencera do Kampanii, ten Agent analizuje "Authenticity Score" oraz preferencje (np. Barter) i pisze gotową, hi-endową wiadomość z propozycją współpracy do wysłania na e-mail/DM.  
   * *Zabezpieczenie:* Generuje szkic (Draft), nie wysyła go automatycznie. Wymaga czynnika ludzkiego do akceptacji.

---

### Nazwa operacji/zadania: Inteligentne Polowanie AI (AI Hunt)

**Po co to jest? (Cel biznesowy):** Pozwala natychmiast, za pomocą jednego kliknięcia zyskać świeżą, nową krew do reklamowania produktów. Rozwiązuje to problem godzin spędzanych na Instagramie na przewijaniu feedu w poszukiwaniu nowych współprac. **Gdzie to znaleźć? (Lokalizacja UI):** Główny ekran CRM, górny biały pasek. Pole tekstowe z symbolem gwiazdki i małym przyciskiem wewnątrz inputa. **Wymagania wstępne (Wiedza z kodu):** Musisz precyzyjnie sformułować tzw. prompt. Wymagana jest krótka komenda tekstowa zdradzająca intencję (np. kto, z jakiego kraju, za co). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij w pole z jasnoszarym napisem np. 10 makijażystek do barteru....  
2. Wpisz z klawiatury zapotrzebowanie, np. 3 polskie tiktokerki kosmetyczne.  
3. Kliknij jasnoniebieski przycisk **"Polowanie AI"** umieszczony z prawej strony tego samego paska. **Wynik operacji (Output):** Guzik blokuje się i zaczyna kręcić kółkiem ("Szukam..."). W tle backend asynchronicznie wgrywa dane. Następnie ekran zwraca twardy systemowy alert okienkowy z komunikatem: *"Generative AI pomyślnie wyłowił i wprowadził: 3 profili\! Sprawdź tabelę Repozytorium."*

---

### Nazwa operacji/zadania: Wyszukiwarka Vector NLP (Semantic Search)

**Po co to jest? (Cel biznesowy):** Moduł potrafi przesiać 1000 influencerów zapisanych w pamięci i ułożyć ich w ranking według "Chemii" pasującej do danej Kampanii (tzw. Vibe check wektorowy). **Gdzie to znaleźć? (Lokalizacja UI):** Czarny, rzucający się w oczy przycisk "Wyszukiwarka Vector NLP" w prawym górnym rogu ekranu CRM. **Wymagania wstępne (Wiedza z kodu):** Baza katalogowa (PIM) musi już posiadać jakichś wgranych twórców, w przeciwnym razie nie będzie z czego liczyć statystyk. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Uderz w czarny przycisk **"Wyszukiwarka Vector NLP"**.  
2. W nowo otwartym białym oknie nałożonym na przyciemniony ekran, wpisz w szerokie pole swobodną intencję, np. vegan makeup.  
3. Kliknij czarny przycisk poniżej: **"Rozpocznij mapowanie wektorowe"**. **Wynik operacji (Output):** Modal generuje natychmiastową listę kafelków. Przy każdej osobie znajduje się na zielono wynik np. **"⭐ 55.21%"** informujący o sile matematycznego dopasowania stylów.

---

### Nazwa operacji/zadania: Przechwyt Twórcy do Lejka (Pipelining)

**Po co to jest? (Cel biznesowy):** Oddziela twórców "zablokowanych" w zimnej bazie (Katalogu) od tych, z którymi dział marketingu obecnie negocjuje umowy na ten tydzień (Gorący Lejek Kanban). **Gdzie to znaleźć? (Lokalizacja UI):** Główny ekran CRM \-\> Lewy górny róg ramki z napisem \-\> Przycisk "Otwórz Katalog" na niebieskim tle. **Wymagania wstępne (Wiedza z kodu):** Brak, o ile w katalogu znajdują się profile. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij **"Otwórz Katalog"**. Otworzy się wielki panel a'la aplikacja NanoInflu z kafelkami zdjęć twórców.  
2. Kliknij lewym przyciskiem myszy na dowolną kartę influencera (np. zdjęcie "Irena Mąsior").  
3. System wysunie z prawej strony wąską "szufladę" (Drawer) ze szczegółami influencera.  
4. Na samym górnym prawym rogu obrazka profilowego uderz w fioletowy przycisk z ikoną strzałki: **"Do Pipelinu"**.  
5. *Zauważ, że szuflada zostaje ukryta lub pojawia się loader.* Zamknij panel katalogu "iksem" (X). **Wynik operacji (Output):** Twórca zostaje wpięty do bazy deals i pojawia się natychmiast pod pierwszą flagą głównych kafelków w operacyjnym Kanbanie na samym dole ekranu.

---

### Nazwa operacji/zadania: Generowanie AI Briefu & Notatnik Negocjacyjny

**Po co to jest? (Cel biznesowy):** Narzędzie generuje na poczekaniu błyskawiczną ofertę copywriterską i tworzy audytowalny, chronologiczny ślad dla zarządu (jakie powody podano by zerwać współpracę). **Gdzie to znaleźć? (Lokalizacja UI):** Wewnątrz "szuflady" (Drawera) każdego z twórców dostępnej z poziomu "Otwórz Katalog". **Wymagania wstępne (Wiedza z kodu):** Twórca BEZWZGLĘDNIE musi posiadać już podpiętą kampanię (przebywać w "Pipelinie"). System blokuje przycisk, aby zapobiec zużywaniu tokenów API dla pustych osób bez kampanii. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Otwórz Katalog, wejdź w twórcę z aktywną kampanią.  
2. Pozostając w pierwszej zakładce "Dane", zjedź rolką myszy w dół.  
3. Kliknij różowy przycisk **"Generuj AI Brief (48h)"**. System pokaże loader i zwróci różową kartę z gotowym tekstem od AI.  
4. (Logowanie): Kliknij ikonę "Dziennik" na pasku nawigacyjnym drawera (ikona dymków czatu).  
5. Wpisz powód negocjacyjny w puste pole i wciśnij fioletowy przycisk **"Wyślij wpis do LOG'u"**. **Wynik operacji (Output):** Brief AI wyświetla gotowe copy w oknie bez możliwości jego edycji (gotowe do "Kopiuj-Wklej"). Z kolei system Notatnika wyrzuca nowy biały blok komentarza opatrzony rygorystycznym stemplem czasu wykonania akcji (Time-Stamp).

---

### Nazwa operacji/zadania: Operacyjny Kanban (Drag\&Drop Status)

**Po co to jest? (Cel biznesowy):** To rdzeń modułu finansowego. Wizualizacja "ruchu piniądza". Handlowiec zmieniając status od zera widzi jak przewidywana stopa zwrotu (Predictive ROI / EMV) przepływa przez etapy realizacji, od obietnic do podpisania budżetu. **Gdzie to znaleźć? (Lokalizacja UI):** Na samym dole głównego ekranu CRM, to zestaw czterech pionowych kolumn (NAWIAZANIE, UMOWA, PACZKA, ZAPLACONO). **Wymagania wstępne (Wiedza z kodu):** DealIRM wprowadzony w trybie "Do Pipelinu". **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Zjedź na sam dół CRM do obszaru kolumn.  
2. W pierwszej kolumnie odnajdź białą kartę swojego influencera.  
3. W dolnej sekcji jego karty odszukaj prosty szary rozwijak (select list).  
4. Kliknij go i zmień status, np. z NAWIAZANIE na **UMOWA**. **Wynik operacji (Output):** Karta natychmiast "znika" ze starej kolumny i materializuje się w kolumnie "UMOWA". Ponadto event w tle DEAL\_MARKETING\_COST\_UPDATED automatycznie wysyła Ping przeliczający na żywo całkowity koszt ponoszony przez firmę do modułu głownej analityki *GodMode Analytics*.

3\. \*\*Mózg Ads (Allegro Ads Intelligence)\*\*  
   \* RL Backtest Monitor (Reinforcement Learning)  
   \* Silnik Testowy E2E  
   \* Modelowanie atrybucji opóźnionej (Time-Decay)

### ARCHITEKTURA KOGNITYWNA (Identyfikacja Agentów AI)

W module funkcjonuje "Rój" wzajemnie kontrolujących się algorytmów (Model RL vs Systemy Regułowe):

1. **Agent Ochronny (Pre-Flight Sentinel / Tarcza):**  
   * *Zadanie:* Blokuje wykonanie operacji, jeśli algorytmy wykryją zagrożenie krytyczne przed wydaniem pierwszej złotówki. Odrzuca kampanie, które łamią regulamin (compliance) lub generują stratę jeszcze w fazie symulacji kosztowej.  
2. **Kalkulator Unit Economics (Agent Księgowy):**  
   * *Zadanie:* Przeprowadza absolutnie rygorystyczne wyliczenie marży. Odrzuca "ROAS" od Allegro jako wyznacznik sukcesu. Zlicza realny koszt wytworzenia towaru (COGS) i ukryte prowizje (np. opłaty za Smart\!), wyliczając bezwzględny limit dopłaty do jednego kliknięcia (Max CPA Netto).  
3. **Mózg Decyzyjny (Bidding Engine \+ Predykcja Szeregów Czasowych):**  
   * *Zadanie:* Posiada na stałe wbudowane 5 taktyk twardych (np. CASH\_COW, NEW\_RELEASE, SLEEPER\_LONG\_TAIL). Modyfikuje stawkę bazową z uwzględnieniem Daypartingu (np. prime-time między 18 a 22 wymusza mnożnik stawki x1.3, noc wymusza obcięcie x0.5) oraz anomalii kalendarzowych (np. dni wypłat 8-12 dnia miesiąca \= agresywne biddowanie x1.4).  
4. **Agent Reinforcement Learning (Q-Learning Service):**  
   * *Zadanie:* Gdy Mózg Decyzyjny zasugeruje stawkę (np. 1.00 PLN), Q-Learning (Epsilon-Greedy) wchodzi do gry, aby eksperymentować (Eksploracja vs Eksploatacja). Metodą prób i błędów modyfikuje stawkę (+10%, \-10%, HOLD) dla danego stanu (np. CASH\_COW\_WIECZOR), uaktualniając macierz Q-Table w oparciu o opóźnioną nagrodę finansową.

---

### Nazwa operacji/zadania: Backtesting Reinforcement Learning (Silnik Testowy E2E)

**Po co to jest? (Cel biznesowy):** Pozwala na bezpieczne "przetrenowanie" Mózgu AI na ślepo (tzw. Paper Trading), upewniając właściciela firmy, że algorytm w danej chwili nie wpadł w pętlę i nie "przepali" budżetu w nocy przed podłączeniem z prądem konta bankowego. **Gdzie to znaleźć? (Lokalizacja UI):** Menu MTool (ikona robota) \-\> Zakładka "Mózg AI (Allegro Ads) / RL Backtest Monitor". **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi posiadać poprawny EAN dla produktu, dla którego uzupełniono już wcześniej twarde dane finansowe (koszty wytworzenia – COGS) w systemie PIM. Przykładowy test dla kodu bez wprowadzonych kosztów zwracał krytyczny błąd "Brak COGS/SalePrice". Testy empiryczne przeprowadzono pomyślnie na EAN: 8000137011742. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Skup wzrok w prawym górnym rogu na pasku obok nazwy panelu.  
2. Wpisz testowany kod EAN (np. 8000137011742) w okienko "EAN lub SKU (opcjonalnie)".  
3. Kliknij czarny przycisk z ikoną Play oznaczony napisem: **"Pełny Test"**. **Wynik operacji (Output):** Środowisko zamraża się z informacją "Symulacja..." na kilka sekund. Następnie wybudza dolny panel z trójpodziałem kontrolnym. Po lewej stronie renderuje się w czasie rzeczywistym "Lista kroków" E2E z zielonymi haczykami, sygnalizująca przejście przez autoryzację, ładowanie zysków i odpalenie algorytmu Bellmana (Q-Table).

---

### Nazwa operacji/zadania: Weryfikacja Prawdziwego ROI (Unit Economics)

**Po co to jest? (Cel biznesowy):** Zestawia na jednym ekranie fikcyjny świat reklam z brutalną rzeczywistością. Pokazuje obnażoną prawdę – ile realnie dopłacamy do interesu po podliczeniu wszystkich prowizji. **Gdzie to znaleźć? (Lokalizacja UI):** Środkowy kafel wyników pod symulacją backtestingu zatytułowany "Unit Economics (Prawdziwe ROI)". **Wymagania wstępne (Wiedza z kodu):** Udane przejście procesu Backtestu (Symulacji E2E). **Jak to użyć? (Instrukcja Krok po Kroku):** Proces uruchamia się kaskadowo w wyniku uruchomienia "Pełnego Testu" EANu. **Wynik operacji (Output):** System wyrenderuje interfejs wyliczeniowy. *W teście empirycznym EAN 8000137011742 środowisko zapaliło jasnoczerwony baner z groźnym komunikatem:* **"Alarm: Oferta krwawi operacyjnie\! Kill-Switch gotowy do użycia."** System udowodnił, że "Max Dopuszczalne CPA" to wartość \-9.16 PLN, a "Zysk Organiczny (przed Ads)" wykazał twardą stratę \-8.97 PLN.  
---

### Nazwa operacji/zadania: Weryfikacja Macierzy Decyzyjnej

**Po co to jest? (Cel biznesowy):** Moduł ostatecznie wyświetla dyrektywę egzekucyjną. Tłumaczy "szefowi", co dokładnie Mózg zmieni w Kampaniach Ads w systemach reklamowych i **dlaczego**. **Gdzie to znaleźć? (Lokalizacja UI):** Ciemny kafel z prawej strony symulatora, oznaczony jako "Ostateczny Werdykt Algorytmu". **Wymagania wstępne (Wiedza z kodu):** System musi poprawnie przeprocesować logikę matematyczną w poprzednim etapie. **Jak to użyć? (Instrukcja Krok po Kroku):** Wynik ładuje się automatycznie po zakończeniu uderzenia z kroku 1\. Użytkownik musi go odczytać. **Wynik operacji (Output):** Na podstawie negatywnego testu Unit Economics, algorytm natychmiast zadziałał zapadką bezpieczeństwa. Wypisał na ekranie czerwoną czcionką:

* **Wybrana Strategia:** BLEEDING\_OFFER (krwawiąca oferta)  
* **Akcja Wykonawcza:** KILL\_SWITCH (odcięcie zasilania)  
* **Zaproponowane CPC:** 0 PLN (Ucięcie licytacji do zera) Bidding Engine obronił kapitał przed wstrzyknięciem w przepalający się budżet kampanii.

---

### Nazwa operacji/zadania: Przechwyt Logów Diagnostycznych (Terminal Mode)

**Po co to jest? (Cel biznesowy):** Chroni środowisko przez zjawiskiem tzw. "Black Box". Twórca ma czarno na białym ustrukturyzowany zrzut myśli sieci neuronowej na wypadek, gdyby system dziwnie się zachowywał lub podnosił drastycznie koszty. Pozwala to na inżynierię opóźnionej atrybucji (Time-Decay) wstecz na logach. **Gdzie to znaleźć? (Lokalizacja UI):** Najbardziej dolny panel w widoku Mózgu Ads – w pełni czarny interfejs konsoli pod tytułem "Pełny Zrzut Terminala". **Wymagania wstępne (Wiedza z kodu):** Odpalenie backtestu. **Jak to użyć? (Instrukcja Krok po Kroku):** Skieruj się w dół monitora i przeczytaj zielone bloki tekstu. **Wynik operacji (Output):** System drukuje w konsoli kodowej surowe logi, np. \--\> Produkt PIM: \[...\] | Baza kosztowa: 5.78 PLN. W tym miejscu w systemie produkcyjnym przy symulacjach długoterminowych drukowane są raporty "Time-Decay" oznajmujące, że wycięto dni (np. po 21 dniach), w których ROAS miał przypisaną fałszywą prowizję z reklam, naprawiając tym samym błąd "Ostatniego Kliknięcia".

4\. \*\*God-Mode CMO (Portfolio Manager)\*\*  
   \* Macierz Asortymentu (Lokomotywy vs. Wagony)  
   \* System Rekomendacji Asortymentowych AI  
   \* Analiza Korelacji Koszykowej (Virtual Bundles)  
   \* Strażnik Smarta (Nocny Audyt Ofert)

### ARCHITEKTURA KOGNITYWNA (Identyfikacja Agentów AI)

W module zidentyfikowałem cztery zintegrowane potężne silniki decyzyjne, pracujące nad danymi ze sprzedaży:

1. **Agent Asocjacyjny (Korelacje Koszykowe \- Algorytm Apriori):**  
   * *Zadanie:* Przeszukuje potężny wsad z logów zamówień z ostatnich 30 dni. Bada w locie to, w jaki sposób zachowuje się klient e-commerce. Wychwytuje stałe "Związki" produktów kupowanych parami, generując "Reguły" wyposażone we współczynnik Lift. Odkrywa naturalne zestawy ukryte przed analityką sprzedawcy.  
2. **Agent Kategoryzujący (ML Data-Driven SKU Categorizer):**  
   * *Zadanie:* Odrzuca twarde limity. Dynamicznie, na bazie obrotu liczy tzw. percentyle populacji.  
   * Górne \~15% sprzedaży otrzymuje rangę LOKOMOTYWA (generatory potężnego ruchu organicznego).  
   * Produkty, które się same nie sprzedają, ale są silnie dokupowane (Lift \> 1.2) oznacza jako WAGONY.  
   * Dolne \~30% z zapasem i zerową rotacją to ŚPIOCHY.  
3. **Agent Dyrektora Marketingu (CMO Recommender):**  
   * *Zadanie:* Łączy wyniki z Agenta Kategoryzującego i Asocjacyjnego. Buduje ludzkie, proste komunikaty. Generuje kafelki rekomendacji na ekran (np. stworzenie Wirtualnego Zestawu (Virtual Bundle) dla wykrytego duetu, uwolnienie zamrożonego kapitału z zalegających w magazynie Śpiochów za pomocą Monet Allegro, ochrona limitów budżetowych Ads dla Lokomotyw).  
4. **Strażnik Bezpieczeństwa (Sentinel / Margin Overseer):**  
   * *Zadanie:* Nocny patrol bazy danych. Skanuje tzw. czystość Danych (Data Purity) oraz rentowność (Margin). Odrzuca ze strumienia oferty, w których brak EAN lub których koszty produkcyjne (COGS z systemu PIM) zjadły zysk operacyjny, powodując ujemny ROI.

---

### Nazwa operacji/zadania: Nocny Audyt Ofert (Strażnik Smarta / Sentinel)

**Po co to jest? (Cel biznesowy):** Moduł gwarantuje zabezpieczenie i obronę przed uciekaniem kapitału ze sklepu. Sprawdza "księgowość" każdej oferty wystawionej na rynku. Upewnia się, czy nagłe opłaty za np. dostawy "Smart\!" i prowizje nie obróciły oferty w skarbonkę bez dna. **Gdzie to znaleźć? (Lokalizacja UI):** W panelu God-Mode CMO. Czerwono obramowany przycisk **"Wymuś Audyt"** (z ikoną trójkąta ostrzegawczego) na prawym górnym pasku. **Wymagania wstępne (Wiedza z kodu):** Rygorystyczny wymóg posiadania wypełnionych wartości Zakupowych "COGS" (Koszt Towaru Sprzedanego) na karcie w Bazie Magazynowej. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Odszukaj czerwony przycisk z napisem **"Wymuś Audyt"**.  
2. Kliknij go i poczekaj ułamek sekundy ("Audytowanie..."). **Wynik operacji (Output):** Od samej góry zjeżdża "czarny baner systemowy" uderzający w czerwoną obwódkę alertową. Wyświetla on liczniki dwóch Strażników. W teście ujawnił on m.in "Data Purity Guard: Przeskanowano: X, Zablokowano: 0" i "Margin Overseer: Skontrolowano: Y, Wstrzymano: 0".

---

### Nazwa operacji/zadania: Globalny Skan i Modelowanie Koszyków

**Po co to jest? (Cel biznesowy):** Mechanizm na jedno wciśnięcie pożera zamówienia z ostatnich dni (BaseLinker PIM), przelicza pozycje koszyków według wzorów asocjacyjnych, wyznacza kto z asortymentu w tym miesiącu utrzymuje firmę (Lokomotywy), a kto chowa się w magazynie (Śpiochy). **Gdzie to znaleźć? (Lokalizacja UI):** Ten sam górny pasek roboczy w God-Mode CMO. Niebieski, zaufany guzik: **"Skan (Odśwież)"**. **Wymagania wstępne (Wiedza z kodu):** Użytkownik nie robi nic. Aplikacja pod maską dokonuje strzału API BaseLinkera pętlą z paginacją (aby nie zostać zablokowanym za Rate Limit). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Zaatakuj niebieski guzik **"Skan (Odśwież)"**.  
2. Zostanie zamrożony do momentu zakończenia obliczeń ułamkowych. **Wynik operacji (Output):** Ożywa ekran. Pojawiają się cztery górne kafelki liczbowe. "Przeanalizowane Zamówienia" wskazują głębokość wiedzy, "Skatalogowane SKU" wskazują zbadaną ilość bazy towarowej, zliczone zostają "Znalezione Reguły" (potencjalne Zestawy), oraz co najważniejsze, na dole ekranu wypełnia się szczegółowa i ometkowana kolumnami i kolorami "Macierz Asortymentu".

---

### Nazwa operacji/zadania: Zatwierdzenie Akcji Zamkniętej Pętli (Closed-Loop Exec)

**Po co to jest? (Cel biznesowy):** Zmiana paradygmatu ERP – system nie tylko informuje co się stało w sklepie, ale pozwala Dyrektorowi podjąć wykonawczą akcję "z palca" (Wyślij natychmiast wyższe stawki Licytacji, wymuś likwidację zapasu). Zamknięcie pętli między badaniem AI a zmianą realnego biznesu. **Gdzie to znaleźć? (Lokalizacja UI):** Lewa kolumna ekranu oznaczona pomarańczowym piorunem: **"Rekomendacje AI (Do akceptacji)"**. **Wymagania wstępne (Wiedza z kodu):** Poprzedni krok musiał zwrócić na kafelku "Wygenerowane Akcje CMO" ilość rekomendacji wyższą niż "0". **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Zlokalizuj białą kartę wygenerowanej rekomendacji, opatrzoną na górze numerem EAN.  
2. Zrozum co dyrektor CMO doradza (np. Włączenie tarczy budżetowej dla odkrytej Lokomotywy sklepu).  
3. Wyegzekwuj sygnał klikając jasnoszary, szeroki przycisk **"Zatwierdź Akcję (Exec)"**. **Wynik operacji (Output):** Guzik się ładuje, po czym ulega graficznej transformacji we własny status. Przeistacza się w kolor zielony i krzyczy napisem "✅ Wykonano: \[Komunikat Operacyjny\]". W tle (EventBus) system faktycznie połączył się z Ads lub uderzył flagą zmiany do silnika zarządzania ofertami.

5\. \*\*Nexus Sentinel (Analityka Operacyjna)\*\*  
   \* True Net Margin (Czysta marża po kosztach stałych i kampaniach)  
   \* iROAS (Incremental ROAS)  
   \* Prognozy (Efekty Halo i Kanibalizacji)

1. **Agent Analityk Twardy (Sentinel Auditor / True Net Margin Engine):**  
   * *Zadanie:* Bezpardonowa dekonstrukcja marży jednostkowej. Zamiast operować na optymistycznym ROASie, matematycznie odejmuje od przychodu: VAT, prowizję (np. 12% od Allegro), koszty magazynowania, BDO, transport i koszty produkcji (COGS z PIM). Zwraca twardy, czysty zysk.  
   * *Zabezpieczenie (Data Purity Guard):* System nie ufa estymacjom. Zaprogramowano mu warunek bezwzględny: isPimIncomplete \= (\!product.basePrice || \!product.packagingCost || parseFloat(product.basePrice) \=== 0\). Jeśli handlowiec nie wpisał kosztów zakupu lub ceny kartonu w PIM, Sentinel natychmiast uderzy "Blokadą Analityki" na front-end i nie wyliczy ułamków.  
2. **Agent Strateg-Narrator (God-Mode Strategist):**  
   * *Zadanie:* Gdy matematyka się zepnie, wywoływany jest model (Gemini-3.1-pro), który pełni rolę "Zabójcy Sceptyków" na spotkaniach Zarządu. Generuje gotową narrację dla C-levelu, tłumacząc w ludzki sposób dlaczego tradycyjna kanibalizacja i ROAS kłamią, i dlaczego potrzebny jest iROAS. Oraz posiada ukrytą, podpowierzchniową fukcję *Demand Forecast* badającą trend Google Search.

---

### Nazwa operacji/zadania: Dekonstrukcja Prawdy i Wyliczanie True Net Margin

**Po co to jest? (Cel biznesowy):** Operacja ta niszczy zakłamanie klasycznego ROASu. Wylicza realną rentowność jednostkową produktu (Net Margin). Służy obronie zysku firmy przed "przepalaniem" budżetu w nieświadomości prawdziwych kosztów własnych. **Gdzie to znaleźć? (Lokalizacja UI):** W panelu "Nexus Sentinel", główne pole wyszukiwania po prawej stronie na ciemnym górnym pasku, z ikonką lupy: **"Wpisz EAN / SKU..."**. **Wymagania wstępne (Wiedza z kodu):** Rygor\! Prócz 13-cyfrowego numeru EAN (np. nasz testowy 8809822541003), wybrany towar MUSI MIEĆ BEZWZGLĘDNIE wprowadzone wartości w zakładce PIM (Prisma DB: basePrice \> 0, packagingCost). Jeśli PIM jest pusty, wpadniesz w czerwoną matnię: PIM\_INCOMPLETE\_DATA. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij lewym przyciskiem myszy na górne pole tekstowe.  
2. Wpisz EAN towaru z udokumentowanymi kosztami (w symulacji 8809822541003).  
3. Kliknij krwisto-czerwony guzik: **"Skanuj"**.  
4. Przycisk zmieni się na "Analizowanie...", po czym wybudzi pełen interfejs statystyk. **Wynik operacji (Output):** Przy udanym strzale do PIM, pod statystyką z wyświetlonym statusem zielonej weryfikacji *(PIM: 100% ZWERYFIKOWANE KOSZTY)*, pojawiają się 4 neonowe karty. Odkryta zostaje liczba: **True Net Margin** (w teście wyniosła 30.43%).

---

### Nazwa operacji/zadania: Weryfikacja Dowodów (Wodospad Kosztów)

**Po co to jest? (Cel biznesowy):** Mechanizm wizualizujący przed zarządem łańcuch strat operacyjnych. Gdzie dokładnie sprzedany za 100 PLN produkt topi swoje "procenty" po drodze na konto sklepu (Podatki, Allegro, Kartony, Reklamy). **Gdzie to znaleźć? (Lokalizacja UI):** Lewy dolny róg w pełni wyrenderowanego raportu, wykres zatytułowany "Dowód nr 1: Wodospad Kosztów (Unit Economics)". **Wymagania wstępne (Wiedza z kodu):** Zakończona sukcesem Dekonstrukcja Prawdy. **Jak to użyć? (Instrukcja Krok po Kroku):** Skieruj się w lewy dolny kwadrat ekranu i najedź myszką na słupki pod zwiastunem: "Demaskujemy ukryte opłaty przed Zarządem". **Wynik operacji (Output):** Potężny zrzut wykresu słupkowego Recharts, schodzący progresywnie w dół niczym wodospad. Każdy obcięty koszt (Prowizja Allegro, COGS, Logistyka & BDO) jest odejmowany na żywo z grafu, aż nie uderzy w dno pokazujące faktyczny twardy zysk jednostkowy (Twardy Zysk Netto).  
---

### Nazwa operacji/zadania: Estymacja Zysku Krzyżowego i Kanibalizacji

**Po co to jest? (Cel biznesowy):** Moduł obala mit tradycyjnych kampanii pokazując wskaźnik iROAS. Tłumaczy sytuację, w której produkt jest na papierze rzekomo stratny, ale jest masowo do-kupywany razem z bardzo zyskownym produktem z innej marki, budując łączny wielki ROI koszyka (tzw. Halo Effect). **Gdzie to znaleźć? (Lokalizacja UI):** Kafelki: "Zysk Halo (Cross-sell)", "Dowód nr 2: Wskaźnik Kanibalizacji Zestawów", "Raport Gotowy dla Sceptyków". **Wymagania wstępne (Wiedza z kodu):** Przejście zabezpieczeń początkowych. Moduł wykorzystuje silnik łączący API bazy zamówień ze spłaszczaniem koszyków, szukając asocjacji w ostatnich 100 operacjach rynkowych. **Jak to użyć? (Instrukcja Krok po Kroku):** Generuje się automatycznie bez dodatkowych kliknięć po uruchomieniu Skanu EANu. **Wynik operacji (Output):** Środowisko testowe zademonstrowało absolutny rygor matematyczny Nexusa. Gdy AI odnotowało brak stabilnego Data Warehouse by w 100% potwierdzić estymacje asocjacji sprzedażowych, na ekranie kanibalizacji pojawił się wielki napis: **"Brak Danych Historycznych"** z podpisem: *System nie zgaduje.* Model Narratora AI wykreślił zaś zdanie we własnym panelu: *"Zysk Krzyżowy nie może zostać na chwilę obecną wyliczony (...) Estymacje stałe zostały wyłączone w celu zachowania rygoru danych."*. System blokuje optymistyczne wykresy w ułamku sekundy, wymuszając operacje wyłącznie na twardych liczbach.

6\. \*\*Kampanie (Centrum Promocji)\*\*  
   \* Kalendarz Promocji i Oś Czasu  
   \* Hierarchiczne Budżetowanie (Agency, Media, POSM)

# Dokumentacja Operacyjna: Kampanie (Centrum Promocji)

## 1\. Zmiana Horyzontu Czasowego (Gantt/Timeline)

**Nazwa operacji/zadania:** Przełączanie skali osi czasu (Filtry: 4 Tygodnie / Kwartał / Rok) **Po co to jest? (Cel biznesowy):** Pozwala menedżerom i dyrektorom marketingu na kontrolowanie gęstości zaplanowanych aktywacji w czasie. Chroni przed zjawiskiem kanibalizacji promocji (zbyt wiele akcji naraz) oraz ułatwia planowanie długoterminowe. **Gdzie to znaleźć? (Lokalizacja UI):** Górny pasek narzędziowy w widoku "Centrum Promocji" \-\> Pierwsza grupa przycisków po lewej stronie. **Wymagania wstępne (Wiedza z kodu):** Żadne. Funkcja działa natychmiastowo na wczytanym do przeglądarki zbiorze danych. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Zaloguj się i przejdź do "Centrum Kampanii" (ikona megafonu).  
2. Na górnym pasku kliknij jeden z przycisków: 4 Tygodnie, Kwartał lub Rok. **Wynik operacji (Output):** Oś czasu błyskawicznie się przelicza (zmienia się parametr pixelsPerDay w kodzie). Widok przechodzi z dokładnych widoków dniowych (4 tygodnie), przez tygodniowe (Kwartał \- np. T19, T20), aż po bloki miesięczne (Rok), elastycznie rozszerzając lub zwężając wyrysowane paski kampanii.

---

## 2\. Zmiana Kontekstu Biznesowego (Typ Podmiotu)

**Nazwa operacji/zadania:** Przełączanie struktury wyświetlania (Własna Marka / Kontrahent / Mix) **Po co to jest? (Cel biznesowy):** Moduł potrafi zarządzać zarówno markami własnymi z katalogu PIM, jak i wspierać zewnętrzne kampanie B2B dla kontrahentów (z bazy CRM). Operacja pozwala odfiltrować szum informacyjny i skupić się tylko na określonym obszarze biznesu. **Gdzie to znaleźć? (Lokalizacja UI):** Górny pasek narzędziowy \-\> Druga grupa przycisków w centrum. **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi wiedzieć, że zmiana tych opcji całkowicie przebudowuje wiersze na osi (oś Y). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij Własna Marka, aby na osi Y pojawiły się marki kosmetyczne.  
2. Kliknij Kontrahent (CRM), aby na osi Y pojawiły się sieci detaliczne i partnerzy.  
3. Kliknij Obydwa (Mix), aby zobaczyć matrycę połączeń (np. marka X u kontrahenta Y). **Wynik operacji (Output):** Lewa kolumna interfejsu (nagłówki wierszy) natychmiast zmienia opisy (np. z "Marka Kosmetyczna" na "Kontrahent B2B"), a kafelki kampanii przeskakują na właściwe tory zgodne z ich powiązaniami relacyjnymi w bazie.

---

## 3\. Inicjacja Nowej Osi Kampanii

**Nazwa operacji/zadania:** Tworzenie i budżetowanie nowej kampanii promocyjnej **Po co to jest? (Cel biznesowy):** Służy do zaplanowania nowej aktywacji marketingowej, rezerwacji budżetu i przydzielenia ról wykonawczych (delegacji do odpowiednich działów). **Gdzie to znaleźć? (Lokalizacja UI):** Czarny przycisk z ikoną "+" w prawym górnym rogu ekranu ("Dodaj Oś Kampanii"). **Wymagania wstępne (Wiedza z kodu):**

* Użytkownik musi mieć rolę **ADMIN**, **PREZES** lub pracować w departamencie **MARKETING** (blokada po stronie kontrolera: hasMarketingRights).  
* Przed wejściem do kreatora należy znać ramy czasowe, dysponować budżetem całkowitym oraz wiedzieć, jakiej marki (z PIM) lub jakiego kontrahenta (z CRM) będzie dotyczyć akcja. **Jak to użyć? (Instrukcja Krok po Kroku):**  
1. Kliknij przycisk Dodaj Oś Kampanii.  
2. W wyskakującym oknie wypełnij pole "Nazwa Wyświetlana Kampanii".  
3. Wybierz kolor identyfikacyjny kampanii (np. różowy, niebieski).  
4. W sekcji "Asortyment PIM" wybierz z listy rozwijanej (MultiSelect) odpowiednie marki oraz docelowego klienta CRM.  
5. Ustal "Datę Startu" i "Datę Końca".  
6. Wpisz wymaganą wartość w polu "Budżet Całkowity" (opcjonalnie rozbij ją na Media, POSM, Agencję).  
7. Zaznacz działy/osoby (checkboxy w "Przydziały"), które mają zająć się realizacją.  
8. Kliknij mocny, różowy przycisk Wygeneruj Oś Kampanii. **Wynik operacji (Output):** System wysyła zapytanie POST na backend, odświeża główną tablicę (timeline) i modal zostaje zamknięty. Na odpowiedniej dacie na osi czasu wyrasta nowy kafelek reprezentujący zaplanowaną promocję wraz z widocznym statusem "Planowana".

---

## 4\. Weryfikacja Statusu i Szczegółów (Details Drawer)

**Nazwa operacji/zadania:** Podgląd parametrów i operacyjna "Karta Kampanii" **Po co to jest? (Cel biznesowy):** Dostarcza analitykom i opiekunom marek pełen przekrój "zdrowia" kampanii (tzw. God-Mode dla pojedynczej aktywacji) – od wykorzystania budżetu po realizację postulatów sprzedażowych w czasie rzeczywistym. **Gdzie to znaleźć? (Lokalizacja UI):** Pojawia się po kliknięciu w dowolny, kolorowy pasek (kafelek kampanii) leżący na osi czasu. **Wymagania wstępne (Wiedza z kodu):** System filtruje i ładuje powiązane z kampanią zadania (Tasks). Konieczne jest, by kampania miała ustawione ID, a system mógł powiązać ją z tablicą Kanban. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Najedź na kafelek kampanii na timeline i kliknij lewym przyciskiem myszy.  
2. Z prawej strony ekranu wysunie się płynnie wielki boczny panel (Drawer).  
3. Przewijaj ekran, aby sprawdzić wytyczne w polu "Instrukcje dla Handlowców", listę realizowanych pod-zadań z Kanbana oraz chat kampanijny. **Wynik operacji (Output):** Ekran zostaje w połowie przysłonięty Drawerem, który dynamicznie ładuje topowe KPI (budżet, markę, wolumen sprzedany vs założony). Użytkownik widzi pełną "teczkę" projektu operacyjnego.

---

## 5\. Rozliczenie i Zamknięcie Kampanii

**Nazwa operacji/zadania:** Zakończenie i ostateczne rozliczenie sprzedaży ("Rozlicz") **Po co to jest? (Cel biznesowy):** Zamknięcie pętli zdarzeń. Funkcja zatwierdza wykonanie aktywacji, mrozi budżety, ewidencjonuje sprzedane SKU i zmienia status, aby kampania mogła służyć w module analitycznym (np. ROI, efekt Halo). **Gdzie to znaleźć? (Lokalizacja UI):** Prawy wysuwany panel (Drawer) szczegółów \-\> duży, zielonkawy komponent "Realizacja Celu Sprzedaży" \-\> przycisk Rozlicz. **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi być pewny, że kampania fizycznie dobiegła końca, ponieważ status zmieni się permanentnie, wpływając na widoczność kampanii na osi (ukrycie pod domyślnym filtrem "Status: Aktywne"). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij na kampanię, aby otworzyć panel boczny.  
2. W górnym prawym obszarze znajdź kafelek z KPI sprzedażowym.  
3. Kliknij przycisk Rozlicz. (Uwaga: aktualnie operacja ta wymaga dalszej integracji backendowej/analitycznej do sfinalizowania całkowitego przepływu, UI przygotowane). **Wynik operacji (Output):** (Docelowo) Kampania zmienia flagę statusową na "Zakończona", zwalniane są zasoby blokowane na magazynie w systemach WMS/Subiekt, a sam kafelek znika z głównego widoku "Aktywnych" osi czasu.

---

## 6\. Integracja Materiałów Wizualnych (POSM)

**Nazwa operacji/zadania:** Upload fizycznych i cyfrowych materiałów kampanijnych **Po co to jest? (Cel biznesowy):** Zabezpieczenie śladu rewizyjnego. Służy do gromadzenia kreacji graficznych, zdjęć z montażu półek czy zaakceptowanych naklejek w jednym miejscu, powiązanym bezpośrednio z osią czasu kampanii (SSoT \- Single Source of Truth). **Gdzie to znaleźć? (Lokalizacja UI):** Drawer szczegółów kampanii \-\> Prawa kolumna boczna \-\> Sekcja "Materiały POSM" \-\> Przycisk \+ Wgraj Plik. **Wymagania wstępne (Wiedza z kodu):**

* Użytkownik nie może być członkiem działu **HANDLOWCY** (w kodzie znajduje się blokada: if (req.user.department \=== 'HANDLOWCY') return res.status(403)).  
* Użytkownik musi mieć na dysku przygotowany plik (zdjęcie, grafikę), który fizycznie zostanie z-uploadowany do chmury Supabase. **Jak to użyć? (Instrukcja Krok po Kroku):**  
1. Po otwarciu kampanii przewiń do sekcji "Materiały POSM" w prawej kolumnie.  
2. Kliknij przerywany przycisk \+ Wgraj Plik.  
3. Wybierz plik ze swojego komputera w oknie dialogowym systemu.  
4. Zatwierdź wgrywanie. **Wynik operacji (Output):** Otwiera się natywne okno wyboru plików systemu Windows. Po wybraniu pliku system wysyła go do bucketu nexus-files na Supabase. Backend zwraca publicUrl pliku i łączy go (jako tzw. Asset) z rekordem bieżącej kampanii. W interfejsie pojawi się miniatura lub nazwa dodanego materiału reklamowego. Zespół dysponuje scentralizowanym miejscem wymiany plików projektowych.

7\. \*\*Projekty (Zarządzanie Portfelem Operacyjnym)\*\*  
   \* Śledzenie Postępów  
   \* Rozliczanie Ownerów i PMów

# Dokumentacja Operacyjna: Projekty (Zarządzanie Portfelem Operacyjnym)

## 1\. Przegląd Portfela Projektów (Karty Operacyjne)

**Nazwa operacji/zadania:** Przegląd wszystkich aktywnych jednostek projektowych w systemie. **Po co to jest? (Cel biznesowy):** Pozwala to kadrze zarządzającej (Zarząd, PM) na błyskawiczną ocenę portfolio ("helikopter view"). Rozwiązuje problem braku widoczności na co firma aktualnie przepala roboczogodziny. **Gdzie to znaleźć? (Lokalizacja UI):** Menu boczne (Sidebar) \-\> Ikona ciemnozielonego folderu (Moduł "Projekty"). **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi posiadać uprawnienie dostępu do modułu projects (nadawane w panelu Admina w polu accessibleModules). Aby widzieć dany projekt, użytkownik musi być przypisany do niego, lub posiadać rolę ADMIN/PREZES. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij w ikonę folderu na lewym pasku nawigacji.  
2. Na ekranie głównym pojawią się "Karty Projektów" (np. "Optymalizacja Magazynu").  
3. Bez klikania w nic, odczytaj wizualny "Postęp Realizacji" (widoczny jako procent i kolorowy pasek u dołu każdej karty) oraz ikony avatarów osób realizujących zadania. **Wynik operacji (Output):** Otrzymujesz natychmiastowy obraz kondycji całej organizacji. Projekty ładują się dynamicznie wyliczając progres w locie (na bazie stosunku zamkniętych zadań DONE do wszystkich zadań powiązanych ID-kiem z tym projektem).

---

## 2\. Inicjacja Nowego Projektu (Konfiguracja Pustego Koszyka)

**Nazwa operacji/zadania:** Tworzenie nowej jednostki projektowej (Nowy Projekt). **Po co to jest? (Cel biznesowy):** Utworzenie centralnego "pojemnika" (koszyka), do którego będzie można delegować zadania, przypisywać budżet i zespół. **Gdzie to znaleźć? (Lokalizacja UI):** Widok Projektów \-\> Górny pasek \-\> Czarny przycisk \+ Nowy Projekt. **Wymagania wstępne (Wiedza z kodu):** Dostępne WYŁĄCZNIE dla użytkowników z twardo zapisaną w kodzie rolą ADMIN. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij prawym, górnym rogu w czarny przycisk \+ Nowy Projekt. *(UWAGA WYNIKAJĄCA Z TESTÓW EMPIRYCZNYCH W PRZEGLĄDARCE: W aktualnej wersji systemu, przycisk uderza w zmienną setIsNewProjectModalOpen(true), jednak sam interfejs modala nie jest wyrenderowany w głównej pętli App.jsx. Oznacza to, że z poziomu UI stworzenie projektu jest w tym momencie zablokowane i odbywa się bezinterfejsowo lub za pośrednictwem API. Przycisk klika się "na pusto").* **Wynik operacji (Output):** Na ten moment, operacja nie wywołuje modala w interfejsie przeglądarkowym.

---

## 3\. Szczegółowa Weryfikacja Projektu i Rozliczanie (God-Mode PM)

**Nazwa operacji/zadania:** Otwarcie panelu kontrolnego danego projektu i rozliczenie postępów. **Po co to jest? (Cel biznesowy):** Pozwala to Project Managerowi lub Sponsorowi Projektu na zajrzenie do "środka" konkretnego przedsięwzięcia. Rozwiązuje problem accountability (odpowiedzialności) – wiadomo, na kim wisi dany problem i dlaczego projekt stoi w miejscu. **Gdzie to znaleźć? (Lokalizacja UI):** Widok Projektów \-\> Kliknięcie na wybraną kartę projektu. **Wymagania wstępne (Wiedza z kodu):** Użytkownik, o ile nie jest ADMINEM, musi być zdefiniowany w bazie jako ownerId (Sponsor) lub pmId (Project Manager) dla tego konkretnego projektu, aby móc nim zarządzać (weryfikacja na backendzie w projects.controller.js). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Nakieruj kursor na kartę interesującego Cię projektu.  
2. Kliknij w nią lewym przyciskiem myszy.  
3. Po prawej stronie wysunie się zgrabny boczny panel (Drawer).  
4. Przeanalizuj trzy główne kafle statystyczne na samej górze: **Zasoby** (liczba wszystkich zdefiniowanych zadań), **Ukończono** (ile zadań ma flagę DONE) oraz **Postęp** (procentowa wartość wykonania).  
5. Zjedź niżej do sekcji "Zespół Dedykowany", by zobaczyć jakie departamenty są aktualnie utylizowane. **Wynik operacji (Output):** Panel boczny generuje wyczerpujący raport. Cały "zespół dedykowany" jest składany dynamicznie poprzez wylistowanie z bazy unikalnych osób pracujących nad przypisanymi do tego projektu zadaniami.

---

## 4\. Dodawanie Nowych Mocy Przerobowych (Alokacja Zadań)

**Nazwa operacji/zadania:** Rozbijanie projektu na mikrozadania i dorzucanie pracy do koszyka. **Po co to jest? (Cel biznesowy):** Poprawne rozłożenie ciężaru pracy. Zamiast ogromnego zadania "Wdrożyć system", dzielimy to na "Zrobić A", "Zrobić B". **Gdzie to znaleźć? (Lokalizacja UI):** Globalny przycisk na głównym górnym pasku nawigacyjnym (dostępny z każdego miejsca w systemie) \-\> \+ Nowe Zadanie. **Wymagania wstępne (Wiedza z kodu):** Projekt, do którego chcesz wrzucić zadanie, musi już istnieć i być widoczny na liście wyboru w module Kanban. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij na niebieski przycisk \+ Nowe Zadanie na samej górze, obok Twojego awatara.  
2. W wyskakującym modalu, w polu "Powiązanie Systemowe (Rodzic)" odszukaj pole wyboru projektu.  
3. Przypnij zadanie z rozwijanej listy "Przypisz do Projektu..." (wybierz np. "Optymalizacja Magazynu").  
4. Uzupełnij resztę formularza zadania (Tytuł, Departament, Operator).  
5. Kliknij na samym dole przycisk "Zatwierdź i Utwórz (Dispatch)". **Wynik operacji (Output):** Operacja zamyka modal, system powiadamia przez WebSockety o nowym zadaniu, a wartość na liczniku wskaźnika "Zasoby" w Drawerze Projektu zwiększa się o 1 (tym samym tymczasowo obniżając ogólny wskaźnik "Postęp", bo doszło nowe zadanie nierozliczone).

---

## 5\. Komunikacja "Single Source of Truth" (Wątek Projektowy)

**Nazwa operacji/zadania:** Komunikacja i wymiana dyspozycji między PM-em a ownerem. **Po co to jest? (Cel biznesowy):** Uniknięcie silosów komunikacyjnych (maili i prywatnych chatów), gdzie gubi się decyzyjność. Wszystko, co dotyczy projektu, zostaje zapisane w jego dedykowanym "pokoju". **Gdzie to znaleźć? (Lokalizacja UI):** Drawer Projektu (po kliknięciu w kartę) \-\> Na samym dole, sekcja czatu "Tablica Główna Projektu". **Wymagania wstępne (Wiedza z kodu):** Inicjalizuje instancję komponentu UniversalChat w trybie mode="project". Wiadomości są powiązane bezpośrednio po projectId. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Otwórz panel wybranego projektu.  
2. Przewiń na sam dół.  
3. W polu wprowadzania tekstu wpisz np. "*Kiedy zamkniecie to konkretne zadanie z integracją magazynu?*".  
4. Naciśnij Enter lub ikonę wysyłania (papierowy samolot). **Wynik operacji (Output):** Tekst od razu pojawia się z datą i Twoim awatarem w widoku czatu. Wszyscy powiązani i przeglądający dany projekt otrzymują ping via Socket.IO z wiadomością o nowych wytycznych do projektu.

---

## 6\. Ostateczne Rozliczenie: Zamknięcie i Archiwizacja Projektu

**Nazwa operacji/zadania:** Definitywne zakończenie projektu operacyjnego ("Zakończ Projekt"). **Po co to jest? (Cel biznesowy):** Finalizacja projektu. Zdejmuje projekt z głównej listy operacyjnej firmy, aby zespół skupił się na nowych inicjatywach. **Gdzie to znaleźć? (Lokalizacja UI):** Drawer Projektu (po kliknięciu w kartę) \-\> Przewiń na sam dół, duży czarny przycisk z lewej strony czatu: Zakończ Projekt. **Wymagania wstępne (Wiedza z kodu):** Pamiętaj, że jest to **operacja bezpowrotna** z poziomu UI (włącza flagę isArchived: true na bazie danych). Należy ją wykonać tylko i wyłącznie, kiedy Postęp w statystykach wynosi 100%. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Wejdź w projekt, upewnij się, że "Postęp" \= 100%.  
2. Przewiń panel w dół.  
3. Kliknij duży czarny przycisk Zakończ Projekt.  
4. Przeglądarka wyświetli natywny alert ostrzegawczy: "Czy na pewno chcesz zakończyć ten projekt?".  
5. Kliknij OK. **Wynik operacji (Output):** Skrypt asynchronicznie uderza do API z requestem PATCH /api/projects/:id dodając ciało { status: 'ZAKOŃCZONY', isArchived: true }. Panel boczny (Drawer) automatycznie się zamyka. System przeładowuje dane z bazy (fetchData), a karta zamkniętego projektu fizycznie znika z widoku "Projekty Operacyjne", robiąc miejsce nowym zadaniom.

11:51 AM

8\. \*\*PIM (Product Information Management)\*\*  
   \* Katalog SKU i Indeks DQS (Data Quality Score)  
   \* Karty Produktów (Ekonomia, Logistyka ERP/WMS, Cechy)  
   \* Narzędzia AI "Interpoluj EAN" (Auto-generacja meta-danych)  
\\* Algopricing  
\* Prognoza AI  
\* Genreuj AEO

# Dokumentacja Techniczno-Eksploracyjna: Moduł PIM (Katalog SKU)

Poniższa dokumentacja stanowi kompletną syntezę Kroku 1 (Analiza logiki i modeli AI) oraz Kroku 2 (Empiryczne testy w środowisku żywego interfejsu).  
---

### Nazwa operacji/zadania: Inteligentne Wyszukiwanie Asortymentu (Wyszukiwarka AI)

**Po co to jest? (Cel biznesowy):** Pozwala użytkownikowi na filtrowanie bazy produktowej przy użyciu naturalnego języka. Rozwiązuje problem konieczności ręcznego przeszukiwania wielowymiarowych danych jakościowych (np. PXM). **Gdzie to znaleźć? (Lokalizacja UI):** W głównym oknie modułu "Katalog SKU" \-\> Pasek środkowy \-\> Szare pole tekstowe z ikonką błyskawicy i napisem *"Zapytaj AI np. 'braki PXM'..."*. **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi wprowadzić zapytanie testowe. System wysyła je na endpoint /api/products/ai-search. **Role i Zabezpieczenia Agentów AI (Krok 1):**

* **Model:** gemini-2.5-pro.  
* **Rola:** Inteligentny filtr mapujący naturalne zapytania na zredukowany obiekt JSON produktów.  
* **Ochrona przed halucynacjami:** Agent ma twardy prompt zakazujący formatowania (zero znaczników markdown). Musi zwrócić WYŁĄCZNIE tablicę ID (np. \["id1", "id2"\]). Backend nakłada dodatkowy try-catch podczas parsowania JSON. **Jak to użyć? (Instrukcja Krok po Kroku):**  
1. Kliknij w pole "Zapytaj AI...".  
2. Wpisz hasło testowe, np. braki.  
3. Kliknij przycisk *"Szukaj"*.  
4. UWAGA: Model ma zablokowaną możliwość formatowania Markdown, zwraca czystą tablicę ID do przefiltrowania tabeli. **Wynik operacji (Output):** Tabela natychmiast zawęża się – w teście zredukowała wyniki z 15 do 1 precyzyjnego rekordu (produkt: *Perły Serum do twarzy z Witaminą C*). Pojawia się mały przycisk "X" służący do resetowania filtra.

---

---

### Nazwa operacji/zadania: Symulacja Ceny i Rentowności (Kalkulator AlgoPricing)

**Po co to jest? (Cel biznesowy):** System ochrony finansowej sprzedawcy. Kalkuluje "True Cost" (baza, opakowania, transport, podatek BDO). Weryfikuje marżę względem prowizji Allegro (12%) i podatku VAT, w celu ustalenia ostatecznej sugerowanej ceny rynkowej. **Gdzie to znaleźć? (Lokalizacja UI):** Z prawej strony wiersza wybranego produktu, w kolumnie "Unit Economics" \-\> Przycisk *"AlgoPricing"* z symbolem kalkulatora. **Wymagania wstępne (Wiedza z kodu):** Z kodu pricing.service.js wynika istnienie "Ochrony Zaporowej" – jeśli system wyliczy, że masz zapas na krócej niż 7 dni, może wymusić sztuczne narzucenie \+15% marży. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij przycisk "AlgoPricing". Prawa strona ekranu wysunie się z szerokim oknem opcji.  
2. Przesuń suwak *"Sterowanie Marżą (%)"* (np. na poziom 57%).  
3. Naciśnij jasny przycisk *"Audyt Ryzyka"*.  
4. Obejrzyj komunikat, a następnie naciśnij *"Wylicz Ofertę"*. **Wynik operacji (Output):** Audyt zwrócił zielony box: *"Cena jest bezpieczna. Pokrywa wszystkie koszty, VAT i prowizję Allegro (12%)"* sugerując limit bezpieczeństwa na **42.81 PLN**. Z kolei moduł "Wylicz Ofertę" optymalizacyjnie zaproponował zmianę obecnej ceny z 22.99 na **17.99 PLN**, wyświetlając to ogromną czcionką z przyciskiem do nadpisania.

---

### Nazwa operacji/zadania: Przewidywanie Popytu (Prognoza AI)

**Po co to jest? (Cel biznesowy):** AI bada historyczną sprzedaż z 90 dni i łączy ją z Web Groundingiem (wyszukiwaniem w internecie np. pogody, świąt), wyliczając inteligentny zapas bezpieczeństwa ("Safety Stock"), by nie dopuścić do sytuacji out-of-stock. **Gdzie to znaleźć? (Lokalizacja UI):** W tabeli przy wybranym produkcie (sekcja Unit Economics) \-\> Ciemny przycisk *"Prognoza AI"*. **Wymagania wstępne (Wiedza z kodu):** Moduł działa bezobsługowo na podstwie endpointu /api/analytics/forecast/:id. **Role i Zabezpieczenia Agentów AI (Krok 1):**

* **Model:** gemini-3.1-pro-preview z aktywowanym narzędziem **Web Grounding** (tools: \[{ googleSearch: {} }\]).  
* **Rola:** "Agent Wywiadowczy" badający trendy, święta, pogodę i zachowania konkurencji w połączeniu z twardą historią z 90 dni (z BaseLinkerService).  
* **Ochrona przed halucynacjami:** Model musi zwrócić ścisły format JSON (zawierający confidenceScore). Posiada sztywną, zadaną z góry matematykę w prompcie: *"DODAJ do tej różnicy minimum 20% bufora (lub wartość dla bezpiecznych 14 dni sprzedaży), aby zapobiec pustej półce"*. **Jak to użyć? (Instrukcja Krok po Kroku):**  
1. Kliknij "Prognoza AI".  
2. Nie wykonuj żadnych akcji – czekaj, aż spinner z tekstem *"Inicjalizacja Modeli Gemini 3.1 Pro"* zniknie. **Wynik operacji (Output):** Operacja trwa ok. 45 sekund, po czym na ekranie ukazuje się pełnoekranowy dashboard:  
* Przewidywana sprzedaż (30 dni): **15 szt.**  
* Rekomendowane Domówienie: **\+6 szt.** (zapewniające bezpieczny 14-dniowy bufor z kodu).  
* Przewidywany przychód: **345 PLN**.  
* W komentarzu Analitycznym AI czytamy uzasadnienie decyzji modelu: *"Rosnące temperatury, nadchodzący Dzień Matki oraz aktywna kampania marketingowa wpłyną na popyt"*.

---

### Nazwa operacji/zadania: Optymalizacja Semantyczna (Generuj AEO)

**Po co to jest? (Cel biznesowy):** System Allegro Enrichment Optimizer. Przebudowuje on opis produktu tak, aby jego cechy techniczne i zalety były ustrukturyzowane w formacie preferowanym przez systemy rekomendacyjne LLM. **Gdzie to znaleźć? (Lokalizacja UI):** Ten sam obszar co powyżej (Unit Economics) \-\> przycisk w dolnej jego części *"Generuj AEO"*. **Wymagania wstępne (Wiedza z kodu):** Wymagany jedynie EAN oraz bazowy opis w PIM. **Role i Zabezpieczenia Agentów AI (Krok 1):**

* **Model / Usługa:** Centralny rdzeń AI w aiService.generateAEO.  
* **Rola:** Semantyczny reorganizator treści. Agent transformuje zwykłe opisy tekstowe i tabele cech w zoptymalizowaną gęstość słów kluczowych pod kątem wyszukiwarek sztucznej inteligencji. **Jak to użyć? (Instrukcja Krok po Kroku):**  
1. Znajdź przycisk "Generuj AEO" w wierszu produktu.  
2. Kliknij na niego.  
3. Zaakceptuj w wyskakującym okienku powiadomienie przeglądarkowe. **Wynik operacji (Output):** Przeglądarka wyświetla natywny alert o treści: *"Generowanie AEO dla: 8000137011742\. Proces może potrwać do 30 sekund. Kontynuować?"*. Po jego zatwierdzeniu przycisk w UI reaguje zmianą tekstu na *"Generuję..."*, a następnie w tle asynchronicznie przebudowuje metadane uderzając w /api/products/:id/aeo.

9\. \*\*Kontrahenci (CRM)\*\*  
   \* Ewidencja Podmiotów (NIP, KRS)  
   \* Drzewo Oddziałów (Magazyny, Centrale)

# Dokumentacja Techniczno-Eksploracyjna: Moduł Kontrahenci (CRM)

Niniejsza dokumentacja stanowi kompletną syntezę Kroku 1 (Analiza logiki backendowej, mechanizmu AutoFill) oraz Kroku 2 (Empiryczne testy na żywym organizmie w interfejsie). **Najważniejsze ustalenie architektoniczne:** Moduł ten nie używa Agentów AI – jest całkowicie wolny od halucynacji, opierając się na deterministycznym, rządowym API (Ministerstwo Finansów).  
---

### Nazwa operacji/zadania: Rejestracja Kontrahenta B2B z Automatyką GUS

**Po co to jest? (Cel biznesowy):** Moduł służy do szybkiego i całkowicie bezbłędnego rejestrowania podmiotów gospodarczych (klientów B2B lub dostawców). Zamiast przepisywać z dokumentów dziesiątki danych rejestrowych, system zaciąga je samodzielnie na podstawie samego NIP-u, gwarantując zgodność z państwową Białą Listą. **Gdzie to znaleźć? (Lokalizacja UI):** W głównym widoku /crm, nad listą kontrahentów (po lewej stronie) \-\> Przycisk z ikoną \+ (Plus) z tooltipem *"Zarejestruj nową"*. **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi posiadać poprawny **10-cyfrowy NIP**. **Zabezpieczenia Architektury (Krok 1):**

* **Brak Agentów AI:** Operacja działa bez udziału modeli językowych.  
* **Bezpośrednie API Rządowe:** Serwer w kodzie (crm.service.js) wywołuje żądanie fetch bezpośrednio do https://wl-api.mf.gov.pl/api/search/nip/ sprawdzając stan na dzisiejszy dzień.  
* **Ochrona:** Próba wpisania NIP-u ze spacjami/kreskami jest automatycznie korygowana przez wyrażenia regularne (replace(/\[\\s-\]/g, '')). Wpisanie nieprawidłowego numeru lub odrzucenie zapytania przez państwowy serwer generuje natychmiastowy alert na froncie.

**Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij przycisk \+ (Zarejestruj nową) na lewym panelu.  
2. W wysuniętym na środek oknie znajdź błękitną sekcję *"Automatyka GUS (Biała Lista)"*.  
3. W pole wpisz 10 cyfr NIP-u (w naszych testach użyliśmy NIP 5252344078).  
4. Kliknij przycisk *"Pobierz Dane"*. Po chwili wczytywania (status "Pobieram..."), pola poniżej uzupełnią się automatycznie.  
5. Przewiń formularz na sam dół i kliknij wielki czarny przycisk *"Zapisz Rekord Systemowy"*. **Wynik operacji (Output):** Po poprawnym uderzeniu do GUS, system wstrzyknął twarde dane do pól formularza: *Pełna Nazwa Kontrahenta* (GOOGLE POLAND SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ), *REGON* (140182840), *KRS* (0000240611). Ponadto w polu *Notatki o firmie* wklejono od razu adres siedziby (*RONDO IGNACEGO DASZYŃSKIEGO 2C, 00-843 WARSZAWA*). Po zapisaniu nowa firma pojawiła się na górze pionowej listy po lewej stronie i po jej kliknięciu, na pełnym ekranie po prawej załadował się szczegółowy dashboard podmiotu.

---

### Nazwa operacji/zadania: Definiowanie Punktu Logistycznego (Receptory / Oddziały)

**Po co to jest? (Cel biznesowy):** Kontrahent (np. wielka korporacja) często posiada jeden NIP, ale dziesiątki lokalizacji. Moduł Oddziałów pozwala precyzyjnie przypisać wiele adresów (Magazyn, Sklep, Biuro) do jednej, centralnej Firmy-Matki, co jest kluczowe dla poprawnych dyspozycji kurierskich ERP. **Gdzie to znaleźć? (Lokalizacja UI):** W dashboardzie wybranej firmy (prawy wielki panel), lewa kolumna pod nagłówkiem *"Receptory / Oddziały"* \-\> Fioletowy przycisk *"Dodaj Punkt"*. **Wymagania wstępne (Wiedza z kodu):** Należy najpierw wyszukać i kliknąć w odpowiednią firmę na liście po lewej stronie (aby jej id weszło do selectedCompany), w przeciwnym razie okno będzie puste z tekstem "Wybierz lub dodaj kontrahenta". **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Wybierz firmę z lewej kolumny (np. dodane wcześniej Google Poland).  
2. Kliknij napis *"Dodaj Punkt"*.  
3. W oknie formularza wpisz "Nazwę Rozpoznawczą" (np. Magazyn Warszawa).  
4. Z listy "Typ Obiektu" wybierz np. Magazyn Logistyczny lub zaznacz pole wyboru Jest Główną Siedzibą.  
5. Wypełnij pola adresu (Ulica, nr Domu, Kod Pocztowy, Miasto).  
6. Kliknij fioletowy przycisk *"Autoryzuj Powiązanie"*. **Wynik operacji (Output):** Nowy biały box pojawia się w sekcji "Adresy i Oddziały Kontrahenta" na karcie firmy. Prezentuje on wybrane dane: widoczny jest typ pogrubiony fioletową czcionką (Magazyn Logistyczny (Siedziba Główna)), oraz pełny adres dostawy dla logistyki.

---

### Nazwa operacji/zadania: Zarządzanie Wizytownikiem (Kontakt Osobisty)

**Po co to jest? (Cel biznesowy):** System łączy konkretnego człowieka (jego numer telefonu komórkowego i e-mail) z konkretnym oddziałem danej firmy. Dzięki temu Handlowiec z Nexus ERP nie dzwoni w ciemno na infolinię, tylko bezpośrednio do "Kierownika Magazynu Warszawa". **Gdzie to znaleźć? (Lokalizacja UI):** W dashboardzie wybranej firmy, prawa kolumna pod nagłówkiem *"Wizytownik"* \-\> Różowy przycisk *"Dodaj Kontakt"*. **Wymagania wstępne (Wiedza z kodu):** Podobnie jak przy oddziałach, rekord Główny Kontrahenta musi być utworzony i kliknięty. Do formularza przekazywane jest jego twarde companyId. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Na karcie kontrahenta kliknij przycisk *"Dodaj Kontakt"*.  
2. Wypełnij obligatoryjne pola *Imię* (np. Jan) i *Nazwisko* (np. Testowy).  
3. Z rozwijanej listy *"Przypisz do Ośrodka (Oddziału)"* możesz wybrać zdefiniowany w poprzednim kroku oddział (np. Magazyn Warszawa).  
4. Uzupełnij telefon, adres e-mail i Różowy przycisk *"Dodaj Do Wizytownika"*. **Wynik operacji (Output):** Na ekranie zagnieżdża się nowa belka kontaktu z wygenerowanym awatarem (inicjały "JT"). UI prezentuje imię, stanowisko oraz przypisany oddział (szary box "Magazyn Warszawa"), co potwierdza sprawność relacyjnej bazy danych i złączenie widoków bez przeładowywania strony. Pływające menu "edit/trash" ukryte pod zdarzeniem CSS hover umożliwia natychmiastowe usunięcie lub zmianę.

10\. \*\*Czat (Komunikacja & AI)\*\*  
    \* Kanały Zespołowe i Direct Messages  
    \* @Nexus AI Assistant (Zintegrowany bot przeszukujący BaseLinker z NLP)  
    \* Ogłoszenia Systemowe z Wymogiem Odczytu

# Dokumentacja Techniczno-Eksploracyjna: Moduł Czat (Komunikacja & AI)

Niniejsza dokumentacja jest wynikiem rygorystycznej inżynierii wstecznej i analizy kodu (m.in. UniversalChat.jsx, nexus-bot.service.js, announcements.service.js oraz ChatView.jsx). Moduł służy nie tylko jako komunikator dla pracowników, ale przede wszystkim jako interfejs do obsługi autonomicznego asystenta NeS.  
---

### Nazwa operacji/zadania: Komunikacja Zespołowa (Strumień Ogólny i Direct Messages)

**Po co to jest? (Cel biznesowy):** Narzędzie zastępuje zewnętrzne komunikatory (jak Slack czy Teams). Umożliwia asynchroniczną, bieżącą wymianę informacji między pracownikami lub globalne dyskusje w otwartym strumieniu, z zachowaniem pełnej poufności danych wewnątrz firmowego ERP. **Gdzie to znaleźć? (Lokalizacja UI):** Moduł "Komunikator" z lewego paska nawigacyjnego. Główny widok to lista kanałów (np. \# Kanał Ogólny) oraz lista aktywnych członków zespołu. **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi posiadać konto w systemie. Komponent UniversalChat działa na WebSockets (Socket.io) w czasie rzeczywistym i rozpoznaje odpowiednie konteksty (mode='global' lub mode='direct'). **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Wybierz kanał (np. \# Kanał Ogólny) lub konkretnego pracownika z listy.  
2. Kliknij na pole wprowadzania "Napisz do zespołu..." na dole ekranu.  
3. Wpisz wiadomość tekstową (możesz też włączyć tryb dyktowania głosowego klikając ikonę mikrofonu \- kod korzysta z Web Speech API).  
4. Wciśnij przycisk Wyślij (lub klawisz Enter). **Wynik operacji (Output \- Empiryczny Krok 2):** Wiadomość ("Cześć wszystkim, sprawdzam komunikator") natychmiast pojawia się na ekranie za sprawą eventu websocketowego (receive\_global\_message). Widoczny jest timestamp, inicjały/avatar autora oraz odpowiedni kolor dymku zależny od departamentu (np. fuksja dla zarządu).

---

### Nazwa operacji/zadania: Autonomiczny Asystent (Nexus AI / NeS)

**Po co to jest? (Cel biznesowy):** To "mózg" ERP. Pozwala wyciągać błyskawiczne dane ze skomplikowanych tabel i raportów poprzez naturalny język. Zamiast szukać w zakładkach, pracownik pisze zapytanie do bota, a ten przeszukuje lokalną bazę Prisma lub zewnętrzne API BaseLinkera. **Gdzie to znaleźć? (Lokalizacja UI):** Asystent jest dostępny "zawsze pod ręką" w dowolnym oknie rozmowy modułu Komunikatora. Wystarczy wywołać go znacznikiem @NeS. **Wymagania wstępne (Wiedza z kodu):** Użytkownik musi posiadać poprawny systemowy token uwierzytelnienia. W tle pracuje model gemini-3.1-pro-preview skonfigurowany w trybie zautomatyzowanego używania narzędzi (FunctionCallingMode: "AUTO"). **Zabezpieczenia i Role Agentów AI (Krok 1):**

* **Model:** gemini-3.1-pro-preview (z systemem automatycznego spadku \- *fallback* \- do gemini-2.5-pro w razie błędu 404).  
* **Rola:** Operacyjno-analityczna. Posiada bezpośredni dostęp do narzędzi: get\_system\_stats, query\_baselinker\_inventory, search\_crm\_companies oraz najpotężniejszego: execute\_dynamic\_prisma\_query (pozwalającego na odpytanie każdej tabeli bazy).  
* **Ochrona przed halucynacjami:** Posiada ścisłą instrukcję systemową nakazującą bezwzględną zwięzłość (zakaz pisania obszernych raportów, o ile wprost go nie poproszono).  
* **Optymalizacja TTS (Zabezpieczenie Dźwiękowe):** Model ma rygorystyczny zakaz używania formatowania tabelarycznego (psuło to Text-To-Speech) i **musi** zapisywać wszystkie liczby słownie (np. "dwóch influencerów" zamiast "2 influencerów"), co gwarantuje poprawną wymowę przez syntezator ElevenLabs. **Jak to użyć? (Instrukcja Krok po Kroku):**  
1. W polu czatu rozpocznij wiadomość od wywołania: @NeS.  
2. Sformułuj konkretne polecenie, np. *"@NeS podaj statystyki systemu"* lub *"@NeS przeszukaj magazyn BaseLinker dla zapytania: \[kod SKU\]"*.  
3. Zatwierdź wysłanie.  
4. Obserwuj interfejs: na ekranie pojawi się niebieski wskaźnik ładowania NeS (Nexus Sentinel) analizuje zapytanie... **Wynik operacji (Output \- Empiryczny Krok 2):** Bot przechwytuje kontekst, uaktywnia niebieską ikonę ładowania z animacją, a następnie po wykonaniu zapytań (Tool Calling) zwraca komunikat na czacie. Podczas testu na żywo na zapytanie *"@NeS podaj statystyki systemu"* bot udzielił następującej odpowiedzi odpytując bazę Prisma:

*"Aktywne projekty: jeden (1) Aktywne zadania: sześć (6) Aktywni użytkownicy: sześciu (6) Firmy w CRM: trzy (3) Influencerzy: dwudziestu dwóch (22) Kampanie: sześć (6) Szanse sprzedaży: dwie (2)"* Jak widać, model rygorystycznie zastosował się do "Zabezpieczeń Dźwiękowych" zdefiniowanych w Kroku 1 – wszystkie liczby zostały zmuszone do formy słownej pod dyktando syntezatora mowy (TTS), a tabele zablokowane.  
---

### Nazwa operacji/zadania: Ogłoszenia Systemowe z Wymogiem Odczytu

**Po co to jest? (Cel biznesowy):** Mechanizm gwarantuje, że kluczowe komunikaty Zarządu lub HR (np. zmiana regulaminu, nowy klucz do biura) zostały bezwzględnie przeczytane przez pracownika. Usuwa problem wymówek "nie widziałem e-maila". **Gdzie to znaleźć? (Lokalizacja UI):** W systemie frontendu pełnią rolę powiadomień priorytetowych. Panel dzwonka powiadomień na prawym górnym rogu ekranu, gdzie odkładają się również Alerty (np. "Zadanie zablokowane"). W komunikatorze powiadomienia wymuszają czerwoną ikonę \! przy Kanale Ogólnym. **Wymagania wstępne (Wiedza z kodu):** Backend definiuje ogłoszenia poprzez endpoint zarządzany w announcements.service.js. Istnieje twarde rozróżnienie w tabeli Prisma: isRequired: true. **Jak to użyć? (Instrukcja Krok po Kroku):**

1. Jako administrator publikujesz nowe powiadomienie poprzez odpowiedni endpoint z flagą priorytetu i wymagania akceptacji.  
2. Gdy zalogowany pracownik odbierze broadcast WebSockets, otrzyma powiadomienie.  
3. Użytkownik musi kliknąć przycisk typu Oznacz jako przeczytane (lub zamknąć dedykowany modal wymuszający akcję). **Wynik operacji (Output):** Akcja wywołuje metodę markAsRead(announcementId, userId), która dodaje twardy wpis do bazy danych (AnnouncementRead). Dzięki temu zapytanie serwerowe getUnreadMandatory(userId) przestaje zwracać dany monit, pozwalając pracownikowi kontynuować normalną pracę w ERP. Powiadomienie trafia do historii z logiem akceptacji.

11\. \*\*Admin (Panel Zarządzania)\*\*  
    \* Bezpieczeństwo i Baza Osobowościowa (Role)  
    \* Panel Zarządzania Kluczami API (AI, BaseLinker, Subiekt)  
    \* Action Logs (Audyt Operacji)  
Oto kompletny i rygorystyczny raport z eksploracji oraz inżynierii wstecznej modułu **Admin (Panel Zarządzania)**, zrealizowany zgodnie z Twoimi wytycznymi. Przeszedłem przez analizę kodu (Krok 1\) oraz fizyczne testy w przeglądarce w środowisku Nexus ERP (Krok 2).

Oto dokumentacja docelowa z Kroku 3 dla każdej z operacji:  
---

### Nazwa operacji/zadania: Dodawanie Nowego Operatora

**Po co to jest? (Cel biznesowy):** Moduł pozwala na wprowadzanie do systemu nowych pracowników, w pełni integrując ich z modelem kontroli dostępu (RBAC). Dzięki temu Administrator rygorystycznie decyduje, jakie moduły (np. CRM, Kampanie, PIM) będą dla nowej osoby widoczne, blokując możliwość wycieku wrażliwych danych operacyjnych.  
**Gdzie to znaleźć? (Lokalizacja UI):** Pasek boczny nawigacji (ikona Admina na samym dole) \-\> Panel Administracyjny \-\> Zakładka "Baza Osobowościowa" \-\> Górny, fioletowy przycisk z ikoną Plusa **"Nowy Operator"**.  
**Wymagania wstępne (Wiedza z kodu):** Musisz z góry zaplanować logikę dostępową: unikalny adres email, hasło logowania (przekazywane do bcrypt) oraz listę konkretnych ról i departamentów (np. "Handlowcy", "Zarząd"). Z poziomu kodu wymagane są konkretne wartości ról zdefiniowane jako string: ADMIN lub USER.  
**Jak to użyć? (Instrukcja Krok po Kroku):**

1. Będąc w zakładce "Baza Osobowościowa", kliknij fioletowy przycisk **"Nowy Operator"**.  
2. W nowo otwartym oknie uzupełnij pole **"Imię i Nazwisko / Login"** (np. Jan Kowalski).  
3. Podaj autentyczny (bądź testowy) **Adres Email** w odpowiednim formacie.  
4. Uzupełnij pole **"Hasło Startowe"** (nie jest widoczne, pod maską ••••••••).  
5. Z rozwijanej listy wybierz **Rolę Systemową** i **Departament**.  
6. Wyklikaj interaktywne etykiety (np. "Katalog SKU (PIM)", "Projekty"), nadając zezwolenia modułowe.  
7. Zakończ, klikając duży, fioletowy przycisk na dole: **"Stwórz Użytkownika"**. UWAGA: Pamiętaj, aby nie porzucać formularza za pomocą przycisku (X), jeśli już wpisujesz dane, bo wywoła to jedynie zamknięcie modala i utratę postępu.

**Wynik operacji (Output):** Formularz zamyka się płynnie. Użytkownik natychmiast pojawia się na widoku tabeli w sekcji "Kadra Pracownicza i Uprawnienia". Nowy pracownik może teraz zalogować się z użyciem podanego e-maila i hasła, widząc na ekranie Paska Bocznego (Sidebar) wyłącznie wybrane przez Ciebie ikony modułów.  
---

### Nazwa operacji/zadania: Modyfikacja Uprawnień Użytkownika

**Po co to jest? (Cel biznesowy):** Zapobiega rotacji martwych kont i umożliwia błyskawiczną aktualizację uprawnień. Jeżeli członek zespołu zmienia dział, dostaje awans albo musi zostać odcięty od modułu (np. Moduł Finansów MTool), można zmienić te parametry bez konieczności resetowania pracownika od zera.  
**Gdzie to znaleźć? (Lokalizacja UI):** Pasek boczny nawigacji (Admin) \-\> Panel Administracyjny \-\> Zakładka "Baza Osobowościowa" \-\> Kolumna "Zarządzanie" dla konkretnego wiersza pracownika \-\> Ikona **"Ustawienia / Koło Zębate"**.  
**Wymagania wstępne (Wiedza z kodu):** Nie możesz modyfikować identyfikatora (ID) użytkownika – edycja bazuje na mechanizmie PATCH /api/users/:id. Należy uważać na modyfikację swojego własnego konta na pozycję mniejszą niż ADMIN, bo zablokuje to późniejszy dostęp do tejże zakładki.  
**Jak to użyć? (Instrukcja Krok po Kroku):**

1. Odszukaj właściwą osobę w Tabeli Bazy Osobowościowej.  
2. Po prawej stronie w tabeli kliknij kwadratowy przycisk z symbolem Koła Zębatego.  
3. W wywołanym formularzu wyłącz (lub włącz) kliknięciem wybrane widoki.  
4. Zjedź na dół i kliknij ciemny przycisk **"Wykonaj Aktualizację w Bazie"**.

**Wynik operacji (Output):** System zapisuje preferencje do tabeli bazy Prisma i natychmiastowo przerysowuje układ w tabeli widoku, wizualizując dodane bądź usunięte flagi kolorystyczne modułów w kolumnie "Dostępne Moduły".  
---

### Nazwa operacji/zadania: Odzyskiwanie z Archiwum Zadań

**Po co to jest? (Cel biznesowy):** Moduł śledzący wszystkie ukończone w systemie zdarzenia z tablic (z Kanbana lub Projektów). Gwarantuje możliwość przywrócenia omyłkowo odrzuconego ticketa do głównej listy roboczej, realizując formę audytu pracy.  
**Gdzie to znaleźć? (Lokalizacja UI):** Pasek boczny nawigacji (Admin) \-\> Panel Administracyjny \-\> Górny, środkowy filtr nad tabelą: Przycisk **"Archiwum Zadań"**.  
**Wymagania wstępne (Wiedza z kodu):** Na ten ekran trafiają jedynie zablokowane operacyjnie zgłoszenia (np. odrzucone lub sfinalizowane). Z kodu jasno wynika, że kliknięcie przycisku dokonuje procedury odwrócenia archiwizacji poprzez wywołanie specyficznego endpoitu PATCH /api/tasks/{id}/restore.  
**Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij na filtr nad tabelami: **"Archiwum Zadań"** (ikona pudełka). Zmieni to aktualny widok.  
2. Zlokalizuj interesujące Cię, zamknięte zgłoszenie.  
3. W prawym marginesie tabeli, w kolumnie "Opcje Operacyjne", kliknij w zielony przycisk z ikoną zaokrąglonej strzałki: **"Przywróć na Tablicę"**.

**Wynik operacji (Output):** Dany wiersz ticketa natychmiastowo znika z tabeli "Archiwum Zadań", a zgłoszenie wraca na odpowiedni pulpit, jako gotowe do ponownej obróbki dla odpowiedniego działu.  
---

### Nazwa operacji/zadania: Konfiguracja Klucza BaseLinker

**Po co to jest? (Cel biznesowy):** Globalny interfejs administracyjny, który udostępnia środowisku aplikacyjnemu klucz (Personal Token X-BLToken) pozwalający na pobieranie EAN'ów, danych asortymentu i stanów magazynowych do optymalizacji ofert w tle.  
**Gdzie to znaleźć? (Lokalizacja UI):** Pasek boczny nawigacji (Admin) \-\> Panel Administracyjny \-\> Górny, prawy filtr nad tabelą: Przycisk **"Integracje API"**.  
**Wymagania wstępne (Wiedza z kodu):** Konieczne jest posiadanie pełnego, ciągłego tokenu tekstowego w formacie BaseLinkera (np. 1000000-xxxx-xxxx-xxxx-xxxxxxxxxxxx). Moduł operuje na endpointach systemowych (/api/settings) weryfikując rolę ADMIN serwera.  
**Jak to użyć? (Instrukcja Krok po Kroku):**

1. Kliknij na filtr nad tabelami: **"Integracje API"** (ikona chmury z błyskawicą).  
2. Otworzy się odrębny pulpit. Wklej poprawny ciąg tokena do białego pola wejściowego (oznaczonego 1000000-xxxx...).  
3. Kliknij ciemny przycisk tuż obok: **"Zapisz Klucz"**.

**Wynik operacji (Output):** Przycisk interaktywny "Zapisz Klucz" natychmiast zmienia swój wygląd i treść na "**Zapisano**" i wyświetla ikonę zielonego ptaszka (sukces). Informacja o nowym tokenie została podpięta pod infrastrukturę, otwierając modułom automatyzacji drogę do pobierania asortymentu PIM.  
---

\---

\#\#\# 🕸️ Kompletna Mapa Myśli / Architektura Zależności (Mermaid.js)

\`\`\`mermaid  
graph TD  
    classDef module fill:\#3b82f6,stroke:\#1e3a8a,stroke-width:2px,color:\#fff;  
    classDef core fill:\#10b981,stroke:\#047857,stroke-width:2px,color:\#fff;  
    classDef ai fill:\#8b5cf6,stroke:\#5b21b6,stroke-width:2px,color:\#fff;  
    classDef external fill:\#475569,stroke:\#1e293b,stroke-width:2px,color:\#fff;

    User\["👤 Użytkownicy / Zespoły"\]  
      
    %% KORE SYSTEMS (Data & Finances)  
    PIM\["📦 8\. PIM (Single Source of Truth)"\]:::core  
    CRM\["🏢 9\. CRM (Baza Kontrahentów)"\]:::core  
    Sentinel\["📊 5\. Sentinel (True Net Margin)"\]:::core

    %% OPERATIONAL MODULES  
    Kanban\["📋 1\. Tablica (Kanban)"\]:::module  
    Kampanie\["🎯 6\. Kampanie (Promocje)"\]:::module  
    Projekty\["📁 7\. Projekty (Długofalowe)"\]:::module  
    Admin\["⚙️ 11\. Admin (Panel & IDP)"\]:::module  
    Czat\["💬 10\. Czat (Komunikator P2P)"\]:::module  
      
    %% AI & OPTIMIZATION TOOLS  
    MTool\["🛠️ 2\. MTool (Kombajn Narzędziowy & ECO BOM)"\]:::ai  
    CMO\["🧠 4\. God-Mode CMO (Decyzje AI)"\]:::ai  
    Ads\["📈 3\. Mózg Ads (Allegro RL Bidding)"\]:::ai  
    NexusBot\["🤖 @Nexus AI Assistant"\]:::ai

    %% EXTERNAL APIS  
    External\["🌐 BaseLinker / Allegro API"\]:::external

    %% RELATIONS  
    User \--\>|"Inicjuje operacje"| Kanban  
    User \--\>|"Zarządza uprawnieniami"| Admin  
    User \--\>|"Komunikuje się"| Czat  
      
    Czat \<--\>|"Zapytania językiem naturalnym"| NexusBot  
    NexusBot \--\>|"Odczyt live (Stany/BDO)"| External  
      
    Kanban \--\>|"Zadania uderzają w"| Projekty  
    Kanban \--\>|"Zadania wspierają"| Kampanie  
    CRM \--\>|"Biorą udział w"| Kampanie  
      
    PIM \--\>|"Dostarcza COGS, Wagę, Wymiary"| MTool  
    MTool \--\>|"Przekazuje wyliczone koszty"| Sentinel  
    PIM \--\>|"Zasila bazę danych o produktach"| Sentinel  
      
    PIM \<--\>|"Wymienia EAN / Pobiera stock"| External  
      
    PIM \--\>|"Kategoryzuje na Lokomotywy/Wagony"| CMO  
    CMO \--\>|"Dyktuje taktykę reklamową"| Ads  
    Ads \--\>|"Optymalizuje stawki CPC"| External  
    Ads \--\>|"Raportuje spalony budżet do analityki"| Sentinel  
      
    Kampanie \--\>|"Pomniejszają zysk w"| Sentinel  
\`\`\`

\---

\#\#\# ⚙️ Ogólny Audyt Procesów Tła (Node-Cron & Event Bus)

W tle systemu, w oderwaniu od interfejsu graficznego (UI), działają ukryte serwisy odciążające pracowników. Znalazłem następujące mechanizmy zautomatyzowane:

1\. \*\*04:00 (Codziennie) \- \`Allegro Sentinel Deep Research\`\*\*:  
   Potężny proces AI z podpiętym \*Google Search Grounding\*. Bada na żywo sieć w poszukiwaniu nowych cenników CPM/CPC Allegro, regulaminów Smart\! i opłat prowizyjnych. W przypadku odnalezienia "twardych faktów", skrypt samodzielnie wysyła krytyczny komunikat push do kanału ogólnego na Czacie na ręce Zarządu.  
2\. \*\*06:00 (Codziennie) \- \`AI Sentinel Publisher\`\*\*:  
   Uruchomienie optymalizatora postów SMI (Social Media Influencer), który analizuje pogodę, ogólny kalendarz rynkowy i dostraja do nich wygenerowane teksty promocyjne zanim opublikuje "drop".  
3\. \*\*08:00 (Codziennie) \- \`Deadline Notifier\`\*\*:  
   Skrypt wysyłający do przydzielonych "Ownerów" zadań ostrzeżenia (Notifications API / WebSockets) o tym, że czas na wykonanie określonych tasków z Tablicy mija następnego dnia.  
4\. \*\*09:00 (Codziennie) \- \`Idle Task Freeze Alert\`\*\*:  
   Skrypt monitorujący wszystkie nierozwiązane tickety na Kanbanie. Jeśli zadanie nie było nawet edytowane przez ostatnie 24h, oflagowuje je ostrzeżeniem "Zamrożone".  
5\. \*\*Co Godzinę \- \`BaseLinker Deep Sync\`\*\*:  
   Pętla uderzająca na zapleczu do instancji API BaseLinkera, pobierająca zapasy magazynowe WMS/ERP oraz nowe numery EAN. W przypadku znalezienia rozbieżności, aktualizuje Single Source of Truth w PIM-ie i wysyła asynchroniczny alert przez Event Bus do połączonych klientów React.

\---

### Zaktualizowana Macierz Odpowiedzialności AI (Nexus ERP)

| Nazwa procesu w tle | Wyzwalacz (Trigger) | Zaangażowani Agenci AI | Przepływ zadania (Zależności, Bezpieczeństwo i Modele) |
| :---- | :---- | :---- | :---- |
| **1\. PXM Auto-Fill *(Uzupełnianie parametrów)*** | Przycisk "Auto-Fill" na karcie produktu (wywołanie API: POST /api/products/:id/autofill-params). | **1 Agent:** \- 1 Agent OSINT (Badacz Parametrów) | **Przepływ:** Pobiera EAN, nazwę i wymogi bazy (Prisma). Szuka specyfikacji technicznej w internecie (poza Allegro). Zwraca czysty JSON, który backend bezpośrednio zapisuje w bazie PIM. **Modele:** gemini-3.1-pro-preview (z googleSearch). |
| **2\. Bundle Orchestrator *(Sieć Tworzenia Zestawów)*** | Inicjacja "Szkicu Zestawu" w locie przez UI (moduł Portfolio Manager). | **Za to zadanie odpowiada 4 Agentów:** \- 1 Agent Graficzny \- 1 Agent Trendów SEO \- 1 Agent Copywriter \- 1 Agent Compliance (Audytor) | **Przepływ:** 1\. **Graficzny:** (Bez LLM) Skleja miniatury z bazy w jedną planszę. 2\. **Trendów:** Bada zapytania w Google i przekazuje wyciągnięte frazy. *(Wbudowano Tarczę Błędu: W razie wpadki Orkiestrator podmienia na bezpieczny Fallback)*. 3\. **Copywriter:** Otrzymuje bazowe opisy \+ trendy, generując kod HTML. *(Wbudowano Tarczę Błędu: Chroni HTML przed wylistowaniem złośliwego kodu)*. 4\. **Audytor:** Analizuje HTML od Copywritera pod kątem regulaminu Allegro i wycina zakazane zwroty. *(Wbudowano Tarczę Błędu: W razie ucięcia opisu, Orkiestrator wraca do wersji roboczej)*. **Modele:** gemini-3.1-pro-preview we wszystkich instancjach LLM oraz Sharp (Node.js). |
| **3\. Claid AI Photoshoot *(Generacja Scenografii 3D)*** | Akcja UI "Generuj Scenę" dla danego slotu galerii w systemie ofertowym. | **Za to zadanie odpowiada 2 Agentów:** \- 1 Agent Dyrektor Artystyczny (Analiza) \- 1 Agent Graficzny (API Claid) | **Przepływ:** Dyrektor Artystyczny pobiera specyfikację z PIM, analizuje trendy wizualne (CRO) w Google i losuje zmienne (Oświetlenie, Czas, Geometria). Zmienne te trafiają do Agenta Graficznego, który wycina tło i renderuje fotorealistyczną scenerię 8K. Gotowy obraz trafia do frontendu (Base64) z naniesionym wektorowo cieniem na serwerze. **Modele:** gemini-3.1-pro-preview (Dyrektor) \+ Claid AI v2 (Grafik) |
| **4\. Allegro Sentinel *(Deep Research Rynkowy)*** | Harmonogram tła (Cron: 04:00 rano) lub wyzwolenie ręczne przez interfejs POST /trigger. | **1 Agent:** \- 1 Agent Sentinel (Analityk Rynku E-commerce) | **Przepływ:** Wybudza się bez danych wejściowych z bazy. Używa Google Search do skanowania internetu w poszukiwaniu nowych opłat i zmian w regulaminach Allegro (Ads, Smart\!). Po wykryciu zmian wysyła ostrzeżenie poprzez szynę zdarzeń prosto na czat załogi (GlobalMessage). **Modele:** gemini-3.1-pro-preview (z googleSearch) *(Zaktualizowano z v2.5-pro)*. |
| **5\. E-Book Generator *(Zero-Cost Value Creator)*** | Przycisk w portfolio generujący cyfrowe gratisy do ofert ("Zero-Cost Value"). | **1 Agent:** \- 1 Agent Copywriter Masterclass | **Przepływ:** Pobiera nazwę i grupę docelową od użytkownika. Projektuje merytoryczny poradnik w kodzie HTML \+ CSS. Gotowy HTML jest renderowany do luksusowego formatu PDF przez ukrytą przeglądarkę na serwerze i udostępniany klientowi. **Modele:** gemini-3.1-pro-preview \+ Headless Chrome (Puppeteer). |
| **6\. Agent Badawczy *(INCI Intelligence)*** | Proces wewnątrz potoku ai.service.js (zbieranie wywiadu badawczego). | **1 Agent:** \- 1 Agent Ekspert Kosmetyczny | **Przepływ:** Bazując na Nazwie i EAN z PIM, surfuje po aptekach internetowych i szuka twardej specyfikacji chemicznej (INCI). Odnalezione fakty przekazuje jako surowy wsad tekstowy do systemów analitycznych. **Modele:** gemini-3.1-pro-preview (temperatura w tym procesie wynosi 0.2 \- anty-halucynacyjna). |
| **7\. AEO Content Generator *(Tworzenie Sekcji HTML)*** | Wysłanie prośby z UI na endpoint POST /api/products/:id/aeo. | **1 Agent:** \- 1 Agent Copywriter AEO | **Przepływ:** Agreguje surowe cechy, markę i stary opis z bazy. Rekonstruuje strukturę i wymyśla nowy lejek sprzedażowy (AEO) zapisując go w bazie, co uruchamia event przeładowujący frontend. **Modele:** gemini-3.1-pro-preview. |
| **8\. Agent Audytor Prawny *(Compliance Kosmetyczny)*** | Wywołanie programowe (generateComplianceReport) z poziomu innych usług. | **1 Agent:** \- 1 Agent Specjalista ds. Zgodności Prawnej | **Przepływ:** Bierze treść od innych agentów lub PIM. Zaczytuje plik systemowy SOT\_Baza\_Wiedzy\_Agenta.md z wgranym prawem UE (WE 1223/2009). Sprawdza tekst pod kątem zakazanych obietnic medycznych i zwraca poprawiony audyt tekstowy. **Modele:** gemini-3.1-pro-preview (temperatura: 0.0 \- bezwarunkowa faktuografia). |
| **9\. Native API Analytics *(Audyt Ofert Zewnętrznych)*** | Moduł Optymalizatora Ofert podczas analizy konkurencji na żywo. | **1 Agent:** \- 1 Agent Multimodalny Analityk API | **Przepływ:** Otrzymuje zrzut z zewnętrznych ofert konkurencji (Base64 obrazy \+ Tekst) i czyta instrukcje krok po kroku z inci\_knowledge.txt. Zwraca strukturyzowany JSON z oceną potencjału sprzedażowego. Zawiera twardy parser Auto-Repair naprawiający składnię w razie wycięcia nawiasów przez LLM. **Modele:** gemini-3.1-pro-preview (Tryb Multimodal). |
| **10\. AI Search *(PIM Smart Filtering)*** | Wpisanie intencji w wyszukiwarkę PIM (POST /api/products/ai-search). | **1 Agent:** \- 1 Agent Asystent Wyszukiwania | **Przepływ:** Analizuje tablicę surowych danych JSON z frontendu oraz naturalne zdanie użytkownika (np. "szampony z niską marżą"). W locie dopasowuje elementy i wypluwa backendowi same ID odfiltrowanych produktów. **Modele:** gemini-3.1-pro-preview *(Zaktualizowano z v2.5-pro)*. |
| **11\. NeS Bot (Wsparcie) *(Nexus Sentinel Bot)*** | Oznaczenie bota na czatach firmowych. | **1 Agent:** \- 1 Agent NeS | **Przepływ:** W przypadku błędu głównego serwera Gemini przyjmował zapytanie na słabszym modelu. Obecnie fallback działa na mocnym modelu z wyłączeniem Function Calling. **Modele:** gemini-3.1-pro-preview (Fallback aktualizacja). |

---

### 🛡️ Notatki Architektoniczne po Aktualizacji

1. **Całkowity Monolit LLM:** Cała platforma została formalnie odcięta od uboższych modeli typu 2.5-pro. Całkowicie przesunęliśmy ciężar wnioskowania w każdym najdrobniejszym procesie na gemini-3.1-pro-preview.  
2. **Kreatywność vs Determinizm (Temperatury):** Agent Prawnik i Agent Badawczy pracują na rygorystycznie ściętej temperaturze (0.0 do 0.2), nie pozwalając na twórczą licencję, podczas gdy Architekt Zestawów i Dyrektor Artystyczny "myślą" luźniej (0.6 \- 0.8).  
3. **Zasada Jednej Odpowiedzialności (SRP):** Konsekwentnie utrzymujemy odseparowanie i "wąską specjalizację" każdego Agenta. Nie zawracamy im głowy korektą błędów innych modeli.  
4. **Middleware "Tarcze Błędów":** W newralgicznym węźle, jakim jest **Bundle Orchestrator** (proces tworzący kompletne, zarabiające wirtualne półki), wbudowano logikę na poziomie Node.js. Jeśli jakikolwiek Agent wygeneruje pusty plik lub zwariuje, infrastruktura serwera podmienia tę jedną zmienną na bezpieczną treść (Fallback). Pozwala to kolejnemu Agentowi w łańcuchu otrzymać czytelne dane i ukończyć ofertę, chroniąc system przed całkowitym zacięciem.

---

### Nazwa operacji/zadania: Zero-Bleed Pipeline (Wdrożenie Operacyjne Agentów i Frontend)
**Po co to jest? (Cel biznesowy):** Implementacja asynchronicznych Agentów i potoków zabezpieczających szczelność finansową ERP wraz z centralnym hubem wizualnym do nadzoru.
**Gdzie to znaleźć? (Lokalizacja w kodzie):** 
- Backend: `src/modules/rma/rma.service.js`, `src/modules/logistics/logistics.service.js`, `src/core/cron.js`
- API Routy: `src/modules/rma/rma.routes.js`, `src/modules/logistics/logistics.routes.js`
- Frontend UI: `frontend/src/views/ZeroBleedHubView.jsx`, zintegrowane w `frontend/src/App.jsx`
**Wymagania wstępne (Wiedza z kodu):**
1. **Agent RMA Fraud Prevention:** Działa w CRON co 5 minut. Uderza do `getReturnJournalList` chroniąc limity (pobiera tylko delta od `lastLogId`). Konstruuje bazę kupujących z wyłudzeniami. Po 3 zwrotach (3 Strikes Rule) Agent automatycznie wykonuje żądanie API HTTP `/sale/blacklisted-users` i blokuje kupującego na koncie firmy na Allegro. Zabezpieczony dedykowanym widokiem w "Czarna Lista (RMA)".
2. **Agent Wirtualny Logistyk (Zaopatrzeniowiec):** Działa w CRON o 5:00 rano. Oblicza moment wyczerpania zapasu używając `leadTimeDays`. Uruchamia **Agenta Negocjatora**, który redaguje merytorycznego e-maila B2B do fabryki w celu odnowienia towaru (z prośbą o utrzymanie cen/rabatu). **Tarcza Błędów:** Mail nie wychodzi bezpośrednio – generuje gotowego Drafta jako zadanie `TODO` (Kanban), wymagając 1 kliknięcia od operatora. Widok stanu zaopatrzenia zmapowany w "Dostawcy B2B".
4. **Zero-Bleed Hub (UI):** Dedykowany, chowany widok w aplikacji (w lewym panelu minimalistycznym pod ikoną "Tarczy"), prezentujący zakładki dla RMA i Logistyki. Pozwala na audytowanie bazy "CustomerRiskProfile" i dziennika "ReturnRecord" w czasie rzeczywistym.

---

### Nazwa operacji/zadania: Moduł Kalendarza (Nexus Booking / Calendly-Clone)
**Po co to jest? (Cel biznesowy):** Implementacja profesjonalnego narzędzia do automatyzacji umawiania spotkań dla rekruterów i head hunterów z branży IT, podnoszącego prestiż oraz eliminującego wymianę e-maili ("back-and-forth").
**Gdzie to znaleźć? (Lokalizacja w kodzie):** 
- Modele BD: `MeetingAvailability`, `MeetingBooking` (w `prisma/schema.prisma`)
- Backend API: `src/modules/meetings/meetings.routes.js`, `src/modules/meetings/meetings.controller.js`
- Frontend UI: `frontend/src/views/PublicBookingView.jsx` (link publiczny `/book`), `frontend/src/views/MeetingDashboardView.jsx` (zarządzanie dla Admina).
**Wymagania wstępne (Wiedza z kodu):**
1. **Publiczny interfejs (/book):** Omija barierę logowania w `App.jsx`. Dynamicznie odpytuje endpoint `/api/meetings/public/availability`, który oblicza wolne sloty na podstawie grafiku pracy, odrzucając już zarezerwowane terminy (ochrona przed Double Booking).
2. **Integracja z Kanbanem:** Skuteczna rezerwacja spotkania przez rekrutera wywołuje systemowy event na `EventBus` (`CREATE_SYSTEM_TASK`), co automatycznie generuje na tablicy Kanban kartę zadania (PRIORITY: HIGH) z kompletem danych i opisem (JD).
3. **Zarządzanie (Meeting Dashboard):** Wewnętrzny panel ERP pozwala administratorowi definiować "Sloty" czasowe na poszczególne dni tygodnia oraz ręcznie odrzucać/zatwierdzać zapytania. Wprowadzono logikę auto-oczyszczania: zatwierdzone spotkania zyskują opcję "Odwołaj", a wszelkie zdarzenia o statusie `CANCELLED` są natychmiast filtrowane i permanentnie wyciszane z widoku tablicy, aby optymalizować przestrzeń analityczną ekranu.
4. **Integracja z Google Calendar API (Google Meet):** Wdrożono autentyczne generowanie linków w ekosystemie Google bez wymogu płatnej usługi Google Workspace. Serwer Node.js (przez moduł `google.meet.service.js` i pakiet `googleapis`) autoryzuje się na darmowym koncie (np. Gmail) za pomocą protokołu OAuth 2.0 (używając odświeżanego w tle `Refresh Token`). W momencie potwierdzenia rezerwacji, CRM wysyła bezobsługowo żądanie `POST` z parametrem `?conferenceDataVersion=1`. Serwery Google w odpowiedzi tworzą w kalendarzu wydarzenie i natychmiast zwracają wygenerowany `hangoutLink`. Uzyskany adres jest trwale zapisywany w bazie Prisma (kolumna `meetLink`) i od tej pory służy jako docelowy pokój telekonferencji. Funkcjonuje to całkowicie bez udziału administratora i bez limitów (dla spotkań 1:1 do 24 godzin). Zgodnie z bezwzględną polityką bezpieczeństwa i braku mocków/darmowych zamienników (No Free Alternatives), w przypadku braku konfiguracji kluczy (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN` w pliku `.env`), system nie uruchamia fałszywego zastępstwa Jitsi, lecz przerywa proces bezpiecznym wyjątkiem `throw new Error`, blokując halucynację procesu.

---

### Nazwa operacji/zadania: Rurociąg Autorefleksji (Automatyczne Wideo-CV)
**Po co to jest? (Cel biznesowy):** Mechanizm wizytówki rekrutacyjnej "Living CV". System Nexus autonomicznie opowiada o swoich funkcjach (procesy EAN, analityka Sentinel), korzystając z głosów AI oraz realistycznych, animowanych awatarów, a następnie sam składa wideo w całość, tworząc dowód integracji. Zabezpiecza przed halucynacjami UI.
**Gdzie to znaleźć? (Lokalizacja UI):** Moduł ukryty, operacje wywoływane przez skrypty w tle (katalog scripts/). Wynik ląduje w katalogu cv_assets/NES_CV_FINAL.mp4.
**Wymagania wstępne (Wiedza z kodu):** 
Potok składa się z 4 etapów:
1. Nagranie UI: Rejestracja ekranów działania systemu.
2. Generacja Audio (ElevenLabs API): Konwersja z SSML na mp3.
3. Generacja Awatara (HeyGen API): Awatar wideo z tłem do Chroma Key.
4. Postprodukcja (FFmpeg): Użycie filter_complex do dynamicznego kompozytowania (wycinanie green screen, efekty PiP, nakładanie podkładu wideo).

### Nazwa operacji/zadania: Mitygacja Zagrożeń Architektonicznych i Stabilizacja Wątków (Zadanie: poprawki.md)
**Po co to jest? (Cel biznesowy):** Eliminacja 6 krytycznych wąskich gardeł infrastrukturalnych (Event Loop blocking, Monolit DB, AI Cascade Failures, Brak świeżości BaseLinker, Halucynacje Medyczne, Słaby Scraper), które groziły załamaniem skalowalności i wiarygodności platformy w środowisku produkcyjnym. Wprowadzenie "Defensive AI".
**Gdzie to znaleźć? (Lokalizacja w kodzie):** 
- Nowe pliki systemowe: src/core/AsyncTaskQueue.js, src/core/cron.js
- Moduły ulepszone: src/modules/offer-optimizer/ai.service.js, src/modules/allegro-ads/allegro.economics.service.js, src/modules/portfolio-manager/portfolio.routes.js, src/server.js
**Wymagania wstępne (Wiedza z kodu):**
1. **Asynchroniczność (AsyncTaskQueue):** Generowanie e-booków przez Puppeteer nie obciąża już głównego wątku Express, tylko ląduje w rozproszonej kolejce w tle zwracając 202 Accepted.
2. **Defensive AI (Tarcza BaseLinker i Medyczna):** Algorytm tnący kampanie CPC na Allegro Ads sprawdza teraz product.updatedAt. Jeżeli sync > 15 min, zatrzymuje decyzje. Wprowadzono twardy słownik RegEx dla Agentów AI filtrujący medyczne oświadczenia (Compliance UE 1223/2009).
3. **Odciążenie OLTP:** Uruchomiono 
ode-cron odpalający się o 04:00 rano dla obliczeń True Net Margin (odciążenie bazy produkcyjnej w trakcie sesji).
4. **Semantyczny OSINT (Cheerio):** Agent badawczy używa teraz wielopoziomowego parsowania API/Semantycznego dla ekstrakcji danych z otwartych baz, z notyfikacją na EventBus w razie błędu struktury HTML. Dodano Exponential Backoff do API Gemini zapobiegając przerwaniom łańcucha przez Rate Limiting.

---

### Nazwa operacji/zadania: Architektura Zero-Bleed Pipeline (Fundament Bazodanowy)
**Po co to jest? (Cel biznesowy):** Wprowadzenie zintegrowanego ekosystemu do likwidacji wycieków finansowych w firmie. Moduł tworzy twarde struktury bazy danych Prisma dla Agentów operacyjnych: RMA (ochrona przed zwrotami/wyłudzeniami) oraz Virtual Logistics (zaopatrzenie B2B).
**Gdzie to znaleźć? (Lokalizacja w kodzie):** 
- Rozbudowa `prisma/schema.prisma` o nowe relacje.
**Wymagania wstępne (Wiedza z kodu):**
1. **Model `CustomerRiskProfile` (Fraud Prevention):** Tarcza anty-wyłudzeniowa. Zbiera dane kupujących z BaseLinkera. Posiada mechanikę "3 Strikes Rule" – na podstawie licznika `totalReturns` algorytm automatycznie wpycha klientów na czarną listę Allegro API (`isBlacklisted`).
2. **Model `ReturnRecord`:** Przechowuje "dziennik zdarzeń" (getJournal z API BaseLinker). Zapisuje powody zwrotów (`reason`) poddając je sentyment-analizie w celu natychmiastowego blokowania budżetów reklamowych (Ads) na wadliwe partie towarów.
3. **Modele `Supplier` i rozszerzenie `Product`:** Dodano `leadTimeDays` (wyliczenie czasu dostawy od producenta B2B) i zmapowano towary po `supplierId`. Fundament pod działanie Agenta Zaopatrzeniowca/Negocjatora, który zamawia dostawy tuż przed wyczerpaniem stocku z zapasem buforowym (Predictive Re-order Point).

---

### Nazwa operacji/zadania: Multitenancy SMTP (Spersonalizowane Skrzynki Pocztowe Pracowników)
**Po co to jest? (Cel biznesowy):** Moduł odchodzi od archaicznego używania pojedynczego systemowego maila z pliku `.env`. Pozwala na wysyłanie przez system Nexus wiadomości (np. potwierdzeń Google Meet z kalendarza) w imieniu konkretnego rekrutera/handlowca z jego własnego adresu i serwera SMTP (np. w OVH, Hostinger). Daje absolutną izolację i kontrolę bezpieczeństwa administratorowi nad pracownikami.
**Gdzie to znaleźć? (Lokalizacja UI):** 
Panel "Panel Administracyjny -> Kadra Pracownicza", modal Edycji operatora (Dostęp do edycji SMTP zablokowany wyłącznie dla ról `SUPER_ADMIN` i `ADMIN`).
**Wymagania wstępne (Wiedza z kodu):**
1. **Model `User` w Prisma:** Rozbudowany o kolumny `smtpHost`, `smtpPort`, `smtpUser`, `smtpPassword`. Hasła pracowników nie są przechowywane jawnym tekstem! Przechodzą obustronne szyfrowanie kryptograficzne w AES-256 używając klucza głównego serwera.
2. **Kryptografia (Defensive Tech):** Rdzeń `src/core/crypto.service.js` odpowiada za wstrzykiwanie unikalnego Inicjalizatora (IV) w hasło poczty. Zapobiega to całkowitemu wyciekowi skrzynek w przypadku naruszenia tabeli bazy danych.
3. **Dynamiczny Agent Pocztowy:** Usługa `meetings.email.service.js` przed próbą wysłania maila uderza asynchronicznie do bazy z zapytaniem o id aktywnego operatora generującego akcję. Deszyfruje jego poświadczenia w locie, w pamięci RAM, ładuje w transporter Nodemailer i niszczy wskaźnik do hasła. Posiada mechanizm Fallback do `.env` na wypadek pustej konfiguracji w profilu. Wdrożono twardą "Tarczę Błędów" (Defensive AI): automatyczną sanitizację portów (np. 463 -> 465) zabezpieczającą TLS (`secure`) oraz agresywny `connectionTimeout: 10000`, eliminujący zawieszanie pętli zdarzeń Node.js i odrzucenia 502/504 Bad Gateway na warstwie NGINX.

---

### Nazwa operacji/zadania: Nasłuch IMAP w tle (Real-Time IDLE Push)
**Po co to jest? (Cel biznesowy):** Alternatywa dla wbudowanego, ociężałego klienta e-mail w ERP. Chroni pracownika przed ciągłym sprawdzaniem poczty (Zimbra/Hostinger) poprzez automatyczne wysyłanie notyfikacji na żywo na ekran, gdy w jego indywidualnej skrzynce wyląduje nowa wiadomość.
**Gdzie to znaleźć? (Lokalizacja w kodzie):** 
- Nasłuch w tle: `src/modules/email/imap.listener.js` inicjowany przez `server.js` w momencie startu serwera oraz reagujący na zdarzenia EventBus.
**Wymagania wstępne (Wiedza z kodu):**
1. **Prawdziwy Real-Time (IDLE):** Skrypt zrezygnował z interwałowego sprawdzania poprzez Cron. Zamiast tego utrzymuje stałe połączenie TCP i nasłuchuje natywnego zdarzenia IMAP (`connection.on('mail')`). Moduł korzysta wyłącznie z `imap-simple`, który w locie parsuje nagłówki do natywnych obiektów JSON (nie ma potrzeby, ani możliwości parsowania ich przez zewnętrzny `mailparser`).
2. **Pamięć Stanu (Stateful):** Mechanizm `lastSeenUidMap` zapamiętuje ostatni odczytany e-mail (UID), by nie spamować użytkownika starymi mailami po każdym restarcie kontenera `node.js`. Przy pierwszym podłączeniu skrypt "uczy się" najwyższego UID bez wysyłania powiadomień.
3. **EventBus (Auto-Wznawianie):** Serwis jest całkowicie bezobsługowy. Subskrybuje szynę zdarzeń `UserSmtpConfigured` – gdy pracownik wpisze nowe hasło do skrzynki w ustawieniach, stare połączenie gniazda jest natychmiastowo niszczone, a w jego miejsce w locie zostaje zestawione nowe połączenie. Wykryta, nowa wiadomość zostaje natychmiast wypchnięta jako `new_notification` przez `Socket.IO`.

---

### Nazwa operacji/zadania: Zarządzanie Notyfikacjami i Centrum Dowodzenia ("Moja Tablica")
**Po co to jest? (Cel biznesowy):** Optymalizacja powrotu po urlopie (zapobiega rozpraszaniu i szukaniu swoich zadań po dziesiątkach modułów). Oferuje spersonalizowany widok początkowy oraz funkcjonalność "Inbox Zero" dla systemowych powiadomień.
**Gdzie to znaleźć? (Lokalizacja UI):** 
- Pasek Navbar: Rozwijany Dzwonek z akcjami Usuwania i Oznaczania (App.jsx).
- Nowy Moduł: `frontend/src/views/EmployeeDashboardView.jsx` ("Moja Tablica").
**Wymagania wstępne (Wiedza z kodu):**
1. **Zarządzanie stanami:** Nowe endpointy `PATCH /api/notifications/:id/status` i `DELETE /api/notifications/:id` w `notifications.controller.js` pozwalające na bez-przeładowaniową interakcję ze dzwoneczkiem z wykorzystaniem propagacji zdarzeń (`e.stopPropagation()`).
2. **Tablica Pracownika:** Moduł React agresywnie filtruje listę zadań globalnych (`tasks.filter(t => t.assignees.some(...))`), powiadomień i projektów, zamykając pracownika w "szklanej bańce" jego obowiązków. Górny pasek nawigacyjny wyświetla ikonę Tablicy jako domyślną zakładkę po zalogowaniu dla kont innych niż `ADMIN`.

---

11. **Moduł Rezerwacji Spotkań (Google Meet Integration)**
    * Usunięto przestarzałe logi (Tarcza Fallback) dotyczące mechanizmów awaryjnych Jitsi, ujednolicając system wokół Google Meet zgodnie z rygorem braku darmowych zamienników.
    * Zaimplementowano rygorystyczne łączenie z API Google Calendar v3 z wymuszoną flagą `conferenceDataVersion=1` oraz użyciem bloku `conferenceData` o typie `hangoutsMeet`.
    * Aplikacja tworzy oficjalne pokoje w Google Meet, zabezpieczając się przez dublowaniem (`requestId: booking.id`), wyciąga parametr `hangoutLink` i osadza we wiadomości E-mail. Dodatkowo zwraca nowo wygenerowany link z powrotem do UI Administratora natychmiast po wywołaniu.
    * Obsługa odwoływania spotkań: Zmiana statusu na `CANCELLED` automatycznie wysyła spersonalizowanego maila do Kandydata z powiadomieniem o anulowaniu.

12. **Moduł Powiadomień IMAP (Zimbra / OVH)**
    * Wdrożono stałą bazodanową Tarcze Błędów w pliku `imap.listener.js` rozwiązującą problem spamu (powielających się notyfikacji w dzwoneczku).
    * Nasłuch IMAP (`onmail`) przy każdym zerwaniu sesji IDLE i restarcie serwera sprawdza tabelę `Notification` po unikalnym kluczu `relatedTaskId: email-{uid}`, aby upewnić się, że nie powiadomił już wcześniej użytkownika o danej wiadomości, zamiast polegać na ulotnej pamięci RAM.

---

13. **Moduł RMA (Zero-Bleed Hub / Tarcza Anty-Wyłudzeniowa)**
    * Całkowicie przebudowano synchronizację z BaseLinkerem (Batch Fetching). Zamiast odpytywania dziennika co 5 minut za pomocą `getReturnJournalList` wprowadzono bezpieczny dla limitów interwał 12-godzinny oparty o metodę `getOrderReturns`.
    * Wdrożono asynchroniczne zasilanie wskaźnika zwrotów (`returnCount`) w tabeli `Product` na bazie twardego payloadu BaseLinkera (wzbogacając metryki PIM o twarde dane historyczne zwrotów).
    * Zmieniono architekturę decyzji o banicji na Allegro. Zablokowano ciche połączenia z twardym tokenem. Obecnie moduł w przypadku podejrzenia `fraudScore >= 100` oznacza klienta jako `WARNING` i wystawia sprawę do autoryzacji ręcznej poprzez przyciski **Zablokuj/Odrzuć** w dedykowanym komponencie `ZeroBleedHubView.jsx`. Zapewnia to 100% ludzkiej weryfikacji False Positives przed trwałym zbanowaniem kupującego.
    * Wdrożono "Zrzut Inicjalizacyjny" (In-Memory Throttle). W widoku dodano czerwony przycisk "Wymuś Audyt Historyczny", pozwalający na ręczne odpalenie asynchronicznej komendy `/api/rma/sync-history`. Proces na backendzie inteligentnie zwalnia zapytania (2000ms delay) aby nie niszczyć limitów BaseLinkera (Max 100/min), a frontend otrzymuje natychmiastowe zatwierdzenie.
    * Wdrożono Polling Stanu na Żywo. Frontend (komponent `ZeroBleedHubView.jsx`) odpytuje endpoint `/api/rma/sync-status` co 3 sekundy. Zapewnia to renderowanie asynchronicznego paska ładowania z informacją o liczbie przetworzonych rekordów oraz dacie. Uodparnia to proces na odświeżenie karty przeglądarki. Usunięto również błąd Nieskończonej Pętli Paginacji poprzez globalne inkrementowanie daty w logach (zamiast filtrowanego).
    * **[Poprawka Architektoniczna] Zabezpieczenie przed podwójnym naliczaniem (Idempotentność):** Wprowadzono twardy warunek sprawdzający `ReturnRecord.findUnique` przed inkrementacją liczników `fraudScore` oraz zwrotów na SKU. Chroni to moduł przed zbanowaniem klienta za jeden i ten sam zwrot w przypadku wymuszenia ponownej synchronizacji historycznej.
    * **[Poprawka Architektoniczna] Priorytetyzacja Tokena i Ochrona Pętli:** Przywrócono nadrzędność wstrzykiwanego przez środowisko serwerowe (PM2) `process.env.BASELINKER_TOKEN` nad testowym kluczem w bazie `SystemSetting`, co odblokowało pobieranie realnych danych z głównego konta. Wdrożono rygorystyczny mechanizm paginacji `getOrderReturns` przy użyciu wbudowanego w API parametru `date_from`, wymuszając przeskakiwanie do przodu (z inkrementacją o 1 sekundę) by uniknąć infinite loop. Zlikwidowano usterkę, przez którą stary kod ignorował czas i doprowadzał do pętli nieskończonej przepełniającej Node.js RAM.
    * **[Telemetria i Deep-Logging]:** Wdrożono agresywne logowanie całego przebiegu pętli w funkcji `syncReturnsFromBaselinker`. Proces komunikacji z API BaseLinkera jest teraz w pełni monitorowany w terminalu z prefixem `[RMA TELEMETRY]`, na bieżąco obnażając długość każdej paczki i datę przesunięcia paginacji, zapewniając transparentny raport działania mechanizmu (obrona przed "cichym zatrzymaniem").
    * **[Krytyczna Łata Paginacji]:** Dodano rzutowanie `parseInt(r.date_add, 10)` przed operacją arytmetyczną w `rma.service.js`. BaseLinker API zwraca czas jako String, co w połączeniu z `maxDateProcessed + 1` powodowało niejawną konkatenację (np. rok 2511) i zablokowanie paginacji po pierwszej paczce. Łata gwarantuje prawidłowe iteracje chronologiczne przy dużej ilości logów.

---

14. **Poprawki UI / UX i Stabilności Głównego Widoku (App.jsx)**
    * Wdrożono natywną obsługę Modala "Nowy Projekt" bezpośrednio w komponencie głównym `App.jsx`, mapując hook `isNewProjectModalOpen` oraz payload formularza do centralnego API (`/api/projects`).
    * Zlikwidowano tzw. "Ghost Button" w module `ProjectsView.jsx`, łącząc logikę wywołującą modal z przepływem widoku nadrzędnego. Wprowadzono pełen cykl odświeżania (`fetchData()`) po udanej insercji do bazy.

---

15. **Moduł MDM (Oczyszczanie Długu Technologicznego)**
    * Wyczyszczono archiwalne adnotacje dotyczące mechanizmu oceniania "Trust Score" dla faktur z wyłączonego systemu IDP (Intelligent Document Processing). Infrastruktura została w pełni odciążona z przestarzałych kontrolerów faktur.

---

16. **Awaryjne odblokowywanie logowania i czyszczenie portów środowiskowych**
    * Usunięto problem zawieszania się serwera podczas uruchamiania (błąd `EADDRINUSE` dla `npm run dev`) poprzez wymuszoną terminację procesów zombie: node na porcie 3001 i waitress na porcie 5000 z poziomu terminala, co chroni aplikację przed problemami z bindowaniem przy twardych restartach środowiska (kill portów).
    * Zdiagnozowano powód błędu "401 Unauthorized" zgłaszanego przez moduł autoryzacji axios dla frontendu. Wywołany był on trwałą desynchronizacją danych bazy Prisma (możliwe historyczne działanie niechcianych skryptów, takich jak `reset-admin.js`, ustawiających hasło "admin123"). Wykonano chirurgiczny zrzut poprawnego hasha, odzwierciedlającego zmienną `.env` dla konta Głównego Administratora, co przywróciło pełen dostęp i kod HTTP 200 przy logowaniu do UI Nexusa.

---

17. **Ochrona Limitów API i Optymalizacja Zero-Bleed Hub (Fix 429)**
    * Skorygowano mechanikę `express-rate-limit` w `server.js` dodając dyrektywę `app.set('trust proxy', 1);`. Zapobiega to współdzieleniu limitów IP przez środowiska Proxy (Nginx) oraz zablokowaniu całej instancji dla pojedynczego pulsu (błąd 429 Too Many Requests). Ochrona limitu podstawowego wzrosła z 1000 do 5000, absorbując zapytania stanu z Dashboardu.
    * Odciążono Event Loop w module `ZeroBleedHubView.jsx`. Naprawiono nieskończoną pętlę pollingu interwału (wcześniej odpytywała sztywno co 3 sekundy endpoint stanu RMA, drenując limit zapytań). Obecnie mechanizm `useEffect` uwarunkowano na sztywno zmienną `syncState.isRunning`, co oznacza, że ping do serwera odbywa się wyłącznie "na życzenie", gdy zainicjowano wymuszony audyt. Standardowy cykl Crona 2x na dzień działa bez obciążania i blokowania stacji roboczej klienta.
