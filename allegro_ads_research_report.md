Oto kompleksowy raport analityczno-techniczny, przygotowany z perspektywy eksperta Masterclass ds. E-commerce i systemów ERP. Dokument ten stanowi fundament pod architekturę w pełni autonomicznego modułu **Nexus Allegro Ads AI Masterclass**, uwzględniając najnowsze zmiany w ekosystemie Allegro na lata 2024–2026.

---

# RAPORT ARCHITEKTONICZNY: Nexus Allegro Ads AI Masterclass (2024-2026)

## 1. Analiza Form Promocji na Allegro (Stan na 2024-2026)

Ekosystem reklamowy Allegro przeszedł w latach 2024-2025 drastyczne zmiany, które wymuszają przejście z zarządzania manualnego na zautomatyzowane systemy algorytmiczne. Od 18 lutego 2025 r. Allegro Ads jest dostępne **wyłącznie dla kont firmowych**.

### 1.1. Ekosystem Allegro Ads
*   **Oferty Sponsorowane (Sponsored Offers):**
    *   **Model rozliczeń:** CPC (Cost Per Click). Działa w modelu aukcyjnym (płacisz stawkę wystarczającą do przebicia konkurenta).
    *   **Nowości (od X 2024):** Znacząco podniesiono minimalne stawki CPC. Przykładowo: Elektronika (0,55 zł), Dom i Ogród (0,60 zł), Moda (0,50 zł).
    *   **Mechanika:** Możliwość ustawienia *Max CPC* (sztywny limit) lub *Dynamic CPC* (algorytm Allegro sam podnosi stawkę do 2x, jeśli oceni wysokie prawdopodobieństwo zakupu).
*   **Reklama Graficzna (Display Ads):**
    *   **Model rozliczeń:** CPM (Cost Per Mille – koszt za 1000 wyświetleń).
    *   **Nowości (od X 2024):** Wzrost stawek minimalnych. Strona główna to minimum 16 zł CPM, a góra/dół wyników wyszukiwania to 12 zł CPM. Służy głównie do budowania świadomości marki (branding) i remarketingu.
*   **Ads Express:**
    *   Uproszczona forma dla początkujących. System sam dobiera stawki CPC i miejsca emisji. **Dla Agenta AI w Nexus ERP ten moduł należy całkowicie zignorować** na rzecz pełnej kontroli przez API.
*   **Sieć Zewnętrzna (Google Ads / Meta via Allegro):**
    *   **Model rozliczeń:** CPC. Pozwala na retargeting ofert Allegro w wyszukiwarce Google i Google Shopping.

### 1.2. Narzędzia Wsparcia Sprzedaży (Promocje organiczne i hybrydowe)
*   **Smart! Monety (dawniej Monety Allegro):**
    *   **Nowości (od 29 stycznia 2025):** Program dostępny tylko dla użytkowników Allegro Smart!. Zniesiono limit wymiany – teraz kupujący może wymienić nawet 1 monetę na 1 zł zniżki (wcześniej min. 5 monet).
    *   **Koszt dla sprzedawcy:** 1,23 zł brutto za każdą wydaną monetę (pobierane dopiero po sfinalizowaniu transakcji). Doskonałe narzędzie do podbijania konwersji (CR) na start dla nowych ofert.
*   **Kupony Rabatowe:** Zniżki kwotowe lub procentowe finansowane przez sprzedawcę. Zwiększają średnią wartość koszyka (AOV), jeśli są ustawione z progiem wejścia (np. "20 zł zniżki przy zakupach za 200 zł").
*   **Strefa Okazji i Oznaczenia ("Hit", "Nowość"):**
    *   Wymagają uiszczania opłaty codziennej (tzw. opłata za oznaczenie) oraz **dodatkowej prowizji od sprzedaży** w Strefie Okazji. Generują potężny ruch, ale drastycznie tną marżę.

### 1.3. Algorytmy Przydzielania Widoczności (Trafność)
Pozycja reklamy (Ad Rank) nie zależy tylko od stawki CPC. Od 2025 roku algorytm "Trafności" Allegro kładzie jeszcze większy nacisk na:
1.  **Jakość oferty:** CTR (klikalność), CR (konwersja), historia sprzedaży.
2.  **Koszty dostawy:** Od lutego 2025 r. koszt dostawy jest kluczowym czynnikiem przyznawania statusu "Top Oferty".
3.  **Zgodność z regulaminem:** Za sprzedaż produktów zakazanych Allegro nakłada 30-dniowe blokady na kampanie Ads.

---

## 2. Architektura Danych (Wejścia dla AI)

Aby moduł AI w Nexus ERP mógł działać autonomicznie, musi agregować dane z kilku endpointów Allegro REST API (Ads API, Offers API, Billing API).

**Kluczowe metryki do pobierania w czasie rzeczywistym (lub w interwałach godzinowych):**
*   **Metryki Zasięgowe i Kosztowe:**
    *   `Odsłony (Impressions)` i `Kliknięcia (Clicks)`
    *   `CTR (Click-Through Rate)` – wskaźnik dopasowania miniatury/tytułu do zapytania.
    *   `Średnie CPC / CPM` oraz `Całkowity Koszt (Spend)`.
*   **Metryki Sprzedażowe:**
    *   `CR (Conversion Rate)` – odsetek kliknięć zakończonych zakupem.
    *   `ROAS (Return on Ad Spend)` – przychód z reklam / koszt reklam.
*   **Metryki Konkurencji i Rynku (wymaga scrapingu lub Allegro Analytics):**
    *   `Share of Voice (Udział w wyświetleniach)` – czy tracimy ruch przez zbyt niski budżet dzienny?
    *   `Cenowa elastyczność popytu` – ceny konkurencji dla produktów z tym samym numerem EAN.
*   **Metryki Operacyjne:**
    *   Stan magazynowy (Stock level).
    *   Koszty logistyczne i status Smart!.

---

## 3. Logika i Strategie AI (Masterclass Level)

Agent AI w Nexus ERP powinien opierać się na architekturze hybrydowej, łączącej **Machine Learning (Predykcja)** oraz **Reinforcement Learning (Optymalizacja stawek)**.

### 3.0. Bramka Bezpieczeństwa: Pre-Flight Audit & Compliance (Audyt przed startem)
*   **Opis:** Zasada nr 1: "Nie pompujemy budżetu w dziurawe wiadro". Zanim Agent AI podejmie jakąkolwiek decyzję o włączeniu reklam lub wydaniu Monet, system wykonuje rygorystyczny audyt oferty przez API (Allegro, BaseLinker, wewnętrzny PIM) weryfikując zgodność z plikiem `Regulamin Allegro.pdf`.
*   **Dlaczego to "Game Changer":** Całkowicie eliminuje ryzyko przepalania pieniędzy na oferty o niskiej jakości lub takie, które ze względu na brak pełnych danych finansowych mogłyby wygenerować sztuczny zysk (podczas gdy w rzeczywistości przynoszą stratę). Zapobiega też blokadom konta za łamanie regulaminu Allegro.
*   **Co podlega kontroli (Czerwone Flagi):**
    1.  **Dane Finansowe (Unit Economics):** Jeśli w Nexus PIM dla danego produktu brakuje choćby jednego kosztu (np. kosztu zakupu COGS, kosztu logistyki lub opakowania), wyliczenie True Cost (TC) i ROI jest niemożliwe. Promocja jest **zablokowana**.
    2.  **Zgodność z Regulaminem Allegro:** Skrypt AI analizuje tytuły, treść ofert i zdjęcia pod kątem zakazanych praktyk (np. umieszczanie w tytule słów typu "wyprzedaż", "hit", nieautoryzowane oświadczenia medyczne, braki w obligatoryjnych parametrach środowiskowych).
    3.  **Kondycja Konta i Oferty (Health Check):** Spadek "Jakości Sprzedaży" poniżej progu Super Sprzedawcy, czas wysyłki powyżej 48h, czy brak białego tła miniatury (zgodnie z restrykcyjnymi standardami Allegro).
*   **Mechanizm Hard Block:** Pojawienie się czerwonej flagi działa jak twarda blokada (Hard Block) na uruchomienie Adsów dla tego EAN-u. System nie tylko blokuje wydatki, ale od razu generuje zadanie w kanale `UniversalChat` dla działu e-commerce z dokładną listą błędów do naprawy.

### 3.1. Algorytmy Decyzyjne
*   **Reinforcement Learning (RL) do Bidowania:** Agent traktuje środowisko Allegro jako grę. Nagrodą (Reward) jest maksymalizacja ROI (nie ROAS!). Algorytm (np. *Deep Q-Network*) w czasie rzeczywistym dostosowuje stawki Max CPC w zależności od pory dnia, dnia tygodnia i zachowania konkurencji.
*   **XGBoost / LightGBM do Predykcji Popytu:** Analiza szeregów czasowych w celu przewidywania pików sprzedażowych (np. wypłaty 10. dnia miesiąca, sezonowość, pogoda). AI z wyprzedzeniem alokuje większy budżet na kampanie, które wkrótce zyskają na popularności.

### 3.2. Strategie "Co i Jak promować" (Macierz Decyzyjna AI)
Agent kategoryzuje asortyment (np. algorytmem k-means) na 4 grupy i przypisuje im strategie:
1.  **Dojne Krowy (Wysoka Marża, Wysokie CR):**
    *   *Akcja:* Agresywne kampanie CPC (Oferty Sponsorowane). Cel: Dominacja w TOP 3 wynikach wyszukiwania. Budżet nielimitowany, dopóki ROI > założony próg.
2.  **Nowości (Brak historii sprzedaży, Niska widoczność):**
    *   *Akcja:* Kampanie CPM (Reklama Graficzna) dla budowy zasięgu + dodanie 3-5 Smart! Monet do oferty, aby sztucznie podbić CR i "nauczyć" algorytm organiczny Allegro, że produkt się sprzedaje.
3.  **Śpiochy (Wysoki Stock, Niskie CR, Niska widoczność):**
    *   *Akcja:* Zgłoszenie do Strefy Okazji + Kupony rabatowe. Kampanie CPC z bardzo niską stawką (tzw. łapanie taniego ruchu z długiego ogona - *long-tail*).
4.  **Krwawiące Oferty (Wysoki koszt CPC, Brak sprzedaży):**
    *   *Akcja:* AI natychmiast pauzuje kampanię (tzw. *Kill Switch*). Wysyła alert do działu handlowego o konieczności poprawy miniatury, ceny lub opisu.

### 3.3. Zarządzanie Budżetem w Czasie Rzeczywistym
*   **Dayparting:** AI analizuje, w jakich godzinach CR jest najwyższe (np. 18:00-22:00) i automatycznie zwiększa budżety dzienne oraz stawki CPC tuż przed tym oknem czasowym, obniżając je w nocy.
*   **Dynamiczne wyłączanie (Out-of-Stock Protection):** Jeśli stan magazynowy spada poniżej 5 sztuk, AI obniża CPC, aby nie przepalać budżetu na produkt, który zaraz zniknie z oferty (co zresetuje jego pozycję organiczną).

---

## 4. Monitoring i Rozliczanie (Prawdziwa Rentowność)

Największym błędem standardowych systemów jest optymalizacja pod ROAS. ROAS uwzględnia **tylko** koszt kliknięć. Agent Nexus ERP musi optymalizować kampanie pod **Rzeczywiste ROI (True Profitability)**.

### 4.1. Architektura Obliczania Rentowności (Unit Economics)
Dla każdej transakcji AI musi w ułamku sekundy obliczyć:

`Zysk Netto = Przychód ze sprzedaży - (Koszty Bezpośrednie + Koszty Ukryte)`

**Gdzie Koszty Ukryte na Allegro to:**
1.  **Prowizja podstawowa Allegro** (zależna od kategorii, np. 8-12%).
2.  **Prowizja od kosztów wysyłki** (Allegro pobiera prowizję również od kwoty, którą klient płaci za kuriera).
3.  **Koszty programu Smart!** (dopłaty sprzedawcy do paczek Smart!, zależne od wartości zamówienia).
4.  **Koszt Smart! Monet** (Liczba wydanych monet × 1,23 zł).
5.  **Koszty Strefy Okazji** (opłata codzienna + dodatkowa prowizja rzędu kilku procent).
6.  **Koszt Allegro Ads (CPA)** – ile kosztowało pozyskanie tej konkretnej transakcji.
7.  **Koszt wytworzenia/zakupu produktu (COGS).**

### 4.2. Logika Rozliczeniowa dla Agenta AI
*   **Target Margin Bidding:** Użytkownik w Nexus ERP definiuje: *"Chcę zarabiać minimum 15% netto na każdym produkcie"*.
*   AI na bieżąco oblicza maksymalne dopuszczalne CPA (Cost Per Action) dla każdego EAN-u.
*   Jeśli `Aktualne CPA > Maksymalne dopuszczalne CPA`, algorytm obniża stawkę CPC lub wyłącza reklamę, ponieważ każda kolejna sprzedaż generuje stratę netto dla firmy, mimo że w panelu Allegro Ads ROAS może wynosić np. 500% (co wydaje się dobrym wynikiem, ale przy niskiej marży oznacza stratę).

### 4.3. Moduł Autoadaptacji i Ciągłego Nasłuchu (Continuous Market Adaptation)
*   **Opis:** Ekosystem Allegro jest wysoce zmienny (częste aktualizacje cenników, zmiany w programie Smart!, nowe formaty reklam). Agent AI w Nexus ERP zostaje wyposażony w "skaner otoczenia", który w tle (CRON) nieustannie monitoruje strony ze zmianami regulaminów Allegro, kanały RSS dla sprzedawców oraz analizuje komunikaty z API.
*   **Dlaczego to "Game Changer":** System staje się w pełni "odporny na przyszłość" (future-proof). Konkurencja traci dziesiątki tysięcy złotych, zanim zorientuje się, że Allegro np. podniosło prowizję w danej kategorii. Nasz Agent wie o tym natychmiast i chroni budżet.
*   **Jak to działa w praktyce:**
    *   **Alertowanie i Wymuszanie Reakcji:** Jeśli AI wykryje zmianę w cenniku (np. wzrost opłaty za Smart!), natychmiast podnosi alarm w `UniversalChat` (oznaczając zarząd/kierownika), wymuszając zatwierdzenie nowych progów rentowności.
    *   **Autoadaptacja Parametrów:** Jeśli zmiana dotyczy mechaniki (np. Allegro wprowadza nowy rodzaj kampanii lub zmienia wagę kosztów dostawy w algorytmie Trafności), Agent samodzielnie dokonuje korekty w swojej "Macierzy Decyzyjnej", rezygnując ze strategii, które przestały być optymalne, jeszcze zanim zmiana wejdzie na dobre w życie.


## Podsumowanie dla zespołu deweloperskiego Nexus ERP
Budowa modułu **Nexus Allegro Ads AI Masterclass** wymaga integracji z API Allegro na poziomie nie tylko reklamowym, ale i bilingowym. Kluczem do stworzenia systemu przewyższającego rynkowe standardy jest zaimplementowanie algorytmów Reinforcement Learning, które zignorują powierzchowny wskaźnik ROAS na rzecz twardego wyliczania ROI w czasie rzeczywistym, uwzględniając drastyczne podwyżki stawek CPC/CPM z końca 2024 roku oraz nowe zasady widoczności ofert z 2025 roku.

---
*Raport wygenerowany przy wsparciu Google Search Grounding.*